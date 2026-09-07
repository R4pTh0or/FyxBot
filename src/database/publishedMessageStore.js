const { randomUUID } = require('node:crypto');
const { getConfiguration, setConfiguration } = require('./database');

const SECTION = 'publishedMessages';
const MAX_PUBLISHED_MESSAGES = 50;
const defaultStorage = { getConfiguration, setConfiguration };

function recordsFrom(value) {
  return Array.isArray(value?.items) ? value.items.filter((item) => item?.id && item?.messageId && item?.channelId) : [];
}

function listPublishedMessages(guildId, storage = defaultStorage) {
  return recordsFrom(storage.getConfiguration(guildId, SECTION))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function getPublishedMessage(guildId, id, storage = defaultStorage) {
  return listPublishedMessages(guildId, storage).find((item) => item.id === id) || null;
}

function createPublishedMessage(guildId, input, storage = defaultStorage) {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    messageId: String(input.messageId),
    channelId: String(input.channelId),
    channelName: String(input.channelName || 'salon inconnu').slice(0, 100),
    content: String(input.content || ''),
    title: String(input.title || ''),
    description: String(input.description || ''),
    color: String(input.color || '#ef4444'),
    imageUrl: String(input.imageUrl || ''),
    thumbnailUrl: String(input.thumbnailUrl || ''),
    linkUrl: String(input.linkUrl || ''),
    buttonLabel: String(input.buttonLabel || ''),
    footer: String(input.footer || ''),
    createdAt: now,
    updatedAt: now,
  };
  const items = [record, ...listPublishedMessages(guildId, storage)].slice(0, MAX_PUBLISHED_MESSAGES);
  storage.setConfiguration(guildId, SECTION, { items, updatedAt: now });
  return record;
}

function updatePublishedMessage(guildId, id, input, storage = defaultStorage) {
  const current = getPublishedMessage(guildId, id, storage);
  if (!current) throw new Error('Message publié introuvable.');
  const updated = {
    ...current,
    content: String(input.content || ''),
    title: String(input.title || ''),
    description: String(input.description || ''),
    color: String(input.color || '#ef4444'),
    imageUrl: String(input.imageUrl || ''),
    thumbnailUrl: String(input.thumbnailUrl || ''),
    linkUrl: String(input.linkUrl || ''),
    buttonLabel: String(input.buttonLabel || ''),
    footer: String(input.footer || ''),
    updatedAt: new Date().toISOString(),
  };
  const items = listPublishedMessages(guildId, storage).map((item) => item.id === id ? updated : item);
  storage.setConfiguration(guildId, SECTION, { items, updatedAt: updated.updatedAt });
  return updated;
}

function deletePublishedMessage(guildId, id, storage = defaultStorage) {
  const current = getPublishedMessage(guildId, id, storage);
  if (!current) return null;
  const updatedAt = new Date().toISOString();
  const items = listPublishedMessages(guildId, storage).filter((item) => item.id !== id);
  storage.setConfiguration(guildId, SECTION, { items, updatedAt });
  return current;
}

module.exports = {
  MAX_PUBLISHED_MESSAGES,
  createPublishedMessage,
  deletePublishedMessage,
  getPublishedMessage,
  listPublishedMessages,
  updatePublishedMessage,
};
