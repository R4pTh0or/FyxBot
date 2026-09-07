const { Events } = require('discord.js');
const { purgeGuildData } = require('../services/dataRetention');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    try {
      const result = await purgeGuildData(guild.id);
      const removed = result.configurations + result.warnings + result.auditLogs
        + result.suggestions + result.commandUsage + result.activationProgress
        + result.premiumEntitlements + result.premiumGuildLinks
        + result.warningFileEntries + result.localBackups;
      console.log(`[FyxBot] Retiré de ${guild.name}. ${removed} donnée(s) opérationnelle(s) supprimée(s), statistiques anonymisées.`);
    } catch (error) {
      console.error(`[FyxBot] Échec de la purge des données de ${guild.id} :`, error);
    }
  },
};
