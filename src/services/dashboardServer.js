const http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getLogConfig, setLogConfig } = require('../database/logStore');
const { getTicketConfig, setTicketConfig } = require('../database/ticketStore');
const { getSuggestionConfig, setSuggestionConfig } = require('../database/suggestionStore');
const { getWelcomeConfig, setWelcomeConfig } = require('../database/welcomeStore');
const { getServerSetupBlueprint, saveServerSetupDraft } = require('../database/serverSetupStore');
const { buildAdaptiveBlueprint } = require('./adaptiveServerBlueprint');
const { backupServer } = require('./serverBackup');
const { analyzeServerStructure, resetServer, setupServer } = require('./serverSetup');
const {
  csrfTokenMatches,
  finishLogin,
  getSession,
  logout,
  settings: authSettings,
  startDashboardAuthCleanup,
  startLogin,
} = require('./dashboardAuth');
const { addWarning, getWarnings } = require('../database/warningStore');
const { logAction } = require('./logs');
const { LEGACY_RULE_PREFIX, RULE_PREFIX, ruleDefinitions } = require('../commands/configuration/securite');
const { createPanelComponents, isTicketTopic } = require('./tickets');
const { getRecentAuditLogs } = require('../database/auditLogStore');
const { getRolePanelConfig, setRolePanelConfig } = require('../database/rolePanelStore');
const { ROLE_BUTTON_PREFIX } = require('./roleButtons');
const { getRecentSuggestions, getSuggestion, reviewSuggestion } = require('../database/suggestionRecordStore');
const { getCreatorStats } = require('../database/creatorStatsStore');
const { recordActivationProgress } = require('../database/activationStore');
const { getRulesConfig } = require('../database/rulesStore');
const { getBirthdayConfig, setBirthdayConfig } = require('../database/birthdayStore');
const { getSocialConfig, setSocialConfig } = require('../database/socialStore');
const { getTemporaryVoiceConfig } = require('../database/temporaryVoiceStore');
const { publishRules, updateRulesMessage } = require('./rules');
const { SUPPORTED_TIMEZONES } = require('./birthdays');
const { socialNotificationPayload } = require('./socialNotifications');
const { normalizeSocialSource } = require('./socialAutomation');
const { buildOnboardingProgress } = require('./onboardingProgress');
const { assertPremiumLimit, getGuildPremiumState } = require('./premiumPlans');
const { claimFounderAccess } = require('./premiumFounderAccess');
const { setupTemporaryVoice } = require('./temporaryVoice');
const { customMessagePayload } = require('./customMessages');
const { createCommunityEvent } = require('./communityEvents');
const { createCommunityGiveaway, listGuildGiveaways } = require('./communityGiveaways');
const { currentRelease } = require('./releaseManifest');
const {
  addSupportMessage,
  countOpenSupportRequests,
  createSupportRequest,
  getSupportConversation,
  listSupportRequests,
  updateSupportRequest,
} = require('../database/supportStore');
const {
  getSupportStaff,
  listSupportStaff,
  removeSupportStaff,
  upsertSupportStaff,
} = require('../database/supportStaffStore');
const {
  canAccessSupportRequest,
  normalizeSupportReply,
  normalizeSupportRequestInput,
  normalizeSupportStaffInput,
  normalizeSupportUpdate,
  publicSupportUrl,
  supportAccessForRole,
} = require('./supportManagement');
const {
  DEFAULT_BIRTHDAY_MESSAGE,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  configuredMessage,
} = require('./defaultMessages');

const PORT = Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3001);
const HOST = process.env.DASHBOARD_API_HOST?.trim()
  || (process.env.RAILWAY_ENVIRONMENT_ID ? '0.0.0.0' : '127.0.0.1');
const rateBuckets = new Map();
const activeRelease = currentRelease();

function buildAllowedOrigins() {
  const configured = (process.env.DASHBOARD_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const panelUrl = authSettings().panelUrl;
  try { configured.push(new URL(panelUrl).origin); } catch { /* Une URL invalide sera signalée par OAuth. */ }
  return new Set(configured.filter((origin) => /^https?:\/\/[^/]+$/i.test(origin)));
}
const allowedOrigins = buildAllowedOrigins();

function isRequestOriginAllowed(method, pathname, origin) {
  const isOAuthRedirect = method === 'GET'
    && (pathname === '/api/auth/login' || pathname === '/api/auth/callback');
  if (isOAuthRedirect) return true;
  // Les navigations et lectures même origine ne portent pas toujours Origin.
  // Elles restent protégées par le cookie de session et la politique same-origin.
  if (method === 'GET' && !origin) return true;
  return allowedOrigins.has(origin);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function panelErrorResponse(error, environment = authSettings().environment) {
  const status = Number.isInteger(error?.status) ? error.status : error?.code === 'PREMIUM_LIMIT' ? 409 : 500;
  const reference = randomUUID().split('-')[0].toUpperCase();
  if (error instanceof HttpError || error?.code === 'PREMIUM_LIMIT' || environment !== 'production') {
    return { status, error: error?.message || 'Erreur inattendue.', reference: null };
  }
  return {
    status,
    error: `Une erreur interne empêche cette action. Réessayez dans quelques instants. Référence : ${reference}.`,
    reference,
  };
}

function messagePublishError(error) {
  if (error instanceof HttpError) return error;
  const code = Number(error?.code);
  if (code === 50001) {
    return new HttpError(403, 'FyxBot ne peut pas voir ce salon. Autorisez-lui la permission « Voir le salon » puis réessayez.');
  }
  if (code === 50013) {
    return new HttpError(403, 'FyxBot n’a pas les permissions nécessaires dans ce salon. Autorisez « Envoyer des messages » et « Intégrer des liens » puis réessayez.');
  }
  if (code === 50035) {
    return new HttpError(400, 'Discord a refusé le format du message. Vérifiez la longueur des textes, les liens HTTPS et les images.');
  }
  return new HttpError(502, 'Discord n’a pas pu publier le message pour le moment. Réessayez dans quelques instants.');
}

function isLoopbackHost(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(String(host).toLowerCase());
}

function requireRecentAuthentication(session, maximumAgeMs = 10 * 60_000) {
  if (!Number.isFinite(session?.authenticatedAt) || Date.now() - session.authenticatedAt > maximumAgeMs) {
    throw new HttpError(401, 'Reconnectez-vous à Discord avant cette action sensible.');
  }
}

function send(response, status, data, origin, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-FyxBot-CSRF',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    Vary: 'Origin, Sec-Fetch-Site',
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
}

function rateLimit(request, pathname) {
  const now = Date.now();
  const isSetup = pathname === '/api/setup';
  const isAuth = pathname.startsWith('/api/auth/');
  const windowMs = isSetup || isAuth ? 10 * 60_000 : 60_000;
  const limit = isSetup ? 3 : isAuth ? 20 : request.method === 'POST' ? 30 : 120;
  const forwardedAddress = process.env.DASHBOARD_TRUST_PROXY === 'true'
    ? String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
    : '';
  const address = forwardedAddress || request.socket.remoteAddress || 'unknown';
  const sessionFingerprint = request.headers.cookie
    ? createHash('sha256').update(String(request.headers.cookie)).digest('hex').slice(0, 24)
    : address;
  const key = `${sessionFingerprint}:${isSetup ? pathname : isAuth ? 'auth' : request.method}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 1000) for (const [entryKey, entry] of rateBuckets) if (entry.resetAt <= now) rateBuckets.delete(entryKey);
    while (rateBuckets.size > 5000) rateBuckets.delete(rateBuckets.keys().next().value);
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_768) throw new HttpError(413, 'La requête dépasse la taille maximale autorisée. Réduisez la longueur du message.');
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Les données envoyées sont illisibles. Rechargez le panel puis réessayez.');
  }
}

function validateId(value, allowedIds, label) {
  if (value === null || value === '') return null;
  if (!allowedIds.has(value)) throw new Error(`${label} invalide.`);
  return value;
}

async function getDashboardState(client, requestedGuildId = null, manageableGuildIds = null, requestingUserId = null) {
  const availableGuilds = [...client.guilds.cache.values()].filter((guild) => !manageableGuildIds || manageableGuildIds.includes(guild.id));
  if (requestedGuildId && manageableGuildIds && !manageableGuildIds.includes(requestedGuildId)) {
    throw new Error('Vous n’êtes pas autorisé à administrer ce serveur.');
  }
  const configuredGuildId = availableGuilds.some((guild) => guild.id === client.config.guildId) ? client.config.guildId : null;
  const guildId = requestedGuildId || configuredGuildId || availableGuilds[0]?.id;
  if (!guildId || !availableGuilds.some((guild) => guild.id === guildId)) throw new Error('FyxBot n’est pas installé sur un serveur que vous pouvez administrer.');
  const guild = await client.guilds.fetch(guildId);
  const fullGuild = await guild.fetch();
  const [
    channels,
    roles,
    logConfig,
    ticketConfig,
    suggestionConfig,
    welcomeConfig,
    rolePanelConfig,
    rulesConfig,
    birthdayConfig,
    socialConfig,
    temporaryVoiceConfig,
    automodRules,
    scheduledEvents,
  ] = await Promise.all([
    fullGuild.channels.fetch(),
    fullGuild.roles.fetch(),
    getLogConfig(fullGuild.id),
    getTicketConfig(fullGuild.id),
    getSuggestionConfig(fullGuild.id),
    getWelcomeConfig(fullGuild.id),
    getRolePanelConfig(fullGuild.id),
    getRulesConfig(fullGuild.id),
    getBirthdayConfig(fullGuild.id),
    getSocialConfig(fullGuild.id),
    getTemporaryVoiceConfig(fullGuild.id),
    fullGuild.autoModerationRules.fetch().catch(() => new Map()),
    fullGuild.scheduledEvents?.fetch
      ? fullGuild.scheduledEvents.fetch().catch(() => new Map())
      : Promise.resolve(new Map()),
  ]);
  const textChannels = channels.filter((channel) => channel?.isTextBased() && !channel.isThread()).map((channel) => ({ id: channel.id, name: channel.name }));
  const categories = channels.filter((channel) => channel?.type === 4).map((channel) => ({ id: channel.id, name: channel.name }));
  const voiceChannels = channels.filter((channel) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel?.type))
    .map((channel) => ({ id: channel.id, name: channel.name }));
  const roleList = roles.filter((role) => role.id !== fullGuild.id && !role.managed).sort((a, b) => b.position - a.position).map((role) => ({ id: role.id, name: role.name, color: role.hexColor }));
  const memberList = fullGuild.members.cache.filter((member) => !member.user.bot).map((member) => ({ id: member.id, name: member.displayName })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const openTickets = channels.filter((channel) => isTicketTopic(channel?.topic) && !channel.name.startsWith('ferme-')).size;
  const ticketPanels = ticketConfig?.panels || (ticketConfig ? [{ id: 'default', title: 'Assistance FyxBot', requestType: 'support', ...ticketConfig }] : []);
  const setupBlueprint = getServerSetupBlueprint(fullGuild.id);
  const setupAnalysis = await analyzeServerStructure(fullGuild, { channels, roles }, setupBlueprint || undefined);
  const dashboardConfig = {
    logs: logConfig,
    tickets: ticketConfig ? { ...ticketConfig, panels: ticketPanels } : null,
    suggestions: suggestionConfig,
    welcome: welcomeConfig,
    rolePanels: rolePanelConfig?.panels || [],
    rules: rulesConfig,
    birthdays: birthdayConfig,
    social: socialConfig,
    temporaryVoice: temporaryVoiceConfig,
  };
  const securityRules = [...automodRules.values()].filter((rule) => [RULE_PREFIX, LEGACY_RULE_PREFIX]
    .some((prefix) => rule.name.startsWith(prefix)) && rule.enabled).length;
  const onboarding = buildOnboardingProgress({ setupBlueprint, config: dashboardConfig, securityRules });
  recordActivationProgress(fullGuild.id, onboarding);
  return {
    guilds: availableGuilds.map((item) => ({ id: item.id, name: item.name, icon: item.iconURL() })),
    bot: { username: client.user.tag, online: client.isReady(), ping: Math.round(client.ws.ping) },
    guild: { id: fullGuild.id, name: fullGuild.name, members: fullGuild.memberCount, channels: channels.size, roles: roles.size },
    metrics: {
      commands: client.commands.size,
      openTickets,
      securityRules,
    },
    recentLogs: getRecentAuditLogs(fullGuild.id),
    recentSuggestions: getRecentSuggestions(fullGuild.id),
    setupBlueprint,
    setupAnalysis,
    onboarding,
    premium: getGuildPremiumState(fullGuild.id, { userId: requestingUserId }),
    community: {
      events: [...scheduledEvents.values()].filter((event) => ![3, 4].includes(event.status)).map((event) => ({
        id: event.id,
        name: event.name,
        scheduledStartAt: event.scheduledStartAt?.toISOString() || null,
        scheduledEndAt: event.scheduledEndAt?.toISOString() || null,
        status: event.status,
        channelId: event.channelId || null,
        url: `https://discord.com/events/${fullGuild.id}/${event.id}`,
      })).sort((a, b) => String(a.scheduledStartAt).localeCompare(String(b.scheduledStartAt))).slice(0, 20),
      giveaways: listGuildGiveaways(fullGuild.id),
    },
    options: { textChannels, voiceChannels, categories, roles: roleList, members: memberList },
    config: dashboardConfig,
  };
}

async function revalidateManageableGuildIds(client, session) {
  if (!session?.user?.id) return null;
  const authenticatedAt = Number(session.authenticatedAt) || 0;
  const candidates = new Set(
    [...new Set(session.manageableGuildIds || [])]
      .filter((guildId) => client.guilds.cache.has(guildId)),
  );

  // La liste OAuth correspond à l'instant de connexion. Le bot peut ensuite être
  // invité sur un nouveau serveur sans que la session du panel soit renouvelée.
  // On ajoute donc les serveurs nouvellement rejoints, ainsi que ceux dont le
  // propriétaire ou le membre administrateur est déjà présent dans le cache.
  for (const guild of client.guilds.cache.values()) {
    if (guild.ownerId === session.user.id) {
      candidates.add(guild.id);
      continue;
    }
    const cachedMember = guild.members?.cache?.get(session.user.id);
    if (cachedMember?.permissions.has(PermissionFlagsBits.Administrator)
      || cachedMember?.permissions.has(PermissionFlagsBits.ManageGuild)
      || Number(guild.joinedTimestamp) >= authenticatedAt) {
      candidates.add(guild.id);
    }
  }

  const checks = await Promise.all([...candidates].map(async (guildId) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;
    if (guild.ownerId === session.user.id) return guildId;
    const member = guild.members?.cache?.get(session.user.id)
      || await guild.members.fetch(session.user.id).catch(() => null);
    return member?.permissions.has(PermissionFlagsBits.Administrator)
      || member?.permissions.has(PermissionFlagsBits.ManageGuild) ? guildId : null;
  }));
  return checks.filter(Boolean);
}

async function requireGuildCapability(client, guildId, session, permissions = [], { administratorOnly = false } = {}) {
  if (!session?.user?.id) throw new HttpError(401, 'Connexion Discord requise.');
  const guild = await client.guilds.fetch(guildId);
  if (guild.ownerId === session.user.id) return { guild, member: null, owner: true };
  const member = await guild.members.fetch(session.user.id).catch(() => null);
  if (!member) throw new HttpError(403, 'Vous n’avez plus accès à ce serveur.');
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return { guild, member, owner: false };
  if (administratorOnly || !permissions.every((permission) => member.permissions.has(permission))) {
    throw new HttpError(403, 'Vos permissions Discord ne permettent pas cette action.');
  }
  return { guild, member, owner: false };
}

function rolePanelPayload(panel, roles) {
  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(panel.title)
    .setDescription(panel.description || 'Cliquez sur un bouton pour ajouter ou retirer le rôle correspondant.')
    .addFields({ name: 'Rôles disponibles', value: roles.map((role) => `• ${role}`).join('\n') })
    .setFooter({ text: 'FyxBot • Rôles personnalisables' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(roles.map((role, index) => new ButtonBuilder()
    .setCustomId(`${ROLE_BUTTON_PREFIX}${role.id}`)
    .setLabel(role.name.slice(0, 80))
    .setStyle(index % 2 === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)));
  return { embeds: [embed], components: [row] };
}

async function isApplicationOwner(client, userId) {
  if (!userId) return false;
  await client.application.fetch();
  const owner = client.application.owner;
  return owner?.id === userId || owner?.ownerId === userId;
}

async function getSupportAccess(client, userId) {
  if (await isApplicationOwner(client, userId)) return supportAccessForRole('owner');
  return supportAccessForRole(getSupportStaff(userId)?.role);
}

async function validatedPanelRoles(guild, state, roleIds) {
  const uniqueIds = [...new Set(Array.isArray(roleIds) ? roleIds.filter(Boolean) : [])];
  if (uniqueIds.length < 1 || uniqueIds.length > 5) throw new Error('Choisissez entre 1 et 5 rôles différents.');
  if (!uniqueIds.every((id) => state.options.roles.some((role) => role.id === id))) throw new Error('Un rôle sélectionné est invalide.');
  const roles = await Promise.all(uniqueIds.map((id) => guild.roles.fetch(id)));
  const invalid = roles.find((role) => !role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0);
  if (invalid) throw new Error(`FyxBot ne peut pas gérer le rôle ${invalid?.name || 'sélectionné'}. Placez son rôle plus haut dans Discord.`);
  return roles;
}

async function updateConfiguration(client, section, body, manageableGuildIds) {
  const state = await getDashboardState(client, body.guildId, manageableGuildIds);
  const guildId = state.guild.id;
  const channelIds = new Set(state.options.textChannels.map((channel) => channel.id));
  const categoryIds = new Set(state.options.categories.map((channel) => channel.id));
  const roleIds = new Set(state.options.roles.map((role) => role.id));
  const now = new Date().toISOString();

  if (section === 'logs') {
    const channelId = validateId(body.channelId, channelIds, 'Salon de logs');
    if (!channelId) throw new Error('Choisissez un salon de logs.');
    await setLogConfig(guildId, { channelId, updatedAt: now });
  } else if (section === 'tickets') {
    const categoryId = validateId(body.categoryId, categoryIds, 'Catégorie de tickets');
    const staffRoleId = validateId(body.staffRoleId, roleIds, 'Rôle staff');
    if (!categoryId || !staffRoleId) throw new Error('Choisissez une catégorie et un rôle staff.');
    await setTicketConfig(guildId, { categoryId, staffRoleId, panelChannelId: state.config.tickets?.panelChannelId || null, updatedAt: now });
  } else if (section === 'suggestions') {
    const channelId = validateId(body.channelId, channelIds, 'Salon de suggestions');
    if (!channelId) throw new Error('Choisissez un salon de suggestions.');
    await setSuggestionConfig(guildId, { channelId, updatedAt: now });
  } else if (section === 'welcome') {
    const welcomeChannelId = validateId(body.welcomeChannelId, channelIds, 'Salon de bienvenue');
    const leaveChannelId = validateId(body.leaveChannelId, channelIds, 'Salon de départ') || welcomeChannelId;
    const autoRoleId = validateId(body.autoRoleId, roleIds, 'Rôle automatique');
    if (!welcomeChannelId) throw new Error('Choisissez un salon de bienvenue.');
    await setWelcomeConfig(guildId, {
      welcomeChannelId,
      leaveChannelId,
      autoRoleId,
      welcomeMessage: configuredMessage(body.welcomeMessage, DEFAULT_WELCOME_MESSAGE).slice(0, 1000),
      leaveMessage: configuredMessage(body.leaveMessage, DEFAULT_LEAVE_MESSAGE).slice(0, 1000),
      updatedAt: now,
    });
  } else if (section === 'birthdays') {
    const channelId = validateId(body.channelId, channelIds, 'Salon des anniversaires');
    const roleId = validateId(body.roleId, roleIds, 'Rôle anniversaire');
    const timezone = SUPPORTED_TIMEZONES.includes(body.timezone) ? body.timezone : null;
    if (!channelId || !timezone) throw new Error('Choisissez un salon et un fuseau horaire valides.');
    if (roleId) {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0) throw new Error('FyxBot ne peut pas attribuer ce rôle anniversaire. Placez son rôle plus haut.');
    }
    const current = await getBirthdayConfig(guildId) || {};
    await setBirthdayConfig(guildId, {
      ...current,
      channelId,
      roleId,
      timezone,
      message: configuredMessage(body.message, DEFAULT_BIRTHDAY_MESSAGE).slice(0, 1000),
      birthdays: current.birthdays || {},
      updatedAt: now,
    });
  } else if (section === 'social') {
    const channelId = validateId(body.channelId, channelIds, 'Salon des notifications sociales');
    const roleId = validateId(body.roleId, roleIds, 'Rôle à notifier');
    if (!channelId) throw new Error('Choisissez un salon de notifications.');
    await setSocialConfig(guildId, { ...state.config.social, channelId, roleId, sources: state.config.social?.sources || [], updatedAt: now });
  } else {
    throw new Error('Section inconnue.');
  }
}

function startDashboardServer(client) {
  const startupAuth = authSettings();
  if (startupAuth.allowUnauthenticatedLocal && !isLoopbackHost(HOST)) {
    throw new Error('ALLOW_UNAUTHENTICATED_LOCAL exige une API limitée à localhost.');
  }
  const authCleanup = startDashboardAuthCleanup();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const requestOrigin = request.headers.origin || '';
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return send(response, 200, {
        ok: true,
        service: 'fyxbot-bot-api',
        discord: client.isReady() ? 'connected' : 'connecting',
        release: activeRelease,
      }, 'null');
    }
    if (!isRequestOriginAllowed(request.method, url.pathname, requestOrigin)) return send(response, 403, { error: 'Origine refusée.' }, 'null');
    const retryAfter = rateLimit(request, url.pathname);
    if (retryAfter) return send(response, 429, { error: 'Trop de requêtes. Réessayez dans quelques instants.' }, allowedOrigins.has(requestOrigin) ? requestOrigin : 'null', { 'Retry-After': String(retryAfter) });
    if (request.method === 'GET' && url.pathname === '/api/auth/login') {
      if (!authSettings().enabled) return send(response, 503, { error: 'La connexion Discord n’est pas configurée.' }, 'null');
      return startLogin(response);
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/callback') {
      try { return await finishLogin(request, url, response); } catch (error) {
        response.writeHead(302, {
          Location: `${authSettings().panelUrl}?authError=${encodeURIComponent(error.message)}`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        });
        return response.end();
      }
    }
    const origin = requestOrigin;
    if (request.method === 'OPTIONS') return send(response, 204, {}, origin);
    try {
      const session = getSession(request);
      const auth = authSettings();
      if (request.method === 'GET' && url.pathname === '/api/auth/status') {
        return send(response, 200, {
          authenticated: Boolean(session),
          user: session?.user || null,
          csrfToken: session?.csrfToken || null,
        }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (auth.enabled && !session) return send(response, 401, { error: 'Connexion Discord requise.' }, origin);
        if (auth.enabled && !csrfTokenMatches(request, session)) return send(response, 403, { error: 'Protection de session invalide. Rechargez le panel.' }, origin);
        return logout(request, response, origin);
      }
      if (!auth.enabled && !auth.allowUnauthenticatedLocal) return send(response, 503, { error: 'Le panel est verrouillé : configurez OAuth Discord.' }, origin);
      if (auth.enabled && !session) return send(response, 401, { error: 'Connexion Discord requise.' }, origin);
      if (!client.isReady()) return send(response, 503, { error: 'FyxBot se connecte à Discord.' }, origin);
      if (request.method === 'POST' && !session) return send(response, 401, { error: 'Connexion Discord requise pour modifier un serveur.' }, origin);
      if (request.method === 'POST' && !csrfTokenMatches(request, session)) {
        return send(response, 403, { error: 'Protection de session invalide. Rechargez le panel.' }, origin);
      }
      if (request.method === 'POST' && !String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return send(response, 415, { error: 'Le format de la requête doit être application/json.' }, origin);
      }
      const manageableGuildIds = await revalidateManageableGuildIds(client, session);
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const state = await getDashboardState(client, url.searchParams.get('guildId'), manageableGuildIds, session?.user?.id);
        state.creatorAccess = await isApplicationOwner(client, session?.user.id);
        return send(response, 200, state, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/premium/founder') {
        const body = await readBody(request);
        if (body.confirmation !== 'ACTIVER') throw new HttpError(400, 'Confirmez explicitement l’activation Premium.');
        const guildId = String(body.guildId || '');
        if (!manageableGuildIds.includes(guildId)) throw new HttpError(403, 'Vous n’êtes pas autorisé à administrer ce serveur.');
        const access = await requireGuildCapability(client, guildId, session, [PermissionFlagsBits.ManageGuild]);
        try {
          const founder = claimFounderAccess(session.user.id, access.guild.id);
          const premium = getGuildPremiumState(access.guild.id, { userId: session.user.id });
          return send(response, 200, {
            ok: true,
            premium,
            message: `FyxBot Premium est actif sur ${access.guild.name} jusqu’au ${new Date(founder.endsAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Aucun paiement ni renouvellement automatique.`,
          }, origin);
        } catch (error) {
          if (error?.code === 'FOUNDER_FULL' || error?.code === 'FOUNDER_EXPIRED') throw new HttpError(409, error.message);
          throw error;
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/creator/stats') {
        if (!await isApplicationOwner(client, session?.user.id)) return send(response, 403, { error: 'Espace réservé au créateur de FyxBot.' }, origin);
        return send(response, 200, getCreatorStats(client.guilds.cache.values()), origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/support/staff') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        return send(response, 200, { staff: listSupportStaff() }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/staff/upsert') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        const input = normalizeSupportStaffInput(await readBody(request));
        if (await isApplicationOwner(client, input.userId)) throw new HttpError(409, 'Le propriétaire possède déjà tous les droits Support.');
        const discordUser = await client.users.fetch(input.userId).catch(() => null);
        if (!discordUser || discordUser.bot) throw new HttpError(404, 'Utilisateur Discord introuvable ou non autorisé.');
        const member = upsertSupportStaff({
          ...input,
          displayName: discordUser.globalName || discordUser.username,
          grantedBy: session.user.id,
        });
        return send(response, 200, { ok: true, member, staff: listSupportStaff() }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/staff/remove') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        const input = normalizeSupportStaffInput({ ...(await readBody(request)), role: 'moderator' });
        if (!removeSupportStaff(input.userId)) throw new HttpError(404, 'Ce membre ne possède aucun droit Support.');
        return send(response, 200, { ok: true, staff: listSupportStaff() }, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/support') {
        const access = await getSupportAccess(client, session?.user.id);
        const requestedGuildId = String(url.searchParams.get('guildId') || '').trim() || null;
        if (!access.canViewAll && requestedGuildId) {
          if (!manageableGuildIds.includes(requestedGuildId)) throw new HttpError(403, 'Vous n’êtes plus autorisé à administrer ce serveur.');
          await requireGuildCapability(client, requestedGuildId, session, [PermissionFlagsBits.ManageGuild]);
        }
        const storedRequests = listSupportRequests({
          requesterId: session.user.id,
          guildId: access.canViewAll ? requestedGuildId : null,
          includeAll: access.canViewAll,
          limit: 200,
        });
        const requests = access.canViewAll
          ? storedRequests
          : storedRequests.filter((item) => manageableGuildIds.includes(item.guildId)
            && (!requestedGuildId || item.guildId === requestedGuildId));
        const openStatuses = new Set(['open', 'in_progress', 'waiting_user']);
        return send(response, 200, {
          ownerAccess: access.role === 'owner',
          access,
          supportUrl: publicSupportUrl(),
          requests,
          counts: {
            total: requests.length,
            open: requests.filter((item) => openStatuses.has(item.status)).length,
            urgent: requests.filter((item) => openStatuses.has(item.status) && item.priority === 'urgent').length,
          },
        }, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/support/conversation') {
        const conversation = getSupportConversation(String(url.searchParams.get('id') || ''));
        if (!conversation) throw new HttpError(404, 'Demande de support introuvable.');
        const access = await getSupportAccess(client, session?.user.id);
        if (!canAccessSupportRequest(conversation.request, {
          userId: session.user.id,
          supportAccess: access,
          manageableGuildIds,
        })) throw new HttpError(403, 'Vous ne pouvez pas consulter cette demande.');
        return send(response, 200, { ownerAccess: access.role === 'owner', access, conversation }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/create') {
        const body = await readBody(request);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        if (countOpenSupportRequests(session.user.id) >= 5) {
          throw new HttpError(409, 'Vous avez déjà cinq demandes actives. Terminez-en une avant d’en créer une autre.');
        }
        const input = normalizeSupportRequestInput(body);
        const created = createSupportRequest({
          guildId: state.guild.id,
          guildName: state.guild.name,
          requesterId: session.user.id,
          requesterName: session.user.username,
          ...input,
        });
        return send(response, 201, { ok: true, request: created }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/reply') {
        const body = await readBody(request);
        const conversation = getSupportConversation(String(body.requestId || ''));
        if (!conversation) throw new HttpError(404, 'Demande de support introuvable.');
        const access = await getSupportAccess(client, session?.user.id);
        if (!canAccessSupportRequest(conversation.request, {
          userId: session.user.id,
          supportAccess: access,
          manageableGuildIds,
        })) throw new HttpError(403, 'Vous ne pouvez pas répondre à cette demande.');
        if (conversation.messages.length >= 100) throw new HttpError(409, 'Cette conversation a atteint sa limite. Créez une nouvelle demande si nécessaire.');
        const reply = normalizeSupportReply(body.message);
        if (!access.canReplyAsStaff && ['resolved', 'closed'].includes(conversation.request.status)) {
          updateSupportRequest({
            requestId: conversation.request.id,
            status: 'open',
            priority: conversation.request.priority,
            actorId: session.user.id,
            actorName: session.user.username,
          });
        }
        addSupportMessage({
          requestId: conversation.request.id,
          authorId: session.user.id,
          authorName: session.user.username,
          authorRole: access.canReplyAsStaff ? 'staff' : 'user',
          body: reply,
        });
        return send(response, 200, { ok: true, conversation: getSupportConversation(conversation.request.id) }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/update') {
        const access = await getSupportAccess(client, session?.user.id);
        if (!access.canManageStatus) throw new HttpError(403, 'Gestion réservée à l’équipe Support FyxBot.');
        const body = await readBody(request);
        const current = getSupportConversation(String(body.requestId || ''));
        if (!current) throw new HttpError(404, 'Demande de support introuvable.');
        const update = normalizeSupportUpdate(body);
        if (!access.canManagePriority && update.priority !== current.request.priority) {
          throw new HttpError(403, 'Seuls les administrateurs Support peuvent modifier la priorité.');
        }
        const updated = updateSupportRequest({
          requestId: current.request.id,
          actorId: session.user.id,
          actorName: session.user.username,
          ...update,
        });
        return send(response, 200, { ok: true, request: updated }, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/moderation/warnings') {
        const state = await getDashboardState(client, url.searchParams.get('guildId'), manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ModerateMembers]);
        const memberId = url.searchParams.get('memberId');
        if (!state.options.members.some((member) => member.id === memberId)) throw new Error('Membre introuvable sur ce serveur.');
        const guild = await client.guilds.fetch(state.guild.id);
        const warnings = await getWarnings(guild.id, memberId);
        const result = await Promise.all(warnings.map(async (warning) => {
          const moderator = await guild.members.fetch(warning.moderatorId).catch(() => null);
          return { id: warning.id, reason: warning.reason, createdAt: warning.createdAt, moderatorName: moderator?.displayName || 'Modérateur inconnu' };
        }));
        return send(response, 200, { warnings: result.reverse() }, origin);
      }
      const match = request.method === 'POST' && url.pathname.match(/^\/api\/config\/(logs|tickets|suggestions|welcome|birthdays|social)$/);
      if (match) {
        const body = await readBody(request);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        await updateConfiguration(client, match[1], body, manageableGuildIds);
        return send(response, 200, { ok: true }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/moderation') {
        const body = await readBody(request);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const moderationPermissions = {
          warn: PermissionFlagsBits.ModerateMembers,
          timeout: PermissionFlagsBits.ModerateMembers,
          kick: PermissionFlagsBits.KickMembers,
          ban: PermissionFlagsBits.BanMembers,
        };
        const requiredPermission = moderationPermissions[body.action];
        if (!requiredPermission) throw new HttpError(400, 'Action de modération inconnue.');
        const actor = await requireGuildCapability(client, state.guild.id, session, [requiredPermission]);
        const guild = await client.guilds.fetch(state.guild.id);
        const member = await guild.members.fetch(body.memberId).catch(() => null);
        const reason = String(body.reason || '').trim().slice(0, 400);
        if (!member || member.user.bot || member.id === guild.ownerId || member.id === session.user.id) throw new Error('Ce membre ne peut pas être modéré.');
        if (!actor.owner && member.roles.highest.comparePositionTo(actor.member.roles.highest) >= 0) {
          throw new HttpError(403, 'Vous ne pouvez pas modérer un membre placé au même niveau ou au-dessus de vous.');
        }
        if (!reason) throw new Error('Indiquez un motif précis.');
        const audit = `${reason} | Panel : ${session.user.username} (${session.user.id})`.slice(0, 512);
        if (body.action === 'warn') await addWarning({ guildId: guild.id, userId: member.id, moderatorId: session.user.id, reason });
        else if (body.action === 'timeout') { if (!member.moderatable) throw new Error('FyxBot ne peut pas exclure temporairement ce membre.'); await member.timeout(Math.min(Math.max(Number(body.duration) || 10, 1), 40320) * 60_000, audit); }
        else if (body.action === 'kick') { if (!member.kickable) throw new Error('FyxBot ne peut pas expulser ce membre.'); await member.kick(audit); }
        else if (body.action === 'ban') { if (!member.bannable) throw new Error('FyxBot ne peut pas bannir ce membre.'); await member.ban({ reason: audit }); }
        else throw new Error('Action de modération inconnue.');
        await logAction(guild, { title: '🛡️ Modération depuis le panel', description: `Action **${body.action}** appliquée à **${member.user.tag}** par **${session.user.username}**.\n**Motif :** ${reason}`, color: 0xff5a2a });
        return send(response, 200, { ok: true, message: `Action ${body.action} appliquée à ${member.user.tag}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/security') {
        const body = await readBody(request);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const rules = await guild.autoModerationRules.fetch();
        const fyxbotRules = rules.filter((rule) => [RULE_PREFIX, LEGACY_RULE_PREFIX]
          .some((prefix) => rule.name.startsWith(prefix)));
        if (body.enabled === false) {
          await Promise.all(fyxbotRules.map((rule) => rule.edit({ enabled: false, reason: `Panel FyxBot : ${session.user.username}` })));
        } else {
          const definitions = ruleDefinitions(state.config.logs?.channelId || null);
          for (const definition of definitions) {
            const legacyName = definition.name.replace(RULE_PREFIX, LEGACY_RULE_PREFIX);
            const existing = fyxbotRules.find((rule) => [definition.name, legacyName].includes(rule.name));
            if (existing) await existing.edit({ name: definition.name, triggerMetadata: definition.triggerMetadata, actions: definition.actions, enabled: true, reason: `Panel FyxBot : ${session.user.username}` });
            else await guild.autoModerationRules.create({ ...definition, enabled: true, reason: `Panel FyxBot : ${session.user.username}` });
          }
        }
        await logAction(guild, { title: `🛡️ Sécurité ${body.enabled === false ? 'désactivée' : 'activée'}`, description: `Action réalisée depuis le panel par **${session.user.username}**.`, color: body.enabled === false ? 0xed4245 : 0x57f287 });
        return send(response, 200, { ok: true, message: body.enabled === false ? 'Protections FyxBot désactivées.' : '4 protections FyxBot activées.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/rules/publish') {
        const body = await readBody(request);
        const updating = body.mode === 'update';
        const expected = updating ? 'MODIFIER' : 'PUBLIER';
        if (body.confirmation !== expected) throw new Error(`Écrivez ${expected} pour confirmer.`);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const title = String(body.title || 'Règlement du serveur').trim().slice(0, 100);
        const content = String(body.content || '').trim().slice(0, 3900);
        if (content.length < 20) throw new Error('Le règlement doit contenir au moins 20 caractères.');
        const roleId = validateId(body.verifiedRoleId, new Set(state.options.roles.map((role) => role.id)), 'Rôle de validation');
        if (roleId) {
          const role = await guild.roles.fetch(roleId);
          if (!role || role.managed || guild.members.me.roles.highest.comparePositionTo(role) <= 0) throw new Error('FyxBot ne peut pas attribuer ce rôle. Placez son rôle plus haut.');
        }
        if (updating) {
          if (!state.config.rules?.messageId) throw new Error('Aucun règlement publié à modifier.');
          await updateRulesMessage(guild, { ...state.config.rules, title, content, verifiedRoleId: roleId });
        } else {
          const channel = await client.channels.fetch(body.channelId).catch(() => null);
          if (!channel?.isTextBased() || channel.guildId !== guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new Error('Salon de publication invalide.');
          await publishRules(guild, channel, { title, content, verifiedRoleId: roleId });
        }
        await logAction(guild, { title: updating ? '📜 Règlement modifié' : '📜 Règlement publié', description: `Action réalisée depuis le panel par **${session.user.username}**.`, color: 0xf97316 });
        return send(response, 200, { ok: true, message: updating ? 'Règlement mis à jour.' : 'Règlement publié.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/community/event') {
        const body = await readBody(request);
        if (body.confirmation !== 'PROGRAMMER') throw new Error('Écrivez PROGRAMMER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.CreateEvents]);
        const type = body.type === 'voice' ? 'voice' : 'external';
        const channelId = type === 'voice'
          ? validateId(body.channelId, new Set(state.options.voiceChannels.map((channel) => channel.id)), 'Salon vocal')
          : null;
        if (type === 'voice' && !channelId) throw new Error('Choisissez un salon vocal ou une scène.');
        const guild = await client.guilds.fetch(state.guild.id);
        const result = await createCommunityEvent(guild, {
          name: body.name,
          description: body.description,
          date: body.date,
          time: body.time,
          timeZone: body.timeZone,
          durationMinutes: body.durationMinutes,
          type,
          channelId,
          location: body.location,
        }, { actorLabel: session.user.username });
        await logAction(guild, {
          title: '📅 Événement programmé',
          description: `Événement **${result.details.name}** programmé depuis le panel par **${session.user.username}**.`,
          color: 0xf97316,
        });
        return send(response, 200, { ok: true, message: 'Événement Discord programmé.', url: result.url }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/community/giveaway') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new Error('Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        const channelId = validateId(body.channelId, new Set(state.options.textChannels.map((channel) => channel.id)), 'Salon du concours');
        if (!channelId) throw new Error('Choisissez un salon pour le concours.');
        const guild = await client.guilds.fetch(state.guild.id);
        const channel = await client.channels.fetch(channelId).catch(() => null);
        const result = await createCommunityGiveaway(guild, channel, {
          prize: body.prize,
          winnerCount: body.winnerCount,
          durationMinutes: body.durationMinutes,
        });
        await logAction(guild, {
          title: '🎉 Concours publié',
          description: `Concours **${result.giveaway.prize}** publié dans ${channel} depuis le panel par **${session.user.username}**.`,
          color: 0xf97316,
        });
        return send(response, 200, { ok: true, message: `Concours publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/social/notify') {
        const body = await readBody(request);
        if (body.confirmation !== 'NOTIFIER') throw new Error('Écrivez NOTIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        if (!['live', 'video'].includes(body.type)) throw new Error('Type de notification invalide.');
        const config = state.config.social;
        const channel = config?.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
        if (!channel?.isTextBased() || channel.guildId !== state.guild.id) throw new Error('Configurez d’abord un salon de notifications sociales.');
        await channel.send(socialNotificationPayload({
          type: body.type,
          platform: String(body.platform || 'Réseaux sociaux').slice(0, 80),
          creator: String(body.creator || 'Créateur').slice(0, 100),
          title: String(body.title || '').slice(0, 250),
          url: body.url,
          roleId: config.roleId,
        }));
        return send(response, 200, { ok: true, message: `Notification publiée dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/social/sources') {
        const body = await readBody(request);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const current = state.config.social;
        if (!current?.channelId) throw new Error('Configurez d’abord le salon des notifications sociales.');
        const sources = Array.isArray(current.sources) ? current.sources : [];
        if (body.action === 'add') {
          const source = normalizeSocialSource({ platform: body.platform, identifier: body.identifier, label: body.label });
          if (sources.some((item) => item.id === source.id)) throw new Error('Cette source est déjà surveillée.');
          assertPremiumLimit(state.guild.id, 'socialSources', sources.length);
          if (sources.length >= 10) throw new Error('La limite technique actuelle est de 10 sources par serveur.');
          await setSocialConfig(state.guild.id, { ...current, sources: [...sources, source], updatedAt: new Date().toISOString() });
          return send(response, 200, { ok: true, message: `${source.label} sera surveillée automatiquement.` }, origin);
        }
        if (body.action === 'remove') {
          const filtered = sources.filter((source) => source.id !== body.sourceId);
          if (filtered.length === sources.length) throw new Error('Source sociale introuvable.');
          await setSocialConfig(state.guild.id, { ...current, sources: filtered, updatedAt: new Date().toISOString() });
          return send(response, 200, { ok: true, message: 'Source automatique supprimée.' }, origin);
        }
        throw new Error('Action sociale inconnue.');
      }
      if (request.method === 'POST' && url.pathname === '/api/messages/send') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new HttpError(400, 'Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        let channelId;
        try {
          channelId = validateId(body.channelId, new Set(state.options.textChannels.map((channel) => channel.id)), 'Salon de publication');
        } catch (error) {
          throw new HttpError(400, error.message);
        }
        if (!channelId) throw new HttpError(400, 'Choisissez un salon de publication.');
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== state.guild.id) {
          throw new HttpError(400, 'Le salon choisi ne permet pas à FyxBot de publier un message. Sélectionnez un salon textuel classique.');
        }
        let payload;
        try {
          payload = customMessagePayload({
            mode: body.mode,
            content: body.content,
            title: body.title,
            description: body.description,
            color: body.color,
            imageUrl: body.imageUrl,
            thumbnailUrl: body.thumbnailUrl,
            linkUrl: body.linkUrl,
            buttonLabel: body.buttonLabel,
            footer: body.footer,
            version: body.version,
            environment: body.environment,
          });
        } catch (error) {
          throw new HttpError(400, error.message);
        }
        const botPermissions = channel.permissionsFor(client.user);
        const missingPermissions = [
          [PermissionFlagsBits.ViewChannel, 'Voir le salon'],
          [PermissionFlagsBits.SendMessages, 'Envoyer des messages'],
          ...(payload.embeds?.length ? [[PermissionFlagsBits.EmbedLinks, 'Intégrer des liens']] : []),
        ].filter(([permission]) => !botPermissions?.has(permission)).map(([, label]) => label);
        if (missingPermissions.length) {
          throw new HttpError(403, `FyxBot ne peut pas publier dans ce salon. Permission(s) manquante(s) : ${missingPermissions.join(', ')}.`);
        }
        try {
          await channel.send(payload);
        } catch (error) {
          throw messagePublishError(error);
        }
        const guild = await client.guilds.fetch(state.guild.id);
        await logAction(guild, {
          title: body.mode === 'changelog' ? '📰 Changelog publié' : '✉️ Message personnalisé publié',
          description: `Publication dans ${channel} depuis le panel par **${session.user.username}**.`,
          color: 0xef4444,
        }).catch((error) => console.error('[FyxBot] Journalisation secondaire impossible après publication :', error.message));
        return send(response, 200, { ok: true, message: `Message publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/voice/setup') {
        const body = await readBody(request);
        if (body.confirmation !== 'CONFIGURER') throw new Error('Écrivez CONFIGURER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageChannels]);
        const categoryId = validateId(body.categoryId, new Set(state.options.categories.map((category) => category.id)), 'Catégorie vocale');
        if (!categoryId) throw new Error('Choisissez une catégorie.');
        const guild = await client.guilds.fetch(state.guild.id);
        const config = await setupTemporaryVoice(guild, {
          categoryId,
          hubName: String(body.hubName || '➕ Créer un salon').slice(0, 90),
          defaultLimit: Math.min(Math.max(Number(body.defaultLimit) || 0, 0), 99),
        });
        await logAction(guild, { title: '🔊 Vocaux temporaires configurés', description: `Générateur <#${config.hubChannelId}> configuré depuis le panel par **${session.user.username}**.`, color: 0x5865f2 });
        return send(response, 200, { ok: true, message: 'Générateur de salons vocaux temporaires configuré.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/tickets/publish') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new Error('Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const channel = await client.channels.fetch(body.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== state.guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new Error('Salon de publication invalide.');
        if (!state.options.categories.some((item) => item.id === body.categoryId) || !state.options.roles.some((item) => item.id === body.staffRoleId)) throw new Error('Catégorie ou rôle Support invalide.');
        assertPremiumLimit(state.guild.id, 'ticketPanels', state.config.tickets?.panels?.length || 0);
        const panelId = randomUUID().split('-')[0];
        const title = String(body.title || 'Assistance FyxBot').trim().slice(0, 80);
        const requestType = String(body.requestType || 'support').trim().slice(0, 80);
        const panel = { id: panelId, title, requestType, categoryId: body.categoryId, staffRoleId: body.staffRoleId, panelChannelId: channel.id, updatedAt: new Date().toISOString() };
        const embed = new EmbedBuilder().setColor(0xf97316).setTitle(`🎫 ${title}`).setDescription(`Vous souhaitez envoyer une demande **${requestType}** ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.`).setFooter({ text: 'FyxBot • Système de tickets' }).setTimestamp();
        const message = await channel.send({ embeds: [embed], components: createPanelComponents(panelId, `Ouvrir : ${requestType}`) });
        panel.messageId = message.id;
        const panels = [...(state.config.tickets?.panels || []), panel];
        await setTicketConfig(state.guild.id, { ...panel, panels, updatedAt: panel.updatedAt });
        return send(response, 200, { ok: true, message: `Panneau publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/tickets/update') {
        const body = await readBody(request);
        if (body.confirmation !== 'MODIFIER') throw new Error('Écrivez MODIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const panels = [...(state.config.tickets?.panels || [])];
        const index = panels.findIndex((panel) => panel.id === body.panelId);
        if (index < 0) throw new Error('Panneau introuvable.');
        const current = panels[index];
        const updated = { ...current, title: String(body.title || current.title).trim().slice(0, 80), requestType: String(body.requestType || current.requestType).trim().slice(0, 80), categoryId: body.categoryId, staffRoleId: body.staffRoleId, updatedAt: new Date().toISOString() };
        if (!state.options.categories.some((item) => item.id === updated.categoryId) || !state.options.roles.some((item) => item.id === updated.staffRoleId)) throw new Error('Catégorie ou rôle invalide.');
        if (updated.messageId && updated.panelChannelId) {
          const channel = await client.channels.fetch(updated.panelChannelId).catch(() => null);
          if (!channel?.isTextBased() || channel.guildId !== state.guild.id) throw new Error('Le salon Discord de ce panneau est invalide.');
          const message = await channel.messages.fetch(updated.messageId).catch(() => null);
          if (message) {
            const embed = new EmbedBuilder().setColor(0xf97316).setTitle(`🎫 ${updated.title}`).setDescription(`Vous souhaitez envoyer une demande **${updated.requestType}** ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.`).setFooter({ text: 'FyxBot • Système de tickets' }).setTimestamp();
            await message.edit({ embeds: [embed], components: createPanelComponents(updated.id, `Ouvrir : ${updated.requestType}`) });
          }
        }
        panels[index] = updated;
        await setTicketConfig(state.guild.id, { ...state.config.tickets, ...updated, panels, updatedAt: updated.updatedAt });
        return send(response, 200, { ok: true, message: `Panneau ${updated.title} modifié.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/roles/publish') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new Error('Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const channel = await client.channels.fetch(body.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new Error('Salon de publication invalide.');
        const roles = await validatedPanelRoles(guild, state, body.roleIds);
        assertPremiumLimit(state.guild.id, 'rolePanels', state.config.rolePanels.length);
        const panel = {
          id: randomUUID().split('-')[0],
          title: String(body.title || 'Choisissez vos rôles').trim().slice(0, 100),
          description: String(body.description || 'Cliquez sur un bouton pour ajouter ou retirer le rôle correspondant.').trim().slice(0, 1000),
          channelId: channel.id,
          roleIds: roles.map((role) => role.id),
          updatedAt: new Date().toISOString(),
        };
        const message = await channel.send(rolePanelPayload(panel, roles));
        panel.messageId = message.id;
        const panels = [...(state.config.rolePanels || []), panel];
        await setRolePanelConfig(guild.id, { panels, updatedAt: panel.updatedAt });
        await logAction(guild, { title: '🎭 Panneau de rôles publié', description: `Panneau **${panel.title}** publié dans ${channel} depuis le panel par **${session.user.username}**.`, color: 0xf97316 });
        return send(response, 200, { ok: true, message: `Panneau de rôles publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/roles/update') {
        const body = await readBody(request);
        if (body.confirmation !== 'MODIFIER') throw new Error('Écrivez MODIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const panels = [...(state.config.rolePanels || [])];
        const index = panels.findIndex((panel) => panel.id === body.panelId);
        if (index < 0) throw new Error('Panneau de rôles introuvable.');
        const current = panels[index];
        const roles = await validatedPanelRoles(guild, state, body.roleIds);
        const updated = {
          ...current,
          title: String(body.title || current.title).trim().slice(0, 100),
          description: String(body.description || current.description).trim().slice(0, 1000),
          roleIds: roles.map((role) => role.id),
          updatedAt: new Date().toISOString(),
        };
        const channel = await client.channels.fetch(updated.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new Error('Le salon Discord de ce panneau est invalide.');
        const message = await channel.messages.fetch(updated.messageId).catch(() => null);
        if (!message) throw new Error('Le message Discord de ce panneau est introuvable.');
        await message.edit(rolePanelPayload(updated, roles));
        panels[index] = updated;
        await setRolePanelConfig(guild.id, { panels, updatedAt: updated.updatedAt });
        await logAction(guild, { title: '🎭 Panneau de rôles modifié', description: `Panneau **${updated.title}** modifié depuis le panel par **${session.user.username}**.`, color: 0xf97316 });
        return send(response, 200, { ok: true, message: `Panneau ${updated.title} modifié.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/suggestions/review') {
        const body = await readBody(request);
        if (body.confirmation !== 'CONFIRMER') throw new Error('Écrivez CONFIRMER pour valider la décision.');
        if (!['accepted', 'rejected'].includes(body.status)) throw new Error('Décision inconnue.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        const guild = await client.guilds.fetch(state.guild.id);
        const suggestion = getSuggestion(guild.id, String(body.suggestionId || ''));
        if (!suggestion) throw new Error('Suggestion introuvable.');
        const channel = await client.channels.fetch(suggestion.channel_id).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new Error('Le salon Discord de cette suggestion est invalide.');
        const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
        if (!message) throw new Error('Le message Discord de cette suggestion est introuvable.');
        const accepted = body.status === 'accepted';
        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor(accepted ? 0x57f287 : 0xed4245)
          .setFooter({ text: `FyxBot • Suggestion ${accepted ? 'acceptée' : 'refusée'}` });
        await message.edit({ embeds: [embed] });
        reviewSuggestion(guild.id, suggestion.id, body.status, session.user.username);
        await logAction(guild, {
          title: accepted ? '✅ Suggestion acceptée' : '❌ Suggestion refusée',
          description: `Suggestion **${suggestion.id}** examinée depuis le panel par **${session.user.username}**.`,
          color: accepted ? 0x57f287 : 0xed4245,
        });
        return send(response, 200, { ok: true, message: `Suggestion ${accepted ? 'acceptée' : 'refusée'}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/setup') {
        const body = await readBody(request);
        const mode = ['design', 'complete', 'synchronize', 'reset'].includes(body.mode) ? body.mode : 'design';
        const destructive = mode === 'reset';
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, destructive ? [] : [PermissionFlagsBits.ManageGuild], { administratorOnly: destructive });
        const guild = await client.guilds.fetch(state.guild.id);
        if (mode === 'design') {
          const blueprint = buildAdaptiveBlueprint(body.description, { guildName: state.guild.name });
          saveServerSetupDraft(state.guild.id, blueprint);
          const analysis = await analyzeServerStructure(await guild.fetch(), {}, blueprint);
          return send(response, 200, {
            ok: true,
            blueprint,
            analysis,
            message: `Proposition générée : ${blueprint.roles.length} rôle(s), ${blueprint.categories.length} catégorie(s) et ${blueprint.channels.length} salon(s). Aucune modification Discord effectuée.`,
          }, origin);
        }
        const expected = mode === 'reset' ? 'TOUT SUPPRIMER' : mode === 'synchronize' ? 'SYNCHRONISER' : 'COMPLETER';
        if (body.confirmation !== expected) throw new Error(`Écrivez exactement ${expected} pour lancer la configuration.`);
        const blueprint = getServerSetupBlueprint(state.guild.id);
        if (!blueprint) throw new Error('Décrivez d’abord votre serveur et générez l’aperçu avant de lancer la configuration.');
        if (destructive) requireRecentAuthentication(session);
        const backupFile = destructive ? null : await backupServer(await guild.fetch());
        const result = destructive
          ? await resetServer(await guild.fetch(), { blueprint })
          : await setupServer(await guild.fetch(), { blueprint, synchronizePermissions: mode === 'synchronize' });
        return send(response, 200, {
          ok: true,
          created: result.created,
          updated: result.updated,
          analysis: result.analysis,
          message: `${destructive
            ? `Sauvegarde ${result.backupFile} créée. ${result.deletedChannels} salon(s) et ${result.deletedRoles} rôle(s) supprimés, puis structure FyxBot recréée.`
            : `${result.created} élément(s) créé(s) et ${result.updated} corrigé(s). Sauvegarde ${backupFile} créée.`}${result.limitedAdminRoles ? ' Les rôles de direction ont reçu les permissions de gestion disponibles, sans Administrateur.' : ''}`,
        }, origin);
      }
      return send(response, 404, { error: 'Route inconnue.' }, origin);
    } catch (error) {
      const publicError = panelErrorResponse(error);
      console.error(`[FyxBot] Erreur du panel (${publicError.status})${publicError.reference ? ` [${publicError.reference}]` : ''} :`, error.message);
      return send(response, publicError.status, { error: publicError.error }, origin);
    }
  });
  server.listen(PORT, HOST, () => console.log(`[FyxBot] API du panel reliée sur http://${HOST}:${PORT}.`));
  server.on('error', (error) => console.error('[FyxBot] Serveur du panel indisponible :', error));
  server.on('close', () => authCleanup.stop());
  return server;
}

module.exports = { buildAllowedOrigins, getDashboardState, isLoopbackHost, isRequestOriginAllowed, messagePublishError, panelErrorResponse, rateLimit, requireGuildCapability, requireRecentAuthentication, revalidateManageableGuildIds, startDashboardServer };
