const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { getDataDirectory } = require('../database/dataDirectory');
const { exportPostgresSnapshot, restorePostgresSnapshot } = require('../database/postgresSnapshot');
const appLogger = require('./logger').logger.child({ component: 'external-backup' });

const BACKUP_MAGIC = 'FYXBOT-BACKUP-V1';
const LEGACY_BACKUP_MAGIC = 'NEXORA-BACKUP-V1';
const DEFAULT_INTERVAL_DAYS = 7;
const DEFAULT_RETENTION = 8;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
}

function parseInteger(value, defaultValue, minimum, maximum, name) {
  const parsed = value === undefined || value === '' ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} doit être un entier entre ${minimum} et ${maximum}.`);
  }
  return parsed;
}

function environmentValue(environment, name) {
  const legacyName = name.replace(/^FYXBOT_/, 'NEXORA_');
  return environment[name] ?? environment[legacyName];
}

function decodeEncryptionKey(value) {
  const key = Buffer.from(value || '', 'base64');
  if (key.length !== 32) {
    throw new Error('FYXBOT_BACKUP_ENCRYPTION_KEY doit contenir une clé Base64 de 32 octets.');
  }
  return key;
}

function getExternalBackupConfig(environment = process.env) {
  const enabled = parseBoolean(environmentValue(environment, 'FYXBOT_EXTERNAL_BACKUP_ENABLED'));
  if (!enabled) return Object.freeze({ enabled: false });

  const required = [
    'FYXBOT_BACKUP_S3_ENDPOINT',
    'FYXBOT_BACKUP_S3_BUCKET',
    'FYXBOT_BACKUP_S3_ACCESS_KEY_ID',
    'FYXBOT_BACKUP_S3_SECRET_ACCESS_KEY',
    'FYXBOT_BACKUP_ENCRYPTION_KEY',
  ];
  const missing = required.filter((name) => !environmentValue(environment, name)?.trim());
  if (missing.length > 0) {
    throw new Error(`Configuration de sauvegarde manquante : ${missing.join(', ')}.`);
  }

  return Object.freeze({
    enabled: true,
    endpoint: environmentValue(environment, 'FYXBOT_BACKUP_S3_ENDPOINT').trim().replace(/\/$/, ''),
    region: environmentValue(environment, 'FYXBOT_BACKUP_S3_REGION')?.trim() || 'auto',
    bucket: environmentValue(environment, 'FYXBOT_BACKUP_S3_BUCKET').trim(),
    accessKeyId: environmentValue(environment, 'FYXBOT_BACKUP_S3_ACCESS_KEY_ID').trim(),
    secretAccessKey: environmentValue(environment, 'FYXBOT_BACKUP_S3_SECRET_ACCESS_KEY').trim(),
    encryptionKey: decodeEncryptionKey(environmentValue(environment, 'FYXBOT_BACKUP_ENCRYPTION_KEY').trim()),
    prefix: (environmentValue(environment, 'FYXBOT_BACKUP_S3_PREFIX')?.trim() || 'fyxbot/weekly').replace(/^\/+|\/+$/g, ''),
    forcePathStyle: parseBoolean(environmentValue(environment, 'FYXBOT_BACKUP_S3_FORCE_PATH_STYLE')),
    intervalDays: parseInteger(
      environmentValue(environment, 'FYXBOT_BACKUP_INTERVAL_DAYS'),
      DEFAULT_INTERVAL_DAYS,
      1,
      31,
      'FYXBOT_BACKUP_INTERVAL_DAYS',
    ),
    retention: parseInteger(
      environmentValue(environment, 'FYXBOT_BACKUP_RETENTION'),
      DEFAULT_RETENTION,
      1,
      52,
      'FYXBOT_BACKUP_RETENTION',
    ),
  });
}

function encryptBackup(plainDatabase, encryptionKey, createdAt = new Date()) {
  const compressed = zlib.gzipSync(plainDatabase, { level: zlib.constants.Z_BEST_COMPRESSION });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const header = {
    algorithm: 'aes-256-gcm',
    authTag: cipher.getAuthTag().toString('base64'),
    compressedBytes: compressed.length,
    createdAt: createdAt.toISOString(),
    iv: iv.toString('base64'),
    originalBytes: plainDatabase.length,
    sha256: crypto.createHash('sha256').update(plainDatabase).digest('hex'),
    version: 1,
  };
  return Buffer.concat([
    Buffer.from(`${BACKUP_MAGIC}\n${JSON.stringify(header)}\n`, 'utf8'),
    ciphertext,
  ]);
}

function decryptBackup(encryptedBackup, encryptionKey) {
  const firstNewline = encryptedBackup.indexOf(10);
  const secondNewline = encryptedBackup.indexOf(10, firstNewline + 1);
  if (firstNewline < 0 || secondNewline < 0 || secondNewline > 8192) {
    throw new Error('Format de sauvegarde FyxBot invalide.');
  }
  const magic = encryptedBackup.subarray(0, firstNewline).toString('utf8');
  if (![BACKUP_MAGIC, LEGACY_BACKUP_MAGIC].includes(magic)) {
    throw new Error('Signature de sauvegarde FyxBot invalide.');
  }

  const header = JSON.parse(encryptedBackup.subarray(firstNewline + 1, secondNewline).toString('utf8'));
  if (header.version !== 1 || header.algorithm !== 'aes-256-gcm') {
    throw new Error('Version de sauvegarde FyxBot non prise en charge.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(header.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(header.authTag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(encryptedBackup.subarray(secondNewline + 1)),
    decipher.final(),
  ]);
  const plainDatabase = zlib.gunzipSync(compressed);
  const digest = crypto.createHash('sha256').update(plainDatabase).digest('hex');
  if (digest !== header.sha256) throw new Error('La sauvegarde FyxBot est corrompue.');
  return { database: plainDatabase, header };
}

function createS3Client(config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function backupObjectKey(config, createdAt) {
  const timestamp = createdAt.toISOString().replace(/[:.]/g, '-');
  return `${config.prefix}/${timestamp}.sqlite.gz.enc`;
}

function postgresBackupConfig(config) {
  return { ...config, prefix: `${config.prefix}/postgres` };
}

function postgresBackupObjectKey(config, createdAt) {
  const timestamp = createdAt.toISOString().replace(/[:.]/g, '-');
  return `${postgresBackupConfig(config).prefix}/${timestamp}.json.gz.enc`;
}

function selectExpiredBackupKeys(objects, retention) {
  return [...objects]
    .filter((item) => item.Key)
    .sort((left, right) => {
      const byDate = Number(new Date(right.LastModified || 0)) - Number(new Date(left.LastModified || 0));
      return byDate || String(right.Key).localeCompare(String(left.Key));
    })
    .slice(retention)
    .map((item) => item.Key);
}

async function listBackupObjects(s3, config) {
  const objects = [];
  let continuationToken;
  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: `${config.prefix}/`,
      ContinuationToken: continuationToken,
    }));
    objects.push(...(result.Contents || []));
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function pruneOldBackups(s3, config, suffix = '.sqlite.gz.enc') {
  const objects = (await listBackupObjects(s3, config)).filter((item) => String(item.Key || '').endsWith(suffix));
  const expiredKeys = selectExpiredBackupKeys(objects, config.retention);
  for (let index = 0; index < expiredKeys.length; index += 1000) {
    const batch = expiredKeys.slice(index, index + 1000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
  }
  return expiredKeys.length;
}

async function snapshotDatabase(sourceDatabase, temporaryDirectory = getDataDirectory()) {
  await fs.mkdir(temporaryDirectory, { recursive: true });
  const temporaryFile = path.join(
    temporaryDirectory,
    `.fyxbot-backup-${process.pid}-${crypto.randomUUID()}.sqlite`,
  );
  const quotedTemporaryFile = `'${temporaryFile.replaceAll("'", "''")}'`;

  try {
    // VACUUM INTO creates a transactionally consistent SQLite file and works on
    // the Node 22 DatabaseSync versions that do not yet expose serialize().
    sourceDatabase.exec(`VACUUM INTO ${quotedTemporaryFile};`);
    const snapshot = await fs.readFile(temporaryFile);
    if (snapshot.length === 0) throw new Error('La copie SQLite temporaire est vide.');
    return snapshot;
  } finally {
    await fs.rm(temporaryFile, { force: true });
  }
}

async function createExternalBackup(config, { s3 = createS3Client(config), sourceDatabase } = {}) {
  const sqliteDatabase = sourceDatabase || require('../database/database').database;
  const serialized = await snapshotDatabase(sqliteDatabase);
  const createdAt = new Date();
  const encrypted = encryptBackup(serialized, config.encryptionKey, createdAt);
  const key = backupObjectKey(config, createdAt);

  await s3.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: encrypted,
    ContentType: 'application/octet-stream',
    Metadata: { format: 'fyxbot-backup-v1', created: createdAt.toISOString() },
  }));
  const verification = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  if (Number(verification.ContentLength) !== encrypted.length) {
    throw new Error('La taille de la sauvegarde distante ne correspond pas au fichier envoyé.');
  }
  const deleted = await pruneOldBackups(s3, config);
  return { createdAt, deleted, encryptedBytes: encrypted.length, key, sourceBytes: serialized.length };
}

async function createPostgresExternalBackup(config, { pool, s3 = createS3Client(config), schema = 'fyxbot' } = {}) {
  if (!pool) throw new TypeError('Une connexion PostgreSQL est requise pour la sauvegarde.');
  const createdAt = new Date();
  const snapshot = await exportPostgresSnapshot(pool, { schema, now: createdAt });
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
  const verification = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  if (Number(verification.ContentLength) !== encrypted.length) {
    throw new Error('La taille de la sauvegarde PostgreSQL distante est incorrecte.');
  }
  const deleted = await pruneOldBackups(s3, postgresBackupConfig(config), '.json.gz.enc');
  return { createdAt, deleted, encryptedBytes: encrypted.length, key, sourceBytes: serialized.length };
}

async function restorePostgresExternalBackup(encrypted, encryptionKey, pool, { schema = 'fyxbot' } = {}) {
  const { database: serialized } = decryptBackup(encrypted, encryptionKey);
  const snapshot = JSON.parse(serialized.toString('utf8'));
  return restorePostgresSnapshot(pool, snapshot, { schema });
}

async function readBackupState(stateFile) {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeBackupState(stateFile, result) {
  await fs.writeFile(stateFile, `${JSON.stringify({
    lastBackupAt: result.createdAt.toISOString(),
    lastBackupKey: result.key,
  })}\n`, { encoding: 'utf8', mode: 0o600 });
}

function startExternalBackupScheduler({ logger = appLogger, backend = 'sqlite', pool, schema = 'fyxbot', config: providedConfig } = {}) {
  let config;
  try {
    config = providedConfig || getExternalBackupConfig();
  } catch (error) {
    logger.error(`[FyxBot][Backup] ${error.message}`);
    return { stop() {} };
  }
  if (!config.enabled) return { stop() {} };
  if (backend !== 'sqlite' && backend !== 'postgres') throw new Error('Moteur de sauvegarde inconnu.');
  if (backend === 'postgres' && !pool) throw new Error('Connexion PostgreSQL absente pour la sauvegarde externe.');

  const stateFile = path.join(getDataDirectory(), backend === 'postgres'
    ? '.external-backup-postgres-state.json' : '.external-backup-state.json');
  const intervalMs = config.intervalDays * 24 * 60 * 60 * 1000;
  let stopped = false;
  let running = false;
  let timer;

  const check = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const state = await readBackupState(stateFile);
      const lastBackupAt = state?.lastBackupAt ? Date.parse(state.lastBackupAt) : 0;
      if (!Number.isFinite(lastBackupAt) || Date.now() - lastBackupAt >= intervalMs) {
        const result = backend === 'postgres'
          ? await createPostgresExternalBackup(config, { pool, schema })
          : await createExternalBackup(config);
        await writeBackupState(stateFile, result);
        logger.log(`[FyxBot][Backup] Sauvegarde externe réussie : ${result.key} (${result.encryptedBytes} octets).`);
      }
    } catch (error) {
      logger.error(`[FyxBot][Backup] Échec de la sauvegarde externe : ${error.message}`);
    } finally {
      running = false;
      if (!stopped) {
        timer = setTimeout(check, CHECK_INTERVAL_MS);
        timer.unref();
      }
    }
  };

  timer = setTimeout(check, INITIAL_DELAY_MS);
  timer.unref();
  logger.log(`[FyxBot][Backup] Sauvegarde externe activée tous les ${config.intervalDays} jours.`);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = {
  BACKUP_MAGIC,
  LEGACY_BACKUP_MAGIC,
  backupObjectKey,
  createExternalBackup,
  createPostgresExternalBackup,
  decryptBackup,
  encryptBackup,
  getExternalBackupConfig,
  postgresBackupObjectKey,
  restorePostgresExternalBackup,
  selectExpiredBackupKeys,
  snapshotDatabase,
  startExternalBackupScheduler,
};
