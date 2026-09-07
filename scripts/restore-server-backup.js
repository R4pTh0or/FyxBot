require('dotenv').config({ quiet: true });

const { Client, GatewayIntentBits } = require('discord.js');
const { getConfig } = require('../src/config');
const { listServerBackups, restoreServer } = require('../src/services/serverBackup');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const guildId = argument('guild-id');
  const expectedGuildName = argument('guild-name');
  const backupFilename = argument('backup');
  const confirmation = argument('confirm');

  if (!/^\d{17,20}$/.test(guildId || '')) throw new Error('Ajoutez un --guild-id Discord valide.');
  if (!expectedGuildName) throw new Error('Ajoutez --guild-name pour verrouiller le serveur cible.');
  if (!backupFilename) throw new Error('Ajoutez --backup avec le nom exact de la sauvegarde.');
  if (confirmation !== `RESTAURER:${guildId}`) {
    throw new Error(`Ajoutez --confirm RESTAURER:${guildId} pour autoriser cette restauration.`);
  }

  const backups = await listServerBackups(guildId);
  if (!backups.some((backup) => backup.filename === backupFilename)) {
    throw new Error('La sauvegarde demandée est introuvable ou invalide pour ce serveur.');
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    const config = getConfig();
    await client.login(config.token);
    const guild = await client.guilds.fetch(guildId);
    const fullGuild = await guild.fetch();
    await fullGuild.members.fetchMe();
    if (fullGuild.name !== expectedGuildName) {
      throw new Error(`Serveur refusé : attendu « ${expectedGuildName} », trouvé « ${fullGuild.name} ».`);
    }

    console.error(`[FyxBot][Restauration] Serveur vérifié : ${fullGuild.name} (${fullGuild.id}).`);
    console.error(`[FyxBot][Restauration] Sauvegarde sélectionnée : ${backupFilename}.`);
    const result = await restoreServer(fullGuild, backupFilename);
    console.log(JSON.stringify({
      guild: { id: fullGuild.id, name: fullGuild.name },
      ...result,
    }, null, 2));
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error('[FyxBot][Restauration]', {
    name: error?.name || null,
    code: error?.code || null,
    status: error?.status || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
  });
  process.exitCode = 1;
});
