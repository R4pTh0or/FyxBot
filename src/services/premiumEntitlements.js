const { resolveRuntimeStore } = require('../database/runtimeStorage');

function activeDatabase(targetDatabase) {
  return targetDatabase || require('../database/database').database;
}

function configuredPremiumSkuIds(environment = process.env) {
  return [...new Set(String(environment.FYXBOT_PREMIUM_SKU_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d{17,20}$/.test(value)))];
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

async function upsertPremiumEntitlement(entitlement, {
  targetDatabase,
  storage,
  now = new Date(),
  deleted,
} = {}) {
  storage = resolveRuntimeStore('premiumEntitlements', storage);
  if (storage?.upsertPremiumEntitlement) {
    return storage.upsertPremiumEntitlement(entitlement, { now, deleted });
  }
  const store = activeDatabase(targetDatabase);
  const id = String(entitlement?.id || '');
  const skuId = String(entitlement?.skuId || entitlement?.sku_id || '');
  if (!/^\d{17,20}$/.test(id) || !/^\d{17,20}$/.test(skuId)) throw new Error('Droit Premium Discord invalide.');
  const guildId = entitlement.guildId || entitlement.guild_id
    ? String(entitlement.guildId || entitlement.guild_id)
    : null;
  const userId = entitlement.userId || entitlement.user_id
    ? String(entitlement.userId || entitlement.user_id)
    : null;
  if (guildId && !/^\d{17,20}$/.test(guildId)) throw new Error('Serveur du droit Premium invalide.');
  if (userId && !/^\d{17,20}$/.test(userId)) throw new Error('Utilisateur du droit Premium invalide.');
  if (!guildId && !userId) throw new Error('Bénéficiaire du droit Premium manquant.');
  const startsAt = isoDate(entitlement.startsAt || entitlement.startsTimestamp || entitlement.starts_at);
  const endsAt = isoDate(entitlement.endsAt || entitlement.endsTimestamp || entitlement.ends_at);
  const observedAt = isoDate(now) || new Date().toISOString();
  const isDeleted = deleted === undefined ? Boolean(entitlement.deleted) : Boolean(deleted);
  store.prepare(`INSERT INTO premium_entitlements
    (entitlement_id, sku_id, user_id, guild_id, starts_at, ends_at, deleted, test, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entitlement_id) DO UPDATE SET
      sku_id=excluded.sku_id, user_id=excluded.user_id, guild_id=excluded.guild_id, starts_at=excluded.starts_at,
      ends_at=excluded.ends_at, deleted=excluded.deleted, test=excluded.test,
      observed_at=excluded.observed_at`)
    .run(id, skuId, userId, guildId, startsAt, endsAt, isDeleted ? 1 : 0, isTestEntitlement(entitlement) ? 1 : 0, observedAt);
  return store.prepare('SELECT * FROM premium_entitlements WHERE entitlement_id = ?').get(id);
}

function markPremiumEntitlementDeleted(entitlement, options = {}) {
  return upsertPremiumEntitlement(entitlement, { ...options, deleted: true });
}

function entitlementIsActive(row, now) {
  const observedAt = now instanceof Date ? now : new Date(now || Date.now());
  const startsAt = row.starts_at ? new Date(row.starts_at) : null;
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  return row.deleted === 0
    && (!startsAt || startsAt <= observedAt)
    && (!endsAt || endsAt > observedAt);
}

async function getGuildPremiumEntitlementState(guildId, {
  targetDatabase,
  storage,
  skuIds = configuredPremiumSkuIds(),
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('premiumEntitlements', storage);
  if (storage?.getGuildPremiumEntitlementState) {
    return storage.getGuildPremiumEntitlementState(guildId, { skuIds, now });
  }
  const ids = [...new Set(skuIds.filter((id) => /^\d{17,20}$/.test(String(id))).map(String))];
  if (!guildId || ids.length === 0) {
    return { configured: ids.length > 0, active: false, detected: 0, test: false };
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = activeDatabase(targetDatabase).prepare(`SELECT * FROM premium_entitlements
    WHERE guild_id = ? AND sku_id IN (${placeholders})`).all(String(guildId), ...ids);
  const activeRows = rows.filter((row) => entitlementIsActive(row, now));
  return {
    configured: true,
    active: activeRows.length > 0,
    detected: rows.length,
    test: activeRows.some((row) => row.test === 1),
  };
}

async function getUserPremiumEntitlementState(userId, {
  targetDatabase,
  storage,
  skuIds = configuredPremiumSkuIds(),
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('premiumEntitlements', storage);
  if (storage?.getUserPremiumEntitlementState) {
    return storage.getUserPremiumEntitlementState(userId, { skuIds, now });
  }
  const ids = [...new Set(skuIds.filter((id) => /^\d{17,20}$/.test(String(id))).map(String))];
  if (!userId || ids.length === 0) {
    return { configured: ids.length > 0, active: false, detected: 0, test: false };
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = activeDatabase(targetDatabase).prepare(`SELECT * FROM premium_entitlements
    WHERE user_id = ? AND sku_id IN (${placeholders})`).all(String(userId), ...ids);
  const activeRows = rows.filter((row) => entitlementIsActive(row, now));
  return {
    configured: true,
    active: activeRows.length > 0,
    detected: rows.length,
    test: activeRows.some((row) => row.test === 1),
  };
}

async function syncPremiumEntitlements(client, {
  targetDatabase,
  storage,
  skuIds = configuredPremiumSkuIds(),
  now = new Date(),
} = {}) {
  storage = resolveRuntimeStore('premiumEntitlements', storage);
  if (storage?.syncPremiumEntitlements) {
    return storage.syncPremiumEntitlements(client, { skuIds, now });
  }
  const ids = [...new Set(skuIds.map(String).filter((id) => /^\d{17,20}$/.test(id)))];
  if (ids.length === 0) return { configured: false, synced: 0 };
  const manager = client.application?.entitlements;
  if (!manager?.fetch) throw new Error('L’API des droits Premium Discord est indisponible.');
  const observedIds = new Set();
  let after;
  for (let page = 0; page < 100; page += 1) {
    const batch = await manager.fetch({
      skus: ids,
      limit: 100,
      after,
      excludeEnded: false,
      excludeDeleted: false,
    });
    for (const entitlement of batch.values()) {
      await upsertPremiumEntitlement(entitlement, { targetDatabase, now });
      observedIds.add(String(entitlement.id));
    }
    if (batch.size < 100) break;
    const lastId = [...batch.keys()].at(-1);
    if (!lastId || lastId === after) throw new Error('Pagination des droits Premium Discord interrompue.');
    after = lastId;
  }
  const store = activeDatabase(targetDatabase);
  const skuPlaceholders = ids.map(() => '?').join(', ');
  if (observedIds.size === 0) {
    store.prepare(`UPDATE premium_entitlements SET deleted = 1, observed_at = ? WHERE sku_id IN (${skuPlaceholders})`)
      .run(isoDate(now), ...ids);
  } else {
    const entitlementIds = [...observedIds];
    const entitlementPlaceholders = entitlementIds.map(() => '?').join(', ');
    store.prepare(`UPDATE premium_entitlements SET deleted = 1, observed_at = ?
      WHERE sku_id IN (${skuPlaceholders}) AND entitlement_id NOT IN (${entitlementPlaceholders})`)
      .run(isoDate(now), ...ids, ...entitlementIds);
  }
  return { configured: true, synced: observedIds.size };
}

module.exports = {
  configuredPremiumSkuIds,
  getGuildPremiumEntitlementState,
  getUserPremiumEntitlementState,
  markPremiumEntitlementDeleted,
  syncPremiumEntitlements,
  upsertPremiumEntitlement,
};
