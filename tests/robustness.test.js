const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { Readable } = require('node:stream');
const test = require('node:test');
const { createEventListener } = require('../src/loaders/eventLoader');
const { readBody, startDashboardServer } = require('../src/services/dashboardServer');

test('une erreur dans un événement Discord est journalisée sans rejeter la promesse', async () => {
  const logged = [];
  const log = { error: (payload, message) => logged.push({ payload, message }) };
  const failure = new Error('échec simulé');
  const listener = createEventListener({
    name: 'guildMemberRemove',
    async execute() { throw failure; },
  }, {}, log);

  await assert.doesNotReject(listener({ id: '1' }));
  assert.equal(logged.length, 1);
  assert.equal(logged[0].payload.err, failure);
  assert.equal(logged[0].payload.event, 'guildMemberRemove');
});

test('le listener transmet les arguments Discord puis le client', async () => {
  const received = [];
  const client = { id: 'client' };
  const listener = createEventListener({
    name: 'ready',
    async execute(...args) { received.push(args); },
  }, client);

  await listener('a', 'b');
  assert.deepEqual(received, [['a', 'b', client]]);
});

test('une URL de requête invalide renvoie 400 et laisse le panel actif', async () => {
  const server = startDashboardServer({ isReady: () => false }, { host: '127.0.0.1', port: 0 });
  try {
    if (!server.listening) await once(server, 'listening');
    const { port } = server.address();
    const raw = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET // HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => { data += chunk; });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    assert.match(raw, /^HTTP\/1\.1 400 /);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('readBody décode un caractère multi-octets coupé entre deux morceaux', async () => {
  const payload = Buffer.from(JSON.stringify({ texte: 'Fête 🎉' }), 'utf8');
  const cut = payload.indexOf(Buffer.from('🎉')) + 2; // coupe l'emoji en plein milieu
  const request = new Readable({ read() {} });
  request.push(payload.subarray(0, cut));
  request.push(payload.subarray(cut));
  request.push(null);

  assert.deepEqual(await readBody(request), { texte: 'Fête 🎉' });
});
