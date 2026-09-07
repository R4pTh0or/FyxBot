const fs = require('node:fs/promises');
const path = require('node:path');
const { getConfiguration, setConfiguration } = require('./database');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = path.join(dataDirectory, 'logs.json');
let writeQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function getLogConfig(guildId) {
  return getConfiguration(guildId, 'logs');
}

async function setLogConfig(guildId, config) {
  return setConfiguration(guildId, 'logs', config);
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

module.exports = { getLogConfig, setLogConfig };
