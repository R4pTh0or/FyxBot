const { PermissionFlagsBits } = require('discord.js');

const DANGEROUS_ROLE_PERMISSIONS = Object.freeze([
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.MentionEveryone,
]);

function hasDangerousRolePermissions(role) {
  return DANGEROUS_ROLE_PERMISSIONS.some((permission) => role?.permissions?.has?.(permission));
}

function assignableRoleIssue(guild, role, { actorMember = null, actorIsOwner = false } = {}) {
  if (!role || role.id === guild?.id) return 'missing';
  if (role.managed) return 'managed';
  if (hasDangerousRolePermissions(role)) return 'dangerous-permissions';
  const botHighestRole = guild?.members?.me?.roles?.highest;
  if (!botHighestRole || botHighestRole.comparePositionTo(role) <= 0) return 'bot-hierarchy';
  if (!actorIsOwner) {
    const actorHighestRole = actorMember?.roles?.highest;
    if (!actorHighestRole || actorHighestRole.comparePositionTo(role) <= 0) return 'actor-hierarchy';
  }
  return null;
}

function isSafeAssignableRole(guild, role, options) {
  return assignableRoleIssue(guild, role, options) === null;
}

function assignableRoleMessage(issue, role) {
  const name = role?.name ? ` « ${role.name} »` : '';
  if (issue === 'dangerous-permissions') {
    return `Le rôle${name} possède des permissions sensibles et ne peut pas être attribué automatiquement.`;
  }
  if (issue === 'actor-hierarchy') {
    return `Le rôle${name} doit être placé sous votre rôle le plus élevé.`;
  }
  if (issue === 'bot-hierarchy') {
    return `FyxBot ne peut pas attribuer le rôle${name}. Placez le rôle FyxBot plus haut dans Discord.`;
  }
  if (issue === 'managed') return `Le rôle${name} est géré par Discord ou une intégration.`;
  return 'Le rôle sélectionné est introuvable ou invalide.';
}

module.exports = {
  DANGEROUS_ROLE_PERMISSIONS,
  assignableRoleIssue,
  assignableRoleMessage,
  hasDangerousRolePermissions,
  isSafeAssignableRole,
};
