const { createPostgresActivityStore } = require('./postgresActivityStore');
const { createPostgresConfigurationStore } = require('./postgresConfigurationStore');
const { createPostgresCreatorStatsStore } = require('./postgresCreatorStatsStore');
const { createPostgresDashboardAuthStore } = require('./postgresDashboardAuthStore');
const { createPostgresDataRetentionStore } = require('./postgresDataRetentionStore');
const { createPostgresFounderAccessStore } = require('./postgresFounderAccessStore');
const { createPostgresGiveawayStore } = require('./postgresGiveawayStore');
const { createPostgresPremiumEntitlementStore } = require('./postgresPremiumEntitlementStore');
const { createPostgresSupportStaffStore } = require('./postgresSupportStaffStore');
const { createPostgresSupportStore } = require('./postgresSupportStore');
const { createPostgresTwitchStore } = require('./postgresTwitchStore');
const { createPostgresWarningStore } = require('./postgresWarningStore');

const STORE_NAMES = Object.freeze([
  'activity', 'configuration', 'creatorStats', 'dashboardAuth', 'dataRetention',
  'founderAccess', 'giveaways', 'premiumEntitlements', 'supportStaff', 'support',
  'twitch', 'warnings',
]);

let runtimeStores = null;

function createPostgresRuntimeStores(pool, { schema = 'fyxbot' } = {}) {
  const options = { schema };
  return Object.freeze({
    activity: createPostgresActivityStore(pool, options),
    configuration: createPostgresConfigurationStore(pool, options),
    creatorStats: createPostgresCreatorStatsStore(pool, options),
    dashboardAuth: createPostgresDashboardAuthStore(pool, options),
    dataRetention: createPostgresDataRetentionStore(pool, options),
    founderAccess: createPostgresFounderAccessStore(pool, options),
    giveaways: createPostgresGiveawayStore(pool, options),
    premiumEntitlements: createPostgresPremiumEntitlementStore(pool, options),
    supportStaff: createPostgresSupportStaffStore(pool, options),
    support: createPostgresSupportStore(pool, options),
    twitch: createPostgresTwitchStore(pool, options),
    warnings: createPostgresWarningStore(pool, options),
  });
}

function configureRuntimeStores(stores) {
  if (runtimeStores) throw new Error('Le stockage PostgreSQL est déjà configuré.');
  if (!stores || STORE_NAMES.some((name) => !stores[name])) {
    throw new Error('Les magasins PostgreSQL requis sont incomplets.');
  }
  runtimeStores = Object.freeze({ ...stores });
}

function runtimeStoresConfigured() {
  return Boolean(runtimeStores);
}

function resolveRuntimeStore(name, explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (process.env.FYXBOT_STORAGE_BACKEND !== 'postgres') return null;
  if (!STORE_NAMES.includes(name) || !runtimeStores?.[name]) {
    throw new Error(`Stockage PostgreSQL non raccordé : ${name}.`);
  }
  return runtimeStores[name];
}

module.exports = {
  STORE_NAMES, configureRuntimeStores, createPostgresRuntimeStores, resolveRuntimeStore,
  runtimeStoresConfigured,
};
