const { Events } = require('discord.js');
const { handleMemberRemove } = require('../services/welcome');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await handleMemberRemove(member);
  },
};
