const { Events } = require('discord.js');
const { upsertPremiumEntitlement } = require('../services/premiumEntitlements');
const { entitlementUserId, syncPremiumRolesForUser } = require('../services/premiumRoles');
const logger = require('../services/logger').logger.child({ component: 'premium-entitlement' });

module.exports = {
  name: Events.EntitlementCreate,
  async execute(entitlement, client) {
    try {
      await upsertPremiumEntitlement(entitlement);
      logger.info({ entitlementId: entitlement.id }, '[FyxBot] Droit Premium Discord créé et synchronisé.');
    } catch (error) {
      logger.error({ err: error, entitlementId: entitlement.id }, '[FyxBot] Échec de synchronisation d’un droit Premium créé.');
      return;
    }
    const userId = entitlementUserId(entitlement);
    if (userId) {
      try {
        await syncPremiumRolesForUser(client, userId);
      } catch (error) {
        logger.error({ err: error, entitlementId: entitlement.id, userId }, '[FyxBot] Attribution du rôle Premium impossible après achat.');
      }
    }
  },
};
