const STEP_DEFINITIONS = Object.freeze([
  { key: 'structure', title: 'Structure et permissions', description: 'Construire une organisation adaptée et vérifier ses accès.', target: 'Configuration', weight: 25, priority: 1 },
  { key: 'security', title: 'Protection du serveur', description: 'Mettre en service les quatre protections AutoMod.', target: 'Sécurité', weight: 20, priority: 2 },
  { key: 'rules', title: 'Règlement et accès membres', description: 'Présenter les règles et ouvrir les espaces membres après validation.', target: 'Règlement', weight: 15, priority: 3 },
  { key: 'logs', title: 'Traçabilité', description: 'Conserver les actions importantes dans un salon dédié.', target: 'Logs', weight: 10, priority: 4 },
  { key: 'welcome', title: 'Accueil des membres', description: 'Configurer les arrivées, départs et le rôle automatique.', target: 'Accueil', weight: 10, priority: 5 },
  { key: 'tickets', title: 'Support communautaire', description: 'Configurer la catégorie et le rôle de l’équipe.', target: 'Tickets', weight: 10, priority: 6 },
  { key: 'community', title: 'Animation communautaire', description: 'Configurer les réseaux sociaux ou les salons vocaux temporaires.', target: 'Social', weight: 10, priority: 7 },
]);

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildStructureDiagnostic(setupBlueprint, setupAnalysis) {
  if (!setupBlueprint) {
    return {
      status: 'missing',
      score: 0,
      issues: ['Aucune structure personnalisée n’a encore été préparée.'],
      impact: 'Décrivez le serveur pour obtenir une organisation et des permissions adaptées.',
    };
  }

  if (!setupAnalysis) {
    return {
      status: 'complete',
      score: 25,
      issues: [],
      impact: 'La structure personnalisée est prête.',
    };
  }

  const missing = numeric(setupAnalysis.totals?.missing);
  const permissionIssues = numeric(setupAnalysis.totals?.permissionIssues);
  const hierarchyIssues = setupAnalysis.uneditableRoles?.length || 0;
  const issues = [];
  if (missing > 0) issues.push(`${missing} élément${missing > 1 ? 's' : ''} de structure à ajouter.`);
  if (permissionIssues > 0) issues.push(`${permissionIssues} permission${permissionIssues > 1 ? 's' : ''} à corriger.`);
  if (hierarchyIssues > 0) issues.push(`${hierarchyIssues} rôle${hierarchyIssues > 1 ? 's sont' : ' est'} placé${hierarchyIssues > 1 ? 's' : ''} au-dessus de FyxBot.`);
  const complete = issues.length === 0;
  return {
    status: complete ? 'complete' : 'attention',
    score: complete ? 25 : 12,
    issues,
    impact: complete
      ? 'La structure et les permissions correspondent à la proposition FyxBot.'
      : 'Corrigez ces écarts avant d’ouvrir complètement le serveur aux membres.',
  };
}

function buildOnboardingProgress({ setupBlueprint = null, setupAnalysis = null, config = {}, securityRules = 0 } = {}) {
  const structure = buildStructureDiagnostic(setupBlueprint, setupAnalysis);
  const enabledSecurityRules = Math.min(Math.max(numeric(securityRules), 0), 4);
  const ticketParts = Number(Boolean(config.tickets?.categoryId)) + Number(Boolean(config.tickets?.staffRoleId));
  const diagnosticState = {
    structure,
    security: {
      status: enabledSecurityRules >= 4 ? 'complete' : enabledSecurityRules > 0 ? 'attention' : 'missing',
      score: enabledSecurityRules * 5,
      issues: enabledSecurityRules >= 4 ? [] : [`${4 - enabledSecurityRules} protection${4 - enabledSecurityRules > 1 ? 's' : ''} AutoMod à activer.`],
      impact: enabledSecurityRules >= 4 ? 'Les quatre protections essentielles sont actives.' : 'Complétez AutoMod pour réduire le spam, les liens dangereux et les invitations indésirables.',
    },
    rules: {
      status: config.rules?.messageId ? 'complete' : 'missing',
      score: config.rules?.messageId ? 15 : 0,
      issues: config.rules?.messageId ? [] : ['Aucun règlement interactif publié.'],
      impact: config.rules?.messageId ? 'Le règlement et son parcours d’acceptation sont publiés.' : 'Publiez le règlement pour encadrer l’accès aux espaces membres.',
    },
    logs: {
      status: config.logs?.channelId ? 'complete' : 'missing',
      score: config.logs?.channelId ? 10 : 0,
      issues: config.logs?.channelId ? [] : ['Aucun salon de journaux configuré.'],
      impact: config.logs?.channelId ? 'Les actions importantes peuvent être retracées.' : 'Choisissez un salon privé pour conserver les événements importants.',
    },
    welcome: {
      status: config.welcome?.welcomeChannelId ? 'complete' : 'missing',
      score: config.welcome?.welcomeChannelId ? 10 : 0,
      issues: config.welcome?.welcomeChannelId ? [] : ['Le parcours d’arrivée n’est pas configuré.'],
      impact: config.welcome?.welcomeChannelId ? 'Les nouveaux membres reçoivent un accueil configuré.' : 'Préparez l’accueil pour guider les nouveaux membres dès leur arrivée.',
    },
    tickets: {
      status: ticketParts === 2 ? 'complete' : ticketParts === 1 ? 'attention' : 'missing',
      score: ticketParts * 5,
      issues: ticketParts === 2 ? [] : [ticketParts === 1 ? 'La configuration des tickets est incomplète.' : 'Aucun espace de support privé configuré.'],
      impact: ticketParts === 2 ? 'Les demandes privées peuvent être orientées vers l’équipe.' : 'Définissez la catégorie et le rôle responsables des tickets.',
    },
    community: {
      status: config.social?.channelId || config.temporaryVoice?.hubChannelId ? 'complete' : 'missing',
      score: config.social?.channelId || config.temporaryVoice?.hubChannelId ? 10 : 0,
      issues: config.social?.channelId || config.temporaryVoice?.hubChannelId ? [] : ['Aucun outil d’animation principal configuré.'],
      impact: config.social?.channelId || config.temporaryVoice?.hubChannelId ? 'Au moins un outil d’animation est actif.' : 'Ajoutez des notifications sociales ou des salons vocaux temporaires.',
    },
  };

  const steps = STEP_DEFINITIONS.map((definition) => {
    const diagnostic = diagnosticState[definition.key];
    return {
      ...definition,
      ...diagnostic,
      maxScore: definition.weight,
      complete: diagnostic.status === 'complete',
    };
  });
  const completedCount = steps.filter((step) => step.complete).length;
  const percent = Math.round((completedCount / steps.length) * 100);
  const healthScore = steps.reduce((total, step) => total + step.score, 0);
  const recommendations = steps
    .filter((step) => !step.complete)
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 3);
  const complete = completedCount === steps.length;
  return {
    completedCount,
    totalCount: steps.length,
    percent,
    healthScore,
    complete,
    steps,
    diagnostics: steps,
    recommendations,
    recommendedStep: recommendations[0] || null,
    summary: {
      ready: completedCount,
      attention: steps.filter((step) => step.status === 'attention').length,
      missing: steps.filter((step) => step.status === 'missing').length,
    },
    healthLevel: complete ? 'ready' : healthScore >= 65 ? 'progressing' : healthScore >= 30 ? 'starting' : 'new',
  };
}

module.exports = { STEP_DEFINITIONS, buildOnboardingProgress };
