const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyDeployment,
  classifyHealthCheck,
  classifyLogLine,
  normalizeLogFingerprint,
  summarizeMonitoring,
} = require('../src/services/monitoring');

test('classe une erreur de commande isolée comme mineure', () => {
  assert.equal(classifyLogLine('[FyxBot] Erreur dans /reglement : salon invalide').severity, 'minor');
});

test('classe une erreur de permission Discord comme majeure', () => {
  assert.equal(classifyLogLine('DiscordAPIError[50013]: Missing Permissions').severity, 'major');
});

test('ignore les refus HTTP attendus dus à un utilisateur non connecté', () => {
  assert.equal(classifyLogLine('[FyxBot] Erreur du panel (401) : Connexion requise').severity, 'ok');
});

test('normalise les identifiants et dates pour dédupliquer les incidents', () => {
  const first = normalizeLogFingerprint('2026-08-24T12:00:00.000Z erreur serveur 1541415111304941568');
  const second = normalizeLogFingerprint('2026-08-24T12:05:00.000Z erreur serveur 1541415111304949999');
  assert.equal(first, second);
});

test('classe les états Railway terminaux', () => {
  assert.equal(classifyDeployment('SUCCESS').severity, 'ok');
  assert.equal(classifyDeployment('FAILED').severity, 'major');
  assert.equal(classifyDeployment('DEPLOYING').severity, 'minor');
});

test('détecte un bot Discord déconnecté malgré une réponse HTTP 200', () => {
  const result = classifyHealthCheck({ path: '/api/health', status: 200, body: { discord: 'connecting' } });
  assert.equal(result.severity, 'major');
});

test('le résumé conserve la gravité la plus élevée', () => {
  const result = summarizeMonitoring({
    deployments: [{ service: 'panel', status: 'SUCCESS' }],
    logs: [{ service: 'bot', message: '[FyxBot] Erreur dans /reglement : donnée invalide' }],
    healthChecks: [{ service: 'bot', path: '/api/health', status: 503, body: {} }],
  });
  assert.equal(result.severity, 'major');
  assert.deepEqual(result.counts, { major: 1, minor: 1 });
});
