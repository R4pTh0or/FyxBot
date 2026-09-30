const assert = require('node:assert/strict');
const test = require('node:test');
const pingCommand = require('../src/commands/utility/ping');

test('/ping répond en une seule requête Discord avec deux mesures distinctes', async () => {
  const replies = [];
  const interaction = {
    createdTimestamp: 1_000,
    client: { ws: { ping: 42.4 } },
    async reply(payload) {
      replies.push(payload);
    },
    async editReply() {
      assert.fail('/ping ne doit plus modifier une première réponse provisoire.');
    },
  };

  const measured = pingCommand.measurePing(interaction, 1_085);
  assert.deepEqual(measured, { interactionMs: 85, websocketMs: 42 });

  const originalNow = Date.now;
  Date.now = () => 1_085;
  try {
    await pingCommand.execute(interaction);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /Interaction : 85 ms/);
  assert.match(replies[0].content, /Passerelle Discord : 42 ms/);
});

test('/ping masque les mesures indisponibles au lieu d’afficher une valeur trompeuse', () => {
  const interaction = {
    createdTimestamp: Number.NaN,
    client: { ws: { ping: -1 } },
  };

  assert.deepEqual(pingCommand.measurePing(interaction, 1_000), {
    interactionMs: null,
    websocketMs: null,
  });
  assert.equal(pingCommand.formatLatency(null), 'indisponible');
});
