const { getConfiguration, setConfiguration } = require('./database');

function getPremiumConfig(guildId) {
  return getConfiguration(guildId, 'premium');
}

function setPremiumConfig(guildId, config) {
  return setConfiguration(guildId, 'premium', config);
}

module.exports = { getPremiumConfig, setPremiumConfig };
