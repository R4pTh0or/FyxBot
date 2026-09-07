const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { addWarning } = require('../../database/warningStore');
const { canModerate, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Ajoute un avertissement à un membre.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif de l’avertissement').setRequired(true).setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison', true);
    if (!member) return interaction.reply(ephemeral('Ce membre n’est plus présent sur le serveur.'));

    const error = canModerate(interaction, member);
    if (error) return interaction.reply(ephemeral(error));

    const result = await addWarning({
      guildId: interaction.guildId,
      userId: member.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await logAction(interaction.guild, { title: '⚠️ Avertissement', description: `**${member.user.tag}** a été averti par ${interaction.user}.\n**Raison :** ${reason}\n**Identifiant :** ${result.warning.id}`, color: 0xfee75c });
    return interaction.reply(ephemeral(`⚠️ **${member.user.tag}** a reçu un avertissement (n° ${result.warning.id}).\nTotal : ${result.count} · Raison : ${reason}`));
  },
};
