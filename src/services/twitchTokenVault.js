const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const TOKEN_ENCRYPTION_VARIABLE = 'FYXBOT_TWITCH_TOKEN_ENCRYPTION_KEY';
const ENVELOPE_VERSION = 'v1';
const MAX_ENVELOPE_LENGTH = 32_768;

class TwitchTokenVaultError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TwitchTokenVaultError';
    this.code = 'TWITCH_TOKEN_VAULT_ERROR';
  }
}

function decodeCanonicalBase64(value, label) {
  const encoded = String(value || '').trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new TwitchTokenVaultError(`${label} doit être une valeur Base64 valide.`);
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) {
    throw new TwitchTokenVaultError(`${label} doit utiliser un encodage Base64 canonique.`);
  }
  return decoded;
}

class TwitchTokenVault {
  constructor(base64Key) {
    const key = decodeCanonicalBase64(base64Key, TOKEN_ENCRYPTION_VARIABLE);
    if (key.length !== 32) {
      throw new TwitchTokenVaultError(`${TOKEN_ENCRYPTION_VARIABLE} doit contenir exactement 32 octets encodés en Base64.`);
    }
    Object.defineProperty(this, 'key', {
      configurable: false,
      enumerable: false,
      value: key,
      writable: false,
    });
  }

  encrypt(token) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TwitchTokenVaultError('Le jeton Twitch à chiffrer est vide ou invalide.');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [
      ENVELOPE_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(envelope) {
    try {
      if (typeof envelope !== 'string' || envelope.length === 0 || envelope.length > MAX_ENVELOPE_LENGTH) {
        throw new Error('invalid envelope size');
      }
      const parts = envelope.split(':');
      if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) throw new Error('invalid envelope version');
      const iv = decodeCanonicalBase64(parts[1], 'Vecteur Twitch');
      const authTag = decodeCanonicalBase64(parts[2], 'Signature Twitch');
      const ciphertext = decodeCanonicalBase64(parts[3], 'Jeton Twitch chiffré');
      if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) throw new Error('invalid envelope parameters');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Ne jamais inclure l'enveloppe, la clé ou le jeton dans l'erreur publique.
      throw new TwitchTokenVaultError('Le jeton Twitch chiffré est invalide ou a été altéré.');
    }
  }
}

function createTwitchTokenVault(environment = process.env) {
  const key = String(environment[TOKEN_ENCRYPTION_VARIABLE] || '').trim();
  for (const backupVariable of ['FYXBOT_BACKUP_ENCRYPTION_KEY', 'FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY']) {
    const backupKey = String(environment[backupVariable] || '').trim();
    if (key && backupKey && key === backupKey) {
      throw new TwitchTokenVaultError(`${TOKEN_ENCRYPTION_VARIABLE} doit être différente des clés de sauvegarde FyxBot.`);
    }
  }
  return new TwitchTokenVault(key);
}

module.exports = {
  ENVELOPE_VERSION,
  TOKEN_ENCRYPTION_VARIABLE,
  TwitchTokenVault,
  TwitchTokenVaultError,
  createTwitchTokenVault,
};
