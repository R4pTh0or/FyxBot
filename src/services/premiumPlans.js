const {
  getGuildPremiumEntitlementState,
  getUserPremiumEntitlementState,
} = require('./premiumEntitlements');
const { getFounderProgramState } = require('./premiumFounderAccess');
const { getManualPremiumState } = require('./premiumManualAccess');

const PREMIUM_ENFORCEMENT_ENABLED = true;
const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ ticketPanels: 1, rolePanels: 1, socialSources: 1 }),
  premium: Object.freeze({ ticketPanels: 25, rolePanels: 25, socialSources: 10 }),
});
const PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'FyxBot Free',
    description: 'Tous les outils essentiels pour lancer et protéger une communauté.',
    features: ['Modération, sécurité et accueil', '1 panneau de tickets', '1 panneau de rôles', '1 source sociale automatique'],
  }),
  premium: Object.freeze({
    id: 'premium',
    name: 'FyxBot Premium',
    description: 'Tous les outils FyxBot avec des capacités renforcées pour les communautés actives.',
    features: ['Jusqu’à 25 panneaux de tickets', 'Jusqu’à 25 panneaux de rôles', 'Jusqu’à 10 sources sociales', 'Accès Fondateur sur vos serveurs administrés'],
  }),
});

async function getGuildPremiumState(guildId, {
  userId = null,
  targetDatabase,
  entitlementStorage,
  founderStorage,
  now = new Date(),
  skuIds,
} = {}) {
  const entitlementOptions = { targetDatabase, storage: entitlementStorage, now, ...(skuIds ? { skuIds } : {}) };
  const [guildEntitlement, userEntitlement, founder, manual] = await Promise.all([
    getGuildPremiumEntitlementState(guildId, entitlementOptions),
    getUserPremiumEntitlementState(userId, entitlementOptions),
    getFounderProgramState(userId, guildId, { targetDatabase, storage: founderStorage, now }),
    getManualPremiumState(userId, guildId, { targetDatabase, storage: founderStorage, now }),
  ]);
  const premiumActive = PREMIUM_ENFORCEMENT_ENABLED
    && (manual.guildActive || founder.guildActive || guildEntitlement.active || userEntitlement.active);
  const activePlan = premiumActive ? 'premium' : 'free';
  const entitlementConfigured = guildEntitlement.configured || userEntitlement.configured;
  return {
    plan: activePlan,
    name: PLANS[activePlan].name,
    billingEnabled: entitlementConfigured,
    premiumAvailable: manual.userActive || founder.available || founder.userActive || entitlementConfigured,
    entitlementConfigured,
    entitlementDetected: guildEntitlement.detected + userEntitlement.detected,
    entitlementActive: guildEntitlement.active || userEntitlement.active,
    entitlementTest: guildEntitlement.test || userEntitlement.test,
    sourceOfTruth: manual.guildActive
      ? 'manual-access'
      : founder.guildActive
        ? 'founder-access'
        : guildEntitlement.active || userEntitlement.active
          ? 'discord-entitlements'
          : 'free',
    founder,
    manual,
    limits: PLAN_LIMITS[activePlan],
    plans: Object.values(PLANS),
  };
}

async function assertPremiumLimit(guildId, capability, currentCount, options = {}) {
  if (!Object.hasOwn(PLAN_LIMITS.free, capability)) throw new Error('Limite Premium inconnue.');
  const state = await getGuildPremiumState(guildId, options);
  const limit = state.limits[capability];
  if (Number(currentCount) < limit) return state;
  const labels = {
    ticketPanels: 'panneau de ticket',
    rolePanels: 'panneau de rôle',
    socialSources: 'source sociale automatique',
  };
  const error = new Error(`Le forfait ${state.name} autorise ${limit} ${labels[capability]}${limit > 1 ? 's' : ''}. Activez FyxBot Premium pour augmenter cette limite.`);
  error.userMessage = error.message;
  error.code = 'PREMIUM_LIMIT';
  throw error;
}

module.exports = {
  PLAN_LIMITS,
  PLANS,
  PREMIUM_ENFORCEMENT_ENABLED,
  assertPremiumLimit,
  getGuildPremiumState,
};
