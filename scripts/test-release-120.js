require('dotenv').config();

const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require('discord.js');
const { getConfig } = require('../src/config');
const { communityPollPayload } = require('../src/services/communityPolls');
const { onboardingPayload } = require('../src/services/guildOnboarding');
const { socialNotificationPayload } = require('../src/services/socialNotifications');

const MARKER = 'fyxbot-release-1.2.0-real-test';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  if (argument('confirm') !== 'PUBLIER_APERCUS') {
    throw new Error('Ajoutez --confirm PUBLIER_APERCUS pour publier les aperçus réels.');
  }
  const config = getConfig();
  const guildName = argument('guild-name', 'FyxBot Développement');
  const channelName = argument('channel-name', '🤖・commandes-bot');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(config.token);
    const guilds = (await Promise.all(client.guilds.cache.map((guild) => guild.fetch().catch(() => null)))).filter(Boolean);
    const guild = guilds.find((candidate) => candidate.name === guildName);
    if (!guild) throw new Error(`Serveur introuvable : ${guildName}.`);
    const channels = await guild.channels.fetch();
    const channel = [...channels.values()].find((candidate) => candidate?.name === channelName);
    if (!channel?.isTextBased?.()) throw new Error(`Salon textuel introuvable : ${channelName}.`);
    const permissions = channel.permissionsFor(guild.members.me);
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.SendPolls,
    ];
    if (!permissions?.has(required)) throw new Error('FyxBot ne possède pas toutes les permissions requises dans le salon de test.');

    const recent = await channel.messages.fetch({ limit: 50 });
    const existing = recent.find((message) => message.author.id === client.user.id
      && message.embeds.some((embed) => embed.footer?.text === MARKER));
    if (existing) {
      console.log(JSON.stringify({
        guild: guild.name,
        channel: channel.name,
        alreadyPublished: true,
        markerMessageId: existing.id,
      }, null, 2));
      return;
    }

    const summary = new EmbedBuilder()
      .setColor(0xff5a2a)
      .setTitle('🧪 Validation réelle — FyxBot 1.2.0')
      .setDescription('Ces aperçus confirment le fonctionnement des nouveautés 1.2.0 sur le serveur de développement.')
      .addFields(
        { name: '🚀 Parcours guidé', value: 'Aperçu du message envoyé lors de l’arrivée de FyxBot.', inline: false },
        { name: '📣 Réseaux sociaux', value: 'Aperçu d’une notification vidéo avec embed et bouton HTTPS.', inline: false },
        { name: '📊 Communauté', value: 'Sondage Discord natif publié juste après ce message.', inline: false },
        { name: '💎 Premium', value: 'Présentation disponible, sans paiement, tarif ni limitation active.', inline: false },
      )
      .setFooter({ text: MARKER })
      .setTimestamp();

    const sent = [];
    sent.push(await channel.send({ embeds: [summary], allowedMentions: { parse: [] } }));
    sent.push(await channel.send(onboardingPayload(guild.name)));
    sent.push(await channel.send(socialNotificationPayload({
      type: 'video',
      platform: 'YouTube',
      creator: 'FyxBot',
      title: 'Aperçu de notification sociale — version 1.2.0',
      url: 'https://fyxbot-panel-production.up.railway.app/changelog',
    })));
    sent.push(await channel.send(communityPollPayload({
      question: 'Quelle nouveauté FyxBot 1.2.0 voulez-vous essayer en premier ?',
      answers: ['Parcours guidé', 'Notifications sociales', 'Sondages', 'Configuration communautaire'],
      duration: 24,
    })));

    console.log(JSON.stringify({
      guild: guild.name,
      channel: channel.name,
      alreadyPublished: false,
      messages: sent.map((message) => message.id),
      tests: ['release-summary', 'onboarding', 'social-notification', 'native-poll'],
    }, null, 2));
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error('[FyxBot][Test 1.2.0]', {
    name: error?.name || null,
    code: error?.code || null,
    status: error?.status || null,
    message: error?.message || String(error),
  });
  process.exitCode = 1;
});
