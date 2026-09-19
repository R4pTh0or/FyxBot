const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  configuredPremiumSkuIds,
  getGuildPremiumEntitlementState,
  getUserPremiumEntitlementState,
  markPremiumEntitlementDeleted,
  syncPremiumEntitlements,
  upsertPremiumEntitlement,
} = require('../src/services/premiumEntitlements');

const SKU_ID = '111111111111111111';
const GUILD_ID = '222222222222222222';

function createDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`CREATE TABLE premium_entitlements (
    entitlement_id TEXT PRIMARY KEY, sku_id TEXT NOT NULL, user_id TEXT, guild_id TEXT,
    starts_at TEXT, ends_at TEXT, deleted INTEGER NOT NULL DEFAULT 0,
    test INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL
  )`);
  return targetDatabase;
}

function entitlement(overrides = {}) {
  return {
    id: '333333333333333333',
    skuId: SKU_ID,
    guildId: GUILD_ID,
    startsAt: new Date('2026-08-25T10:00:00.000Z'),
    endsAt: null,
    deleted: false,
    test: true,
    ...overrides,
  };
}

test('normalise les identifiants de produits Premium sans accepter une valeur invalide', () => {
  assert.deepEqual(configuredPremiumSkuIds({ FYXBOT_PREMIUM_SKU_IDS: `${SKU_ID}, invalide,${SKU_ID}` }), [SKU_ID]);
  assert.deepEqual(configuredPremiumSkuIds({}), []);
});

test('utilise uniquement un droit Discord actif du serveur et du produit configurés', async () => {
  const targetDatabase = createDatabase();
  await upsertPremiumEntitlement(entitlement(), { targetDatabase, now: '2026-08-25T10:01:00.000Z' });
  const active = await getGuildPremiumEntitlementState(GUILD_ID, {
    targetDatabase,
    skuIds: [SKU_ID],
    now: '2026-08-25T12:00:00.000Z',
  });
  assert.deepEqual(active, { configured: true, active: true, detected: 1, test: true });
  assert.equal((await getGuildPremiumEntitlementState('444444444444444444', { targetDatabase, skuIds: [SKU_ID] })).active, false);
  assert.equal((await getGuildPremiumEntitlementState(GUILD_ID, { targetDatabase, skuIds: ['555555555555555555'] })).active, false);
});

test('reconnaît un abonnement utilisateur Discord sur tous ses serveurs', async () => {
  const targetDatabase = createDatabase();
  const userId = '888888888888888888';
  await upsertPremiumEntitlement(entitlement({ guildId: null, userId }), { targetDatabase, now: '2026-08-25T10:01:00.000Z' });
  assert.equal((await getUserPremiumEntitlementState(userId, { targetDatabase, skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' })).active, true);
  assert.equal((await getUserPremiumEntitlementState('999999999999999999', { targetDatabase, skuIds: [SKU_ID] })).active, false);
});

test('retire l’accès à expiration, suppression ou remboursement de manière idempotente', async () => {
  const targetDatabase = createDatabase();
  const ended = entitlement({ endsAt: new Date('2026-08-25T11:00:00.000Z') });
  await upsertPremiumEntitlement(ended, { targetDatabase, now: '2026-08-25T10:01:00.000Z' });
  assert.equal((await getGuildPremiumEntitlementState(GUILD_ID, { targetDatabase, skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' })).active, false);
  await markPremiumEntitlementDeleted(ended, { targetDatabase, now: '2026-08-25T12:01:00.000Z' });
  await markPremiumEntitlementDeleted(ended, { targetDatabase, now: '2026-08-25T12:02:00.000Z' });
  const row = targetDatabase.prepare('SELECT deleted, COUNT(*) OVER () AS total FROM premium_entitlements').get();
  assert.equal(row.deleted, 1);
  assert.equal(row.total, 1);
});

test('resynchronise la base depuis l’API Discord et invalide un ancien droit absent', async () => {
  const targetDatabase = createDatabase();
  await upsertPremiumEntitlement(entitlement({ id: '666666666666666666' }), { targetDatabase });
  const current = entitlement({ id: '777777777777777777', test: false });
  const client = {
    application: {
      entitlements: {
        fetch: async (options) => {
          assert.deepEqual(options.skus, [SKU_ID]);
          return new Map([[current.id, current]]);
        },
      },
    },
  };
  const result = await syncPremiumEntitlements(client, {
    targetDatabase,
    skuIds: [SKU_ID],
    now: '2026-08-25T12:00:00.000Z',
  });
  assert.deepEqual(result, { configured: true, synced: 1 });
  assert.equal(targetDatabase.prepare("SELECT deleted FROM premium_entitlements WHERE entitlement_id = '666666666666666666'").get().deleted, 1);
  assert.equal(targetDatabase.prepare("SELECT deleted FROM premium_entitlements WHERE entitlement_id = '777777777777777777'").get().deleted, 0);
});

test('ne contacte pas Discord tant qu’aucun produit Premium n’est configuré', async () => {
  const result = await syncPremiumEntitlements({}, { targetDatabase: createDatabase(), skuIds: [] });
  assert.deepEqual(result, { configured: false, synced: 0 });
});

test('délègue tous les droits Premium au magasin PostgreSQL injecté', async () => {
  const calls = [];
  const storage = {
    upsertPremiumEntitlement: async (_entitlement, options) => {
      calls.push(options.deleted ? 'deleted' : 'upsert');
      return { entitlement_id: entitlement().id };
    },
    getGuildPremiumEntitlementState: async () => ({ configured: true, active: true, detected: 1, test: false }),
    getUserPremiumEntitlementState: async () => ({ configured: true, active: false, detected: 0, test: false }),
    syncPremiumEntitlements: async () => ({ configured: true, synced: 1 }),
  };
  await upsertPremiumEntitlement(entitlement(), { storage });
  await markPremiumEntitlementDeleted(entitlement(), { storage });
  assert.equal((await getGuildPremiumEntitlementState(GUILD_ID, { storage })).active, true);
  assert.equal((await getUserPremiumEntitlementState(GUILD_ID, { storage })).active, false);
  assert.deepEqual(await syncPremiumEntitlements({}, { storage }), { configured: true, synced: 1 });
  assert.deepEqual(calls, ['upsert', 'deleted']);
});
