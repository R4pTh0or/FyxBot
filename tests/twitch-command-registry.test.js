const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TwitchCommandRegistry,
  createDefaultTwitchCommands,
  inspectTwitchMessage,
  sanitizeTwitchCommandResponse,
} = require('../src/services/twitchCommandRegistry');

function chatMessage(overrides = {}) {
  return {
    username: 'viewer',
    userId: '42',
    channel: 'rapto_live',
    text: '!bonjour ami',
    isModerator: false,
    ...overrides,
  };
}

test('exécute une commande personnalisée insensible à la casse avec ses arguments', async () => {
  const registry = new TwitchCommandRegistry();
  registry.registerCustom({ name: '!Bonjour', response: 'Salut la communauté !', cooldownSeconds: 0 });

  const result = await registry.execute({ message: chatMessage({ text: '!BONJOUR ami' }) });
  assert.deepEqual(result, {
    handled: true,
    commandName: 'bonjour',
    custom: true,
    response: 'Salut la communauté !',
  });
});

test('protège les commandes réservées et assainit les réponses', () => {
  const registry = new TwitchCommandRegistry();
  registry.registerBuiltIn('commands', () => 'liste');

  assert.throws(() => registry.registerCustom({ name: 'commands', response: 'piratage' }), /réservée/);
  assert.equal(sanitizeTwitchCommandResponse(' bonjour\r\nle chat '), 'bonjour le chat');
  assert.throws(() => sanitizeTwitchCommandResponse('x'.repeat(401)), /400 caractères/);
});

test('synchronise les commandes valides et signale les entrées ignorées', () => {
  const registry = new TwitchCommandRegistry();
  registry.registerBuiltIn('discord', () => 'Discord');

  const report = registry.syncCustom([
    { name: 'bonjour', response: 'Salut !' },
    { name: 'discord', response: 'Collision' },
    { name: 'x', response: 'Trop court' },
    { name: 'pause', response: 'À bientôt', enabled: false },
  ]);

  assert.deepEqual(report.loaded, ['bonjour', 'pause']);
  assert.equal(report.skipped.length, 2);
  assert.deepEqual(registry.list().map((command) => command.name), ['discord', 'bonjour']);
  assert.deepEqual(registry.list({ includeDisabled: true }).map((command) => command.name), [
    'discord',
    'bonjour',
    'pause',
  ]);
});

test('applique le cooldown par utilisateur et par commande', async () => {
  let now = 10_000;
  const registry = new TwitchCommandRegistry({ now: () => now });
  registry.registerCustom({ name: 'bonjour', response: 'Salut !', cooldownSeconds: 5 });

  assert.equal((await registry.execute({ message: chatMessage() })).response, 'Salut !');
  assert.deepEqual(await registry.execute({ message: chatMessage() }), {
    handled: true,
    commandName: 'bonjour',
    blockedReason: 'cooldown',
    retryAfterMs: 5_000,
  });
  assert.equal((await registry.execute({ message: chatMessage({ userId: '99' }) })).response, 'Salut !');

  now += 5_000;
  assert.equal((await registry.execute({ message: chatMessage() })).response, 'Salut !');
});

test('réserve les commandes modérateur aux modérateurs Twitch', async () => {
  const registry = new TwitchCommandRegistry();
  registry.registerBuiltIn('annonce', () => 'Annonce publiée.', { accessLevel: 'moderator' });

  const denied = await registry.execute({ message: chatMessage({ text: '!annonce' }) });
  assert.equal(denied.blockedReason, 'permission');

  const allowed = await registry.execute({
    message: chatMessage({ text: '!annonce', isModerator: true }),
  });
  assert.equal(allowed.response, 'Annonce publiée.');
});

test('respecte le préfixe et les niveaux abonné, modérateur et diffuseur', async () => {
  const registry = new TwitchCommandRegistry({ prefix: '??', defaultCooldownSeconds: 0 });
  registry.registerCustom({ name: 'sub', response: 'Abonné', accessLevel: 'subscriber' });
  registry.registerCustom({ name: 'modo', response: 'Modo', accessLevel: 'moderator' });
  registry.registerCustom({ name: 'live', response: 'Diffuseur', accessLevel: 'broadcaster' });

  assert.equal((await registry.execute({ message: chatMessage({ text: '!sub', isSubscriber: true }) })).handled, false);
  assert.equal((await registry.execute({ message: chatMessage({ text: '??sub' }) })).blockedReason, 'permission');
  assert.equal((await registry.execute({ message: chatMessage({ text: '??sub', isSubscriber: true }) })).response, 'Abonné');
  assert.equal((await registry.execute({ message: chatMessage({ text: '??modo', isModerator: true }) })).response, 'Modo');
  assert.equal((await registry.execute({ message: chatMessage({ text: '??live', isBroadcaster: true }) })).response, 'Diffuseur');
});

test('fournit les commandes FyxBot par défaut et un uptime déterministe', async () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0);
  const registry = createDefaultTwitchCommands({
    now: () => now,
    discordUrl: 'https://discord.gg/fyxbot',
    websiteUrl: 'https://fyxbot.example/',
    defaultCooldownSeconds: 0,
  });

  const commands = await registry.execute({ message: chatMessage({ text: '!commands' }) });
  assert.match(commands.response, /!discord/);
  assert.match(commands.response, /!uptime/);

  const uptime = await registry.execute({
    message: chatMessage({ text: '!uptime' }),
    streamStartedAt: now - 3_661_000,
  });
  assert.equal(uptime.response, 'Live depuis 1h 1m 1s.');
});

test('fournit les commandes de modération Twitch et vérifie leurs arguments', async () => {
  const actions = [];
  const registry = createDefaultTwitchCommands({
    defaultCooldownSeconds: 0,
    moderationHandler: async (action) => {
      actions.push(action);
      return `Action ${action.action} effectuée.`;
    },
  });
  const moderator = { isModerator: true };

  const help = await registry.execute({ message: chatMessage({ text: '!mod', ...moderator }) });
  assert.match(help.response, /!ban @pseudo/);
  assert.match(help.response, /!slow 0\|3-120/);

  await registry.execute({
    message: chatMessage({ text: '!timeout @Viewer_2 90 spam répété', ...moderator }),
  });
  assert.deepEqual(actions[0], {
    action: 'timeout',
    targetLogin: 'viewer_2',
    durationSeconds: 90,
    reason: 'spam répété',
    message: chatMessage({ text: '!timeout @Viewer_2 90 spam répété', ...moderator }),
  });

  await assert.rejects(
    registry.execute({ message: chatMessage({ text: '!slow 2', ...moderator }) }),
    /3 à 120 secondes/,
  );
  assert.equal((await registry.execute({ message: chatMessage({ text: '!ban viewer' }) })).blockedReason, 'permission');
});

test('détecte les liens, majuscules et répétitions sans bloquer les modérateurs', () => {
  assert.equal(inspectTwitchMessage(chatMessage({ text: 'viens sur https://example.com' })), 'link');
  assert.equal(inspectTwitchMessage(chatMessage({ text: 'BONJOUR TOUT LE MONDE' })), 'caps');
  assert.equal(inspectTwitchMessage(chatMessage({ text: 'nooooooon' })), 'repetition');
  assert.equal(inspectTwitchMessage(chatMessage({ text: 'https://example.com', isModerator: true })), null);
});
