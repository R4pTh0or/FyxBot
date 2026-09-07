const { getConfiguration, setConfiguration } = require('./database');

function getSocialConfig(guildId) {
  return getConfiguration(guildId, 'social');
}

function setSocialConfig(guildId, config) {
  return setConfiguration(guildId, 'social', config);
}

module.exports = { getSocialConfig, setSocialConfig };
