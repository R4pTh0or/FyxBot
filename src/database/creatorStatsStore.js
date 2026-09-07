const { database } = require('./database');
const { getCommandUsageStats } = require('./commandUsageStore');
const { ensureActivationTracking, getActivationStats } = require('./activationStore');

function recordGuild(guild) {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO guild_installations (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
    VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(guild_id) DO UPDATE SET guild_name=excluded.guild_name,
    member_count=excluded.member_count, last_seen_at=excluded.last_seen_at, removed_at=NULL`)
    .run(guild.id, guild.name, guild.memberCount || 0, now, now);
  ensureActivationTracking(guild.id, { now });
}

function markGuildRemoved(guild) {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO guild_installations (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET guild_name=excluded.guild_name,
    member_count=excluded.member_count, last_seen_at=excluded.last_seen_at, removed_at=excluded.removed_at`)
    .run(guild.id, guild.name, guild.memberCount || 0, now, now, now);
}

function syncCreatorStats(guilds) {
  const list = [...guilds];
  list.forEach(recordGuild);
  const guildCount = list.length;
  const memberCount = list.reduce((total, guild) => total + (guild.memberCount || 0), 0);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO creator_metrics (day, guild_count, member_count, recorded_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET guild_count=excluded.guild_count, member_count=excluded.member_count, recorded_at=excluded.recorded_at`)
    .run(now.slice(0, 10), guildCount, memberCount, now);
  return { guildCount, memberCount };
}

function getCreatorStats(guilds) {
  const list = [...guilds];
  const totals = syncCreatorStats(list);
  const activation = getActivationStats(list.map((guild) => guild.id));
  const activationByGuild = new Map(activation.guilds.map((guild) => [guild.guildId, guild]));
  const installations = database.prepare(`SELECT guild_id AS guildId, guild_name AS guildName, member_count AS memberCount,
    first_seen_at AS firstSeenAt FROM guild_installations WHERE removed_at IS NULL ORDER BY member_count DESC`).all();
  const enrichedInstallations = installations.map((installation) => ({
    ...installation,
    completedSteps: activationByGuild.get(installation.guildId)?.completedSteps || 0,
    totalSteps: activation.totalSteps,
    activated: activationByGuild.get(installation.guildId)?.activated || false,
    lastObservedAt: activationByGuild.get(installation.guildId)?.lastObservedAt || null,
  }));
  const history = database.prepare(`SELECT day, guild_count AS guildCount, member_count AS memberCount
    FROM creator_metrics ORDER BY day DESC LIMIT 30`).all().reverse();
  const allTime = database.prepare('SELECT COUNT(*) AS total FROM guild_installations').get().total;
  const removed = database.prepare('SELECT COUNT(*) AS total FROM guild_installations WHERE removed_at IS NOT NULL').get().total;
  const usage = getCommandUsageStats();
  const { guilds: _guildActivationRows, ...activationSummary } = activation;
  return {
    ...totals,
    allTime,
    removed,
    installations: enrichedInstallations,
    history,
    ...usage,
    commandActiveGuilds30d: usage.activeGuilds30d,
    activeGuilds30d: activation.activeGuilds30d,
    activation: activationSummary,
  };
}

module.exports = { getCreatorStats, markGuildRemoved, recordGuild, syncCreatorStats };
