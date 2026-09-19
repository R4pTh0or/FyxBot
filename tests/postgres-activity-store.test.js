const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresActivityStore } = require('../src/database/postgresActivityStore');
const { addAuditLog, getRecentAuditLogs } = require('../src/database/auditLogStore');
const { addSuggestion, getRecentSuggestions, getSuggestion, reviewSuggestion } = require('../src/database/suggestionRecordStore');
const { recordCommandUsage, getCommandUsageStats } = require('../src/database/commandUsageStore');
const { recordChange, getChange, listChanges, markChangeRolledBack } = require('../src/database/changeHistoryStore');

test('migre les journaux, suggestions, statistiques et historique vers PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const store = createPostgresActivityStore(database);
    await addAuditLog('guild-a', { title: 'Interface', description: 'Écriture asynchrone', color: 123 }, store);
    assert.equal((await getRecentAuditLogs('guild-a', 30, store))[0].title, 'Interface');
    await store.addAuditLog('guild-a', { title: 'A', description: 'Premier journal', color: 123 });
    await store.addAuditLog('guild-b', { title: 'B', description: 'Autre serveur', color: 123 });
    assert.deepEqual((await store.getRecentAuditLogs('guild-a')).map((row) => row.title), ['A', 'Interface']);

    await store.addSuggestion({ id: 'suggestion-a', guildId: 'guild-a', channelId: 'channel', messageId: 'message',
      authorId: 'member', authorName: 'Alice', anonymous: true, idea: 'Une idée' });
    assert.equal((await store.getRecentSuggestions('guild-a'))[0].authorName, 'Anonyme');
    assert.equal((await store.getRecentSuggestions('guild-b')).length, 0);
    assert.equal((await store.getSuggestion('guild-a', 'suggestion-a')).author_id, 'member');
    assert.equal(await store.getSuggestion('guild-b', 'suggestion-a'), null);
    assert.ok(await store.reviewSuggestion('guild-a', 'suggestion-a', 'accepted', 'staff'));
    assert.equal((await store.getSuggestion('guild-a', 'suggestion-a')).status, 'accepted');
    await addSuggestion({ id: 'suggestion-b', guildId: 'guild-b', channelId: 'channel', messageId: 'message',
      authorId: 'member', authorName: 'Bob', anonymous: false, idea: 'Autre idée' }, store);
    assert.equal((await getRecentSuggestions('guild-b', 30, store))[0].authorName, 'Bob');
    assert.equal((await getSuggestion('guild-b', 'suggestion-b', store)).status, 'pending');
    await reviewSuggestion('guild-b', 'suggestion-b', 'rejected', 'staff', store);
    assert.equal((await getSuggestion('guild-b', 'suggestion-b', store)).status, 'rejected');

    await recordCommandUsage('guild-a', 'ping', true, store);
    await store.recordCommandUsage('guild-a', 'ping', false);
    await store.recordCommandUsage('guild-b', 'setup', true);
    const stats = await getCommandUsageStats(store);
    assert.equal(stats.totalCommands30d, 3);
    assert.equal(stats.failedCommands30d, 1);
    assert.equal(stats.activeGuilds30d, 2);
    assert.equal(stats.topCommands[0].commandName, 'ping');

    const change = await recordChange('guild-a', { actorId: 'staff', title: 'Config', details: { ok: true },
      backupFile: 'safe.snapshot', reversible: true }, { storage: store });
    assert.equal(change.reversible, true);
    assert.deepEqual(change.details, { ok: true });
    assert.equal((await listChanges('guild-b', 30, { storage: store })).length, 0);
    assert.equal(await markChangeRolledBack('guild-a', change.id, 'Nova', { storage: store }), true);
    assert.equal(await markChangeRolledBack('guild-a', change.id, 'Nova', { storage: store }), false);
    assert.equal((await getChange('guild-a', change.id, { storage: store })).status, 'rolled_back');
  } finally {
    await database.close();
  }
});

test('refuse un schéma PostgreSQL non sûr', () => {
  assert.throws(() => createPostgresActivityStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresActivityStore({ query() {} }, { schema: 'public;DROP' }), /schéma PostgreSQL invalide/);
});
