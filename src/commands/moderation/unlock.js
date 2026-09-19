const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Déverrouille un salon et restaure ses permissions héritées.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) => option
      .setName('salon')
      .setDescription('Salon concerné (salon actuel par défaut)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option
      .setName('raison')
      .setDescription('Motif du déverrouillage')
      .setMaxLength(400)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') || interaction.channel;
    const reason = interaction.options.getString('raison') || 'Fin du verrouillage';
    if (!channel?.permissionOverwrites || !channel.isTextBased()) {
      return interaction.reply(ephemeral('Choisissez un salon textuel compatible.'));
    }
    const botPermissions = channel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply(ephemeral('FyxBot doit avoir la permission **Gérer les rôles** dans ce salon.'));
    }

    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { SendMessages: null },
      { reason: auditReason(interaction, reason) },
    );
    await logAction(interaction.guild, {
      title: '🔓 Salon déverrouillé',
      description: `${interaction.user} a déverrouillé ${channel}.\n**Raison :** ${reason}`,
      color: 0x57f287,
    });
    return interaction.reply(ephemeral(`🔓 ${channel} est déverrouillé et utilise de nouveau les permissions héritées.`));
  },
};
