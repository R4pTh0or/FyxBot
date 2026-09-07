const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { communityPollPayload } = require('../../services/communityPolls');
const { createCommunityEvent } = require('../../services/communityEvents');
const { createCommunityGiveaway } = require('../../services/communityGiveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('communaute')
    .setDescription('Anime la communauté avec les outils FyxBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) => subcommand
      .setName('sondage')
      .setDescription('Publie un sondage Discord natif.')
      .addStringOption((option) => option.setName('question').setDescription('Question du sondage').setMaxLength(300).setRequired(true))
      .addStringOption((option) => option.setName('choix1').setDescription('Première réponse').setMaxLength(55).setRequired(true))
      .addStringOption((option) => option.setName('choix2').setDescription('Deuxième réponse').setMaxLength(55).setRequired(true))
      .addStringOption((option) => option.setName('choix3').setDescription('Troisième réponse').setMaxLength(55))
      .addStringOption((option) => option.setName('choix4').setDescription('Quatrième réponse').setMaxLength(55))
      .addIntegerOption((option) => option.setName('duree').setDescription('Durée du sondage')
        .addChoices(
          { name: '1 heure', value: 1 },
          { name: '8 heures', value: 8 },
          { name: '24 heures', value: 24 },
          { name: '3 jours', value: 72 },
          { name: '7 jours', value: 168 },
        ))
      .addBooleanOption((option) => option.setName('multichoix').setDescription('Autoriser plusieurs réponses'))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((subcommand) => subcommand
      .setName('evenement')
      .setDescription('Programme un événement Discord natif.')
      .addStringOption((option) => option.setName('titre').setDescription('Nom de l’événement').setMinLength(3).setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName('date').setDescription('Date au format JJ/MM/AAAA').setRequired(true))
      .addStringOption((option) => option.setName('heure').setDescription('Heure au format HH:MM').setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Présentation de l’événement').setMaxLength(1000))
      .addStringOption((option) => option.setName('type').setDescription('Lieu de l’événement')
        .addChoices({ name: 'Lieu ou lien externe', value: 'external' }, { name: 'Salon vocal Discord', value: 'voice' }))
      .addChannelOption((option) => option.setName('salon-vocal').setDescription('Salon vocal ou scène').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
      .addStringOption((option) => option.setName('lieu').setDescription('Lieu ou lien affiché').setMaxLength(100))
      .addIntegerOption((option) => option.setName('duree').setDescription('Durée prévue')
        .addChoices(
          { name: '30 minutes', value: 30 },
          { name: '1 heure', value: 60 },
          { name: '2 heures', value: 120 },
          { name: '4 heures', value: 240 },
        ))
      .addStringOption((option) => option.setName('fuseau').setDescription('Fuseau horaire')
        .addChoices(
          { name: 'France métropolitaine', value: 'Europe/Paris' },
          { name: 'Temps universel UTC', value: 'UTC' },
          { name: 'Montréal', value: 'America/Montreal' },
          { name: 'La Réunion', value: 'Indian/Reunion' },
        )))
    .addSubcommand((subcommand) => subcommand
      .setName('concours')
      .setDescription('Publie un concours avec participation et tirage automatiques.')
      .addStringOption((option) => option.setName('lot').setDescription('Lot à gagner').setMinLength(2).setMaxLength(200).setRequired(true))
      .addIntegerOption((option) => option.setName('duree').setDescription('Durée avant le tirage').setRequired(true)
        .addChoices(
          { name: '10 minutes', value: 10 },
          { name: '1 heure', value: 60 },
          { name: '6 heures', value: 360 },
          { name: '24 heures', value: 1440 },
          { name: '3 jours', value: 4320 },
          { name: '7 jours', value: 10080 },
        ))
      .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(5))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'evenement') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.CreateEvents)) {
        return interaction.reply({ content: 'Vous avez besoin de la permission Créer des événements.', flags: MessageFlags.Ephemeral });
      }
      const type = interaction.options.getString('type') || 'external';
      const voiceChannel = interaction.options.getChannel('salon-vocal');
      if (type === 'voice' && !voiceChannel) {
        return interaction.reply({ content: 'Choisissez un salon vocal pour cet événement.', flags: MessageFlags.Ephemeral });
      }
      const result = await createCommunityEvent(interaction.guild, {
        name: interaction.options.getString('titre', true),
        date: interaction.options.getString('date', true),
        time: interaction.options.getString('heure', true),
        description: interaction.options.getString('description'),
        type,
        channelId: voiceChannel?.id,
        location: interaction.options.getString('lieu') || 'Discord',
        durationMinutes: interaction.options.getInteger('duree') || 60,
        timeZone: interaction.options.getString('fuseau') || 'Europe/Paris',
      }, { actorLabel: interaction.user.tag });
      return interaction.reply({ content: `✅ Événement programmé : ${result.url}`, flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'concours') {
      const channel = interaction.options.getChannel('salon') || interaction.channel;
      const result = await createCommunityGiveaway(interaction.guild, channel, {
        prize: interaction.options.getString('lot', true),
        durationMinutes: interaction.options.getInteger('duree', true),
        winnerCount: interaction.options.getInteger('gagnants') || 1,
      });
      return interaction.reply({ content: `✅ Concours publié dans ${channel}. Tirage automatique <t:${Math.floor(new Date(result.giveaway.endsAt).getTime() / 1000)}:R>.`, flags: MessageFlags.Ephemeral });
    }

    const channel = interaction.options.getChannel('salon') || interaction.channel;
    if (!channel?.isTextBased() || channel.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choisissez un salon textuel de ce serveur.', flags: MessageFlags.Ephemeral });
    }
    const botMember = interaction.guild.members.me;
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendPolls])) {
      return interaction.reply({ content: 'FyxBot doit pouvoir voir le salon, envoyer des messages et créer des sondages.', flags: MessageFlags.Ephemeral });
    }
    const payload = communityPollPayload({
      question: interaction.options.getString('question', true),
      answers: [1, 2, 3, 4].map((index) => interaction.options.getString(`choix${index}`)),
      duration: interaction.options.getInteger('duree') || 24,
      allowMultiselect: interaction.options.getBoolean('multichoix') || false,
    });
    await channel.send(payload);
    return interaction.reply({ content: `✅ Sondage publié dans ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
