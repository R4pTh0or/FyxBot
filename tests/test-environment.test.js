const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('isole les données des tests en dehors du dossier de production', () => {
  const dataDirectory = path.resolve(process.env.FYXBOT_DATA_DIR || '');
  const temporaryRoot = path.resolve(os.tmpdir());

  assert.notEqual(dataDirectory, path.resolve(__dirname, '..', 'data'));
  assert.equal(dataDirectory.startsWith(temporaryRoot), true);
  assert.match(path.basename(dataDirectory), /^fyxbot-tests-/);
});
