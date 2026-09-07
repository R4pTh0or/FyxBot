const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getTemporaryVoiceConfig } = require('../../database/temporaryVoiceStore');
const {
  getOwnedTemporaryRoom,
  sanitizeRoomName,
  saveVoiceConfig,
  setupTemporaryVoice,
} = require('../../services/temporaryVoice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vocal-temporaire')
    .setDescription('Configure et contrôle les salons vocaux temporaires.')
    .addSubcommand((subcommand) => subcommand
      .setName('configurer')
      .setDescription('Crée le générateur de salons temporaires (administrateur).')
      .addChannelOption((option) => option.setName('categorie').setDescription('Catégorie des salons vocaux').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addStringOption((option) => option.setName('nom').setDescription('Nom du salon générateur').setMaxLength(90))
      .addIntegerOption((option) => option.setName('limite').setDescription('Limite par défaut, 0 pour illimité').setMinValue(0).setMaxValue(99)))
    .addSubcommand((subcommand) => subcommand.setName('statut').setDescription('Affiche la configuration des salons temporaires.'))
    .addSubcommand((subcommand) => subcommand
      .setName('nommer')
      .setDescription('Renomme votre salon temporaire.')
      .addStringOption((option) => option.setName('nom').setDescription('Nouveau nom').setMaxLength(90).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('limite')
      .setDescription('Change la limite de votre salon.')
      .addIntegerOption((option) => option.setName('nombre').setDescription('0 pour illimité').setMinValue(0).setMaxValue(99).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('verrouiller').setDescription('Verrouille votre salon.'))
    .addSubcommand((subcommand) => subcommand.setName('ouvrir').setDescription('Déverrouille votre salon.'))
    .addSubcommand((subcommand) => subcommand
      .setName('autoriser')
      .setDescription('Autorise un membre à rejoindre votre salon verrouillé.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre autorisé').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('expulser')
      .setDescription('Déconnecte un membre de votre salon.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à déconnecter').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('transferer')
      .setDescription('Transfère la propriété de votre salon.')
      .addUserOption((option) => option.setName('membre').setDescription('Nouveau propriétaire').setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'configurer') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'La permission Administrateur est requise.', flags: MessageFlags.Ephemeral });
      }
      const category = interaction.options.getChannel('categorie', true);
      const config = await setupTemporaryVoice(interaction.guild, {
        categoryId: category.id,
        hubName: interaction.options.getString('nom') || '➕ Créer un salon',
        defaultLimit: interaction.options.getInteger('limite') || 0,
      });
      return interaction.reply({ content: `✅ Rejoignez <#${config.hubChannelId}> pour créer automatiquement un salon dans **${category.name}**.`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'statut') {
      const config = await getTemporaryVoiceConfig(interaction.guildId);
      return interaction.reply({
        content: config?.hubChannelId ? `🔊 Générateur : <#${config.hubChannelId}> · ${Object.keys(config.rooms || {}).length} salon(s) temporaire(s) suivi(s).` : 'Les salons vocaux temporaires ne sont pas configurés.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const { channel, config, room } = await getOwnedTemporaryRoom(interaction);
      if (subcommand === 'nommer') await channel.setName(sanitizeRoomName(interaction.options.getString('nom', true)), `FyxBot : ${interaction.user.tag}`);
      else if (subcommand === 'limite') await channel.setUserLimit(interaction.options.getInteger('nombre', true), `FyxBot : ${interaction.user.tag}`);
      else if (subcommand === 'verrouiller') await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false }, { reason: `FyxBot : ${interaction.user.tag}` });
      else if (subcommand === 'ouvrir') await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null }, { reason: `FyxBot : ${interaction.user.tag}` });
      else if (subcommand === 'autoriser') {
        const member = interaction.options.getMember('membre');
        if (!member || member.user.bot) throw new Error('Choisissez un membre valide.');
        await channel.permissionOverwrites.edit(member, { ViewChannel: true, Connect: true }, { reason: `FyxBot : ${interaction.user.tag}` });
      } else if (subcommand === 'expulser') {
        const member = interaction.options.getMember('membre');
        if (!member || member.id === interaction.user.id || member.voice.channelId !== channel.id) throw new Error('Ce membre n’est pas dans votre salon.');
        await member.voice.disconnect(`FyxBot : expulsé par ${interaction.user.tag}`);
      } else if (subcommand === 'transferer') {
        const member = interaction.options.getMember('membre');
        if (!member || member.user.bot || member.voice.channelId !== channel.id) throw new Error('Le nouveau propriétaire doit être présent dans le salon.');
        const rooms = { ...(config.rooms || {}), [channel.id]: { ...room, ownerId: member.id } };
        await saveVoiceConfig(interaction.guildId, { ...config, rooms });
      }
      return interaction.reply({ content: '✅ Salon vocal temporaire mis à jour.', flags: MessageFlags.Ephemeral });
    } catch (error) {
      return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    }
  },
};
