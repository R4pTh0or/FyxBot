const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const {
  backupObjectKey,
  decryptBackup,
  encryptBackup,
  getExternalBackupConfig,
  snapshotDatabase,
} = require(path.join(process.cwd(), 'src/services/externalBackup'));

async function createVerifiedBackup() {
  const config = getExternalBackupConfig();
  if (!config.enabled) throw new Error('La sauvegarde externe est désactivée.');
  const sourceDatabase = require(path.join(process.cwd(), 'src/database/database')).database;
  const createdAt = new Date();
  const serialized = await snapshotDatabase(sourceDatabase);
  const encrypted = encryptBackup(serialized, config.encryptionKey, createdAt);
  const key = backupObjectKey(config, createdAt);
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: encrypted,
      ContentType: 'application/octet-stream',
      Metadata: { format: 'fyxbot-backup-v1', created: createdAt.toISOString() },
    }));
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    if (Number(head.ContentLength) !== encrypted.length) {
      throw new Error('La taille distante de la sauvegarde ne correspond pas.');
    }
    const stored = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const downloaded = Buffer.from(await stored.Body.transformToByteArray());
    const { database: restored } = decryptBackup(downloaded, config.encryptionKey);
    const verificationFile = path.join(os.tmpdir(), `fyxbot-r2-verify-${process.pid}-${crypto.randomUUID()}.sqlite`);
    try {
      fs.writeFileSync(verificationFile, restored, { mode: 0o600 });
      const sqlite = new DatabaseSync(verificationFile, { readOnly: true });
      try {
      if (sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') {
        throw new Error('Le contrôle d’intégrité de la sauvegarde restaurée a échoué.');
      }
      } finally {
        sqlite.close();
      }
    } finally {
      fs.rmSync(verificationFile, { force: true });
    }
    return {
      created: true,
      verified: true,
      createdAt: createdAt.toISOString(),
      sourceBytes: serialized.length,
      encryptedBytes: encrypted.length,
      key,
    };
  } finally {
    s3.destroy();
  }
}

createVerifiedBackup().then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch((error) => {
  const message = String(error.message || '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Za-z0-9+/=_-]{32,}/g, '[secret]');
  process.stderr.write(`SQLITE_BACKUP_FAILED: ${error.name} ${message}\n`);
  process.exitCode = 1;
});
