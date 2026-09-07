const { randomUUID } = require('node:crypto');
const { database } = require('./database');
const { CLOSED_SUPPORT_STATUSES } = require('../services/supportManagement');

function activeDatabase(targetDatabase) {
  return targetDatabase || database;
}

const requestFields = `id, guild_id AS guildId, guild_name AS guildName,
  requester_id AS requesterId, requester_name AS requesterName, category, subject,
  priority, status, created_at AS createdAt, updated_at AS updatedAt,
  last_message_at AS lastMessageAt, closed_at AS closedAt`;

function createSupportRequest({ guildId, guildName, requesterId, requesterName, category, subject, priority, message }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const id = randomUUID();
  const messageId = randomUUID();
  const eventId = randomUUID();
  const now = new Date().toISOString();
  target.exec('BEGIN IMMEDIATE');
  try {
    target.prepare(`INSERT INTO support_requests
      (id, guild_id, guild_name, requester_id, requester_name, category, subject, priority, status, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
      .run(id, guildId, guildName, requesterId, requesterName, category, subject, priority, now, now, now);
    target.prepare(`INSERT INTO support_messages
      (id, request_id, author_id, author_name, author_role, body, created_at)
      VALUES (?, ?, ?, ?, 'user', ?, ?)`)
      .run(messageId, id, requesterId, requesterName, message, now);
    target.prepare(`INSERT INTO support_events
      (id, request_id, actor_id, actor_name, event_type, detail, created_at)
      VALUES (?, ?, ?, ?, 'created', 'Demande créée', ?)`)
      .run(eventId, id, requesterId, requesterName, now);
    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
  return getSupportRequest(id, target);
}

function listSupportRequests({ requesterId = null, guildId = null, includeAll = false, status = null, limit = 100 } = {}, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const clauses = [];
  const parameters = [];
  if (!includeAll) {
    if (!requesterId) return [];
    clauses.push('requester_id = ?');
    parameters.push(requesterId);
  }
  if (guildId) {
    clauses.push('guild_id = ?');
    parameters.push(guildId);
  }
  if (status) {
    clauses.push('status = ?');
    parameters.push(status);
  }
  parameters.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return target.prepare(`SELECT ${requestFields},
    (SELECT COUNT(*) FROM support_messages WHERE request_id = support_requests.id) AS messageCount
    FROM support_requests ${where}
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      updated_at DESC LIMIT ?`).all(...parameters);
}

function getSupportRequest(id, targetDatabase) {
  return activeDatabase(targetDatabase).prepare(`SELECT ${requestFields} FROM support_requests WHERE id = ?`).get(id) || null;
}

function getSupportConversation(id, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const request = getSupportRequest(id, target);
  if (!request) return null;
  const messages = target.prepare(`SELECT id, request_id AS requestId, author_id AS authorId,
    author_name AS authorName, author_role AS authorRole, body, created_at AS createdAt
    FROM support_messages WHERE request_id = ? ORDER BY created_at, rowid`).all(id);
  const events = target.prepare(`SELECT id, request_id AS requestId, actor_id AS actorId,
    actor_name AS actorName, event_type AS eventType, detail, created_at AS createdAt
    FROM support_events WHERE request_id = ? ORDER BY created_at, rowid`).all(id);
  return { request, messages, events };
}

function countOpenSupportRequests(requesterId, targetDatabase) {
  const placeholders = CLOSED_SUPPORT_STATUSES.map(() => '?').join(', ');
  return activeDatabase(targetDatabase).prepare(`SELECT COUNT(*) AS total FROM support_requests
    WHERE requester_id = ? AND status NOT IN (${placeholders})`).get(requesterId, ...CLOSED_SUPPORT_STATUSES).total;
}

function addSupportMessage({ requestId, authorId, authorName, authorRole, body }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const now = new Date().toISOString();
  const id = randomUUID();
  target.exec('BEGIN IMMEDIATE');
  try {
    target.prepare(`INSERT INTO support_messages
      (id, request_id, author_id, author_name, author_role, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, requestId, authorId, authorName, authorRole, body, now);
    target.prepare('UPDATE support_requests SET updated_at = ?, last_message_at = ? WHERE id = ?')
      .run(now, now, requestId);
    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
  return id;
}

function updateSupportRequest({ requestId, status, priority, actorId, actorName }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const current = getSupportRequest(requestId, target);
  if (!current) return null;
  const changes = [];
  if (current.status !== status) changes.push(`Statut : ${current.status} → ${status}`);
  if (current.priority !== priority) changes.push(`Priorité : ${current.priority} → ${priority}`);
  if (changes.length === 0) return current;
  const now = new Date().toISOString();
  const closedAt = CLOSED_SUPPORT_STATUSES.includes(status) ? now : null;
  target.exec('BEGIN IMMEDIATE');
  try {
    target.prepare(`UPDATE support_requests SET status = ?, priority = ?, updated_at = ?, closed_at = ? WHERE id = ?`)
      .run(status, priority, now, closedAt, requestId);
    target.prepare(`INSERT INTO support_events
      (id, request_id, actor_id, actor_name, event_type, detail, created_at)
      VALUES (?, ?, ?, ?, 'updated', ?, ?)`)
      .run(randomUUID(), requestId, actorId, actorName, changes.join(' · '), now);
    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
  return getSupportRequest(requestId, target);
}

module.exports = {
  addSupportMessage,
  countOpenSupportRequests,
  createSupportRequest,
  getSupportConversation,
  getSupportRequest,
  listSupportRequests,
  updateSupportRequest,
};
