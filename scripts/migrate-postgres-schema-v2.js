const { Client } = require('pg');

function validatedSchema(environment = process.env) {
  const schema = String(environment.FYXBOT_POSTGRES_SCHEMA || 'fyxbot').trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  return schema;
}

async function migratePostgresSchemaV2({ environment = process.env, createClient } = {}) {
  const connectionString = String(environment.FYXBOT_POSTGRES_URL || environment.DATABASE_URL || '').trim();
  if (!connectionString && !createClient) throw new Error('FYXBOT_POSTGRES_URL est obligatoire.');
  const schema = validatedSchema(environment);
  const namespace = `"${schema}"`;
  const client = createClient ? await createClient() : new Client({
    connectionString,
    application_name: 'fyxbot-schema-v2-migration',
  });
  await client.connect?.();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fyxbot:schema-v2'))");
    const current = await client.query(`SELECT version FROM ${namespace}.fyxbot_schema_migrations ORDER BY version DESC LIMIT 1`);
    const version = Number(current.rows[0]?.version || 0);
    if (version > 2) throw new Error('Le schéma PostgreSQL est plus récent que cette migration.');
    if (version < 1) throw new Error('Le schéma PostgreSQL V1 doit exister avant cette migration.');
    await client.query(`CREATE TABLE IF NOT EXISTS ${namespace}.premium_manual_grants (
      grant_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      granted_by TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT,
      created_at TEXT NOT NULL
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS premium_manual_grants_user
      ON ${namespace}.premium_manual_grants(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS premium_manual_grants_active
      ON ${namespace}.premium_manual_grants(user_id, revoked_at, ends_at)`);
    if (version < 2) {
      await client.query(`INSERT INTO ${namespace}.fyxbot_schema_migrations (version, applied_at) VALUES (2, $1)`, [new Date().toISOString()]);
    }
    await client.query('COMMIT');
    return { previousVersion: version, version: 2, changed: version < 2 };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Connexion déjà fermée. */ }
    throw error;
  } finally {
    await client.end?.();
  }
}

async function main() {
  const result = await migratePostgresSchemaV2();
  console.log(result.changed
    ? '[FyxBot] Schéma PostgreSQL migré vers V2.'
    : '[FyxBot] Schéma PostgreSQL déjà en V2.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[FyxBot] Migration PostgreSQL V2 refusée : ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { migratePostgresSchemaV2, validatedSchema };
