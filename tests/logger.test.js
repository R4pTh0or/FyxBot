const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const test = require('node:test');
const {
  REDACTED_VALUE,
  createStructuredLogger,
  normalizeLogArguments,
  runningNodeTests,
  shouldPrettyPrint,
} = require('../src/services/logger');

test('normalise une erreur et ses informations structurées', () => {
  const error = new Error('échec simulé');
  const result = normalizeLogArguments([
    { guildId: 'guild-1' },
    'Action impossible.',
    error,
    { commandName: 'ping' },
  ]);

  assert.equal(result.message, 'Action impossible.');
  assert.equal(result.context.guildId, 'guild-1');
  assert.equal(result.context.err, error);
  assert.deepEqual(result.context.details, { commandName: 'ping' });
});

test('masque les informations sensibles dans les journaux JSON', async () => {
  let output = '';
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createStructuredLogger({
    base: {},
    destination,
    environment: { NODE_ENV: 'production' },
    level: 'info',
    pretty: false,
  });

  logger.info({ guildId: 'guild-1', token: 'secret-token' }, 'Test du logger.');
  await new Promise((resolve) => setImmediate(resolve));

  const entry = JSON.parse(output.trim());
  assert.equal(entry.guildId, 'guild-1');
  assert.equal(entry.token, REDACTED_VALUE);
  assert.equal(entry.msg, 'Test du logger.');
});

test('désactive l’affichage enrichi pendant les tests', () => {
  const environment = { NODE_TEST_CONTEXT: 'child-v8' };
  assert.equal(runningNodeTests(environment, []), true);
  assert.equal(shouldPrettyPrint(environment, []), false);
});
