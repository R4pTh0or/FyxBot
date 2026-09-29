const { randomUUID } = require('node:crypto');
const { CLOSED_SUPPORT_STATUSES } = require('../services/supportManagement');
const { resolveRuntimeStore } = require('./runtimeStorage');

function activeDatabase(targetDatabase) {
  return targetDatabase || require('./database').database;
}

const requestFields = `id, guild_id AS guildId, guild_name AS guildName,
  requester_id AS requesterId, requester_name AS requesterName, category, subject,
  priority, status, created_at AS createdAt, updated_at AS updatedAt,
  last_message_at AS lastMessageAt, closed_at AS closedAt`;

function createSupportRequestSqlite({ guildId, guildName, requesterId, requesterName, category, subject, priority, message }, targetDatabase) {
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
  return getSupportRequestSqlite(id, target);
}

function listSupportRequestsSqlite({ requesterId = null, guildId = null, includeAll = false, status = null, limit = 100 } = {}, targetDatabase) {
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
    (SELECT COUNT(*) FROM support_messages WHERE request_id = support_requests.id) AS messageCount,
    (SELECT author_role FROM support_messages WHERE request_id = support_requests.id
      ORDER BY created_at DESC, rowid DESC LIMIT 1) AS lastAuthorRole
    FROM support_requests ${where}
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      updated_at DESC LIMIT ?`).all(...parameters);
}

function getSupportRequestSqlite(id, targetDatabase) {
  return activeDatabase(targetDatabase).prepare(`SELECT ${requestFields} FROM support_requests WHERE id = ?`).get(id) || null;
}

function getSupportConversationSqlite(id, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const request = getSupportRequestSqlite(id, target);
  if (!request) return null;
  const messages = target.prepare(`SELECT id, request_id AS requestId, author_id AS authorId,
    author_name AS authorName, author_role AS authorRole, body, created_at AS createdAt
    FROM support_messages WHERE request_id = ? ORDER BY created_at, rowid`).all(id);
  const events = target.prepare(`SELECT id, request_id AS requestId, actor_id AS actorId,
    actor_name AS actorName, event_type AS eventType, detail, created_at AS createdAt
    FROM support_events WHERE request_id = ? ORDER BY created_at, rowid`).all(id);
  return { request, messages, events };
}

function countOpenSupportRequestsSqlite(requesterId, targetDatabase) {
  const placeholders = CLOSED_SUPPORT_STATUSES.map(() => '?').join(', ');
  return activeDatabase(targetDatabase).prepare(`SELECT COUNT(*) AS total FROM support_requests
    WHERE requester_id = ? AND status NOT IN (${placeholders})`).get(requesterId, ...CLOSED_SUPPORT_STATUSES).total;
}

function addSupportMessageSqlite({ requestId, authorId, authorName, authorRole, body }, targetDatabase) {
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

function updateSupportRequestSqlite({ requestId, status, priority, actorId, actorName }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const current = getSupportRequestSqlite(requestId, target);
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
  return getSupportRequestSqlite(requestId, target);
}

function deleteSupportRequestSqlite(requestId, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  target.exec('BEGIN IMMEDIATE');
  try {
    target.prepare('DELETE FROM support_messages WHERE request_id = ?').run(requestId);
    target.prepare('DELETE FROM support_events WHERE request_id = ?').run(requestId);
    const result = target.prepare('DELETE FROM support_requests WHERE id = ?').run(requestId);
    target.exec('COMMIT');
    return result.changes > 0;
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
}

function purgeExpiredSupportRequestsSqlite({ cutoff }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const placeholders = CLOSED_SUPPORT_STATUSES.map(() => '?').join(', ');
  const expired = target.prepare(`SELECT id FROM support_requests
    WHERE status IN (${placeholders}) AND closed_at IS NOT NULL AND closed_at <= ?`)
    .all(...CLOSED_SUPPORT_STATUSES, cutoff);
  for (const request of expired) deleteSupportRequestSqlite(request.id, target);
  return expired.length;
}

async function createSupportRequest(input, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.createSupportRequest
    ? storage.createSupportRequest(input)
    : createSupportRequestSqlite(input, storage);
}

async function listSupportRequests(options = {}, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.listSupportRequests
    ? storage.listSupportRequests(options)
    : listSupportRequestsSqlite(options, storage);
}

async function getSupportRequest(id, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.getSupportRequest
    ? storage.getSupportRequest(id)
    : getSupportRequestSqlite(id, storage);
}

async function getSupportConversation(id, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.getSupportConversation
    ? storage.getSupportConversation(id)
    : getSupportConversationSqlite(id, storage);
}

async function countOpenSupportRequests(requesterId, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.countOpenSupportRequests
    ? storage.countOpenSupportRequests(requesterId)
    : countOpenSupportRequestsSqlite(requesterId, storage);
}

async function addSupportMessage(input, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.addSupportMessage
    ? storage.addSupportMessage(input)
    : addSupportMessageSqlite(input, storage);
}

async function updateSupportRequest(input, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.updateSupportRequest
    ? storage.updateSupportRequest(input)
    : updateSupportRequestSqlite(input, storage);
}

async function deleteSupportRequest(requestId, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.deleteSupportRequest
    ? storage.deleteSupportRequest(requestId)
    : deleteSupportRequestSqlite(requestId, storage);
}

async function purgeExpiredSupportRequests({ cutoff }, storage) {
  storage = resolveRuntimeStore('support', storage);
  return storage?.purgeExpiredSupportRequests
    ? storage.purgeExpiredSupportRequests({ cutoff })
    : purgeExpiredSupportRequestsSqlite({ cutoff }, storage);
}

module.exports = {
  addSupportMessage,
  countOpenSupportRequests,
  createSupportRequest,
  deleteSupportRequest,
  getSupportConversation,
  getSupportRequest,
  listSupportRequests,
  purgeExpiredSupportRequests,
  updateSupportRequest,
};
