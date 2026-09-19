const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresGiveawayStore } = require('../src/database/postgresGiveawayStore');

test('isole les concours, déduplique les participants et rend le tirage exclusif', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = { query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }) };
    const store = createPostgresGiveawayStore(pool);
    const giveaway = {
      giveawayId: 'giveaway-a', guildId: 'guild-a', channelId: 'channel-a', messageId: 'message-a',
      prize: 'Un lot', winnerCount: 1, endsAt: '2026-08-25T12:00:00.000Z',
      createdAt: '2026-08-25T10:00:00.000Z',
    };
    await store.createGiveaway(giveaway);
    await store.createGiveaway({ ...giveaway, giveawayId: 'giveaway-b', guildId: 'guild-b' });
    assert.equal((await store.listGuildGiveaways('guild-a')).length, 1);
    assert.equal((await store.listGuildGiveaways('guild-b')).length, 1);
    const joined = await store.registerGiveawayEntry('giveaway-a', 'user-a', { now: '2026-08-25T11:00:00.000Z' });
    const repeated = await store.registerGiveawayEntry('giveaway-a', 'user-a', { now: '2026-08-25T11:01:00.000Z' });
    assert.equal(joined.joined, true);
    assert.equal(repeated.joined, false);
    assert.equal(repeated.participantCount, 1);
    assert.equal((await store.getGiveaway('giveaway-a')).participantCount, 1);
    assert.equal((await store.listDueGiveaways({ now: '2026-08-25T11:59:00.000Z' })).length, 0);
    assert.equal((await store.listDueGiveaways({ now: '2026-08-25T12:01:00.000Z' })).length, 2);
    const claimed = await store.claimGiveaway('giveaway-a');
    assert.deepEqual(claimed.userIds, ['user-a']);
    assert.equal(await store.claimGiveaway('giveaway-a'), null);
    await assert.rejects(() => store.registerGiveawayEntry('giveaway-a', 'user-b', { now: '2026-08-25T11:00:00.000Z' }), /plus ouvert/);
    assert.equal(await store.completeGiveaway('giveaway-a', { now: '2026-08-25T12:01:00.000Z' }), true);
    assert.equal(await store.completeGiveaway('giveaway-a'), false);
    assert.equal((await store.getGiveaway('giveaway-a')).status, 'ended');
    assert.equal((await store.getGiveaway('giveaway-a')).participantCount, 0);
    assert.equal(await store.recoverInterruptedGiveaways(), 0);
    await store.claimGiveaway('giveaway-b');
    assert.equal(await store.resetDrawing('giveaway-b'), true);
    assert.equal(await store.resetDrawing('giveaway-b'), false);
  } finally { await database.close(); }
});

test('refuse les schémas SQL arbitraires', () => {
  assert.throws(() => createPostgresGiveawayStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresGiveawayStore({ query() {}, connect() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
});
