const { getConfiguration, setConfiguration } = require('./database');

function getBirthdayConfig(guildId) {
  return getConfiguration(guildId, 'birthdays');
}

function setBirthdayConfig(guildId, config) {
  return setConfiguration(guildId, 'birthdays', config);
}

module.exports = { getBirthdayConfig, setBirthdayConfig };
