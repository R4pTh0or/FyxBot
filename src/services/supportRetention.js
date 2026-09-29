const { purgeExpiredSupportRequests } = require('../database/supportStore');
const { SUPPORT_RETENTION_MS } = require('./supportManagement');
const logger = require('./logger').logger.child({ component: 'support-retention' });

const SUPPORT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function purgeExpiredSupportHistory({ now = new Date(), purge = purgeExpiredSupportRequests } = {}) {
  const cutoff = new Date(now.getTime() - SUPPORT_RETENTION_MS).toISOString();
  return purge({ cutoff });
}

function startSupportRetentionScheduler({
  cleanup = purgeExpiredSupportHistory,
  intervalMs = SUPPORT_CLEANUP_INTERVAL_MS,
} = {}) {
  let stopped = false;
  const run = async () => {
    if (stopped) return 0;
    try {
      const deleted = await cleanup();
      if (deleted > 0) logger.info({ deleted }, '[FyxBot] Anciennes demandes Support supprimées automatiquement.');
      return deleted;
    } catch (error) {
      logger.error({ err: error }, '[FyxBot] Nettoyage automatique du Support impossible.');
      return 0;
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { run, stop() { stopped = true; clearInterval(timer); } };
}

module.exports = {
  SUPPORT_CLEANUP_INTERVAL_MS,
  purgeExpiredSupportHistory,
  startSupportRetentionScheduler,
};
