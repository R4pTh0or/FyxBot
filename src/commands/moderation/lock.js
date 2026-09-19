const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille un salon textuel pour les membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) => option
      .setName('salon')
      .setDescription('Salon concerné (salon actuel par défaut)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('raison')
      .setDescription('Motif du verrouillage')
      .setMaxLength(400)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') || interaction.channel;
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';
    if (!channel?.permissionOverwrites || !channel.isTextBased()) {
      return interaction.reply(ephemeral('Choisissez un salon textuel compatible.'));
    }
    const botPermissions = channel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply(ephemeral('FyxBot doit avoir la permission **Gérer les rôles** dans ce salon.'));
    }

    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { SendMessages: false },
      { reason: auditReason(interaction, reason) },
    );
    await logAction(interaction.guild, {
      title: '🔒 Salon verrouillé',
      description: `${interaction.user} a verrouillé ${channel}.\n**Raison :** ${reason}`,
      color: 0xed4245,
    });
    return interaction.reply(ephemeral(`🔒 ${channel} est maintenant verrouillé.\nRaison : ${reason}`));
  },
};
