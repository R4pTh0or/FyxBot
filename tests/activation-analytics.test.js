const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  ensureActivationTracking,
  getActivationStats,
  recordActivationProgress,
} = require('../src/database/activationStore');

function createDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`
    CREATE TABLE guild_installations (
      guild_id TEXT PRIMARY KEY, guild_name TEXT, member_count INTEGER,
      first_seen_at TEXT, last_seen_at TEXT, removed_at TEXT
    );
    CREATE TABLE command_usage (
      day TEXT, guild_id TEXT, command_name TEXT,
      success_count INTEGER, failure_count INTEGER
    );
    CREATE TABLE guild_activation_progress (
      guild_id TEXT PRIMARY KEY, tracking_started_at TEXT NOT NULL,
      last_observed_at TEXT, completed_steps INTEGER NOT NULL DEFAULT 0,
      step_keys TEXT NOT NULL DEFAULT '[]', activated_at TEXT, baseline INTEGER NOT NULL DEFAULT 0
    );
  `);
  return targetDatabase;
}

function progress(keys) {
  const all = ['structure', 'logs', 'welcome', 'security', 'rules', 'tickets', 'community'];
  return { steps: all.map((key) => ({ key, complete: keys.includes(key) })) };
}

test('mesure l’activation sans attribuer rétroactivement la cohorte 24 heures', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('old', 'Ancien', 10, '2026-08-01T10:00:00.000Z', '2026-08-24T10:00:00.000Z', NULL)").run();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('new', 'Nouveau', 20, '2026-08-24T10:00:00.000Z', '2026-08-24T10:00:00.000Z', NULL)").run();
  ensureActivationTracking('old', { targetDatabase, now: '2026-08-24T12:00:00.000Z' });
  ensureActivationTracking('new', { targetDatabase, now: '2026-08-24T12:00:00.000Z' });
  recordActivationProgress('old', progress(['structure', 'logs', 'welcome', 'security', 'rules']), {
    targetDatabase,
    now: '2026-08-24T12:10:00.000Z',
  });
  recordActivationProgress('new', progress(['structure', 'logs', 'welcome', 'security']), {
    targetDatabase,
    now: '2026-08-24T12:30:00.000Z',
  });

  const stats = getActivationStats(['old', 'new'], { targetDatabase, now: '2026-08-24T13:00:00.000Z' });
  assert.equal(stats.currentActivatedGuilds, 2);
  assert.equal(stats.activationRate, 100);
  assert.equal(stats.eligibleNewGuilds, 1);
  assert.equal(stats.activatedWithin24h, 1);
  assert.equal(stats.activation24hRate, 100);
  assert.equal(stats.activeGuilds30d, 2);
  assert.equal(stats.stalledGuilds7d, 0);
  assert.deepEqual(stats.completionDistribution.map((bucket) => bucket.guilds), [0, 2, 0]);
  assert.equal(stats.steps.find((step) => step.key === 'rules').completedGuilds, 1);
  assert.deepEqual(JSON.parse(targetDatabase.prepare("SELECT step_keys FROM guild_activation_progress WHERE guild_id = 'new'").get().step_keys), [
    'structure', 'logs', 'welcome', 'security',
  ]);
});

test('compte aussi un serveur actif par commande sans stocker d’utilisateur', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('command-only', 'Commande', 5, '2026-08-24T10:00:00.000Z', '2026-08-24T10:00:00.000Z', NULL)").run();
  ensureActivationTracking('command-only', { targetDatabase, now: '2026-08-24T10:00:00.000Z' });
  targetDatabase.prepare("INSERT INTO command_usage VALUES ('2026-08-24', 'command-only', 'ping', 1, 0)").run();
  const stats = getActivationStats(['command-only'], { targetDatabase, now: '2026-08-24T13:00:00.000Z' });
  assert.equal(stats.activeGuilds30d, 1);
  assert.equal(stats.currentActivatedGuilds, 0);
});

test('attend la fin des 24 heures avant de compter une installation non activée comme un échec', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('pending', 'Récent', 5, '2026-08-24T10:00:00.000Z', '2026-08-24T10:00:00.000Z', NULL)").run();
  ensureActivationTracking('pending', { targetDatabase, now: '2026-08-24T10:05:00.000Z' });
  recordActivationProgress('pending', progress(['structure']), {
    targetDatabase,
    now: '2026-08-24T11:00:00.000Z',
  });

  const pending = getActivationStats(['pending'], { targetDatabase, now: '2026-08-24T20:00:00.000Z' });
  assert.equal(pending.eligibleNewGuilds, 0);
  assert.equal(pending.pendingNewGuilds, 1);
  assert.equal(pending.activation24hRate, null);

  const completedWindow = getActivationStats(['pending'], { targetDatabase, now: '2026-08-25T11:00:00.000Z' });
  assert.equal(completedWindow.eligibleNewGuilds, 1);
  assert.equal(completedWindow.pendingNewGuilds, 0);
  assert.equal(completedWindow.activation24hRate, 0);
});

test('classe comme historique un serveur observé pour la première fois après 24 heures', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('boundary', 'Historique', 5, '2026-08-24T10:00:00.000Z', '2026-08-25T10:00:00.000Z', NULL)").run();
  const row = ensureActivationTracking('boundary', { targetDatabase, now: '2026-08-25T10:00:00.000Z' });
  assert.equal(row.baseline, 1);
});

test('identifie les parcours incomplets sans activité depuis sept jours', () => {
  const targetDatabase = createDatabase();
  targetDatabase.prepare("INSERT INTO guild_installations VALUES ('stalled', 'En pause', 5, '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z', NULL)").run();
  ensureActivationTracking('stalled', { targetDatabase, now: '2026-08-02T10:00:00.000Z' });
  recordActivationProgress('stalled', progress(['structure']), { targetDatabase, now: '2026-08-02T11:00:00.000Z' });
  const stats = getActivationStats(['stalled'], { targetDatabase, now: '2026-08-20T12:00:00.000Z' });
  assert.equal(stats.stalledGuilds7d, 1);
  assert.deepEqual(stats.completionDistribution.map((bucket) => bucket.guilds), [1, 0, 0]);
});
