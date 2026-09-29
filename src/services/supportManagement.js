const SUPPORT_CATEGORIES = Object.freeze([
  'technical',
  'configuration',
  'billing',
  'abuse',
  'privacy',
  'security',
  'other',
]);
const SUPPORT_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);
const SUPPORT_STATUSES = Object.freeze(['open', 'in_progress', 'waiting_user', 'resolved', 'closed']);
const CLOSED_SUPPORT_STATUSES = Object.freeze(['resolved', 'closed']);
const SUPPORT_STAFF_ROLES = Object.freeze(['moderator', 'administrator']);
const SUPPORT_REOPEN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const SUPPORT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function boundedText(value, { label, minimum, maximum }) {
  const text = String(value || '').trim();
  if (text.length < minimum) throw new Error(`${label} doit contenir au moins ${minimum} caractères.`);
  if (text.length > maximum) throw new Error(`${label} ne peut pas dépasser ${maximum} caractères.`);
  return text;
}

function enumValue(value, allowed, fallback, label) {
  const candidate = String(value || fallback).trim();
  if (!allowed.includes(candidate)) throw new Error(`${label} invalide.`);
  return candidate;
}

function normalizeSupportRequestInput(input = {}) {
  return {
    category: enumValue(input.category, SUPPORT_CATEGORIES, 'technical', 'Catégorie'),
    priority: enumValue(input.priority, SUPPORT_PRIORITIES, 'normal', 'Priorité'),
    subject: boundedText(input.subject, { label: 'Le sujet', minimum: 5, maximum: 120 }),
    message: boundedText(input.message, { label: 'Le message', minimum: 20, maximum: 4000 }),
  };
}

function normalizeSupportReply(value) {
  return boundedText(value, { label: 'La réponse', minimum: 2, maximum: 4000 });
}

function normalizeSupportUpdate(input = {}) {
  return {
    status: enumValue(input.status, SUPPORT_STATUSES, 'open', 'Statut'),
    priority: enumValue(input.priority, SUPPORT_PRIORITIES, 'normal', 'Priorité'),
  };
}

function normalizeSupportStaffInput(input = {}) {
  const userId = String(input.userId || '').trim();
  if (!/^\d{17,20}$/.test(userId)) throw new Error('Identifiant Discord invalide.');
  return {
    userId,
    role: enumValue(input.role, SUPPORT_STAFF_ROLES, 'moderator', 'Rôle Support'),
  };
}

function supportAccessForRole(role) {
  const normalizedRole = role === 'owner' || SUPPORT_STAFF_ROLES.includes(role) ? role : 'user';
  return {
    role: normalizedRole,
    canViewAll: normalizedRole !== 'user',
    canReplyAsStaff: normalizedRole !== 'user',
    canManageStatus: normalizedRole !== 'user',
    canManagePriority: normalizedRole === 'owner' || normalizedRole === 'administrator',
    canDeleteRequests: normalizedRole === 'owner' || normalizedRole === 'administrator',
    canManageTeam: normalizedRole === 'owner',
  };
}

function canAccessSupportRequest(request, { userId, ownerAccess, staffAccess, supportAccess, manageableGuildIds = [] } = {}) {
  if (!request || !userId) return false;
  if (ownerAccess || staffAccess || supportAccess?.canViewAll) return true;
  return request.requesterId === userId && manageableGuildIds.includes(request.guildId);
}

function supportRequestNeedsAction(request, staffView = false) {
  return Boolean(request && !CLOSED_SUPPORT_STATUSES.includes(request.status)
    && request.lastAuthorRole === (staffView ? 'user' : 'staff'));
}

function supportStatusAfterReply(status, staffReply = false) {
  if (CLOSED_SUPPORT_STATUSES.includes(status)) return null;
  if (staffReply) return null;
  return status === 'waiting_user' ? 'open' : null;
}

function supportRequestLifecycle(request, now = new Date()) {
  const closedAt = request?.closedAt ? new Date(request.closedAt) : null;
  const closed = Boolean(request && CLOSED_SUPPORT_STATUSES.includes(request.status) && closedAt && !Number.isNaN(closedAt.getTime()));
  if (!closed) return { canReopen: false, reopenUntil: null, expiresAt: null };
  const reopenUntil = new Date(closedAt.getTime() + SUPPORT_REOPEN_WINDOW_MS);
  const expiresAt = new Date(closedAt.getTime() + SUPPORT_RETENTION_MS);
  return {
    canReopen: now.getTime() <= reopenUntil.getTime(),
    reopenUntil: reopenUntil.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function publicSupportUrl() {
  const raw = String(process.env.FYXBOT_SUPPORT_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

module.exports = {
  CLOSED_SUPPORT_STATUSES,
  SUPPORT_REOPEN_WINDOW_MS,
  SUPPORT_RETENTION_MS,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STAFF_ROLES,
  SUPPORT_STATUSES,
  canAccessSupportRequest,
  normalizeSupportReply,
  normalizeSupportRequestInput,
  normalizeSupportStaffInput,
  normalizeSupportUpdate,
  publicSupportUrl,
  supportRequestNeedsAction,
  supportRequestLifecycle,
  supportStatusAfterReply,
  supportAccessForRole,
};
