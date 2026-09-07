const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getTemporaryVoiceConfig, setTemporaryVoiceConfig } = require('../database/temporaryVoiceStore');
const logger = require('./logger').logger.child({ component: 'temporary-voice' });

function sanitizeRoomName(value) {
  return String(value || 'Salon temporaire')
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Salon temporaire';
}

async function saveVoiceConfig(guildId, config) {
  return setTemporaryVoiceConfig(guildId, { ...config, updatedAt: new Date().toISOString() });
}

async function setupTemporaryVoice(guild, { categoryId, hubName = '➕ Créer un salon', defaultLimit = 0 }) {
  const current = await getTemporaryVoiceConfig(guild.id) || {};
  let hub = current.hubChannelId ? await guild.channels.fetch(current.hubChannelId).catch(() => null) : null;
  const payload = {
    name: sanitizeRoomName(hubName),
    parent: categoryId,
    userLimit: Math.min(Math.max(Number(defaultLimit) || 0, 0), 99),
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ],
    reason: 'Configuration des salons vocaux temporaires FyxBot',
  };
  if (hub?.type === ChannelType.GuildVoice) await hub.edit(payload);
  else hub = await guild.channels.create({ ...payload, type: ChannelType.GuildVoice });
  return saveVoiceConfig(guild.id, {
    ...current,
    categoryId,
    hubChannelId: hub.id,
    hubName: hub.name,
    defaultLimit: payload.userLimit,
    rooms: current.rooms || {},
  });
}

async function deleteRoomIfEmpty(guild, channelId, config) {
  const room = config?.rooms?.[channelId];
  if (!room) return config;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.members?.size) return config;
  if (channel) {
    await channel.delete('Salon vocal temporaire FyxBot vide').catch((error) => {
      logger.error({ err: error, channelId, guildId: guild.id }, '[FyxBot] Suppression du salon vocal temporaire impossible.');
    });
  }
  const rooms = { ...(config.rooms || {}) };
  delete rooms[channelId];
  return saveVoiceConfig(guild.id, { ...config, rooms });
}

async function createTemporaryRoom(state, config) {
  const member = state.member;
  const guild = state.guild;
  let activeConfig = config;
  const existingEntry = Object.entries(config.rooms || {}).find(([, room]) => room.ownerId === member.id);
  if (existingEntry) {
    const existing = await guild.channels.fetch(existingEntry[0]).catch(() => null);
    if (existing?.type === ChannelType.GuildVoice) {
      await member.voice.setChannel(existing, 'Retour dans le salon temporaire FyxBot');
      return activeConfig;
    }
    const rooms = { ...(config.rooms || {}) };
    delete rooms[existingEntry[0]];
    activeConfig = await saveVoiceConfig(guild.id, { ...config, rooms });
  }
  const room = await guild.channels.create({
    name: sanitizeRoomName(`Salon de ${member.displayName}`),
    type: ChannelType.GuildVoice,
    parent: activeConfig.categoryId,
    userLimit: Math.min(Math.max(Number(activeConfig.defaultLimit) || 0, 0), 99),
    permissionOverwrites: [
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ],
    reason: `Salon temporaire FyxBot créé pour ${member.user.tag}`,
  });
  const rooms = { ...(activeConfig.rooms || {}), [room.id]: { ownerId: member.id, createdAt: new Date().toISOString() } };
  await saveVoiceConfig(guild.id, { ...activeConfig, rooms });
  await member.voice.setChannel(room, 'Création du salon temporaire FyxBot');
  return { ...activeConfig, rooms };
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  let config = await getTemporaryVoiceConfig(guild.id);
  if (!config?.hubChannelId) return;
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    config = await deleteRoomIfEmpty(guild, oldState.channelId, config);
  }
  if (newState.channelId === config.hubChannelId && !newState.member.user.bot) {
    await createTemporaryRoom(newState, config);
  }
}

async function getOwnedTemporaryRoom(interaction) {
  const config = await getTemporaryVoiceConfig(interaction.guildId);
  const channel = interaction.member.voice.channel;
  const room = channel ? config?.rooms?.[channel.id] : null;
  if (!channel || !room) throw new Error('Rejoignez d’abord votre salon vocal temporaire.');
  if (room.ownerId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Seul le propriétaire du salon peut utiliser cette action.');
  }
  return { channel, config, room };
}

module.exports = {
  getOwnedTemporaryRoom,
  handleVoiceStateUpdate,
  sanitizeRoomName,
  saveVoiceConfig,
  setupTemporaryVoice,
};
