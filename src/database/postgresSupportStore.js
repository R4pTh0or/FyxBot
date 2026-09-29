const { randomUUID } = require('node:crypto');
const { CLOSED_SUPPORT_STATUSES } = require('../services/supportManagement');

function createPostgresSupportStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = (name) => `"${schema}"."${name}"`;
  const requests = table('support_requests');
  const messages = table('support_messages');
  const events = table('support_events');
  const requestFields = `id, guild_id AS "guildId", guild_name AS "guildName",
    requester_id AS "requesterId", requester_name AS "requesterName", category, subject,
    priority, status, created_at AS "createdAt", updated_at AS "updatedAt",
    last_message_at AS "lastMessageAt", closed_at AS "closedAt"`;

  async function transaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* La connexion peut être fermée. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function getSupportRequest(id, client = pool) {
    const result = await client.query(`SELECT ${requestFields} FROM ${requests} WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async function createSupportRequest({ guildId, guildName, requesterId, requesterName, category, subject, priority, message }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    return transaction(async (client) => {
      await client.query(`INSERT INTO ${requests}
        (id, guild_id, guild_name, requester_id, requester_name, category, subject, priority, status,
         created_at, updated_at, last_message_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $9, $9)`,
      [id, guildId, guildName, requesterId, requesterName, category, subject, priority, now]);
      await client.query(`INSERT INTO ${messages}
        (id, request_id, author_id, author_name, author_role, body, created_at)
        VALUES ($1, $2, $3, $4, 'user', $5, $6)`,
      [randomUUID(), id, requesterId, requesterName, message, now]);
      await client.query(`INSERT INTO ${events}
        (id, request_id, actor_id, actor_name, event_type, detail, created_at)
        VALUES ($1, $2, $3, $4, 'created', 'Demande créée', $5)`,
      [randomUUID(), id, requesterId, requesterName, now]);
      return getSupportRequest(id, client);
    });
  }

  async function listSupportRequests({ requesterId = null, guildId = null, includeAll = false, status = null, limit = 100 } = {}) {
    if (!includeAll && !requesterId) return [];
    const clauses = [];
    const parameters = [];
    function where(column, value) {
      parameters.push(value);
      clauses.push(`${column} = $${parameters.length}`);
    }
    if (!includeAll) where('requester_id', requesterId);
    if (guildId) where('guild_id', guildId);
    if (status) where('status', status);
    parameters.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
    const result = await pool.query(`SELECT ${requestFields},
      (SELECT COUNT(*)::int FROM ${messages} WHERE request_id = ${requests}.id) AS "messageCount",
      (SELECT author_role FROM ${messages} WHERE request_id = ${requests}.id
        ORDER BY created_at DESC, id DESC LIMIT 1) AS "lastAuthorRole"
      FROM ${requests} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        updated_at DESC LIMIT $${parameters.length}`, parameters);
    return result.rows;
  }

  async function getSupportConversation(id) {
    const request = await getSupportRequest(id);
    if (!request) return null;
    const [messageResult, eventResult] = await Promise.all([
      pool.query(`SELECT id, request_id AS "requestId", author_id AS "authorId",
        author_name AS "authorName", author_role AS "authorRole", body, created_at AS "createdAt"
        FROM ${messages} WHERE request_id = $1 ORDER BY created_at, id`, [id]),
      pool.query(`SELECT id, request_id AS "requestId", actor_id AS "actorId",
        actor_name AS "actorName", event_type AS "eventType", detail, created_at AS "createdAt"
        FROM ${events} WHERE request_id = $1 ORDER BY created_at, id`, [id]),
    ]);
    return { request, messages: messageResult.rows, events: eventResult.rows };
  }

  async function countOpenSupportRequests(requesterId) {
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM ${requests}
      WHERE requester_id = $1 AND status <> ALL($2::text[])`, [requesterId, CLOSED_SUPPORT_STATUSES]);
    return result.rows[0].total;
  }

  async function addSupportMessage({ requestId, authorId, authorName, authorRole, body }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    return transaction(async (client) => {
      const request = await client.query(`SELECT id FROM ${requests} WHERE id = $1 FOR UPDATE`, [requestId]);
      if (request.rows.length === 0) return null;
      await client.query(`INSERT INTO ${messages}
        (id, request_id, author_id, author_name, author_role, body, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, requestId, authorId, authorName, authorRole, body, now]);
      await client.query(`UPDATE ${requests} SET updated_at = $1, last_message_at = $1 WHERE id = $2`, [now, requestId]);
      return id;
    });
  }

  async function updateSupportRequest({ requestId, status, priority, actorId, actorName }) {
    return transaction(async (client) => {
      const locked = await client.query(`SELECT ${requestFields} FROM ${requests} WHERE id = $1 FOR UPDATE`, [requestId]);
      const current = locked.rows[0];
      if (!current) return null;
      const changes = [];
      if (current.status !== status) changes.push(`Statut : ${current.status} → ${status}`);
      if (current.priority !== priority) changes.push(`Priorité : ${current.priority} → ${priority}`);
      if (changes.length === 0) return current;
      const now = new Date().toISOString();
      const closedAt = CLOSED_SUPPORT_STATUSES.includes(status) ? now : null;
      await client.query(`UPDATE ${requests}
        SET status = $1, priority = $2, updated_at = $3, closed_at = $4 WHERE id = $5`,
      [status, priority, now, closedAt, requestId]);
      await client.query(`INSERT INTO ${events}
        (id, request_id, actor_id, actor_name, event_type, detail, created_at)
        VALUES ($1, $2, $3, $4, 'updated', $5, $6)`,
      [randomUUID(), requestId, actorId, actorName, changes.join(' · '), now]);
      return getSupportRequest(requestId, client);
    });
  }

  async function deleteSupportRequest(requestId) {
    return transaction(async (client) => {
      const result = await client.query(`DELETE FROM ${requests} WHERE id = $1 RETURNING id`, [requestId]);
      return result.rows.length > 0;
    });
  }

  async function purgeExpiredSupportRequests({ cutoff }) {
    return transaction(async (client) => {
      const result = await client.query(`DELETE FROM ${requests}
        WHERE status = ANY($1::text[]) AND closed_at IS NOT NULL AND closed_at <= $2
        RETURNING id`, [CLOSED_SUPPORT_STATUSES, cutoff]);
      return result.rows.length;
    });
  }

  return {
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
}

module.exports = { createPostgresSupportStore };
