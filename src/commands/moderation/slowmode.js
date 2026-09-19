const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Règle le mode lent d’un salon textuel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) => option
      .setName('secondes')
      .setDescription('0 pour désactiver, jusqu’à 6 heures')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(21_600))
    .addChannelOption((option) => option
      .setName('salon')
      .setDescription('Salon concerné (salon actuel par défaut)')
      .addChannelTypes(ChannelType.GuildText)),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('secondes', true);
    const channel = interaction.options.getChannel('salon') || interaction.channel;
    if (!channel || typeof channel.setRateLimitPerUser !== 'function') {
      return interaction.reply(ephemeral('Choisissez un salon textuel compatible.'));
    }
    const botPermissions = channel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply(ephemeral('FyxBot doit avoir la permission **Gérer les salons** dans ce salon.'));
    }

    const reason = auditReason(interaction, seconds === 0 ? 'Mode lent désactivé' : `Mode lent réglé sur ${seconds} seconde(s)`);
    await channel.setRateLimitPerUser(seconds, reason);
    await logAction(interaction.guild, {
      title: seconds === 0 ? '🐢 Mode lent désactivé' : '🐢 Mode lent modifié',
      description: `${interaction.user} a ${seconds === 0 ? 'désactivé le mode lent' : `réglé le mode lent sur **${seconds} seconde(s)**`} dans ${channel}.`,
      color: 0xf97336,
    });
    return interaction.reply(ephemeral(seconds === 0
      ? `🐢 Le mode lent est désactivé dans ${channel}.`
      : `🐢 Le mode lent est réglé sur **${seconds} seconde(s)** dans ${channel}.`));
  },
};
