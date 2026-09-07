const { Events } = require('discord.js');
const { syncCreatorStats } = require('../database/creatorStatsStore');
const { broadcastPendingChangelogs } = require('../services/changelogNotifications');
const { syncPremiumEntitlements } = require('../services/premiumEntitlements');
const { startGiveawayScheduler } = require('../services/communityGiveaways');
const { runPermissionMigration } = require('../services/permissionMigration');
const { migrateLegacyLocalBackups } = require('../services/serverBackup');
const logger = require('../services/logger').logger.child({ component: 'startup' });

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    syncCreatorStats(client.guilds.cache.values());
    logger.info({ botTag: client.user.tag, guildCount: client.guilds.cache.size }, '[FyxBot] Connexion Discord établie.');
    try {
      const migratedBackups = await migrateLegacyLocalBackups();
      if (migratedBackups > 0) logger.info({ migratedBackups }, '[FyxBot] Sauvegardes locales chiffrées et vérifiées.');
    } catch (error) {
      logger.error({ err: error }, '[FyxBot] Chiffrement des sauvegardes locales indisponible.');
    }
    const result = await broadcastPendingChangelogs(client);
    if (result.published > 0) logger.info({ published: result.published }, '[FyxBot] Annonces de changelog publiées.');
    try {
      const permissions = await runPermissionMigration(client);
      if (permissions.enabled) logger.info({ permissions }, '[FyxBot] Migration des permissions terminée.');
    } catch (error) {
      logger.error({ err: error }, '[FyxBot] Migration des permissions indisponible.');
    }
    try {
      const premium = await syncPremiumEntitlements(client);
      if (premium.configured) logger.info({ synced: premium.synced }, '[FyxBot] Droits Premium Discord synchronisés.');
    } catch (error) {
      logger.error({ err: error }, '[FyxBot] Synchronisation Premium Discord indisponible.');
    }
    startGiveawayScheduler(client);
  },
};
