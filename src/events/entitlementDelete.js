const { Events } = require('discord.js');
const { markPremiumEntitlementDeleted } = require('../services/premiumEntitlements');
const logger = require('../services/logger').logger.child({ component: 'premium-entitlement' });

module.exports = {
  name: Events.EntitlementDelete,
  execute(entitlement) {
    try {
      markPremiumEntitlementDeleted(entitlement);
      logger.info({ entitlementId: entitlement.id }, '[FyxBot] Droit Premium Discord supprimé ou remboursé.');
    } catch (error) {
      logger.error({ err: error, entitlementId: entitlement.id }, '[FyxBot] Échec de suppression d’un droit Premium.');
    }
  },
};
