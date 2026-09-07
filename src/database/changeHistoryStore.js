const { randomUUID } = require('node:crypto');
const { database } = require('./database');

function activeDatabase(targetDatabase) {
  return targetDatabase || database;
}

function parseDetails(value) {
  try {
    const details = JSON.parse(value || '{}');
    return details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  } catch {
    return {};
  }
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guildId,
    actorId: row.actorId,
    actorName: row.actorName,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    details: parseDetails(row.details),
    backupFile: row.backupFile || null,
    reversible: row.reversible === 1,
    status: row.status,
    createdAt: row.createdAt,
    rolledBackAt: row.rolledBackAt || null,
    rolledBackBy: row.rolledBackBy || null,
  };
}

const SELECT_FIELDS = `id, guild_id AS guildId, actor_id AS actorId, actor_name AS actorName,
  kind, title, summary, details, backup_file AS backupFile, reversible, status,
  created_at AS createdAt, rolled_back_at AS rolledBackAt, rolled_back_by AS rolledBackBy`;

function recordChange(guildId, input, { targetDatabase } = {}) {
  const store = activeDatabase(targetDatabase);
  const now = new Date().toISOString();
  const id = randomUUID();
  store.prepare(`INSERT INTO change_history
    (id, guild_id, actor_id, actor_name, kind, title, summary, details, backup_file, reversible, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?)`)
    .run(
      id,
      String(guildId),
      String(input.actorId || 'system'),
      String(input.actorName || 'FyxBot').slice(0, 100),
      String(input.kind || 'configuration').slice(0, 60),
      String(input.title || 'Modification FyxBot').slice(0, 160),
      String(input.summary || '').slice(0, 1000),
      JSON.stringify(input.details && typeof input.details === 'object' ? input.details : {}),
      input.backupFile ? String(input.backupFile) : null,
      input.reversible && input.backupFile ? 1 : 0,
      now,
    );
  return getChange(guildId, id, { targetDatabase: store });
}

function getChange(guildId, id, { targetDatabase } = {}) {
  const row = activeDatabase(targetDatabase)
    .prepare(`SELECT ${SELECT_FIELDS} FROM change_history WHERE guild_id = ? AND id = ?`)
    .get(String(guildId), String(id));
  return normalizeRow(row);
}

function listChanges(guildId, limit = 30, { targetDatabase } = {}) {
  return activeDatabase(targetDatabase)
    .prepare(`SELECT ${SELECT_FIELDS} FROM change_history WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(String(guildId), Math.min(Math.max(Number(limit) || 30, 1), 100))
    .map(normalizeRow);
}

function markChangeRolledBack(guildId, id, actorName, { targetDatabase, now = new Date() } = {}) {
  const result = activeDatabase(targetDatabase).prepare(`UPDATE change_history
    SET status = 'rolled_back', rolled_back_at = ?, rolled_back_by = ?
    WHERE guild_id = ? AND id = ? AND status = 'applied'`)
    .run(now.toISOString(), String(actorName || 'FyxBot').slice(0, 100), String(guildId), String(id));
  return result.changes === 1;
}

module.exports = {
  getChange,
  listChanges,
  markChangeRolledBack,
  parseDetails,
  recordChange,
};
