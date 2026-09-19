const { randomUUID } = require('node:crypto');
const { resolveRuntimeStore } = require('../database/runtimeStorage');

function defaultDatabase() {
  return require('../database/database').database;
}

function removeGuildFromSessions(targetDatabase, guildId) {
  const rows = targetDatabase.prepare('SELECT token_hash, value FROM dashboard_sessions').all();
  let updated = 0;
  const statement = targetDatabase.prepare('UPDATE dashboard_sessions SET value = ? WHERE token_hash = ?');
  for (const row of rows) {
    let session;
    try {
      session = JSON.parse(row.value);
    } catch {
      continue;
    }
    const current = Array.isArray(session.manageableGuildIds) ? session.manageableGuildIds : [];
    const manageableGuildIds = current.filter((candidate) => candidate !== guildId);
    if (manageableGuildIds.length === current.length) continue;
    statement.run(JSON.stringify({ ...session, manageableGuildIds }), row.token_hash);
    updated += 1;
  }
  return updated;
}

function purgeGuildDatabaseData(guildId, {
  targetDatabase,
  anonymousId = () => `removed:${randomUUID()}`,
  now = new Date().toISOString(),
} = {}) {
  if (!/^\d{17,20}$/.test(String(guildId))) throw new Error('Identifiant de serveur invalide.');
  const activeDatabase = targetDatabase || defaultDatabase();
  const installation = activeDatabase.prepare('SELECT first_seen_at FROM guild_installations WHERE guild_id = ?').get(guildId);
  const counts = {};
  activeDatabase.exec('BEGIN IMMEDIATE');
  try {
    counts.configurations = activeDatabase.prepare('DELETE FROM configurations WHERE guild_id = ?').run(guildId).changes;
    counts.warnings = activeDatabase.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId).changes;
    counts.auditLogs = activeDatabase.prepare('DELETE FROM audit_logs WHERE guild_id = ?').run(guildId).changes;
    counts.changeHistory = activeDatabase.prepare('DELETE FROM change_history WHERE guild_id = ?').run(guildId).changes;
    counts.suggestions = activeDatabase.prepare('DELETE FROM suggestions WHERE guild_id = ?').run(guildId).changes;
    counts.commandUsage = activeDatabase.prepare('DELETE FROM command_usage WHERE guild_id = ?').run(guildId).changes;
    counts.activationProgress = activeDatabase.prepare('DELETE FROM guild_activation_progress WHERE guild_id = ?').run(guildId).changes;
    counts.premiumEntitlements = activeDatabase.prepare('DELETE FROM premium_entitlements WHERE guild_id = ?').run(guildId).changes;
    counts.premiumGuildLinks = activeDatabase.prepare('DELETE FROM premium_user_guilds WHERE guild_id = ?').run(guildId).changes;
    counts.twitchConnections = activeDatabase.prepare('DELETE FROM twitch_connections WHERE guild_id = ?').run(guildId).changes;
    counts.twitchOAuthStates = activeDatabase.prepare('DELETE FROM twitch_oauth_states WHERE guild_id = ?').run(guildId).changes;
    counts.twitchCommands = activeDatabase.prepare('DELETE FROM twitch_custom_commands WHERE guild_id = ?').run(guildId).changes;
    counts.twitchChatConfig = activeDatabase.prepare('DELETE FROM twitch_chat_config WHERE guild_id = ?').run(guildId).changes;
    counts.twitchRuntime = activeDatabase.prepare('DELETE FROM twitch_runtime_status WHERE guild_id = ?').run(guildId).changes;
    counts.twitchProcessedMessages = activeDatabase.prepare('DELETE FROM twitch_processed_messages WHERE guild_id = ?').run(guildId).changes;
    counts.twitchEventSubMessages = activeDatabase.prepare('DELETE FROM twitch_eventsub_messages WHERE guild_id = ?').run(guildId).changes;
    const supportRequestIds = activeDatabase.prepare('SELECT id FROM support_requests WHERE guild_id = ?').all(guildId).map((row) => row.id);
    counts.supportMessages = supportRequestIds.reduce((total, requestId) => total
      + activeDatabase.prepare('DELETE FROM support_messages WHERE request_id = ?').run(requestId).changes, 0);
    counts.supportEvents = supportRequestIds.reduce((total, requestId) => total
      + activeDatabase.prepare('DELETE FROM support_events WHERE request_id = ?').run(requestId).changes, 0);
    counts.supportRequests = activeDatabase.prepare('DELETE FROM support_requests WHERE guild_id = ?').run(guildId).changes;
    const giveawayIds = activeDatabase.prepare('SELECT giveaway_id FROM community_giveaways WHERE guild_id = ?').all(guildId).map((row) => row.giveaway_id);
    counts.giveawayEntries = giveawayIds.reduce((total, giveawayId) => total
      + activeDatabase.prepare('DELETE FROM community_giveaway_entries WHERE giveaway_id = ?').run(giveawayId).changes, 0);
    counts.giveaways = activeDatabase.prepare('DELETE FROM community_giveaways WHERE guild_id = ?').run(guildId).changes;
    counts.sessions = removeGuildFromSessions(activeDatabase, guildId);
    activeDatabase.prepare('DELETE FROM guild_installations WHERE guild_id = ?').run(guildId);
    activeDatabase.prepare(`INSERT INTO guild_installations
      (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
      VALUES (?, 'Serveur supprimé', 0, ?, ?, ?)`)
      .run(anonymousId(), installation?.first_seen_at || now, now, now);
    activeDatabase.exec('COMMIT');
  } catch (error) {
    activeDatabase.exec('ROLLBACK');
    throw error;
  }
  return counts;
}

async function purgeGuildData(guildId, {
  targetDatabase,
  dataStore,
  clearWarnings,
  deleteBackups,
  anonymousId,
  now,
} = {}) {
  dataStore = resolveRuntimeStore('dataRetention', dataStore);
  if (dataStore && targetDatabase) throw new Error('Choisissez un seul magasin de données pour la purge.');
  const warningCleaner = clearWarnings || require('../database/warningStore').clearGuildWarnings;
  const backupCleaner = deleteBackups || require('./serverBackup').deleteServerBackups;
  const counts = dataStore
    ? await dataStore.purgeGuildDatabaseData(guildId, { anonymousId, now })
    : purgeGuildDatabaseData(guildId, { targetDatabase: targetDatabase || defaultDatabase(), anonymousId, now });
  const [warningCount, backupCount] = await Promise.all([
    warningCleaner(guildId),
    backupCleaner(guildId),
  ]);
  return { ...counts, warningFileEntries: warningCount, localBackups: backupCount };
}

module.exports = { purgeGuildData, purgeGuildDatabaseData, removeGuildFromSessions };
