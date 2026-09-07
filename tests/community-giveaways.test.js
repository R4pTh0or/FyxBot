const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
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

test('enregistre une seule participation par membre', () => {
  const targetDatabase = createDatabase();
  const now = new Date('2026-08-25T08:30:00.000Z');
  const first = registerGiveawayEntry('giveaway-a', 'user-a', { targetDatabase, now });
  const second = registerGiveawayEntry('giveaway-a', 'user-a', { targetDatabase, now });
  assert.equal(first.joined, true);
  assert.equal(second.joined, false);
  assert.equal(second.participantCount, 1);
});

test('publie le résultat puis efface les identifiants des participants', async () => {
  const targetDatabase = createDatabase();
  for (const userId of ['user-a', 'user-b', 'user-c']) {
    registerGiveawayEntry('giveaway-a', userId, { targetDatabase, now: new Date('2026-08-25T08:30:00.000Z') });
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

test('reprend un tirage interrompu après un redémarrage', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("UPDATE community_giveaways SET status = 'drawing' WHERE giveaway_id = 'giveaway-a'").run();
  assert.equal(recoverInterruptedGiveaways({ targetDatabase }), 1);
  assert.equal(targetDatabase.prepare("SELECT status FROM community_giveaways WHERE giveaway_id = 'giveaway-a'").get().status, 'active');
});
