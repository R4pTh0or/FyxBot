require('dotenv').config({ quiet: true });
const { assertRuntimeBackendReady, initializeRuntimeBackend } = require('./database/runtimeBackend');
const { getConfig } = require('./config');
const logger = require('./services/logger').logger.child({ component: 'bootstrap' });
let bootRuntime;
let bootClient;

async function start() {
  const config = getConfig();
  const runtime = await initializeRuntimeBackend();
  bootRuntime = runtime;
  assertRuntimeBackendReady();
  const { Client, Collection, GatewayIntentBits } = require('discord.js');
  const { loadCommands } = require('./loaders/commandLoader');
  const { loadEvents } = require('./loaders/eventLoader');
  const { startDashboardServer } = require('./services/dashboardServer');
  const { startExternalBackupScheduler } = require('./services/externalBackup');
  const { startBirthdayScheduler } = require('./services/birthdays');
  const { startSocialNotificationScheduler } = require('./services/socialAutomation');
  const { startTwitchConnectionManager } = require('./services/twitchConnectionManager');
  const twitchStore = runtime.stores
    ? { ...require('./database/twitchStore'), ...runtime.stores.twitch }
    : undefined;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
  });
  bootClient = client;

  client.commands = new Collection();
  client.config = config;

  await loadCommands(client);
  await loadEvents(client);
  await client.login(config.token);
  const twitchManager = await startTwitchConnectionManager({ store: twitchStore });
  client.twitchRuntimeManager = twitchManager;
  const dashboardServer = startDashboardServer(client, {
    twitchDependencies: {
      store: twitchStore,
      runtimeHooks: {
        onConnectionChanged: ({ guildId }) => twitchManager.refreshAfterConfiguration(guildId),
        onChatConfigChanged: ({ guildId }) => twitchManager.refreshAfterConfiguration(guildId),
        onCommandsChanged: ({ guildId }) => twitchManager.refreshAfterCommands(guildId),
        onDisconnected: ({ guildId }) => twitchManager.stopGuild(guildId, { recordStatus: false }),
      },
    },
  });
  const backupScheduler = startExternalBackupScheduler({
    backend: runtime.backend, pool: runtime.pool, schema: runtime.schema,
  });
  const birthdayScheduler = startBirthdayScheduler(client);
  const socialScheduler = startSocialNotificationScheduler(client);
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, '[FyxBot] Arrêt propre demandé.');
    backupScheduler.stop();
    birthdayScheduler.stop();
    socialScheduler.stop();
    twitchManager.stop();
    dashboardServer.close(async () => {
      client.destroy();
      await runtime.pool?.end().catch((error) => logger.error({ err: error }, '[FyxBot] Fermeture PostgreSQL impossible.'));
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

start().catch(async (error) => {
  logger.fatal({ err: error }, '[FyxBot] Échec du démarrage.');
  bootClient?.destroy();
  await bootRuntime?.pool?.end().catch(() => {});
  process.exitCode = 1;
});
