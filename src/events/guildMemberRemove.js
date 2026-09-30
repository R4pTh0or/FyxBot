const { Events } = require('discord.js');
const { handleMemberRemove } = require('../services/welcome');
const { executeFyxFlowTrigger } = require('../services/fyxFlow');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await handleMemberRemove(member);
    await executeFyxFlowTrigger(member, 'member_leave');
  },
};
