const { createHash, randomBytes } = require('node:crypto');
const { createTwitchTokenVault } = require('../services/twitchTokenVault');

const OAUTH_STATE_LIFETIME_MS = 10 * 60_000;
const PROCESSED_MESSAGE_LIFETIME_MS = 15 * 60_000;
const EVENTSUB_MESSAGE_LIFETIME_MS = 24 * 60 * 60_000;
const ACCESS_LEVELS = new Set(['everyone', 'subscriber', 'moderator', 'broadcaster']);
const RUNTIME_STATUSES = new Set(['disconnected', 'connecting', 'connected', 'reconnecting', 'error', 'stopped']);
const DEFAULT_TWITCH_CHAT_CONFIG = Object.freeze({
  enabled: false,
  prefix: '!',
  protections: Object.freeze({ links: true, caps: true, repetition: true }),
  updatedAt: null,
});

class TwitchStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TwitchStoreError';
    this.code = code;
  }
}

function targetDatabase(options = {}) {
  return options.targetDatabase || require('./database').database;
}

function currentTime(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now ?? Date.now();
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) throw new TwitchStoreError('TWITCH_INVALID_TIME', 'La date Twitch fournie est invalide.');
  return timestamp;
}

function requireSnowflake(value, label = 'Identifiant Discord') {
  const identifier = String(value || '').trim();
  if (!/^\d{17,20}$/.test(identifier)) {
    throw new TwitchStoreError('TWITCH_INVALID_GUILD', `${label} invalide.`);
  }
  return identifier;
}

function requireGuildId(guildId) {
  return requireSnowflake(guildId, 'Identifiant du serveur Discord');
}

function requireMessageId(value, label) {
  const identifier = String(value || '').trim();
  if (!identifier || identifier.length > 128 || /[\u0000-\u001f\u007f]/.test(identifier)) {
    throw new TwitchStoreError('TWITCH_INVALID_MESSAGE_ID', `${label} invalide.`);
  }
  return identifier;
}

function normalizeInstant(value, label) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) throw new TwitchStoreError('TWITCH_INVALID_DATE', `${label} invalide.`);
  return new Date(timestamp).toISOString();
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) throw new TwitchStoreError('TWITCH_INVALID_SCOPES', 'Les permissions Twitch sont invalides.');
  const normalized = [...new Set(scopes.map((scope) => String(scope || '').trim()).filter(Boolean))].sort();
  if (normalized.length > 50 || normalized.some((scope) => !/^[a-z0-9:_-]{1,100}$/i.test(scope))) {
    throw new TwitchStoreError('TWITCH_INVALID_SCOPES', 'Les permissions Twitch sont invalides.');
  }
  return normalized;
}

function publicConnection(row, now = Date.now()) {
  if (!row) return null;
  let scopes = [];
  try {
    const stored = JSON.parse(row.scopes);
    if (Array.isArray(stored)) scopes = stored.filter((scope) => typeof scope === 'string');
  } catch { /* Une ancienne valeur invalide ne doit pas exposer les colonnes sensibles. */ }
  return {
    guildId: row.guild_id,
    broadcasterUserId: row.broadcaster_user_id,
    broadcasterLogin: row.broadcaster_login,
    broadcasterDisplayName: row.broadcaster_display_name,
    scopes,
    expiresAt: row.expires_at,
    expired: Date.parse(row.expires_at) <= now,
    enabled: Boolean(row.enabled),
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

function getTwitchConnection(guildId, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const row = target.prepare(`SELECT guild_id, broadcaster_user_id, broadcaster_login,
    broadcaster_display_name, scopes, expires_at, enabled, connected_at, updated_at
    FROM twitch_connections WHERE guild_id = ?`).get(id);
  return publicConnection(row, currentTime(options));
}

function listEnabledTwitchConnections(options = {}) {
  const now = currentTime(options);
  return targetDatabase(options).prepare(`SELECT guild_id, broadcaster_user_id, broadcaster_login,
    broadcaster_display_name, scopes, expires_at, enabled, connected_at, updated_at
    FROM twitch_connections WHERE enabled = 1 ORDER BY guild_id`)
    .all()
    .map((row) => publicConnection(row, now));
}

function upsertTwitchConnection(guildId, connection, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const broadcasterUserId = String(connection?.broadcasterUserId || '').trim();
  const broadcasterLogin = String(connection?.broadcasterLogin || '').trim().replace(/^@/, '').toLowerCase();
  const broadcasterDisplayName = String(connection?.broadcasterDisplayName || '').trim();
  if (!/^\d{1,32}$/.test(broadcasterUserId)) throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Identifiant de chaîne Twitch invalide.');
  if (!/^[a-z0-9_]{1,25}$/.test(broadcasterLogin)) throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Nom de chaîne Twitch invalide.');
  if (!broadcasterDisplayName || Array.from(broadcasterDisplayName).length > 100) throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Nom public de chaîne Twitch invalide.');
  const scopes = normalizeScopes(connection?.scopes || []);
  const expiresAt = normalizeInstant(connection?.expiresAt, 'Date d’expiration du jeton Twitch');
  const vault = options.vault || createTwitchTokenVault(options.environment);
  const accessTokenEncrypted = vault.encrypt(connection?.accessToken);
  const refreshTokenEncrypted = connection?.refreshToken ? vault.encrypt(connection.refreshToken) : null;
  const enabled = connection?.enabled === true ? 1 : 0;
  const now = new Date(currentTime(options)).toISOString();

  try {
    target.prepare(`INSERT INTO twitch_connections
      (guild_id, broadcaster_user_id, broadcaster_login, broadcaster_display_name,
       access_token_encrypted, refresh_token_encrypted, scopes, expires_at, enabled, connected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        broadcaster_user_id = excluded.broadcaster_user_id,
        broadcaster_login = excluded.broadcaster_login,
        broadcaster_display_name = excluded.broadcaster_display_name,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        scopes = excluded.scopes,
        expires_at = excluded.expires_at,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at`)
      .run(id, broadcasterUserId, broadcasterLogin, broadcasterDisplayName,
        accessTokenEncrypted, refreshTokenEncrypted, JSON.stringify(scopes), expiresAt, enabled, now, now);
  } catch (error) {
    if (String(error?.message || '').includes('twitch_connections.broadcaster_user_id')) {
      throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
    }
    throw new TwitchStoreError('TWITCH_CONNECTION_WRITE_FAILED', 'La connexion Twitch n’a pas pu être enregistrée.');
  }
  return getTwitchConnection(id, { ...options, now: currentTime(options) });
}

function getTwitchConnectionTokens(guildId, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const row = target.prepare(`SELECT access_token_encrypted, refresh_token_encrypted
    FROM twitch_connections WHERE guild_id = ?`).get(id);
  if (!row) return null;
  const vault = options.vault || createTwitchTokenVault(options.environment);
  return {
    accessToken: vault.decrypt(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted ? vault.decrypt(row.refresh_token_encrypted) : null,
  };
}

function setTwitchConnectionEnabled(guildId, enabled, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  try {
    const result = target.prepare('UPDATE twitch_connections SET enabled = ?, updated_at = ? WHERE guild_id = ?')
      .run(enabled === true ? 1 : 0, new Date(currentTime(options)).toISOString(), id);
    if (result.changes === 0) return null;
  } catch (error) {
    if (String(error?.message || '').includes('twitch_connections.broadcaster_user_id')) {
      throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
    }
    throw new TwitchStoreError('TWITCH_CONNECTION_WRITE_FAILED', 'La connexion Twitch n’a pas pu être mise à jour.');
  }
  return getTwitchConnection(id, options);
}

function deleteTwitchConnection(guildId, options = {}) {
  return targetDatabase(options).prepare('DELETE FROM twitch_connections WHERE guild_id = ?')
    .run(requireGuildId(guildId)).changes > 0;
}

function hashOAuthState(state) {
  return createHash('sha256').update(state).digest('hex');
}

function twitchOAuthStateGuildId(state) {
  const match = /^v1\.(\d{17,20})\.([A-Za-z0-9_-]{40,})$/.exec(String(state || ''));
  return match ? match[1] : null;
}

function purgeExpiredTwitchOAuthStates(guildId, options = {}) {
  return targetDatabase(options).prepare('DELETE FROM twitch_oauth_states WHERE guild_id = ? AND expires_at <= ?')
    .run(requireGuildId(guildId), currentTime(options)).changes;
}

function issueTwitchOAuthState(guildId, discordUserId, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const userId = requireSnowflake(discordUserId, 'Identifiant du compte Discord');
  const now = currentTime(options);
  const lifetimeMs = Math.min(Math.max(Number(options.lifetimeMs) || OAUTH_STATE_LIFETIME_MS, 60_000), OAUTH_STATE_LIFETIME_MS);
  purgeExpiredTwitchOAuthStates(id, { ...options, now });
  const random = (options.randomBytes || randomBytes)(32).toString('base64url');
  const state = `v1.${id}.${random}`;
  target.prepare('INSERT INTO twitch_oauth_states (state_hash, guild_id, discord_user_id, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashOAuthState(state), id, userId, now + lifetimeMs);
  return state;
}

function consumeTwitchOAuthState(guildId, state, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  if (twitchOAuthStateGuildId(state) !== id) return null;
  const expectedUserId = options.discordUserId
    ? requireSnowflake(options.discordUserId, 'Identifiant du compte Discord')
    : null;
  const stateHash = hashOAuthState(String(state));
  const now = currentTime(options);
  target.exec('BEGIN IMMEDIATE');
  try {
    const row = target.prepare(`SELECT guild_id, discord_user_id, expires_at
      FROM twitch_oauth_states WHERE state_hash = ? AND guild_id = ?`).get(stateHash, id);
    target.prepare('DELETE FROM twitch_oauth_states WHERE state_hash = ? AND guild_id = ?').run(stateHash, id);
    target.prepare('DELETE FROM twitch_oauth_states WHERE guild_id = ? AND expires_at <= ?').run(id, now);
    target.exec('COMMIT');
    if (!row || row.expires_at <= now || (expectedUserId && row.discord_user_id !== expectedUserId)) return null;
    return { guildId: row.guild_id, discordUserId: row.discord_user_id, expiresAt: row.expires_at };
  } catch (error) {
    try { target.exec('ROLLBACK'); } catch { /* La transaction a pu être annulée automatiquement. */ }
    throw error;
  }
}

function normalizeCommandName(name) {
  const normalized = String(name || '').trim().replace(/^!/, '').toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(normalized)) {
    throw new TwitchStoreError('TWITCH_INVALID_COMMAND', 'Le nom de commande doit contenir entre 2 et 24 lettres, chiffres ou tirets bas.');
  }
  return normalized;
}

function publicCommand(row) {
  return row ? {
    guildId: row.guild_id,
    name: row.name,
    response: row.response,
    enabled: Boolean(row.enabled),
    cooldownSeconds: row.cooldown_seconds,
    accessLevel: row.access_level,
    usageCount: row.usage_count,
    updatedAt: row.updated_at,
  } : null;
}

function upsertTwitchCustomCommand(guildId, command, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const name = normalizeCommandName(command?.name);
  const response = String(command?.response || '').trim();
  if (!response || Buffer.byteLength(response, 'utf8') > 400) {
    throw new TwitchStoreError('TWITCH_INVALID_RESPONSE', 'La réponse Twitch doit contenir entre 1 et 400 octets.');
  }
  const cooldownSeconds = Number(command?.cooldownSeconds ?? 5);
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 3600) {
    throw new TwitchStoreError('TWITCH_INVALID_COOLDOWN', 'Le délai Twitch doit être un nombre entier compris entre 0 et 3600 secondes.');
  }
  const accessLevel = String(command?.accessLevel || 'everyone');
  if (!ACCESS_LEVELS.has(accessLevel)) throw new TwitchStoreError('TWITCH_INVALID_ACCESS', 'Le niveau d’accès Twitch est invalide.');
  const now = new Date(currentTime(options)).toISOString();
  target.prepare(`INSERT INTO twitch_custom_commands
    (guild_id, name, response, enabled, cooldown_seconds, access_level, usage_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(guild_id, name) DO UPDATE SET
      response = excluded.response,
      enabled = excluded.enabled,
      cooldown_seconds = excluded.cooldown_seconds,
      access_level = excluded.access_level,
      updated_at = excluded.updated_at`)
    .run(id, name, response, command?.enabled === false ? 0 : 1, cooldownSeconds, accessLevel, now);
  return getTwitchCustomCommand(id, name, options);
}

function getTwitchCustomCommand(guildId, name, options = {}) {
  const row = targetDatabase(options).prepare(`SELECT guild_id, name, response, enabled,
    cooldown_seconds, access_level, usage_count, updated_at
    FROM twitch_custom_commands WHERE guild_id = ? AND name = ?`)
    .get(requireGuildId(guildId), normalizeCommandName(name));
  return publicCommand(row);
}

function listTwitchCustomCommands(guildId, options = {}) {
  return targetDatabase(options).prepare(`SELECT guild_id, name, response, enabled,
    cooldown_seconds, access_level, usage_count, updated_at
    FROM twitch_custom_commands WHERE guild_id = ? ORDER BY name`)
    .all(requireGuildId(guildId)).map(publicCommand);
}

function deleteTwitchCustomCommand(guildId, name, options = {}) {
  return targetDatabase(options).prepare('DELETE FROM twitch_custom_commands WHERE guild_id = ? AND name = ?')
    .run(requireGuildId(guildId), normalizeCommandName(name)).changes > 0;
}

function incrementTwitchCommandUsage(guildId, name, options = {}) {
  return targetDatabase(options).prepare(`UPDATE twitch_custom_commands
    SET usage_count = usage_count + 1 WHERE guild_id = ? AND name = ?`)
    .run(requireGuildId(guildId), normalizeCommandName(name)).changes > 0;
}

function normalizeTwitchChatConfig(config = {}) {
  const prefix = String(config.prefix ?? '!').trim();
  if (!/^[!#$%&*+./:<=>?@\\^_|~-]{1,5}$/.test(prefix)) {
    throw new TwitchStoreError('TWITCH_INVALID_PREFIX', 'Le préfixe Twitch doit contenir entre 1 et 5 signes autorisés.');
  }
  const protections = config.protections && typeof config.protections === 'object'
    ? config.protections
    : {};
  return {
    enabled: config.enabled === true,
    prefix,
    protections: {
      links: protections.links !== false,
      caps: protections.caps !== false,
      repetition: protections.repetition !== false,
    },
  };
}

function publicChatConfig(row) {
  if (!row) return {
    ...DEFAULT_TWITCH_CHAT_CONFIG,
    protections: { ...DEFAULT_TWITCH_CHAT_CONFIG.protections },
  };
  return {
    guildId: row.guild_id,
    enabled: Boolean(row.enabled),
    prefix: row.prefix,
    protections: {
      links: Boolean(row.link_protection),
      caps: Boolean(row.caps_protection),
      repetition: Boolean(row.repetition_protection),
    },
    updatedAt: row.updated_at,
  };
}

function getTwitchChatConfig(guildId, options = {}) {
  const row = targetDatabase(options).prepare(`SELECT guild_id, enabled, prefix,
    link_protection, caps_protection, repetition_protection, updated_at
    FROM twitch_chat_config WHERE guild_id = ?`).get(requireGuildId(guildId));
  return publicChatConfig(row);
}

function setTwitchChatConfig(guildId, config, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const normalized = normalizeTwitchChatConfig(config);
  const updatedAt = new Date(currentTime(options)).toISOString();
  target.prepare(`INSERT INTO twitch_chat_config
    (guild_id, enabled, prefix, link_protection, caps_protection, repetition_protection, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      prefix = excluded.prefix,
      link_protection = excluded.link_protection,
      caps_protection = excluded.caps_protection,
      repetition_protection = excluded.repetition_protection,
      updated_at = excluded.updated_at`)
    .run(id, normalized.enabled ? 1 : 0, normalized.prefix,
      normalized.protections.links ? 1 : 0,
      normalized.protections.caps ? 1 : 0,
      normalized.protections.repetition ? 1 : 0,
      updatedAt);
  return getTwitchChatConfig(id, options);
}

function configureTwitchChat(guildId, config, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const normalized = normalizeTwitchChatConfig(config);
  const updatedAt = new Date(currentTime(options)).toISOString();
  target.exec('BEGIN IMMEDIATE');
  try {
    const connectionUpdate = target.prepare(`UPDATE twitch_connections
      SET enabled = ?, updated_at = ? WHERE guild_id = ?`)
      .run(normalized.enabled ? 1 : 0, updatedAt, id);
    if (normalized.enabled && connectionUpdate.changes === 0) {
      throw new TwitchStoreError('TWITCH_CONNECTION_REQUIRED', 'Reliez d’abord une chaîne Twitch à ce serveur.');
    }
    target.prepare(`INSERT INTO twitch_chat_config
      (guild_id, enabled, prefix, link_protection, caps_protection, repetition_protection, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        prefix = excluded.prefix,
        link_protection = excluded.link_protection,
        caps_protection = excluded.caps_protection,
        repetition_protection = excluded.repetition_protection,
        updated_at = excluded.updated_at`)
      .run(id, normalized.enabled ? 1 : 0, normalized.prefix,
        normalized.protections.links ? 1 : 0,
        normalized.protections.caps ? 1 : 0,
        normalized.protections.repetition ? 1 : 0,
        updatedAt);
    target.exec('COMMIT');
  } catch (error) {
    try { target.exec('ROLLBACK'); } catch { /* La transaction a pu être annulée automatiquement. */ }
    if (error instanceof TwitchStoreError) throw error;
    if (String(error?.message || '').includes('twitch_connections.broadcaster_user_id')) {
      throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
    }
    throw new TwitchStoreError('TWITCH_CHAT_WRITE_FAILED', 'La configuration du chat Twitch n’a pas pu être enregistrée.');
  }
  return {
    connection: getTwitchConnection(id, options),
    chat: getTwitchChatConfig(id, options),
  };
}

function setTwitchRuntimeStatus(guildId, status, detail = null, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!RUNTIME_STATUSES.has(normalizedStatus)) throw new TwitchStoreError('TWITCH_INVALID_STATUS', 'État Twitch invalide.');
  const normalizedDetail = detail === null ? null : String(detail).trim().slice(0, 500) || null;
  const updatedAt = new Date(currentTime(options)).toISOString();
  target.prepare(`INSERT INTO twitch_runtime_status (guild_id, status, detail, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET
    status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at`)
    .run(id, normalizedStatus, normalizedDetail, updatedAt);
  return getTwitchRuntimeStatus(id, options);
}

function getTwitchRuntimeStatus(guildId, options = {}) {
  const row = targetDatabase(options).prepare(`SELECT guild_id AS guildId, status, detail,
    updated_at AS updatedAt FROM twitch_runtime_status WHERE guild_id = ?`)
    .get(requireGuildId(guildId));
  return row || null;
}

function claimExpiringMessage(table, guildId, messageId, options, defaultLifetimeMs, includeReceivedAt = false) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const message = requireMessageId(messageId, 'Identifiant du message Twitch');
  const now = currentTime(options);
  const lifetimeMs = Math.min(Math.max(Number(options.lifetimeMs) || defaultLifetimeMs, 60_000), 7 * 24 * 60 * 60_000);
  target.prepare(`DELETE FROM ${table} WHERE guild_id = ? AND expires_at <= ?`).run(id, now);
  const statement = includeReceivedAt
    ? `INSERT OR IGNORE INTO ${table} (guild_id, message_id, received_at, expires_at) VALUES (?, ?, ?, ?)`
    : `INSERT OR IGNORE INTO ${table} (guild_id, message_id, expires_at) VALUES (?, ?, ?)`;
  const parameters = includeReceivedAt ? [id, message, now, now + lifetimeMs] : [id, message, now + lifetimeMs];
  return target.prepare(statement).run(...parameters).changes === 1;
}

function claimTwitchProcessedMessage(guildId, messageId, options = {}) {
  return claimExpiringMessage('twitch_processed_messages', guildId, messageId, options, PROCESSED_MESSAGE_LIFETIME_MS);
}

function claimTwitchEventSubMessage(guildId, messageId, options = {}) {
  return claimExpiringMessage('twitch_eventsub_messages', guildId, messageId, options, EVENTSUB_MESSAGE_LIFETIME_MS, true);
}

function purgeExpiredTwitchProcessedMessages(guildId, options = {}) {
  return targetDatabase(options).prepare('DELETE FROM twitch_processed_messages WHERE guild_id = ? AND expires_at <= ?')
    .run(requireGuildId(guildId), currentTime(options)).changes;
}

function purgeExpiredTwitchEventSubMessages(guildId, options = {}) {
  return targetDatabase(options).prepare('DELETE FROM twitch_eventsub_messages WHERE guild_id = ? AND expires_at <= ?')
    .run(requireGuildId(guildId), currentTime(options)).changes;
}

function deleteTwitchGuildData(guildId, options = {}) {
  const target = targetDatabase(options);
  const id = requireGuildId(guildId);
  const tables = [
    'twitch_connections',
    'twitch_oauth_states',
    'twitch_custom_commands',
    'twitch_chat_config',
    'twitch_runtime_status',
    'twitch_processed_messages',
    'twitch_eventsub_messages',
  ];
  const deleted = {};
  target.exec('BEGIN IMMEDIATE');
  try {
    for (const table of tables) {
      deleted[table] = target.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(id).changes;
    }
    target.exec('COMMIT');
  } catch (error) {
    try { target.exec('ROLLBACK'); } catch { /* La transaction a pu être annulée automatiquement. */ }
    throw error;
  }
  return deleted;
}

module.exports = {
  EVENTSUB_MESSAGE_LIFETIME_MS,
  DEFAULT_TWITCH_CHAT_CONFIG,
  OAUTH_STATE_LIFETIME_MS,
  PROCESSED_MESSAGE_LIFETIME_MS,
  TwitchStoreError,
  claimTwitchEventSubMessage,
  claimTwitchProcessedMessage,
  consumeTwitchOAuthState,
  configureTwitchChat,
  deleteTwitchConnection,
  deleteTwitchCustomCommand,
  deleteTwitchGuildData,
  getTwitchConnection,
  getTwitchConnectionTokens,
  getTwitchChatConfig,
  getTwitchCustomCommand,
  getTwitchRuntimeStatus,
  incrementTwitchCommandUsage,
  issueTwitchOAuthState,
  listEnabledTwitchConnections,
  listTwitchCustomCommands,
  normalizeCommandName,
  purgeExpiredTwitchEventSubMessages,
  purgeExpiredTwitchOAuthStates,
  purgeExpiredTwitchProcessedMessages,
  setTwitchConnectionEnabled,
  setTwitchChatConfig,
  setTwitchRuntimeStatus,
  twitchOAuthStateGuildId,
  upsertTwitchConnection,
  upsertTwitchCustomCommand,
};
