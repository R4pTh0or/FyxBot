const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { setLogConfig } = require('../../database/logStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs-config')
    .setDescription('Configure le salon des journaux FyxBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('salon')
      .setDescription('Salon dans lequel envoyer les logs et transcripts')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true);
    await setLogConfig(interaction.guildId, {
      channelId: channel.id,
      updatedAt: new Date().toISOString(),
    });
    await interaction.reply({
      content: `✅ Les logs et transcripts FyxBot seront envoyés dans ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
