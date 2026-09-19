const defaultStorage = require('./defaultConfigurationStorage');

async function getBirthdayConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'birthdays');
}

async function setBirthdayConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'birthdays', config);
}

module.exports = { getBirthdayConfig, setBirthdayConfig };
