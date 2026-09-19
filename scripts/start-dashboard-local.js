require('dotenv').config({ quiet: true });

const { Client, Collection, GatewayIntentBits } = require('discord.js');

function applyLocalDashboardEnvironment() {
  process.env.NODE_ENV = 'development';
  process.env.DASHBOARD_API_HOST = '127.0.0.1';
  process.env.DASHBOARD_API_PORT = '3001';
  process.env.DASHBOARD_PUBLIC_URL = 'http://127.0.0.1:3000/v2';
  process.env.DASHBOARD_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
  process.env.DASHBOARD_TRUST_PROXY = 'false';
  process.env.DISCORD_OAUTH_CALLBACK = 'http://127.0.0.1:3001/api/auth/callback';
  delete process.env.RAILWAY_ENVIRONMENT_ID;
  delete process.env.RAILWAY_PROJECT_ID;
  delete process.env.PORT;
}

function createLocalDashboardClient(config) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
  });
  client.config = config;
  client.commands = new Collection();
  return client;
}

async function startLocalDashboard() {
  applyLocalDashboardEnvironment();

  const { getConfig } = require('../src/config');
  const { startDashboardServer } = require('../src/services/dashboardServer');
  const config = getConfig({ requireClientId: true });
  const client = createLocalDashboardClient(config);

  await client.login(config.token);
  const server = startDashboardServer(client);
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[FyxBot] Arrêt du panel local demandé (${signal}).`);
    server.close(() => {
      client.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  console.log('[FyxBot] Mode panel local actif : aucune commande ni automatisation Discord n’est chargée.');

  return { client, server };
}

if (require.main === module) {
  startLocalDashboard().catch((error) => {
    const code = error?.code || error?.name || 'ERREUR_INCONNUE';
    const message = error?.message || String(error || 'Aucun détail fourni.');
    console.error(`[FyxBot] Impossible de démarrer le panel local (${code}) : ${message}`);
    process.exitCode = 1;
  });
}

module.exports = { applyLocalDashboardEnvironment, createLocalDashboardClient, startLocalDashboard };
