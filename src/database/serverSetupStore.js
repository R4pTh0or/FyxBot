function withoutServerSetupPreview(current = {}, now = new Date()) {
  const { draftBlueprint, draftUpdatedAt, description, ...preserved } = current;
  return {
    ...preserved,
    previewHiddenAt: now.toISOString(),
  };
}

function createServerSetupStore(storage) {
  if (typeof storage.getConfiguration !== 'function' || typeof storage.setConfiguration !== 'function') {
    throw new TypeError('Un magasin de configurations est requis.');
  }

  async function getServerSetupConfig(guildId) {
    return storage.getConfiguration(guildId, 'server-setup');
  }

  async function setServerSetupConfig(guildId, config) {
    return storage.setConfiguration(guildId, 'server-setup', config);
  }

  async function updateServerSetupConfig(guildId, updater) {
    if (typeof storage.updateConfiguration === 'function') {
      return storage.updateConfiguration(guildId, 'server-setup', updater);
    }
    const value = await updater(await getServerSetupConfig(guildId));
    return setServerSetupConfig(guildId, value);
  }

  async function saveServerSetupDraft(guildId, blueprint) {
    return updateServerSetupConfig(guildId, (current) => ({
      ...(current || {}),
      description: blueprint.description,
      draftBlueprint: blueprint,
      draftUpdatedAt: new Date().toISOString(),
      previewHiddenAt: null,
    }));
  }

  async function activateServerSetupBlueprint(guildId, blueprint) {
    return updateServerSetupConfig(guildId, (current) => ({
      ...(current || {}),
      description: blueprint.description,
      draftBlueprint: blueprint,
      activeBlueprint: blueprint,
      appliedAt: new Date().toISOString(),
      previewHiddenAt: null,
    }));
  }

  async function deleteServerSetupPreview(guildId) {
    let hadPreview = false;
    await updateServerSetupConfig(guildId, (current) => {
      hadPreview = Boolean(current?.draftBlueprint || current?.activeBlueprint);
      return withoutServerSetupPreview(current || {});
    });
    return hadPreview;
  }

  async function getServerSetupBlueprint(guildId, options = {}) {
    const config = await getServerSetupConfig(guildId) || {};
    if (options.activeOnly) return config.activeBlueprint || null;
    if (config.previewHiddenAt && !config.draftBlueprint) return null;
    return config.draftBlueprint || config.activeBlueprint || null;
  }

  return {
    activateServerSetupBlueprint,
    deleteServerSetupPreview,
    getServerSetupBlueprint,
    getServerSetupConfig,
    saveServerSetupDraft,
    setServerSetupConfig,
  };
}

let defaultStore;
function fromDefaultStore(method) {
  return (...args) => {
    defaultStore ||= createServerSetupStore(require('./defaultConfigurationStorage'));
    return defaultStore[method](...args);
  };
}

module.exports = {
  activateServerSetupBlueprint: fromDefaultStore('activateServerSetupBlueprint'),
  deleteServerSetupPreview: fromDefaultStore('deleteServerSetupPreview'),
  getServerSetupBlueprint: fromDefaultStore('getServerSetupBlueprint'),
  getServerSetupConfig: fromDefaultStore('getServerSetupConfig'),
  saveServerSetupDraft: fromDefaultStore('saveServerSetupDraft'),
  setServerSetupConfig: fromDefaultStore('setServerSetupConfig'),
  createServerSetupStore,
  withoutServerSetupPreview,
};
