const { randomUUID } = require('node:crypto');
const { resolveRuntimeStore } = require('../database/runtimeStorage');

const MAX_MANUAL_GRANT_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

class ManualPremiumAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ManualPremiumAccessError';
    this.code = code;
    this.userMessage = message;
  }
}

function activeDatabase(targetDatabase) {
  return targetDatabase || require('../database/database').database;
}

function validateSnowflake(value, label) {
  const normalized = String(value || '').trim();
  if (!/^\d{17,20}$/.test(normalized)) throw new ManualPremiumAccessError('INVALID_ID', `${label} invalide.`);
  return normalized;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new ManualPremiumAccessError('INVALID_DATE', `${label} invalide.`);
  return date;
}

function normalizeReason(value) {
  const reason = String(value || 'Partenaire FyxBot').trim().replaceAll(/\s+/g, ' ');
  if (reason.length < 2 || reason.length > 120) {
    throw new ManualPremiumAccessError('INVALID_REASON', 'Le motif doit contenir entre 2 et 120 caractères.');
  }
  return reason;
}

function normalizeDuration(durationDays) {
  const duration = Number(durationDays ?? 0);
  if (!Number.isInteger(duration) || duration < 0 || duration > MAX_MANUAL_GRANT_DAYS) {
    throw new ManualPremiumAccessError('INVALID_DURATION', 'La durée doit être permanente ou comprise entre 1 et 3650 jours.');
  }
  return duration;
}

function publicGrant(row, now = new Date()) {
  if (!row) return null;
  const observedAt = normalizeDate(now, 'Date de consultation');
  const active = !row.revoked_at
    && new Date(row.starts_at) <= observedAt
    && (!row.ends_at || new Date(row.ends_at) > observedAt);
  return {
    grantId: row.grant_id,
    userId: row.user_id,
    displayName: row.display_name,
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at || null,
    revokedBy: row.revoked_by || null,
    createdAt: row.created_at,
    active,
  };
}

async function getManualPremiumState(userId, guildId, {
  targetDatabase,
  storage,
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('founderAccess', storage);
  if (storage?.getManualPremiumState) return storage.getManualPremiumState(userId, guildId, { now });
  const database = activeDatabase(targetDatabase);
  const observedAt = normalizeDate(now, 'Date de consultation');
  const isoNow = observedAt.toISOString();
  const normalizedUserId = userId ? validateSnowflake(userId, 'Compte Discord') : null;
  const normalizedGuildId = guildId ? validateSnowflake(guildId, 'Serveur Discord') : null;
  const userGrant = normalizedUserId ? database.prepare(`SELECT * FROM premium_manual_grants
    WHERE user_id = ? AND revoked_at IS NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
    ORDER BY created_at DESC LIMIT 1`).get(normalizedUserId, isoNow, isoNow) : null;
  const linkedToGuild = Boolean(userGrant && normalizedGuildId && database.prepare(
    'SELECT 1 FROM premium_user_guilds WHERE user_id = ? AND guild_id = ?',
  ).get(normalizedUserId, normalizedGuildId));
  const guildGrant = normalizedGuildId ? database.prepare(`SELECT grants.* FROM premium_manual_grants grants
    INNER JOIN premium_user_guilds links ON links.user_id = grants.user_id
    WHERE links.guild_id = ? AND grants.revoked_at IS NULL AND grants.starts_at <= ?
      AND (grants.ends_at IS NULL OR grants.ends_at > ?)
    ORDER BY grants.created_at DESC LIMIT 1`).get(normalizedGuildId, isoNow, isoNow) : null;
  return {
    userActive: Boolean(userGrant),
    guildActive: Boolean(guildGrant),
    linkedToGuild,
    grant: publicGrant(userGrant, observedAt),
  };
}

async function listManualPremiumGrants({
  targetDatabase,
  storage,
  now = new Date(),
  limit = 100,
} = {}) {
  storage = resolveRuntimeStore('founderAccess', storage);
  if (storage?.listManualPremiumGrants) return storage.listManualPremiumGrants({ now, limit });
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  return activeDatabase(targetDatabase).prepare(`SELECT * FROM premium_manual_grants
    ORDER BY created_at DESC LIMIT ?`).all(safeLimit).map((row) => publicGrant(row, now));
}

async function grantManualPremiumAccess(input = {}, {
  targetDatabase,
  storage,
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('founderAccess', storage);
  if (storage?.grantManualPremiumAccess) return storage.grantManualPremiumAccess(input, { now });
  const database = activeDatabase(targetDatabase);
  const userId = validateSnowflake(input.userId, 'Compte Discord');
  const grantedBy = validateSnowflake(input.grantedBy, 'Propriétaire Discord');
  const startsAt = normalizeDate(now, 'Date d’attribution');
  const durationDays = normalizeDuration(input.durationDays);
  const endsAt = durationDays ? new Date(startsAt.getTime() + durationDays * DAY_MS) : null;
  const displayName = String(input.displayName || userId).trim().slice(0, 80) || userId;
  const reason = normalizeReason(input.reason);
  const isoNow = startsAt.toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = database.prepare(`SELECT 1 FROM premium_manual_grants
      WHERE user_id = ? AND revoked_at IS NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
      LIMIT 1`).get(userId, isoNow, isoNow);
    if (existing) throw new ManualPremiumAccessError('MANUAL_GRANT_ACTIVE', 'Ce compte possède déjà un accès Premium offert actif.');
    const grantId = randomUUID();
    database.prepare(`INSERT INTO premium_manual_grants
      (grant_id, user_id, display_name, reason, starts_at, ends_at, granted_by, revoked_at, revoked_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`).run(
      grantId, userId, displayName, reason, isoNow, endsAt?.toISOString() || null, grantedBy, isoNow,
    );
    database.exec('COMMIT');
    return publicGrant(database.prepare('SELECT * FROM premium_manual_grants WHERE grant_id = ?').get(grantId), startsAt);
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* Transaction déjà annulée. */ }
    throw error;
  }
}

async function revokeManualPremiumAccess(userId, revokedBy, {
  targetDatabase,
  storage,
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('founderAccess', storage);
  if (storage?.revokeManualPremiumAccess) return storage.revokeManualPremiumAccess(userId, revokedBy, { now });
  const database = activeDatabase(targetDatabase);
  const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
  const normalizedActorId = validateSnowflake(revokedBy, 'Propriétaire Discord');
  const observedAt = normalizeDate(now, 'Date de révocation');
  const isoNow = observedAt.toISOString();
  const result = database.prepare(`UPDATE premium_manual_grants SET revoked_at = ?, revoked_by = ?
    WHERE user_id = ? AND revoked_at IS NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)`)
    .run(isoNow, normalizedActorId, normalizedUserId, isoNow, isoNow);
  if (!result.changes) throw new ManualPremiumAccessError('MANUAL_GRANT_NOT_FOUND', 'Aucun accès Premium offert actif pour ce compte.');
  return { userId: normalizedUserId, revokedAt: isoNow, revokedBy: normalizedActorId };
}

async function linkManualPremiumAccess(userId, guildId, {
  targetDatabase,
  storage,
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('founderAccess', storage);
  if (storage?.linkManualPremiumAccess) return storage.linkManualPremiumAccess(userId, guildId, { now });
  const database = activeDatabase(targetDatabase);
  const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
  const normalizedGuildId = validateSnowflake(guildId, 'Serveur Discord');
  const observedAt = normalizeDate(now, 'Date d’application');
  const state = await getManualPremiumState(normalizedUserId, normalizedGuildId, {
    targetDatabase: database,
    now: observedAt,
  });
  if (!state.userActive) throw new ManualPremiumAccessError('MANUAL_GRANT_NOT_FOUND', 'Aucun accès Premium offert actif pour ce compte.');
  database.prepare(`INSERT OR IGNORE INTO premium_user_guilds (user_id, guild_id, linked_at)
    VALUES (?, ?, ?)`).run(normalizedUserId, normalizedGuildId, observedAt.toISOString());
  return getManualPremiumState(normalizedUserId, normalizedGuildId, { targetDatabase: database, now: observedAt });
}

module.exports = {
  DAY_MS,
  MAX_MANUAL_GRANT_DAYS,
  ManualPremiumAccessError,
  getManualPremiumState,
  grantManualPremiumAccess,
  linkManualPremiumAccess,
  listManualPremiumGrants,
  publicGrant,
  revokeManualPremiumAccess,
};
