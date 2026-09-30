const { SlashCommandBuilder } = require('discord.js');

function normalizeLatency(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function measurePing(interaction, now = Date.now()) {
  return {
    interactionMs: normalizeLatency(now - interaction.createdTimestamp),
    websocketMs: normalizeLatency(interaction.client?.ws?.ping),
  };
}

function formatLatency(value) {
  return value === null ? 'indisponible' : `${value} ms`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Affiche la latence de FyxBot.'),

  async execute(interaction) {
    const latency = measurePing(interaction);
    await interaction.reply({
      content: `🏓 Pong ! Interaction : ${formatLatency(latency.interactionMs)} · Passerelle Discord : ${formatLatency(latency.websocketMs)}`,
    });
  },
};

module.exports.measurePing = measurePing;
module.exports.formatLatency = formatLatency;
