const defaultStorage = require('./defaultConfigurationStorage');

function getPremiumConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'premium');
}

function setPremiumConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'premium', config);
}

module.exports = { getPremiumConfig, setPremiumConfig };
