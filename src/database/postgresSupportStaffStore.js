function createPostgresSupportStaffStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = `"${schema}"."support_staff"`;
  const fields = `user_id AS "userId", display_name AS "displayName", role,
    granted_by AS "grantedBy", created_at AS "createdAt", updated_at AS "updatedAt"`;

  async function getSupportStaff(userId) {
    const result = await pool.query(`SELECT ${fields} FROM ${table} WHERE user_id = $1`, [String(userId || '').trim()]);
    return result.rows[0] || null;
  }

  async function listSupportStaff() {
    const result = await pool.query(`SELECT ${fields} FROM ${table}
      ORDER BY CASE role WHEN 'administrator' THEN 0 ELSE 1 END, LOWER(display_name), user_id`);
    return result.rows;
  }

  async function upsertSupportStaff({ userId, displayName, role, grantedBy }) {
    const now = new Date().toISOString();
    const result = await pool.query(`INSERT INTO ${table}
      (user_id, display_name, role, granted_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        granted_by = EXCLUDED.granted_by,
        updated_at = EXCLUDED.updated_at
      RETURNING ${fields}`,
    [userId, displayName, role, grantedBy, now]);
    return result.rows[0];
  }

  async function removeSupportStaff(userId) {
    const result = await pool.query(`DELETE FROM ${table} WHERE user_id = $1 RETURNING user_id`, [String(userId || '').trim()]);
    return result.rows.length > 0;
  }

  return { getSupportStaff, listSupportStaff, removeSupportStaff, upsertSupportStaff };
}

module.exports = { createPostgresSupportStaffStore };
