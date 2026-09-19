const { STEP_DEFINITIONS } = require('../services/onboardingProgress');
const { createPostgresActivityStore } = require('./postgresActivityStore');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_THRESHOLD = 4;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function createPostgresCreatorStatsStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const installations = `"${schema}"."guild_installations"`;
  const metrics = `"${schema}"."creator_metrics"`;
  const progress = `"${schema}"."guild_activation_progress"`;
  const usage = `"${schema}"."command_usage"`;
  const activity = createPostgresActivityStore(pool, { schema });

  async function ensureActivationTracking(guildId, { now = new Date() } = {}) {
    if (!guildId) return null;
    const observedAt = asDate(now);
    const installation = await pool.query(`SELECT first_seen_at AS "firstSeenAt"
      FROM ${installations} WHERE guild_id = $1`, [guildId]);
    const firstSeen = installation.rows[0]?.firstSeenAt ? new Date(installation.rows[0].firstSeenAt) : null;
    const baseline = !firstSeen || Number.isNaN(firstSeen.getTime())
      || observedAt.getTime() - firstSeen.getTime() >= DAY_MS ? 1 : 0;
    await pool.query(`INSERT INTO ${progress}
      (guild_id, tracking_started_at, last_observed_at, completed_steps, step_keys, activated_at, baseline)
      VALUES ($1, $2, NULL, 0, '[]', NULL, $3) ON CONFLICT (guild_id) DO NOTHING`,
    [guildId, observedAt.toISOString(), baseline]);
    const result = await pool.query(`SELECT * FROM ${progress} WHERE guild_id = $1`, [guildId]);
    return result.rows[0] || null;
  }

  async function recordActivationProgress(guildId, completed, { now = new Date() } = {}) {
    await ensureActivationTracking(guildId, { now });
    const observedAt = asDate(now).toISOString();
    const stepKeys = (completed?.steps || []).filter((step) => step.complete).map((step) => step.key);
    const result = await pool.query(`UPDATE ${progress} SET
      last_observed_at = $1, completed_steps = $2, step_keys = $3,
      activated_at = CASE WHEN activated_at IS NULL AND $2::integer >= $4::integer THEN $1 ELSE activated_at END
      WHERE guild_id = $5 RETURNING *`,
    [observedAt, stepKeys.length, JSON.stringify(stepKeys), ACTIVATION_THRESHOLD, guildId]);
    return result.rows[0] || null;
  }

  async function getActivationStats(guildIds, { now = new Date() } = {}) {
    const ids = [...new Set([...guildIds].filter(Boolean))];
    const [progressResult, installationResult, usageResult] = await Promise.all([
      pool.query(`SELECT guild_id AS "guildId", tracking_started_at AS "trackingStartedAt",
        last_observed_at AS "lastObservedAt", completed_steps AS "completedSteps",
        step_keys AS "stepKeys", activated_at AS "activatedAt", baseline
        FROM ${progress} WHERE guild_id = ANY($1::text[])`, [ids]),
      pool.query(`SELECT guild_id AS "guildId", first_seen_at AS "firstSeenAt"
        FROM ${installations} WHERE removed_at IS NULL AND guild_id = ANY($1::text[])`, [ids]),
      pool.query(`SELECT DISTINCT guild_id AS "guildId" FROM ${usage}
        WHERE day >= $1 AND guild_id = ANY($2::text[])`,
      [new Date(asDate(now).getTime() - 29 * DAY_MS).toISOString().slice(0, 10), ids]),
    ]);
    const rows = progressResult.rows.map((row) => {
      let stepKeys = [];
      try { stepKeys = JSON.parse(row.stepKeys || '[]'); } catch { /* Ligne ancienne invalide. */ }
      return { ...row, stepKeys: Array.isArray(stepKeys) ? stepKeys : [] };
    });
    const installed = new Map(installationResult.rows.map((row) => [row.guildId, row]));
    const currentActivatedGuilds = rows.filter((row) => row.completedSteps >= ACTIVATION_THRESHOLD).length;
    const candidateRows = rows.filter((row) => row.baseline === 0);
    const eligibleRows = candidateRows.filter((row) => {
      const firstSeen = new Date(installed.get(row.guildId)?.firstSeenAt || row.trackingStartedAt);
      if (Number.isNaN(firstSeen.getTime())) return false;
      const activatedAt = row.activatedAt ? new Date(row.activatedAt) : null;
      const activatedWithinWindow = activatedAt && !Number.isNaN(activatedAt.getTime())
        && activatedAt.getTime() >= firstSeen.getTime()
        && activatedAt.getTime() - firstSeen.getTime() <= DAY_MS;
      return activatedWithinWindow || asDate(now).getTime() - firstSeen.getTime() >= DAY_MS;
    });
    const activatedWithin24h = eligibleRows.filter((row) => {
      if (!row.activatedAt) return false;
      const firstSeen = new Date(installed.get(row.guildId)?.firstSeenAt || row.trackingStartedAt);
      return new Date(row.activatedAt).getTime() - firstSeen.getTime() <= DAY_MS;
    }).length;
    const sinceDate = new Date(asDate(now).getTime() - 29 * DAY_MS);
    const stalledBefore = new Date(asDate(now).getTime() - 7 * DAY_MS);
    const activeIds = new Set(usageResult.rows.map((row) => row.guildId));
    for (const row of rows) {
      if (row.lastObservedAt && new Date(row.lastObservedAt) >= sinceDate) activeIds.add(row.guildId);
    }
    const steps = STEP_DEFINITIONS.map((step) => {
      const completedGuilds = rows.filter((row) => row.stepKeys.includes(step.key)).length;
      return { key: step.key, title: step.title, completedGuilds, rate: percent(completedGuilds, ids.length) };
    });
    const stalledGuilds7d = rows.filter((row) => row.completedSteps < ACTIVATION_THRESHOLD
      && row.lastObservedAt && new Date(row.lastObservedAt) < stalledBefore).length;
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
        ? Math.round((rows.reduce((total, row) => total + row.completedSteps, 0) / rows.length) * 10) / 10 : 0,
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

  async function recordGuild(guild, { now = new Date() } = {}) {
    const when = asDate(now).toISOString();
    await pool.query(`INSERT INTO ${installations}
      (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
      VALUES ($1, $2, $3, $4, $4, NULL) ON CONFLICT (guild_id) DO UPDATE SET
        guild_name = EXCLUDED.guild_name, member_count = EXCLUDED.member_count,
        last_seen_at = EXCLUDED.last_seen_at, removed_at = NULL`,
    [guild.id, guild.name, guild.memberCount || 0, when]);
    await ensureActivationTracking(guild.id, { now });
  }

  async function markGuildRemoved(guild, { now = new Date() } = {}) {
    const when = asDate(now).toISOString();
    await pool.query(`INSERT INTO ${installations}
      (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
      VALUES ($1, $2, $3, $4, $4, $4) ON CONFLICT (guild_id) DO UPDATE SET
        guild_name = EXCLUDED.guild_name, member_count = EXCLUDED.member_count,
        last_seen_at = EXCLUDED.last_seen_at, removed_at = EXCLUDED.removed_at`,
    [guild.id, guild.name, guild.memberCount || 0, when]);
  }

  async function syncCreatorStats(guilds, { now = new Date() } = {}) {
    const list = [...guilds];
    for (const guild of list) await recordGuild(guild, { now });
    const guildCount = list.length;
    const memberCount = list.reduce((total, guild) => total + (guild.memberCount || 0), 0);
    const when = asDate(now).toISOString();
    await pool.query(`INSERT INTO ${metrics} (day, guild_count, member_count, recorded_at)
      VALUES ($1, $2, $3, $4) ON CONFLICT (day) DO UPDATE SET
        guild_count = EXCLUDED.guild_count, member_count = EXCLUDED.member_count,
        recorded_at = EXCLUDED.recorded_at`,
    [when.slice(0, 10), guildCount, memberCount, when]);
    return { guildCount, memberCount };
  }

  async function getCreatorStats(guilds, { now = new Date() } = {}) {
    const list = [...guilds];
    const totals = await syncCreatorStats(list, { now });
    const activation = await getActivationStats(list.map((guild) => guild.id), { now });
    const activationByGuild = new Map(activation.guilds.map((guild) => [guild.guildId, guild]));
    const [installationResult, historyResult, countsResult, commandStats] = await Promise.all([
      pool.query(`SELECT guild_id AS "guildId", guild_name AS "guildName", member_count AS "memberCount",
        first_seen_at AS "firstSeenAt" FROM ${installations}
        WHERE removed_at IS NULL ORDER BY member_count DESC`),
      pool.query(`SELECT day, guild_count AS "guildCount", member_count AS "memberCount"
        FROM ${metrics} ORDER BY day DESC LIMIT 30`),
      pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE removed_at IS NOT NULL)::int AS removed FROM ${installations}`),
      activity.getCommandUsageStats(),
    ]);
    const enrichedInstallations = installationResult.rows.map((row) => ({
      ...row,
      completedSteps: activationByGuild.get(row.guildId)?.completedSteps || 0,
      totalSteps: activation.totalSteps,
      activated: activationByGuild.get(row.guildId)?.activated || false,
      lastObservedAt: activationByGuild.get(row.guildId)?.lastObservedAt || null,
    }));
    const { guilds: _guildActivationRows, ...activationSummary } = activation;
    return {
      ...totals,
      allTime: countsResult.rows[0].total,
      removed: countsResult.rows[0].removed,
      installations: enrichedInstallations,
      history: historyResult.rows.reverse(),
      ...commandStats,
      commandActiveGuilds30d: commandStats.activeGuilds30d,
      activeGuilds30d: activation.activeGuilds30d,
      activation: activationSummary,
    };
  }

  return {
    ensureActivationTracking, getActivationStats, getCreatorStats,
    markGuildRemoved, recordActivationProgress, recordGuild, syncCreatorStats,
  };
}

module.exports = { createPostgresCreatorStatsStore };
