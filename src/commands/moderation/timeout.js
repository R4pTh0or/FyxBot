const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { auditReason, canModerate, ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

const units = { minutes: 60_000, heures: 3_600_000, jours: 86_400_000 };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Place temporairement un membre en sourdine.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
    .addIntegerOption((option) => option.setName('duree').setDescription('Durée du timeout').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('unite').setDescription('Unité de durée').setRequired(true)
      .addChoices(
        { name: 'Minutes', value: 'minutes' },
        { name: 'Heures', value: 'heures' },
        { name: 'Jours', value: 'jours' },
      ))
    .addStringOption((option) => option.setName('raison').setDescription('Motif du timeout').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const duration = interaction.options.getInteger('duree', true);
    const unit = interaction.options.getString('unite', true);
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';
    if (!member) return interaction.reply(ephemeral('Ce membre n’est plus présent sur le serveur.'));

    const error = canModerate(interaction, member);
    if (error) return interaction.reply(ephemeral(error));
    if (!member.moderatable) return interaction.reply(ephemeral('FyxBot ne peut pas placer ce membre en timeout. Vérifiez la hiérarchie de ses rôles.'));
    const milliseconds = duration * units[unit];
    if (milliseconds > 2_419_200_000) {
      return interaction.reply(ephemeral('Discord limite les timeouts à 28 jours.'));
    }

    await member.timeout(milliseconds, auditReason(interaction, reason));
    await logAction(interaction.guild, { title: '⏳ Timeout', description: `**${member.user.tag}** a été placé en timeout pour ${duration} ${unit} par ${interaction.user}.\n**Raison :** ${reason}`, color: 0xfee75c });
    return interaction.reply(ephemeral(`⏳ **${member.user.tag}** est en timeout pour ${duration} ${unit}.\nRaison : ${reason}`));
  },
};
