const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresPremiumEntitlementStore } = require('../src/database/postgresPremiumEntitlementStore');

const SKU_ID = '111111111111111111';
const GUILD_ID = '222222222222222222';
const USER_ID = '888888888888888888';

function entitlement(overrides = {}) {
  return {
    id: '333333333333333333', skuId: SKU_ID, guildId: GUILD_ID,
    startsAt: new Date('2026-08-25T10:00:00.000Z'), endsAt: null,
    deleted: false, test: true, ...overrides,
  };
}

async function withPostgres(operation) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
    };
    await operation(createPostgresPremiumEntitlementStore(pool), database);
  } finally { await database.close(); }
}

test('active uniquement les abonnements du bon bénéficiaire et du bon produit', async () => {
  await withPostgres(async (store) => {
    await store.upsertPremiumEntitlement(entitlement(), { now: '2026-08-25T10:01:00.000Z' });
    assert.deepEqual(await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' }),
      { configured: true, active: true, detected: 1, test: true });
    assert.equal((await store.getGuildPremiumEntitlementState(USER_ID, { skuIds: [SKU_ID] })).active, false);
    assert.equal((await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [USER_ID] })).active, false);
    await store.upsertPremiumEntitlement(entitlement({ id: '444444444444444444', guildId: null, userId: USER_ID }));
    assert.equal((await store.getUserPremiumEntitlementState(USER_ID, { skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' })).active, true);
    assert.equal((await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [] })).configured, false);
  });
});

test('retire les droits expirés, supprimés et absents de la synchronisation Discord', async () => {
  await withPostgres(async (store, database) => {
    const ended = entitlement({ endsAt: new Date('2026-08-25T11:00:00.000Z') });
    await store.upsertPremiumEntitlement(ended);
    assert.equal((await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' })).active, false);
    await store.markPremiumEntitlementDeleted(ended);
    assert.equal((await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [SKU_ID], now: '2026-08-25T10:30:00.000Z' })).active, false);
    const current = entitlement({ id: '555555555555555555', test: false, endsAt: null });
    const result = await store.syncPremiumEntitlements({ application: { entitlements: {
      fetch: async () => new Map([[current.id, current]]),
    } } }, { skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' });
    assert.deepEqual(result, { configured: true, synced: 1 });
    const rows = await database.query('SELECT entitlement_id, deleted FROM fyxbot.premium_entitlements ORDER BY entitlement_id');
    assert.deepEqual(rows.rows.map((row) => row.deleted), [1, 0]);
    assert.equal((await store.getGuildPremiumEntitlementState(GUILD_ID, { skuIds: [SKU_ID], now: '2026-08-25T12:00:00.000Z' })).active, true);
  });
});

test('une pagination Discord échouée ne modifie aucun droit existant', async () => {
  await withPostgres(async (store, database) => {
    await store.upsertPremiumEntitlement(entitlement());
    const fullPage = new Map(Array.from({ length: 100 }, (_, index) => {
      const id = String(400000000000000000n + BigInt(index));
      return [id, entitlement({ id })];
    }));
    await assert.rejects(() => store.syncPremiumEntitlements({ application: { entitlements: {
      fetch: async ({ after }) => {
        if (after) throw new Error('Discord indisponible');
        return fullPage;
      },
    } } }, { skuIds: [SKU_ID] }), /Discord indisponible/);
    const rows = await database.query('SELECT COUNT(*)::int AS total FROM fyxbot.premium_entitlements');
    assert.equal(rows.rows[0].total, 1);
  });
});

test('rejette un droit mal formé et une connexion invalide', async () => {
  assert.throws(() => createPostgresPremiumEntitlementStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresPremiumEntitlementStore({ query() {}, connect() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
  await withPostgres(async (store) => {
    await assert.rejects(() => store.upsertPremiumEntitlement(entitlement({ skuId: 'invalid' })), /Droit Premium/);
    assert.deepEqual(await store.syncPremiumEntitlements({}, { skuIds: [] }), { configured: false, synced: 0 });
  });
});
