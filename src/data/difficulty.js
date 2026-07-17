// Run difficulty profiles (New Game / Settings gameplay.difficulty).
// Combat applies these only on hits that involve the local player. NPC-vs-NPC is unscaled.
//
// Standard is tuned for playable QA while autotarget / flight assists are still settling:
// slightly faster kills, substantially more player survivability. Veteran/Ironman keep the
// unsoftened combat baseline; Ironman only adds permadeath at the recovery layer.

export const DIFFICULTY_PROFILES = Object.freeze({
  casual: Object.freeze({
    id: 'casual',
    // Softer hits on the pilot; friendlier prices live in economy (when wired).
    playerOutgoingDamage: 1.30,
    playerIncomingDamage: 0.40,
  }),
  standard: Object.freeze({
    id: 'standard',
    // ~15% faster kills, ~50% less lethal incoming for the current early-game feel.
    playerOutgoingDamage: 1.15,
    playerIncomingDamage: 0.50,
  }),
  veteran: Object.freeze({
    id: 'veteran',
    playerOutgoingDamage: 1.0,
    playerIncomingDamage: 1.0,
  }),
  ironman: Object.freeze({
    id: 'ironman',
    playerOutgoingDamage: 1.0,
    playerIncomingDamage: 1.0,
  }),
});

export function difficultyProfile(state) {
  const id = state && state.settings && state.settings.gameplay
    && state.settings.gameplay.difficulty || 'standard';
  return DIFFICULTY_PROFILES[id] || DIFFICULTY_PROFILES.standard;
}

/**
 * Scale applied to a damage packet when the local player is attacker or target.
 * NPC↔NPC combat is always 1 so ambient brawls stay independent of run difficulty.
 */
export function difficultyDamageScale(state, attackerId, targetId) {
  if (!state) return 1;
  const profile = difficultyProfile(state);
  if (targetId === state.playerId) return profile.playerIncomingDamage;
  if (attackerId === state.playerId) return profile.playerOutgoingDamage;
  return 1;
}
