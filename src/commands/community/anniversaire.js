const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getBirthdayConfig, setBirthdayConfig } = require('../../database/birthdayStore');
const { DEFAULT_BIRTHDAY_MESSAGE, configuredMessage } = require('../../services/defaultMessages');
const {
  SUPPORTED_TIMEZONES,
  birthdaySortValue,
  isValidBirthday,
  zonedDateParts,
} = require('../../services/birthdays');

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anniversaire')
    .setDescription('Enregistre et annonce les anniversaires de la communauté.')
    .addSubcommand((subcommand) => subcommand
      .setName('definir')
      .setDescription('Enregistre votre jour et votre mois de naissance.')
      .addIntegerOption((option) => option.setName('jour').setDescription('Jour du mois').setMinValue(1).setMaxValue(31).setRequired(true))
      .addIntegerOption((option) => option.setName('mois').setDescription('Mois de naissance').setMinValue(1).setMaxValue(12).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('supprimer').setDescription('Supprime votre anniversaire de FyxBot.'))
    .addSubcommand((subcommand) => subcommand
      .setName('voir')
      .setDescription('Affiche un anniversaire enregistré.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter')))
    .addSubcommand((subcommand) => subcommand.setName('liste').setDescription('Affiche les prochains anniversaires.'))
    .addSubcommand((subcommand) => subcommand
      .setName('configurer')
      .setDescription('Configure les annonces automatiques (administrateur).')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon des annonces').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('fuseau').setDescription('Fuseau horaire').setRequired(true)
        .addChoices(...SUPPORTED_TIMEZONES.map((value) => ({ name: value, value }))))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle anniversaire temporaire'))
      .addStringOption((option) => option.setName('message').setDescription('Variables : {membres}, {serveur}').setMaxLength(1000))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const current = await getBirthdayConfig(interaction.guildId) || { birthdays: {} };
    const birthdays = { ...(current.birthdays || {}) };

    if (subcommand === 'definir') {
      const day = interaction.options.getInteger('jour', true);
      const month = interaction.options.getInteger('mois', true);
      if (!isValidBirthday(day, month)) return interaction.reply({ content: 'Cette date n’existe pas.', flags: MessageFlags.Ephemeral });
      birthdays[interaction.user.id] = { day, month, registeredAt: new Date().toISOString() };
      await setBirthdayConfig(interaction.guildId, { ...current, birthdays, updatedAt: new Date().toISOString() });
      return interaction.reply({ content: `🎂 Votre anniversaire est enregistré au **${day} ${MONTH_NAMES[month - 1]}**. Aucune année de naissance n’est conservée.`, flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'supprimer') {
      delete birthdays[interaction.user.id];
      await setBirthdayConfig(interaction.guildId, { ...current, birthdays, updatedAt: new Date().toISOString() });
      return interaction.reply({ content: '✅ Votre anniversaire a été supprimé.', flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'voir') {
      const user = interaction.options.getUser('membre') || interaction.user;
      const record = birthdays[user.id];
      return interaction.reply({
        content: record ? `🎂 L’anniversaire de ${user} est le **${record.day} ${MONTH_NAMES[record.month - 1]}**.` : `${user} n’a pas enregistré son anniversaire.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'liste') {
      const timezone = SUPPORTED_TIMEZONES.includes(current.timezone) ? current.timezone : 'Europe/Paris';
      const today = zonedDateParts(new Date(), timezone);
      const upcoming = Object.entries(birthdays)
        .sort(([, a], [, b]) => birthdaySortValue(a, today.month, today.day) - birthdaySortValue(b, today.month, today.day))
        .slice(0, 15);
      const content = upcoming.length
        ? upcoming.map(([userId, value]) => `• <@${userId}> — **${value.day} ${MONTH_NAMES[value.month - 1]}**`).join('\n')
        : 'Aucun anniversaire n’est encore enregistré.';
      return interaction.reply({ content: `🎉 **Prochains anniversaires**\n${content}`, allowedMentions: { parse: [] } });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'La permission Administrateur est requise pour configurer les anniversaires.', flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.options.getChannel('salon', true);
    const role = interaction.options.getRole('role');
    if (role && (role.managed || interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0)) {
      return interaction.reply({ content: `FyxBot ne peut pas attribuer ${role}. Placez son rôle plus haut.`, flags: MessageFlags.Ephemeral });
    }
    await setBirthdayConfig(interaction.guildId, {
      ...current,
      birthdays,
      channelId: channel.id,
      roleId: role?.id || null,
      timezone: interaction.options.getString('fuseau', true),
      message: configuredMessage(interaction.options.getString('message') || current.message, DEFAULT_BIRTHDAY_MESSAGE),
      updatedAt: new Date().toISOString(),
    });
    return interaction.reply({ content: `✅ Les anniversaires seront annoncés dans ${channel}. Le message par défaut FyxBot sera utilisé si aucun texte personnalisé n’est fourni.`, flags: MessageFlags.Ephemeral });
  },
};
