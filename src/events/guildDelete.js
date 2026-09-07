const { Events } = require('discord.js');
const { purgeGuildData } = require('../services/dataRetention');
const logger = require('../services/logger').logger.child({ component: 'guild-lifecycle' });

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    try {
      const result = await purgeGuildData(guild.id);
      const removed = result.configurations + result.warnings + result.auditLogs
        + result.suggestions + result.commandUsage + result.activationProgress
        + result.premiumEntitlements + result.premiumGuildLinks
        + result.warningFileEntries + result.localBackups;
      logger.info({ guildId: guild.id, guildName: guild.name, removed }, '[FyxBot] Bot retiré du serveur, données opérationnelles purgées.');
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, '[FyxBot] Échec de la purge des données du serveur.');
    }
  },
};
