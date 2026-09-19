const {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require('discord.js');
const { setLogConfig } = require('../database/logStore');
const { getRulesConfig } = require('../database/rulesStore');
const { setSuggestionConfig } = require('../database/suggestionStore');
const { setTicketConfig } = require('../database/ticketStore');
const {
  activateServerSetupBlueprint,
  getServerSetupBlueprint,
} = require('../database/serverSetupStore');
const { setWelcomeConfig } = require('../database/welcomeStore');
const { buildAdaptiveBlueprint } = require('./adaptiveServerBlueprint');
const {
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
} = require('./defaultMessages');
const { backupServer } = require('./serverBackup');
const { initializeChangelogChannel } = require('./changelogNotifications');
const {
  publishRules,
  RULE_TEMPLATES,
  updateRulesMessage,
} = require('./rules');

const MANAGEMENT_PERMISSIONS = Object.freeze([
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
]);
const ALL_PERMISSION_FLAGS = Object.freeze([...new Set(Object.values(PermissionFlagsBits))]);
const DEFAULT_BLUEPRINT = buildAdaptiveBlueprint(
  'Un serveur communautaire général pour accueillir des membres, publier des annonces et discuter.',
);

function permissionFlag(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && PermissionFlagsBits[value] !== undefined) return PermissionFlagsBits[value];
  return null;
}

function runtimeRoleDefinition(definition) {
  const permissions = (definition.permissions || []).map(permissionFlag).filter((value) => value !== null);
  const fallback = (definition.fallback || definition.permissions || []).map(permissionFlag).filter((value) => value !== null);
  return { ...definition, permissions, fallback };
}

function runtimeCategoryProfile(definition) {
  const profile = definition.permissionProfile || definition.profile || 'memberCommunity';
  if (definition.key === 'welcome') return 'publicReadOnly';
  if (definition.key === 'staff') return 'staffOnly';
  if (profile === 'publicReadOnly') return 'memberReadOnly';
  if (profile === 'publicCommunity') return 'memberCommunity';
  return profile;
}

function runtimeChannelProfile(definition) {
  const profile = definition.permissionProfile || definition.profile || 'inherit';
  if (definition.category !== 'welcome' && profile === 'publicReadOnly') return 'memberReadOnly';
  if (definition.category !== 'welcome' && profile === 'publicCommunity') return 'memberCommunity';
  return profile;
}

function runtimeBlueprint(blueprint) {
  const selected = blueprint || DEFAULT_BLUEPRINT;
  const roles = (selected.roles || []).map(runtimeRoleDefinition);
  const categories = (selected.categories || []).map((definition) => ({
    ...definition,
    profile: runtimeCategoryProfile(definition),
  }));
  const categoryKeys = new Set(categories.map((definition) => definition.key));
  const channels = (selected.channels || [])
    .filter((definition) => categoryKeys.has(definition.category))
    .map((definition) => ({
      ...definition,
      profile: runtimeChannelProfile(definition),
      type: definition.type || 'text',
    }));
  if (roles.length === 0 || categories.length === 0) {
    throw new Error('La proposition de structure est incomplète. Relancez /setup concevoir.');
  }
  return { source: selected, roles, categories, channels };
}

async function resolveBlueprint(guildId, blueprint) {
  return blueprint || await getServerSetupBlueprint(guildId) || DEFAULT_BLUEPRINT;
}

const ROLE_DEFINITIONS = Object.freeze(runtimeBlueprint(DEFAULT_BLUEPRINT).roles);
const CATEGORY_DEFINITIONS = Object.freeze(runtimeBlueprint(DEFAULT_BLUEPRINT).categories);
const CHANNEL_DEFINITIONS = Object.freeze(runtimeBlueprint(DEFAULT_BLUEPRINT).channels);

function normalizedBlueprintName(name) {
  return String(name || '')
    .trim()
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '')
    .replace(/^[・┃│｜|•·\-\s]+/u, '')
    .trim()
    .toLocaleLowerCase('fr');
}

function grantableRolePermissions(guild, requested, fallback = requested) {
  const botPermissions = guild.members.me.permissions;
  const desired = requested.includes(PermissionFlagsBits.Administrator)
    && !botPermissions.has(PermissionFlagsBits.Administrator) ? fallback : requested;
  return [...new Set(desired)].filter((permission) => botPermissions.has(permission));
}

function roleOptions(guild, definition) {
  return {
    colors: { primaryColor: definition.color },
    permissions: grantableRolePermissions(guild, definition.permissions, definition.fallback),
  };
}

function synchronizedRolePermissionBits(guild, definition, role) {
  const botPermissions = guild.members.me.permissions;
  const current = role.permissions.bitfield;
  const roleHasProtectedAdministrator = definition.permissions.includes(PermissionFlagsBits.Administrator)
    && (current & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator
    && !botPermissions.has(PermissionFlagsBits.Administrator);
  if (roleHasProtectedAdministrator) return current;

  const target = permissionBits(roleOptions(guild, definition).permissions);
  let desired = current;
  for (const permission of ALL_PERMISSION_FLAGS) {
    if (!botPermissions.has(permission)) continue;
    if ((target & permission) === permission) desired |= permission;
    else desired &= ~permission;
  }
  return desired;
}

function missingSetupPermissions(guild) {
  const required = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels];
  return required.filter((permission) => !guild.members.me.permissions.has(permission));
}

function permissionProfiles(guild, roles, roleDefinitions = ROLE_DEFINITIONS, memberAccessRole = roles.member) {
  const everyone = guild.roles.everyone.id;
  const botId = guild.members.me.id;
  const staffRoles = roleDefinitions
    .filter((definition) => definition.staff === true || ['founder', 'administrator', 'moderator', 'support'].includes(definition.key))
    .map((definition) => roles[definition.key])
    .filter((role) => role && role.id !== memberAccessRole?.id);
  const staffAllows = staffRoles.map((role) => ({
    id: role.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
  }));
  const memberReadOnly = memberAccessRole ? [{
    id: memberAccessRole.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
    deny: [PermissionFlagsBits.SendMessages],
  }] : [];
  const memberCommunity = memberAccessRole ? [{
    id: memberAccessRole.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
  }] : [];
  const botAccess = {
    id: botId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.SendPolls,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageChannels,
    ],
  };
  return {
    publicReadOnly: [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      ...staffAllows,
      botAccess,
    ],
    publicCommunity: [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions] },
      ...staffAllows,
      botAccess,
    ],
    memberReadOnly: [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ...memberReadOnly,
      ...staffAllows,
      botAccess,
    ],
    memberCommunity: [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ...memberCommunity,
      ...staffAllows,
      botAccess,
    ],
    staffOnly: [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ...staffAllows,
      botAccess,
    ],
  };
}

function resolveMemberAccessRole(guild, roles, rulesConfig = null) {
  const configuredRole = rulesConfig?.verifiedRoleId
    ? guild.roles.cache.get(rulesConfig.verifiedRoleId)
    : null;
  if (configuredRole && !configuredRole.managed && configuredRole.id !== guild.id) return configuredRole;
  return roles.member || null;
}

function rulesTemplateForBlueprint(blueprint) {
  const description = String(blueprint?.description || '').toLocaleLowerCase('fr');
  if (description.includes('minecraft')) return RULE_TEMPLATES.minecraft;
  if (description.includes('créateur') || description.includes('createur') || description.includes('youtube') || description.includes('twitch')) {
    return RULE_TEMPLATES.createur;
  }
  if (description.includes('gaming') || description.includes('jeu') || description.includes('esport')) return RULE_TEMPLATES.gaming;
  return RULE_TEMPLATES.communautaire;
}

async function ensureSetupRules(guild, channel, verifiedRole, blueprint) {
  if (!channel?.isTextBased?.() || !verifiedRole) return null;
  const current = await getRulesConfig(guild.id);
  const config = {
    title: current?.title || `Règlement ${guild.name}`,
    content: current?.content || rulesTemplateForBlueprint(blueprint),
    verifiedRoleId: verifiedRole.id,
  };
  if (current?.channelId && current?.messageId) {
    const currentChannel = await guild.channels.fetch(current.channelId).catch(() => null);
    const currentMessage = currentChannel?.isTextBased?.()
      ? await currentChannel.messages.fetch(current.messageId).catch(() => null)
      : null;
    if (currentMessage) return updateRulesMessage(guild, { ...current, ...config });
  }
  return publishRules(guild, channel, config);
}

function permissionBits(values = []) {
  return new PermissionsBitField(values).bitfield;
}

function overwriteSignature(overwrite) {
  return `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`;
}

function desiredOverwriteSignature(overwrite) {
  return `${overwrite.id}:${permissionBits(overwrite.allow)}:${permissionBits(overwrite.deny)}`;
}

function permissionOverwritesMatch(channel, desired = []) {
  const current = [...channel.permissionOverwrites.cache.values()].map(overwriteSignature).sort();
  const expected = desired.map(desiredOverwriteSignature).sort();
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

function findBlueprintItem(collection, name, predicate = () => true) {
  const normalized = normalizedBlueprintName(name);
  return collection.find((item) => predicate(item) && normalizedBlueprintName(item.name) === normalized) || null;
}

async function findOrCreateRole(guild, definition, synchronizePermissions) {
  const existing = findBlueprintItem(guild.roles.cache, definition.name, (role) => !role.managed && role.id !== guild.id);
  const options = roleOptions(guild, definition);
  if (!existing) {
    const createdRole = await guild.roles.create({ name: definition.name, ...options, reason: 'Configuration adaptative FyxBot' });
    return { value: createdRole, created: true, updated: false };
  }
  let updated = false;
  if (synchronizePermissions && existing.editable) {
    const desiredPermissions = synchronizedRolePermissionBits(guild, definition, existing);
    const changes = {};
    if (existing.name !== definition.name) changes.name = definition.name;
    if (existing.color !== definition.color) changes.colors = options.colors;
    if (existing.permissions.bitfield !== desiredPermissions) changes.permissions = desiredPermissions;
    if (Object.keys(changes).length > 0) {
      try {
        await existing.edit(changes, 'Permissions et identité FyxBot synchronisées');
      } catch (error) {
        const wrapped = new Error(`Impossible de synchroniser le rôle ${definition.name} : ${error.message || 'permission refusée par Discord'}`);
        wrapped.code = error.code;
        wrapped.cause = error;
        throw wrapped;
      }
      updated = true;
    }
  }
  return { value: existing, created: false, updated };
}

async function findOrCreateCategory(guild, definition, overwrites, synchronizePermissions) {
  const existing = findBlueprintItem(guild.channels.cache, definition.name, (channel) => channel.type === ChannelType.GuildCategory);
  if (!existing) {
    const createdCategory = await guild.channels.create({
      name: definition.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites,
      reason: 'Configuration adaptative FyxBot',
    });
    return { value: createdCategory, created: true, updated: false };
  }
  let updated = false;
  if (synchronizePermissions) {
    if (existing.name !== definition.name) {
      await existing.setName(definition.name, 'Nom de catégorie FyxBot synchronisé');
      updated = true;
    }
    if (!permissionOverwritesMatch(existing, overwrites)) {
      await existing.permissionOverwrites.set(overwrites, 'Permissions de catégorie FyxBot synchronisées');
      updated = true;
    }
  }
  return { value: existing, created: false, updated };
}

function discordChannelType(definition) {
  return definition.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
}

async function findOrCreateChannel(guild, category, definition, profiles, synchronizePermissions) {
  const expectedType = discordChannelType(definition);
  const candidates = guild.channels.cache.filter((channel) => channel.type === expectedType
    && normalizedBlueprintName(channel.name) === normalizedBlueprintName(definition.name));
  const existing = candidates.find((channel) => channel.parentId === category.id)
    || (candidates.size === 1 ? candidates.first() : null);
  const permissionOverwrites = definition.profile === 'inherit' ? undefined : profiles[definition.profile];
  if (!existing) {
    const createdChannel = await guild.channels.create({
      name: definition.name,
      type: expectedType,
      parent: category.id,
      permissionOverwrites,
      topic: expectedType === ChannelType.GuildText ? definition.topic : undefined,
      reason: 'Configuration adaptative FyxBot',
    });
    return { value: createdChannel, created: true, updated: false };
  }
  let updated = false;
  if (existing.parentId !== category.id) {
    await existing.setParent(category.id, { lockPermissions: false, reason: 'Salon replacé par FyxBot' });
    updated = true;
  }
  if (synchronizePermissions) {
    if (existing.name !== definition.name) {
      await existing.setName(definition.name, 'Nom de salon FyxBot synchronisé');
      updated = true;
    }
    if (definition.profile === 'inherit') {
      if (existing.permissionsLocked !== true) {
        await existing.lockPermissions();
        updated = true;
      }
    } else if (!permissionOverwritesMatch(existing, permissionOverwrites)) {
      await existing.permissionOverwrites.set(permissionOverwrites, 'Permissions du salon FyxBot synchronisées');
      updated = true;
    }
    if (expectedType === ChannelType.GuildText && definition.topic !== undefined && existing.topic !== definition.topic) {
      await existing.setTopic(definition.topic, 'Description du salon FyxBot synchronisée');
      updated = true;
    }
  }
  return { value: existing, created: false, updated };
}

function desiredRolesFromGuild(guild, definitions) {
  return Object.fromEntries(definitions.map((definition) => [
    definition.key,
    findBlueprintItem(guild.roles.cache, definition.name, (role) => !role.managed && role.id !== guild.id),
  ]));
}

async function analyzeServerStructure(guild, fetched = {}, blueprint) {
  if (!fetched.channels) await guild.channels.fetch();
  if (!fetched.roles) await guild.roles.fetch();
  const desired = runtimeBlueprint(await resolveBlueprint(guild.id, blueprint));
  const roles = desiredRolesFromGuild(guild, desired.roles);
  const memberAccessRole = resolveMemberAccessRole(guild, roles, await getRulesConfig(guild.id));
  const profiles = permissionProfiles(guild, roles, desired.roles, memberAccessRole);
  const categories = Object.fromEntries(desired.categories.map((definition) => [
    definition.key,
    findBlueprintItem(guild.channels.cache, definition.name, (channel) => channel.type === ChannelType.GuildCategory),
  ]));
  const missingRoles = desired.roles.filter((definition) => !roles[definition.key]).map((definition) => definition.name);
  const missingCategories = desired.categories.filter((definition) => !categories[definition.key]).map((definition) => definition.name);
  const missingChannels = [];
  const misplacedChannels = [];
  const permissionIssues = [];
  const uneditableRoles = [];

  for (const definition of desired.roles) {
    const existingRole = roles[definition.key];
    if (!existingRole) continue;
    const expected = synchronizedRolePermissionBits(guild, definition, existingRole);
    if (existingRole.permissions.bitfield !== expected) {
      permissionIssues.push(`Rôle ${definition.name}${existingRole.editable ? '' : ' — placez FyxBot au-dessus'}`);
      if (!existingRole.editable) uneditableRoles.push(definition.name);
    }
  }
  for (const definition of desired.categories) {
    const existingCategory = categories[definition.key];
    if (existingCategory && !permissionOverwritesMatch(existingCategory, profiles[definition.profile] || profiles.memberCommunity)) {
      permissionIssues.push(`Catégorie ${definition.name}`);
    }
  }
  for (const definition of desired.channels) {
    const targetCategory = categories[definition.category];
    const matches = guild.channels.cache.filter((existingChannel) => existingChannel.type === discordChannelType(definition)
      && normalizedBlueprintName(existingChannel.name) === normalizedBlueprintName(definition.name));
    const existingChannel = targetCategory ? matches.find((item) => item.parentId === targetCategory.id) : null;
    if (!existingChannel) {
      if (matches.size > 0) misplacedChannels.push(definition.name);
      else missingChannels.push(definition.name);
      continue;
    }
    if (definition.profile === 'inherit') {
      if (existingChannel.permissionsLocked !== true) permissionIssues.push(`Salon ${definition.name}`);
    } else if (!permissionOverwritesMatch(existingChannel, profiles[definition.profile] || profiles.memberCommunity)) {
      permissionIssues.push(`Salon ${definition.name}`);
    }
  }

  const targetRoleNames = new Set(desired.roles.map((definition) => normalizedBlueprintName(definition.name)));
  const targetCategoryNames = new Set(desired.categories.map((definition) => normalizedBlueprintName(definition.name)));
  const targetChannelNames = new Set(desired.channels.map((definition) => normalizedBlueprintName(definition.name)));
  const extraRoles = guild.roles.cache.filter((existingRole) => existingRole.id !== guild.id && !existingRole.managed
    && !targetRoleNames.has(normalizedBlueprintName(existingRole.name))).map((existingRole) => existingRole.name);
  const extraCategories = guild.channels.cache.filter((existingChannel) => existingChannel.type === ChannelType.GuildCategory
    && !targetCategoryNames.has(normalizedBlueprintName(existingChannel.name))).map((existingChannel) => existingChannel.name);
  const extraChannels = guild.channels.cache.filter((existingChannel) => existingChannel.type !== ChannelType.GuildCategory && !existingChannel.isThread?.()
    && !targetChannelNames.has(normalizedBlueprintName(existingChannel.name))).map((existingChannel) => existingChannel.name);
  const missingCount = missingRoles.length + missingCategories.length + missingChannels.length + misplacedChannels.length;
  const recommendation = missingCount > 0
    ? 'complete'
    : uneditableRoles.length > 0
      ? 'hierarchy'
      : permissionIssues.length > 0
        ? 'synchronize'
        : extraRoles.length + extraCategories.length + extraChannels.length > 0 ? 'review' : 'ready';

  return {
    recommendation,
    blueprint: desired.source,
    missingRoles,
    missingCategories,
    missingChannels,
    misplacedChannels,
    permissionIssues,
    uneditableRoles,
    extraRoles,
    extraCategories,
    extraChannels,
    totals: {
      roles: guild.roles.cache.size,
      categories: guild.channels.cache.filter((existingChannel) => existingChannel.type === ChannelType.GuildCategory).size,
      channels: guild.channels.cache.filter((existingChannel) => existingChannel.type !== ChannelType.GuildCategory).size,
      missing: missingCount,
      permissionIssues: permissionIssues.length,
      extras: extraRoles.length + extraCategories.length + extraChannels.length,
    },
  };
}

async function setupServer(guild, options = {}) {
  const { synchronizePermissions = true } = options;
  const selectedBlueprint = options.blueprint || await getServerSetupBlueprint(guild.id);
  if (!selectedBlueprint) throw new Error('Décrivez d’abord votre serveur avec /setup concevoir avant de lancer la configuration.');
  const desired = runtimeBlueprint(selectedBlueprint);
  const missingPermissions = missingSetupPermissions(guild);
  if (missingPermissions.length > 0) throw new Error('FyxBot nécessite les permissions Gérer les rôles et Gérer les salons pour configurer le serveur.');
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

  const roleResults = {};
  for (const definition of desired.roles) roleResults[definition.key] = await findOrCreateRole(guild, definition, synchronizePermissions);
  const roles = Object.fromEntries(Object.entries(roleResults).map(([key, result]) => [key, result.value]));
  const memberAccessRole = resolveMemberAccessRole(guild, roles, await getRulesConfig(guild.id));
  const profiles = permissionProfiles(guild, roles, desired.roles, memberAccessRole);
  const categoryResults = {};
  for (const definition of desired.categories) {
    categoryResults[definition.key] = await findOrCreateCategory(
      guild,
      definition,
      profiles[definition.profile] || profiles.memberCommunity,
      synchronizePermissions,
    );
  }
  const categories = Object.fromEntries(Object.entries(categoryResults).map(([key, result]) => [key, result.value]));
  const channelResults = {};
  for (const definition of desired.channels) {
    channelResults[definition.key] = await findOrCreateChannel(
      guild,
      categories[definition.category],
      definition,
      profiles,
      synchronizePermissions,
    );
  }

  const now = new Date().toISOString();
  const configurationWrites = [];
  if (channelResults.logs) configurationWrites.push(setLogConfig(guild.id, { channelId: channelResults.logs.value.id, updatedAt: now }));
  if (channelResults.suggestions) configurationWrites.push(setSuggestionConfig(guild.id, { channelId: channelResults.suggestions.value.id, updatedAt: now }));
  if (categories.support && channelResults.ticketPanel) {
    configurationWrites.push(setTicketConfig(guild.id, {
      categoryId: categories.support.id,
      staffRoleId: (roles.support || roles.moderator || roles.administrator).id,
      panelChannelId: channelResults.ticketPanel.value.id,
      updatedAt: now,
    }));
  }
  if (channelResults.welcome) {
    configurationWrites.push(setWelcomeConfig(guild.id, {
      welcomeChannelId: channelResults.welcome.value.id,
      leaveChannelId: channelResults.welcome.value.id,
      autoRoleId: null,
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
      leaveMessage: DEFAULT_LEAVE_MESSAGE,
      updatedAt: now,
    }));
  }
  await Promise.all(configurationWrites);
  const rulesConfig = await ensureSetupRules(
    guild,
    channelResults.rules?.value || null,
    memberAccessRole,
    selectedBlueprint,
  );
  if (channelResults.changelog) await initializeChangelogChannel(guild, channelResults.changelog.value);
  await activateServerSetupBlueprint(guild.id, selectedBlueprint);

  const allResults = [...Object.values(roleResults), ...Object.values(categoryResults), ...Object.values(channelResults)];
  const analysis = await analyzeServerStructure(guild, {}, selectedBlueprint);
  return {
    created: allResults.filter((item) => item.created).length,
    updated: allResults.filter((item) => item.updated).length,
    analysis,
    blueprint: selectedBlueprint,
    staffRole: roles.support || roles.moderator || roles.administrator,
    memberRole: roles.member,
    verifiedRole: memberAccessRole,
    rulesConfig,
    ticketChannel: channelResults.ticketPanel?.value || null,
    logChannel: channelResults.logs?.value || null,
    changelogChannel: channelResults.changelog?.value || null,
    limitedAdminRoles: !guild.members.me.permissions.has(PermissionFlagsBits.Administrator),
  };
}

async function resetServer(guild, options = {}) {
  const selectedBlueprint = options.blueprint || await getServerSetupBlueprint(guild.id);
  if (!selectedBlueprint) throw new Error('Décrivez d’abord votre serveur avec /setup concevoir avant de lancer la reconstruction.');
  const backupFile = await backupServer(guild);
  let deletedChannels = 0;
  let deletedRoles = 0;
  const channels = [...guild.channels.cache.values()].sort((a, b) => b.rawPosition - a.rawPosition);
  for (const existingChannel of channels) {
    if (!existingChannel.deletable) continue;
    await existingChannel.delete('Réinitialisation complète FyxBot');
    deletedChannels += 1;
  }
  const roles = [...guild.roles.cache.values()].sort((a, b) => a.position - b.position);
  for (const existingRole of roles) {
    if (existingRole.id === guild.id || existingRole.managed || !existingRole.editable) continue;
    await existingRole.delete('Réinitialisation complète FyxBot');
    deletedRoles += 1;
  }
  const setup = await setupServer(guild, { blueprint: selectedBlueprint, synchronizePermissions: true });
  return { ...setup, deletedChannels, deletedRoles, backupFile };
}

module.exports = {
  CATEGORY_DEFINITIONS,
  CHANNEL_DEFINITIONS,
  DEFAULT_BLUEPRINT,
  MANAGEMENT_PERMISSIONS,
  ROLE_DEFINITIONS,
  analyzeServerStructure,
  grantableRolePermissions,
  missingSetupPermissions,
  normalizedBlueprintName,
  permissionOverwritesMatch,
  permissionProfiles,
  resolveMemberAccessRole,
  resetServer,
  rulesTemplateForBlueprint,
  runtimeCategoryProfile,
  runtimeChannelProfile,
  runtimeBlueprint,
  setupServer,
  synchronizedRolePermissionBits,
};
