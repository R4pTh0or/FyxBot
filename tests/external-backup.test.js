const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const {
  backupObjectKey,
  decryptBackup,
  encryptBackup,
  getExternalBackupConfig,
  selectExpiredBackupKeys,
  snapshotDatabase,
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
