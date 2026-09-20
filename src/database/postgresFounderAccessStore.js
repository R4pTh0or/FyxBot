const { randomUUID } = require('node:crypto');

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

function manualGrantIsActive(row, now) {
  return Boolean(row) && !row.revoked_at && new Date(row.starts_at) <= now
    && (!row.ends_at || new Date(row.ends_at) > now);
}

function publicManualGrant(row, now) {
  if (!row) return null;
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
    active: manualGrantIsActive(row, now),
  };
}

function createPostgresFounderAccessStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const trials = `"${schema}"."premium_founder_trials"`;
  const manualGrants = `"${schema}"."premium_manual_grants"`;
  const links = `"${schema}"."premium_user_guilds"`;

  async function getManualPremiumState(userId, guildId, { now = new Date() } = {}) {
    const observedAt = normalizeNow(now);
    const normalizedUserId = userId ? validateSnowflake(userId, 'Compte Discord') : null;
    const normalizedGuildId = guildId ? validateSnowflake(guildId, 'Serveur Discord') : null;
    const [userResult, linkResult, guildResult] = await Promise.all([
      normalizedUserId ? pool.query(`SELECT * FROM ${manualGrants}
        WHERE user_id = $1 AND revoked_at IS NULL AND starts_at <= $2 AND (ends_at IS NULL OR ends_at > $2)
        ORDER BY created_at DESC LIMIT 1`, [normalizedUserId, observedAt.toISOString()]) : Promise.resolve({ rows: [] }),
      normalizedUserId && normalizedGuildId
        ? pool.query(`SELECT 1 FROM ${links} WHERE user_id = $1 AND guild_id = $2`, [normalizedUserId, normalizedGuildId])
        : Promise.resolve({ rows: [] }),
      normalizedGuildId ? pool.query(`SELECT grants.* FROM ${manualGrants} grants
        INNER JOIN ${links} link ON link.user_id = grants.user_id
        WHERE link.guild_id = $1 AND grants.revoked_at IS NULL AND grants.starts_at <= $2
          AND (grants.ends_at IS NULL OR grants.ends_at > $2)
        ORDER BY grants.created_at DESC LIMIT 1`, [normalizedGuildId, observedAt.toISOString()]) : Promise.resolve({ rows: [] }),
    ]);
    const userGrant = userResult.rows[0] || null;
    return {
      userActive: manualGrantIsActive(userGrant, observedAt),
      guildActive: manualGrantIsActive(guildResult.rows[0], observedAt),
      linkedToGuild: Boolean(userGrant && linkResult.rows.length),
      grant: publicManualGrant(userGrant, observedAt),
    };
  }

  async function listManualPremiumGrants({ now = new Date(), limit = 100 } = {}) {
    const observedAt = normalizeNow(now);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const result = await pool.query(`SELECT * FROM ${manualGrants} ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
    return result.rows.map((row) => publicManualGrant(row, observedAt));
  }

  async function grantManualPremiumAccess(input = {}, { now = new Date() } = {}) {
    const userId = validateSnowflake(input.userId, 'Compte Discord');
    const grantedBy = validateSnowflake(input.grantedBy, 'Propriétaire Discord');
    const startsAt = normalizeNow(now);
    const durationDays = Number(input.durationDays ?? 0);
    if (!Number.isInteger(durationDays) || durationDays < 0 || durationDays > 3650) {
      throw new FounderAccessError('INVALID_DURATION', 'La durée doit être permanente ou comprise entre 1 et 3650 jours.');
    }
    const displayName = String(input.displayName || userId).trim().slice(0, 80) || userId;
    const reason = String(input.reason || 'Partenaire FyxBot').trim().replaceAll(/\s+/g, ' ');
    if (reason.length < 2 || reason.length > 120) {
      throw new FounderAccessError('INVALID_REASON', 'Le motif doit contenir entre 2 et 120 caractères.');
    }
    const endsAt = durationDays ? new Date(startsAt.getTime() + durationDays * DAY_MS) : null;
    const client = await pool.connect();
    const grantId = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('fyxbot:manual-premium-grant'))");
      const existing = await client.query(`SELECT 1 FROM ${manualGrants}
        WHERE user_id = $1 AND revoked_at IS NULL AND starts_at <= $2 AND (ends_at IS NULL OR ends_at > $2)
        LIMIT 1`, [userId, startsAt.toISOString()]);
      if (existing.rows.length) throw new FounderAccessError('MANUAL_GRANT_ACTIVE', 'Ce compte possède déjà un accès Premium offert actif.');
      await client.query(`INSERT INTO ${manualGrants}
        (grant_id, user_id, display_name, reason, starts_at, ends_at, granted_by, revoked_at, revoked_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $5)`,
      [grantId, userId, displayName, reason, startsAt.toISOString(), endsAt?.toISOString() || null, grantedBy]);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally {
      client.release();
    }
    const stored = await pool.query(`SELECT * FROM ${manualGrants} WHERE grant_id = $1`, [grantId]);
    return publicManualGrant(stored.rows[0], startsAt);
  }

  async function revokeManualPremiumAccess(userId, revokedBy, { now = new Date() } = {}) {
    const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
    const normalizedActorId = validateSnowflake(revokedBy, 'Propriétaire Discord');
    const observedAt = normalizeNow(now);
    const result = await pool.query(`UPDATE ${manualGrants} SET revoked_at = $1, revoked_by = $2
      WHERE user_id = $3 AND revoked_at IS NULL AND starts_at <= $1 AND (ends_at IS NULL OR ends_at > $1)`,
    [observedAt.toISOString(), normalizedActorId, normalizedUserId]);
    if (!result.rowCount) throw new FounderAccessError('MANUAL_GRANT_NOT_FOUND', 'Aucun accès Premium offert actif pour ce compte.');
    return { userId: normalizedUserId, revokedAt: observedAt.toISOString(), revokedBy: normalizedActorId };
  }

  async function linkManualPremiumAccess(userId, guildId, { now = new Date() } = {}) {
    const normalizedUserId = validateSnowflake(userId, 'Compte Discord');
    const normalizedGuildId = validateSnowflake(guildId, 'Serveur Discord');
    const observedAt = normalizeNow(now);
    const state = await getManualPremiumState(normalizedUserId, normalizedGuildId, { now: observedAt });
    if (!state.userActive) throw new FounderAccessError('MANUAL_GRANT_NOT_FOUND', 'Aucun accès Premium offert actif pour ce compte.');
    await pool.query(`INSERT INTO ${links} (user_id, guild_id, linked_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, guild_id) DO NOTHING`, [normalizedUserId, normalizedGuildId, observedAt.toISOString()]);
    return getManualPremiumState(normalizedUserId, normalizedGuildId, { now: observedAt });
  }

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

  return {
    claimFounderAccess,
    getFounderProgramState,
    getManualPremiumState,
    grantManualPremiumAccess,
    linkManualPremiumAccess,
    listManualPremiumGrants,
    revokeManualPremiumAccess,
  };
}

module.exports = { createPostgresFounderAccessStore, FounderAccessError };
