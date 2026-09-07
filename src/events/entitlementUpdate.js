const { Events } = require('discord.js');
const { upsertPremiumEntitlement } = require('../services/premiumEntitlements');
const logger = require('../services/logger').logger.child({ component: 'premium-entitlement' });

module.exports = {
  name: Events.EntitlementUpdate,
  execute(_previousEntitlement, entitlement) {
    try {
      upsertPremiumEntitlement(entitlement);
      logger.info({ entitlementId: entitlement.id }, '[FyxBot] Droit Premium Discord mis à jour.');
    } catch (error) {
      logger.error({ err: error, entitlementId: entitlement.id }, '[FyxBot] Échec de synchronisation d’un droit Premium mis à jour.');
    }
  },
};
