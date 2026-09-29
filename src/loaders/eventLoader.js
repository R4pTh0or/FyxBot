const fs = require('node:fs/promises');
const path = require('node:path');
const logger = require('../services/logger').logger.child({ component: 'event-loader' });

function createEventListener(event, client, log = logger) {
  return async (...args) => {
    try {
      await event.execute(...args, client);
    } catch (error) {
      log.error({ err: error, event: String(event.name) }, '[FyxBot] Erreur dans un événement Discord.');
    }
  };
}

async function loadEvents(client) {
  const eventsDirectory = path.join(__dirname, '..', 'events');
  const files = (await fs.readdir(eventsDirectory)).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const event = require(path.join(eventsDirectory, file));
    if (!event.name || typeof event.execute !== 'function') {
      throw new TypeError(`Événement invalide : ${file} doit exporter name et execute().`);
    }

    const listener = createEventListener(event, client);
    event.once ? client.once(event.name, listener) : client.on(event.name, listener);
  }

  logger.info({ eventCount: files.length }, '[FyxBot] Événements chargés.');
}

module.exports = { createEventListener, loadEvents };
