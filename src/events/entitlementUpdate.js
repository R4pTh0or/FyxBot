const { Events } = require('discord.js');
const { upsertPremiumEntitlement } = require('../services/premiumEntitlements');

module.exports = {
  name: Events.EntitlementUpdate,
  execute(_previousEntitlement, entitlement) {
    try {
      upsertPremiumEntitlement(entitlement);
      console.log('[FyxBot] Droit Premium Discord mis à jour.');
    } catch (error) {
      console.error('[FyxBot] Échec de synchronisation d’un droit Premium mis à jour :', error);
    }
  },
};
