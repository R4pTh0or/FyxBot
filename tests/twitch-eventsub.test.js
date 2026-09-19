const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const {
  TwitchEventSubVerifier,
  verifyEventSubSignature,
} = require('../src/services/twitchEventSub');

const SECRET = 'eventsub-secret-fyxbot';
const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const TIMESTAMP = new Date(NOW).toISOString();

function signature(messageId, timestamp, rawBody) {
  return `sha256=${createHmac('sha256', SECRET)
    .update(messageId)
    .update(timestamp)
    .update(rawBody)
    .digest('hex')}`;
}

function request(messageId, rawBody, overrides = {}) {
  const timestamp = overrides.timestamp || TIMESTAMP;
  return {
    rawBody,
    headers: {
      'Twitch-Eventsub-Message-Id': messageId,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Signature': overrides.signature || signature(messageId, timestamp, rawBody),
      'Twitch-Eventsub-Message-Type': overrides.messageType || 'notification',
      'Twitch-Eventsub-Subscription-Type': 'stream.online',
      'Twitch-Eventsub-Message-Retry': overrides.retry || 'false',
    },
  };
}

test('vérifie le HMAC du corps brut puis retourne une notification normalisée', () => {
  const rawBody = Buffer.from(JSON.stringify({ subscription: { type: 'stream.online' }, event: { id: '42' } }));
  const verifier = new TwitchEventSubVerifier({ secret: SECRET, now: () => NOW });

  const result = verifier.verifyAndParse(request('message-1', rawBody));
  assert.equal(result.messageId, 'message-1');
  assert.equal(result.messageType, 'notification');
  assert.equal(result.subscriptionType, 'stream.online');
  assert.equal(result.timestamp.getTime(), NOW);
  assert.deepEqual(result.payload.event, { id: '42' });
});

test('refuse une signature modifiée avant de tenter de parser le JSON', () => {
  const rawBody = Buffer.from('{JSON volontairement invalide');
  const verifier = new TwitchEventSubVerifier({ secret: SECRET, now: () => NOW });
  const invalidSignature = `sha256=${'0'.repeat(64)}`;

  assert.throws(
    () => verifier.verifyAndParse(request('message-2', rawBody, { signature: invalidSignature })),
    (error) => error.code === 'invalid_signature' && error.status === 403,
  );
});

test('refuse un horodatage ancien avant de parser le corps', () => {
  const timestamp = new Date(NOW - 601_000).toISOString();
  const rawBody = Buffer.from('{JSON volontairement invalide');
  const verifier = new TwitchEventSubVerifier({ secret: SECRET, now: () => NOW });

  assert.throws(
    () => verifier.verifyAndParse(request('message-3', rawBody, { timestamp })),
    (error) => error.code === 'stale_message' && error.status === 403,
  );
});

test('bloque un identifiant rejoué avant de parser une nouvelle charge', () => {
  const verifier = new TwitchEventSubVerifier({ secret: SECRET, now: () => NOW });
  const firstBody = Buffer.from('{"challenge":"ok"}');
  verifier.verifyAndParse(request('message-4', firstBody, { messageType: 'webhook_callback_verification' }));

  const replayedInvalidBody = Buffer.from('{JSON invalide mais signé');
  assert.throws(
    () => verifier.verifyAndParse(request('message-4', replayedInvalidBody)),
    (error) => error.code === 'replayed_message' && error.status === 409,
  );
});

test('borne le corps brut avant toute vérification cryptographique', () => {
  const verifier = new TwitchEventSubVerifier({
    secret: SECRET,
    now: () => NOW,
    maximumBodyBytes: 10,
  });
  const rawBody = Buffer.from('{"event":"trop-long"}');

  assert.throws(
    () => verifier.verifyAndParse(request('message-5', rawBody)),
    (error) => error.code === 'payload_too_large' && error.status === 413,
  );
});

test('compare les signatures en temps constant pour Buffer et chaîne', () => {
  const rawBody = '{"event":{"id":"42"}}';
  const input = {
    messageId: 'message-6',
    timestamp: TIMESTAMP,
    rawBody,
    signature: signature('message-6', TIMESTAMP, rawBody),
  };

  assert.equal(verifyEventSubSignature(SECRET, input, NOW), true);
  assert.equal(verifyEventSubSignature(SECRET, { ...input, rawBody: `${rawBody} ` }, NOW), false);
  assert.equal(verifyEventSubSignature(SECRET, input, NOW + 601_000), false);
});

test('oublie les anciens messages de façon bornée', () => {
  let now = NOW;
  const verifier = new TwitchEventSubVerifier({
    secret: SECRET,
    now: () => now,
    maximumAgeSeconds: 1,
    maximumRememberedMessages: 1,
  });
  verifier.verifyAndParse(request('message-7', '{"event":{}}', { timestamp: new Date(now).toISOString() }));

  now += 1_001;
  const nextTimestamp = new Date(now).toISOString();
  const result = verifier.verifyAndParse(request('message-7', '{"event":{"again":true}}', { timestamp: nextTimestamp }));
  assert.equal(result.payload.event.again, true);
});
