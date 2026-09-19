const { Events } = require('discord.js');
const { handleVoiceStateUpdate } = require('../services/temporaryVoice');
const logger = require('../services/logger').logger.child({ component: 'temporary-voice' });

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error({ err: error, guildId: newState.guild.id }, '[FyxBot] Erreur de salon vocal temporaire.');
    }
  },
};
