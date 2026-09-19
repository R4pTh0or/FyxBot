const {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
} = require('discord.js');
const { getConfig } = require('./config');
const { readCommands } = require('./loaders/commandLoader');
const logger = require('./services/logger').logger.child({ component: 'command-deployment' });

function serializeCommands(commands, deployGlobally) {
  return commands.map((command) => {
    const payload = command.data.toJSON();
    if (!deployGlobally) return payload;
    return {
      ...payload,
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild],
    };
  });
}

function selectCommands(commands, { excludePremium = false } = {}) {
  if (!excludePremium) return commands;
  return commands.filter((command) => (command.data.name || command.data.toJSON().name) !== 'premium');
}

async function deployCommands() {
  const config = getConfig({ requireClientId: true });
  const globalDeployment = process.argv.includes('--global');
  const clearGuildDeployment = process.argv.includes('--clear-guild');
  const excludePremium = process.argv.includes('--exclude-premium');
  const commands = selectCommands(await readCommands(), { excludePremium });
  const rest = new REST({ version: '10' }).setToken(config.token);

  if (clearGuildDeployment) {
    if (!config.guildId) throw new Error('GUILD_ID est nécessaire pour retirer les commandes locales.');
    logger.info({ guildId: config.guildId }, '[FyxBot] Retrait des anciennes commandes locales.');
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
    logger.info('[FyxBot] Commandes locales retirées. Les commandes globales restent actives.');
    return;
  }

  const deployGlobally = globalDeployment || !config.guildId;
  const body = serializeCommands(commands, deployGlobally);
  const route = config.guildId && !globalDeployment
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  const scope = config.guildId && !globalDeployment ? `le serveur ${config.guildId}` : 'tous les serveurs';
  logger.info({ commandCount: body.length, scope }, '[FyxBot] Publication des commandes slash.');
  await rest.put(route, { body });
  logger.info('[FyxBot] Commandes slash publiées avec succès.');
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  deployCommands().catch((error) => {
    logger.fatal({ err: error }, '[FyxBot] Échec de la publication des commandes.');
    process.exitCode = 1;
  });
}

module.exports = { deployCommands, selectCommands, serializeCommands };
