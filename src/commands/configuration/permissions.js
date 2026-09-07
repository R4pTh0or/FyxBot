const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const supportedChannels = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildStageVoice,
  ChannelType.GuildCategory,
];
const reply = (content) => ({ content, flags: MessageFlags.Ephemeral });

function permissionValue(interaction, name) {
  const value = interaction.options.getBoolean(name);
  if (value === null) return undefined;
  return value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Configure les permissions des salons par rôle.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('definir')
      .setDescription('Autorise ou refuse des permissions à un rôle.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon ou catégorie').addChannelTypes(...supportedChannels).setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle concerné').setRequired(true))
      .addBooleanOption((option) => option.setName('voir').setDescription('Voir le salon'))
      .addBooleanOption((option) => option.setName('envoyer').setDescription('Envoyer des messages ou parler'))
      .addBooleanOption((option) => option.setName('historique').setDescription('Lire l’historique des messages'))
      .addBooleanOption((option) => option.setName('gerer').setDescription('Gérer le salon')))
    .addSubcommand((subcommand) => subcommand
      .setName('heriter')
      .setDescription('Retire les réglages spécifiques d’un rôle sur un salon.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon ou catégorie').addChannelTypes(...supportedChannels).setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle concerné').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('copier')
      .setDescription('Copie toutes les permissions d’un salon vers un autre.')
      .addChannelOption((option) => option.setName('source').setDescription('Salon modèle').addChannelTypes(...supportedChannels).setRequired(true))
      .addChannelOption((option) => option.setName('destination').setDescription('Salon à modifier').addChannelTypes(...supportedChannels).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('reparer-fyxbot')
      .setDescription('Rétablit uniquement l’accès de FyxBot au salon choisi.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon ou catégorie à réparer').addChannelTypes(...supportedChannels).setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'reparer-fyxbot') {
      const channel = interaction.options.getChannel('salon', true);
      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(reply('Le rôle FyxBot doit disposer de la permission **Gérer les rôles** avant de pouvoir réparer les permissions d’un salon.'));
      }
      await channel.permissionOverwrites.edit(botMember.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        EmbedLinks: true,
        AttachFiles: true,
        AddReactions: true,
        SendPolls: true,
        ManageMessages: true,
        ManageChannels: true,
        Connect: true,
        Speak: true,
        MoveMembers: true,
      }, `Accès FyxBot réparé par ${interaction.user.tag}`);
      return interaction.reply(reply(`✅ L’accès de FyxBot est rétabli sur ${channel}. Les autres rôles et permissions n’ont pas été modifiés.`));
    }

    if (subcommand === 'copier') {
      const source = interaction.options.getChannel('source', true);
      const destination = interaction.options.getChannel('destination', true);
      if (source.id === destination.id) return interaction.reply(reply('Choisissez deux salons différents.'));

      const overwrites = source.permissionOverwrites.cache.map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      }));
      await destination.permissionOverwrites.set(overwrites, `Permissions copiées par ${interaction.user.tag}`);
      return interaction.reply(reply(`✅ Permissions de ${source} copiées vers ${destination}.`));
    }

    const channel = interaction.options.getChannel('salon', true);
    const role = interaction.options.getRole('role', true);
    if (role.managed) return interaction.reply(reply('Les permissions d’un rôle géré par une intégration ne peuvent pas être modifiées manuellement.'));

    if (subcommand === 'heriter') {
      const overwrite = channel.permissionOverwrites.cache.get(role.id);
      if (!overwrite) return interaction.reply(reply(`${role} n’a aucun réglage spécifique sur ${channel}.`));
      await overwrite.delete(`Héritage restauré par ${interaction.user.tag}`);
      return interaction.reply(reply(`✅ ${role} hérite désormais des permissions de ${channel.parent ? `la catégorie **${channel.parent.name}**` : 'Discord'}.`));
    }

    const values = {
      ViewChannel: permissionValue(interaction, 'voir'),
      SendMessages: permissionValue(interaction, 'envoyer'),
      Connect: permissionValue(interaction, 'envoyer'),
      Speak: permissionValue(interaction, 'envoyer'),
      ReadMessageHistory: permissionValue(interaction, 'historique'),
      ManageChannels: permissionValue(interaction, 'gerer'),
    };
    if (Object.values(values).every((value) => value === undefined)) {
      return interaction.reply(reply('Indiquez au moins une permission à autoriser ou refuser.'));
    }

    await channel.permissionOverwrites.edit(role.id, values, `Permissions modifiées par ${interaction.user.tag}`);
    return interaction.reply(reply(`✅ Permissions de ${role} mises à jour sur ${channel}.`));
  },
};
