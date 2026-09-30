const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getTicketConfig } = require('../database/ticketStore');
const { logAction, sendTicketTranscript } = require('./logs');
const logger = require('./logger').logger.child({ component: 'tickets' });
const { executeFyxFlowTrigger } = require('./fyxFlow');

const CREATE_BUTTON_ID = 'ticket:create';
const CLOSE_BUTTON_ID = 'ticket:close';
const REOPEN_BUTTON_ID = 'ticket:reopen';
const DELETE_BUTTON_ID = 'ticket:delete';
const TICKET_TOPIC_PREFIX = 'fyxbot-ticket:';
const LEGACY_TICKET_TOPIC_PREFIX = 'nexora-ticket:';

function isTicketTopic(topic) {
  return [TICKET_TOPIC_PREFIX, LEGACY_TICKET_TOPIC_PREFIX]
    .some((prefix) => topic?.startsWith(prefix));
}

function ticketNameBase(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^(?:🎫・)?ticket-/, '')
    .replace(/^(?:🔒・)?ferme-/, '')
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 78) || 'membre';
}

function openTicketName(name) {
  return `🎫・ticket-${ticketNameBase(name)}`;
}

function closedTicketName(name) {
  return `🔒・ferme-${ticketNameBase(name)}`;
}

function isClosedTicketChannel(channel) {
  return /^(?:🔒・)?ferme-/.test(String(channel?.name || ''));
}

function createPanelComponents(panelId = 'default', buttonLabel = 'Créer un ticket') {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CREATE_BUTTON_ID}:${panelId}`)
      .setLabel(buttonLabel.slice(0, 80))
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  )];
}

function createTicketComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel('Fermer le ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  )];
}

function createClosedTicketComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REOPEN_BUTTON_ID).setLabel('Réouvrir le ticket').setEmoji('🔓').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(DELETE_BUTTON_ID).setLabel('Supprimer le ticket').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  )];
}

function isTicketStaff(interaction, config) {
  return interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    || interaction.member.roles.cache.has(config.staffRoleId);
}

function isDeletableTicketChannel(channel) {
  return Boolean(isTicketTopic(channel?.topic) && isClosedTicketChannel(channel));
}

async function createTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const storedConfig = await getTicketConfig(interaction.guildId);
  if (!storedConfig) return interaction.editReply('Le système de tickets n’est pas encore configuré.');
  const panelId = interaction.customId.split(':')[2] || 'default';
  const config = storedConfig.panels?.find((panel) => panel.id === panelId) || storedConfig;

  const category = await interaction.guild.channels.fetch(config.categoryId).catch(() => null);
  const staffRole = await interaction.guild.roles.fetch(config.staffRoleId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory || !staffRole) {
    return interaction.editReply('La catégorie ou le rôle staff configuré n’existe plus. Relancez `/ticket-panel`.');
  }

  const existing = interaction.guild.channels.cache.find(
    (channel) => channel.parentId === category.id
      && [TICKET_TOPIC_PREFIX, LEGACY_TICKET_TOPIC_PREFIX]
        .some((prefix) => channel.topic === `${prefix}${interaction.user.id}:${panelId}`)
      && !isClosedTicketChannel(channel),
  );
  if (existing) return interaction.editReply(`Vous avez déjà un ticket ouvert : ${existing}`);

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'membre';
  const channel = await interaction.guild.channels.create({
    name: openTicketName(safeName),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${TICKET_TOPIC_PREFIX}${interaction.user.id}:${panelId}`,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: staffRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: interaction.client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      },
    ],
    reason: `Ticket FyxBot créé par ${interaction.user.tag}`,
  });

  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`🎫 ${config.title || 'Ticket FyxBot'}`)
    .setDescription(`Bienvenue ${interaction.user}. Décrivez votre demande **${config.requestType || 'de support'}** avec autant de détails que possible.\n\nUn membre de ${staffRole} vous répondra prochainement.`)
    .setFooter({ text: 'FyxBot • Assistance' })
    .setTimestamp();
  await channel.send({ content: `${interaction.user} ${staffRole}`, embeds: [embed], components: createTicketComponents() });
  await logAction(interaction.guild, {
    title: '🎫 Ticket créé',
    description: `${interaction.user} a créé ${channel}.`,
    color: 0x57f287,
  });
  await executeFyxFlowTrigger(interaction.member, 'ticket_created', undefined, { channel }).catch((error) => {
    logger.warn({ err: error, guildId: interaction.guildId, channelId: channel.id }, '[FyxBot] Déclenchement FyxFlow ignoré après la création du ticket.');
  });
  return interaction.editReply(`Votre ticket a été créé : ${channel}`);
}

async function closeTicket(interaction) {
  const storedConfig = await getTicketConfig(interaction.guildId);
  const panelId = interaction.channel.topic?.split(':')[2] || 'default';
  const config = storedConfig?.panels?.find((panel) => panel.id === panelId) || storedConfig;
  if (!config || !isTicketTopic(interaction.channel.topic)) {
    return interaction.reply({ content: 'Ce salon n’est pas un ticket FyxBot.', flags: MessageFlags.Ephemeral });
  }
  if (!isTicketStaff(interaction, config)) {
    return interaction.reply({ content: 'Seul le staff peut fermer ce ticket.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferUpdate();
  const ownerId = interaction.channel.topic.split(':')[1];
  await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: false });
  await interaction.channel.setName(closedTicketName(interaction.channel.name));

  await interaction.message.edit({ components: [] });
  await interaction.channel.send({ content: `🔒 Ticket fermé par ${interaction.user}. Vous pouvez le conserver comme archive, le réouvrir ou le supprimer.`, components: createClosedTicketComponents() });
  await sendTicketTranscript(interaction.channel, interaction.user, ownerId).catch((error) => {
    logger.error({ err: error, channelId: interaction.channelId, guildId: interaction.guildId }, '[FyxBot] Transcription du ticket impossible.');
  });
  await logAction(interaction.guild, {
    title: '🔒 Ticket fermé',
    description: `**${interaction.channel.name}** a été fermé par ${interaction.user}.`,
    color: 0xfee75c,
  });
}

async function reopenTicket(interaction) {
  const storedConfig = await getTicketConfig(interaction.guildId);
  const panelId = interaction.channel.topic?.split(':')[2] || 'default';
  const config = storedConfig?.panels?.find((panel) => panel.id === panelId) || storedConfig;
  if (!config || !isDeletableTicketChannel(interaction.channel) || !isTicketStaff(interaction, config)) {
    return interaction.reply({ content: 'Seul le staff peut réouvrir ce ticket fermé.', flags: MessageFlags.Ephemeral });
  }
  const duplicate = interaction.guild.channels.cache.find((channel) => channel.id !== interaction.channel.id
    && channel.topic === interaction.channel.topic
    && !isClosedTicketChannel(channel));
  if (duplicate) {
    return interaction.reply({ content: `Un ticket est déjà ouvert pour cette demande : ${duplicate}`, flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  const ownerId = interaction.channel.topic.split(':')[1];
  await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: true });
  await interaction.channel.setName(openTicketName(interaction.channel.name));
  await interaction.message.edit({ components: [] });
  await interaction.channel.send({ content: `🔓 Ticket réouvert par ${interaction.user}. <@${ownerId}> peut de nouveau répondre.`, components: createTicketComponents() });
  await logAction(interaction.guild, {
    title: '🔓 Ticket réouvert',
    description: `**${interaction.channel.name}** a été réouvert par ${interaction.user}.`,
    color: 0x57f287,
  });
}

async function deleteTicket(interaction) {
  const storedConfig = await getTicketConfig(interaction.guildId);
  const panelId = interaction.channel.topic?.split(':')[2] || 'default';
  const config = storedConfig?.panels?.find((panel) => panel.id === panelId) || storedConfig;
  const isFyxBotTicket = isDeletableTicketChannel(interaction.channel);
  if (!config || !isFyxBotTicket || !isTicketStaff(interaction, config)) {
    return interaction.reply({ content: 'Seul le staff peut supprimer ce ticket.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply('🗑️ Suppression du ticket dans 5 secondes…');
  await logAction(interaction.guild, {
    title: '🗑️ Ticket supprimé',
    description: `**${interaction.channel.name}** sera supprimé par ${interaction.user}.`,
    color: 0xed4245,
  });
  setTimeout(() => interaction.channel.delete(`Ticket supprimé par ${interaction.user.tag}`).catch((error) => {
    logger.error({ err: error, channelId: interaction.channelId, guildId: interaction.guildId }, '[FyxBot] Suppression du ticket impossible.');
  }), 5_000);
}

async function handleTicketButton(interaction) {
  if (interaction.customId === CREATE_BUTTON_ID || interaction.customId.startsWith(`${CREATE_BUTTON_ID}:`)) return createTicket(interaction);
  if (interaction.customId === CLOSE_BUTTON_ID) return closeTicket(interaction);
  if (interaction.customId === REOPEN_BUTTON_ID) return reopenTicket(interaction);
  if (interaction.customId === DELETE_BUTTON_ID) return deleteTicket(interaction);
  return null;
}

module.exports = {
  createPanelComponents,
  closedTicketName,
  handleTicketButton,
  isClosedTicketChannel,
  isDeletableTicketChannel,
  isTicketTopic,
  openTicketName,
  TICKET_TOPIC_PREFIX,
};
