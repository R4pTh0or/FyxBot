const fs = require('node:fs/promises');
const path = require('node:path');
const defaultStorage = require('./defaultConfigurationStorage');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = path.join(dataDirectory, 'welcome.json');
let writeQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function getWelcomeConfig(guildId, storage = defaultStorage) {
  return storage.getConfiguration(guildId, 'welcome');
}

async function setWelcomeConfig(guildId, config, storage = defaultStorage) {
  return storage.setConfiguration(guildId, 'welcome', config);
  /* Legacy JSON writer retained temporarily for rollback.
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    database[guildId] = config;
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  });
  writeQueue = operation.catch(() => {});
  return operation; */
}

module.exports = { getWelcomeConfig, setWelcomeConfig };
