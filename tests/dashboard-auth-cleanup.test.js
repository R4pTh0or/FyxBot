const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { purgeExpiredDashboardAuth } = require('../src/services/dashboardAuth');

test('la purge supprime les sessions et états OAuth expirés, y compris à la limite exacte', () => {
  const target = new DatabaseSync(':memory:');
  target.exec(`
    CREATE TABLE dashboard_sessions (token_hash TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE dashboard_oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  target.prepare('INSERT INTO dashboard_sessions VALUES (?, ?, ?)').run('old', '{}', 99);
  target.prepare('INSERT INTO dashboard_sessions VALUES (?, ?, ?)').run('edge', '{}', 100);
  target.prepare('INSERT INTO dashboard_sessions VALUES (?, ?, ?)').run('active', '{}', 101);
  target.prepare('INSERT INTO dashboard_oauth_states VALUES (?, ?)').run('old', 99);
  target.prepare('INSERT INTO dashboard_oauth_states VALUES (?, ?)').run('active', 101);
  assert.deepEqual(purgeExpiredDashboardAuth(target, 100), { oauthStates: 1, sessions: 2 });
  assert.deepEqual(target.prepare('SELECT token_hash FROM dashboard_sessions').all().map((row) => ({ ...row })), [{ token_hash: 'active' }]);
  assert.deepEqual(target.prepare('SELECT state_hash FROM dashboard_oauth_states').all().map((row) => ({ ...row })), [{ state_hash: 'active' }]);
});
