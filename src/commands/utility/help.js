const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

const PANEL_URL = 'https://fyxbot.com';

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0xff5a2a)
    .setTitle('🧭 Aide FyxBot')
    .setDescription('Voici les principales commandes pour configurer et gérer votre serveur. Les commandes proposées par Discord dépendent de vos permissions.')
    .addFields(
      {
        name: '🚀 Bien démarrer',
        value: '`/setup concevoir` · `/setup aperçu` · `/diagnostic`',
      },
      {
        name: '🛡️ Modération',
        value: '`/modhelp` · `/ban` · `/kick` · `/timeout` · `/warn` · `/clear`',
      },
      {
        name: '🎫 Communauté',
        value: '`/ticket-panel` · `/reglement` · `/role-panel` · `/suggestion` · `/anniversaire`',
      },
      {
        name: '⚙️ Automatisations',
        value: '`/social` · `/vocal-temporaire` · `/communaute` · `/accueil-config` · `/logs-config`',
      },
      {
        name: 'ℹ️ Informations',
        value: '`/ping` · `/avatar` · `/userinfo` · `/serverinfo`',
      },
    )
    .setFooter({ text: 'FyxBot • Configuration complète sur fyxbot.com' });
}

function buildHelpComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Ouvrir le panel FyxBot')
      .setEmoji('⚙️')
      .setURL(PANEL_URL),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Contacter le support')
      .setEmoji('🛟')
      .setURL(`${PANEL_URL}/support`),
  )];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche les commandes principales et les liens utiles de FyxBot.')
    .setDescriptionLocalizations({ fr: 'Affiche les commandes principales et les liens utiles de FyxBot.' }),

  cleanupDelayMs: 60_000,

  async execute(interaction) {
    await interaction.reply({
      embeds: [buildHelpEmbed()],
      components: buildHelpComponents(),
      flags: MessageFlags.Ephemeral,
    });
  },

  buildHelpComponents,
  buildHelpEmbed,
};
