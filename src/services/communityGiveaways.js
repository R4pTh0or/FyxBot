const { randomInt, randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const GIVEAWAY_BUTTON_PREFIX = 'giveaway:join:';

function defaultDatabase() {
  return require('../database/database').database;
}

function normalizeGiveaway(input, { now = new Date() } = {}) {
  const prize = String(input.prize || '').trim().slice(0, 200);
  const winnerCount = Math.min(Math.max(Number(input.winnerCount) || 1, 1), 5);
  const durationMinutes = Math.min(Math.max(Number(input.durationMinutes) || 60, 10), 30 * 24 * 60);
  if (prize.length < 2) throw new Error('Le lot du concours doit contenir au moins 2 caractères.');
  return {
    prize,
    winnerCount,
    durationMinutes,
    endsAt: new Date(new Date(now).getTime() + durationMinutes * 60_000),
  };
}

function giveawayPayload(giveaway, { participantCount = 0, winners = [], ended = false } = {}) {
  const winnerText = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : 'Aucun participant éligible';
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x64748b : 0xf97316)
    .setTitle(`🎉 Concours · ${giveaway.prize}`)
    .setDescription(ended
      ? `Le concours est terminé.\n\n**Gagnant${winners.length > 1 ? 's' : ''} :** ${winnerText}`
      : 'Cliquez sur le bouton ci-dessous pour participer. Une seule participation par membre est enregistrée.')
    .addFields(
      { name: 'Gagnants', value: String(giveaway.winnerCount), inline: true },
      { name: 'Participants', value: String(participantCount), inline: true },
      { name: ended ? 'Terminé' : 'Tirage', value: `<t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:${ended ? 'f' : 'R'}>`, inline: true },
    )
    .setFooter({ text: 'FyxBot • Concours communautaire' });
  const button = new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_BUTTON_PREFIX}${giveaway.giveawayId}`)
    .setLabel(ended ? 'Concours terminé' : 'Participer')
    .setEmoji(ended ? '🏁' : '🎟️')
    .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(ended);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

async function createCommunityGiveaway(guild, channel, input, { targetDatabase, now = new Date() } = {}) {
  if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new Error('Choisissez un salon textuel de ce serveur.');
  const botMember = guild.members.me;
  if (!channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) throw new Error('FyxBot doit pouvoir voir le salon, envoyer des messages et intégrer des liens.');
  const normalized = normalizeGiveaway(input, { now });
  const giveaway = {
    giveawayId: randomUUID(),
    guildId: guild.id,
    channelId: channel.id,
    messageId: '',
    prize: normalized.prize,
    winnerCount: normalized.winnerCount,
    endsAt: normalized.endsAt.toISOString(),
    status: 'active',
    createdAt: new Date(now).toISOString(),
  };
  const message = await channel.send(giveawayPayload(giveaway));
  giveaway.messageId = message.id;
  const activeDatabase = targetDatabase || defaultDatabase();
  try {
    activeDatabase.prepare(`INSERT INTO community_giveaways
      (giveaway_id, guild_id, channel_id, message_id, prize, winner_count, ends_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .run(giveaway.giveawayId, giveaway.guildId, giveaway.channelId, giveaway.messageId,
        giveaway.prize, giveaway.winnerCount, giveaway.endsAt, giveaway.createdAt);
  } catch (error) {
    await message.delete().catch(() => null);
    throw error;
  }
  return { giveaway, message };
}

function getGiveaway(giveawayId, { targetDatabase } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  const row = activeDatabase.prepare('SELECT * FROM community_giveaways WHERE giveaway_id = ?').get(giveawayId);
  return row ? mapGiveaway(row, activeDatabase) : null;
}

function listGuildGiveaways(guildId, { targetDatabase, limit = 20 } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  return activeDatabase.prepare(`SELECT g.*, COUNT(e.user_id) AS participant_count
    FROM community_giveaways g
    LEFT JOIN community_giveaway_entries e ON e.giveaway_id = g.giveaway_id
    WHERE g.guild_id = ? AND g.status IN ('active', 'drawing')
    GROUP BY g.giveaway_id ORDER BY g.ends_at ASC LIMIT ?`).all(guildId, Math.min(Math.max(limit, 1), 100))
    .map((row) => mapGiveaway(row));
}

function mapGiveaway(row, activeDatabase = null) {
  const participantCount = row.participant_count ?? activeDatabase?.prepare(
    'SELECT COUNT(*) AS total FROM community_giveaway_entries WHERE giveaway_id = ?',
  ).get(row.giveaway_id).total ?? 0;
  return {
    giveawayId: row.giveaway_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    prize: row.prize,
    winnerCount: row.winner_count,
    participantCount,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function registerGiveawayEntry(giveawayId, userId, { targetDatabase, now = new Date() } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  const giveaway = getGiveaway(giveawayId, { targetDatabase: activeDatabase });
  if (!giveaway || giveaway.status !== 'active') throw new Error('Ce concours n’est plus ouvert.');
  if (new Date(giveaway.endsAt).getTime() <= new Date(now).getTime()) throw new Error('Le tirage de ce concours est en cours.');
  const result = activeDatabase.prepare(`INSERT OR IGNORE INTO community_giveaway_entries
    (giveaway_id, user_id, joined_at) VALUES (?, ?, ?)`).run(giveawayId, userId, new Date(now).toISOString());
  const participantCount = activeDatabase.prepare(
    'SELECT COUNT(*) AS total FROM community_giveaway_entries WHERE giveaway_id = ?',
  ).get(giveawayId).total;
  return { giveaway, joined: result.changes === 1, participantCount };
}

async function handleGiveawayButton(interaction, options = {}) {
  const giveawayId = interaction.customId.slice(GIVEAWAY_BUTTON_PREFIX.length);
  if (!giveawayId || interaction.user.bot) return interaction.reply({ content: 'Participation impossible.', flags: MessageFlags.Ephemeral });
  const giveaway = getGiveaway(giveawayId, options);
  if (!giveaway || giveaway.guildId !== interaction.guildId || giveaway.channelId !== interaction.channelId
    || giveaway.messageId !== interaction.message.id) {
    return interaction.reply({ content: 'Ce concours est introuvable ou n’appartient pas à ce message.', flags: MessageFlags.Ephemeral });
  }
  try {
    const result = registerGiveawayEntry(giveawayId, interaction.user.id, options);
    return interaction.reply({
      content: result.joined
        ? `🎟️ Participation enregistrée ! Vous êtes ${result.participantCount} participant(s).`
        : 'Vous participez déjà à ce concours.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
  }
}

function selectWinners(userIds, winnerCount, randomIndex = (maximum) => randomInt(maximum)) {
  const remaining = [...new Set(userIds)];
  const winners = [];
  while (remaining.length > 0 && winners.length < winnerCount) {
    winners.push(remaining.splice(randomIndex(remaining.length), 1)[0]);
  }
  return winners;
}

async function finalizeGiveaway(client, row, { targetDatabase, now = new Date(), randomIndex } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  const claimed = activeDatabase.prepare("UPDATE community_giveaways SET status = 'drawing' WHERE giveaway_id = ? AND status = 'active'")
    .run(row.giveaway_id).changes === 1;
  if (!claimed) return { skipped: true, giveawayId: row.giveaway_id };
  const entries = activeDatabase.prepare('SELECT user_id FROM community_giveaway_entries WHERE giveaway_id = ? ORDER BY joined_at')
    .all(row.giveaway_id).map((entry) => entry.user_id);
  const winners = selectWinners(entries, row.winner_count, randomIndex);
  const giveaway = mapGiveaway({ ...row, status: 'drawing', participant_count: entries.length });
  try {
    const channel = await client.channels.fetch(row.channel_id).catch(() => null);
    if (channel?.isTextBased() && channel.guildId === row.guild_id) {
      const message = await channel.messages.fetch(row.message_id).catch(() => null);
      if (message) await message.edit(giveawayPayload(giveaway, { participantCount: entries.length, winners, ended: true }));
      await channel.send({
        content: winners.length > 0
          ? `🎉 Félicitations ${winners.map((id) => `<@${id}>`).join(', ')} ! Vous remportez **${giveaway.prize}**.`
          : `🏁 Le concours **${giveaway.prize}** est terminé sans participant éligible.`,
        allowedMentions: { users: winners },
      });
    }
    activeDatabase.exec('BEGIN IMMEDIATE');
    try {
      activeDatabase.prepare('DELETE FROM community_giveaway_entries WHERE giveaway_id = ?').run(row.giveaway_id);
      activeDatabase.prepare("UPDATE community_giveaways SET status = 'ended', ended_at = ? WHERE giveaway_id = ?")
        .run(new Date(now).toISOString(), row.giveaway_id);
      activeDatabase.exec('COMMIT');
    } catch (error) {
      activeDatabase.exec('ROLLBACK');
      throw error;
    }
    return { giveawayId: row.giveaway_id, winners, participants: entries.length };
  } catch (error) {
    activeDatabase.prepare("UPDATE community_giveaways SET status = 'active' WHERE giveaway_id = ? AND status = 'drawing'")
      .run(row.giveaway_id);
    throw error;
  }
}

async function finalizeDueGiveaways(client, { targetDatabase, now = new Date(), randomIndex } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  const rows = activeDatabase.prepare("SELECT * FROM community_giveaways WHERE status = 'active' AND ends_at <= ? ORDER BY ends_at LIMIT 25")
    .all(new Date(now).toISOString());
  const results = [];
  for (const row of rows) {
    try {
      results.push(await finalizeGiveaway(client, row, { targetDatabase: activeDatabase, now, randomIndex }));
    } catch (error) {
      console.error(`[FyxBot] Tirage du concours ${row.giveaway_id} impossible :`, error);
      results.push({ giveawayId: row.giveaway_id, error: error.message });
    }
  }
  return results;
}

function recoverInterruptedGiveaways({ targetDatabase } = {}) {
  const activeDatabase = targetDatabase || defaultDatabase();
  return activeDatabase.prepare("UPDATE community_giveaways SET status = 'active' WHERE status = 'drawing'").run().changes;
}

function startGiveawayScheduler(client, { targetDatabase, intervalMs = 60_000 } = {}) {
  let running = false;
  recoverInterruptedGiveaways({ targetDatabase });
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await finalizeDueGiveaways(client, { targetDatabase });
    } catch (error) {
      console.error('[FyxBot] Vérification des concours impossible :', error);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), Math.max(intervalMs, 10_000));
  timer.unref?.();
  return { stop() { clearInterval(timer); } };
}

module.exports = {
  GIVEAWAY_BUTTON_PREFIX,
  createCommunityGiveaway,
  finalizeDueGiveaways,
  giveawayPayload,
  getGiveaway,
  handleGiveawayButton,
  listGuildGiveaways,
  normalizeGiveaway,
  recoverInterruptedGiveaways,
  registerGiveawayEntry,
  selectWinners,
  startGiveawayScheduler,
};
