const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { inspectEncryptedBackup } = require('../scripts/check-railway-backup-readonly');
const { POSTGRES_TABLES } = require('../src/database/postgresSchema');
const {
  backupObjectKey,
  createExternalBackup,
  decryptBackup,
  encryptBackup,
  getExternalBackupConfig,
  selectExpiredBackupKeys,
  snapshotDatabase,
  startExternalBackupScheduler,
} = require('../src/services/externalBackup');

function validEnvironment(overrides = {}) {
  return {
    FYXBOT_EXTERNAL_BACKUP_ENABLED: 'true',
    FYXBOT_BACKUP_S3_ENDPOINT: 'https://storage.example.test',
    FYXBOT_BACKUP_S3_BUCKET: 'fyxbot-backups',
    FYXBOT_BACKUP_S3_ACCESS_KEY_ID: 'access-key',
    FYXBOT_BACKUP_S3_SECRET_ACCESS_KEY: 'secret-key',
    FYXBOT_BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    ...overrides,
  };
}

test('chiffre et restaure une sauvegarde sans perte', () => {
  const key = crypto.randomBytes(32);
  const source = Buffer.from('base sqlite fyxbot de test'.repeat(100));
  const encrypted = encryptBackup(source, key, new Date('2026-08-17T12:00:00.000Z'));
  assert.notDeepEqual(encrypted, source);
  const restored = decryptBackup(encrypted, key);
  assert.deepEqual(restored.database, source);
  assert.equal(restored.header.algorithm, 'aes-256-gcm');
});

test('contrôle une restauration chiffrée entièrement en mémoire, sans toucher à Railway', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE configurations (guild_id TEXT PRIMARY KEY)');
    sqlite.prepare('INSERT INTO configurations VALUES (?)').run('test');
    const key = crypto.randomBytes(32);
    const encrypted = encryptBackup(await snapshotDatabase(sqlite, os.tmpdir()), key);
    const inspected = inspectEncryptedBackup(encrypted, key);
    assert.equal(inspected.expectedTables, 1);
    assert.equal(inspected.totalExpectedTables, POSTGRES_TABLES.length);
    assert.ok(inspected.missingTables.includes('warnings'));
    assert.throws(() => inspectEncryptedBackup(encrypted, crypto.randomBytes(32)));
  } finally {
    sqlite.close();
  }
});

test('restaure aussi une sauvegarde créée avant le renommage', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encryptBackup(Buffer.from('ancienne sauvegarde'), key);
  encrypted.set(Buffer.from('NEXORA-BACKUP-V1'));
  assert.equal(decryptBackup(encrypted, key).database.toString(), 'ancienne sauvegarde');
});

test('refuse une sauvegarde modifiée ou une mauvaise clé', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encryptBackup(Buffer.from('fyxbot'), key);
  assert.throws(() => decryptBackup(encrypted, crypto.randomBytes(32)));
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptBackup(encrypted, key));
});

test('valide toutes les variables sensibles avant activation', () => {
  assert.deepEqual(getExternalBackupConfig({}), { enabled: false });
  assert.throws(
    () => getExternalBackupConfig({ FYXBOT_EXTERNAL_BACKUP_ENABLED: 'true' }),
    /Configuration de sauvegarde manquante/,
  );
  assert.throws(
    () => getExternalBackupConfig(validEnvironment({ FYXBOT_BACKUP_ENCRYPTION_KEY: 'invalide' })),
    /32 octets/,
  );
  const config = getExternalBackupConfig(validEnvironment());
  assert.equal(config.intervalDays, 7);
  assert.equal(config.retention, 8);
});

test('refuse de planifier une sauvegarde PostgreSQL sans connexion', () => {
  const config = getExternalBackupConfig(validEnvironment());
  assert.throws(() => startExternalBackupScheduler({ backend: 'postgres', config }), /Connexion PostgreSQL absente/);
});

test('reconnaît les anciennes variables Railway pendant la transition', () => {
  const environment = Object.fromEntries(Object.entries(validEnvironment())
    .map(([name, value]) => [name.replace(/^FYXBOT_/, 'NEXORA_'), value]));
  const config = getExternalBackupConfig(environment);
  assert.equal(config.enabled, true);
  assert.equal(config.bucket, 'fyxbot-backups');
});

test('conserve seulement les sauvegardes les plus récentes', () => {
  const objects = [1, 2, 3, 4].map((day) => ({
    Key: `fyxbot/weekly/${day}.enc`,
    LastModified: new Date(`2026-08-0${day}T00:00:00Z`),
  }));
  assert.deepEqual(selectExpiredBackupKeys(objects, 2), [
    'fyxbot/weekly/2.enc',
    'fyxbot/weekly/1.enc',
  ]);
});

test('produit un nom distant stable sans caractères ambigus', () => {
  const config = { prefix: 'fyxbot/weekly' };
  assert.equal(
    backupObjectKey(config, new Date('2026-08-17T12:34:56.789Z')),
    'fyxbot/weekly/2026-08-17T12-34-56-789Z.sqlite.gz.enc',
  );
});

test('crée une copie SQLite compatible sans utiliser serialize()', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fyxbot-backup-test-'));
  const sourcePath = path.join(temporaryDirectory, 'source.sqlite');
  const restoredPath = path.join(temporaryDirectory, 'restored.sqlite');
  const sourceDatabase = new DatabaseSync(sourcePath);
  let restoredDatabase;

  try {
    sourceDatabase.exec("CREATE TABLE guilds (name TEXT NOT NULL); INSERT INTO guilds VALUES ('FyxBot');");
    const snapshot = await snapshotDatabase(sourceDatabase, temporaryDirectory);
    assert.ok(snapshot.length > 0);

    await fs.writeFile(restoredPath, snapshot);
    restoredDatabase = new DatabaseSync(restoredPath);
    assert.equal(restoredDatabase.prepare('SELECT name FROM guilds').get().name, 'FyxBot');
  } finally {
    restoredDatabase?.close();
    sourceDatabase.close();
    await fs.rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('la rétention SQLite ne supprime jamais une sauvegarde PostgreSQL', async () => {
  const sourceDatabase = new DatabaseSync(':memory:');
  try {
    sourceDatabase.exec('CREATE TABLE example (id INTEGER PRIMARY KEY); INSERT INTO example VALUES (1);');
    const config = { bucket: 'test', prefix: 'fyxbot/weekly', retention: 1,
      encryptionKey: crypto.randomBytes(32) };
    let uploaded;
    let deleted;
    const s3 = { async send(command) {
      if (command.constructor.name === 'PutObjectCommand') {
        uploaded = command.input;
        return {};
      }
      if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: uploaded.Body.length };
      if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [
        { Key: 'fyxbot/weekly/2026-01-01.sqlite.gz.enc', LastModified: new Date('2026-01-01') },
        { Key: uploaded.Key, LastModified: new Date() },
        { Key: 'fyxbot/weekly/postgres/2026-01-01.json.gz.enc', LastModified: new Date('2026-01-01') },
      ] };
      if (command.constructor.name === 'DeleteObjectsCommand') {
        deleted = command.input.Delete.Objects.map((item) => item.Key);
        return {};
      }
      throw new Error(`Commande inattendue : ${command.constructor.name}`);
    } };
    const result = await createExternalBackup(config, { s3, sourceDatabase });
    assert.equal(result.deleted, 1);
    assert.deepEqual(deleted, ['fyxbot/weekly/2026-01-01.sqlite.gz.enc']);
  } finally {
    sourceDatabase.close();
  }
});
