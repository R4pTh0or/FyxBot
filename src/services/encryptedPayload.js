const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ENCRYPTED_PAYLOAD_MAGIC = 'FYXBOT-ENCRYPTED-V1';

function decodeEncryptionKey(value, variableName = 'FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY') {
  const key = Buffer.from(value || '', 'base64');
  if (key.length !== 32) {
    throw new Error(`${variableName} doit contenir une clé Base64 de 32 octets.`);
  }
  return key;
}

function encryptPayload(plainPayload, encryptionKey, createdAt = new Date()) {
  const plain = Buffer.isBuffer(plainPayload) ? plainPayload : Buffer.from(plainPayload);
  const compressed = zlib.gzipSync(plain, { level: zlib.constants.Z_BEST_COMPRESSION });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const header = {
    algorithm: 'aes-256-gcm',
    authTag: cipher.getAuthTag().toString('base64'),
    createdAt: createdAt.toISOString(),
    iv: iv.toString('base64'),
    sha256: crypto.createHash('sha256').update(plain).digest('hex'),
    version: 1,
  };
  return Buffer.concat([
    Buffer.from(`${ENCRYPTED_PAYLOAD_MAGIC}\n${JSON.stringify(header)}\n`, 'utf8'),
    ciphertext,
  ]);
}

function decryptPayload(encryptedPayload, encryptionKey) {
  const firstNewline = encryptedPayload.indexOf(10);
  const secondNewline = encryptedPayload.indexOf(10, firstNewline + 1);
  if (firstNewline < 0 || secondNewline < 0 || secondNewline > 8192) {
    throw new Error('Format de donnée chiffrée FyxBot invalide.');
  }
  if (encryptedPayload.subarray(0, firstNewline).toString('utf8') !== ENCRYPTED_PAYLOAD_MAGIC) {
    throw new Error('Signature de donnée chiffrée FyxBot invalide.');
  }
  const header = JSON.parse(encryptedPayload.subarray(firstNewline + 1, secondNewline).toString('utf8'));
  if (header.version !== 1 || header.algorithm !== 'aes-256-gcm') {
    throw new Error('Version de donnée chiffrée FyxBot non prise en charge.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(header.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(header.authTag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(encryptedPayload.subarray(secondNewline + 1)),
    decipher.final(),
  ]);
  const plain = zlib.gunzipSync(compressed);
  const digest = crypto.createHash('sha256').update(plain).digest('hex');
  if (digest !== header.sha256) throw new Error('La donnée chiffrée FyxBot est corrompue.');
  return { header, plain };
}

module.exports = {
  ENCRYPTED_PAYLOAD_MAGIC,
  decodeEncryptionKey,
  decryptPayload,
  encryptPayload,
};
