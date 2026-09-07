const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const CHANNEL_TYPES = {
  texte: { type: ChannelType.GuildText, emoji: '💬', label: 'textuel' },
  vocal: { type: ChannelType.GuildVoice, emoji: '🔊', label: 'vocal' },
  forum: { type: ChannelType.GuildForum, emoji: '🗂️', label: 'forum' },
  annonces: { type: ChannelType.GuildAnnouncement, emoji: '📢', label: 'd’annonces' },
};

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function formatChannelName(value, emoji) {
  const base = String(value || '')
    .normalize('NFKC')
    .replace(/^[^・]+・/u, '')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[-_]+|[-_]+$/gu, '');
  if (!base) throw Object.assign(new Error('Nom de salon invalide.'), {
    userMessage: 'Indiquez un nom contenant au moins une lettre ou un chiffre.',
  });
  return `${emoji}・${base}`.slice(0, 100);
}

function privateOverwrites(guild, interaction, role) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  const botMember = guild.members.me;
  if (botMember && botMember.id !== interaction.user.id) {
    overwrites.push({
      id: botMember.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
    });
  }
  if (role && role.id !== guild.roles.everyone.id) {
    overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] });
  }
  return overwrites;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('creation')
    .setNameLocalizations({ fr: 'création' })
    .setDescription('Crée des éléments Discord avec les réglages FyxBot.')
    .setDescriptionLocalizations({ fr: 'Crée des éléments Discord avec les réglages FyxBot.' })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((subcommand) => subcommand
      .setName('salon')
      .setDescription('Crée un salon avec un emoji et des permissions adaptées.')
      .addStringOption((option) => option
        .setName('nom')
        .setDescription('Nom du nouveau salon')
        .setRequired(true)
        .setMaxLength(90))
      .addStringOption((option) => option
        .setName('type')
        .setDescription('Type de salon à créer')
        .setRequired(true)
        .addChoices(
          { name: '💬 Textuel', value: 'texte' },
          { name: '🔊 Vocal', value: 'vocal' },
          { name: '🗂️ Forum', value: 'forum' },
          { name: '📢 Annonces', value: 'annonces' },
        ))
      .addChannelOption((option) => option
        .setName('categorie')
        .setDescription('Catégorie dans laquelle créer le salon')
        .addChannelTypes(ChannelType.GuildCategory))
      .addStringOption((option) => option
        .setName('sujet')
        .setDescription('Sujet du salon textuel, forum ou d’annonces')
        .setMaxLength(1024))
      .addBooleanOption((option) => option
        .setName('prive')
        .setDescription('Masque le salon aux autres membres'))
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Rôle autorisé si le salon est privé'))
      .addIntegerOption((option) => option
        .setName('limite')
        .setDescription('Nombre maximal de membres pour un salon vocal')
        .setMinValue(0)
        .setMaxValue(99))),

  async execute(interaction) {
    const guild = interaction.guild;
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply(ephemeral('FyxBot doit disposer de la permission **Gérer les salons** pour utiliser cette commande.'));
    }

    const typeKey = interaction.options.getString('type', true);
    const channelType = CHANNEL_TYPES[typeKey];
    const category = interaction.options.getChannel('categorie');
    const topic = interaction.options.getString('sujet');
    const role = interaction.options.getRole('role');
    const userLimit = interaction.options.getInteger('limite');
    const isPrivate = interaction.options.getBoolean('prive') === true || Boolean(role);
    const name = formatChannelName(interaction.options.getString('nom', true), channelType.emoji);

    if (role?.id === guild.roles.everyone.id) {
      return interaction.reply(ephemeral('Choisissez un rôle autre que **@everyone** pour créer un salon privé.'));
    }
    if (topic && typeKey === 'vocal') {
      return interaction.reply(ephemeral('Le sujet est disponible uniquement pour les salons textuels, forums ou d’annonces.'));
    }
    if (userLimit !== null && typeKey !== 'vocal') {
      return interaction.reply(ephemeral('La limite de membres est disponible uniquement pour un salon vocal.'));
    }
    if (typeKey === 'annonces' && !guild.features.includes('COMMUNITY')) {
      return interaction.reply(ephemeral('Le serveur doit avoir la fonctionnalité **Communauté** activée pour créer un salon d’annonces.'));
    }

    const duplicate = guild.channels.cache.find((channel) => channel.name === name
      && channel.type === channelType.type
      && channel.parentId === (category?.id || null));
    if (duplicate) {
      return interaction.reply(ephemeral(`Un salon identique existe déjà : ${duplicate}.`));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await guild.channels.create({
      name,
      type: channelType.type,
      parent: category?.id,
      topic: typeKey === 'vocal' ? undefined : topic || undefined,
      userLimit: typeKey === 'vocal' ? userLimit ?? 0 : undefined,
      permissionOverwrites: isPrivate ? privateOverwrites(guild, interaction, role) : undefined,
      reason: `Salon créé avec FyxBot par ${interaction.user.tag}`,
    });

    const access = isPrivate
      ? role ? `privé pour ${role}` : 'privé pour son créateur'
      : category ? `permissions héritées de **${category.name}**` : 'permissions standards du serveur';
    return interaction.editReply(`✅ Salon ${channel} créé au format **${name}** · ${channelType.label} · ${access}.`);
  },

  CHANNEL_TYPES,
  formatChannelName,
  privateOverwrites,
};
