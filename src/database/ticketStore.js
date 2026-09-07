const fs = require('node:fs/promises');
const path = require('node:path');
const { getConfiguration, setConfiguration } = require('./database');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = path.join(dataDirectory, 'tickets.json');
let writeQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function getTicketConfig(guildId) {
  return getConfiguration(guildId, 'tickets');
}

async function setTicketConfig(guildId, config) {
  return setConfiguration(guildId, 'tickets', config);
  /* Legacy JSON writer retained temporarily for rollback.
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    database[guildId] = config;
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
    return config;
  });
  writeQueue = operation.catch(() => {});
  return operation; */
}

module.exports = { getTicketConfig, setTicketConfig };
