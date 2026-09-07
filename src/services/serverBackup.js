const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  getGuildConfigurations,
  replaceGuildConfigurations,
} = require('../database/database');
const { getDataDirectory } = require('../database/dataDirectory');
const { decodeEncryptionKey, decryptPayload, encryptPayload } = require('./encryptedPayload');

const backupDirectory = path.join(getDataDirectory(), 'backups');

function getLocalBackupEncryptionKey(environment = process.env) {
  const localValue = environment.FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY?.trim();
  const sharedValue = environment.FYXBOT_BACKUP_ENCRYPTION_KEY?.trim()
    || environment.NEXORA_BACKUP_ENCRYPTION_KEY?.trim();
  const value = localValue || sharedValue;
  if (!value) {
    throw new Error('Configurez FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY avant de créer ou restaurer une sauvegarde serveur.');
  }
  return decodeEncryptionKey(value, localValue ? 'FYXBOT_LOCAL_BACKUP_ENCRYPTION_KEY' : 'FYXBOT_BACKUP_ENCRYPTION_KEY');
}

function decodeSnapshot(contents, encryptionKey, filename) {
  if (filename.endsWith('.json.enc')) {
    return JSON.parse(decryptPayload(contents, encryptionKey).plain.toString('utf8'));
  }
  return JSON.parse(contents.toString('utf8'));
}

function validateGuildId(guildId) {
  if (!/^\d{17,20}$/.test(String(guildId))) throw new Error('Identifiant de serveur invalide.');
  return String(guildId);
}

function snapshotOverwrite(entry) {
  return {
    id: entry.id,
    type: entry.type,
    allow: entry.allow.bitfield.toString(),
    deny: entry.deny.bitfield.toString(),
  };
}

function snapshotRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    managed: role.managed,
    hoist: role.hoist,
    mentionable: role.mentionable,
    unicodeEmoji: role.unicodeEmoji || null,
  };
}

function snapshotChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition,
    parentId: channel.parentId,
    topic: 'topic' in channel ? channel.topic : null,
    nsfw: 'nsfw' in channel ? channel.nsfw : false,
    rateLimitPerUser: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser : 0,
    bitrate: 'bitrate' in channel ? channel.bitrate : null,
    userLimit: 'userLimit' in channel ? channel.userLimit : null,
    rtcRegion: 'rtcRegion' in channel ? channel.rtcRegion : null,
    videoQualityMode: 'videoQualityMode' in channel ? channel.videoQualityMode : null,
    defaultAutoArchiveDuration: 'defaultAutoArchiveDuration' in channel ? channel.defaultAutoArchiveDuration : null,
    defaultThreadRateLimitPerUser: 'defaultThreadRateLimitPerUser' in channel ? channel.defaultThreadRateLimitPerUser : null,
    defaultReactionEmoji: 'defaultReactionEmoji' in channel ? channel.defaultReactionEmoji : null,
    defaultSortOrder: 'defaultSortOrder' in channel ? channel.defaultSortOrder : null,
    defaultForumLayout: 'defaultForumLayout' in channel ? channel.defaultForumLayout : null,
    availableTags: 'availableTags' in channel ? channel.availableTags : null,
    permissionOverwrites: channel.permissionOverwrites.cache.map(snapshotOverwrite),
  };
}

async function backupServer(guild) {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const createdAt = new Date();
  const snapshot = {
    version: 2,
    createdAt: createdAt.toISOString(),
    guild: { id: guild.id, name: guild.name },
    configurations: getGuildConfigurations(guild.id),
    roles: [...guild.roles.cache.values()].filter((role) => role.id !== guild.id).map(snapshotRole),
    channels: [...guild.channels.cache.values()].filter((channel) => !channel.isThread?.()).map(snapshotChannel),
  };
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.chmod(backupDirectory, 0o700).catch(() => null);
  const stamp = createdAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const filename = `${guild.id}-${stamp}.json.enc`;
  const encrypted = encryptPayload(`${JSON.stringify(snapshot)}\n`, getLocalBackupEncryptionKey(), createdAt);
  const target = path.join(backupDirectory, filename);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
    decodeSnapshot(await fs.readFile(temporary), getLocalBackupEncryptionKey(), filename);
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => null);
  }
  return filename;
}

async function listServerBackups(guildId) {
  const safeGuildId = validateGuildId(guildId);
  let filenames;
  try {
    filenames = await fs.readdir(backupDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const targets = filenames
    .filter((filename) => filename.startsWith(`${safeGuildId}-`) && (filename.endsWith('.json.enc') || filename.endsWith('.json')))
    .sort((left, right) => right.localeCompare(left));
  const backups = [];
  const encryptionKey = getLocalBackupEncryptionKey();
  for (const filename of targets) {
    try {
      const contents = decodeSnapshot(await fs.readFile(path.join(backupDirectory, filename)), encryptionKey, filename);
      if (String(contents.guild?.id) !== safeGuildId) continue;
      backups.push({
        filename,
        createdAt: contents.createdAt || null,
        version: contents.version || 1,
        roles: contents.roles?.length || 0,
        channels: contents.channels?.length || 0,
      });
    } catch {
      // Une sauvegarde corrompue n'est jamais proposée à la restauration.
    }
  }
  return backups;
}

async function loadServerBackup(guildId, filename) {
  const backups = await listServerBackups(guildId);
  const selected = filename
    ? backups.find((backup) => backup.filename === filename)
    : backups[0];
  if (!selected) throw new Error(filename ? 'Cette sauvegarde est introuvable ou invalide.' : 'Aucune sauvegarde restaurable n’est disponible.');
  const snapshot = decodeSnapshot(
    await fs.readFile(path.join(backupDirectory, selected.filename)),
    getLocalBackupEncryptionKey(),
    selected.filename,
  );
  return { filename: selected.filename, snapshot };
}

async function migrateLegacyLocalBackups(options = {}) {
  const directory = options.directory || backupDirectory;
  const filenames = (await fs.readdir(directory).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })).filter((filename) => filename.endsWith('.json'));
  if (filenames.length === 0) return 0;
  const encryptionKey = getLocalBackupEncryptionKey(options.environment || process.env);
  let migrated = 0;
  for (const filename of filenames) {
    const source = path.join(directory, filename);
    const plain = await fs.readFile(source);
    const snapshot = JSON.parse(plain.toString('utf8'));
    if (!/^\d{17,20}$/.test(String(snapshot.guild?.id))) {
      throw new Error(`Sauvegarde refusée : ${filename} ne contient pas un identifiant de serveur valide.`);
    }
    const target = path.join(directory, `${filename}.enc`);
    const plainHash = crypto.createHash('sha256').update(plain).digest();
    const existing = await fs.readFile(target).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing) {
      const existingPlain = decryptPayload(existing, encryptionKey).plain;
      const existingHash = crypto.createHash('sha256').update(existingPlain).digest();
      if (!crypto.timingSafeEqual(plainHash, existingHash)) {
        throw new Error(`Une sauvegarde chiffrée différente existe déjà pour ${filename}.`);
      }
      await fs.rm(source);
      migrated += 1;
      continue;
    }

    const temporary = `${target}.${process.pid}.tmp`;
    const encrypted = encryptPayload(plain, encryptionKey, new Date(snapshot.createdAt || Date.now()));
    try {
      await fs.writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
      const verified = decryptPayload(await fs.readFile(temporary), encryptionKey).plain;
      const verifiedHash = crypto.createHash('sha256').update(verified).digest();
      if (!crypto.timingSafeEqual(plainHash, verifiedHash)) throw new Error(`Échec de vérification : ${filename}.`);
      await fs.rename(temporary, target);
      await fs.rm(source);
      migrated += 1;
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => null);
    }
  }
  return migrated;
}

function remapPermissionOverwrites(overwrites, guild, roleIdMap) {
  return (overwrites || []).flatMap((overwrite) => {
    const mappedId = overwrite.id === guild.id ? guild.id : roleIdMap.get(overwrite.id) || overwrite.id;
    const isRole = Number(overwrite.type) === 0;
    if (isRole && overwrite.id !== guild.id && !roleIdMap.has(overwrite.id) && !guild.roles.cache.has(overwrite.id)) return [];
    return [{
      id: mappedId,
      type: Number(overwrite.type),
      allow: BigInt(overwrite.allow || '0'),
      deny: BigInt(overwrite.deny || '0'),
    }];
  });
}

function restorationPermissionOverwrites(overwrites, guild, roleIdMap) {
  const remapped = remapPermissionOverwrites(overwrites, guild, roleIdMap);
  const botMemberId = guild.members.me.id;
  const requiredPermissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels;
  const botOverwrite = remapped.find((overwrite) => overwrite.id === botMemberId && Number(overwrite.type) === 1);
  if (botOverwrite) {
    botOverwrite.allow |= requiredPermissions;
    botOverwrite.deny &= ~requiredPermissions;
    return remapped;
  }
  return [...remapped, {
    id: botMemberId,
    type: 1,
    allow: requiredPermissions,
    deny: 0n,
  }];
}

function remapConfigurationIds(value, idMap) {
  if (typeof value === 'string') return idMap.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => remapConfigurationIds(item, idMap));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapConfigurationIds(item, idMap)]));
  }
  return value;
}

function restorableChannelOptions(savedChannel, guild, roleIdMap, parentId) {
  const options = {
    name: savedChannel.name,
    type: savedChannel.type,
    parent: parentId || undefined,
    // Le bot conserve provisoirement l'accès pendant toute la reconstruction.
    // Les permissions exactes de la sauvegarde sont réappliquées une fois tous
    // les salons créés, afin qu'une catégorie privée ne bloque pas la suite.
    permissionOverwrites: restorationPermissionOverwrites(savedChannel.permissionOverwrites, guild, roleIdMap),
    reason: 'Restauration d’une sauvegarde FyxBot',
  };
  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(savedChannel.type)) {
    options.topic = savedChannel.topic || undefined;
    options.nsfw = savedChannel.nsfw === true;
    options.rateLimitPerUser = Number(savedChannel.rateLimitPerUser || 0);
  }
  if ([ChannelType.GuildForum, ChannelType.GuildMedia].includes(savedChannel.type)) {
    options.availableTags = savedChannel.availableTags || [];
    options.defaultReactionEmoji = savedChannel.defaultReactionEmoji || undefined;
    options.defaultThreadRateLimitPerUser = savedChannel.defaultThreadRateLimitPerUser || 0;
    options.defaultSortOrder = savedChannel.defaultSortOrder ?? undefined;
    options.defaultForumLayout = savedChannel.defaultForumLayout ?? undefined;
  }
  if (savedChannel.defaultAutoArchiveDuration) options.defaultAutoArchiveDuration = savedChannel.defaultAutoArchiveDuration;
  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(savedChannel.type)) {
    if (savedChannel.bitrate) options.bitrate = savedChannel.bitrate;
    if (savedChannel.userLimit !== null) options.userLimit = savedChannel.userLimit;
    if (savedChannel.rtcRegion) options.rtcRegion = savedChannel.rtcRegion;
    if (savedChannel.videoQualityMode) options.videoQualityMode = savedChannel.videoQualityMode;
  }
  return options;
}

async function restoreServer(guild, filename) {
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)
    || !guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('FyxBot nécessite les permissions Gérer les rôles et Gérer les salons pour restaurer le serveur.');
  }
  const { filename: selectedFilename, snapshot } = await loadServerBackup(guild.id, filename);
  if (String(snapshot.guild?.id) !== String(guild.id)) throw new Error('Cette sauvegarde appartient à un autre serveur.');
  const safetyBackupFile = await backupServer(guild);
  let deletedChannels = 0;
  let deletedRoles = 0;

  const existingChannels = [...guild.channels.cache.values()].sort((left, right) => right.rawPosition - left.rawPosition);
  for (const channel of existingChannels) {
    if (!channel.deletable) continue;
    await channel.delete('Restauration d’une sauvegarde FyxBot');
    deletedChannels += 1;
  }
  const existingRoles = [...guild.roles.cache.values()].sort((left, right) => left.position - right.position);
  for (const role of existingRoles) {
    if (role.id === guild.id || role.managed || !role.editable) continue;
    await role.delete('Restauration d’une sauvegarde FyxBot');
    deletedRoles += 1;
  }

  const roleIdMap = new Map([[guild.id, guild.id]]);
  const retainedRoles = guild.roles.cache;
  for (const savedRole of (snapshot.roles || []).filter((role) => role.managed)) {
    if (retainedRoles.has(savedRole.id)) roleIdMap.set(savedRole.id, savedRole.id);
  }
  const createdRoles = [];
  const restorableRoles = (snapshot.roles || [])
    .filter((role) => !role.managed)
    .sort((left, right) => left.position - right.position);
  for (const savedRole of restorableRoles) {
    const requestedPermissions = BigInt(savedRole.permissions || '0');
    const grantablePermissions = requestedPermissions & guild.members.me.permissions.bitfield;
    const createdRole = await guild.roles.create({
      name: savedRole.name,
      colors: { primaryColor: savedRole.color || 0 },
      permissions: grantablePermissions,
      hoist: savedRole.hoist === true,
      mentionable: savedRole.mentionable === true,
      unicodeEmoji: savedRole.unicodeEmoji || undefined,
      reason: 'Restauration d’une sauvegarde FyxBot',
    });
    roleIdMap.set(savedRole.id, createdRole.id);
    createdRoles.push({ role: createdRole, position: savedRole.position });
  }
  for (const item of createdRoles) {
    const maximum = Math.max(1, guild.members.me.roles.highest.position - 1);
    await item.role.setPosition(Math.min(item.position, maximum), { reason: 'Ordre restauré par FyxBot' }).catch(() => null);
  }

  const channelIdMap = new Map();
  const restoredChannels = [];
  const savedCategories = (snapshot.channels || [])
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((left, right) => left.position - right.position);
  for (const savedCategory of savedCategories) {
    const createdCategory = await guild.channels.create(restorableChannelOptions(savedCategory, guild, roleIdMap));
    channelIdMap.set(savedCategory.id, createdCategory.id);
    restoredChannels.push({ saved: savedCategory, created: createdCategory });
    await createdCategory.setPosition(savedCategory.position).catch(() => null);
  }
  const savedChannels = (snapshot.channels || [])
    .filter((channel) => channel.type !== ChannelType.GuildCategory)
    .sort((left, right) => left.position - right.position);
  for (const savedChannel of savedChannels) {
    const parentId = savedChannel.parentId ? channelIdMap.get(savedChannel.parentId) : null;
    const createdChannel = await guild.channels.create(restorableChannelOptions(savedChannel, guild, roleIdMap, parentId));
    channelIdMap.set(savedChannel.id, createdChannel.id);
    restoredChannels.push({ saved: savedChannel, created: createdChannel });
    await createdChannel.setPosition(savedChannel.position).catch(() => null);
  }

  const permissionsLast = restoredChannels.sort((left, right) => {
    const leftIsCategory = left.saved.type === ChannelType.GuildCategory ? 1 : 0;
    const rightIsCategory = right.saved.type === ChannelType.GuildCategory ? 1 : 0;
    return leftIsCategory - rightIsCategory;
  });
  for (const { saved, created } of permissionsLast) {
    await created.permissionOverwrites.set(
      remapPermissionOverwrites(saved.permissionOverwrites, guild, roleIdMap),
      'Permissions restaurées par FyxBot',
    );
  }

  if (snapshot.version >= 2 && Array.isArray(snapshot.configurations)) {
    const idMap = new Map([...roleIdMap, ...channelIdMap]);
    replaceGuildConfigurations(guild.id, snapshot.configurations.map((configuration) => ({
      section: configuration.section,
      value: remapConfigurationIds(configuration.value, idMap),
    })));
  }

  return {
    restoredFile: selectedFilename,
    safetyBackupFile,
    createdRoles: createdRoles.length,
    createdChannels: channelIdMap.size,
    deletedRoles,
    deletedChannels,
    configurationsRestored: snapshot.version >= 2 && Array.isArray(snapshot.configurations),
  };
}

async function deleteServerBackups(guildId) {
  const safeGuildId = validateGuildId(guildId);
  let filenames;
  try {
    filenames = await fs.readdir(backupDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  const targets = filenames.filter((filename) => filename.startsWith(`${safeGuildId}-`)
    && (filename.endsWith('.json.enc') || filename.endsWith('.json')));
  await Promise.all(targets.map((filename) => fs.rm(path.join(backupDirectory, filename), { force: true })));
  return targets.length;
}

module.exports = {
  backupServer,
  decodeSnapshot,
  deleteServerBackups,
  getLocalBackupEncryptionKey,
  listServerBackups,
  loadServerBackup,
  migrateLegacyLocalBackups,
  remapConfigurationIds,
  restorationPermissionOverwrites,
  restoreServer,
};
