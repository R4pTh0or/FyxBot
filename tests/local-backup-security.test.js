const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { decryptPayload, encryptPayload } = require('../src/services/encryptedPayload');
const {
  decodeSnapshot,
  getLocalBackupEncryptionKey,
  migrateLegacyLocalBackups,
} = require('../src/services/serverBackup');

test('les sauvegardes locales sont authentifiées et ne contiennent pas le JSON en clair', () => {
  const key = crypto.randomBytes(32);
  const snapshot = { guild: { id: '123456789012345678', name: 'Serveur privé' }, channels: [] };
  const encrypted = encryptPayload(JSON.stringify(snapshot), key);
  assert.equal(encrypted.includes(Buffer.from('Serveur privé')), false);
  assert.deepEqual(JSON.parse(decryptPayload(encrypted, key).plain.toString('utf8')), snapshot);
  assert.deepEqual(decodeSnapshot(encrypted, key, 'backup.json.enc'), snapshot);
});

test('une sauvegarde altérée est refusée', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encryptPayload('{"safe":true}', key);
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptPayload(encrypted, key));
});

test('aucune sauvegarde ne peut être créée sans clé valide', () => {
  assert.throws(() => getLocalBackupEncryptionKey({}), /Configurez/);
  assert.throws(
    () => getLocalBackupEncryptionKey({ FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY: 'invalide' }),
    /32 octets/,
  );
});

test('convertit et vérifie les anciennes sauvegardes en clair', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fyxbot-backups-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = '123456789012345678-2026-08-28T20-00-00-000Z.json';
  const snapshot = { createdAt: '2026-08-28T20:00:00.000Z', guild: { id: '123456789012345678', name: 'Test' } };
  await fs.writeFile(path.join(directory, filename), JSON.stringify(snapshot));
  const encodedKey = crypto.randomBytes(32).toString('base64');
  assert.equal(await migrateLegacyLocalBackups({
    directory,
    environment: { FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY: encodedKey },
  }), 1);
  assert.equal(await fs.stat(path.join(directory, filename)).then(() => true).catch(() => false), false);
  const encrypted = await fs.readFile(path.join(directory, `${filename}.enc`));
  assert.deepEqual(JSON.parse(decryptPayload(encrypted, Buffer.from(encodedKey, 'base64')).plain.toString('utf8')), snapshot);
});
