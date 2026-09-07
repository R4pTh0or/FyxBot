const { Events } = require('discord.js');
const { syncCreatorStats } = require('../database/creatorStatsStore');
const { broadcastPendingChangelogs } = require('../services/changelogNotifications');
const { syncPremiumEntitlements } = require('../services/premiumEntitlements');
const { startGiveawayScheduler } = require('../services/communityGiveaways');
const { runPermissionMigration } = require('../services/permissionMigration');
const { migrateLegacyLocalBackups } = require('../services/serverBackup');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    syncCreatorStats(client.guilds.cache.values());
    console.log(`[FyxBot] Connecté en tant que ${client.user.tag}.`);
    try {
      const migratedBackups = await migrateLegacyLocalBackups();
      if (migratedBackups > 0) console.log(`[FyxBot] ${migratedBackups} sauvegarde(s) locale(s) chiffrée(s) et vérifiée(s).`);
    } catch (error) {
      console.error('[FyxBot] Chiffrement des sauvegardes locales indisponible :', error);
    }
    const result = await broadcastPendingChangelogs(client);
    if (result.published > 0) console.log(`[FyxBot] ${result.published} annonce(s) de changelog publiée(s).`);
    try {
      const permissions = await runPermissionMigration(client);
      if (permissions.enabled) console.log('[FyxBot][Permissions v2]', JSON.stringify(permissions));
    } catch (error) {
      console.error('[FyxBot][Permissions v2] Migration indisponible :', error);
    }
    try {
      const premium = await syncPremiumEntitlements(client);
      if (premium.configured) console.log(`[FyxBot] ${premium.synced} droit(s) Premium Discord synchronisé(s).`);
    } catch (error) {
      console.error('[FyxBot] Synchronisation Premium Discord indisponible :', error);
    }
    startGiveawayScheduler(client);
  },
};
