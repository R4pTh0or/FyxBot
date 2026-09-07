const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, canModerate, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif de l’expulsion').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';
    if (!member) return interaction.reply(ephemeral('Ce membre n’est plus présent sur le serveur.'));

    const error = canModerate(interaction, member);
    if (error) return interaction.reply(ephemeral(error));
    if (!member.kickable) return interaction.reply(ephemeral('FyxBot ne peut pas expulser ce membre.'));

    await member.kick(auditReason(interaction, reason));
    await logAction(interaction.guild, { title: '👢 Expulsion', description: `**${member.user.tag}** (${member.id}) a été expulsé par ${interaction.user}.\n**Raison :** ${reason}`, color: 0xed4245 });
    return interaction.reply(ephemeral(`👢 **${member.user.tag}** a été expulsé.\nRaison : ${reason}`));
  },
};
