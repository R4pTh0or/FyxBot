const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresGiveawayStore } = require('../src/database/postgresGiveawayStore');
const {
  finalizeDueGiveaways,
  recoverInterruptedGiveaways,
  registerGiveawayEntry,
} = require('../src/services/communityGiveaways');

function createDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`
    CREATE TABLE community_giveaways (
      giveaway_id TEXT PRIMARY KEY, guild_id TEXT, channel_id TEXT, message_id TEXT,
      prize TEXT, winner_count INTEGER, ends_at TEXT, status TEXT, created_at TEXT, ended_at TEXT
    );
    CREATE TABLE community_giveaway_entries (
      giveaway_id TEXT, user_id TEXT, joined_at TEXT, PRIMARY KEY (giveaway_id, user_id)
    );
  `);
  targetDatabase.prepare(`INSERT INTO community_giveaways VALUES
    ('giveaway-a', 'guild-a', 'channel-a', 'message-a', 'Grade VIP', 2,
    '2026-08-25T09:00:00.000Z', 'active', '2026-08-25T08:00:00.000Z', NULL)`).run();
  return targetDatabase;
}

test('enregistre une seule participation par membre', async () => {
  const targetDatabase = createDatabase();
  const now = new Date('2026-08-25T08:30:00.000Z');
  const first = await registerGiveawayEntry('giveaway-a', 'user-a', { targetDatabase, now });
  const second = await registerGiveawayEntry('giveaway-a', 'user-a', { targetDatabase, now });
  assert.equal(first.joined, true);
  assert.equal(second.joined, false);
  assert.equal(second.participantCount, 1);
});

test('publie le résultat puis efface les identifiants des participants', async () => {
  const targetDatabase = createDatabase();
  for (const userId of ['user-a', 'user-b', 'user-c']) {
    await registerGiveawayEntry('giveaway-a', userId, { targetDatabase, now: new Date('2026-08-25T08:30:00.000Z') });
  }
  const edits = [];
  const announcements = [];
  const channel = {
    guildId: 'guild-a',
    isTextBased: () => true,
    messages: { fetch: async () => ({ edit: async (payload) => edits.push(payload) }) },
    send: async (payload) => announcements.push(payload),
  };
  const client = { channels: { fetch: async () => channel } };
  const results = await finalizeDueGiveaways(client, {
    targetDatabase,
    now: new Date('2026-08-25T09:01:00.000Z'),
    randomIndex: () => 0,
  });
  assert.deepEqual(results[0].winners, ['user-a', 'user-b']);
  assert.equal(edits.length, 1);
  assert.equal(announcements.length, 1);
  assert.deepEqual(announcements[0].allowedMentions, { users: ['user-a', 'user-b'] });
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM community_giveaway_entries').get().total, 0);
  assert.equal(targetDatabase.prepare("SELECT status FROM community_giveaways WHERE giveaway_id = 'giveaway-a'").get().status, 'ended');
});

test('reprend un tirage interrompu après un redémarrage', async () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("UPDATE community_giveaways SET status = 'drawing' WHERE giveaway_id = 'giveaway-a'").run();
  assert.equal(await recoverInterruptedGiveaways({ targetDatabase }), 1);
  assert.equal(targetDatabase.prepare("SELECT status FROM community_giveaways WHERE giveaway_id = 'giveaway-a'").get().status, 'active');
});

test('publie et clôture un concours via PostgreSQL sans toucher à SQLite', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }),
    };
    const storage = createPostgresGiveawayStore(pool);
    await storage.createGiveaway({
      giveawayId: 'giveaway-pg', guildId: 'guild-a', channelId: 'channel-a', messageId: 'message-a',
      prize: 'Grade VIP', winnerCount: 1, endsAt: '2026-08-25T09:00:00.000Z', createdAt: '2026-08-25T08:00:00.000Z',
    });
    const registered = await registerGiveawayEntry('giveaway-pg', 'user-a', {
      storage, now: new Date('2026-08-25T08:30:00.000Z'),
    });
    assert.equal(registered.joined, true);
    const announcements = [];
    const channel = {
      guildId: 'guild-a', isTextBased: () => true,
      messages: { fetch: async () => ({ edit: async () => {} }) },
      send: async (payload) => announcements.push(payload),
    };
    const client = { channels: { fetch: async () => channel } };
    const result = await finalizeDueGiveaways(client, {
      storage, now: new Date('2026-08-25T09:01:00.000Z'), randomIndex: () => 0,
    });
    assert.deepEqual(result[0].winners, ['user-a']);
    assert.equal(announcements.length, 1);
    assert.equal((await storage.getGiveaway('giveaway-pg')).status, 'ended');
  } finally {
    await database.close();
  }
});
