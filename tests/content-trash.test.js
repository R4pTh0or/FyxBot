const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CONTENT_TRASH_RETENTION_MS,
  archiveContent,
  contentTrashSummary,
  getContentTrashItem,
  listContentTrash,
  removeContentTrashItem,
} = require('../src/database/contentTrashStore');

function memoryStorage() {
  let value = null;
  return {
    getConfiguration: () => value,
    setConfiguration: (_guildId, _section, next) => { value = next; return next; },
  };
}

test('archive un contenu pendant 30 jours sans exposer son instantané dans le panel', async () => {
  const storage = memoryStorage();
  const now = new Date('2026-09-01T12:00:00.000Z');
  const archived = await archiveContent('guild', {
    kind: 'message', title: 'Annonce', target: 'Messages', snapshot: { content: 'Bonjour', channelId: 'channel' },
  }, storage, { now });
  assert.equal(archived.expiresAt, new Date(now.getTime() + CONTENT_TRASH_RETENTION_MS).toISOString());
  assert.deepEqual(contentTrashSummary(archived), {
    id: archived.id,
    kind: 'message',
    title: 'Annonce',
    target: 'Messages',
    removedAt: now.toISOString(),
    expiresAt: archived.expiresAt,
  });
  assert.equal('snapshot' in contentTrashSummary(archived), false);
});

test('ignore automatiquement les contenus expirés', async () => {
  const storage = memoryStorage();
  const now = new Date('2026-09-01T12:00:00.000Z');
  const archived = await archiveContent('guild', {
    kind: 'rules', title: 'Règlement', target: 'Règlement', snapshot: { content: 'Règles' },
  }, storage, { now });
  assert.ok(await getContentTrashItem('guild', archived.id, storage, { now }));
  const afterExpiration = new Date(now.getTime() + CONTENT_TRASH_RETENTION_MS + 1);
  assert.equal((await listContentTrash('guild', storage, { now: afterExpiration })).length, 0);
});

test('retire uniquement l’élément restauré de la corbeille', async () => {
  const storage = memoryStorage();
  const now = new Date('2026-09-01T12:00:00.000Z');
  const first = await archiveContent('guild', {
    kind: 'social', title: 'Chaîne FyxBot', target: 'Social', snapshot: { id: 'source-a' },
  }, storage, { now });
  const second = await archiveContent('guild', {
    kind: 'ticket', title: 'Support', target: 'Tickets', snapshot: { id: 'panel-a' },
  }, storage, { now: new Date(now.getTime() + 1000) });
  assert.equal((await removeContentTrashItem('guild', first.id, storage, { now })).id, first.id);
  assert.deepEqual((await listContentTrash('guild', storage, { now })).map((item) => item.id), [second.id]);
});

test('refuse les types inconnus et les instantanés trop volumineux', async () => {
  const storage = memoryStorage();
  await assert.rejects(() => archiveContent('guild', {
    kind: 'unknown', title: 'Inconnu', snapshot: { id: 'x' },
  }, storage), /ne peut pas être archivé/);
  await assert.rejects(() => archiveContent('guild', {
    kind: 'message', title: 'Trop grand', snapshot: { content: 'x'.repeat(70 * 1024) },
  }, storage), /trop volumineux/);
});
