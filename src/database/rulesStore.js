const defaultStorage = require('./defaultConfigurationStorage');

async function getRulesConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'rules');
}

async function setRulesConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'rules', config);
}

module.exports = { getRulesConfig, setRulesConfig };
