const assert = require('node:assert/strict');
const test = require('node:test');
const { selectCommands, serializeCommands } = require('../src/deploy-commands');
const { loadCommands, readCommands } = require('../src/loaders/commandLoader');

function command(name) {
  return {
    data: {
      toJSON() {
        return { name, description: `Commande ${name}` };
      },
    },
  };
}

test('limite les commandes globales à une installation et un contexte serveur', () => {
  const [payload] = serializeCommands([command('ping')], true);

  assert.deepEqual(payload.integration_types, [0]);
  assert.deepEqual(payload.contexts, [0]);
});

test('ne transmet pas les contextes globaux lors du déploiement de développement', () => {
  const [payload] = serializeCommands([command('ping')], false);

  assert.equal(payload.integration_types, undefined);
  assert.equal(payload.contexts, undefined);
});

test('peut publier toutes les commandes sauf Premium', () => {
  const selected = selectCommands([command('ping'), command('premium'), command('communaute')], {
    excludePremium: true,
  });

  assert.deepEqual(selected.map((item) => item.data.toJSON().name), ['ping', 'communaute']);
});

test('charge Premium dans le bot public', async () => {
  const client = { commands: new Map() };

  await loadCommands(client);

  assert.equal(client.commands.has('premium'), true);
  assert.equal(client.commands.has('communaute'), true);
});

test('place toutes les options obligatoires avant les options facultatives', async () => {
  const commands = await readCommands();

  function validateOptions(options = [], path = []) {
    let optionalOptionFound = false;
    for (const option of options) {
      if (option.required !== true) optionalOptionFound = true;
      assert.equal(
        optionalOptionFound && option.required === true,
        false,
        `Option obligatoire après une option facultative : ${[...path, option.name].join(' > ')}`,
      );
      validateOptions(option.options, [...path, option.name]);
    }
  }

  for (const commandItem of commands) {
    const payload = commandItem.data.toJSON();
    validateOptions(payload.options, [payload.name]);
  }
});

test('affiche /setup aperçu en français et conserve le diagnostic', async () => {
  const commands = await readCommands();
  const setup = commands.find((item) => item.data.name === 'setup');
  const payload = setup.data.toJSON();
  const preview = payload.options.find((option) => option.name === 'apercu');

  assert.equal(preview.name_localizations.fr, 'aperçu');
  assert.deepEqual(setup.preserveReplySubcommands, ['analyser', 'apercu', 'concevoir', 'sauvegardes']);
});
