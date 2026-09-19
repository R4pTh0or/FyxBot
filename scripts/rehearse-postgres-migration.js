const { migrate, parseArguments } = require('./migrate-sqlite-to-postgres');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');

async function main() {
  const options = parseArguments(['--apply', ...process.argv.slice(2)]);
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  let closed = false;
  try {
    const result = await migrate(options, {
      createClient: async () => ({
        connect: async () => {},
        query: async (sql, parameters) => {
          if (sql === POSTGRES_SCHEMA_SQL) {
            await database.exec(sql);
            return { rows: [] };
          }
          return database.query(sql, parameters);
        },
        end: async () => {
          if (!closed) {
            closed = true;
            await database.close();
          }
        },
      }),
    });
    console.log(JSON.stringify({
      mode: 'local-postgres-rehearsal',
      tableCount: result.tableCount,
      totalRows: result.totalRows,
      verifiedTables: result.verification.filter((table) => table.matches).length,
    }, null, 2));
  } finally {
    if (!closed) await database.close();
  }
}

main().catch((error) => {
  console.error(`[postgres-rehearsal] ${error.message}`);
  process.exitCode = 1;
});
