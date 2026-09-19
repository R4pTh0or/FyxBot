const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const { applyLocalDashboardEnvironment, createLocalDashboardClient } = require('../scripts/start-dashboard-local');

test('configure le panel local sans charger les automatisations de production', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DASHBOARD_API_HOST: process.env.DASHBOARD_API_HOST,
    DASHBOARD_API_PORT: process.env.DASHBOARD_API_PORT,
    DASHBOARD_PUBLIC_URL: process.env.DASHBOARD_PUBLIC_URL,
    DASHBOARD_ALLOWED_ORIGINS: process.env.DASHBOARD_ALLOWED_ORIGINS,
    DASHBOARD_TRUST_PROXY: process.env.DASHBOARD_TRUST_PROXY,
    DISCORD_OAUTH_CALLBACK: process.env.DISCORD_OAUTH_CALLBACK,
    RAILWAY_ENVIRONMENT_ID: process.env.RAILWAY_ENVIRONMENT_ID,
    RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
    PORT: process.env.PORT,
  };

  process.env.RAILWAY_ENVIRONMENT_ID = 'production';
  process.env.RAILWAY_PROJECT_ID = 'production';
  process.env.PORT = '9999';
  applyLocalDashboardEnvironment();

  assert.equal(process.env.NODE_ENV, 'development');
  assert.equal(process.env.DASHBOARD_API_HOST, '127.0.0.1');
  assert.equal(process.env.DASHBOARD_API_PORT, '3001');
  assert.equal(process.env.DASHBOARD_PUBLIC_URL, 'http://127.0.0.1:3000/v2');
  assert.equal(process.env.DISCORD_OAUTH_CALLBACK, 'http://127.0.0.1:3001/api/auth/callback');
  assert.equal(process.env.RAILWAY_ENVIRONMENT_ID, undefined);
  assert.equal(process.env.RAILWAY_PROJECT_ID, undefined);
  assert.equal(process.env.PORT, undefined);

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('transmet la configuration au client utilisé par le panel local', () => {
  const config = Object.freeze({ token: 'non-utilisé-par-ce-test', guildId: '123456789012345678' });
  const client = createLocalDashboardClient(config);
  assert.equal(client.config, config);
  assert.equal(client.commands.size, 0);
  client.destroy();
});

test('sert le panel local sur le même domaine que le retour OAuth Discord', () => {
  const dashboardPackage = require(path.join('..', 'dashboard', 'package.json'));
  assert.match(dashboardPackage.scripts.dev, /--hostname 127\.0\.0\.1/);
});
