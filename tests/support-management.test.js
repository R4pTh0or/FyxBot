const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  addSupportMessage,
  countOpenSupportRequests,
  createSupportRequest,
  deleteSupportRequest,
  getSupportConversation,
  listSupportRequests,
  purgeExpiredSupportRequests,
  updateSupportRequest,
} = require('../src/database/supportStore');
const {
  getSupportStaff,
  listSupportStaff,
  removeSupportStaff,
  upsertSupportStaff,
} = require('../src/database/supportStaffStore');
const {
  canAccessSupportRequest,
  normalizeSupportReply,
  normalizeSupportRequestInput,
  normalizeSupportStaffInput,
  normalizeSupportUpdate,
  SUPPORT_REOPEN_WINDOW_MS,
  SUPPORT_RETENTION_MS,
  supportRequestNeedsAction,
  supportRequestLifecycle,
  supportStatusAfterReply,
  supportAccessForRole,
} = require('../src/services/supportManagement');

function supportDatabase() {
  const target = new DatabaseSync(':memory:');
  target.exec(`
    CREATE TABLE support_requests (
      id TEXT PRIMARY KEY, guild_id TEXT, guild_name TEXT, requester_id TEXT, requester_name TEXT,
      category TEXT, subject TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT,
      last_message_at TEXT, closed_at TEXT
    );
    CREATE TABLE support_messages (
      id TEXT PRIMARY KEY, request_id TEXT, author_id TEXT, author_name TEXT, author_role TEXT,
      body TEXT, created_at TEXT
    );
    CREATE TABLE support_events (
      id TEXT PRIMARY KEY, request_id TEXT, actor_id TEXT, actor_name TEXT, event_type TEXT,
      detail TEXT, created_at TEXT
    );
    CREATE TABLE support_staff (
      user_id TEXT PRIMARY KEY, display_name TEXT, role TEXT, granted_by TEXT,
      created_at TEXT, updated_at TEXT
    );
  `);
  return target;
}

test('valide et borne les champs envoyés au support', () => {
  const input = normalizeSupportRequestInput({
    category: 'configuration',
    priority: 'high',
    subject: '  Problème de configuration  ',
    message: '  Le panneau ne sauvegarde plus les réglages de mon serveur.  ',
  });
  assert.deepEqual(input, {
    category: 'configuration',
    priority: 'high',
    subject: 'Problème de configuration',
    message: 'Le panneau ne sauvegarde plus les réglages de mon serveur.',
  });
  assert.throws(() => normalizeSupportRequestInput({ subject: 'Court', message: 'Trop court' }), /message/);
  assert.throws(() => normalizeSupportUpdate({ status: 'deleted', priority: 'urgent' }), /Statut/);
  assert.equal(normalizeSupportReply('  Merci pour votre aide.  '), 'Merci pour votre aide.');
});

test('isole les demandes des utilisateurs et réserve la vue globale au propriétaire', () => {
  const request = { requesterId: 'user-a', guildId: 'guild-a' };
  assert.equal(canAccessSupportRequest(request, { userId: 'user-a', manageableGuildIds: ['guild-a'] }), true);
  assert.equal(canAccessSupportRequest(request, { userId: 'user-b', manageableGuildIds: ['guild-a'] }), false);
  assert.equal(canAccessSupportRequest(request, { userId: 'user-a', manageableGuildIds: [] }), false);
  assert.equal(canAccessSupportRequest(request, { userId: 'owner', ownerAccess: true }), true);
});

test('applique des droits Support distincts au propriétaire, aux administrateurs et aux modérateurs', () => {
  const owner = supportAccessForRole('owner');
  const administrator = supportAccessForRole('administrator');
  const moderator = supportAccessForRole('moderator');
  const user = supportAccessForRole('unexpected');
  assert.equal(owner.canManageTeam, true);
  assert.equal(administrator.canViewAll, true);
  assert.equal(administrator.canManagePriority, true);
  assert.equal(administrator.canDeleteRequests, true);
  assert.equal(administrator.canManageTeam, false);
  assert.equal(moderator.canManageStatus, true);
  assert.equal(moderator.canManagePriority, false);
  assert.equal(moderator.canDeleteRequests, false);
  assert.equal(user.canViewAll, false);
  assert.equal(canAccessSupportRequest({ requesterId: 'user-a', guildId: 'guild-a' }, {
    userId: 'moderator', supportAccess: moderator,
  }), true);
});

test('signale au bon côté les demandes nécessitant une réponse', () => {
  assert.equal(supportRequestNeedsAction({ status: 'open', lastAuthorRole: 'user' }, true), true);
  assert.equal(supportRequestNeedsAction({ status: 'in_progress', lastAuthorRole: 'staff' }, true), false);
  assert.equal(supportRequestNeedsAction({ status: 'waiting_user', lastAuthorRole: 'staff' }), true);
  assert.equal(supportRequestNeedsAction({ status: 'resolved', lastAuthorRole: 'user' }, true), false);
});

test('ne rouvre pas implicitement une demande archivée avec une réponse', () => {
  assert.equal(supportStatusAfterReply('waiting_user', false), 'open');
  assert.equal(supportStatusAfterReply('resolved', false), null);
  assert.equal(supportStatusAfterReply('closed', true), null);
  assert.equal(supportStatusAfterReply('in_progress', true), null);
});

test('borne la réouverture à 14 jours et la conservation à 90 jours', () => {
  const closedAt = '2026-09-01T12:00:00.000Z';
  const active = supportRequestLifecycle({ status: 'closed', closedAt }, new Date('2026-09-10T12:00:00.000Z'));
  assert.equal(active.canReopen, true);
  assert.equal(active.reopenUntil, new Date(Date.parse(closedAt) + SUPPORT_REOPEN_WINDOW_MS).toISOString());
  assert.equal(active.expiresAt, new Date(Date.parse(closedAt) + SUPPORT_RETENTION_MS).toISOString());
  assert.equal(supportRequestLifecycle({ status: 'closed', closedAt }, new Date('2026-09-16T12:00:00.000Z')).canReopen, false);
  assert.deepEqual(supportRequestLifecycle({ status: 'open', closedAt: null }), {
    canReopen: false, reopenUntil: null, expiresAt: null,
  });
});

test('valide, attribue, modifie et retire un rôle Support', async () => {
  const target = supportDatabase();
  const input = normalizeSupportStaffInput({ userId: '123456789012345678', role: 'moderator' });
  assert.deepEqual(input, { userId: '123456789012345678', role: 'moderator' });
  assert.throws(() => normalizeSupportStaffInput({ userId: '123', role: 'moderator' }), /Identifiant Discord/);
  assert.throws(() => normalizeSupportStaffInput({ userId: '123456789012345678', role: 'owner' }), /Rôle Support/);
  await upsertSupportStaff({ ...input, displayName: 'Nova', grantedBy: 'owner' }, target);
  assert.equal((await getSupportStaff(input.userId, target)).role, 'moderator');
  await upsertSupportStaff({ ...input, role: 'administrator', displayName: 'Nova', grantedBy: 'owner' }, target);
  assert.equal((await listSupportStaff(target))[0].role, 'administrator');
  assert.equal(await removeSupportStaff(input.userId, target), true);
  assert.equal(await getSupportStaff(input.userId, target), null);
});

test('crée une conversation, ajoute des réponses et historise les décisions', async () => {
  const target = supportDatabase();
  const created = await createSupportRequest({
    guildId: 'guild-a', guildName: 'Serveur A', requesterId: 'user-a', requesterName: 'Alice',
    category: 'technical', subject: 'Commande indisponible', priority: 'normal',
    message: 'La commande de configuration retourne une erreur depuis ce matin.',
  }, target);
  assert.equal(created.status, 'open');
  assert.equal(await countOpenSupportRequests('user-a', target), 1);
  assert.equal((await listSupportRequests({ requesterId: 'user-a' }, target)).length, 1);
  assert.equal((await listSupportRequests({ requesterId: 'user-a' }, target))[0].lastAuthorRole, 'user');
  assert.equal((await listSupportRequests({ requesterId: 'user-b' }, target)).length, 0);

  await addSupportMessage({
    requestId: created.id, authorId: 'owner', authorName: 'Antony', authorRole: 'staff',
    body: 'Je vérifie la commande et je reviens vers vous.',
  }, target);
  assert.equal((await listSupportRequests({ requesterId: 'user-a' }, target))[0].lastAuthorRole, 'staff');
  await updateSupportRequest({
    requestId: created.id, status: 'waiting_user', priority: 'high', actorId: 'owner', actorName: 'Antony',
  }, target);
  const conversation = await getSupportConversation(created.id, target);
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[1].authorRole, 'staff');
  assert.equal(conversation.events.length, 2);
  assert.match(conversation.events[1].detail, /waiting_user/);
  assert.equal(conversation.request.status, 'waiting_user');
  assert.equal(conversation.request.priority, 'high');

  const closed = await updateSupportRequest({
    requestId: created.id, status: 'closed', priority: 'high', actorId: 'user-a', actorName: 'Alice',
  }, target);
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closedAt);
  assert.equal(await countOpenSupportRequests('user-a', target), 0);
  const closedConversation = await getSupportConversation(created.id, target);
  assert.equal(closedConversation.messages.length, 2);
  assert.equal(closedConversation.events.length, 3);
  assert.match(closedConversation.events[2].detail, /closed/);

  target.prepare('UPDATE support_requests SET closed_at = ? WHERE id = ?')
    .run('2026-01-01T00:00:00.000Z', created.id);
  assert.equal(await purgeExpiredSupportRequests({ cutoff: '2026-04-01T00:00:00.000Z' }, target), 1);
  assert.equal(await getSupportConversation(created.id, target), null);

  const removable = await createSupportRequest({
    guildId: 'guild-a', guildName: 'Serveur A', requesterId: 'user-a', requesterName: 'Alice',
    category: 'technical', subject: 'Demande à retirer', priority: 'normal',
    message: 'Je souhaite pouvoir supprimer cette demande après sa fermeture.',
  }, target);
  assert.equal(await deleteSupportRequest(removable.id, target), true);
  assert.equal(await deleteSupportRequest(removable.id, target), false);
});
