function createPostgresGiveawayStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const giveaways = `"${schema}"."community_giveaways"`;
  const entries = `"${schema}"."community_giveaway_entries"`;

  function mapGiveaway(row) {
    if (!row) return null;
    return {
      giveawayId: row.giveaway_id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      messageId: row.message_id,
      prize: row.prize,
      winnerCount: row.winner_count,
      participantCount: Number(row.participant_count || 0),
      endsAt: row.ends_at,
      status: row.status,
      createdAt: row.created_at,
      endedAt: row.ended_at,
    };
  }

  async function transaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally { client.release(); }
  }

  async function createGiveaway(giveaway) {
    await pool.query(`INSERT INTO ${giveaways}
      (giveaway_id, guild_id, channel_id, message_id, prize, winner_count, ends_at, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`, [
      giveaway.giveawayId, giveaway.guildId, giveaway.channelId, giveaway.messageId,
      giveaway.prize, giveaway.winnerCount, giveaway.endsAt, giveaway.createdAt,
    ]);
    return giveaway;
  }

  async function getGiveaway(giveawayId) {
    const result = await pool.query(`SELECT g.*,
      (SELECT COUNT(*)::int FROM ${entries} WHERE giveaway_id = g.giveaway_id) AS participant_count
      FROM ${giveaways} g WHERE g.giveaway_id = $1`, [giveawayId]);
    return mapGiveaway(result.rows[0]);
  }

  async function listGuildGiveaways(guildId, limit = 20) {
    const result = await pool.query(`SELECT g.*,
      (SELECT COUNT(*)::int FROM ${entries} WHERE giveaway_id = g.giveaway_id) AS participant_count
      FROM ${giveaways} g WHERE g.guild_id = $1 AND g.status IN ('active', 'drawing')
      ORDER BY g.ends_at ASC LIMIT $2`, [guildId, Math.min(Math.max(Number(limit) || 20, 1), 100)]);
    return result.rows.map(mapGiveaway);
  }

  async function registerGiveawayEntry(giveawayId, userId, { now = new Date() } = {}) {
    return transaction(async (client) => {
      const result = await client.query(`SELECT * FROM ${giveaways} WHERE giveaway_id = $1 FOR UPDATE`, [giveawayId]);
      const row = result.rows[0];
      if (!row || row.status !== 'active') throw new Error('Ce concours n’est plus ouvert.');
      if (new Date(row.ends_at).getTime() <= new Date(now).getTime()) throw new Error('Le tirage de ce concours est en cours.');
      const inserted = await client.query(`INSERT INTO ${entries} (giveaway_id, user_id, joined_at)
        VALUES ($1, $2, $3) ON CONFLICT (giveaway_id, user_id) DO NOTHING RETURNING user_id`,
      [giveawayId, userId, new Date(now).toISOString()]);
      const count = await client.query(`SELECT COUNT(*)::int AS total FROM ${entries} WHERE giveaway_id = $1`, [giveawayId]);
      return { giveaway: mapGiveaway({ ...row, participant_count: count.rows[0].total }),
        joined: inserted.rows.length === 1, participantCount: count.rows[0].total };
    });
  }

  async function listDueGiveaways({ now = new Date(), limit = 25 } = {}) {
    const result = await pool.query(`SELECT * FROM ${giveaways} WHERE status = 'active'
      AND ends_at <= $1 ORDER BY ends_at LIMIT $2`,
    [new Date(now).toISOString(), Math.min(Math.max(Number(limit) || 25, 1), 100)]);
    return result.rows;
  }

  async function claimGiveaway(giveawayId) {
    return transaction(async (client) => {
      const claimed = await client.query(`UPDATE ${giveaways} SET status = 'drawing'
        WHERE giveaway_id = $1 AND status = 'active' RETURNING *`, [giveawayId]);
      if (!claimed.rows.length) return null;
      const participants = await client.query(`SELECT user_id FROM ${entries}
        WHERE giveaway_id = $1 ORDER BY joined_at, user_id`, [giveawayId]);
      return { giveaway: mapGiveaway({ ...claimed.rows[0], participant_count: participants.rows.length }),
        userIds: participants.rows.map((row) => row.user_id) };
    });
  }

  async function completeGiveaway(giveawayId, { now = new Date() } = {}) {
    return transaction(async (client) => {
      const current = await client.query(`SELECT status FROM ${giveaways} WHERE giveaway_id = $1 FOR UPDATE`, [giveawayId]);
      if (current.rows[0]?.status !== 'drawing') return false;
      await client.query(`DELETE FROM ${entries} WHERE giveaway_id = $1`, [giveawayId]);
      await client.query(`UPDATE ${giveaways} SET status = 'ended', ended_at = $1 WHERE giveaway_id = $2`,
        [new Date(now).toISOString(), giveawayId]);
      return true;
    });
  }

  async function resetDrawing(giveawayId) {
    const result = await pool.query(`UPDATE ${giveaways} SET status = 'active'
      WHERE giveaway_id = $1 AND status = 'drawing' RETURNING giveaway_id`, [giveawayId]);
    return result.rows.length === 1;
  }

  async function recoverInterruptedGiveaways() {
    const result = await pool.query(`UPDATE ${giveaways} SET status = 'active'
      WHERE status = 'drawing' RETURNING giveaway_id`);
    return result.rows.length;
  }

  return {
    claimGiveaway, completeGiveaway, createGiveaway, getGiveaway, listDueGiveaways,
    listGuildGiveaways, recoverInterruptedGiveaways, registerGiveawayEntry, resetDrawing,
  };
}

module.exports = { createPostgresGiveawayStore };
