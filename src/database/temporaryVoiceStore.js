const { getConfiguration, setConfiguration } = require('./database');

function getTemporaryVoiceConfig(guildId) {
  return getConfiguration(guildId, 'temporaryVoice');
}

function setTemporaryVoiceConfig(guildId, config) {
  return setConfiguration(guildId, 'temporaryVoice', config);
}

module.exports = { getTemporaryVoiceConfig, setTemporaryVoiceConfig };
