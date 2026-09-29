const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresSupportStore } = require('../src/database/postgresSupportStore');
const { createPostgresSupportStaffStore } = require('../src/database/postgresSupportStaffStore');
const supportApi = require('../src/database/supportStore');

async function withPostgres(operation) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
    };
    await operation(pool, database);
  } finally {
    await database.close();
  }
}

test('isole les demandes et historise les réponses Support sous PostgreSQL', async () => {
  await withPostgres(async (pool) => {
    const support = createPostgresSupportStore(pool);
    const a = await supportApi.createSupportRequest({
      guildId: 'guild-a', guildName: 'A', requesterId: 'user-a', requesterName: 'Alice',
      category: 'technical', subject: 'Une question', priority: 'normal', message: 'Bonjour',
    }, support);
    await support.createSupportRequest({
      guildId: 'guild-b', guildName: 'B', requesterId: 'user-b', requesterName: 'Bob',
      category: 'technical', subject: 'Autre question', priority: 'urgent', message: 'Aide',
    });
    assert.equal(a.status, 'open');
    assert.equal(await supportApi.countOpenSupportRequests('user-a', support), 1);
    assert.equal((await supportApi.listSupportRequests({ requesterId: 'user-a' }, support)).length, 1);
    assert.equal((await support.listSupportRequests({ requesterId: 'user-b', guildId: 'guild-a' })).length, 0);
    assert.equal((await support.listSupportRequests()).length, 0);
    assert.equal((await support.listSupportRequests({ includeAll: true }))[0].priority, 'urgent');

    const messageId = await supportApi.addSupportMessage({
      requestId: a.id, authorId: 'staff', authorName: 'Nova', authorRole: 'staff', body: 'Réponse',
    }, support);
    assert.ok(messageId);
    assert.equal((await support.listSupportRequests({ requesterId: 'user-a' }))[0].messageCount, 2);
    assert.equal((await support.listSupportRequests({ requesterId: 'user-a' }))[0].lastAuthorRole, 'staff');
    const updated = await supportApi.updateSupportRequest({
      requestId: a.id, status: 'waiting_user', priority: 'high', actorId: 'staff', actorName: 'Nova',
    }, support);
    assert.equal(updated.status, 'waiting_user');
    const conversation = await supportApi.getSupportConversation(a.id, support);
    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.events.length, 2);
    assert.match(conversation.events[1].detail, /waiting_user/);
    assert.equal(await support.addSupportMessage({ requestId: 'missing', authorId: 'x', authorName: 'X', authorRole: 'staff', body: 'X' }), null);
    assert.equal(await support.getSupportConversation('missing'), null);
    const closed = await support.updateSupportRequest({ requestId: a.id, status: 'closed', priority: 'high', actorId: 'user-a', actorName: 'Alice' });
    assert.equal(closed.status, 'closed');
    assert.ok(closed.closedAt);
    const closedConversation = await support.getSupportConversation(a.id);
    assert.equal(closedConversation.messages.length, 2);
    assert.equal(closedConversation.events.length, 3);
    assert.match(closedConversation.events[2].detail, /closed/);
    assert.equal(await support.countOpenSupportRequests('user-a'), 0);
    await pool.query('UPDATE fyxbot.support_requests SET closed_at = $1 WHERE id = $2', ['2026-01-01T00:00:00.000Z', a.id]);
    assert.equal(await support.purgeExpiredSupportRequests({ cutoff: '2026-04-01T00:00:00.000Z' }), 1);
    assert.equal(await support.getSupportConversation(a.id), null);

    const removable = await support.createSupportRequest({
      guildId: 'guild-a', guildName: 'A', requesterId: 'user-a', requesterName: 'Alice',
      category: 'technical', subject: 'À supprimer', priority: 'normal', message: 'Suppression demandée',
    });
    assert.equal(await support.deleteSupportRequest(removable.id), true);
    assert.equal(await support.deleteSupportRequest(removable.id), false);
  });
});

test('annule intégralement une création Support qui échoue', async () => {
  await withPostgres(async (pool, database) => {
    const support = createPostgresSupportStore(pool);
    await assert.rejects(() => support.createSupportRequest({
      guildId: 'guild-a', guildName: 'A', requesterId: 'user-a', requesterName: 'Alice',
      category: 'technical', subject: 'Une question', priority: 'normal', message: null,
    }));
    const result = await database.query('SELECT COUNT(*)::int AS total FROM fyxbot.support_requests');
    assert.equal(result.rows[0].total, 0);
  });
});

test('gère les droits de l’équipe Support sous PostgreSQL', async () => {
  await withPostgres(async (pool) => {
    const staff = createPostgresSupportStaffStore(pool);
    const { getSupportStaff, listSupportStaff, upsertSupportStaff, removeSupportStaff } = require('../src/database/supportStaffStore');
    assert.equal(await getSupportStaff('user-a', staff), null);
    await upsertSupportStaff({ userId: 'user-a', displayName: 'Nova', role: 'moderator', grantedBy: 'owner' }, staff);
    const updated = await upsertSupportStaff({ userId: 'user-a', displayName: 'Nova', role: 'administrator', grantedBy: 'owner' }, staff);
    assert.equal(updated.role, 'administrator');
    assert.equal((await listSupportStaff(staff)).length, 1);
    assert.equal(await removeSupportStaff('user-a', staff), true);
    assert.equal(await removeSupportStaff('user-a', staff), false);
  });
});

test('refuse les noms de schéma PostgreSQL arbitraires', () => {
  assert.throws(() => createPostgresSupportStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresSupportStore({ query() {}, connect() {} }, { schema: 'public;DROP' }), /schéma PostgreSQL invalide/);
  assert.throws(() => createPostgresSupportStaffStore({ query() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
});
