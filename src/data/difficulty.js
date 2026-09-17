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
    defeatMercy: true,
  }),
  standard: Object.freeze({
    id: 'standard',
    // ~15% faster kills, ~50% less lethal incoming for the current early-game feel.
    playerOutgoingDamage: 1.15,
    playerIncomingDamage: 0.50,
    defeatMercy: true,
  }),
  veteran: Object.freeze({
    id: 'veteran',
    playerOutgoingDamage: 1.0,
    playerIncomingDamage: 1.0,
    // Advertised as the unsoftened baseline; the defeat-streak floor stays off.
    defeatMercy: false,
  }),
  ironman: Object.freeze({
    id: 'ironman',
    playerOutgoingDamage: 1.0,
    playerIncomingDamage: 1.0,
    // Permadeath can never accumulate a recoverable streak; opted out by profile too.
    defeatMercy: false,
  }),
});

// Defeat-streak mercy lever (the adaptive-difficulty audit finding). Repeated recoverable
// defeats inside a bounded sim window ease incoming player damage ~18% toward a floor. The
// lever is silent — no banner — but every defeat receipt records the resulting scale. A clean
// interval without another defeat lets the streak decay back to the profile baseline.
export const DEFEAT_STREAK_WINDOW_S = 1200;    // defeats within 20 min of sim time stack
export const DEFEAT_STREAK_MERCY_MIN = 2;      // streak depth needed before easing
export const DEFEAT_STREAK_MERCY_SCALE = 0.82; // ~18% ease on incoming player damage

export function difficultyProfile(state) {
  const id = state && state.settings && state.settings.gameplay
    && state.settings.gameplay.difficulty || 'standard';
  return DIFFICULTY_PROFILES[id] || DIFFICULTY_PROFILES.standard;
}

/**
 * Scale applied to an ordinary damage packet when the local player is attacker or target.
 * NPC↔NPC combat is always 1 so ambient brawls stay independent of run difficulty. The combat
 * router preserves the canonical non-lethal EMP disable verb separately; difficulty still scales
 * lethal, heat, mixed-ion, and legacy damage.
 */
/**
 * Extra incoming scale while a defeat streak is hot on a softened profile. The streak lives on
 * state.player.defeatStreak ({ count, lastDefeatSimTime }); combat writes it at the recoverable
 * defeat seam and the receipt records the active scale. Returns 1 for hard profiles, for scored
 * survival runs (the arena keeps its own tuning), for a cold/crafted streak, and once the window
 * since the last defeat has passed — the mercy decays without a reset event.
 */
export function defeatMercyScale(state, profile = difficultyProfile(state)) {
  if (!state || !profile || profile.defeatMercy !== true) return 1;
  if (state.run && state.run.kind === 'survival' && state.run.phase !== 'inactive') return 1;
  const streak = state.player && state.player.defeatStreak;
  const count = Math.max(0, Math.floor(Number(streak && streak.count) || 0));
  if (count < DEFEAT_STREAK_MERCY_MIN) return 1;
  const last = streak && streak.lastDefeatSimTime;
  const now = Number(state.simTime) || 0;
  if (typeof last !== 'number' || !Number.isFinite(last) || now - last > DEFEAT_STREAK_WINDOW_S) return 1;
  return DEFEAT_STREAK_MERCY_SCALE;
}

export function difficultyDamageScale(state, attackerId, targetId) {
  if (!state) return 1;
  const profile = difficultyProfile(state);
  if (targetId === state.playerId) return profile.playerIncomingDamage * defeatMercyScale(state, profile);
  if (attackerId === state.playerId) return profile.playerOutgoingDamage;
  return 1;
}
