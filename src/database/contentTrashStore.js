const { randomUUID } = require('node:crypto');

const SECTION = 'contentTrash';
const MAX_CONTENT_TRASH_ITEMS = 30;
const CONTENT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const ALLOWED_KINDS = new Set(['message', 'rules', 'ticket', 'role', 'social']);
const defaultStorage = require('./defaultConfigurationStorage');

function safeSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Le contenu à archiver est invalide.');
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw new Error('Ce contenu est trop volumineux pour être placé dans la corbeille.');
  }
  return JSON.parse(serialized);
}

function recordsFrom(value, now = new Date()) {
  const nowMs = now.getTime();
  return Array.isArray(value?.items)
    ? value.items.filter((item) => item?.id
      && ALLOWED_KINDS.has(item.kind)
      && item.snapshot
      && Date.parse(item.expiresAt) > nowMs)
    : [];
}

function sortedRecords(value, now) {
  return recordsFrom(value, now)
    .sort((left, right) => String(right.removedAt).localeCompare(String(left.removedAt)));
}

async function listContentTrash(guildId, storage = defaultStorage, { now = new Date() } = {}) {
  return sortedRecords(await storage.getConfiguration(guildId, SECTION), now);
}

async function getContentTrashItem(guildId, id, storage = defaultStorage, options = {}) {
  return (await listContentTrash(guildId, storage, options)).find((item) => item.id === id) || null;
}

async function archiveContent(guildId, input, storage = defaultStorage, { now = new Date() } = {}) {
  const kind = String(input.kind || '');
  if (!ALLOWED_KINDS.has(kind)) throw new Error('Ce type de contenu ne peut pas être archivé.');
  const record = {
    id: randomUUID(),
    kind,
    title: String(input.title || 'Contenu FyxBot').trim().slice(0, 160),
    target: String(input.target || 'Messages').trim().slice(0, 80),
    snapshot: safeSnapshot(input.snapshot),
    removedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONTENT_TRASH_RETENTION_MS).toISOString(),
  };
  const append = (value) => ({
    items: [record, ...sortedRecords(value, now)].slice(0, MAX_CONTENT_TRASH_ITEMS),
    updatedAt: record.removedAt,
  });
  if (typeof storage.updateConfiguration === 'function') {
    await storage.updateConfiguration(guildId, SECTION, append);
  } else {
    await storage.setConfiguration(guildId, SECTION, append(await storage.getConfiguration(guildId, SECTION)));
  }
  return record;
}

async function removeContentTrashItem(guildId, id, storage = defaultStorage, { now = new Date() } = {}) {
  let removed = null;
  const remove = (value) => {
    const items = sortedRecords(value, now);
    removed = items.find((item) => item.id === id) || null;
    return removed ? { items: items.filter((item) => item.id !== id), updatedAt: now.toISOString() } : undefined;
  };
  if (typeof storage.updateConfiguration === 'function') {
    await storage.updateConfiguration(guildId, SECTION, remove);
  } else {
    const next = remove(await storage.getConfiguration(guildId, SECTION));
    if (removed) await storage.setConfiguration(guildId, SECTION, next);
  }
  return removed;
}

function contentTrashSummary(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    target: item.target,
    removedAt: item.removedAt,
    expiresAt: item.expiresAt,
  };
}

module.exports = {
  CONTENT_TRASH_RETENTION_MS,
  MAX_CONTENT_TRASH_ITEMS,
  archiveContent,
  contentTrashSummary,
  getContentTrashItem,
  listContentTrash,
  removeContentTrashItem,
};
