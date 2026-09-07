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
  logs: '📋', staffChat: '🔐', ticketPanel: '🎫', suggestions: '💡', gameInfo: '📌',
  gameStatus: '📡', gameHelp: '🆘', gameMedia: '📸', lookingForGroup: '🔎', gameClips: '🎬',
  gamingVoice: '🎮', videos: '📺', liveNotifications: '🔴', backstage: '🎥', lore: '📖',
  characters: '🧙', scenes: '🎭', offers: '🛍️', orders: '📦', reviews: '⭐', resources: '📚',
  homeworkHelp: '🤝', projects: '🧪', releases: '🎵', demos: '🎼', collaborations: '🤝',
  musicVoice: '🎧', eventAnnouncements: '🎉', eventRegistration: '✅', partnerships: '🤝',
  loungeVoice: '🔊', privateVoiceHub: '➕',
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

function category(key, name, permissionProfile = 'memberCommunity') {
  return { key, name, permissionProfile };
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
  const roles = [
    role('founder', '👑 Fondateur', 0xe83220, ['Administrator'], { fallback: MANAGEMENT_PERMISSIONS, staff: true }),
    role('administrator', '⚙️ Administrateur', 0xf04b2f, MANAGEMENT_PERMISSIONS, { staff: true }),
    role('moderator', '🛡️ Modérateur', 0xf97316, ['ViewAuditLog', 'ManageMessages', 'KickMembers', 'ModerateMembers'], { staff: true }),
    role('member', '👤 Membre', 0x95a5a6),
    role('bot', '🤖 Bot', 0x3498db),
  ];
  const categories = [
    category('welcome', '📌 ACCUEIL', 'publicReadOnly'),
    category('community', '💬 COMMUNAUTÉ'),
    category('staff', '🔐 STAFF', 'staffOnly'),
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

  if (mentions(text, ['ticket', 'support', 'aide', 'assistance', 'candidature', 'recrutement', 'commande client'])) {
    addNeed('support et demandes');
    roles.push(role('support', '🆘 Support', 0xffa726, ['ManageMessages'], { staff: true }));
    categories.push(category('support', '🎫 SUPPORT', 'memberReadOnly'));
    channels.push(channel('ticketPanel', 'support', 'ouvrir-un-ticket'));
  }

  if (mentions(text, ['suggestion', 'idee', 'idée', 'vote', 'sondage'])) {
    addNeed('suggestions et votes');
    channels.push(channel('suggestions', 'community', 'suggestions', { permissionProfile: 'memberReadOnly' }));
  }

  if (mentions(text, ['minecraft', 'skyblock', 'survie', 'faction', 'moddé', 'modde', 'serveur de jeu'])) {
    addNeed('univers de jeu Minecraft');
    roles.push(
      role('developer', '💻 Développeur', 0x5865f2),
      role('builder', '🧱 Builder', 0x57f287),
    );
    categories.push(category('gameServer', '⛏️ SERVEUR DE JEU'));
    channels.push(
      channel('gameInfo', 'gameServer', 'infos-serveur', { permissionProfile: 'memberReadOnly' }),
      channel('gameStatus', 'gameServer', 'statut-serveur', { permissionProfile: 'memberReadOnly' }),
      channel('gameHelp', 'gameServer', 'aide-jeu'),
      channel('gameMedia', 'gameServer', 'screenshots'),
    );
  }

  if (mentions(text, ['gaming', 'joueur', 'jeux video', 'jeux vidéo', 'esport', 'team', 'clan', 'guilde'])) {
    addNeed('communauté gaming');
    roles.push(role('captain', '🎯 Capitaine', 0x9b59b6));
    categories.push(category('gaming', '🎮 GAMING'));
    channels.push(
      channel('lookingForGroup', 'gaming', 'recherche-equipe'),
      channel('gameClips', 'gaming', 'clips-et-highlights'),
      channel('gamingVoice', 'gaming', 'Salon gaming', { type: 'voice' }),
    );
  }

  if (mentions(text, ['youtube', 'twitch', 'stream', 'live', 'video', 'vidéo', 'createur', 'créateur', 'influenceur'])) {
    addNeed('création de contenu');
    roles.push(
      role('creator', '🎥 Créateur', 0xff4655),
      role('editor', '🎬 Monteur', 0x9b59b6),
      role('designer', '🎨 Designer', 0x1abc9c),
    );
    categories.push(category('content', '🎥 CONTENU'));
    channels.push(
      channel('videos', 'content', 'nouvelles-videos', { permissionProfile: 'memberReadOnly' }),
      channel('liveNotifications', 'content', 'notifications-live', { permissionProfile: 'memberReadOnly' }),
      channel('backstage', 'content', 'coulisses'),
    );
  }

  if (mentions(text, ['roleplay', 'role play', ' rp ', 'lore', 'personnage', 'jeu de role', 'jeu de rôle'])) {
    addNeed('roleplay');
    roles.push(role('gameMaster', '🎭 Maître du jeu', 0x9b59b6, ['ManageMessages'], { staff: true }));
    categories.push(category('roleplay', '🎭 ROLEPLAY'));
    channels.push(
      channel('lore', 'roleplay', 'lore', { permissionProfile: 'memberReadOnly' }),
      channel('characters', 'roleplay', 'fiches-personnages'),
      channel('scenes', 'roleplay', 'scenes-rp'),
    );
  }

  if (mentions(text, ['entreprise', 'business', 'boutique', 'vente', 'client', 'service', 'freelance'])) {
    addNeed('activité professionnelle');
    roles.push(
      role('manager', '📋 Responsable', 0xe67e22, ['ManageMessages'], { staff: true }),
      role('client', '🤝 Client', 0x1abc9c),
    );
    categories.push(category('business', '💼 SERVICES'));
    channels.push(
      channel('offers', 'business', 'offres', { permissionProfile: 'memberReadOnly' }),
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
    categories.push(category('learning', '📚 APPRENTISSAGE'));
    channels.push(
      channel('resources', 'learning', 'ressources', { permissionProfile: 'memberReadOnly' }),
      channel('homeworkHelp', 'learning', 'entraide'),
      channel('projects', 'learning', 'projets'),
    );
  }

  if (mentions(text, ['musique', 'music', 'artiste', 'dj', 'chanteur', 'producteur', 'beatmaker'])) {
    addNeed('musique');
    roles.push(role('artist', '🎵 Artiste', 0xe91e63), role('dj', '🎧 DJ', 0x9b59b6));
    categories.push(category('music', '🎵 MUSIQUE'));
    channels.push(
      channel('releases', 'music', 'sorties', { permissionProfile: 'memberReadOnly' }),
      channel('demos', 'music', 'demos'),
      channel('collaborations', 'music', 'collaborations'),
      channel('musicVoice', 'music', 'Studio vocal', { type: 'voice' }),
    );
  }

  if (mentions(text, ['evenement', 'événement', 'concours', 'animation', 'tournoi'])) {
    addNeed('événements');
    roles.push(role('animator', '🎉 Animateur', 0x9b59b6, [], { staff: true }));
    categories.push(category('events', '🎉 ÉVÉNEMENTS'));
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
    categories.push(category('voice', '🔊 SALONS VOCAUX'));
    channels.push(
      channel('loungeVoice', 'voice', 'Discussion', { type: 'voice' }),
      channel('privateVoiceHub', 'voice', 'Créer un salon', { type: 'voice' }),
    );
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    guildName: String(options.guildName || '').trim() || null,
    description: cleanDescription,
    detectedNeeds: detectedNeeds.length > 0 ? detectedNeeds : ['communauté générale décrite librement'],
    roles: uniqueByKey(roles),
    categories: uniqueByKey(categories),
    channels: uniqueByKey(channels),
  };
}

module.exports = {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MANAGEMENT_PERMISSIONS,
  buildAdaptiveBlueprint,
  validateDescription,
};
