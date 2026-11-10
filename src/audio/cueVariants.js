// src/audio/cueVariants.js — X4 #4, the rotation seam for cues a player actually hears.
//
// The census counts EVENT EMITTERS, not audible cues: `ship:rcsPulse` fires per craft at ~0.12 s
// and never reaches the cue gate at all, while `combat:actionRejected` (154 emits) is admitted at
// most once per 4 ticks. The list below is the set that survives `combatActionLifecyclePlayerRelevant`
// + `shouldPlayCombatActionCue` and then reaches `audioSystem.play()`, plus the household UI verbs
// the ordinary route fires. Each play takes the next of three authored form variants — a body plus
// two pitch/form takes, which is what AUDIO_BRIEF.md permits ("a body plus two authored pitch/form
// variants") — so a 60 s fight does not machine-gun one sample.
//
// Pure. The caller owns the bag (the audio runtime); this module only reads/advances a counter.

export const CUE_VARIANTS = Object.freeze([
  Object.freeze({ index: 0, rate: 1, gain: 1 }),
  Object.freeze({ index: 1, rate: 1.018, gain: 0.94 }),
  Object.freeze({ index: 2, rate: 0.983, gain: 1.05 }),
]);

// The seven scored combat-action cues (COMBAT_ACTION_SCORED_CUES) — the only combat lifecycle
// events that pass the gate and call play().
export const HEARD_COMBAT_CUE_IDS = Object.freeze([
  'combat.action.dash.active',
  'combat.action.attach.lock',
  'combat.action.sling.release',
  'combat.action.cut.snap',
  'combat.action.burst.fire',
  'combat.action.cancel',
  'combat.action.reject',
]);

// Household UI + loot + the weapon bodies the ordinary route fires. These are heard cues, not
// emitters: one recipe, one play.
export const HEARD_ROUTINE_CUE_IDS = Object.freeze([
  'sfx_ui_click',
  'sfx_ui_hover',
  'sfx_ui_tab',
  'sfx_ui_confirm',
  'sfx_ui_open',
  'sfx_ui_back',
  'sfx_loot_collect',
  'sfx_wpn_pulse_laser',
  'sfx_wpn_autocannon',
  'sfx_wpn_flak',
  'sfx_wpn_railgun',
  'sfx_wpn_missile',
]);

export const VARIANT_CUE_IDS = Object.freeze([
  ...HEARD_COMBAT_CUE_IDS,
  ...HEARD_ROUTINE_CUE_IDS,
]);

const VARIANT_CUE_SET = new Set(VARIANT_CUE_IDS);

export function hasCueVariants(recipeId) {
  return VARIANT_CUE_SET.has(String(recipeId || ''));
}

/**
 * Advance the rotation for one cue and return its take. `bag` is any object with a `_cueVariants`
 * slot (the audio runtime in production). Returns null for a cue outside the authored set.
 */
export function nextCueVariant(bag, recipeId) {
  const id = String(recipeId || '');
  if (!bag || !VARIANT_CUE_SET.has(id)) return null;
  if (!bag._cueVariants || typeof bag._cueVariants !== 'object') bag._cueVariants = Object.create(null);
  const turn = ((Number(bag._cueVariants[id]) || 0) + 1) % CUE_VARIANTS.length;
  bag._cueVariants[id] = turn;
  return CUE_VARIANTS[turn];
}

/**
 * Resolve the take for one `play()` call. Explicit one-shot cues may name `opts.cueId`; otherwise
 * the recipe id is the key. Loops and already-pitched voices keep their authored body.
 */
export function cueVariantFor(bag, recipeId, opts = {}) {
  if (!opts || opts.loop === true || opts.noVariant === true) return null;
  const key = typeof opts.cueId === 'string' && opts.cueId ? opts.cueId : recipeId;
  return nextCueVariant(bag, key);
}
