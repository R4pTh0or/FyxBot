function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function labeledItems(values, label) {
  return unique((values || []).map((value) => {
    const name = typeof value === 'string' ? value : value?.name;
    return name ? `${label} : ${name}` : null;
  }));
}

function safeCount(value, fallback) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : fallback;
}

function categoryPermissionProfile(definition = {}) {
  const profile = definition.permissionProfile || definition.profile || 'memberCommunity';
  if (definition.key === 'welcome') return 'publicReadOnly';
  if (definition.key === 'staff') return 'staffOnly';
  if (profile === 'publicReadOnly') return 'memberReadOnly';
  if (profile === 'publicCommunity') return 'memberCommunity';
  return profile;
}

function channelPermissionProfile(definition = {}) {
  const profile = definition.permissionProfile || definition.profile || 'inherit';
  if (definition.category !== 'welcome' && profile === 'publicReadOnly') return 'memberReadOnly';
  if (definition.category !== 'welcome' && profile === 'publicCommunity') return 'memberCommunity';
  return profile;
}

function permissionLevel(profile, roleType) {
  if (roleType === 'bot') return { label: 'Gestion technique', tone: 'control' };
  if (roleType === 'staff') return { label: 'Lecture, écriture et modération', tone: 'control' };
  if (roleType === 'everyone') {
    if (profile === 'publicCommunity') return { label: 'Lecture et écriture', tone: 'write' };
    if (profile === 'publicReadOnly') return { label: 'Lecture seule', tone: 'read' };
    return { label: 'Masqué', tone: 'hidden' };
  }
  if (profile === 'staffOnly') return { label: 'Masqué', tone: 'hidden' };
  if (profile === 'memberReadOnly' || profile === 'publicReadOnly') return { label: 'Lecture seule', tone: 'read' };
  return { label: 'Lecture et écriture', tone: 'write' };
}

function buildPermissionPreview(blueprint, current = {}) {
  const memberRoleName = current.memberAccessRoleName
    || blueprint.roles?.find((role) => role.key === 'member')?.name
    || 'Rôle membre';
  const staffRoleNames = unique((blueprint.roles || [])
    .filter((role) => role.staff === true || ['founder', 'administrator', 'moderator', 'support'].includes(role.key))
    .map((role) => role.name));
  const roleRows = (profile) => [
    { role: '@everyone', ...permissionLevel(profile, 'everyone') },
    { role: memberRoleName, ...permissionLevel(profile, 'member') },
    ...staffRoleNames.map((role) => ({ role, ...permissionLevel(profile, 'staff') })),
    { role: 'FyxBot', ...permissionLevel(profile, 'bot') },
  ];

  return (blueprint.categories || []).map((category) => {
    const profile = categoryPermissionProfile(category);
    const channelOverrides = (blueprint.channels || [])
      .filter((channel) => channel.category === category.key)
      .map((channel) => ({ ...channel, resolvedProfile: channelPermissionProfile(channel) }))
      .filter((channel) => channel.resolvedProfile !== 'inherit' && channel.resolvedProfile !== profile)
      .map((channel) => ({
        name: channel.name,
        access: roleRows(channel.resolvedProfile),
      }));
    return {
      key: category.key,
      name: category.name,
      profile,
      access: roleRows(profile),
      channelOverrides,
    };
  });
}

function buildSetupSimulation({ analysis, blueprint, current = {} } = {}) {
  if (!analysis || !blueprint) return null;
  const additions = unique([
    ...(analysis.missingRoles || []).map((name) => `Rôle : ${name}`),
    ...(analysis.missingCategories || []).map((name) => `Catégorie : ${name}`),
    ...(analysis.missingChannels || []).map((name) => `Salon : ${name}`),
  ]);
  const movements = unique((analysis.misplacedChannels || []).map((name) => `Déplacer ${name}`));
  const permissionChanges = unique(analysis.permissionIssues || []);
  const preserved = unique([
    ...(analysis.extraRoles || []).map((name) => `Rôle personnel : ${name}`),
    ...(analysis.extraCategories || []).map((name) => `Catégorie personnelle : ${name}`),
    ...(analysis.extraChannels || []).map((name) => `Salon personnel : ${name}`),
  ]);
  const desired = {
    roles: blueprint.roles?.length || 0,
    categories: blueprint.categories?.length || 0,
    channels: blueprint.channels?.length || 0,
  };
  const before = {
    roles: safeCount(current.roles, Math.max(desired.roles - (analysis.missingRoles?.length || 0), 0)),
    categories: safeCount(current.categories, Math.max(desired.categories - (analysis.missingCategories?.length || 0), 0)),
    channels: safeCount(current.channels, Math.max(desired.channels - (analysis.missingChannels?.length || 0), 0)),
  };
  const resettable = current.resettable || null;
  const removals = resettable ? unique([
    ...labeledItems(resettable.roles, 'Rôle'),
    ...labeledItems(resettable.categories, 'Catégorie'),
    ...labeledItems(resettable.channels, 'Salon'),
  ]) : [];
  const projected = {
    roles: before.roles + (analysis.missingRoles?.length || 0),
    categories: before.categories + (analysis.missingCategories?.length || 0),
    channels: before.channels + (analysis.missingChannels?.length || 0),
  };
  const resetDeletes = resettable
    ? removals.length
    : before.roles + before.categories + before.channels;
  return {
    previewOnly: true,
    before,
    desired,
    additions,
    movements,
    permissionChanges,
    preserved,
    removals,
    permissionPreview: buildPermissionPreview(blueprint, current),
    totalChanges: additions.length + movements.length + permissionChanges.length,
    plans: {
      complete: { risk: 'low', creates: additions.length, updates: 0, deletes: 0, preserves: preserved.length, projected },
      synchronize: { risk: permissionChanges.length ? 'guarded' : 'low', creates: additions.length, updates: movements.length + permissionChanges.length, deletes: 0, preserves: preserved.length, projected },
      reset: { risk: 'critical', creates: desired.roles + desired.categories + desired.channels, updates: 0, deletes: resetDeletes, preserves: 0, projected: desired },
    },
  };
}

module.exports = {
  buildPermissionPreview,
  buildSetupSimulation,
  categoryPermissionProfile,
  channelPermissionProfile,
  labeledItems,
  permissionLevel,
  safeCount,
};
