const assert = require('node:assert/strict');
const test = require('node:test');
const { migratePostgresSchemaV2, validatedSchema } = require('../scripts/migrate-postgres-schema-v2');

test('migre le schéma PostgreSQL V1 vers les accès Premium offerts de façon idempotente', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`
      CREATE SCHEMA fyxbot;
      CREATE TABLE fyxbot.fyxbot_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO fyxbot.fyxbot_schema_migrations VALUES (1, '2026-09-19T00:00:00.000Z');
    `);
    const createClient = async () => ({
      connect: async () => {},
      query: (sql, params) => database.query(sql, params),
      end: async () => {},
    });
    const first = await migratePostgresSchemaV2({
      environment: { FYXBOT_POSTGRES_SCHEMA: 'fyxbot' },
      createClient,
    });
    const second = await migratePostgresSchemaV2({
      environment: { FYXBOT_POSTGRES_SCHEMA: 'fyxbot' },
      createClient,
    });
    assert.deepEqual(first, { previousVersion: 1, version: 2, changed: true });
    assert.deepEqual(second, { previousVersion: 2, version: 2, changed: false });
    const table = await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'fyxbot' AND table_name = 'premium_manual_grants'");
    assert.equal(table.rows.length, 1);
    const versions = await database.query('SELECT version FROM fyxbot.fyxbot_schema_migrations ORDER BY version');
    assert.deepEqual(versions.rows.map((row) => row.version), [1, 2]);
  } finally {
    await database.close();
  }
});

test('refuse un schéma arbitraire et une base non initialisée', async () => {
  assert.throws(() => validatedSchema({ FYXBOT_POSTGRES_SCHEMA: 'public;drop' }), /invalide/);
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec('CREATE SCHEMA fyxbot; CREATE TABLE fyxbot.fyxbot_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);');
    await assert.rejects(() => migratePostgresSchemaV2({
      environment: { FYXBOT_POSTGRES_SCHEMA: 'fyxbot' },
      createClient: async () => ({
        connect: async () => {},
        query: (sql, params) => database.query(sql, params),
        end: async () => {},
      }),
    }), /V1 doit exister/);
  } finally {
    await database.close();
  }
});
