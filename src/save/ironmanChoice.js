// Ironman is a property of the run, not of the profile. A new game may still
// choose it. Once the run has playtime, or a save has stamped the latch, the
// boundary is closed in both directions. Casual and veteran stay interchangeable.

export function ironmanDifficulty(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  return gameplay && gameplay.difficulty === 'ironman' ? 'ironman' : (gameplay && gameplay.difficulty) || 'standard';
}

export function ironmanChoiceLocked(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  if (gameplay && gameplay.ironmanChoiceLocked === true) return true;
  const played = Number(state && state.simTime);
  return Number.isFinite(played) && played > 0;
}

/**
 * Decide a difficulty change before any write.
 * needsConfirm is only the unlocked crossing into or out of Ironman.
 */
export function ironmanChoiceChange(state, next) {
  const current = ironmanDifficulty(state);
  const target = next === 'ironman' ? 'ironman' : String(next || 'standard');
  if (target === current) return { ok: true, reason: 'same', needsConfirm: false };
  const crosses = current === 'ironman' || target === 'ironman';
  if (crosses && ironmanChoiceLocked(state)) {
    return {
      ok: false,
      reason: current === 'ironman' ? 'ironman_locked' : 'ironman_closed',
      needsConfirm: false,
      text: current === 'ironman'
        ? 'Ironman is locked for this run. Death ends it.'
        : 'This run has already started. Ironman stays off.',
    };
  }
  if (!crosses) return { ok: true, reason: 'open', needsConfirm: false };
  return {
    ok: true,
    reason: 'confirm',
    needsConfirm: true,
    title: target === 'ironman' ? 'Ironman' : 'Leave Ironman',
    body: target === 'ironman'
      ? 'Ironman ends the run when you die. Once the run has playtime you cannot turn it off.'
      : 'Leave Ironman before the run starts? Death becomes recoverable again.',
  };
}

/** Stamp the latch onto a settings clone when the run has playtime. */
export function stampIronmanLatch(settings, simTime) {
  const played = Number(simTime);
  if (!settings || !settings.gameplay || typeof settings.gameplay !== 'object') return settings;
  if (Number.isFinite(played) && played > 0) settings.gameplay.ironmanChoiceLocked = true;
  else if (settings.gameplay.ironmanChoiceLocked !== true) delete settings.gameplay.ironmanChoiceLocked;
  return settings;
}
