const { ChannelType, PermissionFlagsBits } = require('discord.js');

const SENSITIVE_CATEGORY_PATTERN = /\b(staff|moderation|moderateur|administration|admin|equipe|logs?|sanctions?|journaux?)\b/i;
const SENSITIVE_CHANNEL_PATTERN = /^(staff|moderation|moderateur|administration|admin|logs?|sanctions?|journaux?)(?:$|[-_ ・])/i;

function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^[^a-z0-9]+/, '');
}

function isSensitiveChannel(channel) {
  return SENSITIVE_CATEGORY_PATTERN.test(normalizedName(channel.categoryName))
    || SENSITIVE_CHANNEL_PATTERN.test(normalizedName(channel.name));
}

function hasPermission(permissions, flag) {
  return Boolean(permissions?.has?.(flag));
}

function channelKind(channel) {
  if (channel?.isVoiceBased?.()
    || [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel?.type)) return 'voice';
  if (channel?.isTextBased?.()
    || [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel?.type)) return 'text';
  return 'other';
}

function accessForChannel(channel, target) {
  const permissions = channel.permissionsFor?.(target) || null;
  const kind = channelKind(channel);
  const visible = hasPermission(permissions, PermissionFlagsBits.ViewChannel);
  if (!visible) {
    return {
      visible: false,
      canReadHistory: false,
      canWrite: false,
      canManage: false,
      tone: 'hidden',
      label: 'Masqué',
    };
  }

  const canReadHistory = kind !== 'text'
    || hasPermission(permissions, PermissionFlagsBits.ReadMessageHistory);
  const canWrite = kind === 'voice'
    ? hasPermission(permissions, PermissionFlagsBits.Connect)
    : kind === 'text'
      ? hasPermission(permissions, PermissionFlagsBits.SendMessages)
        || hasPermission(permissions, PermissionFlagsBits.SendMessagesInThreads)
      : false;
  const canManage = hasPermission(permissions, PermissionFlagsBits.ManageChannels)
    || (kind === 'text' && hasPermission(permissions, PermissionFlagsBits.ManageMessages))
    || (kind === 'voice' && (
      hasPermission(permissions, PermissionFlagsBits.MuteMembers)
      || hasPermission(permissions, PermissionFlagsBits.MoveMembers)
    ));

  if (canManage) {
    return { visible, canReadHistory, canWrite, canManage, tone: 'control', label: 'Gestion' };
  }
  if (canWrite) {
    return {
      visible,
      canReadHistory,
      canWrite,
      canManage,
      tone: 'write',
      label: kind === 'voice' ? 'Voir et rejoindre' : 'Lecture et écriture',
    };
  }
  return {
    visible,
    canReadHistory,
    canWrite,
    canManage,
    tone: 'read',
    label: canReadHistory ? 'Lecture seule' : 'Visible sans historique',
  };
}

function subjectColor(subject) {
  if (typeof subject?.displayHexColor === 'string' && /^#[0-9a-f]{6}$/i.test(subject.displayHexColor)) {
    return subject.displayHexColor;
  }
  if (typeof subject?.hexColor === 'string' && /^#[0-9a-f]{6}$/i.test(subject.hexColor)) return subject.hexColor;
  const numeric = Number(subject?.displayColor || subject?.color || 0);
  return numeric > 0 ? `#${numeric.toString(16).padStart(6, '0')}` : '#99aab5';
}

function buildPermissionPerspective({ guild, target, channels, subject }) {
  if (!guild?.id || !target?.id || !subject?.type) {
    throw new TypeError('Serveur et sujet requis pour calculer la perspective.');
  }
  const channelList = [...(channels?.values?.() || channels || [])]
    .filter((channel) => channel
      && channel.type !== ChannelType.GuildCategory
      && !channel.isThread?.())
    .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0));
  const categoryMap = new Map();
  const flattened = channelList.map((channel) => {
    const access = accessForChannel(channel, target);
    const parent = channel.parent || null;
    const categoryId = parent?.id || 'uncategorized';
    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        id: categoryId,
        name: parent?.name || 'Sans catégorie',
        position: parent?.rawPosition ?? Number.MAX_SAFE_INTEGER,
        channels: [],
      });
    }
    const item = {
      id: channel.id,
      name: channel.name,
      kind: channelKind(channel),
      ...access,
    };
    categoryMap.get(categoryId).channels.push(item);
    return { ...item, categoryName: parent?.name || '' };
  });

  const subjectPermissions = target.permissions;
  const administrator = hasPermission(subjectPermissions, PermissionFlagsBits.Administrator);
  const managesServer = hasPermission(subjectPermissions, PermissionFlagsBits.ManageGuild)
    || hasPermission(subjectPermissions, PermissionFlagsBits.ManageRoles)
    || hasPermission(subjectPermissions, PermissionFlagsBits.ManageChannels);
  const elevated = administrator || managesServer
    || hasPermission(subjectPermissions, PermissionFlagsBits.ManageMessages)
    || hasPermission(subjectPermissions, PermissionFlagsBits.ModerateMembers)
    || hasPermission(subjectPermissions, PermissionFlagsBits.KickMembers)
    || hasPermission(subjectPermissions, PermissionFlagsBits.BanMembers);
  const exposedSensitiveChannels = elevated ? [] : flattened.filter((channel) => channel.visible
    && isSensitiveChannel(channel));
  const warnings = [];
  if (administrator) {
    warnings.push({
      code: 'administrator',
      severity: 'critical',
      title: 'Accès Administrateur',
      detail: subject.type === 'member'
        ? 'Votre compte contourne toutes les restrictions de salons grâce à l’un de ses rôles.'
        : 'Ce rôle contourne toutes les restrictions de salons. Réservez-le aux personnes totalement fiables.',
    });
  } else if (managesServer) {
    warnings.push({
      code: 'server-management',
      severity: 'warning',
      title: 'Permissions de gestion étendues',
      detail: subject.type === 'member'
        ? 'Votre compte peut modifier le serveur, les rôles ou les salons avec ses permissions combinées.'
        : 'Ce rôle peut modifier le serveur, les rôles ou les salons selon ses permissions actuelles.',
    });
  }
  if (exposedSensitiveChannels.length > 0) {
    warnings.push({
      code: 'sensitive-exposure',
      severity: 'warning',
      title: 'Espace sensible visible',
      detail: `${exposedSensitiveChannels.length} salon(s) ressemblant à un espace de staff, de logs ou de modération sont visibles par ${subject.type === 'member' ? 'ce compte' : 'ce rôle'}.`,
    });
  }

  const summary = flattened.reduce((totals, channel) => {
    if (channel.visible) {
      totals.visible += 1;
      if (channel.tone === 'read') totals.read += 1;
      if (channel.canWrite) totals.write += 1;
      if (channel.canManage) totals.control += 1;
    } else {
      totals.hidden += 1;
    }
    return totals;
  }, { total: flattened.length, visible: 0, hidden: 0, read: 0, write: 0, control: 0 });

  return {
    previewOnly: true,
    guild: { id: guild.id, name: guild.name },
    subject: {
      ...subject,
      elevated,
    },
    summary,
    warnings,
    categories: [...categoryMap.values()]
      .sort((a, b) => a.position - b.position)
      .map(({ position, ...category }) => category),
  };
}

function buildRolePermissionPerspective({ guild, role, channels }) {
  if (!role?.id) throw new TypeError('Rôle requis pour calculer la perspective.');
  return buildPermissionPerspective({
    guild,
    target: role,
    channels,
    subject: {
      type: 'role',
      id: role.id,
      name: role.id === guild.id ? '@everyone' : role.name,
      color: subjectColor(role),
      everyone: role.id === guild.id,
      roleNames: [],
      roleCount: role.id === guild.id ? 1 : 0,
    },
  });
}

function buildMemberPermissionPerspective({ guild, member, channels }) {
  if (!member?.id) throw new TypeError('Membre requis pour calculer la perspective.');
  const memberRoles = [...(member.roles?.cache?.values?.() || [])]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => (b.position || 0) - (a.position || 0));
  return buildPermissionPerspective({
    guild,
    target: member,
    channels,
    subject: {
      type: 'member',
      id: member.id,
      name: member.displayName || member.user?.globalName || member.user?.username || 'Mon compte',
      color: subjectColor(member),
      everyone: false,
      roleNames: memberRoles.map((role) => role.name),
      roleCount: memberRoles.length,
    },
  });
}

module.exports = {
  accessForChannel,
  buildMemberPermissionPerspective,
  buildRolePermissionPerspective,
  channelKind,
  isSensitiveChannel,
};
