const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_PUBLISHED_MESSAGES,
  createPublishedMessage,
  deletePublishedMessage,
  getPublishedMessage,
  listPublishedMessages,
  updatePublishedMessage,
} = require('../src/database/publishedMessageStore');

function memoryStorage() {
  const records = new Map();
  return {
    getConfiguration(guildId, section) {
      return records.get(`${guildId}:${section}`) || null;
    },
    setConfiguration(guildId, section, value) {
      records.set(`${guildId}:${section}`, value);
      return value;
    },
  };
}

test('enregistre puis modifie un message publié depuis le panel', () => {
  const storage = memoryStorage();
  const created = createPublishedMessage('guild-1', {
    messageId: 'message-1',
    channelId: 'channel-1',
    channelName: 'annonces',
    title: 'Première annonce',
    description: 'Contenu initial',
  }, storage);

  assert.equal(listPublishedMessages('guild-1', storage).length, 1);
  assert.equal(getPublishedMessage('guild-1', created.id, storage).messageId, 'message-1');
  const updated = updatePublishedMessage('guild-1', created.id, {
    ...created,
    title: 'Annonce corrigée',
    description: 'Nouveau contenu',
  }, storage);
  assert.equal(updated.title, 'Annonce corrigée');
  assert.equal(updated.messageId, 'message-1');
  assert.equal(updated.channelId, 'channel-1');
});

test('borne la bibliothèque aux publications les plus récentes', () => {
  const storage = memoryStorage();
  for (let index = 0; index < MAX_PUBLISHED_MESSAGES + 3; index += 1) {
    createPublishedMessage('guild-2', {
      messageId: `message-${index}`,
      channelId: 'channel-2',
      channelName: 'annonces',
      title: `Annonce ${index}`,
    }, storage);
  }
  assert.equal(listPublishedMessages('guild-2', storage).length, MAX_PUBLISHED_MESSAGES);
});

test('retire uniquement la publication ciblée de la bibliothèque', () => {
  const storage = memoryStorage();
  const first = createPublishedMessage('guild-3', { messageId: 'message-1', channelId: 'channel', title: 'Première' }, storage);
  const second = createPublishedMessage('guild-3', { messageId: 'message-2', channelId: 'channel', title: 'Seconde' }, storage);
  const removed = deletePublishedMessage('guild-3', first.id, storage);
  assert.equal(removed.messageId, 'message-1');
  assert.deepEqual(listPublishedMessages('guild-3', storage).map((item) => item.id), [second.id]);
  assert.equal(deletePublishedMessage('guild-3', 'inconnu', storage), null);
});
