const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SUPPORT_CLEANUP_INTERVAL_MS,
  purgeExpiredSupportHistory,
  startSupportRetentionScheduler,
} = require('../src/services/supportRetention');

test('calcule la limite de conservation des demandes à 90 jours', async () => {
  let received;
  const deleted = await purgeExpiredSupportHistory({
    now: new Date('2026-09-23T12:00:00.000Z'),
    purge: async options => { received = options; return 2; },
  });
  assert.equal(deleted, 2);
  assert.equal(received.cutoff, '2026-06-25T12:00:00.000Z');
  assert.equal(SUPPORT_CLEANUP_INTERVAL_MS, 6 * 60 * 60 * 1000);
});

test('le planificateur lance le nettoyage puis peut être arrêté', async () => {
  let calls = 0;
  const scheduler = startSupportRetentionScheduler({ cleanup: async () => { calls += 1; return 0; }, intervalMs: 60_000 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  scheduler.stop();
  assert.equal(await scheduler.run(), 0);
  assert.equal(calls, 1);
});
