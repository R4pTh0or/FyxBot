const { database } = require('./database');

function activeDatabase(targetDatabase) {
  return targetDatabase || database;
}

const staffFields = `user_id AS userId, display_name AS displayName, role,
  granted_by AS grantedBy, created_at AS createdAt, updated_at AS updatedAt`;

function getSupportStaff(userId, targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare(`SELECT ${staffFields} FROM support_staff WHERE user_id = ?`)
    .get(String(userId || '').trim()) || null;
}

function listSupportStaff(targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare(`SELECT ${staffFields} FROM support_staff
      ORDER BY CASE role WHEN 'administrator' THEN 0 ELSE 1 END, display_name COLLATE NOCASE`)
    .all();
}

function upsertSupportStaff({ userId, displayName, role, grantedBy }, targetDatabase) {
  const target = activeDatabase(targetDatabase);
  const now = new Date().toISOString();
  target.prepare(`INSERT INTO support_staff
    (user_id, display_name, role, granted_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      role = excluded.role,
      granted_by = excluded.granted_by,
      updated_at = excluded.updated_at`)
    .run(userId, displayName, role, grantedBy, now, now);
  return getSupportStaff(userId, target);
}

function removeSupportStaff(userId, targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare('DELETE FROM support_staff WHERE user_id = ?')
    .run(String(userId || '').trim()).changes > 0;
}

module.exports = {
  getSupportStaff,
  listSupportStaff,
  removeSupportStaff,
  upsertSupportStaff,
};
