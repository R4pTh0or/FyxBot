const { resolveRuntimeStore } = require('./runtimeStorage');

const defaultStorage = {
  addAuditLog(guildId, { title, description, color }) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.addAuditLog(guildId, { title, description, color });
    const { database } = require('./database');
    database.prepare('INSERT INTO audit_logs (guild_id, title, description, color, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, title, description, color, new Date().toISOString());
  },
  getRecentAuditLogs(guildId, limit = 30) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.getRecentAuditLogs(guildId, limit);
    const { database } = require('./database');
    return database.prepare('SELECT id, title, description, color, created_at AS createdAt FROM audit_logs WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
      .all(guildId, Math.min(Math.max(limit, 1), 100));
  },
};

async function addAuditLog(guildId, entry, storage = defaultStorage) {
  return storage.addAuditLog(guildId, entry);
}

async function getRecentAuditLogs(guildId, limit = 30, storage = defaultStorage) {
  return storage.getRecentAuditLogs(guildId, limit);
}
module.exports = { addAuditLog, getRecentAuditLogs };
