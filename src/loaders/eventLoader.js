const fs = require('node:fs/promises');
const path = require('node:path');

async function loadEvents(client) {
  const eventsDirectory = path.join(__dirname, '..', 'events');
  const files = (await fs.readdir(eventsDirectory)).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const event = require(path.join(eventsDirectory, file));
    if (!event.name || typeof event.execute !== 'function') {
      throw new TypeError(`Événement invalide : ${file} doit exporter name et execute().`);
    }

    const listener = (...args) => event.execute(...args, client);
    event.once ? client.once(event.name, listener) : client.on(event.name, listener);
  }

  console.log(`[FyxBot] ${files.length} événement(s) chargé(s).`);
}

module.exports = { loadEvents };
