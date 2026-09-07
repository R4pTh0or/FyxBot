const { database } = require('../database/database');

const FOUNDER_USER_LIMIT = 100;
const FOUNDER_TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

class FounderAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FounderAccessError';
    this.code = code;
    this.userMessage = message;
  }
}

function activeDatabase(targetDatabase) {
  return targetDatabase || database;
}

function validateSnowflake(value, label) {
  const normalized = String(value || '');
  if (!/^\d{17,20}$/.test(normalized)) throw new FounderAccessError('INVALID_ID', `${label} invalide.`);
  return normalized;
}

function normalizeNow(now) {
  const value = now instanceof Date ? new Date(now) : new Date(now || Date.now());
  if (Number.isNaN(value.getTime())) throw new FounderAccessError('INVALID_DATE', 'Date d’activation invalide.');
  return value;
}

function isTrialActive(row, now) {
  return Boolean(row) && new Date(row.starts_at) <= now && new Date(row.ends_at) > now;
}

function getFounderProgramState(userId, guildId, {
  targetDatabase,
  now = new Date(),
  limit = FOUNDER_USER_LIMIT,
} = {}) {
  const store = activeDatabase(targetDatabase);
  const observedAt = normalizeNow(now);
  const normalizedUserId = userId ? validateSnowflake(userId, 'Compte Discord') : null;
  const normalizedGuildId = guildId ? validateSnowflake(guildId, 'Serveur Discord') : null;
  const trial = normalizedUserId
    ? store.prepare('SELECT * FROM premium_founder_trials WHERE user_id = ?').get(normalizedUserId)
    : null;
  const claimed = Number(store.prepare('SELECT COUNT(*) AS total FROM premium_founder_trials').get().total || 0);
  const linked = Boolean(trial && normalizedGuildId && store.prepare(
    'SELECT 1 FROM premium_user_guilds WHERE user_id = ? AND guild_id = ?',
  ).get(normalizedUserId, normalizedGuildId));
  const guildTrial = normalizedGuildId ? store.prepare(`SELECT trials.* FROM premium_founder_trials trials
    INNER JOIN premium_user_guilds links ON links.user_id = trials.user_id
    WHERE links.guild_id = ? AND trials.starts_at <= ? AND trials.ends_at > ?
    ORDER BY trials.ends_at DESC LIMIT 1`).get(normalizedGuildId, observedAt.toISOString(), observedAt.toISOString()) : null;
  const personalActive = isTrialActive(trial, observedAt);
  return {
    limit,
    claimed,
    remaining: Math.max(limit - claimed, 0),
    available: claimed < limit,
    userClaimed: Boolean(trial),
    userActive: personalActive,
    userExpired: Boolean(trial) && !personalActive,
    linkedToGuild: linked,
    guildActive: isTrialActive(guildTrial, observedAt),
    startsAt: trial?.starts_at || null,
    endsAt: trial?.ends_at || null,
  };
}

function claimFounderAccess(userId, guildId, {
  targetDatabase,
  now = new Date(),
  limit = FOUNDER_USER_LIMIT,
  durationDays = FOUNDER_TRIAL_DAYS,
} = {}) {
  const store = activeDatabase(targetDatabase);
  const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
  const normalizedGuildId = validateSnowflake(guildId, 'Serveur Discord');
  const startsAt = normalizeNow(now);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) {
    throw new FounderAccessError('INVALID_DURATION', 'Durée de l’accès Fondateur invalide.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
    throw new FounderAccessError('INVALID_LIMIT', 'Limite de l’offre Fondateur invalide.');
  }

  store.exec('BEGIN IMMEDIATE');
  try {
    let trial = store.prepare('SELECT * FROM premium_founder_trials WHERE user_id = ?').get(normalizedUserId);
    let created = false;
    if (!trial) {
      const claimed = Number(store.prepare('SELECT COUNT(*) AS total FROM premium_founder_trials').get().total || 0);
      if (claimed >= limit) {
        throw new FounderAccessError('FOUNDER_FULL', 'Les 100 accès Fondateur ont déjà été attribués.');
      }
      const endsAt = new Date(startsAt.getTime() + durationDays * DAY_MS);
      store.prepare(`INSERT INTO premium_founder_trials (user_id, starts_at, ends_at, claimed_at)
        VALUES (?, ?, ?, ?)`).run(normalizedUserId, startsAt.toISOString(), endsAt.toISOString(), startsAt.toISOString());
      trial = store.prepare('SELECT * FROM premium_founder_trials WHERE user_id = ?').get(normalizedUserId);
      created = true;
    } else if (!isTrialActive(trial, startsAt)) {
      throw new FounderAccessError('FOUNDER_EXPIRED', 'Votre accès Fondateur de 30 jours est terminé et ne peut pas être réactivé.');
    }
    store.prepare(`INSERT OR IGNORE INTO premium_user_guilds (user_id, guild_id, linked_at)
      VALUES (?, ?, ?)`).run(normalizedUserId, normalizedGuildId, startsAt.toISOString());
    store.exec('COMMIT');
    return {
      created,
      ...getFounderProgramState(normalizedUserId, normalizedGuildId, {
        targetDatabase: store,
        now: startsAt,
        limit,
      }),
    };
  } catch (error) {
    try { store.exec('ROLLBACK'); } catch { /* La transaction a pu être annulée automatiquement. */ }
    throw error;
  }
}

module.exports = {
  DAY_MS,
  FOUNDER_TRIAL_DAYS,
  FOUNDER_USER_LIMIT,
  FounderAccessError,
  claimFounderAccess,
  getFounderProgramState,
  isTrialActive,
};
