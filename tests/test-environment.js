const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fyxbot-tests-'));
process.env.FYXBOT_DATA_DIR = testDataDirectory;

process.once('exit', () => {
  try {
    fs.rmSync(testDataDirectory, { recursive: true, force: true });
  } catch {
    // Windows peut conserver brièvement un verrou SQLite pendant l'arrêt.
  }
});
