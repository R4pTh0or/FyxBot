const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const COMMANDS = [
  ['🔨 `/ban`', 'Bannir un membre et supprimer éventuellement ses messages récents.'],
  ['✅ `/unban`', 'Révoquer le bannissement d’un utilisateur.'],
  ['👢 `/kick`', 'Expulser un membre du serveur.'],
  ['⏳ `/timeout`', 'Placer temporairement un membre en sourdine.'],
  ['⚠️ `/warn`', 'Ajouter un avertissement avec un motif.'],
  ['📋 `/warnings`', 'Consulter, supprimer ou effacer les avertissements.'],
  ['🧹 `/clear`', 'Supprimer jusqu’à 100 messages récents.'],
  ['🐢 `/slowmode`', 'Régler ou désactiver le mode lent d’un salon.'],
  ['🔒 `/lock`', 'Empêcher temporairement les membres d’écrire dans un salon.'],
  ['🔓 `/unlock`', 'Restaurer les permissions héritées du salon.'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modhelp')
    .setDescription('Affiche les commandes de modération FyxBot prédéfinies.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xf97336)
      .setTitle('🛡️ Modération FyxBot')
      .setDescription('Les commandes essentielles sont prêtes à l’emploi. Discord vérifie automatiquement les permissions de chaque commande.')
      .addFields(COMMANDS.map(([name, value]) => ({ name, value, inline: false })))
      .setFooter({ text: 'Utilisez / puis le nom de la commande pour afficher ses options.' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
