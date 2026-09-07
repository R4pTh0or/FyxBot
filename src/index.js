require('dotenv').config();

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { getConfig } = require('./config');
const { loadCommands } = require('./loaders/commandLoader');
const { loadEvents } = require('./loaders/eventLoader');
const { startDashboardServer } = require('./services/dashboardServer');
const { startExternalBackupScheduler } = require('./services/externalBackup');
const { startBirthdayScheduler } = require('./services/birthdays');
const { startSocialNotificationScheduler } = require('./services/socialAutomation');

async function start() {
  const config = getConfig();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
  });

  client.commands = new Collection();
  client.config = config;

  await loadCommands(client);
  await loadEvents(client);
  await client.login(config.token);
  const dashboardServer = startDashboardServer(client);
  const backupScheduler = startExternalBackupScheduler();
  const birthdayScheduler = startBirthdayScheduler(client);
  const socialScheduler = startSocialNotificationScheduler(client);
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[FyxBot] Arrêt propre demandé (${signal}).`);
    backupScheduler.stop();
    birthdayScheduler.stop();
    socialScheduler.stop();
    dashboardServer.close(() => {
      client.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('[FyxBot] Échec du démarrage :', error);
  process.exitCode = 1;
});
