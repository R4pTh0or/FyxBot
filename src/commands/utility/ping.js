const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Affiche la latence de FyxBot.'),

  async execute(interaction) {
    const reply = await interaction.reply({
      content: 'Calcul de la latence de FyxBot…',
      withResponse: true,
    });
    const roundTrip = reply.resource?.message
      ? reply.resource.message.createdTimestamp - interaction.createdTimestamp
      : null;
    const roundTripText = roundTrip === null ? 'indisponible' : `${roundTrip} ms`;

    await interaction.editReply(
      `🏓 Pong ! Latence : ${roundTripText} · WebSocket : ${Math.round(interaction.client.ws.ping)} ms`,
    );
  },
};
