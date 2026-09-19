const defaultStorage = require('./defaultConfigurationStorage');

async function getRolePanelConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'rolePanels');
}

async function setRolePanelConfig(guildId, value, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'rolePanels', value);
}

module.exports = { getRolePanelConfig, setRolePanelConfig };
