const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresWarningStore } = require('../src/database/postgresWarningStore');
const warningStore = require('../src/database/warningStore');

test('isole les avertissements PostgreSQL par serveur et par membre', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const store = createPostgresWarningStore(database);
    const first = await store.addWarning({ guildId: 'a', userId: 'member', moderatorId: 'mod', reason: 'Spam' });
    assert.equal(first.count, 1);
    assert.match(first.warning.id, /^[a-f0-9]{8}$/);
    const second = await store.addWarning({ guildId: 'a', userId: 'member', moderatorId: 'mod', reason: 'Lien' });
    assert.equal(second.count, 2);
    await store.addWarning({ guildId: 'b', userId: 'member', moderatorId: 'mod', reason: 'Autre serveur' });
    assert.equal((await store.getWarnings('a', 'member')).length, 2);
    assert.equal((await store.getWarnings('b', 'member')).length, 1);
    assert.equal(await store.removeWarning('b', 'member', first.warning.id), null);
    assert.equal((await store.removeWarning('a', 'member', first.warning.id)).reason, 'Spam');
    assert.equal(await store.clearWarnings('a', 'member'), 1);
    assert.equal(await store.clearGuildWarnings('b'), 1);
    assert.deepEqual(await store.getWarnings('a', 'member'), []);
    assert.deepEqual(await store.getWarnings('b', 'member'), []);
  } finally {
    await database.close();
  }
});

test('refuse de construire un magasin PostgreSQL sur un schéma arbitraire', () => {
  assert.throws(() => createPostgresWarningStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresWarningStore({ query() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
});

test('les commandes d’avertissement utilisent le magasin PostgreSQL injecté', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const storage = createPostgresWarningStore(database);
    const added = await warningStore.addWarning({ guildId: 'g', userId: 'u', moderatorId: 'm', reason: 'test' }, storage);
    assert.equal((await warningStore.getWarnings('g', 'u', storage)).length, 1);
    assert.equal((await warningStore.removeWarning('g', 'u', added.warning.id, storage)).reason, 'test');
    await warningStore.addWarning({ guildId: 'g', userId: 'u', moderatorId: 'm', reason: 'test' }, storage);
    assert.equal(await warningStore.clearWarnings('g', 'u', storage), 1);
    await warningStore.addWarning({ guildId: 'g', userId: 'u', moderatorId: 'm', reason: 'test' }, storage);
    assert.equal(await warningStore.clearGuildWarnings('g', storage), 1);
  } finally {
    await database.close();
  }
});
