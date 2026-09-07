const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { addMissingCategoryEmojis } = require('../../services/categoryEmojis');

const reply = (content) => ({ content, flags: MessageFlags.Ephemeral });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('categorie')
    .setDescription('Gère les catégories du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('creer')
      .setDescription('Crée une nouvelle catégorie.')
      .addStringOption((option) => option.setName('nom').setDescription('Nom de la catégorie').setRequired(true).setMaxLength(100))
      .addIntegerOption((option) => option.setName('position').setDescription('Position dans la liste').setMinValue(0)))
    .addSubcommand((subcommand) => subcommand
      .setName('renommer')
      .setDescription('Renomme une catégorie.')
      .addChannelOption((option) => option.setName('categorie').setDescription('Catégorie concernée').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addStringOption((option) => option.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(100)))
    .addSubcommand((subcommand) => subcommand
      .setName('supprimer')
      .setDescription('Supprime une catégorie vide.')
      .addChannelOption((option) => option.setName('categorie').setDescription('Catégorie vide à supprimer').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('synchroniser')
      .setDescription('Synchronise les permissions des salons avec leur catégorie.')
      .addChannelOption((option) => option.setName('categorie').setDescription('Catégorie concernée').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('emojis')
      .setDescription('Ajoute automatiquement un emoji adapté aux catégories qui n’en ont pas.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'emojis') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const renamed = await addMissingCategoryEmojis(interaction.guild, interaction.user.tag);
      if (renamed.length === 0) return interaction.editReply('✅ Toutes les catégories possèdent déjà un emoji.');
      return interaction.editReply(`✅ Emoji ajouté à **${renamed.length} catégorie(s)** :\n${renamed.map((category) => `• ${category.name}`).join('\n')}`);
    }

    if (subcommand === 'creer') {
      const name = interaction.options.getString('nom', true).trim();
      const position = interaction.options.getInteger('position');
      const category = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        position: position ?? undefined,
        reason: `Catégorie créée par ${interaction.user.tag}`,
      });
      return interaction.reply(reply(`✅ Catégorie **${category.name}** créée.`));
    }

    const category = interaction.options.getChannel('categorie', true);
    if (subcommand === 'renommer') {
      const oldName = category.name;
      const newName = interaction.options.getString('nom', true).trim();
      await category.setName(newName, `Catégorie renommée par ${interaction.user.tag}`);
      return interaction.reply(reply(`✅ Catégorie **${oldName}** renommée en **${newName}**.`));
    }

    if (subcommand === 'supprimer') {
      const children = interaction.guild.channels.cache.filter((channel) => channel.parentId === category.id);
      if (children.size > 0) {
        return interaction.reply(reply(`Suppression refusée : cette catégorie contient encore ${children.size} salon(s).`));
      }
      const name = category.name;
      await category.delete(`Catégorie supprimée par ${interaction.user.tag}`);
      return interaction.reply(reply(`🗑️ Catégorie **${name}** supprimée.`));
    }

    const children = interaction.guild.channels.cache.filter((channel) => channel.parentId === category.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const results = await Promise.allSettled([...children.values()].map((channel) => channel.lockPermissions()));
    const synced = results.filter((result) => result.status === 'fulfilled').length;
    return interaction.editReply(`✅ Permissions synchronisées pour ${synced}/${children.size} salon(s) de **${category.name}**.`);
  },
};
