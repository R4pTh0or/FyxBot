const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  claimFounderAccess,
  getFounderProgramState,
} = require('../src/services/premiumFounderAccess');
const { assertPremiumLimit, getGuildPremiumState } = require('../src/services/premiumPlans');

function createDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`
    CREATE TABLE premium_founder_trials (user_id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, claimed_at TEXT NOT NULL);
    CREATE TABLE premium_manual_grants (grant_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, display_name TEXT NOT NULL, reason TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT, granted_by TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT, created_at TEXT NOT NULL);
    CREATE TABLE premium_user_guilds (user_id TEXT NOT NULL, guild_id TEXT NOT NULL, linked_at TEXT NOT NULL, PRIMARY KEY (user_id, guild_id));
    CREATE TABLE premium_entitlements (entitlement_id TEXT PRIMARY KEY, sku_id TEXT NOT NULL, user_id TEXT, guild_id TEXT, starts_at TEXT, ends_at TEXT, deleted INTEGER NOT NULL DEFAULT 0, test INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL);
  `);
  return targetDatabase;
}

function snowflake(index, prefix = '1') {
  return `${prefix}${String(index).padStart(17, '0')}`;
}

test('attribue 30 jours une seule fois au compte puis l’applique à plusieurs serveurs', async () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1);
  const firstGuild = snowflake(1, '2');
  const secondGuild = snowflake(2, '2');
  const first = await claimFounderAccess(userId, firstGuild, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  const second = await claimFounderAccess(userId, secondGuild, { targetDatabase, now: '2026-08-27T10:00:00.000Z' });

  assert.equal(first.created, true);
  assert.equal(first.endsAt, '2026-09-25T10:00:00.000Z');
  assert.equal(second.created, false);
  assert.equal(second.endsAt, first.endsAt);
  assert.equal(second.claimed, 1);
  assert.equal((await getFounderProgramState(userId, firstGuild, { targetDatabase, now: '2026-08-28T10:00:00.000Z' })).guildActive, true);
  assert.equal((await getFounderProgramState(userId, secondGuild, { targetDatabase, now: '2026-08-28T10:00:00.000Z' })).guildActive, true);
});

test('réserve atomiquement les 100 places et refuse le 101e utilisateur', async () => {
  const targetDatabase = createDatabase();
  const guildId = snowflake(1, '3');
  for (let index = 1; index <= 100; index += 1) {
    await claimFounderAccess(snowflake(index, '4'), guildId, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  }
  const state = await getFounderProgramState(snowflake(1, '4'), guildId, { targetDatabase, now: '2026-08-27T10:00:00.000Z' });
  assert.equal(state.claimed, 100);
  assert.equal(state.remaining, 0);
  await assert.rejects(
    () => claimFounderAccess(snowflake(101, '4'), guildId, { targetDatabase, now: '2026-08-27T10:00:00.000Z' }),
    (error) => error.code === 'FOUNDER_FULL',
  );
});

test('expire sans renouvellement, conserve les réglages et empêche un second essai', async () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1, '5');
  const guildId = snowflake(1, '6');
  await claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-08-01T00:00:00.000Z' });
  const expired = await getFounderProgramState(userId, guildId, { targetDatabase, now: '2026-09-01T00:00:00.000Z' });

  assert.equal(expired.userExpired, true);
  assert.equal(expired.guildActive, false);
  await assert.rejects(
    () => claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-09-01T00:00:00.000Z' }),
    (error) => error.code === 'FOUNDER_EXPIRED',
  );
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM premium_user_guilds').get().total, 1);
});

test('applique les limites Free et Premium sans supprimer les ressources existantes', async () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1, '7');
  const guildId = snowflake(1, '8');
  await assert.rejects(() => assertPremiumLimit(guildId, 'socialSources', 1, { targetDatabase, skuIds: [] }), /FyxBot Free/);

  await claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  const premium = await getGuildPremiumState(guildId, { userId, targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' });
  assert.equal(premium.plan, 'premium');
  await assert.doesNotReject(() => assertPremiumLimit(guildId, 'socialSources', 9, { targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' }));
  await assert.rejects(() => assertPremiumLimit(guildId, 'socialSources', 10, { targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' }), /FyxBot Premium/);
});

test('lit et attribue les accès Fondateur via un magasin injecté', async () => {
  const calls = [];
  const state = {
    limit: 100, claimed: 1, remaining: 99, available: true,
    userClaimed: true, userActive: true, userExpired: false,
    linkedToGuild: true, guildActive: true, startsAt: '2026-08-26T10:00:00.000Z',
    endsAt: '2026-09-25T10:00:00.000Z',
  };
  const storage = {
    getFounderProgramState: async () => { calls.push('read'); return state; },
    claimFounderAccess: async () => { calls.push('claim'); return { created: false, ...state }; },
  };
  assert.equal((await getFounderProgramState(snowflake(1), snowflake(2), { storage })).guildActive, true);
  assert.equal((await claimFounderAccess(snowflake(1), snowflake(2), { storage })).created, false);
  assert.deepEqual(calls, ['read', 'claim']);
});

test('calcule le forfait depuis les deux magasins PostgreSQL injectés', async () => {
  const entitlementStorage = {
    getGuildPremiumEntitlementState: async () => ({ configured: true, active: true, detected: 1, test: false }),
    getUserPremiumEntitlementState: async () => ({ configured: true, active: false, detected: 0, test: false }),
  };
  const founderStorage = {
    getFounderProgramState: async () => ({
      available: false, userActive: false, guildActive: false,
    }),
    getManualPremiumState: async () => ({ userActive: false, guildActive: false, linkedToGuild: false, grant: null }),
  };
  const state = await getGuildPremiumState(snowflake(1), {
    userId: snowflake(2), entitlementStorage, founderStorage,
  });
  assert.equal(state.plan, 'premium');
  assert.equal(state.sourceOfTruth, 'discord-entitlements');
});
