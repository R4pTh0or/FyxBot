function buildContentLibrary({ publishedMessages = [], config = {}, channelNames = new Map() } = {}) {
  const items = [];
  const channelName = (id, fallback = 'salon inconnu') => channelNames.get(id) || fallback;
  for (const message of publishedMessages) {
    items.push({
      id: `message:${message.id}`,
      kind: 'message',
      title: message.title || message.content?.slice(0, 80) || 'Message personnalisé',
      description: `Message modifiable publié dans #${message.channelName || channelName(message.channelId)}.`,
      target: 'Messages',
      publicationId: message.id,
      updatedAt: message.updatedAt || message.createdAt || null,
      editable: true,
      removable: true,
    });
  }
  if (config.rules?.messageId) items.push({
    id: 'rules:main', kind: 'rules', title: config.rules.title || 'Règlement',
    description: `Règlement interactif publié dans #${channelName(config.rules.channelId)}.`,
    target: 'Règlement', entityId: 'main', updatedAt: config.rules.updatedAt || null, editable: true, removable: true,
  });
  for (const panel of config.tickets?.panels || []) items.push({
    id: `ticket:${panel.id}`, kind: 'ticket', title: panel.title || 'Panneau de tickets',
    description: `Panneau « ${panel.requestType || 'support'} » dans #${channelName(panel.panelChannelId)}.`,
    target: 'Tickets', entityId: panel.id, updatedAt: panel.updatedAt || null, editable: true, removable: true,
  });
  for (const panel of config.rolePanels || []) items.push({
    id: `role:${panel.id}`, kind: 'role', title: panel.title || 'Panneau de rôles',
    description: `${panel.roleIds?.length || 0} rôle(s) proposé(s) dans #${channelName(panel.channelId)}.`,
    target: 'Rôles', entityId: panel.id, updatedAt: panel.updatedAt || null, editable: true, removable: true,
  });
  if (config.welcome) items.push({
    id: 'welcome:main', kind: 'welcome', title: 'Accueil et départ',
    description: 'Messages automatiques de bienvenue et de départ.', target: 'Accueil',
    updatedAt: config.welcome.updatedAt || null, editable: true, removable: false,
  });
  if (config.birthdays?.channelId) items.push({
    id: 'birthdays:main', kind: 'birthdays', title: 'Annonce d’anniversaire',
    description: `Annonce automatique dans #${channelName(config.birthdays.channelId)}.`, target: 'Anniversaires',
    updatedAt: config.birthdays.updatedAt || null, editable: true, removable: false,
  });
  for (const source of config.social?.sources || []) items.push({
    id: `social:${source.id}`, kind: 'social', title: source.label || source.identifier,
    description: `Notification automatique ${source.platform === 'twitch' ? 'Twitch' : 'YouTube'}.`,
    target: 'Social', entityId: source.id, updatedAt: source.updatedAt || source.lastCheckedAt || config.social.updatedAt || null, editable: true, removable: true,
  });
  return items.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

module.exports = { buildContentLibrary };
