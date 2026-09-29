const { Events } = require('discord.js');
const { markPremiumEntitlementDeleted } = require('../services/premiumEntitlements');
const { entitlementUserId, syncPremiumRolesForUser } = require('../services/premiumRoles');
const logger = require('../services/logger').logger.child({ component: 'premium-entitlement' });

module.exports = {
  name: Events.EntitlementDelete,
  async execute(entitlement, client) {
    try {
      await markPremiumEntitlementDeleted(entitlement);
      logger.info({ entitlementId: entitlement.id }, '[FyxBot] Droit Premium Discord supprimé ou remboursé.');
    } catch (error) {
      logger.error({ err: error, entitlementId: entitlement.id }, '[FyxBot] Échec de suppression d’un droit Premium.');
      return;
    }
    const userId = entitlementUserId(entitlement);
    if (userId) {
      try {
        await syncPremiumRolesForUser(client, userId);
      } catch (error) {
        logger.error({ err: error, entitlementId: entitlement.id, userId }, '[FyxBot] Retrait du rôle Premium impossible après expiration ou remboursement.');
      }
    }
  },
};
