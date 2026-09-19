const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresDataRetentionStore } = require('../src/database/postgresDataRetentionStore');
const { purgeGuildData } = require('../src/services/dataRetention');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';

test('efface uniquement les données du serveur ciblé et anonymise son installation', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = { query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }) };
    const store = createPostgresDataRetentionStore(pool);
    for (const guildId of [GUILD_A, GUILD_B]) {
      await database.query(`INSERT INTO fyxbot.guild_installations
        (guild_id, guild_name, member_count, first_seen_at, last_seen_at)
        VALUES ($1, 'Serveur', 10, '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`, [guildId]);
      await database.query(`INSERT INTO fyxbot.configurations (guild_id, section, value, updated_at)
        VALUES ($1, 'logs', '{}', '2026-08-01T00:00:00.000Z')`, [guildId]);
      await database.query(`INSERT INTO fyxbot.support_requests
        (id, guild_id, guild_name, requester_id, requester_name, category, subject, priority,
         status, created_at, updated_at, last_message_at)
        VALUES ($1, $2, 'Serveur', 'user', 'User', 'technical', 'Question', 'normal', 'open',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      [`support-${guildId}`, guildId]);
      await database.query(`INSERT INTO fyxbot.support_messages
        (id, request_id, author_id, author_name, author_role, body, created_at)
        VALUES ($1, $2, 'user', 'User', 'user', 'Message', '2026-08-01T00:00:00.000Z')`,
      [`message-${guildId}`, `support-${guildId}`]);
      await database.query(`INSERT INTO fyxbot.community_giveaways
        (giveaway_id, guild_id, channel_id, message_id, prize, winner_count, ends_at, created_at)
        VALUES ($1, $2, 'channel', 'message', 'Lot', 1, '2026-08-03T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      [`giveaway-${guildId}`, guildId]);
      await database.query(`INSERT INTO fyxbot.community_giveaway_entries
        (giveaway_id, user_id, joined_at) VALUES ($1, 'user', '2026-08-01T00:00:00.000Z')`,
      [`giveaway-${guildId}`]);
    }
    await database.query(`INSERT INTO fyxbot.dashboard_sessions (token_hash, value, expires_at)
      VALUES ('hash', $1, 9999999999999)`, [JSON.stringify({ manageableGuildIds: [GUILD_A, GUILD_B] })]);
    const counts = await purgeGuildData(GUILD_A, { dataStore: store,
      anonymousId: () => 'removed:test', now: '2026-09-18T10:00:00.000Z',
      clearWarnings: async () => 0, deleteBackups: async () => 0,
    });
    assert.equal(counts.configurations, 1);
    assert.equal(counts.supportMessages, 1);
    assert.equal(counts.supportRequests, 1);
    assert.equal(counts.giveawayEntries, 1);
    assert.equal(counts.giveaways, 1);
    assert.equal(counts.sessions, 1);
    assert.equal(counts.warningFileEntries, 0);
    const configuration = await database.query('SELECT guild_id FROM fyxbot.configurations');
    assert.deepEqual(configuration.rows.map((row) => row.guild_id), [GUILD_B]);
    const requests = await database.query('SELECT guild_id FROM fyxbot.support_requests');
    assert.deepEqual(requests.rows.map((row) => row.guild_id), [GUILD_B]);
    const installation = await database.query('SELECT guild_id, first_seen_at, removed_at FROM fyxbot.guild_installations ORDER BY guild_id');
    assert.deepEqual(installation.rows.map((row) => row.guild_id), [GUILD_B, 'removed:test']);
    assert.equal(installation.rows[1].first_seen_at, '2026-08-01T00:00:00.000Z');
    const session = await database.query("SELECT value FROM fyxbot.dashboard_sessions WHERE token_hash = 'hash'");
    assert.deepEqual(JSON.parse(session.rows[0].value).manageableGuildIds, [GUILD_B]);
  } finally { await database.close(); }
});

test('refuse un identifiant non Discord et un schéma invalide', async () => {
  assert.throws(() => createPostgresDataRetentionStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresDataRetentionStore({ query() {}, connect() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    const pool = { query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }) };
    await assert.rejects(() => createPostgresDataRetentionStore(pool).purgeGuildDatabaseData('invalid'), /Identifiant de serveur/);
  } finally { await database.close(); }
});
