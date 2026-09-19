const defaultStorage = require('./defaultConfigurationStorage');

async function getChangelogConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'changelog');
}

async function setChangelogConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'changelog', config);
}

module.exports = { getChangelogConfig, setChangelogConfig };
