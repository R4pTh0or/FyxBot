const { getConfiguration, setConfiguration } = require('./database');

function getRolePanelConfig(guildId) {
  return getConfiguration(guildId, 'rolePanels');
}

function setRolePanelConfig(guildId, value) {
  return setConfiguration(guildId, 'rolePanels', value);
}

module.exports = { getRolePanelConfig, setRolePanelConfig };
