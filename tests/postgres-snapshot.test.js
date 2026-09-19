const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL, POSTGRES_SCHEMA_VERSION, POSTGRES_TABLES } = require('../src/database/postgresSchema');
const { exportPostgresSnapshot, restorePostgresSnapshot } = require('../src/database/postgresSnapshot');
const { createPostgresExternalBackup, restorePostgresExternalBackup } = require('../src/services/externalBackup');

function poolFor(database) {
  return { connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }) };
}

test('exporte un instantané cohérent et le restaure dans un schéma vide', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const source = await PGlite.create();
  const target = await PGlite.create();
  const remoteTarget = await PGlite.create();
  try {
    await source.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    await source.query('INSERT INTO fyxbot.fyxbot_schema_migrations (version, applied_at) VALUES ($1, $2)',
      [POSTGRES_SCHEMA_VERSION, '2026-09-18T00:00:00.000Z']);
    await source.query(`INSERT INTO fyxbot.configurations (guild_id, section, value, updated_at)
      VALUES ('guild-a', 'rules', '{"accepted":true}', '2026-09-18T00:00:00.000Z')`);
    await source.query(`INSERT INTO fyxbot.audit_logs (guild_id, title, description, color, created_at)
      VALUES ('guild-a', 'Test', 'Sauvegarde', 123, '2026-09-18T00:00:00.000Z')`);
    const snapshot = await exportPostgresSnapshot(poolFor(source));
    assert.equal(Object.keys(snapshot.tables).length, POSTGRES_TABLES.length);
    assert.equal(snapshot.tables.configurations.length, 1);
    assert.equal(snapshot.tables.audit_logs.length, 1);

    const counts = await restorePostgresSnapshot(poolFor(target), snapshot);
    assert.equal(counts.configurations, 1);
    assert.equal(counts.audit_logs, 1);
    const restored = await target.query('SELECT value FROM fyxbot.configurations WHERE guild_id = $1', ['guild-a']);
    assert.equal(JSON.parse(restored.rows[0].value).accepted, true);
    const nextId = await target.query(`INSERT INTO fyxbot.audit_logs
      (guild_id, title, description, color, created_at) VALUES ('guild-a', 'Suivant', 'Test', 1, '2026-09-18T00:00:00.000Z') RETURNING id`);
    assert.equal(Number(nextId.rows[0].id), 2);
    await assert.rejects(() => restorePostgresSnapshot(poolFor(target), snapshot), /déjà/);

    const key = crypto.randomBytes(32);
    const config = { bucket: 'test', prefix: 'fyxbot/weekly', encryptionKey: key, retention: 8 };
    let remoteBody;
    const s3 = { async send(command) {
      if (command.constructor.name === 'PutObjectCommand') {
        remoteBody = command.input.Body;
        return {};
      }
      if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: remoteBody.length };
      if (command.constructor.name === 'ListObjectsV2Command') {
        assert.equal(command.input.Prefix, 'fyxbot/weekly/postgres/');
        return { Contents: [] };
      }
      throw new Error(`Commande inattendue : ${command.constructor.name}`);
    } };
    const remote = await createPostgresExternalBackup(config, { pool: poolFor(source), s3 });
    assert.match(remote.key, /^fyxbot\/weekly\/postgres\/.*\.json\.gz\.enc$/);
    assert.ok(remoteBody.length > 0);
    const remoteCounts = await restorePostgresExternalBackup(remoteBody, key, poolFor(remoteTarget));
    assert.equal(remoteCounts.configurations, 1);
    await assert.rejects(() => restorePostgresExternalBackup(remoteBody, crypto.randomBytes(32), poolFor(remoteTarget)));
  } finally {
    await source.close();
    await target.close();
    await remoteTarget.close();
  }
});

test('refuse une sauvegarde incomplète avant toute restauration', async () => {
  await assert.rejects(() => restorePostgresSnapshot(null, {
    format: 'fyxbot-postgres-v1', schemaVersion: POSTGRES_SCHEMA_VERSION, tables: {},
  }), /incomplète/);
});
