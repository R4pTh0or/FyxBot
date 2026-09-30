const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FyxFlowValidationError,
  buildFyxFlowSimulation,
  executeFyxFlowTrigger,
  normalizeFlow,
  saveFyxFlow,
  setFyxFlowActive,
} = require('../src/services/fyxFlow');
const { getFyxFlowConfig } = require('../src/database/fyxFlowStore');

function memoryStorage() {
  const values = new Map();
  return {
    async getConfiguration(guildId, section) {
      return values.get(`${guildId}:${section}`) || null;
    },
    async setConfiguration(guildId, section, value) {
      values.set(`${guildId}:${section}`, structuredClone(value));
      return value;
    },
    async updateConfiguration(guildId, section, updater) {
      const key = `${guildId}:${section}`;
      const value = await updater(values.get(key) || null);
      values.set(key, structuredClone(value));
      return value;
    },
  };
}

const channelId = '123456789012345678';
const roleId = '223456789012345678';
const options = { channelIds: new Set([channelId]), roleIds: new Set([roleId]) };

test('simule un scénario sans l’activer', () => {
  const result = buildFyxFlowSimulation({
    name: 'Bienvenue personnalisée',
    trigger: 'member_join',
    action: { type: 'send_message', channelId, message: 'Bienvenue {membre}' },
  }, options);
  assert.equal(result.previewOnly, true);
  assert.equal(result.flow.active, false);
  assert.equal(result.steps.length, 4);
});

test('refuse une attribution de rôle lors du départ', () => {
  assert.throws(() => normalizeFlow({
    name: 'Rôle impossible',
    trigger: 'member_leave',
    action: { type: 'assign_role', roleId },
  }, options), FyxFlowValidationError);
});

test('simule les déclencheurs règlement et ticket', () => {
  for (const trigger of ['rules_accepted', 'ticket_created']) {
    const result = buildFyxFlowSimulation({
      name: `Scénario ${trigger}`,
      trigger,
      action: { type: 'send_message', channelId, message: 'Action pour {membre} dans {ticket}' },
    }, options);
    assert.equal(result.flow.trigger, trigger);
    assert.match(result.steps[0], trigger === 'rules_accepted' ? /accepte le règlement/ : /crée un ticket/);
  }
});

test('enregistre un brouillon désactivé et redésactive toute modification', async () => {
  const storage = memoryStorage();
  const first = await saveFyxFlow('guild-a', {
    name: 'Message arrivée', trigger: 'member_join',
    action: { type: 'send_message', channelId, message: 'Bonjour' },
  }, options, storage);
  const flow = first.flows[0];
  await setFyxFlowActive('guild-a', flow.id, true, options, storage);
  await saveFyxFlow('guild-a', {
    ...flow,
    name: 'Message arrivée modifié',
    active: true,
  }, options, storage);
  const current = await getFyxFlowConfig('guild-a', storage);
  assert.equal(current.flows[0].name, 'Message arrivée modifié');
  assert.equal(current.flows[0].active, false);
});

test('exécute un message actif et conserve un historique borné par serveur', async () => {
  const storage = memoryStorage();
  const sent = [];
  const saved = await saveFyxFlow('guild-a', {
    name: 'Accueil réel', trigger: 'member_join',
    action: { type: 'send_message', channelId, message: 'Bienvenue {membre} sur {serveur}, membre {nombre}' },
  }, options, storage);
  await setFyxFlowActive('guild-a', saved.flows[0].id, true, options, storage);
  const channel = { isTextBased: () => true, send: async (payload) => sent.push(payload) };
  const member = {
    id: '323456789012345678',
    user: { bot: false },
    guild: {
      id: 'guild-a', name: 'Serveur test', memberCount: 42,
      channels: { cache: new Map([[channelId, channel]]), fetch: async () => channel },
      roles: { cache: new Map(), fetch: async () => null },
    },
  };
  const result = await executeFyxFlowTrigger(member, 'member_join', storage);
  const config = await getFyxFlowConfig('guild-a', storage);
  assert.equal(result[0].status, 'success');
  assert.equal(sent[0].content, 'Bienvenue <@323456789012345678> sur Serveur test, membre 42');
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: ['323456789012345678'] });
  assert.equal(config.history.length, 1);
  assert.equal((await getFyxFlowConfig('guild-b', storage)).history.length, 0);
});

test('rend le salon du ticket dans un message FyxFlow', async () => {
  const storage = memoryStorage();
  const sent = [];
  const saved = await saveFyxFlow('guild-ticket', {
    name: 'Alerte ticket', trigger: 'ticket_created',
    action: { type: 'send_message', channelId: 'event_channel', message: 'Bienvenue {membre} dans {ticket}' },
  }, options, storage);
  await setFyxFlowActive('guild-ticket', saved.flows[0].id, true, options, storage);
  const destination = { isTextBased: () => true, send: async (payload) => sent.push(payload) };
  const member = {
    id: '323456789012345678', user: { bot: false },
    guild: {
      id: 'guild-ticket', name: 'Serveur test', memberCount: 12,
      channels: { cache: new Map([[channelId, destination]]), fetch: async () => destination },
      roles: { cache: new Map(), fetch: async () => null },
    },
  };
  const ticketChannel = { id: '423456789012345678', isTextBased: () => true, send: async (payload) => sent.push(payload) };
  await executeFyxFlowTrigger(member, 'ticket_created', storage, { channel: ticketChannel });
  assert.equal(sent[0].content, 'Bienvenue <@323456789012345678> dans <#423456789012345678>');
});
