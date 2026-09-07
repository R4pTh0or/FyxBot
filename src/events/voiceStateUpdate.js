const { Events } = require('discord.js');
const { handleVoiceStateUpdate } = require('../services/temporaryVoice');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error(`[FyxBot] Erreur de salon vocal temporaire (${newState.guild.id}) :`, error);
    }
  },
};
