const { Events } = require('discord.js');
const { recordGuild } = require('../database/creatorStatsStore');
const { sendGuildOnboarding } = require('../services/guildOnboarding');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    recordGuild(guild);
    console.log(`[FyxBot] Installé sur ${guild.name}.`);
    const onboarding = await sendGuildOnboarding(guild);
    if (onboarding.sent) console.log(`[FyxBot] Parcours de configuration proposé dans ${onboarding.channelId}.`);
    else console.warn(`[FyxBot] Aucun message d’arrivée envoyé sur ${guild.name} (${onboarding.reason}).`);
  },
};
