const { resolveRuntimeStore } = require('./runtimeStorage');

function activeDatabase(targetDatabase) {
  return targetDatabase || require('./database').database;
}

const staffFields = `user_id AS userId, display_name AS displayName, role,
  granted_by AS grantedBy, created_at AS createdAt, updated_at AS updatedAt`;

function getSupportStaffSqlite(userId, targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare(`SELECT ${staffFields} FROM support_staff WHERE user_id = ?`)
    .get(String(userId || '').trim()) || null;
}

function listSupportStaffSqlite(targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare(`SELECT ${staffFields} FROM support_staff
      ORDER BY CASE role WHEN 'administrator' THEN 0 ELSE 1 END, display_name COLLATE NOCASE`)
    .all();
}

function upsertSupportStaffSqlite({ userId, displayName, role, grantedBy }, targetDatabase) {
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
  return getSupportStaffSqlite(userId, target);
}

function removeSupportStaffSqlite(userId, targetDatabase) {
  return activeDatabase(targetDatabase)
    .prepare('DELETE FROM support_staff WHERE user_id = ?')
    .run(String(userId || '').trim()).changes > 0;
}

async function getSupportStaff(userId, storage) {
  const selected = resolveRuntimeStore('supportStaff', storage);
  return selected?.getSupportStaff
    ? selected.getSupportStaff(userId)
    : getSupportStaffSqlite(userId, storage);
}

async function listSupportStaff(storage) {
  const selected = resolveRuntimeStore('supportStaff', storage);
  return selected?.listSupportStaff
    ? selected.listSupportStaff()
    : listSupportStaffSqlite(storage);
}

async function upsertSupportStaff(input, storage) {
  const selected = resolveRuntimeStore('supportStaff', storage);
  return selected?.upsertSupportStaff
    ? selected.upsertSupportStaff(input)
    : upsertSupportStaffSqlite(input, storage);
}

async function removeSupportStaff(userId, storage) {
  const selected = resolveRuntimeStore('supportStaff', storage);
  return selected?.removeSupportStaff
    ? selected.removeSupportStaff(userId)
    : removeSupportStaffSqlite(userId, storage);
}

module.exports = {
  getSupportStaff,
  listSupportStaff,
  removeSupportStaff,
  upsertSupportStaff,
};
