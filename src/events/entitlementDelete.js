const { Events } = require('discord.js');
const { markPremiumEntitlementDeleted } = require('../services/premiumEntitlements');

module.exports = {
  name: Events.EntitlementDelete,
  execute(entitlement) {
    try {
      markPremiumEntitlementDeleted(entitlement);
      console.log('[FyxBot] Droit Premium Discord supprimé ou remboursé.');
    } catch (error) {
      console.error('[FyxBot] Échec de suppression d’un droit Premium :', error);
    }
  },
};
