const { randomUUID } = require('node:crypto');

function createPostgresWarningStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = `"${schema}"."warnings"`;

  async function addWarning({ guildId, userId, moderatorId, reason }) {
    if (!guildId || !userId || !moderatorId || typeof reason !== 'string') {
      throw new Error('Avertissement incomplet.');
    }
    const warning = {
      id: '',
      moderatorId,
      reason,
      createdAt: new Date().toISOString(),
    };
    let inserted = false;
    for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
      warning.id = randomUUID().split('-')[0];
      try {
        await pool.query(`INSERT INTO ${table} (id, guild_id, user_id, moderator_id, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)`,
        [warning.id, guildId, userId, warning.moderatorId, warning.reason, warning.createdAt]);
        inserted = true;
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    if (!inserted) throw new Error('Impossible de créer un identifiant d’avertissement unique.');
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
    return { warning, count: result.rows[0].total };
  }

  async function getWarnings(guildId, userId) {
    if (!guildId || !userId) return [];
    const result = await pool.query(`SELECT id, moderator_id AS "moderatorId", reason, created_at AS "createdAt"
      FROM ${table} WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at, id`, [guildId, userId]);
    return result.rows;
  }

  async function removeWarning(guildId, userId, warningId) {
    if (!guildId || !userId || !warningId) return null;
    const result = await pool.query(`DELETE FROM ${table} WHERE guild_id = $1 AND user_id = $2 AND id = $3
      RETURNING id, moderator_id AS "moderatorId", reason, created_at AS "createdAt"`, [guildId, userId, warningId]);
    return result.rows[0] || null;
  }

  async function clearWarnings(guildId, userId) {
    if (!guildId || !userId) return 0;
    const result = await pool.query(`DELETE FROM ${table} WHERE guild_id = $1 AND user_id = $2 RETURNING id`, [guildId, userId]);
    return result.rows.length;
  }

  async function clearGuildWarnings(guildId) {
    if (!guildId) return 0;
    const result = await pool.query(`DELETE FROM ${table} WHERE guild_id = $1 RETURNING id`, [guildId]);
    return result.rows.length;
  }

  return { addWarning, clearGuildWarnings, clearWarnings, getWarnings, removeWarning };
}

module.exports = { createPostgresWarningStore };
