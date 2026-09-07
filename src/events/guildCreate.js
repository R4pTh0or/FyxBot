const { Events } = require('discord.js');
const { recordGuild } = require('../database/creatorStatsStore');
const { sendGuildOnboarding } = require('../services/guildOnboarding');
const logger = require('../services/logger').logger.child({ component: 'guild-lifecycle' });

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    recordGuild(guild);
    logger.info({ guildId: guild.id, guildName: guild.name }, '[FyxBot] Bot installé sur un serveur.');
    const onboarding = await sendGuildOnboarding(guild);
    if (onboarding.sent) {
      logger.info({ channelId: onboarding.channelId, guildId: guild.id }, '[FyxBot] Parcours de configuration proposé.');
    } else {
      logger.warn({ guildId: guild.id, reason: onboarding.reason }, '[FyxBot] Aucun message d’arrivée envoyé.');
    }
  },
};
