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
  });
}

function getServerSetupBlueprint(guildId, options = {}) {
  const config = getServerSetupConfig(guildId) || {};
  return options.activeOnly
    ? config.activeBlueprint || null
    : config.draftBlueprint || config.activeBlueprint || null;
}

module.exports = {
  activateServerSetupBlueprint,
  getServerSetupBlueprint,
  getServerSetupConfig,
  saveServerSetupDraft,
  setServerSetupConfig,
};
