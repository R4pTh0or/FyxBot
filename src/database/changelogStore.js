const { getConfiguration, setConfiguration } = require('./database');

function getChangelogConfig(guildId) {
  return getConfiguration(guildId, 'changelog');
}

function setChangelogConfig(guildId, config) {
  return setConfiguration(guildId, 'changelog', config);
}

module.exports = { getChangelogConfig, setChangelogConfig };
