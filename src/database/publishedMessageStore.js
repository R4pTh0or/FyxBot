const { randomUUID } = require('node:crypto');

const SECTION = 'publishedMessages';
const MAX_PUBLISHED_MESSAGES = 50;
const defaultStorage = require('./defaultConfigurationStorage');

function recordsFrom(value) {
  return Array.isArray(value?.items) ? value.items.filter((item) => item?.id && item?.messageId && item?.channelId) : [];
}

function sortedRecords(value) {
  return recordsFrom(value).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function listPublishedMessages(guildId, storage = defaultStorage) {
  return sortedRecords(await storage.getConfiguration(guildId, SECTION));
}

async function getPublishedMessage(guildId, id, storage = defaultStorage) {
  return (await listPublishedMessages(guildId, storage)).find((item) => item.id === id) || null;
}

async function createPublishedMessage(guildId, input, storage = defaultStorage) {
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
  if (typeof storage.updateConfiguration === 'function') {
    await storage.updateConfiguration(guildId, SECTION, (current) => ({
      items: [record, ...sortedRecords(current)].slice(0, MAX_PUBLISHED_MESSAGES), updatedAt: now,
    }));
  } else {
    const items = [record, ...await listPublishedMessages(guildId, storage)].slice(0, MAX_PUBLISHED_MESSAGES);
    await storage.setConfiguration(guildId, SECTION, { items, updatedAt: now });
  }
  return record;
}

async function updatePublishedMessage(guildId, id, input, storage = defaultStorage) {
  let updated;
  const apply = (value) => {
    const items = sortedRecords(value);
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error('Message publié introuvable.');
    updated = {
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
    return { items: items.map((item) => item.id === id ? updated : item), updatedAt: updated.updatedAt };
  };
  if (typeof storage.updateConfiguration === 'function') {
    await storage.updateConfiguration(guildId, SECTION, apply);
  } else {
    await storage.setConfiguration(guildId, SECTION, apply(await storage.getConfiguration(guildId, SECTION)));
  }
  return updated;
}

async function deletePublishedMessage(guildId, id, storage = defaultStorage) {
  let removed = null;
  const apply = (value) => {
    const items = sortedRecords(value);
    removed = items.find((item) => item.id === id) || null;
    return removed ? { items: items.filter((item) => item.id !== id), updatedAt: new Date().toISOString() } : undefined;
  };
  if (typeof storage.updateConfiguration === 'function') {
    await storage.updateConfiguration(guildId, SECTION, apply);
  } else {
    const current = await storage.getConfiguration(guildId, SECTION);
    const next = apply(current);
    if (removed) await storage.setConfiguration(guildId, SECTION, next);
  }
  return removed;
}

module.exports = {
  MAX_PUBLISHED_MESSAGES,
  createPublishedMessage,
  deletePublishedMessage,
  getPublishedMessage,
  listPublishedMessages,
  updatePublishedMessage,
};
