const defaultStorage = require('./defaultConfigurationStorage');

async function getTemporaryVoiceConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'temporaryVoice');
}

async function setTemporaryVoiceConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'temporaryVoice', config);
}

module.exports = { getTemporaryVoiceConfig, setTemporaryVoiceConfig };
