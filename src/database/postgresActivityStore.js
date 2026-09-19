const { randomUUID } = require('node:crypto');

function createPostgresActivityStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = (name) => `"${schema}"."${name}"`;
  const auditLogs = table('audit_logs');
  const suggestions = table('suggestions');
  const commandUsage = table('command_usage');
  const changeHistory = table('change_history');

  async function addAuditLog(guildId, { title, description, color }) {
    await pool.query(`INSERT INTO ${auditLogs} (guild_id, title, description, color, created_at)
      VALUES ($1, $2, $3, $4, $5)`, [guildId, title, description, color, new Date().toISOString()]);
  }

  async function getRecentAuditLogs(guildId, limit = 30) {
    const result = await pool.query(`SELECT id, title, description, color, created_at AS "createdAt"
      FROM ${auditLogs} WHERE guild_id = $1 ORDER BY id DESC LIMIT $2`,
    [guildId, Math.min(Math.max(Number(limit) || 30, 1), 100)]);
    return result.rows.map((row) => ({ ...row, id: Number(row.id) }));
  }

  async function addSuggestion({ id, guildId, channelId, messageId, authorId, authorName, anonymous, idea }) {
    await pool.query(`INSERT INTO ${suggestions}
      (id, guild_id, channel_id, message_id, author_id, author_name, anonymous, idea, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
    [id, guildId, channelId, messageId, authorId, authorName, anonymous ? 1 : 0, idea, new Date().toISOString()]);
  }

  async function getRecentSuggestions(guildId, limit = 30) {
    const result = await pool.query(`SELECT id, channel_id AS "channelId", message_id AS "messageId",
      CASE WHEN anonymous = 1 THEN 'Anonyme' ELSE author_name END AS "authorName",
      anonymous, idea, status, reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt",
      created_at AS "createdAt" FROM ${suggestions}
      WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [guildId, Math.min(Math.max(Number(limit) || 30, 1), 100)]);
    return result.rows;
  }

  async function getSuggestion(guildId, id) {
    const result = await pool.query(`SELECT * FROM ${suggestions} WHERE guild_id = $1 AND id = $2`, [guildId, id]);
    return result.rows[0] || null;
  }

  async function reviewSuggestion(guildId, id, status, reviewedBy) {
    const reviewedAt = new Date().toISOString();
    await pool.query(`UPDATE ${suggestions} SET status = $1, reviewed_by = $2, reviewed_at = $3
      WHERE guild_id = $4 AND id = $5`, [status, reviewedBy, reviewedAt, guildId, id]);
    return reviewedAt;
  }

  async function recordCommandUsage(guildId, commandName, succeeded) {
    if (!guildId || !commandName) return;
    const day = new Date().toISOString().slice(0, 10);
    await pool.query(`INSERT INTO ${commandUsage}
      (day, guild_id, command_name, success_count, failure_count)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (day, guild_id, command_name) DO UPDATE SET
        success_count = ${commandUsage}.success_count + EXCLUDED.success_count,
        failure_count = ${commandUsage}.failure_count + EXCLUDED.failure_count`,
    [day, guildId, commandName, succeeded ? 1 : 0, succeeded ? 0 : 1]);
  }

  async function getCommandUsageStats() {
    const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [total, topCommands, dailyUsage] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(success_count + failure_count), 0)::int AS total,
        COALESCE(SUM(failure_count), 0)::int AS failures, COUNT(DISTINCT guild_id)::int AS "activeGuilds"
        FROM ${commandUsage} WHERE day >= $1`, [since]),
      pool.query(`SELECT command_name AS "commandName",
        SUM(success_count + failure_count)::int AS uses, SUM(failure_count)::int AS failures
        FROM ${commandUsage} WHERE day >= $1 GROUP BY command_name ORDER BY uses DESC, command_name LIMIT 8`, [since]),
      pool.query(`SELECT day, SUM(success_count + failure_count)::int AS uses
        FROM ${commandUsage} WHERE day >= $1 GROUP BY day ORDER BY day`, [since]),
    ]);
    return {
      totalCommands30d: total.rows[0].total,
      failedCommands30d: total.rows[0].failures,
      activeGuilds30d: total.rows[0].activeGuilds,
      topCommands: topCommands.rows,
      dailyUsage: dailyUsage.rows,
    };
  }

  function normalizeChange(row) {
    if (!row) return null;
    let details = {};
    try {
      const parsed = JSON.parse(row.details || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed;
    } catch { /* Donnée historique invalide. */ }
    return {
      ...row,
      details,
      backupFile: row.backupFile || null,
      reversible: row.reversible === 1,
      rolledBackAt: row.rolledBackAt || null,
      rolledBackBy: row.rolledBackBy || null,
    };
  }
  const changeFields = `id, guild_id AS "guildId", actor_id AS "actorId", actor_name AS "actorName",
    kind, title, summary, details, backup_file AS "backupFile", reversible, status,
    created_at AS "createdAt", rolled_back_at AS "rolledBackAt", rolled_back_by AS "rolledBackBy"`;

  async function getChange(guildId, id) {
    const result = await pool.query(`SELECT ${changeFields} FROM ${changeHistory}
      WHERE guild_id = $1 AND id = $2`, [String(guildId), String(id)]);
    return normalizeChange(result.rows[0]);
  }

  async function recordChange(guildId, input) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const reversible = input.reversible && input.backupFile ? 1 : 0;
    await pool.query(`INSERT INTO ${changeHistory}
      (id, guild_id, actor_id, actor_name, kind, title, summary, details, backup_file, reversible, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'applied', $11)`, [
      id, String(guildId), String(input.actorId || 'system'), String(input.actorName || 'FyxBot').slice(0, 100),
      String(input.kind || 'configuration').slice(0, 60), String(input.title || 'Modification FyxBot').slice(0, 160),
      String(input.summary || '').slice(0, 1000),
      JSON.stringify(input.details && typeof input.details === 'object' ? input.details : {}),
      input.backupFile ? String(input.backupFile) : null, reversible, now,
    ]);
    return getChange(guildId, id);
  }

  async function listChanges(guildId, limit = 30) {
    const result = await pool.query(`SELECT ${changeFields} FROM ${changeHistory}
      WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [String(guildId), Math.min(Math.max(Number(limit) || 30, 1), 100)]);
    return result.rows.map(normalizeChange);
  }

  async function markChangeRolledBack(guildId, id, actorName, { now = new Date() } = {}) {
    const result = await pool.query(`UPDATE ${changeHistory}
      SET status = 'rolled_back', rolled_back_at = $1, rolled_back_by = $2
      WHERE guild_id = $3 AND id = $4 AND status = 'applied' RETURNING id`,
    [now.toISOString(), String(actorName || 'FyxBot').slice(0, 100), String(guildId), String(id)]);
    return result.rows.length === 1;
  }

  return {
    addAuditLog, getRecentAuditLogs, addSuggestion, getRecentSuggestions, getSuggestion,
    reviewSuggestion, recordCommandUsage, getCommandUsageStats, getChange, recordChange,
    listChanges, markChangeRolledBack,
  };
}

module.exports = { createPostgresActivityStore };
