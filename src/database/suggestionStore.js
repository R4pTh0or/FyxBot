const fs = require('node:fs/promises');
const path = require('node:path');
const { getConfiguration, setConfiguration } = require('./database');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = path.join(dataDirectory, 'suggestions.json');
let writeQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function getSuggestionConfig(guildId) {
  return getConfiguration(guildId, 'suggestions');
}

async function setSuggestionConfig(guildId, config) {
  return setConfiguration(guildId, 'suggestions', config);
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

module.exports = { getSuggestionConfig, setSuggestionConfig };
