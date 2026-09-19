const { POSTGRES_SCHEMA_SQL, POSTGRES_SCHEMA_VERSION, POSTGRES_TABLES } = require('./postgresSchema');

const FORMAT = 'fyxbot-postgres-v1';

function quotedSchema(schema) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  return `"${schema}"`;
}

function validSnapshot(snapshot) {
  if (snapshot?.format !== FORMAT || snapshot.schemaVersion !== POSTGRES_SCHEMA_VERSION
    || !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)
    || Object.keys(snapshot.tables).length !== POSTGRES_TABLES.length
    || !POSTGRES_TABLES.every((name) => Array.isArray(snapshot.tables[name]))) {
    throw new Error('Sauvegarde PostgreSQL FyxBot incomplète ou incompatible.');
  }
}

async function exportPostgresSnapshot(pool, { schema = 'fyxbot', now = new Date() } = {}) {
  const namespace = quotedSchema(schema);
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const version = await client.query(`SELECT version FROM ${namespace}.fyxbot_schema_migrations ORDER BY version DESC LIMIT 1`);
    if (Number(version.rows[0]?.version) !== POSTGRES_SCHEMA_VERSION) {
      throw new Error('Version de schéma PostgreSQL FyxBot inconnue.');
    }
    const tables = {};
    for (const name of POSTGRES_TABLES) {
      tables[name] = (await client.query(`SELECT * FROM ${namespace}."${name}"`)).rows;
    }
    await client.query('COMMIT');
    const snapshot = { format: FORMAT, schemaVersion: POSTGRES_SCHEMA_VERSION, capturedAt: now.toISOString(), tables };
    validSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Connexion déjà fermée. */ }
    throw error;
  } finally {
    client.release();
  }
}

async function restorePostgresSnapshot(pool, snapshot, { schema = 'fyxbot' } = {}) {
  const namespace = quotedSchema(schema);
  validSnapshot(snapshot);
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespace}`);
    await client.query(`SET LOCAL search_path TO ${namespace}`);
    // Execute statements individually so the restore works with both pg and
    // clients using PostgreSQL's prepared-statement protocol (e.g. PGlite).
    for (const statement of POSTGRES_SCHEMA_SQL.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await client.query(statement);
    }
    for (const name of POSTGRES_TABLES) {
      const existing = await client.query(`SELECT 1 FROM ${namespace}."${name}" LIMIT 1`);
      if (existing.rows.length) throw new Error(`La table ${name} contient déjà des données ; restauration refusée.`);
    }
    const existingVersion = await client.query(`SELECT 1 FROM ${namespace}.fyxbot_schema_migrations LIMIT 1`);
    if (existingVersion.rows.length) throw new Error('Le schéma FyxBot est déjà initialisé ; restauration refusée.');

    const counts = {};
    for (const name of POSTGRES_TABLES) {
      const rows = snapshot.tables[name];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Ligne invalide dans ${name}.`);
        const columns = Object.keys(row);
        if (columns.length === 0 || !columns.every((column) => /^[a-z][a-z0-9_]*$/.test(column))) {
          throw new Error(`Colonnes invalides dans ${name}.`);
        }
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(`INSERT INTO ${namespace}."${name}" (${columns.map((column) => `"${column}"`).join(', ')})
          VALUES (${placeholders})`, columns.map((column) => row[column]));
      }
      const verified = await client.query(`SELECT COUNT(*)::int AS total FROM ${namespace}."${name}"`);
      if (Number(verified.rows[0].total) !== rows.length) throw new Error(`Restauration incomplète pour ${name}.`);
      counts[name] = rows.length;
    }
    if (counts.audit_logs) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${schema}.audit_logs', 'id'),
        (SELECT MAX(id) FROM ${namespace}.audit_logs), true)`);
    }
    await client.query(`INSERT INTO ${namespace}.fyxbot_schema_migrations (version, applied_at) VALUES ($1, $2)`,
      [POSTGRES_SCHEMA_VERSION, new Date().toISOString()]);
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Connexion déjà fermée. */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { exportPostgresSnapshot, restorePostgresSnapshot, validSnapshot };
