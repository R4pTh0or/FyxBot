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
    CREATE TABLE premium_user_guilds (user_id TEXT NOT NULL, guild_id TEXT NOT NULL, linked_at TEXT NOT NULL, PRIMARY KEY (user_id, guild_id));
    CREATE TABLE premium_entitlements (entitlement_id TEXT PRIMARY KEY, sku_id TEXT NOT NULL, user_id TEXT, guild_id TEXT, starts_at TEXT, ends_at TEXT, deleted INTEGER NOT NULL DEFAULT 0, test INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL);
  `);
  return targetDatabase;
}

function snowflake(index, prefix = '1') {
  return `${prefix}${String(index).padStart(17, '0')}`;
}

test('attribue 30 jours une seule fois au compte puis l’applique à plusieurs serveurs', () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1);
  const firstGuild = snowflake(1, '2');
  const secondGuild = snowflake(2, '2');
  const first = claimFounderAccess(userId, firstGuild, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  const second = claimFounderAccess(userId, secondGuild, { targetDatabase, now: '2026-08-27T10:00:00.000Z' });

  assert.equal(first.created, true);
  assert.equal(first.endsAt, '2026-09-25T10:00:00.000Z');
  assert.equal(second.created, false);
  assert.equal(second.endsAt, first.endsAt);
  assert.equal(second.claimed, 1);
  assert.equal(getFounderProgramState(userId, firstGuild, { targetDatabase, now: '2026-08-28T10:00:00.000Z' }).guildActive, true);
  assert.equal(getFounderProgramState(userId, secondGuild, { targetDatabase, now: '2026-08-28T10:00:00.000Z' }).guildActive, true);
});

test('réserve atomiquement les 100 places et refuse le 101e utilisateur', () => {
  const targetDatabase = createDatabase();
  const guildId = snowflake(1, '3');
  for (let index = 1; index <= 100; index += 1) {
    claimFounderAccess(snowflake(index, '4'), guildId, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  }
  const state = getFounderProgramState(snowflake(1, '4'), guildId, { targetDatabase, now: '2026-08-27T10:00:00.000Z' });
  assert.equal(state.claimed, 100);
  assert.equal(state.remaining, 0);
  assert.throws(
    () => claimFounderAccess(snowflake(101, '4'), guildId, { targetDatabase, now: '2026-08-27T10:00:00.000Z' }),
    (error) => error.code === 'FOUNDER_FULL',
  );
});

test('expire sans renouvellement, conserve les réglages et empêche un second essai', () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1, '5');
  const guildId = snowflake(1, '6');
  claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-08-01T00:00:00.000Z' });
  const expired = getFounderProgramState(userId, guildId, { targetDatabase, now: '2026-09-01T00:00:00.000Z' });

  assert.equal(expired.userExpired, true);
  assert.equal(expired.guildActive, false);
  assert.throws(
    () => claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-09-01T00:00:00.000Z' }),
    (error) => error.code === 'FOUNDER_EXPIRED',
  );
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM premium_user_guilds').get().total, 1);
});

test('applique les limites Free et Premium sans supprimer les ressources existantes', () => {
  const targetDatabase = createDatabase();
  const userId = snowflake(1, '7');
  const guildId = snowflake(1, '8');
  assert.throws(() => assertPremiumLimit(guildId, 'socialSources', 1, { targetDatabase, skuIds: [] }), /FyxBot Free/);

  claimFounderAccess(userId, guildId, { targetDatabase, now: '2026-08-26T10:00:00.000Z' });
  const premium = getGuildPremiumState(guildId, { userId, targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' });
  assert.equal(premium.plan, 'premium');
  assert.doesNotThrow(() => assertPremiumLimit(guildId, 'socialSources', 9, { targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' }));
  assert.throws(() => assertPremiumLimit(guildId, 'socialSources', 10, { targetDatabase, skuIds: [], now: '2026-08-27T10:00:00.000Z' }), /FyxBot Premium/);
});
