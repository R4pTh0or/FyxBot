const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { clearWarnings, getWarnings, removeWarning } = require('../../database/warningStore');
const { logAction } = require('../../services/logs');

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Consulte et gère les avertissements des membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) => subcommand
      .setName('liste')
      .setDescription('Affiche les avertissements d’un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('supprimer')
      .setDescription('Supprime un avertissement précis.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addStringOption((option) => option.setName('identifiant').setDescription('Identifiant affiché lors du warn').setRequired(true).setMaxLength(8)))
    .addSubcommand((subcommand) => subcommand
      .setName('effacer')
      .setDescription('Efface tous les avertissements d’un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('membre', true);

    if (subcommand === 'liste') {
      const warnings = await getWarnings(interaction.guildId, user.id);
      if (warnings.length === 0) return interaction.reply(ephemeral(`✅ **${user.tag}** n’a aucun avertissement.`));

      const recent = warnings.slice(-10).reverse();
      const description = recent.map((warning) => {
        const timestamp = Math.floor(new Date(warning.createdAt).getTime() / 1000);
        return `**${warning.id}** · <t:${timestamp}:d> · <@${warning.moderatorId}>\n${warning.reason}`;
      }).join('\n\n');
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`⚠️ Avertissements de ${user.tag}`)
        .setDescription(description)
        .setFooter({ text: `${warnings.length} avertissement(s) au total • 10 derniers affichés` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'supprimer') {
      const warningId = interaction.options.getString('identifiant', true).toLowerCase();
      const removed = await removeWarning(interaction.guildId, user.id, warningId);
      if (!removed) return interaction.reply(ephemeral(`Aucun avertissement **${warningId}** trouvé pour ${user}.`));
      await logAction(interaction.guild, { title: '✅ Avertissement supprimé', description: `L’avertissement **${warningId}** de **${user.tag}** a été supprimé par ${interaction.user}.`, color: 0x57f287 });
      return interaction.reply(ephemeral(`✅ Avertissement **${warningId}** supprimé pour **${user.tag}**.`));
    }

    const count = await clearWarnings(interaction.guildId, user.id);
    if (count === 0) return interaction.reply(ephemeral(`**${user.tag}** n’avait aucun avertissement.`));
    await logAction(interaction.guild, { title: '✅ Avertissements effacés', description: `Les **${count} avertissement(s)** de **${user.tag}** ont été effacés par ${interaction.user}.`, color: 0x57f287 });
    return interaction.reply(ephemeral(`✅ ${count} avertissement(s) effacé(s) pour **${user.tag}**.`));
  },
};
