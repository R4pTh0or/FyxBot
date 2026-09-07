const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, canModerate, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Membre à bannir').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif du bannissement').setMaxLength(400))
    .addIntegerOption((option) => option.setName('messages').setDescription('Heures de messages à supprimer').setMinValue(0).setMaxValue(168)),

  async execute(interaction) {
    const user = interaction.options.getUser('membre', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';
    const deleteMessageSeconds = (interaction.options.getInteger('messages') || 0) * 3600;

    if (member) {
      const error = canModerate(interaction, member);
      if (error) return interaction.reply(ephemeral(error));
      if (!member.bannable) return interaction.reply(ephemeral('FyxBot ne peut pas bannir ce membre. Vérifiez la hiérarchie de ses rôles.'));
    }

    await interaction.guild.members.ban(user, {
      deleteMessageSeconds,
      reason: auditReason(interaction, reason),
    });
    await logAction(interaction.guild, { title: '🔨 Bannissement', description: `**${user.tag}** (${user.id}) a été banni par ${interaction.user}.\n**Raison :** ${reason}`, color: 0xed4245 });
    return interaction.reply(ephemeral(`🔨 **${user.tag}** a été banni.\nRaison : ${reason}`));
  },
};
