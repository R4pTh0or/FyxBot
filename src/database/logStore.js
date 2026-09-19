const defaultStorage = require('./defaultConfigurationStorage');

async function getLogConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'logs');
}

async function setLogConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'logs', config);
}

module.exports = { getLogConfig, setLogConfig };
