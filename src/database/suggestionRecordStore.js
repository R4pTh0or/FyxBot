const { resolveRuntimeStore } = require('./runtimeStorage');

const defaultStorage = {
  addSuggestion({ id, guildId, channelId, messageId, authorId, authorName, anonymous, idea }) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.addSuggestion({ id, guildId, channelId, messageId, authorId, authorName, anonymous, idea });
    const { database } = require('./database');
    database.prepare(`INSERT INTO suggestions
      (id, guild_id, channel_id, message_id, author_id, author_name, anonymous, idea, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(id, guildId, channelId, messageId, authorId, authorName, anonymous ? 1 : 0, idea, new Date().toISOString());
  },
  getRecentSuggestions(guildId, limit = 30) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.getRecentSuggestions(guildId, limit);
    const { database } = require('./database');
    return database.prepare(`SELECT id, channel_id AS channelId, message_id AS messageId,
      CASE WHEN anonymous = 1 THEN 'Anonyme' ELSE author_name END AS authorName,
      anonymous, idea, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt,
      created_at AS createdAt FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(guildId, Math.min(Math.max(limit, 1), 100));
  },
  getSuggestion(guildId, id) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.getSuggestion(guildId, id);
    const { database } = require('./database');
    return database.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND id = ?').get(guildId, id);
  },
  reviewSuggestion(guildId, id, status, reviewedBy) {
    const runtime = resolveRuntimeStore('activity');
    if (runtime) return runtime.reviewSuggestion(guildId, id, status, reviewedBy);
    const { database } = require('./database');
    const reviewedAt = new Date().toISOString();
    database.prepare('UPDATE suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE guild_id = ? AND id = ?')
      .run(status, reviewedBy, reviewedAt, guildId, id);
    return reviewedAt;
  },
};

async function addSuggestion(entry, storage = defaultStorage) {
  return storage.addSuggestion(entry);
}

async function getRecentSuggestions(guildId, limit = 30, storage = defaultStorage) {
  return storage.getRecentSuggestions(guildId, limit);
}

async function getSuggestion(guildId, id, storage = defaultStorage) {
  return storage.getSuggestion(guildId, id);
}

async function reviewSuggestion(guildId, id, status, reviewedBy, storage = defaultStorage) {
  return storage.reviewSuggestion(guildId, id, status, reviewedBy);
}

module.exports = { addSuggestion, getRecentSuggestions, getSuggestion, reviewSuggestion };
