const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Révoque le bannissement d’un utilisateur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName('utilisateur').setDescription('Identifiant Discord de l’utilisateur').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif de la révocation').setMaxLength(400)),

  async execute(interaction) {
    const userId = interaction.options.getString('utilisateur', true).trim();
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';
    if (!/^\d{17,20}$/.test(userId)) return interaction.reply(ephemeral('Veuillez fournir un identifiant Discord valide.'));

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.reply(ephemeral('Cet utilisateur n’est pas banni sur ce serveur.'));

    await interaction.guild.members.unban(userId, auditReason(interaction, reason));
    await logAction(interaction.guild, { title: '✅ Débannissement', description: `**${ban.user.tag}** (${userId}) a été débanni par ${interaction.user}.\n**Raison :** ${reason}`, color: 0x57f287 });
    return interaction.reply(ephemeral(`✅ **${ban.user.tag}** a été débanni.\nRaison : ${reason}`));
  },
};
