const { database } = require('./database');

function addSuggestion({ id, guildId, channelId, messageId, authorId, authorName, anonymous, idea }) {
  database.prepare(`INSERT INTO suggestions
    (id, guild_id, channel_id, message_id, author_id, author_name, anonymous, idea, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(id, guildId, channelId, messageId, authorId, authorName, anonymous ? 1 : 0, idea, new Date().toISOString());
}

function getRecentSuggestions(guildId, limit = 30) {
  return database.prepare(`SELECT id, channel_id AS channelId, message_id AS messageId,
    CASE WHEN anonymous = 1 THEN 'Anonyme' ELSE author_name END AS authorName,
    anonymous, idea, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt,
    created_at AS createdAt FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(guildId, Math.min(Math.max(limit, 1), 100));
}

function getSuggestion(guildId, id) {
  return database.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND id = ?').get(guildId, id);
}

function reviewSuggestion(guildId, id, status, reviewedBy) {
  const reviewedAt = new Date().toISOString();
  database.prepare('UPDATE suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE guild_id = ? AND id = ?')
    .run(status, reviewedBy, reviewedAt, guildId, id);
  return reviewedAt;
}

module.exports = { addSuggestion, getRecentSuggestions, getSuggestion, reviewSuggestion };
