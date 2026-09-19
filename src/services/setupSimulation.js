function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
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
    roles: Number(current.roles) || Math.max(desired.roles - (analysis.missingRoles?.length || 0), 0),
    categories: Number(current.categories) || Math.max(desired.categories - (analysis.missingCategories?.length || 0), 0),
    channels: Number(current.channels) || Math.max(desired.channels - (analysis.missingChannels?.length || 0), 0),
  };
  return {
    previewOnly: true,
    before,
    desired,
    additions,
    movements,
    permissionChanges,
    preserved,
    totalChanges: additions.length + movements.length + permissionChanges.length,
    plans: {
      complete: { risk: 'low', creates: additions.length, updates: 0, deletes: 0, preserves: preserved.length },
      synchronize: { risk: permissionChanges.length ? 'guarded' : 'low', creates: additions.length, updates: movements.length + permissionChanges.length, deletes: 0, preserves: preserved.length },
      reset: { risk: 'critical', creates: desired.roles + desired.categories + desired.channels, updates: 0, deletes: before.roles + before.categories + before.channels, preserves: 0 },
    },
  };
}

module.exports = { buildSetupSimulation };
