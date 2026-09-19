const { POSTGRES_SCHEMA_VERSION, POSTGRES_TABLES } = require('./postgresSchema');
const {
  configureRuntimeStores, createPostgresRuntimeStores, runtimeStoresConfigured,
} = require('./runtimeStorage');

function assertRuntimeBackendReady(environment = process.env) {
  if (environment.FYXBOT_STORAGE_BACKEND === 'postgres' && !runtimeStoresConfigured()) {
    throw new Error('Bascule PostgreSQL incomplète : démarrage refusé avant la connexion Discord.');
  }
}

function validatedSchema(environment) {
  const schema = String(environment.FYXBOT_POSTGRES_SCHEMA || 'fyxbot').trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  return schema;
}

async function verifyPostgresRuntimeSchema(pool, schema) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const quoted = `"${schema}"`;
  const existing = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema]);
  const names = new Set(existing.rows.map((row) => row.table_name));
  const missing = ['fyxbot_schema_migrations', ...POSTGRES_TABLES].filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Schéma PostgreSQL FyxBot incomplet : ${missing.join(', ')}.`);
  const migrations = await pool.query(`SELECT version FROM ${quoted}.fyxbot_schema_migrations ORDER BY version DESC LIMIT 1`);
  if (Number(migrations.rows[0]?.version) !== POSTGRES_SCHEMA_VERSION) {
    throw new Error('Version du schéma PostgreSQL FyxBot incompatible.');
  }
}

async function initializeRuntimeBackend({ environment = process.env, poolFactory } = {}) {
  const backend = environment.FYXBOT_STORAGE_BACKEND || 'sqlite';
  if (backend === 'sqlite') return { backend, pool: null, stores: null };
  if (backend !== 'postgres') throw new Error('Moteur de stockage FyxBot inconnu.');
  const connectionString = String(environment.FYXBOT_POSTGRES_URL || '').trim();
  if (!connectionString) throw new Error('FYXBOT_POSTGRES_URL est obligatoire en mode PostgreSQL.');
  const schema = validatedSchema(environment);
  const pool = poolFactory
    ? poolFactory({ connectionString, schema })
    : new (require('pg').Pool)({ connectionString, application_name: 'fyxbot-runtime', max: 10, connectionTimeoutMillis: 10_000 });
  try {
    await verifyPostgresRuntimeSchema(pool, schema);
    const stores = createPostgresRuntimeStores(pool, { schema });
    configureRuntimeStores(stores);
    return { backend, pool, stores, schema };
  } catch (error) {
    await pool.end?.().catch(() => {});
    throw error;
  }
}

module.exports = { assertRuntimeBackendReady, initializeRuntimeBackend, verifyPostgresRuntimeSchema };
