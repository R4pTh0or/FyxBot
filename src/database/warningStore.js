const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = path.join(dataDirectory, 'warnings.json');
let writeQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function addWarning({ guildId, userId, moderatorId, reason }) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    database[guildId] ??= {};
    database[guildId][userId] ??= [];

    const warning = {
      id: randomUUID().split('-')[0],
      moderatorId,
      reason,
      createdAt: new Date().toISOString(),
    };
    database[guildId][userId].push(warning);

    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
    return { warning, count: database[guildId][userId].length };
  });

  writeQueue = operation.catch(() => {});
  return operation;
}

async function getWarnings(guildId, userId) {
  const database = await readDatabase();
  return database[guildId]?.[userId] || [];
}

async function removeWarning(guildId, userId, warningId) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    const warnings = database[guildId]?.[userId] || [];
    const index = warnings.findIndex((warning) => warning.id === warningId);
    if (index === -1) return null;
    const [removed] = warnings.splice(index, 1);
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
    return removed;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function clearWarnings(guildId, userId) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    const count = database[guildId]?.[userId]?.length || 0;
    if (database[guildId]) delete database[guildId][userId];
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
    return count;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function clearGuildWarnings(guildId) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    const count = Object.values(database[guildId] || {})
      .reduce((total, warnings) => total + warnings.length, 0);
    delete database[guildId];
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(databaseFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
    return count;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

module.exports = { addWarning, clearGuildWarnings, clearWarnings, getWarnings, removeWarning };
