const assert = require('node:assert/strict');
const test = require('node:test');
const { ChannelType, Collection, PermissionFlagsBits } = require('discord.js');
const creationCommand = require('../src/commands/configuration/creation');

test('publie /creation salon avec son nom français et les types attendus', () => {
  const payload = creationCommand.data.toJSON();
  const salon = payload.options.find((option) => option.name === 'salon');
  const type = salon.options.find((option) => option.name === 'type');

  assert.equal(payload.name, 'creation');
  assert.equal(payload.name_localizations.fr, 'création');
  assert.equal(payload.default_member_permissions, PermissionFlagsBits.ManageChannels.toString());
  assert.deepEqual(type.choices.map((choice) => choice.value), ['texte', 'vocal', 'forum', 'annonces']);
});

test('formate automatiquement le nom des salons avec un emoji', () => {
  assert.equal(creationCommand.formatChannelName('Discussion Générale', '💬'), '💬・discussion-générale');
  assert.equal(creationCommand.formatChannelName('🔊・Gaming', '🔊'), '🔊・gaming');
  assert.throws(() => creationCommand.formatChannelName('---', '💬'), /invalide/);
});

test('crée un salon dans la catégorie choisie sans écraser ses permissions', async () => {
  let createdOptions = null;
  let response = '';
  const category = { id: 'category', name: 'COMMUNAUTÉ' };
  const botMember = { id: 'bot', permissions: { has: () => true } };
  const values = {
    type: 'texte', nom: 'Discussion Générale', categorie: category,
    sujet: 'Bienvenue dans la discussion', role: null, limite: null, prive: false,
  };
  const interaction = {
    guild: {
      features: [],
      members: { me: botMember },
      roles: { everyone: { id: 'guild' } },
      channels: {
        cache: new Collection(),
        create: async (options) => {
          createdOptions = options;
          return { id: 'new-channel', toString: () => '<#new-channel>' };
        },
      },
    },
    user: { id: 'admin', tag: 'Admin#0001' },
    options: {
      getString: (name) => values[name] ?? null,
      getChannel: (name) => values[name] ?? null,
      getRole: (name) => values[name] ?? null,
      getInteger: (name) => values[name] ?? null,
      getBoolean: (name) => values[name] ?? null,
    },
    deferReply: async () => null,
    editReply: async (content) => { response = content; },
  };

  await creationCommand.execute(interaction);

  assert.equal(createdOptions.name, '💬・discussion-générale');
  assert.equal(createdOptions.type, ChannelType.GuildText);
  assert.equal(createdOptions.parent, 'category');
  assert.equal(createdOptions.permissionOverwrites, undefined);
  assert.match(response, /permissions héritées/);
});
