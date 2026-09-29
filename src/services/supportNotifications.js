const logger = require('./logger').logger.child({ component: 'support-notifications' });

function supportLink(panelUrl, requestId) {
  try {
    const url = new URL(panelUrl);
    if (url.protocol !== 'https:' || !requestId) return null;
    url.pathname = '/v2';
    url.searchParams.set('supportRequest', requestId);
    return url.toString();
  } catch {
    return null;
  }
}

function notificationRecipients({ kind, request, actorId, ownerId, staffIds = [] }) {
  if (kind === 'staff_reply' || kind === 'status_resolved' || kind === 'status_closed' || kind === 'status_reopened') {
    return request.requesterId !== actorId ? [request.requesterId] : [];
  }
  if (kind !== 'created' && kind !== 'user_reply' && kind !== 'user_closed' && kind !== 'user_reopened') return [];
  return [...new Set([ownerId, ...staffIds])].filter(id => id && id !== actorId);
}

async function notifySupport(client, { kind, request, actorId }, options = {}) {
  const environment = options.environment ?? process.env.NODE_ENV;
  const link = supportLink(options.panelUrl ?? process.env.DASHBOARD_PUBLIC_URL, request?.id);
  // The local panel can use a live bot token: never send real DMs from local tests.
  if (environment !== 'production' || !link || !request) return { sent: 0, skipped: true };

  try {
    let ownerId = null;
    let staffIds = [];
    if (kind === 'created' || kind === 'user_reply' || kind === 'user_closed' || kind === 'user_reopened') {
      try {
        await client.application.fetch();
        ownerId = client.application.owner?.ownerId || client.application.owner?.id || null;
      } catch (error) {
        logger.warn({ requestId: request.id, kind, error: error.message }, 'Propriétaire Support indisponible pour la notification');
      }
      try {
        const staff = await (options.listStaff || require('../database/supportStaffStore').listSupportStaff)();
        staffIds = staff.map(member => member.userId);
      } catch (error) {
        logger.warn({ requestId: request.id, kind, error: error.message }, 'Équipe Support indisponible pour la notification');
      }
    }
    const recipients = notificationRecipients({ kind, request, actorId, ownerId, staffIds });
    const labels = {
      created: 'Une nouvelle demande de support FyxBot est arrivée.',
      user_reply: 'Un utilisateur a répondu à une demande de support FyxBot.',
      staff_reply: 'L’équipe FyxBot a répondu à votre demande de support.',
      status_resolved: 'Votre demande de support FyxBot a été résolue.',
      status_closed: 'Votre demande de support FyxBot a été fermée.',
      user_closed: 'Un utilisateur a fermé sa demande de support FyxBot.',
      status_reopened: 'L’équipe FyxBot a rouvert votre demande de support.',
      user_reopened: 'Un utilisateur a rouvert sa demande de support FyxBot.',
    };
    const content = `${labels[kind]}\nOuvrir la demande : ${link}`;
    const results = await Promise.allSettled(recipients.map(async id => {
      const user = await client.users.fetch(id);
      await user.send({ content, allowedMentions: { parse: [] } });
    }));
    const sent = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (failed) logger.warn({ requestId: request.id, kind, failed }, 'Certaines notifications Support n’ont pas pu être envoyées');
    return { sent, failed };
  } catch (error) {
    logger.warn({ requestId: request.id, kind, error: error.message }, 'Notification Support indisponible');
    return { sent: 0, failed: 1 };
  }
}

module.exports = { notificationRecipients, notifySupport, supportLink };
