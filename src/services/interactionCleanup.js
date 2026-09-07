const DEFAULT_INTERACTION_CLEANUP_MS = 8_000;

function scheduleInteractionCleanup(interaction, options = {}) {
  const {
    delayMs = DEFAULT_INTERACTION_CLEANUP_MS,
    ephemeralOnly = true,
    setTimer = setTimeout,
  } = options;

  if (!interaction || typeof interaction.deleteReply !== 'function') return false;
  if (ephemeralOnly && interaction.ephemeral !== true) return false;

  const timer = setTimer(() => {
    if (!interaction.replied && !interaction.deferred) return;
    Promise.resolve(interaction.deleteReply()).catch(() => null);
  }, delayMs);
  timer?.unref?.();
  return true;
}

module.exports = { DEFAULT_INTERACTION_CLEANUP_MS, scheduleInteractionCleanup };
