const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backup, DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const {
  POSTGRES_SCHEMA_SQL,
  POSTGRES_SCHEMA_VERSION,
  POSTGRES_TABLES,
} = require('../src/database/postgresSchema');

const DEFAULT_SCHEMA = 'fyxbot';
const MAX_BATCH_SIZE = 250;

function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    dryRun: false,
    schema: process.env.FYXBOT_POSTGRES_SCHEMA || DEFAULT_SCHEMA,
    sqlite: process.env.FYXBOT_SQLITE_FILE || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--schema') options.schema = argv[++index] || '';
    else if (argument === '--sqlite') options.sqlite = argv[++index] || '';
    else if (argument === '--help') options.help = true;
    else throw new Error(`Option inconnue : ${argument}`);
  }

  if (!options.apply && !options.dryRun && !options.help) options.dryRun = true;
  if (options.apply && options.dryRun) throw new Error('Choisissez --apply ou --dry-run, pas les deux.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(options.schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  return options;
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Identifiant SQL invalide : ${identifier}`);
  return `"${identifier.replaceAll('"', '""')}"`;
}

function resolveSqliteFile(candidate = '') {
  if (candidate) return path.resolve(candidate);
  const dataDirectory = process.env.FYXBOT_DATA_DIR
    ? path.resolve(process.env.FYXBOT_DATA_DIR)
    : path.resolve(__dirname, '..', 'data');
  const current = path.join(dataDirectory, 'fyxbot.sqlite');
  const legacy = path.join(dataDirectory, 'nexora.sqlite');
  return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
}

function inspectSqlite(sqliteFile) {
  if (!fs.existsSync(sqliteFile)) throw new Error(`Base SQLite introuvable : ${sqliteFile}`);
  const database = new DatabaseSync(sqliteFile, { readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') throw new Error(`Échec du contrôle SQLite : ${integrity?.integrity_check || 'inconnu'}`);

    const existing = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const tables = POSTGRES_TABLES.filter((table) => existing.has(table)).map((table) => {
      const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name);
      const count = database.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)}`).get().total;
      return { name: table, columns, count };
    });
    return { database, tables };
  } catch (error) {
    database.close();
    throw error;
  }
}

function inspectWarningJson(sqliteFile) {
  const filename = path.join(path.dirname(sqliteFile), 'warnings.json');
  if (!fs.existsSync(filename)) return { present: false, rows: [] };
  let records;
  try { records = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch {
    throw new Error('Le fichier warnings.json est illisible ou invalide.');
  }
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new Error('Le fichier warnings.json a une structure invalide.');
  }
  const rows = [];
  const seen = new Set();
  for (const [guildId, users] of Object.entries(records)) {
    if (!users || typeof users !== 'object' || Array.isArray(users)) throw new Error('Structure de warnings.json invalide.');
    for (const [userId, warnings] of Object.entries(users)) {
      if (!Array.isArray(warnings)) throw new Error('Liste d’avertissements invalide dans warnings.json.');
      for (const warning of warnings) {
        if (!warning || typeof warning.id !== 'string' || !warning.id
          || typeof warning.moderatorId !== 'string' || !warning.moderatorId
          || typeof warning.reason !== 'string'
          || typeof warning.createdAt !== 'string' || !Number.isFinite(Date.parse(warning.createdAt))) {
          throw new Error('Avertissement invalide dans warnings.json.');
        }
        if (seen.has(warning.id)) throw new Error(`Identifiant d’avertissement dupliqué dans warnings.json : ${warning.id}`);
        seen.add(warning.id);
        rows.push([warning.id, guildId, userId, warning.moderatorId, warning.reason, warning.createdAt]);
      }
    }
  }
  return { present: true, rows };
}

function declaredPostgresColumns(table) {
  const start = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const offset = POSTGRES_SCHEMA_SQL.indexOf(start);
  if (offset < 0) throw new Error(`Table absente du schéma PostgreSQL : ${table}`);
  const end = POSTGRES_SCHEMA_SQL.indexOf('\n);', offset);
  if (end < 0) throw new Error(`Définition PostgreSQL incomplète : ${table}`);
  const definition = POSTGRES_SCHEMA_SQL.slice(offset + start.length, end);
  return [...definition.matchAll(/^  ([a-z][a-z0-9_]*)\s+(?:TEXT|INTEGER|BIGINT)\b/gm)]
    .map((match) => match[1]);
}

function assertSchemaCompatibility(tables) {
  const found = new Map(tables.map((table) => [table.name, table]));
  const missingTables = POSTGRES_TABLES.filter((name) => !found.has(name));
  if (missingTables.length) {
    throw new Error(`Tables SQLite absentes : ${missingTables.join(', ')}. Démarrez d'abord une version compatible du bot sur une copie.`);
  }
  for (const table of tables) {
    const expected = declaredPostgresColumns(table.name);
    const sqlite = new Set(table.columns);
    const postgres = new Set(expected);
    const missingInPostgres = table.columns.filter((column) => !postgres.has(column));
    const missingInSqlite = expected.filter((column) => !sqlite.has(column));
    if (missingInPostgres.length || missingInSqlite.length) {
      throw new Error(`Colonnes incompatibles pour ${table.name} : SQLite uniquement [${missingInPostgres.join(', ')}], PostgreSQL uniquement [${missingInSqlite.join(', ')}].`);
    }
  }
}

function placeholders(rowCount, columnCount, offset = 0) {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const values = Array.from({ length: columnCount }, (__, columnIndex) => `$${offset + (rowIndex * columnCount) + columnIndex + 1}`);
    return `(${values.join(', ')})`;
  }).join(', ');
}

async function assertDestinationEmpty(client, schema, tables) {
  const nonEmpty = [];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)}`);
    const count = Number(result.rows[0].total);
    if (count > 0) nonEmpty.push(`${table.name} (${count})`);
  }
  if (nonEmpty.length > 0) {
    throw new Error(`Migration annulée : le schéma cible contient déjà des données (${nonEmpty.join(', ')}).`);
  }
}

async function copyTable(client, database, schema, table) {
  if (table.count === 0) return 0;
  const columnSql = table.columns.map(quoteIdentifier).join(', ');
  let copied = 0;
  let lastRowId = 0;
  while (copied < table.count) {
    const rows = database.prepare(`SELECT rowid AS __fyxbot_rowid__, ${columnSql} FROM ${quoteIdentifier(table.name)}
      WHERE rowid > ? ORDER BY rowid LIMIT ?`).all(lastRowId, MAX_BATCH_SIZE);
    if (rows.length === 0) break;
    lastRowId = rows[rows.length - 1].__fyxbot_rowid__;
    const values = rows.flatMap((row) => table.columns.map((column) => row[column]));
    const query = `INSERT INTO ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)} (${columnSql}) VALUES ${placeholders(rows.length, table.columns.length)}`;
    await client.query(query, values);
    copied += rows.length;
  }
  return copied;
}

async function copyJsonWarnings(client, schema, rows) {
  const columns = '(id, guild_id, user_id, moderator_id, reason, created_at)';
  for (let offset = 0; offset < rows.length; offset += MAX_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + MAX_BATCH_SIZE);
    await client.query(`INSERT INTO ${quoteIdentifier(schema)}.warnings ${columns}
      VALUES ${placeholders(batch.length, 6)}`, batch.flat());
  }
  return rows.length;
}

async function verifyCounts(client, schema, tables) {
  const results = [];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)}`);
    const postgres = Number(result.rows[0].total);
    results.push({ table: table.name, sqlite: table.count, postgres, matches: postgres === table.count });
  }
  return results;
}

async function migrate(options, { createClient } = {}) {
  const sqliteFile = resolveSqliteFile(options.sqlite);
  if (!fs.existsSync(sqliteFile)) throw new Error(`Base SQLite introuvable : ${sqliteFile}`);
  const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-postgres-source-'));
  const snapshotFile = path.join(snapshotDirectory, 'source.sqlite');
  let database;
  try {
    try { fs.chmodSync(snapshotDirectory, 0o700); } catch { /* Certains volumes Windows ne prennent pas en charge chmod. */ }
    const source = new DatabaseSync(sqliteFile, { readOnly: true });
    try { await backup(source, snapshotFile); } finally { source.close(); }
    try { fs.chmodSync(snapshotFile, 0o600); } catch { /* Certains volumes Windows ne prennent pas en charge chmod. */ }
    const inspected = inspectSqlite(snapshotFile);
    database = inspected.database;
    assertSchemaCompatibility(inspected.tables);
    const warningSource = inspectWarningJson(sqliteFile);
    const tables = inspected.tables.map((table) => table.name === 'warnings'
      ? { ...table, count: warningSource.rows.length, source: warningSource.present ? 'warnings.json' : 'none' }
      : table);
    const totalRows = tables.reduce((sum, table) => sum + table.count, 0);

    if (options.dryRun) {
      return { mode: 'dry-run', sqliteFile, schema: options.schema, tableCount: tables.length, totalRows, tables };
    }

    const connectionString = process.env.FYXBOT_POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString && !createClient) throw new Error('FYXBOT_POSTGRES_URL est obligatoire avec --apply.');
    const client = createClient
      ? await createClient()
      : new Client({ connectionString, application_name: 'fyxbot-sqlite-migration' });
    await client.connect();
    try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fyxbot-sqlite-import-v1'))");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(options.schema)}`);
    await client.query("SELECT set_config('search_path', $1, true)", [`${options.schema},public`]);
    await client.query(POSTGRES_SCHEMA_SQL);
    await assertDestinationEmpty(client, options.schema, tables);

    for (const table of tables) {
      if (table.name === 'warnings') {
        await copyJsonWarnings(client, options.schema, warningSource.rows);
      } else {
        await copyTable(client, database, options.schema, table);
      }
    }

    if (tables.some((table) => table.name === 'audit_logs')) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${quoteIdentifier(options.schema)}.audit_logs`, [`${options.schema}.audit_logs`]);
    }
    await client.query(`INSERT INTO ${quoteIdentifier(options.schema)}.fyxbot_schema_migrations (version, applied_at) VALUES ($1, $2)`, [POSTGRES_SCHEMA_VERSION, new Date().toISOString()]);

    const verification = await verifyCounts(client, options.schema, tables);
    const mismatches = verification.filter((item) => !item.matches);
    if (mismatches.length > 0) throw new Error(`Vérification PostgreSQL échouée pour : ${mismatches.map((item) => item.table).join(', ')}`);
    await client.query('COMMIT');
    return { mode: 'apply', sqliteFile, schema: options.schema, tableCount: tables.length, totalRows, verification };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* La connexion peut déjà être fermée. */ }
      throw error;
    } finally {
      await client.end();
    }
  } finally {
    database?.close();
    const resolved = path.resolve(snapshotDirectory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir())
      || !path.basename(resolved).startsWith('fyxbot-postgres-source-')) {
      throw new Error('Nettoyage annulé : chemin de la copie temporaire inattendu.');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function printHelp() {
  console.log(`Migration SQLite vers PostgreSQL pour FyxBot

Usage :
  node scripts/migrate-sqlite-to-postgres.js --dry-run [--sqlite chemin] [--schema fyxbot]
  FYXBOT_POSTGRES_URL=... node scripts/migrate-sqlite-to-postgres.js --apply [--sqlite chemin] [--schema fyxbot]

La migration refuse un schéma cible déjà rempli et annule toute l'opération si la vérification échoue.`);
}

async function main() {
  const options = parseArguments();
  if (options.help) return printHelp();
  const result = await migrate(options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[postgres-migration] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  inspectSqlite,
  inspectWarningJson,
  assertSchemaCompatibility,
  declaredPostgresColumns,
  migrate,
  parseArguments,
  placeholders,
  quoteIdentifier,
  resolveSqliteFile,
};
