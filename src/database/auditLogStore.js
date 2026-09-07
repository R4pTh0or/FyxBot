const { database } = require('./database');
function addAuditLog(guildId, { title, description, color }) { database.prepare('INSERT INTO audit_logs (guild_id, title, description, color, created_at) VALUES (?, ?, ?, ?, ?)').run(guildId, title, description, color, new Date().toISOString()); }
function getRecentAuditLogs(guildId, limit = 30) { return database.prepare('SELECT id, title, description, color, created_at AS createdAt FROM audit_logs WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, Math.min(Math.max(limit, 1), 100)); }
module.exports = { addAuditLog, getRecentAuditLogs };
