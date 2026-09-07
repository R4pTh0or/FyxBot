const STEP_DEFINITIONS = Object.freeze([
  { key: 'structure', title: 'Décrire le serveur', description: 'Créer une structure adaptée à votre projet.', target: 'Configuration' },
  { key: 'logs', title: 'Choisir les journaux', description: 'Conserver les actions importantes dans un salon dédié.', target: 'Logs' },
  { key: 'welcome', title: 'Préparer l’accueil', description: 'Configurer les arrivées, départs et le rôle automatique.', target: 'Accueil' },
  { key: 'security', title: 'Activer la sécurité', description: 'Mettre en service les quatre protections AutoMod.', target: 'Sécurité' },
  { key: 'rules', title: 'Publier le règlement', description: 'Présenter les règles et leur validation aux membres.', target: 'Règlement' },
  { key: 'tickets', title: 'Ouvrir le support', description: 'Configurer la catégorie et le rôle de l’équipe.', target: 'Tickets' },
  { key: 'community', title: 'Animer la communauté', description: 'Configurer les réseaux sociaux ou les salons vocaux temporaires.', target: 'Social' },
]);

function buildOnboardingProgress({ setupBlueprint = null, config = {}, securityRules = 0 } = {}) {
  const completed = {
    structure: Boolean(setupBlueprint),
    logs: Boolean(config.logs?.channelId),
    welcome: Boolean(config.welcome?.welcomeChannelId),
    security: securityRules >= 4,
    rules: Boolean(config.rules?.messageId),
    tickets: Boolean(config.tickets?.categoryId && config.tickets?.staffRoleId),
    community: Boolean(config.social?.channelId || config.temporaryVoice?.hubChannelId),
  };
  const steps = STEP_DEFINITIONS.map((step) => ({ ...step, complete: completed[step.key] }));
  const completedCount = steps.filter((step) => step.complete).length;
  const percent = Math.round((completedCount / steps.length) * 100);
  const recommendedStep = steps.find((step) => !step.complete) || null;
  return {
    completedCount,
    totalCount: steps.length,
    percent,
    complete: completedCount === steps.length,
    steps,
    recommendedStep,
    healthLevel: percent === 100 ? 'ready' : percent >= 60 ? 'progressing' : percent >= 30 ? 'starting' : 'new',
  };
}

module.exports = { STEP_DEFINITIONS, buildOnboardingProgress };
