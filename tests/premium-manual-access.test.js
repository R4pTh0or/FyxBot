const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  getManualPremiumState,
  grantManualPremiumAccess,
  linkManualPremiumAccess,
  listManualPremiumGrants,
  revokeManualPremiumAccess,
} = require('../src/services/premiumManualAccess');
const { getGuildPremiumState } = require('../src/services/premiumPlans');

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE premium_manual_grants (
      grant_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, display_name TEXT NOT NULL,
      reason TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT, granted_by TEXT NOT NULL,
      revoked_at TEXT, revoked_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE premium_user_guilds (
      user_id TEXT NOT NULL, guild_id TEXT NOT NULL, linked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    );
    CREATE TABLE premium_founder_trials (
      user_id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, claimed_at TEXT NOT NULL
    );
    CREATE TABLE premium_entitlements (
      entitlement_id TEXT PRIMARY KEY, sku_id TEXT NOT NULL, user_id TEXT, guild_id TEXT,
      starts_at TEXT, ends_at TEXT, deleted INTEGER NOT NULL DEFAULT 0,
      test INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL
    );
  `);
  return database;
}

const USER_ID = '111111111111111111';
const OWNER_ID = '222222222222222222';
const GUILD_A = '333333333333333333';
const GUILD_B = '444444444444444444';
const NOW = '2026-09-20T10:00:00.000Z';

test('accorde un accès Premium offert traçable puis l’applique à plusieurs serveurs', async () => {
  const targetDatabase = createDatabase();
  const grant = await grantManualPremiumAccess({
    userId: USER_ID,
    displayName: 'Partenaire Test',
    reason: 'Partenaire lancement',
    durationDays: 90,
    grantedBy: OWNER_ID,
  }, { targetDatabase, now: NOW });

  assert.equal(grant.active, true);
  assert.equal(grant.endsAt, '2026-12-19T10:00:00.000Z');
  assert.equal(grant.grantedBy, OWNER_ID);
  assert.equal((await getManualPremiumState(USER_ID, GUILD_A, { targetDatabase, now: NOW })).linkedToGuild, false);

  await linkManualPremiumAccess(USER_ID, GUILD_A, { targetDatabase, now: NOW });
  await linkManualPremiumAccess(USER_ID, GUILD_B, { targetDatabase, now: NOW });
  assert.equal((await getManualPremiumState(USER_ID, GUILD_A, { targetDatabase, now: NOW })).guildActive, true);
  assert.equal((await getManualPremiumState(null, GUILD_B, { targetDatabase, now: NOW })).guildActive, true);

  const premium = await getGuildPremiumState(GUILD_A, {
    userId: USER_ID,
    targetDatabase,
    skuIds: [],
    now: NOW,
  });
  assert.equal(premium.plan, 'premium');
  assert.equal(premium.sourceOfTruth, 'manual-access');
  assert.equal(premium.manual.grant.reason, 'Partenaire lancement');
});

test('conserve l’historique après révocation et retire immédiatement les limites Premium', async () => {
  const targetDatabase = createDatabase();
  await grantManualPremiumAccess({
    userId: USER_ID,
    displayName: 'Partenaire Test',
    reason: 'Accès équipe',
    durationDays: 0,
    grantedBy: OWNER_ID,
  }, { targetDatabase, now: NOW });
  await linkManualPremiumAccess(USER_ID, GUILD_A, { targetDatabase, now: NOW });
  await revokeManualPremiumAccess(USER_ID, OWNER_ID, {
    targetDatabase,
    now: '2026-09-21T10:00:00.000Z',
  });

  const state = await getManualPremiumState(USER_ID, GUILD_A, {
    targetDatabase,
    now: '2026-09-21T10:01:00.000Z',
  });
  assert.equal(state.userActive, false);
  assert.equal(state.guildActive, false);
  const history = await listManualPremiumGrants({
    targetDatabase,
    now: '2026-09-21T10:01:00.000Z',
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].active, false);
  assert.equal(history[0].revokedBy, OWNER_ID);
  assert.equal(history[0].reason, 'Accès équipe');

  const premium = await getGuildPremiumState(GUILD_A, {
    userId: USER_ID,
    targetDatabase,
    skuIds: [],
    now: '2026-09-21T10:01:00.000Z',
  });
  assert.equal(premium.plan, 'free');
  assert.equal(premium.sourceOfTruth, 'free');
});

test('refuse les doublons actifs, les identifiants invalides et les durées excessives', async () => {
  const targetDatabase = createDatabase();
  const input = {
    userId: USER_ID,
    displayName: 'Partenaire Test',
    reason: 'Partenaire FyxBot',
    durationDays: 30,
    grantedBy: OWNER_ID,
  };
  await grantManualPremiumAccess(input, { targetDatabase, now: NOW });
  await assert.rejects(
    () => grantManualPremiumAccess(input, { targetDatabase, now: NOW }),
    (error) => error.code === 'MANUAL_GRANT_ACTIVE',
  );
  await assert.rejects(
    () => grantManualPremiumAccess({ ...input, userId: 'invalide' }, { targetDatabase, now: NOW }),
    (error) => error.code === 'INVALID_ID',
  );
  await assert.rejects(
    () => grantManualPremiumAccess({ ...input, userId: GUILD_B, durationDays: 3651 }, { targetDatabase, now: NOW }),
    (error) => error.code === 'INVALID_DURATION',
  );
});
