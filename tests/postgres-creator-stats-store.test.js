const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresCreatorStatsStore } = require('../src/database/postgresCreatorStatsStore');
const { createPostgresActivityStore } = require('../src/database/postgresActivityStore');
const { recordGuild, markGuildRemoved, getCreatorStats } = require('../src/database/creatorStatsStore');
const { ensureActivationTracking, recordActivationProgress, getActivationStats } = require('../src/database/activationStore');

function completed(keys) {
  const all = ['structure', 'logs', 'welcome', 'security', 'rules', 'tickets', 'community'];
  return { steps: all.map((key) => ({ key, complete: keys.includes(key) })) };
}

test('préserve les cohortes, les statistiques et l’isolation des serveurs sur PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const store = createPostgresCreatorStatsStore(database);
    const activity = createPostgresActivityStore(database);
    const first = new Date('2026-08-24T10:00:00.000Z');
    await recordGuild({ id: 'new', name: 'Nouveau', memberCount: 20 }, store, { now: first });
    await database.query(`INSERT INTO fyxbot.guild_installations
      (guild_id, guild_name, member_count, first_seen_at, last_seen_at)
      VALUES ($1, $2, $3, $4, $5)`, ['old', 'Ancien', 10,
      '2026-08-01T10:00:00.000Z', first.toISOString()]);
    await ensureActivationTracking('old', { now: first, storage: store });
    await recordActivationProgress('new', completed(['structure', 'logs', 'welcome', 'security']),
      { now: '2026-08-24T12:30:00.000Z', storage: store });
    await store.recordActivationProgress('old', completed(['structure', 'logs', 'welcome', 'security', 'rules']),
      { now: '2026-08-24T12:10:00.000Z' });
    const activation = await getActivationStats(['old', 'new'], { now: '2026-08-24T13:00:00.000Z', storage: store });
    assert.equal(activation.currentActivatedGuilds, 2);
    assert.equal(activation.activationRate, 100);
    assert.equal(activation.eligibleNewGuilds, 1);
    assert.equal(activation.activatedWithin24h, 1);
    assert.equal(activation.activeGuilds30d, 2);
    assert.equal(activation.steps.find((step) => step.key === 'rules').completedGuilds, 1);
    assert.equal(activation.guilds.length, 2);

    await activity.recordCommandUsage('command-only', 'ping', true);
    const commandOnly = await store.getActivationStats(['command-only'], { now: new Date() });
    assert.equal(commandOnly.activeGuilds30d, 1);
    assert.equal(commandOnly.trackedGuilds, 0);

    await markGuildRemoved({ id: 'old', name: 'Ancien', memberCount: 10 }, store);
    const summary = await getCreatorStats([{ id: 'new', name: 'Nouveau', memberCount: 20 }], store);
    assert.equal(summary.guildCount, 1);
    assert.equal(summary.memberCount, 20);
    assert.equal(summary.allTime, 2);
    assert.equal(summary.removed, 1);
    assert.equal(summary.installations.length, 1);
    assert.equal(summary.installations[0].guildId, 'new');
    assert.equal(summary.history.length, 1);
  } finally {
    await database.close();
  }
});

test('attend 24 heures avant de classer une nouvelle installation incomplète', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const store = createPostgresCreatorStatsStore(database);
    await store.recordGuild({ id: 'pending', name: 'Récent', memberCount: 5 },
      { now: '2026-08-24T10:00:00.000Z' });
    await store.recordActivationProgress('pending', completed(['structure']),
      { now: '2026-08-24T11:00:00.000Z' });
    const pending = await store.getActivationStats(['pending'], { now: '2026-08-24T20:00:00.000Z' });
    assert.equal(pending.pendingNewGuilds, 1);
    assert.equal(pending.eligibleNewGuilds, 0);
    const eligible = await store.getActivationStats(['pending'], { now: '2026-08-25T11:00:00.000Z' });
    assert.equal(eligible.pendingNewGuilds, 0);
    assert.equal(eligible.eligibleNewGuilds, 1);
    assert.equal(eligible.activation24hRate, 0);
  } finally {
    await database.close();
  }
});

test('refuse une connexion absente et un schéma arbitraire', () => {
  assert.throws(() => createPostgresCreatorStatsStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresCreatorStatsStore({ query() {} }, { schema: 'public;DROP' }), /schéma PostgreSQL invalide/);
});
