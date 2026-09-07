const { Events } = require('discord.js');
const { handleMemberAdd } = require('../services/welcome');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleMemberAdd(member);
  },
};
