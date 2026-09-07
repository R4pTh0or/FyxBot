const assert = require('node:assert/strict');
const test = require('node:test');
const { createTranscript, sanitizeTranscriptContent } = require('../src/services/logs');

test('masque les secrets courants dans les transcripts', () => {
  const samples = [
    'DISCORD_TOKEN=valeur-secrete-tres-longue',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
    'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
    'abcdefghijklmnopqrstuvwx.abcdef.abcdefghijklmnopqrstuvwxyz123456',
  ];
  for (const sample of samples) {
    const result = sanitizeTranscriptContent(sample);
    assert.match(result, /masqu/);
    assert.doesNotMatch(result, /valeur-secrete|webhooks\/123456789012345678|abcdefghijklmnopqrstuvwx/);
  }
});

test('retire les identifiants auteurs et URLs de pièces jointes des transcripts', async () => {
  const messages = new Map([
    ['message-1', {
      id: 'message-1', createdTimestamp: Date.UTC(2026, 7, 27, 12),
      content: 'Bonjour', author: { tag: 'Utilisateur#0001', id: '123456789012345678' },
      attachments: new Map([['attachment-1', { name: 'preuve.png', url: 'https://cdn.discordapp.com/private-sensitive-url' }]]),
    }],
  ]);
  messages.last = () => [...messages.values()].at(-1);
  const channel = { messages: { fetch: async () => messages } };
  const transcript = (await createTranscript(channel)).toString('utf8');
  assert.match(transcript, /Utilisateur#0001/);
  assert.match(transcript, /preuve\.png/);
  assert.doesNotMatch(transcript, /123456789012345678|cdn\.discordapp\.com/);
});
