const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { setWelcomeConfig } = require('../../database/welcomeStore');
const {
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  configuredMessage,
} = require('../../services/defaultMessages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('accueil-config')
    .setDescription('Configure l’accueil, les départs et le rôle automatique.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('bienvenue')
      .setDescription('Salon des messages de bienvenue')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('depart')
      .setDescription('Salon des messages de départ, sinon salon de bienvenue')
      .addChannelTypes(ChannelType.GuildText))
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Rôle attribué automatiquement aux nouveaux membres'))
    .addStringOption((option) => option
      .setName('message-bienvenue')
      .setDescription('Variables : {membre}, {serveur}, {nombre}')
      .setMaxLength(1000))
    .addStringOption((option) => option
      .setName('message-depart')
      .setDescription('Variables : {membre}, {serveur}, {nombre}')
      .setMaxLength(1000)),

  async execute(interaction) {
    const welcomeChannel = interaction.options.getChannel('bienvenue', true);
    const leaveChannel = interaction.options.getChannel('depart') || welcomeChannel;
    const autoRole = interaction.options.getRole('role');

    if (autoRole && (autoRole.id === interaction.guild.id || autoRole.managed
      || interaction.guild.members.me.roles.highest.comparePositionTo(autoRole) <= 0)) {
      return interaction.reply({
        content: `FyxBot ne peut pas attribuer ${autoRole}. Placez le rôle FyxBot au-dessus dans la hiérarchie.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await setWelcomeConfig(interaction.guildId, {
      welcomeChannelId: welcomeChannel.id,
      leaveChannelId: leaveChannel.id,
      autoRoleId: autoRole?.id || null,
      welcomeMessage: configuredMessage(interaction.options.getString('message-bienvenue'), DEFAULT_WELCOME_MESSAGE),
      leaveMessage: configuredMessage(interaction.options.getString('message-depart'), DEFAULT_LEAVE_MESSAGE),
      updatedAt: new Date().toISOString(),
    });

    const roleText = autoRole ? ` Le rôle ${autoRole} sera attribué automatiquement.` : '';
    return interaction.reply({
      content: `✅ Accueil configuré dans ${welcomeChannel} et départs dans ${leaveChannel}.${roleText}\nLes messages par défaut FyxBot sont utilisés lorsqu’aucun texte personnalisé n’est fourni.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
