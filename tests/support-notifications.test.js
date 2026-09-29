const assert = require('node:assert/strict');
const test = require('node:test');
const { notificationRecipients, notifySupport, supportLink } = require('../src/services/supportNotifications');

const request = { id: '7bb33964-6e51-45cf-9879-b0bfc18f6583', requesterId: 'requester' };
const panelUrl = 'https://fyxbot.example/v2';

function fakeClient({ owner = { id: 'owner' }, failId = null } = {}) {
  const sent = [];
  const client = {
    application: { owner, fetch: async () => {} },
    users: { fetch: async id => ({
      send: async payload => {
        if (id === failId) throw new Error('Les messages privés sont désactivés.');
        sent.push({ id, payload });
      },
    }) },
  };
  return { client, sent };
}

test('construit un lien HTTPS vers la demande sans exposer son contenu', () => {
  assert.equal(supportLink(panelUrl, request.id), `https://fyxbot.example/v2?supportRequest=${request.id}`);
  assert.equal(supportLink('http://127.0.0.1:3000/v2', request.id), null);
  assert.equal(supportLink('not a url', request.id), null);
});

test('évite les notifications en double et ne notifie pas l’auteur', () => {
  assert.deepEqual(notificationRecipients({ kind: 'created', request, actorId: 'requester', ownerId: 'owner', staffIds: ['owner', 'staff', 'staff'] }), ['owner', 'staff']);
  assert.deepEqual(notificationRecipients({ kind: 'staff_reply', request, actorId: 'staff' }), ['requester']);
  assert.deepEqual(notificationRecipients({ kind: 'staff_reply', request, actorId: 'requester' }), []);
  assert.deepEqual(notificationRecipients({ kind: 'status_closed', request, actorId: 'staff' }), ['requester']);
  assert.deepEqual(notificationRecipients({ kind: 'user_closed', request, actorId: 'requester', ownerId: 'owner', staffIds: ['staff'] }), ['owner', 'staff']);
  assert.deepEqual(notificationRecipients({ kind: 'user_reopened', request, actorId: 'requester', ownerId: 'owner', staffIds: ['staff'] }), ['owner', 'staff']);
  assert.deepEqual(notificationRecipients({ kind: 'status_reopened', request, actorId: 'staff' }), ['requester']);
});

test('le mode local ne produit aucun message privé', async () => {
  const { client, sent } = fakeClient();
  const result = await notifySupport(client, { kind: 'created', request, actorId: 'requester' }, {
    environment: 'development', panelUrl, listStaff: async () => [{ userId: 'staff' }],
  });
  assert.deepEqual(result, { sent: 0, skipped: true });
  assert.equal(sent.length, 0);
});

test('notifie en production le propriétaire et le personnel, sans corps de demande', async () => {
  const { client, sent } = fakeClient({ owner: { id: 'team', ownerId: 'owner' } });
  const result = await notifySupport(client, { kind: 'created', request, actorId: 'requester' }, {
    environment: 'production', panelUrl, listStaff: async () => [{ userId: 'owner' }, { userId: 'staff' }],
  });
  assert.equal(result.sent, 2);
  assert.deepEqual(sent.map(entry => entry.id), ['owner', 'staff']);
  assert.ok(sent.every(entry => entry.payload.content.includes(`supportRequest=${request.id}`)));
  assert.ok(sent.every(entry => entry.payload.allowedMentions.parse.length === 0));
});

test('un refus de message privé ne fait pas échouer la demande', async () => {
  const { client, sent } = fakeClient({ failId: 'requester' });
  const result = await notifySupport(client, { kind: 'staff_reply', request, actorId: 'staff' }, {
    environment: 'production', panelUrl,
  });
  assert.equal(result.failed, 1);
  assert.equal(sent.length, 0);
});

test('notifie l’équipe lorsque l’utilisateur ferme sa demande', async () => {
  const { client, sent } = fakeClient();
  const result = await notifySupport(client, { kind: 'user_closed', request, actorId: 'requester' }, {
    environment: 'production', panelUrl, listStaff: async () => [{ userId: 'staff' }],
  });
  assert.equal(result.sent, 2);
  assert.deepEqual(sent.map(entry => entry.id), ['owner', 'staff']);
  assert.ok(sent.every(entry => entry.payload.content.includes('a fermé sa demande')));
});

test('notifie l’équipe lorsque l’utilisateur rouvre sa demande', async () => {
  const { client, sent } = fakeClient();
  const result = await notifySupport(client, { kind: 'user_reopened', request, actorId: 'requester' }, {
    environment: 'production', panelUrl, listStaff: async () => [{ userId: 'staff' }],
  });
  assert.equal(result.sent, 2);
  assert.ok(sent.every(entry => entry.payload.content.includes('a rouvert sa demande')));
});
