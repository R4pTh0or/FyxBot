const { createHmac, timingSafeEqual } = require('node:crypto');

const EVENTSUB_HEADERS = Object.freeze({
  messageId: 'twitch-eventsub-message-id',
  messageRetry: 'twitch-eventsub-message-retry',
  messageSignature: 'twitch-eventsub-message-signature',
  messageTimestamp: 'twitch-eventsub-message-timestamp',
  messageType: 'twitch-eventsub-message-type',
  subscriptionType: 'twitch-eventsub-subscription-type',
});

class TwitchEventSubError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TwitchEventSubError';
    this.code = options.code || 'invalid_eventsub_request';
    this.status = options.status || 400;
  }
}

function readHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '').trim();
  const expected = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === expected);
  return key ? String(headers[key] || '').trim() : '';
}

function rawBodyBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  throw new TwitchEventSubError('Corps brut EventSub requis.', { code: 'raw_body_required' });
}

function normalizedNow(now) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(value)) throw new TwitchEventSubError('Horloge EventSub invalide.', { status: 500 });
  return value;
}

function verifyEventSubSignature(secret, input, now = Date.now(), maximumAgeSeconds = 600) {
  try {
    const normalizedSecret = String(secret || '');
    const messageId = String(input?.messageId || '');
    const timestamp = String(input?.timestamp || '');
    const signature = String(input?.signature || '');
    const rawBody = rawBodyBuffer(input?.rawBody);
    const nowMs = normalizedNow(now);
    const occurredAt = Date.parse(timestamp);

    if (normalizedSecret.length < 10 || normalizedSecret.length > 100 || /[\r\n\0]/.test(normalizedSecret)) return false;
    if (!messageId || messageId.length > 512 || /[\r\n\0]/.test(messageId)) return false;
    if (!Number.isFinite(occurredAt) || Math.abs(nowMs - occurredAt) > maximumAgeSeconds * 1_000) return false;
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;

    const expected = createHmac('sha256', normalizedSecret)
      .update(messageId, 'utf8')
      .update(timestamp, 'utf8')
      .update(rawBody)
      .digest();
    const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

class TwitchEventSubVerifier {
  constructor(options = {}) {
    this.secret = String(options.secret || '');
    if (this.secret.length < 10 || this.secret.length > 100 || /[\r\n\0]/.test(this.secret)) {
      throw new TwitchEventSubError('Secret EventSub Twitch invalide.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }

    this.now = options.now || Date.now;
    this.maximumAgeSeconds = options.maximumAgeSeconds === undefined ? 600 : Number(options.maximumAgeSeconds);
    this.maximumRememberedMessages = options.maximumRememberedMessages === undefined
      ? 10_000
      : Number(options.maximumRememberedMessages);
    this.maximumBodyBytes = options.maximumBodyBytes === undefined ? 1_048_576 : Number(options.maximumBodyBytes);
    if (!Number.isInteger(this.maximumAgeSeconds) || this.maximumAgeSeconds < 1 || this.maximumAgeSeconds > 3_600) {
      throw new TwitchEventSubError('Durée EventSub invalide.', { code: 'invalid_configuration', status: 500 });
    }
    if (
      !Number.isInteger(this.maximumRememberedMessages)
      || this.maximumRememberedMessages < 1
      || this.maximumRememberedMessages > 100_000
    ) {
      throw new TwitchEventSubError('Capacité anti-rejeu EventSub invalide.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }
    if (!Number.isInteger(this.maximumBodyBytes) || this.maximumBodyBytes < 1 || this.maximumBodyBytes > 10_485_760) {
      throw new TwitchEventSubError('Taille EventSub invalide.', { code: 'invalid_configuration', status: 500 });
    }
    this.seenMessages = new Map();
  }

  verifyAndParse(request = {}) {
    const rawBody = rawBodyBuffer(request.rawBody);
    if (rawBody.byteLength > this.maximumBodyBytes) {
      throw new TwitchEventSubError('Notification EventSub trop volumineuse.', {
        code: 'payload_too_large',
        status: 413,
      });
    }

    const messageId = readHeader(request.headers, EVENTSUB_HEADERS.messageId);
    const timestamp = readHeader(request.headers, EVENTSUB_HEADERS.messageTimestamp);
    const signature = readHeader(request.headers, EVENTSUB_HEADERS.messageSignature);
    const messageType = readHeader(request.headers, EVENTSUB_HEADERS.messageType);
    const subscriptionType = readHeader(request.headers, EVENTSUB_HEADERS.subscriptionType) || undefined;
    const retry = readHeader(request.headers, EVENTSUB_HEADERS.messageRetry) === 'true';
    if (!messageId || !timestamp || !signature || !messageType || /[\r\n\0]/.test(messageType)) {
      throw new TwitchEventSubError('En-têtes EventSub incomplets.', { code: 'missing_headers' });
    }

    const now = normalizedNow(this.now());
    const occurredAt = Date.parse(timestamp);
    if (!Number.isFinite(occurredAt) || Math.abs(now - occurredAt) > this.maximumAgeSeconds * 1_000) {
      throw new TwitchEventSubError('Notification EventSub expirée.', {
        code: 'stale_message',
        status: 403,
      });
    }

    if (!verifyEventSubSignature(
      this.secret,
      { messageId, timestamp, signature, rawBody },
      now,
      this.maximumAgeSeconds,
    )) {
      throw new TwitchEventSubError('Signature EventSub invalide.', {
        code: 'invalid_signature',
        status: 403,
      });
    }

    this.#pruneMessages(now);
    if (this.seenMessages.has(messageId)) {
      throw new TwitchEventSubError('Notification EventSub déjà traitée.', {
        code: 'replayed_message',
        status: 409,
      });
    }
    this.seenMessages.set(messageId, now + this.maximumAgeSeconds * 1_000);
    while (this.seenMessages.size > this.maximumRememberedMessages) {
      this.seenMessages.delete(this.seenMessages.keys().next().value);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    } catch {
      throw new TwitchEventSubError('Corps EventSub illisible.', { code: 'invalid_json' });
    }

    return {
      messageId,
      messageType,
      timestamp: new Date(occurredAt),
      subscriptionType,
      retry,
      payload,
    };
  }

  #pruneMessages(now) {
    for (const [messageId, expiresAt] of this.seenMessages) {
      if (expiresAt <= now) this.seenMessages.delete(messageId);
    }
  }
}

module.exports = {
  EVENTSUB_HEADERS,
  TwitchEventSubError,
  TwitchEventSubVerifier,
  verifyEventSubSignature,
};
