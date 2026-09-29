const { getPremiumConfig, setPremiumConfig } = require('../database/premiumStore');
const { getUserPremiumEntitlementState } = require('./premiumEntitlements');
const { getFounderProgramState } = require('./premiumFounderAccess');
const { getManualPremiumState } = require('./premiumManualAccess');
const { assignableRoleIssue, assignableRoleMessage } = require('./safeAssignableRoles');
const logger = require('./logger').logger.child({ component: 'premium-roles' });

const PREMIUM_ROLE_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const activeSchedulers = new WeakMap();

class PremiumRoleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PremiumRoleError';
    this.code = code;
    this.userMessage = message;
  }
}

function snowflake(value) {
  const normalized = String(value || '').trim();
  return /^\d{17,20}$/.test(normalized) ? normalized : null;
}

function normalizedPremiumRoleConfig(config) {
  return {
    paidRoleId: snowflake(config?.paidRoleId),
    complimentaryRoleId: snowflake(config?.complimentaryRoleId),
  };
}

function premiumRolesConfigured(config) {
  const normalized = normalizedPremiumRoleConfig(config);
  return Boolean(normalized.paidRoleId || normalized.complimentaryRoleId);
}

async function premiumAccessForUser(userId, {
  entitlementOptions,
  founderOptions,
  manualOptions,
  now = new Date(),
} = {}) {
  const normalizedUserId = snowflake(userId);
  if (!normalizedUserId) throw new PremiumRoleError('INVALID_USER', 'Compte Discord Premium invalide.');
  const [entitlement, founder, manual] = await Promise.all([
    getUserPremiumEntitlementState(normalizedUserId, { now, ...entitlementOptions }),
    getFounderProgramState(normalizedUserId, null, { now, ...founderOptions }),
    getManualPremiumState(normalizedUserId, null, { now, ...manualOptions }),
  ]);
  const paid = Boolean(entitlement.active);
  const complimentary = !paid && Boolean(founder.userActive || manual.userActive);
  return {
    paid,
    complimentary,
    source: paid
      ? 'discord-entitlement'
      : manual.userActive
        ? 'manual-access'
        : founder.userActive
          ? 'founder-access'
          : 'free',
  };
}

function roleOrError(guild, roleId, label, { actorMember = null, actorIsOwner = true } = {}) {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  const issue = assignableRoleIssue(guild, role, { actorMember, actorIsOwner });
  if (issue) {
    throw new PremiumRoleError('INVALID_ROLE', `${label} : ${assignableRoleMessage(issue, role)}`);
  }
  return role;
}

async function getPremiumRoleConfiguration(guildId, { configurationStorage } = {}) {
  return normalizedPremiumRoleConfig(await getPremiumConfig(guildId, configurationStorage));
}

async function configurePremiumRoles(guild, {
  paidRole,
  complimentaryRole,
  actorMember = null,
  actorIsOwner = false,
  configurationStorage,
} = {}) {
  if (!paidRole || !complimentaryRole) {
    throw new PremiumRoleError('MISSING_ROLE', 'Les deux rôles Premium sont obligatoires.');
  }
  if (paidRole.id === complimentaryRole.id) {
    throw new PremiumRoleError('DUPLICATE_ROLE', 'Choisissez deux rôles différents pour les accès payants et offerts.');
  }
  roleOrError(guild, paidRole.id, 'Rôle Client Premium', { actorMember, actorIsOwner });
  roleOrError(guild, complimentaryRole.id, 'Rôle Premium offert', { actorMember, actorIsOwner });
  const current = await getPremiumConfig(guild.id, configurationStorage) || {};
  const config = {
    ...current,
    paidRoleId: paidRole.id,
    complimentaryRoleId: complimentaryRole.id,
    updatedAt: new Date().toISOString(),
  };
  await setPremiumConfig(guild.id, config, configurationStorage);
  return config;
}

async function syncPremiumRolesForMember(member, {
  access,
  config,
  configurationStorage,
  entitlementOptions,
  founderOptions,
  manualOptions,
  now = new Date(),
} = {}) {
  if (!member || member.user?.bot) return { configured: false, skipped: true, added: [], removed: [] };
  const roleConfig = normalizedPremiumRoleConfig(config || await getPremiumConfig(member.guild.id, configurationStorage));
  if (!premiumRolesConfigured(roleConfig)) return { configured: false, skipped: false, added: [], removed: [] };
  if (roleConfig.paidRoleId && roleConfig.paidRoleId === roleConfig.complimentaryRoleId) {
    throw new PremiumRoleError('DUPLICATE_ROLE', 'La configuration Premium utilise deux fois le même rôle.');
  }
  const paidRole = roleOrError(member.guild, roleConfig.paidRoleId, 'Rôle Client Premium');
  const complimentaryRole = roleOrError(member.guild, roleConfig.complimentaryRoleId, 'Rôle Premium offert');
  const premiumAccess = access || await premiumAccessForUser(member.id, {
    entitlementOptions, founderOptions, manualOptions, now,
  });
  const desired = new Map([
    [paidRole?.id, Boolean(paidRole && premiumAccess.paid)],
    [complimentaryRole?.id, Boolean(complimentaryRole && premiumAccess.complimentary)],
  ]);
  desired.delete(undefined);
  desired.delete(null);
  const added = [];
  const removed = [];
  for (const [roleId, shouldHaveRole] of desired) {
    const role = member.guild.roles.cache.get(roleId);
    const hasRole = member.roles.cache.has(roleId);
    if (shouldHaveRole && !hasRole) {
      await member.roles.add(role, `Synchronisation Premium FyxBot : ${premiumAccess.source}`);
      added.push(roleId);
    } else if (!shouldHaveRole && hasRole) {
      await member.roles.remove(role, 'Synchronisation Premium FyxBot : accès inactif ou remplacé');
      removed.push(roleId);
    }
  }
  return { configured: true, skipped: false, access: premiumAccess, added, removed };
}

async function syncPremiumRolesForUser(client, userId, options = {}) {
  const normalizedUserId = snowflake(userId);
  if (!normalizedUserId) return { configuredGuilds: 0, updatedGuilds: 0, results: [] };
  const access = options.access || await premiumAccessForUser(normalizedUserId, options);
  const guildFilter = options.guildIds ? new Set(options.guildIds.map(String)) : null;
  const results = [];
  let configuredGuilds = 0;
  for (const guild of client.guilds.cache.values()) {
    if (guildFilter && !guildFilter.has(guild.id)) continue;
    const config = await getPremiumConfig(guild.id, options.configurationStorage);
    if (!premiumRolesConfigured(config)) continue;
    configuredGuilds += 1;
    const member = await guild.members.fetch(normalizedUserId).catch(() => null);
    if (!member || member.user?.bot) continue;
    results.push({ guildId: guild.id, ...await syncPremiumRolesForMember(member, { ...options, config, access }) });
  }
  return {
    configuredGuilds,
    updatedGuilds: results.filter((result) => result.added.length || result.removed.length).length,
    results,
  };
}

async function syncPremiumRolesInGuild(guild, options = {}) {
  const config = options.config || await getPremiumConfig(guild.id, options.configurationStorage);
  if (!premiumRolesConfigured(config)) return { configured: false, checked: 0, added: 0, removed: 0, failed: 0 };
  const members = await guild.members.fetch();
  const candidates = [...members.values()].filter((member) => !member.user.bot);
  const summary = { configured: true, checked: 0, added: 0, removed: 0, failed: 0 };
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const batch = await Promise.allSettled(candidates.slice(offset, offset + 10)
      .map((member) => syncPremiumRolesForMember(member, { ...options, config })));
    for (const result of batch) {
      summary.checked += 1;
      if (result.status === 'fulfilled') {
        summary.added += result.value.added.length;
        summary.removed += result.value.removed.length;
      } else {
        summary.failed += 1;
        logger.warn({ err: result.reason, guildId: guild.id }, '[FyxBot] Synchronisation d’un rôle Premium impossible.');
      }
    }
  }
  return summary;
}

async function syncAllConfiguredPremiumRoles(client, options = {}) {
  const summaries = [];
  for (const guild of client.guilds.cache.values()) {
    const config = await getPremiumConfig(guild.id, options.configurationStorage);
    if (!premiumRolesConfigured(config)) continue;
    try {
      summaries.push({ guildId: guild.id, ...await syncPremiumRolesInGuild(guild, { ...options, config }) });
    } catch (error) {
      summaries.push({ guildId: guild.id, configured: true, checked: 0, added: 0, removed: 0, failed: 1 });
      logger.error({ err: error, guildId: guild.id }, '[FyxBot] Synchronisation globale des rôles Premium impossible.');
    }
  }
  return summaries;
}

async function disablePremiumRoles(guild, { configurationStorage } = {}) {
  const current = await getPremiumConfig(guild.id, configurationStorage) || {};
  const previous = normalizedPremiumRoleConfig(current);
  const members = await guild.members.fetch();
  let removed = 0;
  let failed = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    for (const roleId of [previous.paidRoleId, previous.complimentaryRoleId].filter(Boolean)) {
      if (!member.roles.cache.has(roleId)) continue;
      const role = guild.roles.cache.get(roleId);
      if (!role || assignableRoleIssue(guild, role, { actorIsOwner: true })) continue;
      try {
        await member.roles.remove(role, 'Synchronisation automatique Premium désactivée');
        removed += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ err: error, guildId: guild.id, userId: member.id, roleId }, '[FyxBot] Retrait d’un rôle Premium impossible pendant la désactivation.');
      }
    }
  }
  await setPremiumConfig(guild.id, {
    ...current,
    paidRoleId: null,
    complimentaryRoleId: null,
    updatedAt: new Date().toISOString(),
  }, configurationStorage);
  return { previous, removed, failed };
}

function entitlementUserId(entitlement) {
  return snowflake(entitlement?.userId || entitlement?.user_id);
}

function startPremiumRoleScheduler(client, { intervalMs = PREMIUM_ROLE_SYNC_INTERVAL_MS, ...options } = {}) {
  if (activeSchedulers.has(client)) return activeSchedulers.get(client);
  const safeInterval = Math.max(Number(intervalMs) || PREMIUM_ROLE_SYNC_INTERVAL_MS, 5 * 60 * 1000);
  const timer = setInterval(() => {
    syncAllConfiguredPremiumRoles(client, options).catch((error) => {
      logger.error({ err: error }, '[FyxBot] Contrôle périodique des rôles Premium impossible.');
    });
  }, safeInterval);
  timer.unref?.();
  const scheduler = { stop: () => clearInterval(timer) };
  activeSchedulers.set(client, scheduler);
  return scheduler;
}

module.exports = {
  PREMIUM_ROLE_SYNC_INTERVAL_MS,
  PremiumRoleError,
  configurePremiumRoles,
  disablePremiumRoles,
  entitlementUserId,
  getPremiumRoleConfiguration,
  normalizedPremiumRoleConfig,
  premiumAccessForUser,
  premiumRolesConfigured,
  startPremiumRoleScheduler,
  syncAllConfiguredPremiumRoles,
  syncPremiumRolesForMember,
  syncPremiumRolesForUser,
  syncPremiumRolesInGuild,
};
