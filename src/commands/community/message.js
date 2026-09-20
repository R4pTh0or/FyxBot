const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { customMessagePayload } = require('../../services/customMessages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Publie un texte, un embed, une image ou un changelog.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) => subcommand
      .setName('envoyer')
      .setDescription('Crée un message personnalisé dans un salon.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('texte').setDescription('Texte affiché au-dessus de l’embed').setMaxLength(2000))
      .addStringOption((option) => option.setName('titre').setDescription('Titre de l’embed').setMaxLength(256))
      .addStringOption((option) => option.setName('description').setDescription('Contenu de l’embed').setMaxLength(4000))
      .addStringOption((option) => option.setName('couleur').setDescription('Couleur hexadécimale, par exemple #EF4444').setMaxLength(7))
      .addAttachmentOption((option) => option.setName('image').setDescription('Grande image jointe au message'))
      .addAttachmentOption((option) => option.setName('miniature').setDescription('Petite image affichée dans l’embed'))
      .addStringOption((option) => option.setName('lien').setDescription('Lien HTTPS du titre ou du bouton'))
      .addStringOption((option) => option.setName('bouton').setDescription('Libellé du bouton lié').setMaxLength(80)))
    .addSubcommand((subcommand) => subcommand
      .setName('changelog')
      .setDescription('Publie une note de version au format FyxBot.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('version').setDescription('Numéro de version, par exemple 1.2.0').setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName('titre').setDescription('Titre de la mise à jour').setMaxLength(250).setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Résumé des changements').setMaxLength(4000).setRequired(true))
      .addStringOption((option) => option.setName('texte').setDescription('Texte affiché au-dessus de l’embed').setMaxLength(2000))
      .addStringOption((option) => option.setName('lien').setDescription('Lien HTTPS vers le changelog complet'))
      .addAttachmentOption((option) => option.setName('image').setDescription('Image jointe au changelog'))
      .addStringOption((option) => option.setName('couleur').setDescription('Couleur hexadécimale, par exemple #EF4444').setMaxLength(7))),

  async execute(interaction) {
    const mode = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('salon', true);
    const payload = customMessagePayload({
      mode: mode === 'changelog' ? 'changelog' : 'message',
      content: interaction.options.getString('texte'),
      title: interaction.options.getString('titre'),
      description: interaction.options.getString('description'),
      color: interaction.options.getString('couleur'),
      imageUrl: interaction.options.getAttachment('image')?.url,
      thumbnailUrl: mode === 'envoyer' ? interaction.options.getAttachment('miniature')?.url : null,
      linkUrl: interaction.options.getString('lien'),
      buttonLabel: mode === 'envoyer' ? interaction.options.getString('bouton') : null,
      version: mode === 'changelog' ? interaction.options.getString('version') : null,
      footer: mode === 'changelog' ? 'FyxBot • Changelog' : 'FyxBot • Message personnalisé',
    });
    await channel.send(payload);
    return interaction.reply({ content: `✅ Message publié dans ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
