const defaultStorage = require('./defaultConfigurationStorage');

async function getSocialConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'social');
}

async function setSocialConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'social', config);
}

module.exports = { getSocialConfig, setSocialConfig };
