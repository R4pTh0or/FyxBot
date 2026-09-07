const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { purgeGuildData } = require('../src/services/dataRetention');

function createDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`
    CREATE TABLE configurations (guild_id TEXT, section TEXT, value TEXT, updated_at TEXT);
    CREATE TABLE warnings (id TEXT, guild_id TEXT, user_id TEXT, moderator_id TEXT, reason TEXT, created_at TEXT);
    CREATE TABLE dashboard_sessions (token_hash TEXT PRIMARY KEY, value TEXT, expires_at INTEGER);
    CREATE TABLE audit_logs (id INTEGER, guild_id TEXT, title TEXT, description TEXT, color INTEGER, created_at TEXT);
    CREATE TABLE change_history (id TEXT, guild_id TEXT);
    CREATE TABLE suggestions (id TEXT, guild_id TEXT, channel_id TEXT, message_id TEXT, author_id TEXT, author_name TEXT, anonymous INTEGER, idea TEXT, status TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT);
    CREATE TABLE guild_installations (guild_id TEXT PRIMARY KEY, guild_name TEXT, member_count INTEGER, first_seen_at TEXT, last_seen_at TEXT, removed_at TEXT);
    CREATE TABLE command_usage (day TEXT, guild_id TEXT, command_name TEXT, success_count INTEGER, failure_count INTEGER);
    CREATE TABLE guild_activation_progress (guild_id TEXT PRIMARY KEY, tracking_started_at TEXT, last_observed_at TEXT, completed_steps INTEGER, step_keys TEXT, activated_at TEXT, baseline INTEGER);
    CREATE TABLE premium_entitlements (entitlement_id TEXT PRIMARY KEY, sku_id TEXT, user_id TEXT, guild_id TEXT, starts_at TEXT, ends_at TEXT, deleted INTEGER, test INTEGER, observed_at TEXT);
    CREATE TABLE premium_user_guilds (user_id TEXT, guild_id TEXT, linked_at TEXT, PRIMARY KEY (user_id, guild_id));
    CREATE TABLE community_giveaways (giveaway_id TEXT PRIMARY KEY, guild_id TEXT, channel_id TEXT, message_id TEXT, prize TEXT, winner_count INTEGER, ends_at TEXT, status TEXT, created_at TEXT, ended_at TEXT);
    CREATE TABLE community_giveaway_entries (giveaway_id TEXT, user_id TEXT, joined_at TEXT, PRIMARY KEY (giveaway_id, user_id));
    CREATE TABLE support_requests (id TEXT PRIMARY KEY, guild_id TEXT);
    CREATE TABLE support_messages (id TEXT PRIMARY KEY, request_id TEXT);
    CREATE TABLE support_events (id TEXT PRIMARY KEY, request_id TEXT);
  `);
  return targetDatabase;
}

test('supprime les données du serveur et conserve uniquement une statistique anonymisée', async () => {
  const guildId = '123456789012345678';
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO configurations VALUES (?, 'birthdays', '{}', '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO warnings VALUES ('warn', ?, 'user', 'mod', 'raison', '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO audit_logs VALUES (1, ?, 'titre', 'description', 1, '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO change_history VALUES ('change', ?)").run(guildId);
  targetDatabase.prepare("INSERT INTO suggestions VALUES ('idea', ?, 'channel', 'message', 'user', 'User', 0, 'idée', 'pending', NULL, NULL, '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO guild_installations VALUES (?, 'Serveur privé', 42, '2026-08-01', '2026-08-24', NULL)").run(guildId);
  targetDatabase.prepare("INSERT INTO command_usage VALUES ('2026-08-24', ?, 'ping', 1, 0)").run(guildId);
  targetDatabase.prepare("INSERT INTO guild_activation_progress VALUES (?, '2026-08-24', '2026-08-24', 4, '[\"logs\"]', '2026-08-24', 0)").run(guildId);
  targetDatabase.prepare("INSERT INTO premium_entitlements VALUES ('entitlement', 'sku', NULL, ?, NULL, NULL, 0, 1, '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO premium_user_guilds VALUES ('111111111111111111', ?, '2026-08-24')").run(guildId);
  targetDatabase.prepare("INSERT INTO community_giveaways VALUES ('giveaway', ?, 'channel', 'message', 'Lot', 1, '2026-08-25', 'active', '2026-08-24', NULL)").run(guildId);
  targetDatabase.prepare("INSERT INTO community_giveaway_entries VALUES ('giveaway', 'user', '2026-08-24')").run();
  targetDatabase.prepare("INSERT INTO support_requests VALUES ('support', ?)").run(guildId);
  targetDatabase.prepare("INSERT INTO support_messages VALUES ('support-message', 'support')").run();
  targetDatabase.prepare("INSERT INTO support_events VALUES ('support-event', 'support')").run();
  targetDatabase.prepare('INSERT INTO dashboard_sessions VALUES (?, ?, ?)').run(
    'session',
    JSON.stringify({ user: { id: 'user' }, manageableGuildIds: [guildId, '987654321098765432'] }),
    Date.now() + 1_000,
  );

  const calls = [];
  const result = await purgeGuildData(guildId, {
    targetDatabase,
    anonymousId: () => 'removed:test',
    now: '2026-08-24T12:00:00.000Z',
    clearWarnings: async (id) => { calls.push(['warnings', id]); return 3; },
    deleteBackups: async (id) => { calls.push(['backups', id]); return 2; },
  });

  for (const table of ['configurations', 'warnings', 'audit_logs', 'change_history', 'suggestions', 'command_usage', 'guild_activation_progress', 'premium_entitlements', 'premium_user_guilds']) {
    assert.equal(targetDatabase.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE guild_id = ?`).get(guildId).total, 0);
  }
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM community_giveaways WHERE guild_id = ?').get(guildId).total, 0);
  assert.equal(targetDatabase.prepare("SELECT COUNT(*) AS total FROM community_giveaway_entries WHERE giveaway_id = 'giveaway'").get().total, 0);
  assert.equal(targetDatabase.prepare("SELECT COUNT(*) AS total FROM support_requests WHERE guild_id = ?").get(guildId).total, 0);
  assert.equal(targetDatabase.prepare("SELECT COUNT(*) AS total FROM support_messages WHERE request_id = 'support'").get().total, 0);
  assert.equal(targetDatabase.prepare("SELECT COUNT(*) AS total FROM support_events WHERE request_id = 'support'").get().total, 0);
  assert.equal(result.giveaways, 1);
  assert.equal(result.giveawayEntries, 1);
  assert.equal(result.supportRequests, 1);
  assert.equal(result.supportMessages, 1);
  assert.equal(result.supportEvents, 1);
  assert.equal(result.premiumGuildLinks, 1);
  assert.deepEqual({ ...targetDatabase.prepare('SELECT guild_id, guild_name, member_count, removed_at FROM guild_installations').get() }, {
    guild_id: 'removed:test',
    guild_name: 'Serveur supprimé',
    member_count: 0,
    removed_at: '2026-08-24T12:00:00.000Z',
  });
  assert.deepEqual(JSON.parse(targetDatabase.prepare('SELECT value FROM dashboard_sessions').get().value).manageableGuildIds, ['987654321098765432']);
  assert.deepEqual(calls, [['warnings', guildId], ['backups', guildId]]);
  assert.equal(result.warningFileEntries, 3);
  assert.equal(result.localBackups, 2);
});
