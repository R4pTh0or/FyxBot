const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  POSTGRES_SCHEMA_SQL,
  POSTGRES_TABLES,
} = require('../src/database/postgresSchema');
const {
  assertSchemaCompatibility,
  declaredPostgresColumns,
  inspectSqlite,
  migrate,
  parseArguments,
  placeholders,
  quoteIdentifier,
} = require('../scripts/migrate-sqlite-to-postgres');
const { assertRuntimeBackendReady } = require('../src/database/runtimeBackend');

function removeFixtureDirectory(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('fyxbot-pg-')) {
    throw new Error('Nettoyage de test refusé : dossier temporaire inattendu.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('le schéma PostgreSQL couvre toutes les tables FyxBot attendues', () => {
  for (const table of POSTGRES_TABLES) {
    assert.match(POSTGRES_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`));
  }
  assert.match(POSTGRES_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS fyxbot_schema_migrations/);
});

test('le mode PostgreSQL refuse tout accès SQLite sans créer de fichier local', () => {
  const dataDirectory = path.join(os.tmpdir(), `fyxbot-pg-guard-${randomUUID()}`);
  const databaseModule = path.resolve(__dirname, '../src/database/database.js');
  const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', databaseModule], {
    env: { ...process.env, FYXBOT_STORAGE_BACKEND: 'postgres', FYXBOT_DATA_DIR: dataDirectory },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Accès SQLite interdit en mode PostgreSQL/);
  assert.equal(fs.existsSync(dataDirectory), false);
});

test('le bot refuse une bascule PostgreSQL incomplète avant de se connecter à Discord', () => {
  assert.throws(
    () => assertRuntimeBackendReady({ FYXBOT_STORAGE_BACKEND: 'postgres' }),
    /Bascule PostgreSQL incomplète/,
  );
  assert.doesNotThrow(() => assertRuntimeBackendReady({ FYXBOT_STORAGE_BACKEND: 'sqlite' }));
  const dataDirectory = path.join(os.tmpdir(), `fyxbot-pg-start-${randomUUID()}`);
  const entrypoint = path.resolve(__dirname, '../src/index.js');
  const result = spawnSync(process.execPath, [entrypoint], {
    env: { ...process.env, DISCORD_TOKEN: 'local-test-token', FYXBOT_POSTGRES_URL: '',
      FYXBOT_STORAGE_BACKEND: 'postgres', FYXBOT_DATA_DIR: dataDirectory },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(dataDirectory), false);
});

test('les options de migration sont sûres par défaut', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    dryRun: true,
    schema: 'fyxbot',
    sqlite: '',
  });
  assert.throws(() => parseArguments(['--apply', '--dry-run']), /pas les deux/);
  assert.throws(() => parseArguments(['--schema', 'public;drop schema public']), /invalide/);
});

test('les identifiants et paramètres SQL sont générés sans concaténation libre', () => {
  assert.equal(quoteIdentifier('support_messages'), '"support_messages"');
  assert.throws(() => quoteIdentifier('support_messages; DROP TABLE x'), /invalide/);
  assert.equal(placeholders(2, 3), '($1, $2, $3), ($4, $5, $6)');
});

test('le contrôle local vérifie SQLite et inventorie uniquement les tables connues', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-pg-migration-'));
  const filename = path.join(directory, 'source.sqlite');
  const database = new DatabaseSync(filename);
  database.exec(`
    CREATE TABLE configurations (guild_id TEXT NOT NULL, section TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (guild_id, section));
    CREATE TABLE table_non_fyxbot (id TEXT PRIMARY KEY);
  `);
  database.prepare('INSERT INTO configurations VALUES (?, ?, ?, ?)').run('1', 'logs', '{}', '2026-09-15T00:00:00.000Z');
  database.close();

  const inspected = inspectSqlite(filename);
  try {
    assert.deepEqual(inspected.tables.map((table) => table.name), ['configurations']);
    assert.equal(inspected.tables[0].count, 1);
    assert.deepEqual(inspected.tables[0].columns, ['guild_id', 'section', 'value', 'updated_at']);
  } finally {
    inspected.database.close();
    removeFixtureDirectory(directory);
  }
});

test('une table ou colonne absente bloque la migration avant toute connexion PostgreSQL', () => {
  assert.throws(() => assertSchemaCompatibility([]), /Tables SQLite absentes/);
  const tables = POSTGRES_TABLES.map((name) => ({ name, columns: declaredPostgresColumns(name) }));
  assert.doesNotThrow(() => assertSchemaCompatibility(tables));
  tables[0].columns = tables[0].columns.filter((name) => name !== 'guild_id');
  assert.throws(() => assertSchemaCompatibility(tables), /Colonnes incompatibles pour configurations/);
});

test('la répétition à blanc travaille sur une sauvegarde SQLite temporaire', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-pg-rehearsal-'));
  const filename = path.join(directory, 'source.sqlite');
  const database = new DatabaseSync(filename);
  let closed = false;
  try {
    for (const table of POSTGRES_TABLES) {
      const columns = declaredPostgresColumns(table).map((name) => `"${name}" TEXT`).join(', ');
      database.exec(`CREATE TABLE "${table}" (${columns})`);
    }
    database.prepare('INSERT INTO configurations (guild_id, section, value, updated_at) VALUES (?, ?, ?, ?)')
      .run('123', 'logs', '{}', '2026-09-16T00:00:00.000Z');
    database.prepare('INSERT INTO warnings (id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('stale', '123', 'member-1', 'mod-1', 'Ancien avertissement', '2026-09-15T00:00:00.000Z');
    database.close();
    closed = true;

    const result = await migrate({ dryRun: true, apply: false, schema: 'fyxbot', sqlite: filename });
    assert.equal(result.tableCount, POSTGRES_TABLES.length);
    assert.equal(result.totalRows, 1);
    assert.equal(result.tables.find((table) => table.name === 'configurations').count, 1);
    assert.equal(result.tables.find((table) => table.name === 'warnings').count, 0);
    assert.ok(fs.existsSync(filename));
  } finally {
    if (!closed) database.close();
    removeFixtureDirectory(directory);
  }
});

test('importe une copie synthétique dans PostgreSQL embarqué puis refuse un second import', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-pg-import-test-'));
  const filename = path.join(directory, 'source.sqlite');
  const source = new DatabaseSync(filename);
  let sourceClosed = false;
  const { PGlite } = await import('@electric-sql/pglite');
  const postgres = await PGlite.create();
  const client = {
    connect: async () => {},
    query: async (sql, parameters) => {
      if (sql === POSTGRES_SCHEMA_SQL) {
        await postgres.exec(sql);
        return { rows: [] };
      }
      return postgres.query(sql, parameters);
    },
    end: async () => {},
  };
  try {
    for (const table of POSTGRES_TABLES) {
      const columns = declaredPostgresColumns(table).map((name) => `"${name}" TEXT`).join(', ');
      source.exec(`CREATE TABLE "${table}" (${columns})`);
    }
    const insertConfig = source.prepare('INSERT INTO configurations (guild_id, section, value, updated_at) VALUES (?, ?, ?, ?)');
    for (let index = 0; index < 260; index += 1) {
      insertConfig.run('123', `logs-${index}`, '{"enabled":true}', '2026-09-16T00:00:00.000Z');
    }
    source.prepare('INSERT INTO warnings (id, guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('stale', '123', 'member-1', 'mod-1', 'Ancien avertissement supprimé', '2026-09-15T00:00:00.000Z');
    source.close();
    sourceClosed = true;
    fs.writeFileSync(path.join(directory, 'warnings.json'), JSON.stringify({
      123: { 'member-1': [{ id: 'active', moderatorId: 'mod-1', reason: 'Règle enfreinte', createdAt: '2026-09-16T00:00:00.000Z' }] },
    }));

    const options = { apply: true, dryRun: false, schema: 'fyxbot', sqlite: filename };
    const result = await migrate(options, { createClient: async () => client });
    assert.equal(result.verification.length, POSTGRES_TABLES.length);
    assert.ok(result.verification.every((table) => table.matches));
    assert.equal(result.totalRows, 261);
    const stored = await postgres.query('SELECT value FROM fyxbot.configurations WHERE guild_id = $1 AND section = $2', ['123', 'logs-259']);
    assert.equal(stored.rows[0].value, '{"enabled":true}');
    const warnings = await postgres.query('SELECT id, reason FROM fyxbot.warnings');
    assert.deepEqual(warnings.rows, [{ id: 'active', reason: 'Règle enfreinte' }]);
    await assert.rejects(() => migrate(options, { createClient: async () => client }), /déjà des données/);
    const remaining = await postgres.query('SELECT COUNT(*)::int AS total FROM fyxbot.configurations');
    assert.equal(remaining.rows[0].total, 260);
  } finally {
    if (!sourceClosed) source.close();
    await postgres.close();
    removeFixtureDirectory(directory);
  }
});
