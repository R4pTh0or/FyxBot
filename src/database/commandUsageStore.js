const { database } = require('./database');

function recordCommandUsage(guildId, commandName, succeeded) {
  if (!guildId || !commandName) return;
  const day = new Date().toISOString().slice(0, 10);
  database.prepare(`INSERT INTO command_usage (day, guild_id, command_name, success_count, failure_count)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(day, guild_id, command_name) DO UPDATE SET
    success_count=success_count+excluded.success_count, failure_count=failure_count+excluded.failure_count`)
    .run(day, guildId, commandName, succeeded ? 1 : 0, succeeded ? 0 : 1);
}

function getCommandUsageStats() {
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const total = database.prepare(`SELECT COALESCE(SUM(success_count + failure_count), 0) AS total,
    COALESCE(SUM(failure_count), 0) AS failures, COUNT(DISTINCT guild_id) AS activeGuilds
    FROM command_usage WHERE day >= ?`).get(since);
  const topCommands = database.prepare(`SELECT command_name AS commandName,
    SUM(success_count + failure_count) AS uses, SUM(failure_count) AS failures
    FROM command_usage WHERE day >= ? GROUP BY command_name ORDER BY uses DESC, command_name LIMIT 8`).all(since);
  const dailyUsage = database.prepare(`SELECT day, SUM(success_count + failure_count) AS uses
    FROM command_usage WHERE day >= ? GROUP BY day ORDER BY day`).all(since);
  return { totalCommands30d: total.total, failedCommands30d: total.failures, activeGuilds30d: total.activeGuilds, topCommands, dailyUsage };
}

module.exports = { getCommandUsageStats, recordCommandUsage };
