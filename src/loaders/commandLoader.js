const fs = require('node:fs/promises');
const path = require('node:path');
const logger = require('../services/logger').logger.child({ component: 'command-loader' });

const commandsDirectory = path.join(__dirname, '..', 'commands');

async function findJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findJavaScriptFiles(fullPath)
        : entry.isFile() && entry.name.endsWith('.js')
          ? [fullPath]
          : [];
    }),
  );

  return files.flat();
}

async function readCommands() {
  const files = await findJavaScriptFiles(commandsDirectory);

  return files.map((file) => {
    const command = require(file);
    if (!command.data?.name || typeof command.execute !== 'function') {
      throw new TypeError(`Commande invalide : ${file} doit exporter data et execute().`);
    }
    return command;
  });
}

async function loadCommands(client) {
  const commands = await readCommands();
  for (const command of commands) {
    if (client.commands.has(command.data.name)) {
      throw new Error(`Commande dupliquée : ${command.data.name}`);
    }
    client.commands.set(command.data.name, command);
  }
  logger.info({ commandCount: commands.length }, '[FyxBot] Commandes chargées.');
}

module.exports = { loadCommands, readCommands };
