const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 1000;

const MANAGEMENT_PERMISSIONS = Object.freeze([
  'ManageGuild',
  'ManageChannels',
  'ManageRoles',
  'ViewAuditLog',
  'ManageMessages',
  'KickMembers',
  'BanMembers',
  'ModerateMembers',
]);

const CHANNEL_EMOJIS = Object.freeze({
  welcome: '👋', rules: '📜', announcements: '📢', changelog: '🛠️', general: '💬',
  introductions: '👋', communityMedia: '📸', polls: '📊', communityVoice: '🔊',
  logs: '📋', staffChat: '🔐', ticketPanel: '🎫', supportInfo: '📌', supportFaq: '❓',
  suggestions: '💡', connectionGuide: '🔌', gameInfo: '📌', gameStatus: '📡',
  gameGuide: '📚', gameUpdates: '🛠️', gameHelp: '🆘', bugReports: '🐛', gameMedia: '📸',
  gameTrade: '💰', factionRecruitment: '⚔️', lookingForGroup: '🔎', recruitment: '📨',
  matchSchedule: '📅', strategy: '🧠', gameClips: '🎬', gamingVoice: '🎮',
  creatorSchedule: '📅', videos: '📺', liveNotifications: '🔴', clips: '🎬', fanArt: '🎨',
  creatorIdeas: '💡', backstage: '🎥', rpGuide: '📚', lore: '📖', characters: '🧙',
  characterValidation: '✅', oocGeneral: '💬', plotDiscussion: '🧩', diceRolls: '🎲',
  scenes: '🎭', rpLobby: '🏛️', whitelist: '📝', cityInfo: '🏙️', jobs: '💼',
  rpServerStatus: '📡', rpBugReports: '🐛', campaignInfo: '🗺️', sessions: '📅',
  tabletopVoice: '🎲', offers: '🛍️', faq: '❓',
  portfolio: '🖼️', orders: '📦', reviews: '⭐', courseAnnouncements: '📢', resources: '📚',
  homeworkHelp: '🤝', projects: '🧪', classVoice: '🎓', releases: '🎵', demos: '🎼',
  feedback: '💬', collaborations: '🤝', musicVoice: '🎧', eventAnnouncements: '🎉',
  eventRegistration: '✅', partnerships: '🤝', loungeVoice: '🔊', privateVoiceHub: '➕',
});

function searchable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function mentions(text, words) {
  return words.some((word) => text.includes(searchable(word)));
}

function containsToken(text, token) {
  const escaped = searchable(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function uniqueByKey(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value.key)) return false;
    seen.add(value.key);
    return true;
  });
}

function role(key, name, color, permissions = [], options = {}) {
  return { key, name, color, permissions, fallback: options.fallback || permissions, staff: options.staff === true };
}

function category(key, name, permissionProfile = 'memberCommunity', reason = '') {
  return { key, name, permissionProfile, ...(reason ? { reason } : {}) };
}

function channel(key, categoryKey, name, options = {}) {
  const emoji = options.emoji || CHANNEL_EMOJIS[key] || '💬';
  return {
    key,
    category: categoryKey,
    name: `${emoji}・${String(name).replace(/^[^・]+・/, '')}`,
    type: options.type || 'text',
    permissionProfile: options.permissionProfile || 'inherit',
    topic: options.topic,
  };
}

function validateDescription(description) {
  const value = String(description || '').replace(/\s+/g, ' ').trim();
  if (value.length < DESCRIPTION_MIN_LENGTH) {
    throw new Error(`Décrivez votre serveur en au moins ${DESCRIPTION_MIN_LENGTH} caractères.`);
  }
  if (value.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`La description ne doit pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères.`);
  }
  return value;
}

function buildAdaptiveBlueprint(description, options = {}) {
  const cleanDescription = validateDescription(description);
  const text = searchable(cleanDescription);
  const isMinecraft = mentions(text, ['minecraft', 'skyblock', 'survie', 'faction', 'moddé', 'modde', 'serveur de jeu']);
  const isGaming = mentions(text, ['gaming', 'joueur', 'jeux video', 'jeux vidéo', 'esport', 'team', 'clan', 'guilde']);
  const isCreator = mentions(text, ['youtube', 'twitch', 'stream', 'live', 'video', 'vidéo', 'createur', 'créateur', 'influenceur']);
  const isFiveM = mentions(text, ['fivem', 'gta rp', 'redm', 'ville rp', 'city rp', 'whitelist']);
  const isTabletopRoleplay = mentions(text, ['dnd', 'd&d', 'donjons et dragons', 'jdr', 'jeu de role sur table', 'jeu de rôle sur table', 'tabletop', 'campagne']);
  const isRoleplay = isFiveM
    || isTabletopRoleplay
    || mentions(text, ['roleplay', 'role play', 'lore', 'personnage', 'jeu de role', 'jeu de rôle'])
    || containsToken(text, 'rp');
  const isGeneralCommunity = mentions(text, ['communaute', 'communauté', 'club', 'association', 'groupe', 'amis', 'passion', 'fandom', 'fan']);
  const roles = [
    role('founder', '👑 Fondateur', 0xe83220, ['Administrator'], { fallback: MANAGEMENT_PERMISSIONS, staff: true }),
    role('administrator', '⚙️ Administrateur', 0xf04b2f, MANAGEMENT_PERMISSIONS, { staff: true }),
    role('moderator', '🛡️ Modérateur', 0xf97316, ['ViewAuditLog', 'ManageMessages', 'KickMembers', 'ModerateMembers'], { staff: true }),
    role('member', '👤 Membre', 0x95a5a6),
    role('bot', '🤖 Bot', 0x3498db),
  ];
  const categories = [
    category('welcome', '📌 ACCUEIL', 'publicReadOnly', 'Informations accessibles avant l’acceptation du règlement.'),
    category('community', '💬 COMMUNAUTÉ', 'memberCommunity', 'Échanges réservés aux membres ayant accepté le règlement.'),
    category('staff', '🔐 STAFF', 'staffOnly', 'Coordination privée de l’équipe.'),
  ];
  const channels = [
    channel('welcome', 'welcome', 'bienvenue'),
    channel('rules', 'welcome', 'reglement'),
    channel('announcements', 'welcome', 'annonces'),
    channel('changelog', 'welcome', 'changelog', { topic: 'Nouvelles versions et correctifs publiés automatiquement par FyxBot.' }),
    channel('general', 'community', 'general'),
    channel('logs', 'staff', 'logs-fyxbot'),
    channel('staffChat', 'staff', 'discussion-staff'),
  ];
  const detectedNeeds = [];

  const addNeed = (label) => {
    if (!detectedNeeds.includes(label)) detectedNeeds.push(label);
  };

  if (isGeneralCommunity) {
    addNeed('vie communautaire');
    channels.push(
      channel('introductions', 'community', 'presentations'),
      channel('communityMedia', 'community', 'photos-et-medias'),
      channel('polls', 'community', 'sondages', { permissionProfile: 'memberReadOnly' }),
      channel('communityVoice', 'community', 'Discussion communautaire', { type: 'voice' }),
    );
  }

  if (mentions(text, ['ticket', 'support', 'aide', 'assistance', 'candidature', 'recrutement', 'commande client'])) {
    addNeed('support et demandes');
    roles.push(role('support', '🆘 Support', 0xffa726, ['ManageMessages'], { staff: true }));
    categories.push(category('support', '🎫 SUPPORT', 'memberReadOnly', 'Demandes guidées sans exposer les échanges privés des tickets.'));
    channels.push(
      channel('supportInfo', 'support', 'informations-support'),
      channel('supportFaq', 'support', 'questions-frequentes'),
      channel('ticketPanel', 'support', 'ouvrir-un-ticket'),
    );
  }

  if (mentions(text, ['suggestion', 'idee', 'idée', 'vote', 'sondage'])) {
    addNeed('suggestions et votes');
    channels.push(channel('suggestions', 'community', 'suggestions', { permissionProfile: 'memberReadOnly' }));
  }

  if (isMinecraft) {
    addNeed('univers de jeu Minecraft');
    roles.push(
      role('developer', '💻 Développeur', 0x5865f2),
      role('builder', '🧱 Builder', 0x57f287),
    );
    if (mentions(text, ['java'])) roles.push(role('javaPlayer', '☕ Joueur Java', 0xe67e22));
    if (mentions(text, ['bedrock', 'console', 'mobile'])) roles.push(role('bedrockPlayer', '🪨 Joueur Bedrock', 0x3498db));
    categories.push(category('gameServer', '⛏️ MINECRAFT', 'memberCommunity', 'Connexion, informations et entraide propres au serveur Minecraft.'));
    channels.push(
      channel('connectionGuide', 'gameServer', 'nous-rejoindre', { permissionProfile: 'memberReadOnly' }),
      channel('gameInfo', 'gameServer', 'infos-serveur', { permissionProfile: 'memberReadOnly' }),
      channel('gameStatus', 'gameServer', 'statut-serveur', { permissionProfile: 'memberReadOnly' }),
      channel('gameGuide', 'gameServer', 'guide-et-wiki', { permissionProfile: 'memberReadOnly' }),
      channel('gameUpdates', 'gameServer', 'mises-a-jour', { permissionProfile: 'memberReadOnly' }),
      channel('gameHelp', 'gameServer', 'aide-jeu'),
      channel('bugReports', 'gameServer', 'signalement-de-bugs'),
      channel('gameMedia', 'gameServer', 'screenshots'),
    );
    if (mentions(text, ['economie', 'économie', 'commerce', 'boutique', 'shop', 'trade', 'échange'])) {
      channels.push(channel('gameTrade', 'gameServer', 'commerce-et-echanges'));
    }
    if (mentions(text, ['faction', 'clan', 'guilde'])) {
      channels.push(channel('factionRecruitment', 'gameServer', 'recrutement-factions'));
    }
  }

  if (isGaming) {
    addNeed('communauté gaming');
    roles.push(role('captain', '🎯 Capitaine', 0x9b59b6));
    categories.push(category('gaming', '🎮 GAMING', 'memberCommunity', 'Organisation des groupes, matchs et échanges entre joueurs.'));
    channels.push(
      channel('lookingForGroup', 'gaming', 'recherche-equipe'),
      channel('recruitment', 'gaming', 'recrutement'),
      channel('matchSchedule', 'gaming', 'calendrier-des-matchs', { permissionProfile: 'memberReadOnly' }),
      channel('strategy', 'gaming', 'strategies-et-conseils'),
      channel('gameClips', 'gaming', 'clips-et-highlights'),
      channel('gamingVoice', 'gaming', 'Salon gaming', { type: 'voice' }),
    );
  }

  if (isCreator) {
    addNeed('création de contenu');
    roles.push(
      role('creator', '🎥 Créateur', 0xff4655, [], { staff: true }),
      role('twitchModerator', '🛡️ Modérateur Twitch', 0x9146ff, ['ManageMessages'], { staff: true }),
      role('editor', '🎬 Monteur', 0x9b59b6, [], { staff: true }),
      role('designer', '🎨 Designer', 0x1abc9c, [], { staff: true }),
    );
    if (mentions(text, ['vip'])) roles.push(role('vip', '💎 VIP', 0xf1c40f));
    if (mentions(text, ['sub', 'subscriber', 'abonne', 'abonné'])) roles.push(role('subscriber', '⭐ Abonné', 0x9146ff));
    categories.push(category('content', '🎥 CONTENU', 'memberCommunity', 'Publications du créateur, participation des membres et espace privé de production.'));
    channels.push(
      channel('creatorSchedule', 'content', 'planning-des-lives', { permissionProfile: 'memberReadOnly' }),
      channel('videos', 'content', 'nouvelles-videos', { permissionProfile: 'memberReadOnly' }),
      channel('liveNotifications', 'content', 'notifications-live', { permissionProfile: 'memberReadOnly' }),
      channel('clips', 'content', 'clips-de-la-communaute'),
      channel('fanArt', 'content', 'fan-arts'),
      channel('creatorIdeas', 'content', 'idees-de-contenu'),
      channel('backstage', 'content', 'coulisses', { permissionProfile: 'staffOnly' }),
    );
  }

  if (isRoleplay) {
    addNeed('roleplay');
    roles.push(
      role('gameMaster', '🎭 Maître du jeu', 0x9b59b6, ['ManageMessages'], { staff: true }),
      role('character', '🧙 Personnage validé', 0x57f287),
      role('observer', '👁️ Observateur', 0x95a5a6),
    );
    categories.push(
      category('roleplayInfo', '📚 UNIVERS RP', 'memberReadOnly', 'Références communes pour comprendre l’univers et ses règles.'),
      category('roleplayOoc', '💬 HORS ROLEPLAY', 'memberCommunity', 'Discussions et préparation séparées des scènes jouées.'),
      category('roleplay', '🎭 ROLEPLAY', 'memberCommunity', 'Salons consacrés aux personnages et aux scènes en jeu.'),
    );
    channels.push(
      channel('rpGuide', 'roleplayInfo', 'guide-du-roleplay'),
      channel('lore', 'roleplayInfo', 'lore'),
      channel('characters', 'roleplay', 'fiches-personnages'),
      channel('characterValidation', 'staff', 'validation-personnages', { permissionProfile: 'staffOnly' }),
      channel('oocGeneral', 'roleplayOoc', 'discussion-hrp'),
      channel('plotDiscussion', 'roleplayOoc', 'intrigues-et-preparation'),
      channel('diceRolls', 'roleplayOoc', 'lancers-de-des'),
      channel('scenes', 'roleplay', 'scenes-rp'),
      channel('rpLobby', 'roleplay', 'place-centrale'),
    );

    if (isFiveM) {
      addNeed('roleplay FiveM et whitelist');
      categories.push(category('city', '🏙️ VILLE RP', 'memberCommunity', 'Accès, informations et vie quotidienne du serveur FiveM ou RedM.'));
      channels.push(
        channel('whitelist', 'city', 'demande-de-whitelist'),
        channel('cityInfo', 'city', 'informations-ville', { permissionProfile: 'memberReadOnly' }),
        channel('rpServerStatus', 'city', 'statut-du-serveur', { permissionProfile: 'memberReadOnly' }),
        channel('jobs', 'city', 'emplois-et-entreprises'),
        channel('rpBugReports', 'city', 'signalement-de-bugs'),
      );
    }

    if (isTabletopRoleplay) {
      addNeed('campagne de jeu de rôle sur table');
      categories.push(category('campaign', '🗺️ CAMPAGNE', 'memberCommunity', 'Organisation des séances et progression de la campagne sur table.'));
      channels.push(
        channel('campaignInfo', 'campaign', 'informations-campagne', { permissionProfile: 'memberReadOnly' }),
        channel('sessions', 'campaign', 'calendrier-des-sessions', { permissionProfile: 'memberReadOnly' }),
        channel('tabletopVoice', 'campaign', 'Table de jeu', { type: 'voice' }),
      );
    }
  }

  if (mentions(text, ['entreprise', 'business', 'boutique', 'vente', 'client', 'service', 'freelance'])) {
    addNeed('activité professionnelle');
    roles.push(
      role('manager', '📋 Responsable', 0xe67e22, ['ManageMessages'], { staff: true }),
      role('client', '🤝 Client', 0x1abc9c),
    );
    categories.push(category('business', '💼 SERVICES', 'memberCommunity', 'Présentation de l’activité et échanges structurés avec les clients.'));
    channels.push(
      channel('offers', 'business', 'offres', { permissionProfile: 'memberReadOnly' }),
      channel('faq', 'business', 'questions-frequentes', { permissionProfile: 'memberReadOnly' }),
      channel('portfolio', 'business', 'realisations', { permissionProfile: 'memberReadOnly' }),
      channel('orders', 'business', 'demandes-clients'),
      channel('reviews', 'business', 'avis-clients'),
    );
  }

  if (mentions(text, ['ecole', 'école', 'formation', 'cours', 'etudiant', 'étudiant', 'apprentissage', 'entraide scolaire'])) {
    addNeed('apprentissage');
    roles.push(
      role('teacher', '📚 Formateur', 0x5865f2, ['ManageMessages'], { staff: true }),
      role('student', '🎓 Étudiant', 0x57f287),
    );
    categories.push(category('learning', '📚 APPRENTISSAGE', 'memberCommunity', 'Cours, ressources et entraide entre apprenants et formateurs.'));
    channels.push(
      channel('courseAnnouncements', 'learning', 'annonces-des-cours', { permissionProfile: 'memberReadOnly' }),
      channel('resources', 'learning', 'ressources', { permissionProfile: 'memberReadOnly' }),
      channel('homeworkHelp', 'learning', 'entraide'),
      channel('projects', 'learning', 'projets'),
      channel('classVoice', 'learning', 'Salle de cours', { type: 'voice' }),
    );
  }

  if (mentions(text, ['musique', 'music', 'artiste', 'dj', 'chanteur', 'producteur', 'beatmaker'])) {
    addNeed('musique');
    roles.push(role('artist', '🎵 Artiste', 0xe91e63), role('dj', '🎧 DJ', 0x9b59b6));
    categories.push(category('music', '🎵 MUSIQUE', 'memberCommunity', 'Partage des créations, retours constructifs et collaborations musicales.'));
    channels.push(
      channel('releases', 'music', 'sorties', { permissionProfile: 'memberReadOnly' }),
      channel('demos', 'music', 'demos'),
      channel('feedback', 'music', 'avis-et-retours'),
      channel('collaborations', 'music', 'collaborations'),
      channel('musicVoice', 'music', 'Studio vocal', { type: 'voice' }),
    );
  }

  if (mentions(text, ['evenement', 'événement', 'concours', 'animation', 'tournoi'])) {
    addNeed('événements');
    roles.push(role('animator', '🎉 Animateur', 0x9b59b6, [], { staff: true }));
    categories.push(category('events', '🎉 ÉVÉNEMENTS', 'memberCommunity', 'Annonces, inscriptions et organisation des animations.'));
    channels.push(
      channel('eventAnnouncements', 'events', 'evenements', { permissionProfile: 'memberReadOnly' }),
      channel('eventRegistration', 'events', 'inscriptions'),
    );
  }

  if (mentions(text, ['partenaire', 'partenariat', 'collaboration', 'sponsor'])) {
    addNeed('partenariats');
    roles.push(role('partner', '🤝 Partenaire', 0x1abc9c));
    channels.push(channel('partnerships', 'community', 'partenariats'));
  }

  if (mentions(text, ['vocal', 'vocaux', 'voice', 'salon temporaire', 'salons temporaires', 'private room', 'privateroom'])) {
    addNeed('salons vocaux');
    categories.push(category('voice', '🔊 SALONS VOCAUX', 'memberCommunity', 'Espaces vocaux permanents ou temporaires réservés aux membres.'));
    channels.push(
      channel('loungeVoice', 'voice', 'Discussion', { type: 'voice' }),
      channel('privateVoiceHub', 'voice', 'Créer un salon', { type: 'voice' }),
    );
  }

  const finalRoles = uniqueByKey(roles);
  const finalCategories = uniqueByKey(categories);
  const finalChannels = uniqueByKey(channels);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    guildName: String(options.guildName || '').trim() || null,
    description: cleanDescription,
    detectedNeeds: detectedNeeds.length > 0 ? detectedNeeds : ['communauté générale décrite librement'],
    roles: finalRoles,
    categories: finalCategories,
    channels: finalChannels,
    explanations: finalCategories
      .filter((item) => item.reason)
      .map((item) => ({ categoryKey: item.key, name: item.name, reason: item.reason })),
  };
}

module.exports = {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MANAGEMENT_PERMISSIONS,
  buildAdaptiveBlueprint,
  validateDescription,
};
