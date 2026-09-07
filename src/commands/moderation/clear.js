const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeral } = require('../../services/moderation');
const { logAction } = require('../../services/logs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime plusieurs messages récents du salon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) => option.setName('nombre').setDescription('Nombre de messages à supprimer').setRequired(true).setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    const amount = interaction.options.getInteger('nombre', true);
    if (!interaction.channel?.isTextBased() || !('bulkDelete' in interaction.channel)) {
      return interaction.reply(ephemeral('Cette commande doit être utilisée dans un salon textuel compatible.'));
    }
    const botPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);
    if (!botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
    ])) {
      return interaction.reply(ephemeral('FyxBot ne peut pas lire ou gérer les messages de ce salon. Depuis un salon accessible, utilisez `/permissions reparer-fyxbot salon:` puis choisissez ce salon.'));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await logAction(interaction.guild, { title: '🧹 Messages supprimés', description: `${interaction.user} a supprimé **${deleted.size} message(s)** dans ${interaction.channel}.`, color: 0xfee75c });
    return interaction.editReply(`🧹 ${deleted.size} message(s) supprimé(s). Les messages de plus de 14 jours sont ignorés.`);
  },
};
