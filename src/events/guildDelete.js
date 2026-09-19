const { Events } = require('discord.js');
const { purgeGuildData } = require('../services/dataRetention');
const logger = require('../services/logger').logger.child({ component: 'guild-lifecycle' });

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    try {
      guild.client?.twitchRuntimeManager?.stopGuild(guild.id, { recordStatus: false });
      const result = await purgeGuildData(guild.id);
      const removed = Object.values(result).reduce((total, value) => total + (Number(value) || 0), 0);
      logger.info({ guildId: guild.id, guildName: guild.name, removed }, '[FyxBot] Bot retiré du serveur, données opérationnelles purgées.');
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, '[FyxBot] Échec de la purge des données du serveur.');
    }
  },
};
