const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresFounderAccessStore } = require('../src/database/postgresFounderAccessStore');

function snowflake(index, prefix = '1') {
  return `${prefix}${String(index).padStart(17, '0')}`;
}

test('attribue une seule période Fondateur par personne et l’étend à plusieurs serveurs', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }),
    };
    const store = createPostgresFounderAccessStore(pool);
    const userId = snowflake(1);
    const firstGuild = snowflake(1, '2');
    const secondGuild = snowflake(2, '2');
    const first = await store.claimFounderAccess(userId, firstGuild, { now: '2026-08-26T10:00:00.000Z' });
    const second = await store.claimFounderAccess(userId, secondGuild, { now: '2026-08-27T10:00:00.000Z' });
    assert.equal(first.created, true);
    assert.equal(first.endsAt, '2026-09-25T10:00:00.000Z');
    assert.equal(second.created, false);
    assert.equal(second.claimed, 1);
    assert.equal((await store.getFounderProgramState(userId, firstGuild, { now: '2026-08-28T10:00:00.000Z' })).guildActive, true);
    assert.equal((await store.getFounderProgramState(userId, secondGuild, { now: '2026-08-28T10:00:00.000Z' })).guildActive, true);
    const expired = await store.getFounderProgramState(userId, firstGuild, { now: '2026-10-01T10:00:00.000Z' });
    assert.equal(expired.userExpired, true);
    assert.equal(expired.guildActive, false);
    await assert.rejects(() => store.claimFounderAccess(userId, firstGuild, { now: '2026-10-01T10:00:00.000Z' }),
      (error) => error.code === 'FOUNDER_EXPIRED');

    await store.claimFounderAccess(snowflake(2), firstGuild, { now: '2026-08-26T10:00:00.000Z', limit: 2 });
    await assert.rejects(() => store.claimFounderAccess(snowflake(3), firstGuild, { now: '2026-08-26T10:00:00.000Z', limit: 2 }),
      (error) => error.code === 'FOUNDER_FULL');
    const rows = await database.query('SELECT COUNT(*)::int AS total FROM fyxbot.premium_founder_trials');
    assert.equal(rows.rows[0].total, 2);
  } finally { await database.close(); }
});

test('refuse les identifiants, durées et schémas invalides', async () => {
  assert.throws(() => createPostgresFounderAccessStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresFounderAccessStore({ query() {}, connect() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = { query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }) };
    const store = createPostgresFounderAccessStore(pool);
    await assert.rejects(() => store.claimFounderAccess('invalid', snowflake(1)), (error) => error.code === 'INVALID_ID');
    await assert.rejects(() => store.claimFounderAccess(snowflake(1), snowflake(2), { durationDays: 0 }),
      (error) => error.code === 'INVALID_DURATION');
  } finally { await database.close(); }
});
