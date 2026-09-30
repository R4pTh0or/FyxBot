const { Events } = require('discord.js');
const { handleMemberAdd } = require('../services/welcome');
const { syncPremiumRolesForMember } = require('../services/premiumRoles');
const { executeFyxFlowTrigger } = require('../services/fyxFlow');
const logger = require('../services/logger').logger.child({ component: 'member-add' });

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleMemberAdd(member);
    await executeFyxFlowTrigger(member, 'member_join');
    try {
      await syncPremiumRolesForMember(member);
    } catch (error) {
      logger.error({ err: error, guildId: member.guild.id, userId: member.id }, '[FyxBot] Restauration du rôle Premium impossible à l’arrivée du membre.');
    }
  },
};
