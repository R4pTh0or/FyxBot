const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { setSuggestionConfig } = require('../../database/suggestionStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion-config')
    .setDescription('Configure le salon des suggestions FyxBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('salon')
      .setDescription('Salon dans lequel publier les suggestions')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true);
    await setSuggestionConfig(interaction.guildId, {
      channelId: channel.id,
      updatedAt: new Date().toISOString(),
    });
    await interaction.reply({
      content: `✅ Les suggestions seront publiées dans ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
