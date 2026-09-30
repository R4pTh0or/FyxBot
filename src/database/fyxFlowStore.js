const defaultStorage = require('./defaultConfigurationStorage');

const writeQueues = new Map();

function emptyFyxFlowConfig() {
  return { flows: [], history: [], updatedAt: null };
}

function normalizeFyxFlowConfig(value) {
  return {
    flows: Array.isArray(value?.flows) ? value.flows : [],
    history: Array.isArray(value?.history) ? value.history.slice(0, 50) : [],
    updatedAt: value?.updatedAt || null,
  };
}

async function getFyxFlowConfig(guildId, storage = defaultStorage) {
  return normalizeFyxFlowConfig(await storage.getConfiguration(guildId, 'fyxflow'));
}

async function setFyxFlowConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'fyxflow', normalizeFyxFlowConfig(config));
}

async function updateFyxFlowConfig(guildId, updater, storage = defaultStorage) {
  if (typeof updater !== 'function') throw new TypeError('Une fonction de mise à jour est requise.');
  if (typeof storage.updateConfiguration === 'function') {
    return storage.updateConfiguration(guildId, 'fyxflow', async (current) => normalizeFyxFlowConfig(
      await updater(normalizeFyxFlowConfig(current)),
    ));
  }

  const previous = writeQueues.get(guildId) || Promise.resolve();
  const operation = previous.then(async () => {
    const current = await getFyxFlowConfig(guildId, storage);
    const next = normalizeFyxFlowConfig(await updater(current));
    await setFyxFlowConfig(guildId, next, storage);
    return next;
  });
  const serialized = operation.catch(() => {});
  writeQueues.set(guildId, serialized);
  return operation.finally(() => {
    if (writeQueues.get(guildId) === serialized) writeQueues.delete(guildId);
  });
}

module.exports = {
  emptyFyxFlowConfig,
  getFyxFlowConfig,
  normalizeFyxFlowConfig,
  setFyxFlowConfig,
  updateFyxFlowConfig,
};
