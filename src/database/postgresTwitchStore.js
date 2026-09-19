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

function currentTime(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now ?? Date.now();
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) throw new TwitchStoreError('TWITCH_INVALID_TIME', 'La date Twitch fournie est invalide.');
  return timestamp;
}

function requireSnowflake(value, label = 'Identifiant Discord') {
  const identifier = String(value || '').trim();
  if (!/^\d{17,20}$/.test(identifier)) throw new TwitchStoreError('TWITCH_INVALID_GUILD', `${label} invalide.`);
  return identifier;
}

function requireGuildId(guildId) { return requireSnowflake(guildId, 'Identifiant du serveur Discord'); }

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
  } catch { /* Ne jamais exposer les colonnes sensibles. */ }
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

function hashOAuthState(state) { return createHash('sha256').update(state).digest('hex'); }

function twitchOAuthStateGuildId(state) {
  const match = /^v1\.(\d{17,20})\.([A-Za-z0-9_-]{40,})$/.exec(String(state || ''));
  return match ? match[1] : null;
}

function createPostgresTwitchStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = (name) => `"${schema}"."${name}"`;
  const connections = table('twitch_connections');
  const oauthStates = table('twitch_oauth_states');

  async function transaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally { client.release(); }
  }

  async function getTwitchConnection(guildId, options = {}) {
    const result = await pool.query(`SELECT guild_id, broadcaster_user_id, broadcaster_login,
      broadcaster_display_name, scopes, expires_at, enabled, connected_at, updated_at
      FROM ${connections} WHERE guild_id = $1`, [requireGuildId(guildId)]);
    return publicConnection(result.rows[0], currentTime(options));
  }

  async function listEnabledTwitchConnections(options = {}) {
    const now = currentTime(options);
    const result = await pool.query(`SELECT guild_id, broadcaster_user_id, broadcaster_login,
      broadcaster_display_name, scopes, expires_at, enabled, connected_at, updated_at
      FROM ${connections} WHERE enabled = 1 ORDER BY guild_id`);
    return result.rows.map((row) => publicConnection(row, now));
  }

  async function upsertTwitchConnection(guildId, connection, options = {}) {
    const id = requireGuildId(guildId);
    const broadcasterUserId = String(connection?.broadcasterUserId || '').trim();
    const broadcasterLogin = String(connection?.broadcasterLogin || '').trim().replace(/^@/, '').toLowerCase();
    const broadcasterDisplayName = String(connection?.broadcasterDisplayName || '').trim();
    if (!/^\d{1,32}$/.test(broadcasterUserId)) throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Identifiant de chaîne Twitch invalide.');
    if (!/^[a-z0-9_]{1,25}$/.test(broadcasterLogin)) throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Nom de chaîne Twitch invalide.');
    if (!broadcasterDisplayName || Array.from(broadcasterDisplayName).length > 100) {
      throw new TwitchStoreError('TWITCH_INVALID_BROADCASTER', 'Nom public de chaîne Twitch invalide.');
    }
    const scopes = normalizeScopes(connection?.scopes || []);
    const expiresAt = normalizeInstant(connection?.expiresAt, 'Date d’expiration du jeton Twitch');
    const vault = options.vault || createTwitchTokenVault(options.environment);
    const accessTokenEncrypted = vault.encrypt(connection?.accessToken);
    const refreshTokenEncrypted = connection?.refreshToken ? vault.encrypt(connection.refreshToken) : null;
    const enabled = connection?.enabled === true ? 1 : 0;
    const now = new Date(currentTime(options)).toISOString();
    try {
      await pool.query(`INSERT INTO ${connections}
        (guild_id, broadcaster_user_id, broadcaster_login, broadcaster_display_name,
         access_token_encrypted, refresh_token_encrypted, scopes, expires_at, enabled, connected_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        ON CONFLICT (guild_id) DO UPDATE SET
          broadcaster_user_id = EXCLUDED.broadcaster_user_id,
          broadcaster_login = EXCLUDED.broadcaster_login,
          broadcaster_display_name = EXCLUDED.broadcaster_display_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
          scopes = EXCLUDED.scopes, expires_at = EXCLUDED.expires_at,
          enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`, [
        id, broadcasterUserId, broadcasterLogin, broadcasterDisplayName,
        accessTokenEncrypted, refreshTokenEncrypted, JSON.stringify(scopes), expiresAt, enabled, now,
      ]);
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'twitch_active_broadcaster') {
        throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
      }
      throw new TwitchStoreError('TWITCH_CONNECTION_WRITE_FAILED', 'La connexion Twitch n’a pas pu être enregistrée.');
    }
    return getTwitchConnection(id, options);
  }

  async function getTwitchConnectionTokens(guildId, options = {}) {
    const result = await pool.query(`SELECT access_token_encrypted, refresh_token_encrypted
      FROM ${connections} WHERE guild_id = $1`, [requireGuildId(guildId)]);
    const row = result.rows[0];
    if (!row) return null;
    const vault = options.vault || createTwitchTokenVault(options.environment);
    return {
      accessToken: vault.decrypt(row.access_token_encrypted),
      refreshToken: row.refresh_token_encrypted ? vault.decrypt(row.refresh_token_encrypted) : null,
    };
  }

  async function setTwitchConnectionEnabled(guildId, enabled, options = {}) {
    const id = requireGuildId(guildId);
    try {
      const result = await pool.query(`UPDATE ${connections} SET enabled = $1, updated_at = $2
        WHERE guild_id = $3 RETURNING guild_id`,
      [enabled === true ? 1 : 0, new Date(currentTime(options)).toISOString(), id]);
      if (!result.rows.length) return null;
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'twitch_active_broadcaster') {
        throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
      }
      throw new TwitchStoreError('TWITCH_CONNECTION_WRITE_FAILED', 'La connexion Twitch n’a pas pu être mise à jour.');
    }
    return getTwitchConnection(id, options);
  }

  async function deleteTwitchConnection(guildId) {
    const result = await pool.query(`DELETE FROM ${connections} WHERE guild_id = $1 RETURNING guild_id`, [requireGuildId(guildId)]);
    return result.rows.length > 0;
  }

  async function purgeExpiredTwitchOAuthStates(guildId, options = {}) {
    const result = await pool.query(`DELETE FROM ${oauthStates} WHERE guild_id = $1 AND expires_at <= $2`,
      [requireGuildId(guildId), currentTime(options)]);
    return result.rowCount;
  }

  async function issueTwitchOAuthState(guildId, discordUserId, options = {}) {
    const id = requireGuildId(guildId);
    const userId = requireSnowflake(discordUserId, 'Identifiant du compte Discord');
    const now = currentTime(options);
    const lifetimeMs = Math.min(Math.max(Number(options.lifetimeMs) || OAUTH_STATE_LIFETIME_MS, 60_000), OAUTH_STATE_LIFETIME_MS);
    await purgeExpiredTwitchOAuthStates(id, { ...options, now });
    const random = (options.randomBytes || randomBytes)(32).toString('base64url');
    const state = `v1.${id}.${random}`;
    await pool.query(`INSERT INTO ${oauthStates} (state_hash, guild_id, discord_user_id, expires_at)
      VALUES ($1, $2, $3, $4)`, [hashOAuthState(state), id, userId, now + lifetimeMs]);
    return state;
  }

  async function consumeTwitchOAuthState(guildId, state, options = {}) {
    const id = requireGuildId(guildId);
    if (twitchOAuthStateGuildId(state) !== id) return null;
    const expectedUserId = options.discordUserId
      ? requireSnowflake(options.discordUserId, 'Identifiant du compte Discord') : null;
    const now = currentTime(options);
    return transaction(async (client) => {
      const result = await client.query(`DELETE FROM ${oauthStates}
        WHERE state_hash = $1 AND guild_id = $2
        RETURNING guild_id, discord_user_id, expires_at`, [hashOAuthState(String(state)), id]);
      await client.query(`DELETE FROM ${oauthStates} WHERE guild_id = $1 AND expires_at <= $2`, [id, now]);
      const row = result.rows[0];
      if (!row || Number(row.expires_at) <= now || (expectedUserId && row.discord_user_id !== expectedUserId)) return null;
      return { guildId: row.guild_id, discordUserId: row.discord_user_id, expiresAt: Number(row.expires_at) };
    });
  }

  const commands = table('twitch_custom_commands');
  const chatConfig = table('twitch_chat_config');
  const runtimeStatus = table('twitch_runtime_status');
  const processedMessages = table('twitch_processed_messages');
  const eventSubMessages = table('twitch_eventsub_messages');

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

  async function upsertTwitchCustomCommand(guildId, command, options = {}) {
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
    await pool.query(`INSERT INTO ${commands}
      (guild_id, name, response, enabled, cooldown_seconds, access_level, usage_count, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
      ON CONFLICT (guild_id, name) DO UPDATE SET
        response = EXCLUDED.response, enabled = EXCLUDED.enabled,
        cooldown_seconds = EXCLUDED.cooldown_seconds,
        access_level = EXCLUDED.access_level, updated_at = EXCLUDED.updated_at`,
    [id, name, response, command?.enabled === false ? 0 : 1, cooldownSeconds, accessLevel, now]);
    return getTwitchCustomCommand(id, name);
  }

  async function getTwitchCustomCommand(guildId, name) {
    const result = await pool.query(`SELECT guild_id, name, response, enabled,
      cooldown_seconds, access_level, usage_count, updated_at
      FROM ${commands} WHERE guild_id = $1 AND name = $2`,
    [requireGuildId(guildId), normalizeCommandName(name)]);
    return publicCommand(result.rows[0]);
  }

  async function listTwitchCustomCommands(guildId) {
    const result = await pool.query(`SELECT guild_id, name, response, enabled,
      cooldown_seconds, access_level, usage_count, updated_at
      FROM ${commands} WHERE guild_id = $1 ORDER BY name`, [requireGuildId(guildId)]);
    return result.rows.map(publicCommand);
  }

  async function deleteTwitchCustomCommand(guildId, name) {
    const result = await pool.query(`DELETE FROM ${commands} WHERE guild_id = $1 AND name = $2 RETURNING name`,
      [requireGuildId(guildId), normalizeCommandName(name)]);
    return result.rows.length > 0;
  }

  async function incrementTwitchCommandUsage(guildId, name) {
    const result = await pool.query(`UPDATE ${commands} SET usage_count = usage_count + 1
      WHERE guild_id = $1 AND name = $2 RETURNING name`,
    [requireGuildId(guildId), normalizeCommandName(name)]);
    return result.rows.length > 0;
  }

  function normalizeTwitchChatConfig(config = {}) {
    const prefix = String(config.prefix ?? '!').trim();
    if (!/^[!#$%&*+./:<=>?@\\^_|~-]{1,5}$/.test(prefix)) {
      throw new TwitchStoreError('TWITCH_INVALID_PREFIX', 'Le préfixe Twitch doit contenir entre 1 et 5 signes autorisés.');
    }
    const protections = config.protections && typeof config.protections === 'object' ? config.protections : {};
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
    if (!row) return { ...DEFAULT_TWITCH_CHAT_CONFIG,
      protections: { ...DEFAULT_TWITCH_CHAT_CONFIG.protections } };
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

  async function getTwitchChatConfig(guildId) {
    const result = await pool.query(`SELECT guild_id, enabled, prefix,
      link_protection, caps_protection, repetition_protection, updated_at
      FROM ${chatConfig} WHERE guild_id = $1`, [requireGuildId(guildId)]);
    return publicChatConfig(result.rows[0]);
  }

  async function writeChatConfig(client, id, normalized, updatedAt) {
    await client.query(`INSERT INTO ${chatConfig}
      (guild_id, enabled, prefix, link_protection, caps_protection, repetition_protection, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (guild_id) DO UPDATE SET
        enabled = EXCLUDED.enabled, prefix = EXCLUDED.prefix,
        link_protection = EXCLUDED.link_protection,
        caps_protection = EXCLUDED.caps_protection,
        repetition_protection = EXCLUDED.repetition_protection,
        updated_at = EXCLUDED.updated_at`, [
      id, normalized.enabled ? 1 : 0, normalized.prefix,
      normalized.protections.links ? 1 : 0,
      normalized.protections.caps ? 1 : 0,
      normalized.protections.repetition ? 1 : 0,
      updatedAt,
    ]);
  }

  async function setTwitchChatConfig(guildId, config, options = {}) {
    const id = requireGuildId(guildId);
    await writeChatConfig(pool, id, normalizeTwitchChatConfig(config), new Date(currentTime(options)).toISOString());
    return getTwitchChatConfig(id);
  }

  async function configureTwitchChat(guildId, config, options = {}) {
    const id = requireGuildId(guildId);
    const normalized = normalizeTwitchChatConfig(config);
    const updatedAt = new Date(currentTime(options)).toISOString();
    try {
      await transaction(async (client) => {
        const connectionUpdate = await client.query(`UPDATE ${connections}
          SET enabled = $1, updated_at = $2 WHERE guild_id = $3 RETURNING guild_id`,
        [normalized.enabled ? 1 : 0, updatedAt, id]);
        if (normalized.enabled && connectionUpdate.rows.length === 0) {
          throw new TwitchStoreError('TWITCH_CONNECTION_REQUIRED', 'Reliez d’abord une chaîne Twitch à ce serveur.');
        }
        await writeChatConfig(client, id, normalized, updatedAt);
      });
    } catch (error) {
      if (error instanceof TwitchStoreError) throw error;
      if (error?.code === '23505' && error?.constraint === 'twitch_active_broadcaster') {
        throw new TwitchStoreError('TWITCH_BROADCASTER_IN_USE', 'Cette chaîne Twitch est déjà active pour un autre serveur Discord.');
      }
      throw new TwitchStoreError('TWITCH_CHAT_WRITE_FAILED', 'La configuration du chat Twitch n’a pas pu être enregistrée.');
    }
    return { connection: await getTwitchConnection(id, options), chat: await getTwitchChatConfig(id) };
  }

  async function setTwitchRuntimeStatus(guildId, status, detail = null, options = {}) {
    const id = requireGuildId(guildId);
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!RUNTIME_STATUSES.has(normalizedStatus)) throw new TwitchStoreError('TWITCH_INVALID_STATUS', 'État Twitch invalide.');
    const normalizedDetail = detail === null ? null : String(detail).trim().slice(0, 500) || null;
    const result = await pool.query(`INSERT INTO ${runtimeStatus} (guild_id, status, detail, updated_at)
      VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id) DO UPDATE SET
        status = EXCLUDED.status, detail = EXCLUDED.detail, updated_at = EXCLUDED.updated_at
      RETURNING guild_id AS "guildId", status, detail, updated_at AS "updatedAt"`,
    [id, normalizedStatus, normalizedDetail, new Date(currentTime(options)).toISOString()]);
    return result.rows[0];
  }

  async function getTwitchRuntimeStatus(guildId) {
    const result = await pool.query(`SELECT guild_id AS "guildId", status, detail,
      updated_at AS "updatedAt" FROM ${runtimeStatus} WHERE guild_id = $1`, [requireGuildId(guildId)]);
    return result.rows[0] || null;
  }

  async function claimExpiringMessage(tableName, guildId, messageId, options, defaultLifetimeMs, includeReceivedAt = false) {
    const id = requireGuildId(guildId);
    const message = requireMessageId(messageId, 'Identifiant du message Twitch');
    const now = currentTime(options);
    const lifetimeMs = Math.min(Math.max(Number(options.lifetimeMs) || defaultLifetimeMs, 60_000), 7 * 24 * 60 * 60_000);
    const target = table(tableName);
    return transaction(async (client) => {
      await client.query(`DELETE FROM ${target} WHERE guild_id = $1 AND expires_at <= $2`, [id, now]);
      const columns = includeReceivedAt ? '(guild_id, message_id, received_at, expires_at)' : '(guild_id, message_id, expires_at)';
      const values = includeReceivedAt ? '($1, $2, $3, $4)' : '($1, $2, $3)';
      const parameters = includeReceivedAt ? [id, message, now, now + lifetimeMs] : [id, message, now + lifetimeMs];
      const result = await client.query(`INSERT INTO ${target} ${columns} VALUES ${values}
        ON CONFLICT (guild_id, message_id) DO NOTHING RETURNING message_id`, parameters);
      return result.rows.length === 1;
    });
  }

  function claimTwitchProcessedMessage(guildId, messageId, options = {}) {
    return claimExpiringMessage('twitch_processed_messages', guildId, messageId, options, PROCESSED_MESSAGE_LIFETIME_MS);
  }

  function claimTwitchEventSubMessage(guildId, messageId, options = {}) {
    return claimExpiringMessage('twitch_eventsub_messages', guildId, messageId, options, EVENTSUB_MESSAGE_LIFETIME_MS, true);
  }

  async function purgeExpiredTwitchProcessedMessages(guildId, options = {}) {
    const result = await pool.query(`DELETE FROM ${processedMessages} WHERE guild_id = $1 AND expires_at <= $2`,
      [requireGuildId(guildId), currentTime(options)]);
    return result.rowCount;
  }

  async function purgeExpiredTwitchEventSubMessages(guildId, options = {}) {
    const result = await pool.query(`DELETE FROM ${eventSubMessages} WHERE guild_id = $1 AND expires_at <= $2`,
      [requireGuildId(guildId), currentTime(options)]);
    return result.rowCount;
  }

  async function deleteTwitchGuildData(guildId) {
    const id = requireGuildId(guildId);
    const names = [
      'twitch_connections', 'twitch_oauth_states', 'twitch_custom_commands',
      'twitch_chat_config', 'twitch_runtime_status', 'twitch_processed_messages',
      'twitch_eventsub_messages',
    ];
    return transaction(async (client) => {
      const deleted = {};
      for (const name of names) {
        const result = await client.query(`DELETE FROM ${table(name)} WHERE guild_id = $1`, [id]);
        deleted[name] = result.rowCount;
      }
      return deleted;
    });
  }

  return {
    claimTwitchEventSubMessage, claimTwitchProcessedMessage, configureTwitchChat,
    consumeTwitchOAuthState, deleteTwitchConnection, getTwitchConnection, getTwitchConnectionTokens,
    deleteTwitchCustomCommand, deleteTwitchGuildData, getTwitchChatConfig,
    getTwitchCustomCommand, getTwitchRuntimeStatus, incrementTwitchCommandUsage,
    issueTwitchOAuthState, listEnabledTwitchConnections, listTwitchCustomCommands,
    purgeExpiredTwitchEventSubMessages, purgeExpiredTwitchOAuthStates,
    purgeExpiredTwitchProcessedMessages, setTwitchChatConfig,
    setTwitchConnectionEnabled, setTwitchRuntimeStatus,
    upsertTwitchConnection, upsertTwitchCustomCommand,
  };
}

module.exports = {
  createPostgresTwitchStore, TwitchStoreError,
  OAUTH_STATE_LIFETIME_MS, PROCESSED_MESSAGE_LIFETIME_MS, EVENTSUB_MESSAGE_LIFETIME_MS,
  DEFAULT_TWITCH_CHAT_CONFIG, ACCESS_LEVELS, RUNTIME_STATUSES,
  currentTime, requireGuildId, requireMessageId, normalizeInstant, normalizeScopes,
  publicConnection, twitchOAuthStateGuildId,
};
