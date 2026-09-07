const assert = require('node:assert/strict');
const test = require('node:test');
const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, PermissionFlagsBits } = require('discord.js');
const {
  birthdaySortValue,
  isValidBirthday,
  renderBirthdayMessage,
  zonedDateParts,
} = require('../src/services/birthdays');
const { validateSocialUrl } = require('../src/services/socialNotifications');
const { normalizeSocialSource, parseYouTubeFeed } = require('../src/services/socialAutomation');
const { buildOnboardingProgress } = require('../src/services/onboardingProgress');
const { onboardingPayload, publicPanelUrl } = require('../src/services/guildOnboarding');
const { communityPollPayload } = require('../src/services/communityPolls');
const { createCommunityEvent, normalizeCommunityEvent, parseCommunityEventDate } = require('../src/services/communityEvents');
const { normalizeGiveaway, selectWinners } = require('../src/services/communityGiveaways');
const { PLANS, PREMIUM_ENFORCEMENT_ENABLED } = require('../src/services/premiumPlans');
const { sanitizeRoomName } = require('../src/services/temporaryVoice');
const { RULE_TEMPLATES, rulesPayload } = require('../src/services/rules');
const { customMessagePayload, normalizeHexColor } = require('../src/services/customMessages');
const { validatePublishChannel } = require('../src/commands/community/reglement');
const {
  CHANGELOG_CHANNEL_NAME,
  broadcastPendingChangelogs,
  getPendingReleases,
  initializeChangelogChannel,
  parsePublishedReleases,
  publicChangelogUrl,
  releasePayload,
} = require('../src/services/changelogNotifications');

test('valide les anniversaires sans conserver une année de naissance', () => {
  assert.equal(isValidBirthday(29, 2), true);
  assert.equal(isValidBirthday(31, 4), false);
  assert.equal(isValidBirthday(0, 12), false);
  assert.equal(renderBirthdayMessage('Bravo {membres} sur {serveur}', '<@1>', 'FyxBot'), 'Bravo <@1> sur FyxBot');
});

test('respecte le fuseau horaire et trie les prochains anniversaires', () => {
  assert.deepEqual(zonedDateParts(new Date('2026-08-24T22:30:00.000Z'), 'Europe/Paris'), {
    day: 25,
    month: 8,
    dateKey: '2026-08-25',
  });
  assert.ok(birthdaySortValue({ day: 1, month: 9 }, 8, 24) < birthdaySortValue({ day: 1, month: 1 }, 8, 24));
});

test('refuse les liens sociaux non sécurisés', () => {
  assert.equal(validateSocialUrl('https://youtube.com/watch?v=fyxbot'), 'https://youtube.com/watch?v=fyxbot');
  assert.throws(() => validateSocialUrl('http://example.com/live'), /HTTPS/);
  assert.throws(() => validateSocialUrl('javascript:alert(1)'), /HTTPS|valide/);
});

test('valide les sources automatiques et lit le dernier contenu YouTube', () => {
  const youtube = normalizeSocialSource({ platform: 'youtube', identifier: 'UC1234567890123456789012', label: 'FyxBot TV' });
  const twitch = normalizeSocialSource({ platform: 'twitch', identifier: 'FyxBot_Live' });
  assert.equal(youtube.id, 'youtube:UC1234567890123456789012');
  assert.equal(twitch.identifier, 'fyxbot_live');
  assert.throws(() => normalizeSocialSource({ platform: 'youtube', identifier: 'https://youtube.com/fyxbot' }), /identifiant/);
  const item = parseYouTubeFeed(`<?xml version="1.0"?><feed><title>FyxBot TV</title><entry><yt:videoId>abc123</yt:videoId><title>Nouveau tutoriel &amp; nouveautés</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><author><name>FyxBot TV</name></author></entry></feed>`);
  assert.deepEqual(item, {
    itemId: 'abc123',
    title: 'Nouveau tutoriel & nouveautés',
    creator: 'FyxBot TV',
    url: 'https://www.youtube.com/watch?v=abc123',
    type: 'video',
    platform: 'YouTube',
  });
});

test('calcule le parcours guidé depuis la configuration réelle', () => {
  const progress = buildOnboardingProgress({
    setupBlueprint: { description: 'Serveur communautaire' },
    securityRules: 4,
    config: { logs: { channelId: 'logs' }, welcome: { welcomeChannelId: 'welcome' } },
  });
  assert.equal(progress.completedCount, 4);
  assert.equal(progress.totalCount, 7);
  assert.equal(progress.percent, 57);
  assert.equal(progress.steps.find((step) => step.key === 'security').complete, true);
});

test('prépare un message d’arrivée avec un lien public sécurisé vers le panel', () => {
  const previous = process.env.DASHBOARD_PUBLIC_URL;
  process.env.DASHBOARD_PUBLIC_URL = 'http://localhost:3000';
  try {
    assert.equal(publicPanelUrl(), 'https://fyxbot-panel-production.up.railway.app/');
    const payload = onboardingPayload('Serveur FyxBot');
    assert.equal(payload.embeds[0].toJSON().title, '👋 Merci d’avoir ajouté FyxBot');
    assert.equal(payload.components[0].toJSON().components[0].url, 'https://fyxbot-panel-production.up.railway.app/');
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_PUBLIC_URL;
    else process.env.DASHBOARD_PUBLIC_URL = previous;
  }
});

test('compose des sondages natifs et active les limites Premium', () => {
  const payload = communityPollPayload({ question: 'Quel événement préférez-vous ?', answers: ['Build', 'PVP', 'Build'], duration: 72 });
  assert.equal(payload.poll.answers.length, 2);
  assert.equal(payload.poll.duration, 72);
  assert.equal(PREMIUM_ENFORCEMENT_ENABLED, true);
  assert.ok(PLANS.free && PLANS.premium);
});

test('convertit les événements communautaires dans le fuseau choisi', () => {
  const now = new Date('2026-08-25T08:00:00.000Z');
  assert.equal(parseCommunityEventDate('15/01/2027', '20:30', 'Europe/Paris', now).toISOString(), '2027-01-15T19:30:00.000Z');
  assert.equal(parseCommunityEventDate('15/09/2026', '20:30', 'Europe/Paris', now).toISOString(), '2026-09-15T18:30:00.000Z');
  assert.throws(() => parseCommunityEventDate('29/03/2026', '02:30', 'Europe/Paris', new Date('2026-01-01')), /changement d’heure/);
  const event = normalizeCommunityEvent({ name: 'Soirée FyxBot', date: '15/09/2026', time: '20:30', durationMinutes: 120 }, { now });
  assert.equal(event.name, 'Soirée FyxBot');
  assert.equal(event.scheduledEndTime.toISOString(), '2026-09-15T20:30:00.000Z');
});

test('crée un événement externe privé au serveur dans Discord', async () => {
  let options;
  const guild = {
    id: 'guild-a',
    members: { me: { permissions: { has: (permission) => permission === PermissionFlagsBits.CreateEvents } } },
    scheduledEvents: { create: async (value) => { options = value; return { id: 'event-a' }; } },
  };
  const result = await createCommunityEvent(guild, {
    name: 'Soirée FyxBot',
    date: '15/09/2026',
    time: '20:30',
    timeZone: 'Europe/Paris',
    durationMinutes: 120,
    type: 'external',
    location: 'https://example.com/fyxbot',
  }, { now: new Date('2026-08-25T08:00:00.000Z') });
  assert.equal(options.entityType, GuildScheduledEventEntityType.External);
  assert.equal(options.privacyLevel, GuildScheduledEventPrivacyLevel.GuildOnly);
  assert.deepEqual(options.entityMetadata, { location: 'https://example.com/fyxbot' });
  assert.equal(result.url, 'https://discord.com/events/guild-a/event-a');
});

test('normalise les concours et tire des gagnants uniques', () => {
  const giveaway = normalizeGiveaway({ prize: 'Grade VIP', winnerCount: 8, durationMinutes: 1 }, { now: new Date('2026-08-25T08:00:00.000Z') });
  assert.equal(giveaway.winnerCount, 5);
  assert.equal(giveaway.durationMinutes, 10);
  assert.deepEqual(selectWinners(['a', 'b', 'a', 'c'], 3, () => 0), ['a', 'b', 'c']);
});

test('nettoie les noms de salons vocaux temporaires', () => {
  assert.equal(sanitizeRoomName('  Salon\n  de   test  '), 'Salon de test');
  assert.equal(sanitizeRoomName(''), 'Salon temporaire');
  assert.ok(sanitizeRoomName('x'.repeat(120)).length <= 90);
});

test('fournit quatre modèles de règlement et un bouton de validation', () => {
  assert.deepEqual(Object.keys(RULE_TEMPLATES).sort(), ['communautaire', 'createur', 'gaming', 'minecraft']);
  for (const template of Object.values(RULE_TEMPLATES)) assert.ok(template.length >= 200 && template.length <= 3900);
  const payload = rulesPayload({ title: 'Règlement', content: RULE_TEMPLATES.communautaire, verifiedRoleId: '123456789' });
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components[0].toJSON().components[0].custom_id, 'rules:accept');
});

test('vérifie les permissions nécessaires avant de publier un règlement', () => {
  const guild = { members: { me: { id: 'bot' } } };
  const channel = {
    toString: () => '<#rules>',
    permissionsFor: () => ({ has: (permission) => permission !== PermissionFlagsBits.EmbedLinks }),
  };
  assert.throws(
    () => validatePublishChannel(guild, channel),
    /Permissions manquantes : Intégrer des liens/,
  );

  channel.permissionsFor = () => ({ has: () => true });
  assert.equal(validatePublishChannel(guild, channel), channel);
});

test('accuse réception avant de publier un règlement', async () => {
  const rules = require('../src/services/rules');
  const commandPath = require.resolve('../src/commands/community/reglement');
  const originalPublishRules = rules.publishRules;
  const calls = [];
  rules.publishRules = async () => { calls.push('publish'); };
  delete require.cache[commandPath];

  try {
    const command = require(commandPath);
    const channel = {
      id: 'rules-channel',
      permissionsFor: () => ({ has: () => true }),
      toString: () => '<#rules-channel>',
    };
    const interaction = {
      guildId: 'guild-test',
      guild: { id: 'guild-test', name: 'Serveur test', members: { me: { id: 'bot' } } },
      options: {
        getSubcommand: () => 'publier',
        getChannel: () => channel,
        getRole: () => null,
        getString: (name) => (name === 'titre' ? 'Règlement de test' : '1. Respectez les autres membres.'),
      },
      deferReply: async () => { calls.push('defer'); },
      editReply: async () => { calls.push('edit'); },
    };

    await command.execute(interaction);
    assert.deepEqual(calls, ['defer', 'publish', 'edit']);
  } finally {
    rules.publishRules = originalPublishRules;
    delete require.cache[commandPath];
  }
});

test('compose un message Discord avec texte, embed, images et bouton', () => {
  const payload = customMessagePayload({
    mode: 'message',
    content: 'Une annonce sans mention automatique de @everyone.',
    title: 'Nouvelle annonce',
    description: 'Le détail de la publication.',
    color: '#ff5a2a',
    imageUrl: 'https://example.com/banner.png',
    thumbnailUrl: 'https://example.com/logo.png',
    linkUrl: 'https://example.com/details',
    buttonLabel: 'Voir les détails',
    footer: 'FyxBot • Annonce',
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(payload.content, 'Une annonce sans mention automatique de @everyone.');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(embed.color, 0xff5a2a);
  assert.equal(embed.image.url, 'https://example.com/banner.png');
  assert.equal(embed.thumbnail.url, 'https://example.com/logo.png');
  assert.equal(payload.components[0].toJSON().components[0].url, 'https://example.com/details');
});

test('reproduit un changelog Discord structuré et sécurisé', () => {
  const payload = customMessagePayload({
    mode: 'changelog',
    version: '1.2.0',
    environment: 'production',
    title: 'Constructeur de messages',
    description: 'Texte, embeds et images sont disponibles.',
    linkUrl: 'https://example.com/changelog',
    footer: 'FyxBot • Changelog',
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, '◆ Constructeur de messages');
  assert.deepEqual(embed.fields.map((field) => field.name), ['Version', 'Environnement', 'Changelog']);
  assert.match(embed.fields[2].value, /https:\/\/example\.com\/changelog/);
  assert.throws(() => customMessagePayload({ content: 'Test', imageUrl: 'http://example.com/image.png' }), /HTTPS/);
  assert.throws(() => customMessagePayload({ mode: 'changelog', title: 'Incomplet' }), /version, un titre et une description/);
  assert.equal(normalizeHexColor('#EF4444'), 0xef4444);
});

test('ignore les versions en préparation et détecte les correctifs publiés', () => {
  const releases = parsePublishedReleases(`# Changelog

## [1.3.0] — En préparation

### Ajouté
- Fonction encore en test.

## [1.2.1] — 25 août 2026

### Corrigé
- Correction du constructeur de messages.

## [1.2.0] — 24 août 2026

### Ajouté
- Constructeur de messages Discord.
`);
  assert.deepEqual(releases.map((release) => release.version), ['1.2.1', '1.2.0']);
  assert.equal(releases[0].title, 'Correctifs FyxBot 1.2.1');
  assert.deepEqual(getPendingReleases(releases, [releases[1].id]).map((release) => release.version), ['1.2.1']);
  const embed = releasePayload(releases[0], 'https://example.com/changelog').embeds[0].toJSON();
  assert.match(embed.description, /Corrigé/);
  assert.equal(embed.fields[0].value, '1.2.1');
});

test('initialise une seule fois le salon changelog créé par le setup', async () => {
  const releases = parsePublishedReleases(`## [1.2.0] — 24 août 2026

### Ajouté
- Changelog automatique.

## [1.1.0] — 23 août 2026

### Ajouté
- Première version.
`);
  const sent = [];
  let stored = null;
  let renamedTo = null;
  const channel = {
    id: 'channel-a',
    name: 'changelog',
    guildId: 'guild-a',
    isTextBased: () => true,
    setName: async (name) => { renamedTo = name; channel.name = name; },
    send: async (payload) => sent.push(payload),
  };
  const guild = { id: 'guild-a', channels: { fetch: async () => channel } };
  const dependencies = {
    releases,
    loadConfig: async () => stored,
    saveConfig: async (guildId, config) => { assert.equal(guildId, guild.id); stored = config; },
  };
  const first = await initializeChangelogChannel(guild, channel, dependencies);
  const second = await initializeChangelogChannel(guild, channel, dependencies);
  assert.equal(first.published, 1);
  assert.equal(second.published, 0);
  assert.equal(renamedTo, CHANGELOG_CHANNEL_NAME);
  assert.equal(sent.length, 1);
  assert.equal(stored.lastPublishedVersion, '1.2.0');
  assert.deepEqual(stored.deliveredReleaseIds, releases.map((release) => release.id));
});

test('rattache un salon changelog existant et publie la dernière version sans doublon', async () => {
  const releases = parsePublishedReleases(`## [1.2.0] — 24 août 2026

### Corrigé
- Correctif attendu sur FyxBot Développement.
`);
  const sent = [];
  let stored = null;
  const channel = {
    id: 'development-changelog',
    name: 'changelog',
    guildId: 'fyxbot-development',
    isTextBased: () => true,
    isThread: () => false,
    setName: async (name) => { channel.name = name; },
    send: async (payload) => sent.push(payload),
  };
  const guild = {
    id: 'fyxbot-development',
    name: 'FyxBot Développement',
    channels: {
      cache: new Map([[channel.id, channel]]),
      fetch: async (channelId) => (channelId ? channel : new Map([[channel.id, channel]])),
    },
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };
  const dependencies = {
    releases,
    loadConfig: async () => stored,
    saveConfig: async (guildId, config) => { assert.equal(guildId, guild.id); stored = config; },
  };

  const first = await broadcastPendingChangelogs(client, dependencies);
  const second = await broadcastPendingChangelogs(client, dependencies);

  assert.deepEqual(first, { published: 1, configuredGuilds: 1, errors: 0 });
  assert.deepEqual(second, { published: 0, configuredGuilds: 1, errors: 0 });
  assert.equal(channel.name, CHANGELOG_CHANNEL_NAME);
  assert.equal(sent.length, 1);
  assert.equal(stored.channelId, channel.id);
  assert.equal(stored.lastPublishedVersion, '1.2.0');
});

test('conserve un lien HTTPS public pour les annonces automatiques', () => {
  const previous = process.env.DASHBOARD_PUBLIC_URL;
  process.env.DASHBOARD_PUBLIC_URL = 'http://localhost:3000';
  try {
    assert.equal(publicChangelogUrl(), 'https://fyxbot-panel-production.up.railway.app/changelog');
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_PUBLIC_URL;
    else process.env.DASHBOARD_PUBLIC_URL = previous;
  }
});
