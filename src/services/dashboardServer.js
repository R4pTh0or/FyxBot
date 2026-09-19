const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('./logger').logger.child({ component: 'dashboard-api' });
const { getLogConfig, setLogConfig } = require('../database/logStore');
const { getTicketConfig, setTicketConfig } = require('../database/ticketStore');
const { getSuggestionConfig, setSuggestionConfig } = require('../database/suggestionStore');
const { getWelcomeConfig, setWelcomeConfig } = require('../database/welcomeStore');
const {
  deleteServerSetupPreview,
  getServerSetupBlueprint,
  saveServerSetupDraft,
} = require('../database/serverSetupStore');
const { buildAdaptiveBlueprint } = require('./adaptiveServerBlueprint');
const { backupServer, restoreServer } = require('./serverBackup');
const { analyzeServerStructure, resetServer, setupServer } = require('./serverSetup');
const { buildSetupSimulation } = require('./setupSimulation');
const { buildContentLibrary } = require('./contentLibrary');
const {
  archiveContent,
  contentTrashSummary,
  getContentTrashItem,
  listContentTrash,
  removeContentTrashItem,
} = require('../database/contentTrashStore');
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
const {
  getChange,
  listChanges,
  markChangeRolledBack,
  recordChange,
} = require('../database/changeHistoryStore');
const { getRolePanelConfig, setRolePanelConfig } = require('../database/rolePanelStore');
const { ROLE_BUTTON_PREFIX } = require('./roleButtons');
const { getRecentSuggestions, getSuggestion, reviewSuggestion } = require('../database/suggestionRecordStore');
const { getCreatorStats } = require('../database/creatorStatsStore');
const { recordActivationProgress } = require('../database/activationStore');
const { getRulesConfig, setRulesConfig } = require('../database/rulesStore');
const { getBirthdayConfig, setBirthdayConfig } = require('../database/birthdayStore');
const { getSocialConfig, setSocialConfig } = require('../database/socialStore');
const { getTemporaryVoiceConfig } = require('../database/temporaryVoiceStore');
const { publishRules, updateRulesMessage } = require('./rules');
const { SUPPORTED_TIMEZONES } = require('./birthdays');
const { socialNotificationPayload } = require('./socialNotifications');
const { normalizeSocialSource, replaceSocialSource } = require('./socialAutomation');
const { twitchOAuthStateGuildId } = require('../database/twitchStore');
const {
  completeTwitchAuthorization,
  disconnectTwitch,
  mutateTwitchCommand,
  publicTwitchStatus,
  startTwitchAuthorization,
  twitchDashboardError,
  twitchPanelReturnUrl,
  updateTwitchChatConfig,
} = require('./twitchDashboardService');
const { buildOnboardingProgress } = require('./onboardingProgress');
const { assertPremiumLimit, getGuildPremiumState } = require('./premiumPlans');
const { claimFounderAccess } = require('./premiumFounderAccess');
const { setupTemporaryVoice } = require('./temporaryVoice');
const { publicMessagePayload } = require('./customMessages');
const {
  createPublishedMessage,
  deletePublishedMessage,
  getPublishedMessage,
  listPublishedMessages,
  updatePublishedMessage,
} = require('../database/publishedMessageStore');
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
const {
  assignableRoleIssue,
  assignableRoleMessage,
  isSafeAssignableRole,
} = require('./safeAssignableRoles');

const PORT = Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3001);
const HOST = process.env.DASHBOARD_API_HOST?.trim()
  || (process.env.RAILWAY_ENVIRONMENT_ID ? '0.0.0.0' : '127.0.0.1');
const rateBuckets = new Map();
const activeRelease = currentRelease();

function buildAllowedOrigins() {
  const localDefaults = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000,http://127.0.0.1:3000';
  const configured = (process.env.DASHBOARD_ALLOWED_ORIGINS || localDefaults)
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const panelUrl = authSettings().panelUrl;
  try { configured.push(new URL(panelUrl).origin); } catch { /* Une URL invalide sera signalée par OAuth. */ }
  return new Set(configured.filter((origin) => /^https?:\/\/[^/]+$/i.test(origin)));
}
const allowedOrigins = buildAllowedOrigins();

function isRequestOriginAllowed(method, pathname, origin) {
  const isOAuthRedirect = method === 'GET'
    && (pathname === '/api/auth/login'
      || pathname === '/api/auth/callback'
      || pathname === '/api/twitch/auth/callback');
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

function contentDeleteError(error) {
  if (error instanceof HttpError) return error;
  const code = Number(error?.code);
  if (code === 50001) {
    return new HttpError(403, 'FyxBot ne peut pas voir le salon contenant ce message. Autorisez-lui la permission « Voir le salon » puis réessayez.');
  }
  if (code === 50013) {
    return new HttpError(403, 'FyxBot n’est pas autorisé à supprimer ce message. Autorisez-lui la permission « Gérer les messages » dans ce salon puis réessayez.');
  }
  return new HttpError(502, 'Discord n’a pas pu retirer ce contenu pour le moment. Réessayez dans quelques instants.');
}

function normalizeBotNickname(value) {
  const nickname = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (Array.from(nickname).length > 32) {
    throw new HttpError(400, 'Le surnom du bot ne peut pas dépasser 32 caractères.');
  }
  return nickname;
}

async function updateGuildBotNickname(guild, nickname, reason = 'Personnalisation FyxBot depuis le panel') {
  const member = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!member) throw new HttpError(503, 'FyxBot ne retrouve pas son profil sur ce serveur. Réessayez dans quelques instants.');
  if (!member.permissions.has(PermissionFlagsBits.ChangeNickname)) {
    throw new HttpError(403, 'FyxBot ne possède pas la permission « Changer de pseudo » sur ce serveur.');
  }
  const desired = normalizeBotNickname(nickname);
  const current = member.nickname || '';
  if (current === desired) return { changed: false, nickname: desired || null };
  try {
    await member.setNickname(desired || null, reason);
  } catch (error) {
    if (Number(error?.code) === 50013) {
      throw new HttpError(403, 'Discord refuse ce changement. Vérifiez la permission « Changer de pseudo » et la hiérarchie du rôle FyxBot.');
    }
    throw new HttpError(502, 'Discord n’a pas pu modifier le surnom de FyxBot pour le moment.');
  }
  return { changed: true, nickname: desired || null };
}

async function deleteTrackedDiscordMessage(client, guildId, channelId, messageId) {
  if (!channelId || !messageId) return false;
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    if (Number(error?.code) === 10003) return false;
    throw contentDeleteError(error);
  }
  if (!channel?.isTextBased() || channel.guildId !== guildId) {
    throw new HttpError(409, 'Le salon associé à ce contenu ne correspond plus au serveur sélectionné.');
  }
  let message;
  try {
    message = await channel.messages.fetch(messageId);
  } catch (error) {
    if (Number(error?.code) === 10008) return false;
    throw contentDeleteError(error);
  }
  if (!message) return false;
  if (message.author?.id !== client.user?.id) {
    throw new HttpError(409, 'FyxBot refuse de supprimer un message dont il n’est pas l’auteur.');
  }
  try {
    await message.delete();
  } catch (error) {
    throw contentDeleteError(error);
  }
  return true;
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
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    Vary: 'Origin, Sec-Fetch-Site',
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
}

function rateLimit(request, pathname) {
  const now = Date.now();
  const isSetup = pathname === '/api/setup'
    || pathname === '/api/setup/preview/delete'
    || pathname === '/api/history/rollback';
  const isOAuthFlow = pathname === '/api/auth/login'
    || pathname === '/api/auth/callback'
    || pathname === '/api/twitch/auth/start'
    || pathname === '/api/twitch/auth/callback';
  const windowMs = isSetup || isOAuthFlow ? 10 * 60_000 : 60_000;
  const limit = isSetup ? 3 : isOAuthFlow ? 20 : request.method === 'POST' ? 30 : 120;
  const forwardedAddress = process.env.DASHBOARD_TRUST_PROXY === 'true'
    ? String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
    : '';
  const address = String(forwardedAddress || request.socket.remoteAddress || 'unknown').slice(0, 128);
  const key = `${address}:${isSetup ? pathname : isOAuthFlow ? 'oauth' : request.method}`;
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

function sessionRateLimit(session, method, pathname) {
  if (!session?.user?.id) return null;
  const now = Date.now();
  const mutation = method === 'POST';
  const windowMs = 60_000;
  const limit = mutation ? 45 : 180;
  const key = `session:${session.user.id}:${mutation ? pathname : 'read'}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
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
  if (!allowedIds.has(value)) throw new HttpError(400, `${label} invalide.`);
  return value;
}

function setupCurrentSnapshot(guild, channels, roles) {
  const channelList = [...channels.values()].filter(Boolean);
  const categoryList = channelList.filter((channel) => channel.type === ChannelType.GuildCategory);
  const regularChannels = channelList.filter((channel) => channel.type !== ChannelType.GuildCategory);
  const roleList = [...roles.values()].filter((role) => role.id !== guild.id && !role.managed);
  return {
    roles: roleList.length,
    categories: categoryList.length,
    channels: regularChannels.length,
    resettable: {
      roles: roleList.filter((role) => role.editable).map((role) => role.name),
      categories: categoryList.filter((channel) => channel.deletable).map((channel) => channel.name),
      channels: regularChannels.filter((channel) => channel.deletable).map((channel) => channel.name),
    },
  };
}

async function getDashboardState(client, requestedGuildId = null, manageableGuildIds = null, requestingUserId = null) {
  const availableGuilds = [...client.guilds.cache.values()].filter((guild) => !manageableGuildIds || manageableGuildIds.includes(guild.id));
  if (requestedGuildId && manageableGuildIds && !manageableGuildIds.includes(requestedGuildId)) {
    throw new HttpError(403, 'Vous n’êtes pas autorisé à administrer ce serveur.');
  }
  const configuredGuildId = availableGuilds.some((guild) => guild.id === client.config.guildId) ? client.config.guildId : null;
  const guildId = requestedGuildId || configuredGuildId || availableGuilds[0]?.id;
  if (!guildId || !availableGuilds.some((guild) => guild.id === guildId)) throw new HttpError(403, 'FyxBot n’est pas installé sur un serveur que vous pouvez administrer.');
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
  const requestingMember = requestingUserId && requestingUserId !== fullGuild.ownerId
    ? fullGuild.members.cache.get(requestingUserId) || await fullGuild.members.fetch(requestingUserId).catch(() => null)
    : null;
  const assignableRoleList = roles
    .filter((role) => isSafeAssignableRole(fullGuild, role, {
      actorMember: requestingMember,
      actorIsOwner: !requestingUserId || requestingUserId === fullGuild.ownerId,
    }))
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }));
  const memberList = fullGuild.members.cache.filter((member) => !member.user.bot).map((member) => ({ id: member.id, name: member.displayName })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const openTickets = channels.filter((channel) => isTicketTopic(channel?.topic) && !channel.name.startsWith('ferme-')).size;
  const ticketPanels = ticketConfig?.panels || (ticketConfig ? [{ id: 'default', title: 'Assistance FyxBot', requestType: 'support', ...ticketConfig }] : []);
  const setupBlueprint = await getServerSetupBlueprint(fullGuild.id);
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
  await recordActivationProgress(fullGuild.id, onboarding);
  const setupSimulation = buildSetupSimulation({
    analysis: setupAnalysis,
    blueprint: setupBlueprint,
    current: setupCurrentSnapshot(fullGuild, channels, roles),
  });
  const channelNames = new Map(channels.filter(Boolean).map((channel) => [channel.id, channel.name]));
  const publishedMessages = await listPublishedMessages(fullGuild.id);
  const contentLibrary = buildContentLibrary({
    publishedMessages,
    config: dashboardConfig,
    channelNames,
  });
  const contentTrash = (await listContentTrash(fullGuild.id)).map(contentTrashSummary);
  const changeHistory = (await listChanges(fullGuild.id, 40)).map(({ backupFile, ...change }) => ({
    ...change,
    hasBackup: Boolean(backupFile),
  }));
  const botMember = fullGuild.members.me || await fullGuild.members.fetchMe().catch(() => null);
  return {
    guilds: availableGuilds.map((item) => ({ id: item.id, name: item.name, icon: item.iconURL() })),
    bot: { username: client.user.tag, online: client.isReady(), ping: Math.round(client.ws.ping) },
    guild: {
      id: fullGuild.id,
      name: fullGuild.name,
      members: fullGuild.memberCount,
      channels: channels.size,
      roles: roles.size,
      botNickname: botMember?.nickname || null,
      botDisplayName: botMember?.displayName || client.user.username,
    },
    publishedMessages,
    contentLibrary,
    contentTrash,
    changeHistory,
    metrics: {
      commands: client.commands.size,
      openTickets,
      securityRules,
    },
    recentLogs: await getRecentAuditLogs(fullGuild.id),
    recentSuggestions: await getRecentSuggestions(fullGuild.id),
    setupBlueprint,
    setupAnalysis,
    setupSimulation,
    onboarding,
    premium: await getGuildPremiumState(fullGuild.id, { userId: requestingUserId }),
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
      giveaways: await listGuildGiveaways(fullGuild.id),
    },
    options: { textChannels, voiceChannels, categories, roles: roleList, assignableRoles: assignableRoleList, members: memberList },
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
  return supportAccessForRole((await getSupportStaff(userId))?.role);
}

function assertAssignableRole(guild, role, access) {
  const issue = assignableRoleIssue(guild, role, {
    actorMember: access?.member || null,
    actorIsOwner: Boolean(access?.owner),
  });
  if (issue) throw new HttpError(409, assignableRoleMessage(issue, role));
  return role;
}

async function validatedPanelRoles(guild, state, roleIds, access) {
  const uniqueIds = [...new Set(Array.isArray(roleIds) ? roleIds.filter(Boolean) : [])];
  if (uniqueIds.length < 1 || uniqueIds.length > 5) throw new HttpError(400, 'Choisissez entre 1 et 5 rôles différents.');
  if (!uniqueIds.every((id) => state.options.roles.some((role) => role.id === id))) throw new HttpError(400, 'Un rôle sélectionné est invalide.');
  const roles = await Promise.all(uniqueIds.map((id) => guild.roles.fetch(id)));
  roles.forEach((role) => assertAssignableRole(guild, role, access));
  return roles;
}

async function updateConfiguration(client, section, body, manageableGuildIds, access) {
  const state = await getDashboardState(client, body.guildId, manageableGuildIds);
  const guildId = state.guild.id;
  const channelIds = new Set(state.options.textChannels.map((channel) => channel.id));
  const categoryIds = new Set(state.options.categories.map((channel) => channel.id));
  const roleIds = new Set(state.options.roles.map((role) => role.id));
  const now = new Date().toISOString();

  if (section === 'logs') {
    const channelId = validateId(body.channelId, channelIds, 'Salon de logs');
    if (!channelId) throw new HttpError(400, 'Choisissez un salon de logs.');
    await setLogConfig(guildId, { channelId, updatedAt: now });
  } else if (section === 'tickets') {
    const categoryId = validateId(body.categoryId, categoryIds, 'Catégorie de tickets');
    const staffRoleId = validateId(body.staffRoleId, roleIds, 'Rôle staff');
    if (!categoryId || !staffRoleId) throw new HttpError(400, 'Choisissez une catégorie et un rôle staff.');
    await setTicketConfig(guildId, { categoryId, staffRoleId, panelChannelId: state.config.tickets?.panelChannelId || null, updatedAt: now });
  } else if (section === 'suggestions') {
    const channelId = validateId(body.channelId, channelIds, 'Salon de suggestions');
    if (!channelId) throw new HttpError(400, 'Choisissez un salon de suggestions.');
    await setSuggestionConfig(guildId, { channelId, updatedAt: now });
  } else if (section === 'welcome') {
    const welcomeChannelId = validateId(body.welcomeChannelId, channelIds, 'Salon de bienvenue');
    const leaveChannelId = validateId(body.leaveChannelId, channelIds, 'Salon de départ') || welcomeChannelId;
    const autoRoleId = validateId(body.autoRoleId, roleIds, 'Rôle automatique');
    if (!welcomeChannelId) throw new HttpError(400, 'Choisissez un salon de bienvenue.');
    if (autoRoleId) {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(autoRoleId).catch(() => null);
      assertAssignableRole(guild, role, access);
    }
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
    if (!channelId || !timezone) throw new HttpError(400, 'Choisissez un salon et un fuseau horaire valides.');
    if (roleId) {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId).catch(() => null);
      assertAssignableRole(guild, role, access);
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
    if (!channelId) throw new HttpError(400, 'Choisissez un salon de notifications.');
    await setSocialConfig(guildId, { ...state.config.social, channelId, roleId, sources: state.config.social?.sources || [], updatedAt: now });
  } else {
    throw new HttpError(400, 'Section inconnue.');
  }
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end();
}

function asTwitchHttpError(error) {
  const safe = twitchDashboardError(error);
  return new HttpError(safe.status, safe.message);
}

async function requireTwitchGuildAccess(client, guildId, session, manageableGuildIds) {
  const normalizedGuildId = String(guildId || '').trim();
  if (!session?.user?.id) throw new HttpError(401, 'Connexion Discord requise pour gérer Twitch.');
  if (!/^\d{17,20}$/.test(normalizedGuildId)
    || !Array.isArray(manageableGuildIds)
    || !manageableGuildIds.includes(normalizedGuildId)) {
    throw new HttpError(403, 'Vous n’êtes pas autorisé à administrer ce serveur.');
  }
  await requireGuildCapability(client, normalizedGuildId, session, [PermissionFlagsBits.ManageGuild]);
  return normalizedGuildId;
}

function startDashboardServer(client, options = {}) {
  const serverPort = Number(options.port ?? PORT);
  const serverHost = String(options.host || HOST);
  const twitchDependencies = options.twitchDependencies || {};
  const authStore = options.authStore;
  const startupAuth = authSettings();
  if (startupAuth.allowUnauthenticatedLocal && !isLoopbackHost(serverHost)) {
    throw new Error('ALLOW_UNAUTHENTICATED_LOCAL exige une API limitée à localhost.');
  }
  const authCleanup = startDashboardAuthCleanup({ store: authStore });
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${serverPort}`);
    const requestOrigin = request.headers.origin || '';
    if (!['GET', 'POST', 'OPTIONS'].includes(request.method || '')) {
      return send(response, 405, { error: 'Méthode HTTP refusée.' }, 'null', { Allow: 'GET, POST, OPTIONS' });
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return send(response, 200, {
        ok: true,
        service: 'fyxbot-bot',
        discord: client.isReady() ? 'connected' : 'connecting',
        release: activeRelease,
      }, 'null');
    }
    if (!isRequestOriginAllowed(request.method, url.pathname, requestOrigin)) return send(response, 403, { error: 'Origine refusée.' }, 'null');
    const retryAfter = rateLimit(request, url.pathname);
    if (retryAfter) return send(response, 429, { error: 'Trop de requêtes. Réessayez dans quelques instants.' }, allowedOrigins.has(requestOrigin) ? requestOrigin : 'null', { 'Retry-After': String(retryAfter) });
    if (request.method === 'GET' && url.pathname === '/api/auth/login') {
      if (!authSettings().enabled) return send(response, 503, { error: 'La connexion Discord n’est pas configurée.' }, 'null');
      try { return await startLogin(response, authStore); } catch {
        return send(response, 503, { error: 'Connexion temporairement indisponible. Réessayez dans quelques instants.' }, 'null');
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/callback') {
      try { return await finishLogin(request, url, response, authStore); } catch (error) {
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
      const session = await getSession(request, authStore);
      const sessionRetryAfter = sessionRateLimit(session, request.method, url.pathname);
      if (sessionRetryAfter) {
        return send(response, 429, { error: 'Trop de requêtes pour cette session. Réessayez dans quelques instants.' }, origin, { 'Retry-After': String(sessionRetryAfter) });
      }
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
        return await logout(request, response, origin, authStore);
      }
      if (request.method === 'GET' && url.pathname === '/api/twitch/auth/callback' && auth.enabled && !session) {
        const returnUrl = new URL(twitchPanelReturnUrl('error', twitchOAuthStateGuildId(url.searchParams.get('state')), twitchDependencies.environment || process.env));
        returnUrl.searchParams.set('twitchError', 'DISCORD_LOGIN_REQUIRED');
        return redirect(response, returnUrl.toString());
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
      if (request.method === 'GET' && url.pathname === '/api/twitch/auth/callback') {
        const state = url.searchParams.get('state');
        const guildFromState = twitchOAuthStateGuildId(state);
        try {
          const guildId = await requireTwitchGuildAccess(client, guildFromState, session, manageableGuildIds);
          const result = await completeTwitchAuthorization({
            code: url.searchParams.get('code'),
            state,
            providerError: url.searchParams.get('error'),
            discordUserId: session.user.id,
          }, twitchDependencies);
          return redirect(response, result.redirectUrl);
        } catch (error) {
          const safe = error instanceof HttpError
            ? { code: error.status === 401 ? 'DISCORD_LOGIN_REQUIRED' : 'DISCORD_ACCESS_DENIED', status: error.status }
            : twitchDashboardError(error);
          const returnUrl = new URL(twitchPanelReturnUrl('error', guildFromState, twitchDependencies.environment || process.env));
          returnUrl.searchParams.set('twitchError', safe.code);
          logger.warn({ guildId: guildFromState, path: url.pathname, status: safe.status, code: safe.code }, '[FyxBot] Connexion OAuth Twitch refusée.');
          return redirect(response, returnUrl.toString());
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/twitch/status') {
        const guildId = await requireTwitchGuildAccess(client, url.searchParams.get('guildId'), session, manageableGuildIds);
        try {
          return send(response, 200, await publicTwitchStatus(guildId, twitchDependencies), origin);
        } catch (error) {
          throw asTwitchHttpError(error);
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/twitch/auth/start') {
        const guildId = await requireTwitchGuildAccess(client, url.searchParams.get('guildId'), session, manageableGuildIds);
        try {
          const result = await startTwitchAuthorization(guildId, session.user.id, twitchDependencies);
          return redirect(response, result.authorizationUrl);
        } catch (error) {
          throw asTwitchHttpError(error);
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/twitch/disconnect') {
        const body = await readBody(request);
        const guildId = await requireTwitchGuildAccess(client, body.guildId, session, manageableGuildIds);
        requireRecentAuthentication(session);
        if (body.confirmation !== 'DECONNECTER') throw new HttpError(400, 'Écrivez DECONNECTER pour confirmer.');
        try {
          const result = await disconnectTwitch(guildId, twitchDependencies);
          return send(response, 200, { ok: true, ...result }, origin);
        } catch (error) {
          throw asTwitchHttpError(error);
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/twitch/chat/config') {
        const body = await readBody(request);
        const guildId = await requireTwitchGuildAccess(client, body.guildId, session, manageableGuildIds);
        try {
          const result = await updateTwitchChatConfig(guildId, {
            enabled: body.enabled,
            prefix: body.prefix,
            protections: body.protections,
          }, twitchDependencies);
          return send(response, 200, { ok: true, ...result }, origin);
        } catch (error) {
          throw asTwitchHttpError(error);
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/twitch/commands') {
        const body = await readBody(request);
        const guildId = await requireTwitchGuildAccess(client, body.guildId, session, manageableGuildIds);
        try {
          const result = await mutateTwitchCommand(guildId, body, twitchDependencies);
          return send(response, 200, { ok: true, ...result }, origin);
        } catch (error) {
          throw asTwitchHttpError(error);
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const state = await getDashboardState(client, url.searchParams.get('guildId'), manageableGuildIds, session?.user?.id);
        state.creatorAccess = await isApplicationOwner(client, session?.user.id);
        return send(response, 200, state, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/bot/nickname') {
        const body = await readBody(request);
        requireRecentAuthentication(session);
        const desired = normalizeBotNickname(body.nickname);
        const expectedConfirmation = desired ? 'PERSONNALISER' : 'REINITIALISER';
        if (body.confirmation !== expectedConfirmation) {
          throw new HttpError(400, `Écrivez ${expectedConfirmation} pour confirmer.`);
        }
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const access = await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const result = await updateGuildBotNickname(
          access.guild,
          desired,
          `Personnalisation FyxBot demandée par ${session.user.username}`,
        );
        const displayName = result.nickname || client.user.username;
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'configuration',
          title: result.nickname ? 'Surnom FyxBot personnalisé' : 'Surnom FyxBot réinitialisé',
          summary: `Nom affiché : ${displayName}`,
          details: { target: 'Configuration', changed: result.changed },
        });
        await logAction(access.guild, {
          title: '🤖 Identité du bot mise à jour',
          description: `Le nom affiché de FyxBot est maintenant **${displayName.replaceAll('*', '')}**. Action réalisée depuis le panel par **${session.user.username}**.`,
          color: 0xf97316,
        }).catch((error) => logger.error({ err: error, guildId: state.guild.id }, '[FyxBot] Journalisation secondaire impossible après modification du surnom.'));
        return send(response, 200, {
          ok: true,
          nickname: result.nickname,
          message: result.nickname
            ? `FyxBot s’affiche maintenant sous le nom « ${result.nickname} » sur ce serveur.`
            : `Le nom affiché a été réinitialisé sur « ${client.user.username} » pour ce serveur.`,
        }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/premium/founder') {
        const body = await readBody(request);
        if (body.confirmation !== 'ACTIVER') throw new HttpError(400, 'Confirmez explicitement l’activation Premium.');
        const guildId = String(body.guildId || '');
        if (!manageableGuildIds.includes(guildId)) throw new HttpError(403, 'Vous n’êtes pas autorisé à administrer ce serveur.');
        const access = await requireGuildCapability(client, guildId, session, [PermissionFlagsBits.ManageGuild]);
        try {
          const founder = await claimFounderAccess(session.user.id, access.guild.id);
          const premium = await getGuildPremiumState(access.guild.id, { userId: session.user.id });
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
        return send(response, 200, await getCreatorStats(client.guilds.cache.values()), origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/support/staff') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        return send(response, 200, { staff: await listSupportStaff() }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/staff/upsert') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        const input = normalizeSupportStaffInput(await readBody(request));
        if (await isApplicationOwner(client, input.userId)) throw new HttpError(409, 'Le propriétaire possède déjà tous les droits Support.');
        const discordUser = await client.users.fetch(input.userId).catch(() => null);
        if (!discordUser || discordUser.bot) throw new HttpError(404, 'Utilisateur Discord introuvable ou non autorisé.');
        const member = await upsertSupportStaff({
          ...input,
          displayName: discordUser.globalName || discordUser.username,
          grantedBy: session.user.id,
        });
        return send(response, 200, { ok: true, member, staff: await listSupportStaff() }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/staff/remove') {
        if (!await isApplicationOwner(client, session?.user.id)) throw new HttpError(403, 'Gestion de l’équipe réservée au propriétaire de FyxBot.');
        const input = normalizeSupportStaffInput({ ...(await readBody(request)), role: 'moderator' });
        if (!await removeSupportStaff(input.userId)) throw new HttpError(404, 'Ce membre ne possède aucun droit Support.');
        return send(response, 200, { ok: true, staff: await listSupportStaff() }, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/support') {
        const access = await getSupportAccess(client, session?.user.id);
        const requestedGuildId = String(url.searchParams.get('guildId') || '').trim() || null;
        if (!access.canViewAll && requestedGuildId) {
          if (!manageableGuildIds.includes(requestedGuildId)) throw new HttpError(403, 'Vous n’êtes plus autorisé à administrer ce serveur.');
          await requireGuildCapability(client, requestedGuildId, session, [PermissionFlagsBits.ManageGuild]);
        }
        const storedRequests = await listSupportRequests({
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
        const conversation = await getSupportConversation(String(url.searchParams.get('id') || ''));
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
        if (await countOpenSupportRequests(session.user.id) >= 5) {
          throw new HttpError(409, 'Vous avez déjà cinq demandes actives. Terminez-en une avant d’en créer une autre.');
        }
        const input = normalizeSupportRequestInput(body);
        const created = await createSupportRequest({
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
        const conversation = await getSupportConversation(String(body.requestId || ''));
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
          await updateSupportRequest({
            requestId: conversation.request.id,
            status: 'open',
            priority: conversation.request.priority,
            actorId: session.user.id,
            actorName: session.user.username,
          });
        }
        await addSupportMessage({
          requestId: conversation.request.id,
          authorId: session.user.id,
          authorName: session.user.username,
          authorRole: access.canReplyAsStaff ? 'staff' : 'user',
          body: reply,
        });
        return send(response, 200, { ok: true, conversation: await getSupportConversation(conversation.request.id) }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/support/update') {
        const access = await getSupportAccess(client, session?.user.id);
        if (!access.canManageStatus) throw new HttpError(403, 'Gestion réservée à l’équipe Support FyxBot.');
        const body = await readBody(request);
        const current = await getSupportConversation(String(body.requestId || ''));
        if (!current) throw new HttpError(404, 'Demande de support introuvable.');
        const update = normalizeSupportUpdate(body);
        if (!access.canManagePriority && update.priority !== current.request.priority) {
          throw new HttpError(403, 'Seuls les administrateurs Support peuvent modifier la priorité.');
        }
        const updated = await updateSupportRequest({
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
        if (!state.options.members.some((member) => member.id === memberId)) throw new HttpError(404, 'Membre introuvable sur ce serveur.');
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
        const access = await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        await updateConfiguration(client, match[1], body, manageableGuildIds, access);
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'configuration',
          title: `Configuration ${match[1]}`,
          summary: `Le module ${match[1]} a été configuré depuis le panel.`,
          details: { section: match[1] },
        });
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
        if (!member || member.user.bot || member.id === guild.ownerId || member.id === session.user.id) throw new HttpError(409, 'Ce membre ne peut pas être modéré.');
        if (!actor.owner && member.roles.highest.comparePositionTo(actor.member.roles.highest) >= 0) {
          throw new HttpError(403, 'Vous ne pouvez pas modérer un membre placé au même niveau ou au-dessus de vous.');
        }
        if (!reason) throw new HttpError(400, 'Indiquez un motif précis.');
        const audit = `${reason} | Panel : ${session.user.username} (${session.user.id})`.slice(0, 512);
        if (body.action === 'warn') await addWarning({ guildId: guild.id, userId: member.id, moderatorId: session.user.id, reason });
        else if (body.action === 'timeout') { if (!member.moderatable) throw new HttpError(409, 'FyxBot ne peut pas exclure temporairement ce membre.'); await member.timeout(Math.min(Math.max(Number(body.duration) || 10, 1), 40320) * 60_000, audit); }
        else if (body.action === 'kick') { if (!member.kickable) throw new HttpError(409, 'FyxBot ne peut pas expulser ce membre.'); await member.kick(audit); }
        else if (body.action === 'ban') { if (!member.bannable) throw new HttpError(409, 'FyxBot ne peut pas bannir ce membre.'); await member.ban({ reason: audit }); }
        else throw new HttpError(400, 'Action de modération inconnue.');
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
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'security',
          title: body.enabled === false ? 'Sécurité désactivée' : 'Sécurité activée',
          summary: body.enabled === false ? 'Les protections FyxBot ont été désactivées.' : 'Les quatre protections FyxBot ont été activées.',
          details: { enabled: body.enabled !== false },
        });
        return send(response, 200, { ok: true, message: body.enabled === false ? 'Protections FyxBot désactivées.' : '4 protections FyxBot activées.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/rules/publish') {
        const body = await readBody(request);
        const updating = body.mode === 'update';
        const expected = updating ? 'MODIFIER' : 'PUBLIER';
        if (body.confirmation !== expected) throw new HttpError(400, `Écrivez ${expected} pour confirmer.`);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const access = await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const title = String(body.title || 'Règlement du serveur').trim().slice(0, 100);
        const content = String(body.content || '').trim().slice(0, 3900);
        if (content.length < 20) throw new HttpError(400, 'Le règlement doit contenir au moins 20 caractères.');
        const roleId = validateId(body.verifiedRoleId, new Set(state.options.roles.map((role) => role.id)), 'Rôle de validation');
        if (roleId) {
          const role = await guild.roles.fetch(roleId);
          assertAssignableRole(guild, role, access);
        }
        if (updating) {
          if (!state.config.rules?.messageId) throw new HttpError(404, 'Aucun règlement publié à modifier.');
          await updateRulesMessage(guild, { ...state.config.rules, title, content, verifiedRoleId: roleId });
        } else {
          const channel = await client.channels.fetch(body.channelId).catch(() => null);
          if (!channel?.isTextBased() || channel.guildId !== guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new HttpError(409, 'Salon de publication invalide.');
          await publishRules(guild, channel, { title, content, verifiedRoleId: roleId });
        }
        await logAction(guild, { title: updating ? '📜 Règlement modifié' : '📜 Règlement publié', description: `Action réalisée depuis le panel par **${session.user.username}**.`, color: 0xf97316 });
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'content',
          title: updating ? 'Règlement modifié' : 'Règlement publié',
          summary: `Le règlement « ${title} » a été ${updating ? 'mis à jour' : 'publié'}.`,
          details: { target: 'Règlement' },
        });
        return send(response, 200, { ok: true, message: updating ? 'Règlement mis à jour.' : 'Règlement publié.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/community/event') {
        const body = await readBody(request);
        if (body.confirmation !== 'PROGRAMMER') throw new HttpError(400, 'Écrivez PROGRAMMER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.CreateEvents]);
        const type = body.type === 'voice' ? 'voice' : 'external';
        const channelId = type === 'voice'
          ? validateId(body.channelId, new Set(state.options.voiceChannels.map((channel) => channel.id)), 'Salon vocal')
          : null;
        if (type === 'voice' && !channelId) throw new HttpError(400, 'Choisissez un salon vocal ou une scène.');
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
        if (body.confirmation !== 'PUBLIER') throw new HttpError(400, 'Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        const channelId = validateId(body.channelId, new Set(state.options.textChannels.map((channel) => channel.id)), 'Salon du concours');
        if (!channelId) throw new HttpError(400, 'Choisissez un salon pour le concours.');
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
        if (body.confirmation !== 'NOTIFIER') throw new HttpError(400, 'Écrivez NOTIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        if (!['live', 'video'].includes(body.type)) throw new HttpError(400, 'Type de notification invalide.');
        const config = state.config.social;
        const channel = config?.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
        if (!channel?.isTextBased() || channel.guildId !== state.guild.id) throw new HttpError(409, 'Configurez d’abord un salon de notifications sociales.');
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
        if (!current?.channelId) throw new HttpError(409, 'Configurez d’abord le salon des notifications sociales.');
        const sources = Array.isArray(current.sources) ? current.sources : [];
        if (body.action === 'add') {
          const source = normalizeSocialSource({ platform: body.platform, identifier: body.identifier, label: body.label });
          if (sources.some((item) => item.id === source.id)) throw new HttpError(409, 'Cette source est déjà surveillée.');
          await assertPremiumLimit(state.guild.id, 'socialSources', sources.length);
          if (sources.length >= 10) throw new HttpError(409, 'La limite technique actuelle est de 10 sources par serveur.');
          await setSocialConfig(state.guild.id, { ...current, sources: [...sources, source], updatedAt: new Date().toISOString() });
          return send(response, 200, { ok: true, message: `${source.label} sera surveillée automatiquement.` }, origin);
        }
        if (body.action === 'remove') {
          const filtered = sources.filter((source) => source.id !== body.sourceId);
          if (filtered.length === sources.length) throw new HttpError(404, 'Source sociale introuvable.');
          await setSocialConfig(state.guild.id, { ...current, sources: filtered, updatedAt: new Date().toISOString() });
          return send(response, 200, { ok: true, message: 'Source automatique supprimée.' }, origin);
        }
        if (body.action === 'update') {
          const result = replaceSocialSource(sources, body.sourceId, {
            platform: body.platform,
            identifier: body.identifier,
            label: body.label,
          });
          const updatedAt = new Date().toISOString();
          await setSocialConfig(state.guild.id, { ...current, sources: result.sources, updatedAt });
          await recordChange(state.guild.id, {
            actorId: session.user.id,
            actorName: session.user.username,
            kind: 'content',
            title: 'Source sociale modifiée',
            summary: `${result.source.label} · ${result.source.platform === 'twitch' ? 'Twitch' : 'YouTube'}`,
            details: { target: 'Social', sourceId: result.source.id, identityChanged: result.identityChanged },
          });
          return send(response, 200, { ok: true, message: `${result.source.label} a été mise à jour.` }, origin);
        }
        throw new HttpError(400, 'Action sociale inconnue.');
      }
      if (request.method === 'POST' && url.pathname === '/api/content/delete') {
        const body = await readBody(request);
        if (body.confirmation !== 'SUPPRIMER') throw new HttpError(400, 'Écrivez SUPPRIMER pour confirmer.');
        requireRecentAuthentication(session);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const item = state.contentLibrary.find((candidate) => candidate.id === body.itemId);
        if (!item || !item.removable) throw new HttpError(404, 'Contenu supprimable introuvable. Rechargez le panel.');
        await requireGuildCapability(client, state.guild.id, session, [
          item.kind === 'message' ? PermissionFlagsBits.ManageMessages : PermissionFlagsBits.ManageGuild,
        ]);

        let snapshot;
        if (item.kind === 'message') {
          const publication = await getPublishedMessage(state.guild.id, item.publicationId);
          if (!publication) throw new HttpError(404, 'Message publié introuvable. Rechargez le panel.');
          snapshot = publication;
        } else if (item.kind === 'rules') {
          const rules = state.config.rules;
          if (!rules) throw new HttpError(404, 'Règlement introuvable.');
          snapshot = rules;
        } else if (item.kind === 'ticket') {
          const panels = [...(state.config.tickets?.panels || [])];
          const panel = panels.find((candidate) => candidate.id === item.entityId);
          if (!panel) throw new HttpError(404, 'Panneau de tickets introuvable.');
          snapshot = panel;
        } else if (item.kind === 'role') {
          const panels = [...(state.config.rolePanels || [])];
          const panel = panels.find((candidate) => candidate.id === item.entityId);
          if (!panel) throw new HttpError(404, 'Panneau de rôles introuvable.');
          snapshot = panel;
        } else if (item.kind === 'social') {
          const current = state.config.social;
          const sources = [...(current?.sources || [])];
          snapshot = sources.find((source) => source.id === item.entityId);
          if (!snapshot) throw new HttpError(404, 'Source sociale introuvable.');
        } else {
          throw new HttpError(409, 'Ce contenu doit être désactivé depuis son module.');
        }

        const archived = await archiveContent(state.guild.id, {
          kind: item.kind,
          title: item.title,
          target: item.target,
          snapshot,
        });
        let discordMessageDeleted = false;
        if (item.kind === 'message') {
          discordMessageDeleted = await deleteTrackedDiscordMessage(client, state.guild.id, snapshot.channelId, snapshot.messageId);
          await deletePublishedMessage(state.guild.id, snapshot.id);
        } else if (item.kind === 'rules') {
          discordMessageDeleted = await deleteTrackedDiscordMessage(client, state.guild.id, snapshot.channelId, snapshot.messageId);
          await setRulesConfig(state.guild.id, null);
        } else if (item.kind === 'ticket') {
          discordMessageDeleted = await deleteTrackedDiscordMessage(client, state.guild.id, snapshot.panelChannelId, snapshot.messageId);
          await setTicketConfig(state.guild.id, {
            ...state.config.tickets,
            panels: [...(state.config.tickets?.panels || [])].filter((candidate) => candidate.id !== snapshot.id),
            updatedAt: new Date().toISOString(),
          });
        } else if (item.kind === 'role') {
          discordMessageDeleted = await deleteTrackedDiscordMessage(client, state.guild.id, snapshot.channelId, snapshot.messageId);
          await setRolePanelConfig(state.guild.id, {
            panels: [...(state.config.rolePanels || [])].filter((candidate) => candidate.id !== snapshot.id),
            updatedAt: new Date().toISOString(),
          });
        } else if (item.kind === 'social') {
          const current = state.config.social;
          await setSocialConfig(state.guild.id, {
            ...current,
            sources: [...(current?.sources || [])].filter((source) => source.id !== snapshot.id),
            updatedAt: new Date().toISOString(),
          });
        }

        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'content',
          title: 'Contenu retiré',
          summary: item.title,
          details: { target: item.target, itemId: item.id, trashId: archived.id, discordMessageDeleted },
        });
        const suffix = discordMessageDeleted
          ? ' Le message Discord associé a également été supprimé.'
          : item.kind === 'social' ? '' : ' Le message Discord associé était déjà absent.';
        return send(response, 200, { ok: true, message: `${item.title} a été placé dans la corbeille pendant 30 jours.${suffix}` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/content/restore') {
        const body = await readBody(request);
        if (body.confirmation !== 'RESTAURER') throw new HttpError(400, 'Écrivez RESTAURER pour confirmer.');
        requireRecentAuthentication(session);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const archived = await getContentTrashItem(state.guild.id, body.trashId);
        if (!archived) throw new HttpError(404, 'Ce contenu a expiré ou a déjà été restauré. Rechargez le panel.');
        const access = await requireGuildCapability(client, state.guild.id, session, [
          archived.kind === 'message' ? PermissionFlagsBits.ManageMessages : PermissionFlagsBits.ManageGuild,
        ]);
        const guild = await client.guilds.fetch(state.guild.id);
        const snapshot = archived.snapshot;
        const fetchTextChannel = async (channelId) => {
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (!channel?.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== state.guild.id) {
            throw new HttpError(409, 'Le salon Discord d’origine n’existe plus ou ne permet plus de publier.');
          }
          return channel;
        };

        let restoredLocation = '';
        if (archived.kind === 'message') {
          const channel = await fetchTextChannel(snapshot.channelId);
          let payload;
          try {
            payload = publicMessagePayload(snapshot);
          } catch (error) {
            throw new HttpError(400, `Le message archivé ne peut plus être publié : ${error.message}`);
          }
          let message;
          try {
            message = await channel.send(payload);
          } catch (error) {
            throw messagePublishError(error);
          }
          await createPublishedMessage(state.guild.id, {
            ...snapshot,
            messageId: message.id,
            channelId: channel.id,
            channelName: channel.name,
          });
          restoredLocation = ` dans #${channel.name}`;
        } else if (archived.kind === 'rules') {
          if (state.config.rules) throw new HttpError(409, 'Un règlement actif existe déjà. Retirez-le avant de restaurer celui-ci.');
          const channel = await fetchTextChannel(snapshot.channelId);
          if (snapshot.verifiedRoleId) {
            const role = await guild.roles.fetch(snapshot.verifiedRoleId).catch(() => null);
            assertAssignableRole(guild, role, access);
          }
          try {
            await publishRules(guild, channel, {
              title: snapshot.title,
              content: snapshot.content,
              verifiedRoleId: snapshot.verifiedRoleId || null,
            });
          } catch (error) {
            throw messagePublishError(error);
          }
          restoredLocation = ` dans #${channel.name}`;
        } else if (archived.kind === 'ticket') {
          if ([...(state.config.tickets?.panels || [])].some((panel) => panel.id === snapshot.id)) {
            throw new HttpError(409, 'Ce panneau de tickets est déjà actif.');
          }
          const channel = await fetchTextChannel(snapshot.panelChannelId);
          const panel = {
            ...snapshot,
            updatedAt: new Date().toISOString(),
          };
          const embed = new EmbedBuilder().setColor(0xf97316).setTitle(`🎫 ${panel.title}`).setDescription(`Vous souhaitez envoyer une demande **${panel.requestType || 'support'}** ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.`).setFooter({ text: 'FyxBot • Système de tickets' }).setTimestamp();
          let message;
          try {
            message = await channel.send({ embeds: [embed], components: createPanelComponents(panel.id, `Ouvrir : ${panel.requestType || 'support'}`) });
          } catch (error) {
            throw messagePublishError(error);
          }
          panel.messageId = message.id;
          await setTicketConfig(state.guild.id, {
            ...(state.config.tickets || { categoryId: panel.categoryId, staffRoleId: panel.staffRoleId }),
            panels: [...(state.config.tickets?.panels || []), panel],
            updatedAt: panel.updatedAt,
          });
          restoredLocation = ` dans #${channel.name}`;
        } else if (archived.kind === 'role') {
          if ([...(state.config.rolePanels || [])].some((panel) => panel.id === snapshot.id)) {
            throw new HttpError(409, 'Ce panneau de rôles est déjà actif.');
          }
          const channel = await fetchTextChannel(snapshot.channelId);
          const roles = await validatedPanelRoles(guild, state, snapshot.roleIds, access);
          const panel = { ...snapshot, updatedAt: new Date().toISOString() };
          let message;
          try {
            message = await channel.send(rolePanelPayload(panel, roles));
          } catch (error) {
            throw messagePublishError(error);
          }
          panel.messageId = message.id;
          await setRolePanelConfig(state.guild.id, {
            panels: [...(state.config.rolePanels || []), panel],
            updatedAt: panel.updatedAt,
          });
          restoredLocation = ` dans #${channel.name}`;
        } else if (archived.kind === 'social') {
          const current = state.config.social;
          if (!current?.channelId) throw new HttpError(409, 'Configurez d’abord le salon des notifications sociales.');
          if ([...(current.sources || [])].some((source) => source.id === snapshot.id)) {
            throw new HttpError(409, 'Cette source sociale est déjà active.');
          }
          await setSocialConfig(state.guild.id, {
            ...current,
            sources: [...(current.sources || []), { ...snapshot, updatedAt: new Date().toISOString() }],
            updatedAt: new Date().toISOString(),
          });
        } else {
          throw new HttpError(409, 'Ce type de contenu ne peut pas être restauré.');
        }

        await removeContentTrashItem(state.guild.id, archived.id);
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'content',
          title: 'Contenu restauré',
          summary: archived.title,
          details: { target: archived.target, trashId: archived.id },
        });
        return send(response, 200, { ok: true, message: `${archived.title} a été restauré${restoredLocation}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/messages/send') {
        const body = await readBody(request);
        const editing = Boolean(body.publicationId);
        const expectedConfirmation = editing ? 'MODIFIER' : 'PUBLIER';
        if (body.confirmation !== expectedConfirmation) throw new HttpError(400, `Écrivez ${expectedConfirmation} pour confirmer.`);
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        const existingPublication = editing ? await getPublishedMessage(state.guild.id, body.publicationId) : null;
        if (editing && !existingPublication) throw new HttpError(404, 'Message publié introuvable. Rechargez le panel.');
        let channelId;
        try {
          channelId = existingPublication?.channelId
            || validateId(body.channelId, new Set(state.options.textChannels.map((channel) => channel.id)), 'Salon de publication');
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
          payload = publicMessagePayload({
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
          ...(editing ? [[PermissionFlagsBits.ReadMessageHistory, 'Voir l’historique des messages']] : []),
        ].filter(([permission]) => !botPermissions?.has(permission)).map(([, label]) => label);
        if (missingPermissions.length) {
          throw new HttpError(403, `FyxBot ne peut pas publier dans ce salon. Permission(s) manquante(s) : ${missingPermissions.join(', ')}.`);
        }
        let publication;
        try {
          if (editing) {
            const message = await channel.messages.fetch(existingPublication.messageId);
            if (message.author.id !== client.user.id) throw new HttpError(403, 'FyxBot ne peut modifier que ses propres messages.');
            await message.edit({
              ...payload,
              content: payload.content || null,
              embeds: payload.embeds || [],
              components: payload.components || [],
            });
            publication = await updatePublishedMessage(state.guild.id, existingPublication.id, body);
          } else {
            const message = await channel.send(payload);
            publication = await createPublishedMessage(state.guild.id, {
              ...body,
              messageId: message.id,
              channelId: channel.id,
              channelName: channel.name,
            });
          }
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw messagePublishError(error);
        }
        const guild = await client.guilds.fetch(state.guild.id);
        await logAction(guild, {
          title: editing ? '✏️ Message personnalisé modifié' : '✉️ Message personnalisé publié',
          description: `${editing ? 'Modification' : 'Publication'} dans ${channel} depuis le panel par **${session.user.username}**.`,
          color: 0xef4444,
        }).catch((error) => logger.error({ err: error, guildId: state.guild.id }, '[FyxBot] Journalisation secondaire impossible après publication.'));
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'content',
          title: editing ? 'Message personnalisé modifié' : 'Message personnalisé publié',
          summary: `${publication.title || publication.content?.slice(0, 80) || 'Message'} · #${channel.name}`,
          details: { target: 'Messages', publicationId: publication.id, channelId: channel.id },
        });
        return send(response, 200, {
          ok: true,
          publication,
          message: editing ? `Message modifié dans #${channel.name}.` : `Message publié dans #${channel.name}.`,
        }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/voice/setup') {
        const body = await readBody(request);
        if (body.confirmation !== 'CONFIGURER') throw new HttpError(400, 'Écrivez CONFIGURER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageChannels]);
        const categoryId = validateId(body.categoryId, new Set(state.options.categories.map((category) => category.id)), 'Catégorie vocale');
        if (!categoryId) throw new HttpError(400, 'Choisissez une catégorie.');
        const guild = await client.guilds.fetch(state.guild.id);
        const config = await setupTemporaryVoice(guild, {
          categoryId,
          hubName: String(body.hubName || '➕ Créer un salon').slice(0, 90),
          defaultLimit: Math.min(Math.max(Number(body.defaultLimit) || 0, 0), 99),
        });
        await logAction(guild, { title: '🔊 Vocaux temporaires configurés', description: `Générateur <#${config.hubChannelId}> configuré depuis le panel par **${session.user.username}**.`, color: 0x5865f2 });
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'configuration',
          title: 'Vocaux temporaires configurés',
          summary: `Le générateur ${config.hubName || 'vocal'} a été configuré.`,
          details: { target: 'Vocaux', hubChannelId: config.hubChannelId },
        });
        return send(response, 200, { ok: true, message: 'Générateur de salons vocaux temporaires configuré.' }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/tickets/publish') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new HttpError(400, 'Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const channel = await client.channels.fetch(body.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== state.guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new HttpError(400, 'Salon de publication invalide.');
        if (!state.options.categories.some((item) => item.id === body.categoryId) || !state.options.roles.some((item) => item.id === body.staffRoleId)) throw new HttpError(400, 'Catégorie ou rôle Support invalide.');
        await assertPremiumLimit(state.guild.id, 'ticketPanels', state.config.tickets?.panels?.length || 0);
        const panelId = randomUUID().split('-')[0];
        const title = String(body.title || 'Assistance FyxBot').trim().slice(0, 80);
        const requestType = String(body.requestType || 'support').trim().slice(0, 80);
        const panel = { id: panelId, title, requestType, categoryId: body.categoryId, staffRoleId: body.staffRoleId, panelChannelId: channel.id, updatedAt: new Date().toISOString() };
        const embed = new EmbedBuilder().setColor(0xf97316).setTitle(`🎫 ${title}`).setDescription(`Vous souhaitez envoyer une demande **${requestType}** ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.`).setFooter({ text: 'FyxBot • Système de tickets' }).setTimestamp();
        const message = await channel.send({ embeds: [embed], components: createPanelComponents(panelId, `Ouvrir : ${requestType}`) });
        panel.messageId = message.id;
        const panels = [...(state.config.tickets?.panels || []), panel];
        await setTicketConfig(state.guild.id, { ...panel, panels, updatedAt: panel.updatedAt });
        await recordChange(state.guild.id, {
          actorId: session.user.id, actorName: session.user.username, kind: 'content',
          title: 'Panneau de tickets publié', summary: `${panel.title} · #${channel.name}`,
          details: { target: 'Tickets', panelId: panel.id },
        });
        return send(response, 200, { ok: true, message: `Panneau publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/tickets/update') {
        const body = await readBody(request);
        if (body.confirmation !== 'MODIFIER') throw new HttpError(400, 'Écrivez MODIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const panels = [...(state.config.tickets?.panels || [])];
        const index = panels.findIndex((panel) => panel.id === body.panelId);
        if (index < 0) throw new HttpError(404, 'Panneau introuvable.');
        const current = panels[index];
        const updated = { ...current, title: String(body.title || current.title).trim().slice(0, 80), requestType: String(body.requestType || current.requestType).trim().slice(0, 80), categoryId: body.categoryId, staffRoleId: body.staffRoleId, updatedAt: new Date().toISOString() };
        if (!state.options.categories.some((item) => item.id === updated.categoryId) || !state.options.roles.some((item) => item.id === updated.staffRoleId)) throw new HttpError(400, 'Catégorie ou rôle invalide.');
        if (updated.messageId && updated.panelChannelId) {
          const channel = await client.channels.fetch(updated.panelChannelId).catch(() => null);
          if (!channel?.isTextBased() || channel.guildId !== state.guild.id) throw new HttpError(409, 'Le salon Discord de ce panneau est invalide.');
          const message = await channel.messages.fetch(updated.messageId).catch(() => null);
          if (message) {
            const embed = new EmbedBuilder().setColor(0xf97316).setTitle(`🎫 ${updated.title}`).setDescription(`Vous souhaitez envoyer une demande **${updated.requestType}** ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.`).setFooter({ text: 'FyxBot • Système de tickets' }).setTimestamp();
            await message.edit({ embeds: [embed], components: createPanelComponents(updated.id, `Ouvrir : ${updated.requestType}`) });
          }
        }
        panels[index] = updated;
        await setTicketConfig(state.guild.id, { ...state.config.tickets, ...updated, panels, updatedAt: updated.updatedAt });
        await recordChange(state.guild.id, {
          actorId: session.user.id, actorName: session.user.username, kind: 'content',
          title: 'Panneau de tickets modifié', summary: updated.title,
          details: { target: 'Tickets', panelId: updated.id },
        });
        return send(response, 200, { ok: true, message: `Panneau ${updated.title} modifié.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/roles/publish') {
        const body = await readBody(request);
        if (body.confirmation !== 'PUBLIER') throw new HttpError(400, 'Écrivez PUBLIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const access = await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const channel = await client.channels.fetch(body.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id || !state.options.textChannels.some((item) => item.id === channel.id)) throw new HttpError(400, 'Salon de publication invalide.');
        const roles = await validatedPanelRoles(guild, state, body.roleIds, access);
        await assertPremiumLimit(state.guild.id, 'rolePanels', state.config.rolePanels.length);
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
        await recordChange(state.guild.id, {
          actorId: session.user.id, actorName: session.user.username, kind: 'content',
          title: 'Panneau de rôles publié', summary: `${panel.title} · #${channel.name}`,
          details: { target: 'Rôles', panelId: panel.id },
        });
        return send(response, 200, { ok: true, message: `Panneau de rôles publié dans #${channel.name}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/roles/update') {
        const body = await readBody(request);
        if (body.confirmation !== 'MODIFIER') throw new HttpError(400, 'Écrivez MODIFIER pour confirmer.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        const access = await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const guild = await client.guilds.fetch(state.guild.id);
        const panels = [...(state.config.rolePanels || [])];
        const index = panels.findIndex((panel) => panel.id === body.panelId);
        if (index < 0) throw new HttpError(404, 'Panneau de rôles introuvable.');
        const current = panels[index];
        const roles = await validatedPanelRoles(guild, state, body.roleIds, access);
        const updated = {
          ...current,
          title: String(body.title || current.title).trim().slice(0, 100),
          description: String(body.description || current.description).trim().slice(0, 1000),
          roleIds: roles.map((role) => role.id),
          updatedAt: new Date().toISOString(),
        };
        const channel = await client.channels.fetch(updated.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new HttpError(409, 'Le salon Discord de ce panneau est invalide.');
        const message = await channel.messages.fetch(updated.messageId).catch(() => null);
        if (!message) throw new HttpError(404, 'Le message Discord de ce panneau est introuvable.');
        await message.edit(rolePanelPayload(updated, roles));
        panels[index] = updated;
        await setRolePanelConfig(guild.id, { panels, updatedAt: updated.updatedAt });
        await logAction(guild, { title: '🎭 Panneau de rôles modifié', description: `Panneau **${updated.title}** modifié depuis le panel par **${session.user.username}**.`, color: 0xf97316 });
        await recordChange(state.guild.id, {
          actorId: session.user.id, actorName: session.user.username, kind: 'content',
          title: 'Panneau de rôles modifié', summary: updated.title,
          details: { target: 'Rôles', panelId: updated.id },
        });
        return send(response, 200, { ok: true, message: `Panneau ${updated.title} modifié.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/suggestions/review') {
        const body = await readBody(request);
        if (body.confirmation !== 'CONFIRMER') throw new HttpError(400, 'Écrivez CONFIRMER pour valider la décision.');
        if (!['accepted', 'rejected'].includes(body.status)) throw new HttpError(400, 'Décision inconnue.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageMessages]);
        const guild = await client.guilds.fetch(state.guild.id);
        const suggestion = await getSuggestion(guild.id, String(body.suggestionId || ''));
        if (!suggestion) throw new HttpError(404, 'Suggestion introuvable.');
        const channel = await client.channels.fetch(suggestion.channel_id).catch(() => null);
        if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new HttpError(409, 'Le salon Discord de cette suggestion est invalide.');
        const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
        if (!message) throw new HttpError(404, 'Le message Discord de cette suggestion est introuvable.');
        const accepted = body.status === 'accepted';
        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor(accepted ? 0x57f287 : 0xed4245)
          .setFooter({ text: `FyxBot • Suggestion ${accepted ? 'acceptée' : 'refusée'}` });
        await message.edit({ embeds: [embed] });
        await reviewSuggestion(guild.id, suggestion.id, body.status, session.user.username);
        await logAction(guild, {
          title: accepted ? '✅ Suggestion acceptée' : '❌ Suggestion refusée',
          description: `Suggestion **${suggestion.id}** examinée depuis le panel par **${session.user.username}**.`,
          color: accepted ? 0x57f287 : 0xed4245,
        });
        return send(response, 200, { ok: true, message: `Suggestion ${accepted ? 'acceptée' : 'refusée'}.` }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/history/rollback') {
        const body = await readBody(request);
        if (body.confirmation !== 'RESTAURER') throw new HttpError(400, 'Écrivez RESTAURER pour confirmer le retour arrière.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [], { administratorOnly: true });
        requireRecentAuthentication(session);
        const target = await getChange(state.guild.id, String(body.changeId || ''));
        if (!target) throw new HttpError(404, 'Modification introuvable dans l’historique.');
        if (!target.reversible || !target.backupFile) throw new HttpError(409, 'Cette modification ne possède pas de sauvegarde restaurable.');
        if (target.status !== 'applied') throw new HttpError(409, 'Cette modification a déjà fait l’objet d’un retour arrière.');
        const guild = await client.guilds.fetch(state.guild.id);
        const fullGuild = await guild.fetch();
        const botMember = await fullGuild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.Administrator)) {
          throw new HttpError(409, 'Pour restaurer une structure contenant des salons privés, accordez temporairement Administrateur au rôle FyxBot. Retirez-la immédiatement après la restauration.');
        }
        const result = await restoreServer(fullGuild, target.backupFile);
        await markChangeRolledBack(state.guild.id, target.id, session.user.username);
        const rollbackChange = await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'rollback',
          title: `Retour arrière : ${target.title}`,
          summary: `L’état précédent la modification du ${new Date(target.createdAt).toLocaleString('fr-FR')} a été restauré.`,
          details: {
            sourceChangeId: target.id,
            createdRoles: result.createdRoles,
            createdChannels: result.createdChannels,
            deletedRoles: result.deletedRoles,
            deletedChannels: result.deletedChannels,
          },
          backupFile: result.safetyBackupFile,
          reversible: true,
        });
        return send(response, 200, {
          ok: true,
          change: { ...rollbackChange, backupFile: undefined, hasBackup: true },
          message: `Retour arrière terminé : ${result.createdRoles} rôle(s) et ${result.createdChannels} salon(s) restaurés. Vous pouvez maintenant retirer Administrateur à FyxBot.`,
        }, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/setup/preview/delete') {
        const body = await readBody(request);
        if (body.confirmation !== 'SUPPRIMER') throw new HttpError(400, 'Confirmez la suppression de l’aperçu.');
        const state = await getDashboardState(client, body.guildId, manageableGuildIds);
        await requireGuildCapability(client, state.guild.id, session, [PermissionFlagsBits.ManageGuild]);
        const removed = await deleteServerSetupPreview(state.guild.id);
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'design',
          title: 'Aperçu de configuration supprimé',
          summary: removed
            ? 'La proposition enregistrée a été retirée du panel sans modifier Discord.'
            : 'Aucune proposition enregistrée ne devait être retirée.',
          details: { previewOnly: true, removed },
        });
        return send(response, 200, {
          ok: true,
          removed,
          message: removed
            ? 'Aperçu supprimé. Aucun rôle, catégorie ou salon Discord n’a été modifié.'
            : 'Aucun aperçu enregistré.',
        }, origin);
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
          await saveServerSetupDraft(state.guild.id, blueprint);
          const fullGuild = await guild.fetch();
          const [currentChannels, currentRoles] = await Promise.all([
            fullGuild.channels.fetch(),
            fullGuild.roles.fetch(),
          ]);
          const analysis = await analyzeServerStructure(fullGuild, {
            channels: currentChannels,
            roles: currentRoles,
          }, blueprint);
          const simulation = buildSetupSimulation({
            analysis,
            blueprint,
            current: setupCurrentSnapshot(fullGuild, currentChannels, currentRoles),
          });
          await recordChange(state.guild.id, {
            actorId: session.user.id,
            actorName: session.user.username,
            kind: 'design',
            title: 'Nouvelle proposition de structure',
            summary: `${blueprint.roles.length} rôle(s), ${blueprint.categories.length} catégorie(s) et ${blueprint.channels.length} salon(s) proposés sans modification Discord.`,
            details: { detectedNeeds: blueprint.detectedNeeds, previewOnly: true },
          });
          return send(response, 200, {
            ok: true,
            blueprint,
            analysis,
            simulation,
            message: `Proposition générée : ${blueprint.roles.length} rôle(s), ${blueprint.categories.length} catégorie(s) et ${blueprint.channels.length} salon(s). Aucune modification Discord effectuée.`,
          }, origin);
        }
        const expected = mode === 'reset' ? 'TOUT SUPPRIMER' : mode === 'synchronize' ? 'SYNCHRONISER' : 'COMPLETER';
        if (body.confirmation !== expected) throw new HttpError(400, `Écrivez exactement ${expected} pour lancer la configuration.`);
        const blueprint = await getServerSetupBlueprint(state.guild.id);
        if (!blueprint) throw new HttpError(409, 'Décrivez d’abord votre serveur et générez l’aperçu avant de lancer la configuration.');
        if (destructive) requireRecentAuthentication(session);
        const backupFile = destructive ? null : await backupServer(await guild.fetch());
        const result = destructive
          ? await resetServer(await guild.fetch(), { blueprint })
          : await setupServer(await guild.fetch(), { blueprint, synchronizePermissions: mode === 'synchronize' });
        const reversibleBackup = destructive ? result.backupFile : backupFile;
        await recordChange(state.guild.id, {
          actorId: session.user.id,
          actorName: session.user.username,
          kind: 'structure',
          title: destructive ? 'Serveur reconstruit' : mode === 'synchronize' ? 'Structure synchronisée' : 'Structure complétée',
          summary: destructive
            ? `${result.deletedChannels} salon(s) et ${result.deletedRoles} rôle(s) remplacés par la proposition FyxBot.`
            : `${result.created} élément(s) créé(s) et ${result.updated} corrigé(s).`,
          details: {
            mode,
            created: result.created || 0,
            updated: result.updated || 0,
            deletedChannels: result.deletedChannels || 0,
            deletedRoles: result.deletedRoles || 0,
          },
          backupFile: reversibleBackup,
          reversible: true,
        });
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
      logger.error({
        err: error,
        method: request.method,
        path: url.pathname,
        reference: publicError.reference || null,
        status: publicError.status,
      }, '[FyxBot] Requête du panel en erreur.');
      return send(response, publicError.status, { error: publicError.error }, origin);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.listen(serverPort, serverHost, () => logger.info({ host: serverHost, port: serverPort }, '[FyxBot] API du panel démarrée.'));
  server.on('error', (error) => logger.fatal({ err: error, host: serverHost, port: serverPort }, '[FyxBot] Serveur du panel indisponible.'));
  server.on('close', () => authCleanup.stop());
  return server;
}

module.exports = { HttpError, asTwitchHttpError, buildAllowedOrigins, contentDeleteError, deleteTrackedDiscordMessage, getDashboardState, isLoopbackHost, isRequestOriginAllowed, messagePublishError, normalizeBotNickname, panelErrorResponse, rateLimit, requireGuildCapability, requireRecentAuthentication, requireTwitchGuildAccess, revalidateManageableGuildIds, sessionRateLimit, startDashboardServer, updateGuildBotNickname };
