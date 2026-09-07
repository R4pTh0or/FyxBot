const { Events } = require('discord.js');
const { upsertPremiumEntitlement } = require('../services/premiumEntitlements');

module.exports = {
  name: Events.EntitlementCreate,
  execute(entitlement) {
    try {
      upsertPremiumEntitlement(entitlement);
      console.log('[FyxBot] Droit Premium Discord créé et synchronisé.');
    } catch (error) {
      console.error('[FyxBot] Échec de synchronisation d’un droit Premium créé :', error);
    }
  },
};
