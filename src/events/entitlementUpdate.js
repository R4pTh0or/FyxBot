const { Events } = require('discord.js');
const { upsertPremiumEntitlement } = require('../services/premiumEntitlements');
const { entitlementUserId, syncPremiumRolesForUser } = require('../services/premiumRoles');
const logger = require('../services/logger').logger.child({ component: 'premium-entitlement' });

module.exports = {
  name: Events.EntitlementUpdate,
  async execute(_previousEntitlement, entitlement, client) {
    try {
      await upsertPremiumEntitlement(entitlement);
      logger.info({ entitlementId: entitlement.id }, '[FyxBot] Droit Premium Discord mis à jour.');
    } catch (error) {
      logger.error({ err: error, entitlementId: entitlement.id }, '[FyxBot] Échec de synchronisation d’un droit Premium mis à jour.');
      return;
    }
    const userId = entitlementUserId(entitlement);
    if (userId) {
      try {
        await syncPremiumRolesForUser(client, userId);
      } catch (error) {
        logger.error({ err: error, entitlementId: entitlement.id, userId }, '[FyxBot] Mise à jour du rôle Premium impossible.');
      }
    }
  },
};
