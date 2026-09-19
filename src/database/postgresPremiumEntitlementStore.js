function configuredPremiumSkuIds(environment = process.env) {
  return [...new Set(String(environment.FYXBOT_PREMIUM_SKU_IDS || '')
    .split(',').map((value) => value.trim()).filter((value) => /^\d{17,20}$/.test(value)))];
}

function isoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isTestEntitlement(entitlement) {
  if (typeof entitlement?.isTest === 'function') return entitlement.isTest();
  return Boolean(entitlement?.test);
}

function createPostgresPremiumEntitlementStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = `"${schema}"."premium_entitlements"`;

  function normalizeEntitlement(entitlement, { now = new Date(), deleted } = {}) {
    const id = String(entitlement?.id || '');
    const skuId = String(entitlement?.skuId || entitlement?.sku_id || '');
    if (!/^\d{17,20}$/.test(id) || !/^\d{17,20}$/.test(skuId)) throw new Error('Droit Premium Discord invalide.');
    const guildId = entitlement.guildId || entitlement.guild_id
      ? String(entitlement.guildId || entitlement.guild_id) : null;
    const userId = entitlement.userId || entitlement.user_id
      ? String(entitlement.userId || entitlement.user_id) : null;
    if (guildId && !/^\d{17,20}$/.test(guildId)) throw new Error('Serveur du droit Premium invalide.');
    if (userId && !/^\d{17,20}$/.test(userId)) throw new Error('Utilisateur du droit Premium invalide.');
    if (!guildId && !userId) throw new Error('Bénéficiaire du droit Premium manquant.');
    return [
      id, skuId, userId, guildId,
      isoDate(entitlement.startsAt || entitlement.startsTimestamp || entitlement.starts_at),
      isoDate(entitlement.endsAt || entitlement.endsTimestamp || entitlement.ends_at),
      deleted === undefined ? (entitlement.deleted ? 1 : 0) : (deleted ? 1 : 0),
      isTestEntitlement(entitlement) ? 1 : 0,
      isoDate(now) || new Date().toISOString(),
    ];
  }

  async function upsertOn(client, entitlement, options = {}) {
    const values = normalizeEntitlement(entitlement, options);
    const result = await client.query(`INSERT INTO ${table}
      (entitlement_id, sku_id, user_id, guild_id, starts_at, ends_at, deleted, test, observed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (entitlement_id) DO UPDATE SET
        sku_id = EXCLUDED.sku_id, user_id = EXCLUDED.user_id, guild_id = EXCLUDED.guild_id,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
        deleted = EXCLUDED.deleted, test = EXCLUDED.test, observed_at = EXCLUDED.observed_at
      RETURNING *`, values);
    return result.rows[0];
  }

  async function upsertPremiumEntitlement(entitlement, options = {}) {
    return upsertOn(pool, entitlement, options);
  }

  async function markPremiumEntitlementDeleted(entitlement, options = {}) {
    return upsertOn(pool, entitlement, { ...options, deleted: true });
  }

  function entitlementIsActive(row, now) {
    const observedAt = now instanceof Date ? now : new Date(now || Date.now());
    const startsAt = row.starts_at ? new Date(row.starts_at) : null;
    const endsAt = row.ends_at ? new Date(row.ends_at) : null;
    return row.deleted === 0 && (!startsAt || startsAt <= observedAt) && (!endsAt || endsAt > observedAt);
  }

  async function entitlementState(column, id, { skuIds = configuredPremiumSkuIds(), now = new Date() } = {}) {
    const ids = [...new Set(skuIds.filter((sku) => /^\d{17,20}$/.test(String(sku))).map(String))];
    if (!id || ids.length === 0) return { configured: ids.length > 0, active: false, detected: 0, test: false };
    const result = await pool.query(`SELECT * FROM ${table} WHERE ${column} = $1 AND sku_id = ANY($2::text[])`,
      [String(id), ids]);
    const activeRows = result.rows.filter((row) => entitlementIsActive(row, now));
    return {
      configured: true,
      active: activeRows.length > 0,
      detected: result.rows.length,
      test: activeRows.some((row) => row.test === 1),
    };
  }

  function getGuildPremiumEntitlementState(guildId, options = {}) {
    return entitlementState('guild_id', guildId, options);
  }

  function getUserPremiumEntitlementState(userId, options = {}) {
    return entitlementState('user_id', userId, options);
  }

  async function syncPremiumEntitlements(discordClient, { skuIds = configuredPremiumSkuIds(), now = new Date() } = {}) {
    const ids = [...new Set(skuIds.map(String).filter((id) => /^\d{17,20}$/.test(id)))];
    if (ids.length === 0) return { configured: false, synced: 0 };
    const manager = discordClient.application?.entitlements;
    if (!manager?.fetch) throw new Error('L’API des droits Premium Discord est indisponible.');
    const fetched = new Map();
    let after;
    let completed = false;
    for (let page = 0; page < 100; page += 1) {
      const batch = await manager.fetch({ skus: ids, limit: 100, after, excludeEnded: false, excludeDeleted: false });
      for (const entitlement of batch.values()) {
        if (ids.includes(String(entitlement.skuId || entitlement.sku_id))) fetched.set(String(entitlement.id), entitlement);
      }
      if (batch.size < 100) { completed = true; break; }
      const lastId = [...batch.keys()].at(-1);
      if (!lastId || lastId === after) throw new Error('Pagination des droits Premium Discord interrompue.');
      after = lastId;
    }
    if (!completed) throw new Error('Pagination des droits Premium Discord incomplète.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('fyxbot:premium-entitlements-sync'))");
      for (const entitlement of fetched.values()) await upsertOn(client, entitlement, { now });
      await client.query(`UPDATE ${table} SET deleted = 1, observed_at = $1
        WHERE sku_id = ANY($2::text[]) AND NOT (entitlement_id = ANY($3::text[]))`,
      [isoDate(now), ids, [...fetched.keys()]]);
      await client.query('COMMIT');
      return { configured: true, synced: fetched.size };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    getGuildPremiumEntitlementState, getUserPremiumEntitlementState,
    markPremiumEntitlementDeleted, syncPremiumEntitlements, upsertPremiumEntitlement,
  };
}

module.exports = { configuredPremiumSkuIds, createPostgresPremiumEntitlementStore };
