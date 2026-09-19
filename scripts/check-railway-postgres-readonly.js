const { Client } = require('pg');

async function inspectPostgres(environment = process.env) {
  const name = [
    'FYXSTREAM_POSTGRES_URL', 'FYXSTREAM_DATABASE_URL', 'DATABASE_URL', 'POSTGRES_URL',
  ].find((candidate) => environment[candidate]);
  if (!name) return { connectionConfigured: false };
  const client = new Client({
    connectionString: environment[name],
    application_name: 'fyxbot-cutover-readonly',
    connectionTimeoutMillis: 10_000,
    statement_timeout: 5_000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`SELECT
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'fyxbot') AS schema_exists,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'fyxbot') AS fyxbot_table_count`);
    await client.query('ROLLBACK');
    const row = result.rows[0];
    return { connectionConfigured: true, connected: true,
      schemaExists: row.schema_exists, canCreateSchema: row.can_create_schema,
      fyxbotTableCount: Number(row.fyxbot_table_count) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  inspectPostgres().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.connected) process.exitCode = 1;
  }).catch((error) => {
    const code = /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : 'UNKNOWN';
    process.stderr.write(`POSTGRES_CHECK_FAILED: ${error.name} ${code}\n`);
    process.exitCode = 1;
  });
}

module.exports = { inspectPostgres };
