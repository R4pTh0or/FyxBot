const { getConfiguration, setConfiguration } = require('./database');

function getRulesConfig(guildId) {
  return getConfiguration(guildId, 'rules');
}

function setRulesConfig(guildId, config) {
  return setConfiguration(guildId, 'rules', config);
}

module.exports = { getRulesConfig, setRulesConfig };
