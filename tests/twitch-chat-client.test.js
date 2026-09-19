const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TwitchChatClient,
  parseTwitchChatMessage,
  sanitizeChatMessage,
} = require('../src/services/twitchChatClient');

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
  }

  emit(name, event = {}) {
    if (name === 'open') this.readyState = 1;
    if (name === 'close') this.readyState = 3;
    for (const handler of this.listeners.get(name) || []) handler(event);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.emit('close');
  }
}

async function connectClient(options = {}) {
  const socket = new FakeSocket();
  const client = new TwitchChatClient({
    username: 'FyxBot',
    accessToken: 'oauth:test-secret',
    channel: '#rapto_live',
    webSocketFactory: () => socket,
    ...options,
  });
  const connected = client.connect();
  socket.emit('open');
  socket.emit('message', { data: ':tmi.twitch.tv 001 fyxbot :Welcome, GLHF!\r\n' });
  await connected;
  return { client, socket };
}

test('parse les tags utiles et le rôle de modérateur', () => {
  const message = parseTwitchChatMessage(
    '@badges=broadcaster/1;color=#fff;id=msg-1;mod=0;user-id=42 :Rapto!rapto@rapto.tmi.twitch.tv PRIVMSG #FyxBot :Bonjour !',
  );

  assert.deepEqual(message, {
    username: 'rapto',
    channel: 'fyxbot',
    text: 'Bonjour !',
    messageId: 'msg-1',
    userId: '42',
    isBroadcaster: true,
    isModerator: true,
    isSubscriber: true,
  });
});

test('effectue la poignée de main IRC et répond au PING', async () => {
  const socket = new FakeSocket();
  const statuses = [];
  const client = new TwitchChatClient({
    username: 'FyxBot',
    accessToken: 'oauth:test-secret',
    channel: '#rapto_live',
    webSocketFactory: () => socket,
  });
  client.onStatus((connected) => statuses.push(connected));
  const connection = client.connect();
  socket.emit('open');

  assert.deepEqual(socket.sent, [
    'PASS oauth:test-secret\r\n',
    'NICK fyxbot\r\n',
    'CAP REQ :twitch.tv/tags twitch.tv/commands\r\n',
    'JOIN #rapto_live\r\n',
  ]);
  assert.equal(client.sendMessage('Trop tôt'), false);
  assert.deepEqual(statuses, []);

  socket.emit('message', { data: ':tmi.twitch.tv 001 fyxbot :Welcome, GLHF!\r\n' });
  await connection;
  assert.deepEqual(statuses, [true]);

  socket.emit('message', { data: 'PING :tmi.twitch.tv\r\n' });
  assert.equal(socket.sent.at(-1), 'PONG :tmi.twitch.tv\r\n');
  client.disconnect();
});

test('ferme une authentification refusée et conserve les reconnexions bornées', async () => {
  const sockets = [];
  const timers = [];
  const errors = [];
  const client = new TwitchChatClient({
    username: 'fyxbot',
    accessToken: 'token-invalide',
    channel: 'rapto_live',
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    setTimeoutFn: (handler, delay) => {
      timers.push({ handler, delay });
      return timers.length;
    },
    clearTimeoutFn: () => {},
    reconnectDelayMs: 100,
    maximumReconnectDelayMs: 200,
    maximumReconnectAttempts: 1,
  });
  client.onError((error) => errors.push(error.message));

  const connection = client.connect();
  sockets[0].emit('open');
  sockets[0].emit('message', { data: ':tmi.twitch.tv NOTICE * :Login authentication failed\r\n' });
  await connection;

  assert.equal(sockets[0].readyState, 3);
  assert.deepEqual(timers.map((timer) => timer.delay), [100]);
  assert.ok(errors.includes('Authentification Twitch refusée.'));

  timers.shift().handler();
  sockets[1].emit('open');
  sockets[1].emit('message', { data: ':tmi.twitch.tv NOTICE * :Login authentication failed.\r\n' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.length, 0);
  assert.ok(errors.includes('Nombre maximal de reconnexions Twitch atteint.'));
  client.disconnect();
});

test('ignore son propre écho et déduplique exactement les message-id', async () => {
  const { client, socket } = await connectClient();
  const received = [];
  client.onMessage((message) => received.push(message));

  socket.emit('message', {
    data: [
      '@id=same;mod=0;user-id=1 :viewer!v@v PRIVMSG #rapto_live :bonjour',
      '@id=same;mod=0;user-id=1 :viewer!v@v PRIVMSG #rapto_live :bonjour',
      '@id=other;mod=0;user-id=2 :fyxbot!b@b PRIVMSG #rapto_live :echo',
    ].join('\r\n'),
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].text, 'bonjour');
  client.disconnect();
});

test('borne les reconnexions et applique un délai exponentiel plafonné', async () => {
  const sockets = [];
  const timers = [];
  const errors = [];
  const client = new TwitchChatClient({
    username: 'fyxbot',
    accessToken: 'token',
    channel: 'rapto_live',
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    setTimeoutFn: (handler, delay) => {
      timers.push({ handler, delay });
      return timers.length;
    },
    clearTimeoutFn: () => {},
    reconnectDelayMs: 100,
    maximumReconnectDelayMs: 150,
    maximumReconnectAttempts: 2,
  });
  client.onError((error) => errors.push(error.message));

  const firstConnection = client.connect();
  sockets[0].emit('error', {});
  await firstConnection;
  assert.deepEqual(timers.map((timer) => timer.delay), [100]);

  timers.shift().handler();
  sockets[1].emit('error', {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(timers.map((timer) => timer.delay), [150]);

  timers.shift().handler();
  sockets[2].emit('error', {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.length, 0);
  assert.ok(errors.includes('Nombre maximal de reconnexions Twitch atteint.'));
  client.disconnect();
});

test('limite le débit de sortie et assainit chaque message', async () => {
  let now = 1_000;
  const { client, socket } = await connectClient({
    now: () => now,
    maximumMessagesPerWindow: 2,
    outputWindowMs: 1_000,
  });

  assert.equal(client.sendMessage(' Bonjour\r\nTwitch '), true);
  assert.equal(client.sendMessage('Deuxième'), true);
  assert.equal(client.sendMessage('Troisième'), false);
  assert.equal(socket.sent.at(-2), 'PRIVMSG #rapto_live :Bonjour Twitch\r\n');

  now += 1_000;
  assert.equal(client.sendMessage('Troisième'), true);
  client.disconnect();
});

test('tronque proprement les messages UTF-8 sans caractère cassé', () => {
  const sanitized = sanitizeChatMessage('🤖'.repeat(200));
  assert.ok(Buffer.byteLength(sanitized, 'utf8') <= 450);
  assert.equal(sanitized.includes('�'), false);
});

test('rejette une identité IRC ou un jeton invalide sans exposer de secret', () => {
  assert.throws(
    () => new TwitchChatClient({ username: '!', accessToken: 'secret', channel: 'valid_channel' }),
    /utilisateur Twitch invalide/,
  );
  assert.throws(
    () => new TwitchChatClient({ username: 'fyxbot', accessToken: 'bad\ntoken', channel: 'valid_channel' }),
    /Jeton Twitch invalide/,
  );
});
