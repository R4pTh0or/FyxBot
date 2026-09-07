const { getConfiguration, setConfiguration } = require('./database');

function getServerSetupConfig(guildId) {
  return getConfiguration(guildId, 'server-setup');
}

function setServerSetupConfig(guildId, config) {
  return setConfiguration(guildId, 'server-setup', config);
}

function saveServerSetupDraft(guildId, blueprint) {
  const current = getServerSetupConfig(guildId) || {};
  return setServerSetupConfig(guildId, {
    ...current,
    description: blueprint.description,
    draftBlueprint: blueprint,
    draftUpdatedAt: new Date().toISOString(),
    previewHiddenAt: null,
  });
}

function activateServerSetupBlueprint(guildId, blueprint) {
  const current = getServerSetupConfig(guildId) || {};
  return setServerSetupConfig(guildId, {
    ...current,
    description: blueprint.description,
    draftBlueprint: blueprint,
    activeBlueprint: blueprint,
    appliedAt: new Date().toISOString(),
    previewHiddenAt: null,
  });
}

function withoutServerSetupPreview(current = {}, now = new Date()) {
  const { draftBlueprint, draftUpdatedAt, description, ...preserved } = current;
  return {
    ...preserved,
    previewHiddenAt: now.toISOString(),
  };
}

function deleteServerSetupPreview(guildId) {
  const current = getServerSetupConfig(guildId) || {};
  const hadPreview = Boolean(current.draftBlueprint || current.activeBlueprint);
  setServerSetupConfig(guildId, withoutServerSetupPreview(current));
  return hadPreview;
}

function getServerSetupBlueprint(guildId, options = {}) {
  const config = getServerSetupConfig(guildId) || {};
  if (options.activeOnly) return config.activeBlueprint || null;
  if (config.previewHiddenAt && !config.draftBlueprint) return null;
  return config.draftBlueprint || config.activeBlueprint || null;
}

module.exports = {
  activateServerSetupBlueprint,
  deleteServerSetupPreview,
  getServerSetupBlueprint,
  getServerSetupConfig,
  saveServerSetupDraft,
  setServerSetupConfig,
  withoutServerSetupPreview,
};
