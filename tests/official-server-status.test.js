const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_INTERVAL_MS,
  STATUS_FOOTER,
  buildOfficialStatusEmbed,
  isOfficialStatusEnabled,
  normalizeStatusInterval,
  probePanelHealth,
  resolvePublicUrl,
} = require('../src/services/officialServerStatus');

test('active le statut par défaut uniquement en production', () => {
  assert.equal(isOfficialStatusEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(isOfficialStatusEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isOfficialStatusEnabled({ NODE_ENV: 'production', FYXBOT_OFFICIAL_STATUS_ENABLED: 'false' }), false);
  assert.equal(isOfficialStatusEnabled({ NODE_ENV: 'development', FYXBOT_OFFICIAL_STATUS_ENABLED: 'true' }), true);
});

test('borne la fréquence entre une minute et une heure', () => {
  assert.equal(normalizeStatusInterval(undefined), DEFAULT_INTERVAL_MS);
  assert.equal(normalizeStatusInterval(10), 60_000);
  assert.equal(normalizeStatusInterval(120_000), 120_000);
  assert.equal(normalizeStatusInterval(9_000_000), 3_600_000);
});

test('utilise uniquement une URL HTTP valide', () => {
  assert.equal(resolvePublicUrl({ DASHBOARD_PUBLIC_URL: 'https://example.com/panel' }), 'https://example.com/panel');
  assert.match(resolvePublicUrl({ DASHBOARD_PUBLIC_URL: 'javascript:alert(1)' }), /^https:\/\//);
  assert.match(resolvePublicUrl({ DASHBOARD_PUBLIC_URL: 'invalide' }), /^https:\/\//);
});

test('déclare le panel sain uniquement avec Discord connecté', async () => {
  const healthy = await probePanelHealth({
    publicUrl: 'https://example.com/',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, discord: 'connected' }) }),
  });
  const unhealthy = await probePanelHealth({
    publicUrl: 'https://example.com/',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, discord: 'connecting' }) }),
  });
  assert.deepEqual(healthy, { ok: true, status: 200 });
  assert.deepEqual(unhealthy, { ok: false, status: 200 });
});

test('construit un message vert et horodaté quand tout fonctionne', () => {
  const checkedAt = new Date('2026-09-21T10:00:00.000Z');
  const data = buildOfficialStatusEmbed({
    botConnected: true,
    panelHealthy: true,
    checkedAt,
    publicUrl: 'https://example.com/',
  }).toJSON();
  assert.equal(data.color, 0x22c55e);
  assert.equal(data.footer.text, STATUS_FOOTER);
  assert.equal(
    data.fields.find((field) => field.name === 'Dernière vérification').value,
    `<t:${Math.floor(checkedAt.getTime() / 1000)}:R>`,
  );
  assert.match(data.description, /actualisé automatiquement/i);
});

test('signale une indisponibilité sans jeter une erreur réseau', async () => {
  const result = await probePanelHealth({
    publicUrl: 'https://example.com/',
    fetchImpl: async () => { throw new Error('network down'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.error, /network down/);
});
