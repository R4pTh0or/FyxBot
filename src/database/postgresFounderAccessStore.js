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

function createPostgresFounderAccessStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const trials = `"${schema}"."premium_founder_trials"`;
  const links = `"${schema}"."premium_user_guilds"`;

  async function getFounderProgramState(userId, guildId, { now = new Date(), limit = FOUNDER_USER_LIMIT } = {}) {
    const observedAt = normalizeNow(now);
    const normalizedUserId = userId ? validateSnowflake(userId, 'Compte Discord') : null;
    const normalizedGuildId = guildId ? validateSnowflake(guildId, 'Serveur Discord') : null;
    const [trialResult, countResult, guildTrialResult, linkResult] = await Promise.all([
      normalizedUserId
        ? pool.query(`SELECT * FROM ${trials} WHERE user_id = $1`, [normalizedUserId])
        : Promise.resolve({ rows: [] }),
      pool.query(`SELECT COUNT(*)::int AS total FROM ${trials}`),
      normalizedGuildId
        ? pool.query(`SELECT trials.* FROM ${trials} trials
          INNER JOIN ${links} link ON link.user_id = trials.user_id
          WHERE link.guild_id = $1 AND trials.starts_at <= $2 AND trials.ends_at > $2
          ORDER BY trials.ends_at DESC LIMIT 1`, [normalizedGuildId, observedAt.toISOString()])
        : Promise.resolve({ rows: [] }),
      normalizedUserId && normalizedGuildId
        ? pool.query(`SELECT 1 FROM ${links} WHERE user_id = $1 AND guild_id = $2`, [normalizedUserId, normalizedGuildId])
        : Promise.resolve({ rows: [] }),
    ]);
    const trial = trialResult.rows[0] || null;
    const claimed = countResult.rows[0].total;
    const personalActive = isTrialActive(trial, observedAt);
    return {
      limit,
      claimed,
      remaining: Math.max(limit - claimed, 0),
      available: claimed < limit,
      userClaimed: Boolean(trial),
      userActive: personalActive,
      userExpired: Boolean(trial) && !personalActive,
      linkedToGuild: Boolean(trial && linkResult.rows.length),
      guildActive: isTrialActive(guildTrialResult.rows[0], observedAt),
      startsAt: trial?.starts_at || null,
      endsAt: trial?.ends_at || null,
    };
  }

  async function claimFounderAccess(userId, guildId, {
    now = new Date(), limit = FOUNDER_USER_LIMIT, durationDays = FOUNDER_TRIAL_DAYS,
  } = {}) {
    const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
    const normalizedGuildId = validateSnowflake(guildId, 'Serveur Discord');
    const startsAt = normalizeNow(now);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) {
      throw new FounderAccessError('INVALID_DURATION', 'Durée de l’accès Fondateur invalide.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
      throw new FounderAccessError('INVALID_LIMIT', 'Limite de l’offre Fondateur invalide.');
    }
    const client = await pool.connect();
    let created = false;
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('fyxbot:founder-trial'))");
      const trialResult = await client.query(`SELECT * FROM ${trials} WHERE user_id = $1`, [normalizedUserId]);
      const trial = trialResult.rows[0];
      if (!trial) {
        const countResult = await client.query(`SELECT COUNT(*)::int AS total FROM ${trials}`);
        if (countResult.rows[0].total >= limit) {
          throw new FounderAccessError('FOUNDER_FULL', 'Les 100 accès Fondateur ont déjà été attribués.');
        }
        const endsAt = new Date(startsAt.getTime() + durationDays * DAY_MS);
        await client.query(`INSERT INTO ${trials}
          (user_id, starts_at, ends_at, claimed_at) VALUES ($1, $2, $3, $2)`,
        [normalizedUserId, startsAt.toISOString(), endsAt.toISOString()]);
        created = true;
      } else if (!isTrialActive(trial, startsAt)) {
        throw new FounderAccessError('FOUNDER_EXPIRED', 'Votre accès Fondateur de 30 jours est terminé et ne peut pas être réactivé.');
      }
      await client.query(`INSERT INTO ${links} (user_id, guild_id, linked_at)
        VALUES ($1, $2, $3) ON CONFLICT (user_id, guild_id) DO NOTHING`,
      [normalizedUserId, normalizedGuildId, startsAt.toISOString()]);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally {
      client.release();
    }
    return {
      created,
      ...await getFounderProgramState(normalizedUserId, normalizedGuildId, { now: startsAt, limit }),
    };
  }

  return { claimFounderAccess, getFounderProgramState };
}

module.exports = { createPostgresFounderAccessStore, FounderAccessError };
