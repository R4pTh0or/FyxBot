const { randomUUID } = require('node:crypto');
const { getConfiguration, setConfiguration } = require('./database');

const SECTION = 'contentTrash';
const MAX_CONTENT_TRASH_ITEMS = 30;
const CONTENT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const ALLOWED_KINDS = new Set(['message', 'rules', 'ticket', 'role', 'social']);
const defaultStorage = { getConfiguration, setConfiguration };

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

function listContentTrash(guildId, storage = defaultStorage, { now = new Date() } = {}) {
  return recordsFrom(storage.getConfiguration(guildId, SECTION), now)
    .sort((left, right) => String(right.removedAt).localeCompare(String(left.removedAt)));
}

function getContentTrashItem(guildId, id, storage = defaultStorage, options = {}) {
  return listContentTrash(guildId, storage, options).find((item) => item.id === id) || null;
}

function archiveContent(guildId, input, storage = defaultStorage, { now = new Date() } = {}) {
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
  const items = [record, ...listContentTrash(guildId, storage, { now })]
    .slice(0, MAX_CONTENT_TRASH_ITEMS);
  storage.setConfiguration(guildId, SECTION, { items, updatedAt: record.removedAt });
  return record;
}

function removeContentTrashItem(guildId, id, storage = defaultStorage, { now = new Date() } = {}) {
  const current = getContentTrashItem(guildId, id, storage, { now });
  if (!current) return null;
  const items = listContentTrash(guildId, storage, { now }).filter((item) => item.id !== id);
  storage.setConfiguration(guildId, SECTION, { items, updatedAt: now.toISOString() });
  return current;
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
