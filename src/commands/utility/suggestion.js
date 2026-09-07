const { randomUUID } = require('node:crypto');
const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getSuggestionConfig } = require('../../database/suggestionStore');
const { logAction } = require('../../services/logs');
const { addSuggestion } = require('../../database/suggestionRecordStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Propose une idée à la communauté.')
    .addStringOption((option) => option
      .setName('idee')
      .setDescription('Votre suggestion')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1500))
    .addBooleanOption((option) => option
      .setName('anonyme')
      .setDescription('Masquer votre identité dans la publication')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = await getSuggestionConfig(interaction.guildId);
    if (!config) return interaction.editReply('Le système de suggestions n’est pas encore configuré.');

    const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.editReply('Le salon de suggestions configuré n’existe plus. Un administrateur doit relancer `/suggestion-config`.');
    }

    const idea = interaction.options.getString('idee', true);
    const anonymous = interaction.options.getBoolean('anonyme') || false;
    const suggestionId = randomUUID().split('-')[0];
    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(`💡 Suggestion ${suggestionId}`)
      .setDescription(idea)
      .setAuthor(anonymous
        ? { name: 'Suggestion anonyme' }
        : { name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: 'FyxBot • Votez avec 👍 ou 👎' })
      .setTimestamp();

    const message = await channel.send({ embeds: [embed] });
    await message.react('👍');
    await message.react('👎');
    addSuggestion({
      id: suggestionId,
      guildId: interaction.guildId,
      channelId: channel.id,
      messageId: message.id,
      authorId: interaction.user.id,
      authorName: interaction.user.tag,
      anonymous,
      idea,
    });
    await logAction(interaction.guild, {
      title: '💡 Nouvelle suggestion',
      description: `Suggestion **${suggestionId}** publiée dans ${channel} par ${interaction.user}.`,
      color: 0xf97316,
    });
    return interaction.editReply(`✅ Votre suggestion a été publiée : ${message.url}`);
  },
};
