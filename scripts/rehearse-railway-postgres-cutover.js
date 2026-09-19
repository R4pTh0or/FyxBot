const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
const { migrate, quoteIdentifier } = require('./migrate-sqlite-to-postgres');
const { POSTGRES_TABLES } = require('../src/database/postgresSchema');
const { exportPostgresSnapshot, restorePostgresSnapshot } = require('../src/database/postgresSnapshot');
const {
  decryptBackup,
  encryptBackup,
  getExternalBackupConfig,
  postgresBackupObjectKey,
} = require('../src/services/externalBackup');

const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

function safeTemporarySchema(prefix) {
  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const schema = `${prefix}_${suffix}`;
  if (!/^fyxbot_preprod_(source|restore)_[0-9]+_[a-f0-9]{8}$/.test(schema)) {
    throw new Error('Nom de schéma temporaire invalide.');
  }
  return schema;
}

function snapshotDigest(snapshot) {
  const tables = Object.fromEntries(POSTGRES_TABLES.map((name) => [name,
    snapshot.tables[name].map((row) => JSON.stringify(row)).sort()]));
  return crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');
}

async function latestSqliteBackup(s3, config) {
  const listing = await s3.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: `${config.prefix}/`,
    MaxKeys: 1000,
  }));
  const latest = (listing.Contents || [])
    .filter((object) => object.Key?.endsWith('.sqlite.gz.enc'))
    .sort((left, right) => new Date(right.LastModified || 0) - new Date(left.LastModified || 0))[0];
  if (!latest?.Key) throw new Error('Aucune sauvegarde SQLite R2 disponible.');
  if (!Number.isFinite(latest.Size) || latest.Size <= 0 || latest.Size > MAX_BACKUP_BYTES) {
    throw new Error('Taille de sauvegarde SQLite hors limites.');
  }
  return latest;
}

async function uploadPostgresSnapshot(s3, config, snapshot) {
  const createdAt = new Date();
  const serialized = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const encrypted = encryptBackup(serialized, config.encryptionKey, createdAt);
  const key = postgresBackupObjectKey(config, createdAt);
  await s3.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: encrypted,
    ContentType: 'application/octet-stream',
    Metadata: { format: snapshot.format, created: createdAt.toISOString() },
  }));
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  if (Number(head.ContentLength) !== encrypted.length) {
    throw new Error('La taille distante de la sauvegarde PostgreSQL est incorrecte.');
  }
  return { key, encryptedBytes: encrypted.length };
}

async function dropTemporarySchema(pool, schema) {
  if (!/^fyxbot_preprod_(source|restore)_[0-9]+_[a-f0-9]{8}$/.test(schema)) {
    throw new Error('Suppression refusée : schéma non temporaire.');
  }
  await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
}

async function rehearse() {
  const connectionString = String(process.env.FYXBOT_POSTGRES_URL || '').trim();
  if (!connectionString) throw new Error('FYXBOT_POSTGRES_URL est absent.');
  const config = getExternalBackupConfig();
  if (!config.enabled) throw new Error('La sauvegarde externe est désactivée.');
  const sourceSchema = safeTemporarySchema('fyxbot_preprod_source');
  const restoreSchema = safeTemporarySchema('fyxbot_preprod_restore');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-railway-rehearsal-'));
  const sqliteFile = path.join(temporaryDirectory, 'source.sqlite');
  const pool = new Pool({
    connectionString,
    application_name: 'fyxbot-cutover-rehearsal',
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    max: 2,
  });
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  let cleanupComplete = false;

  try {
    const existing = await pool.query('SELECT nspname FROM pg_namespace WHERE nspname = ANY($1)', [[sourceSchema, restoreSchema]]);
    if (existing.rows.length) throw new Error('Collision avec un schéma temporaire existant.');
    const sourceObject = await latestSqliteBackup(s3, config);
    const fetched = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: sourceObject.Key }));
    const encryptedSqlite = Buffer.from(await fetched.Body.transformToByteArray());
    if (encryptedSqlite.length > MAX_BACKUP_BYTES) throw new Error('Sauvegarde SQLite téléchargée trop volumineuse.');
    const { database: sqliteBytes } = decryptBackup(encryptedSqlite, config.encryptionKey);
    fs.writeFileSync(sqliteFile, sqliteBytes, { mode: 0o600 });

    const migration = await migrate({ apply: true, dryRun: false, schema: sourceSchema, sqlite: sqliteFile });
    if (migration.tableCount !== POSTGRES_TABLES.length || migration.verification.some((item) => !item.matches)) {
      throw new Error('La vérification de l’import PostgreSQL a échoué.');
    }

    const sourceSnapshot = await exportPostgresSnapshot(pool, { schema: sourceSchema });
    const uploaded = await uploadPostgresSnapshot(s3, config, sourceSnapshot);
    const stored = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: uploaded.key }));
    const encryptedPostgres = Buffer.from(await stored.Body.transformToByteArray());
    const { database: snapshotBytes } = decryptBackup(encryptedPostgres, config.encryptionKey);
    const downloadedSnapshot = JSON.parse(snapshotBytes.toString('utf8'));
    const restoredCounts = await restorePostgresSnapshot(pool, downloadedSnapshot, { schema: restoreSchema });
    const restoredSnapshot = await exportPostgresSnapshot(pool, { schema: restoreSchema });
    const sourceDigest = snapshotDigest(sourceSnapshot);
    const restoredDigest = snapshotDigest(restoredSnapshot);
    if (sourceDigest !== restoredDigest) throw new Error('La restauration PostgreSQL diffère de la source importée.');

    return {
      completed: true,
      sourceBackupKey: sourceObject.Key,
      postgresBackupKey: uploaded.key,
      tableCount: migration.tableCount,
      totalRows: migration.totalRows,
      restoredRows: Object.values(restoredCounts).reduce((sum, value) => sum + Number(value), 0),
      digestsMatch: true,
    };
  } finally {
    try {
      await dropTemporarySchema(pool, restoreSchema);
      await dropTemporarySchema(pool, sourceSchema);
      cleanupComplete = true;
    } finally {
      await pool.end().catch(() => {});
      s3.destroy();
      const resolved = path.resolve(temporaryDirectory);
      if (path.dirname(resolved) === path.resolve(os.tmpdir())
        && path.basename(resolved).startsWith('fyxbot-railway-rehearsal-')) {
        fs.rmSync(resolved, { recursive: true, force: true });
      }
      if (!cleanupComplete) process.stderr.write('REHEARSAL_CLEANUP_INCOMPLETE\n');
    }
  }
}

if (require.main === module) {
  rehearse().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    const message = String(error.message || '')
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/[A-Za-z0-9+/=_-]{32,}/g, '[secret]');
    process.stderr.write(`POSTGRES_REHEARSAL_FAILED: ${error.name} ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  dropTemporarySchema,
  latestSqliteBackup,
  rehearse,
  safeTemporarySchema,
  snapshotDigest,
  uploadPostgresSnapshot,
};
