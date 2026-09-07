const { database } = require('./database');
const { STEP_DEFINITIONS } = require('../services/onboardingProgress');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_THRESHOLD = 4;

function activeDatabase(targetDatabase) {
  return targetDatabase || database;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function ensureActivationTracking(guildId, { targetDatabase, now = new Date() } = {}) {
  if (!guildId) return null;
  const store = activeDatabase(targetDatabase);
  const observedAt = asDate(now);
  const nowIso = observedAt.toISOString();
  const installation = store.prepare('SELECT first_seen_at AS firstSeenAt FROM guild_installations WHERE guild_id = ?').get(guildId);
  const firstSeen = installation?.firstSeenAt ? new Date(installation.firstSeenAt) : null;
  const baseline = !firstSeen || Number.isNaN(firstSeen.getTime()) || observedAt.getTime() - firstSeen.getTime() >= DAY_MS ? 1 : 0;
  store.prepare(`INSERT OR IGNORE INTO guild_activation_progress
    (guild_id, tracking_started_at, last_observed_at, completed_steps, step_keys, activated_at, baseline)
    VALUES (?, ?, NULL, 0, '[]', NULL, ?)`)
    .run(guildId, nowIso, baseline);
  return store.prepare('SELECT * FROM guild_activation_progress WHERE guild_id = ?').get(guildId);
}

function recordActivationProgress(guildId, progress, { targetDatabase, now = new Date() } = {}) {
  const store = activeDatabase(targetDatabase);
  ensureActivationTracking(guildId, { targetDatabase: store, now });
  const observedAt = asDate(now).toISOString();
  const stepKeys = (progress?.steps || []).filter((step) => step.complete).map((step) => step.key);
  const completedSteps = stepKeys.length;
  store.prepare(`UPDATE guild_activation_progress SET
    last_observed_at = ?, completed_steps = ?, step_keys = ?,
    activated_at = CASE WHEN activated_at IS NULL AND ? >= ? THEN ? ELSE activated_at END
    WHERE guild_id = ?`)
    .run(observedAt, completedSteps, JSON.stringify(stepKeys), completedSteps, ACTIVATION_THRESHOLD, observedAt, guildId);
  return store.prepare('SELECT * FROM guild_activation_progress WHERE guild_id = ?').get(guildId);
}

function getActivationStats(guildIds, { targetDatabase, now = new Date() } = {}) {
  const store = activeDatabase(targetDatabase);
  const ids = [...new Set([...guildIds].filter(Boolean))];
  const allowed = new Set(ids);
  const rows = store.prepare(`SELECT guild_id AS guildId, tracking_started_at AS trackingStartedAt,
    last_observed_at AS lastObservedAt, completed_steps AS completedSteps, step_keys AS stepKeys,
    activated_at AS activatedAt, baseline FROM guild_activation_progress`).all()
    .filter((row) => allowed.has(row.guildId))
    .map((row) => {
      let stepKeys = [];
      try { stepKeys = JSON.parse(row.stepKeys || '[]'); } catch { /* Une ligne ancienne invalide compte comme non configurée. */ }
      return { ...row, stepKeys: Array.isArray(stepKeys) ? stepKeys : [] };
    });
  const installationRows = store.prepare('SELECT guild_id AS guildId, first_seen_at AS firstSeenAt FROM guild_installations WHERE removed_at IS NULL').all();
  const installations = new Map(installationRows.map((row) => [row.guildId, row]));
  const currentActivatedGuilds = rows.filter((row) => row.completedSteps >= ACTIVATION_THRESHOLD).length;
  const candidateRows = rows.filter((row) => row.baseline === 0);
  const eligibleRows = candidateRows.filter((row) => {
    const firstSeen = new Date(installations.get(row.guildId)?.firstSeenAt || row.trackingStartedAt);
    if (Number.isNaN(firstSeen.getTime())) return false;
    const activatedAt = row.activatedAt ? new Date(row.activatedAt) : null;
    const activatedWithinWindow = activatedAt
      && !Number.isNaN(activatedAt.getTime())
      && activatedAt.getTime() >= firstSeen.getTime()
      && activatedAt.getTime() - firstSeen.getTime() <= DAY_MS;
    return activatedWithinWindow || asDate(now).getTime() - firstSeen.getTime() >= DAY_MS;
  });
  const activatedWithin24h = eligibleRows.filter((row) => {
    if (!row.activatedAt) return false;
    const firstSeen = new Date(installations.get(row.guildId)?.firstSeenAt || row.trackingStartedAt);
    const activatedAt = new Date(row.activatedAt);
    return activatedAt.getTime() - firstSeen.getTime() <= DAY_MS;
  }).length;
  const sinceDate = new Date(asDate(now).getTime() - 29 * DAY_MS);
  const stalledBefore = new Date(asDate(now).getTime() - 7 * DAY_MS);
  const sinceDay = sinceDate.toISOString().slice(0, 10);
  const activeIds = new Set(store.prepare('SELECT DISTINCT guild_id AS guildId FROM command_usage WHERE day >= ?').all(sinceDay)
    .map((row) => row.guildId).filter((guildId) => allowed.has(guildId)));
  for (const row of rows) {
    if (row.lastObservedAt && new Date(row.lastObservedAt) >= sinceDate) activeIds.add(row.guildId);
  }
  const steps = STEP_DEFINITIONS.map((step) => {
    const completedGuilds = rows.filter((row) => row.stepKeys.includes(step.key)).length;
    return { key: step.key, title: step.title, completedGuilds, rate: percent(completedGuilds, ids.length) };
  });
  const stalledGuilds7d = rows.filter((row) => row.completedSteps < ACTIVATION_THRESHOLD
    && row.lastObservedAt
    && new Date(row.lastObservedAt) < stalledBefore).length;
  const completionDistribution = [
    { key: 'starting', title: '0 à 3 étapes', guilds: rows.filter((row) => row.completedSteps < ACTIVATION_THRESHOLD).length },
    { key: 'activated', title: '4 à 6 étapes', guilds: rows.filter((row) => row.completedSteps >= ACTIVATION_THRESHOLD && row.completedSteps < STEP_DEFINITIONS.length).length },
    { key: 'complete', title: '7 étapes', guilds: rows.filter((row) => row.completedSteps >= STEP_DEFINITIONS.length).length },
  ];
  return {
    threshold: ACTIVATION_THRESHOLD,
    totalSteps: STEP_DEFINITIONS.length,
    trackedGuilds: rows.length,
    currentActivatedGuilds,
    activationRate: percent(currentActivatedGuilds, ids.length),
    eligibleNewGuilds: eligibleRows.length,
    pendingNewGuilds: candidateRows.length - eligibleRows.length,
    activatedWithin24h,
    activation24hRate: eligibleRows.length ? percent(activatedWithin24h, eligibleRows.length) : null,
    activeGuilds30d: activeIds.size,
    stalledGuilds7d,
    averageCompletedSteps: rows.length
      ? Math.round((rows.reduce((total, row) => total + row.completedSteps, 0) / rows.length) * 10) / 10
      : 0,
    steps,
    completionDistribution,
    guilds: rows.map((row) => ({
      guildId: row.guildId,
      completedSteps: row.completedSteps,
      activated: row.completedSteps >= ACTIVATION_THRESHOLD,
      lastObservedAt: row.lastObservedAt,
    })),
  };
}

module.exports = {
  ACTIVATION_THRESHOLD,
  ensureActivationTracking,
  getActivationStats,
  recordActivationProgress,
};
