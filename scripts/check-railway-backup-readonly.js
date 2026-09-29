const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { GetObjectCommand, ListObjectsV2Command, S3Client } = require('@aws-sdk/client-s3');
const { decryptBackup, getExternalBackupConfig } = require('../src/services/externalBackup');
const { POSTGRES_TABLES } = require('../src/database/postgresSchema');

const MAX_ENCRYPTED_BYTES = 256 * 1024 * 1024;

function inspectEncryptedBackup(encrypted, encryptionKey) {
  const { database: bytes } = decryptBackup(encrypted, encryptionKey);
  // DatabaseSync.deserialize() n'existe pas sur Node 22 : on ouvre la copie
  // déchiffrée en lecture seule depuis un dossier temporaire privé.
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-backup-check-'));
  const temporaryFile = path.join(temporaryDirectory, 'backup.sqlite');
  fs.writeFileSync(temporaryFile, bytes, { mode: 0o600 });
  let sqlite;
  try {
    sqlite = new DatabaseSync(temporaryFile, { readOnly: true });
    const integrity = sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check;
    if (integrity !== 'ok') throw new Error('Intégrité SQLite invalide.');
    const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const missingTables = POSTGRES_TABLES.filter((name) => !tables.has(name));
    return { expectedTables: POSTGRES_TABLES.length - missingTables.length,
      totalExpectedTables: POSTGRES_TABLES.length, missingTables };
  } finally {
    sqlite?.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function checkBackup({ configOnly = false } = {}) {
  const config = getExternalBackupConfig();
  const runtime = {
    storageBackend: process.env.FYXBOT_STORAGE_BACKEND === 'postgres' ? 'postgres' : 'sqlite',
    postgresUrlConfigured: Boolean(process.env.FYXBOT_POSTGRES_URL),
  };
  if (configOnly) return { ...runtime, backupEnabled: config.enabled };
  if (!config.enabled) return { ...runtime, backupEnabled: false, backupFound: false, restored: false };
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    const listing = await s3.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: `${config.prefix}/`,
      MaxKeys: 1000,
    }));
    const latest = (listing.Contents || [])
      .filter((object) => object.Key?.endsWith('.sqlite.gz.enc'))
      .sort((left, right) => new Date(right.LastModified || 0) - new Date(left.LastModified || 0))[0];
    if (!latest) return { ...runtime, backupEnabled: true, backupFound: false, restored: false };
    if (!Number.isFinite(latest.Size) || latest.Size > MAX_ENCRYPTED_BYTES) {
      throw new Error('Taille de sauvegarde hors limites pour un contrôle local.');
    }
    const object = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: latest.Key }));
    const encrypted = Buffer.from(await object.Body.transformToByteArray());
    if (encrypted.length > MAX_ENCRYPTED_BYTES) throw new Error('Sauvegarde trop volumineuse.');
    return {
      ...runtime,
      backupEnabled: true,
      backupFound: true,
      restored: true,
      ageHours: Math.round((Date.now() - new Date(latest.LastModified).getTime()) / 3_600_000),
      ...inspectEncryptedBackup(encrypted, config.encryptionKey),
    };
  } finally {
    s3.destroy();
  }
}

if (require.main === module) {
  const configOnly = process.argv.includes('--config-only');
  checkBackup({ configOnly }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!configOnly && (!result.restored || result.expectedTables !== result.totalExpectedTables)) {
      process.exitCode = 1;
    }
  }).catch((error) => {
    process.stderr.write(`BACKUP_CHECK_FAILED: ${error.name}\n`);
    process.exitCode = 1;
  });
}

module.exports = { checkBackup, inspectEncryptedBackup };
