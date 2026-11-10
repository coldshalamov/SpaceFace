// The profile-scoped settings: the slice of state.settings that follows the player across New Game,
// a relaunch and every save slot (sf.settings.profile.v1), rather than living inside one run.
//
// ONE list, two readers. saveSystem's profileSettingsSnapshot() iterates these tables to decide what
// is written, and test/w2a-profile-settings-roundtrip.test.mjs scans the Settings screen for every
// control it exposes and fails when one is in neither the profile list nor the run-scoped list
// below. So a new Settings row cannot be silently forgotten on the next launch: classify it here.
//
// Normalisation has one home as well. Out-of-domain values are fixed by sanitizeRestoredSettings()
// (saveSystem.js), which runs on every restore and on the first line of the snapshot, so these
// pickers only copy in-domain values and drop what has no meaning.
import { normalizeGameSpeed } from '../core/timeEffects.js';

/** Ids the HUD glass preset may take. Parity with ui/hudAttention.js GLASS_PRESETS is tested. */
export const GLASS_PRESET_IDS = Object.freeze(['clean', 'hauler', 'fighter']);
/** Parity with systems/racingSteer.js STEERING_VIEWS is tested. */
export const STEERING_VIEW_IDS = Object.freeze(['overhead', 'racing', 'auto']);
/** Slider ranges of the racing chase camera; parity with racingSteer.racingRigOf is tested. */
export const RACING_RIG_RANGES = Object.freeze({
  racingDistance: Object.freeze([24, 140]),
  racingHeight: Object.freeze([6, 64]),
  racingLookAhead: Object.freeze([0, 120]),
});

/** Scalars on the root of state.settings that the profile carries. */
export const PROFILE_ROOT_KEYS = Object.freeze(['uiScale', 'locale', 'showDamageNumbers', 'glassPreset']);

/** Whole sections the profile carries verbatim (each is normalised as a section by the sanitizer). */
export const PROFILE_WHOLE_SECTIONS = Object.freeze(['audio', 'video', 'controls', 'accessibility']);

export function normalizeGlassPreset(value) {
  return GLASS_PRESET_IDS.includes(value) ? value : 'clean';
}

export function normalizeSteeringViewSetting(value) {
  return STEERING_VIEW_IDS.includes(value) ? value : undefined;
}

/** A finite number clamped to its slider range, or undefined: readers fall back to the rig default. */
export function normalizeRacingRigSetting(key, value) {
  const range = RACING_RIG_RANGES[key];
  if (!range || value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(range[1], Math.max(range[0], n));
}

/**
 * state.settings.gameplay keys the profile carries, each with the picker that reads its value out of
 * an already-sanitised gameplay bag. A picker returning undefined leaves the key out of the profile.
 */
export const PROFILE_GAMEPLAY_PICKERS = Object.freeze({
  autosaveIntervalS: (g) => g.autosaveIntervalS,
  tutorialHints: (g) => g.tutorialHints,
  controlScheme: (g) => g.controlScheme,
  controlSchemeV2: (g) => g.controlSchemeV2,
  masslineReleaseAssist: (g) => g.masslineReleaseAssist,
  // Already in-domain: the snapshot sanitises before it picks, so a second normalisation here
  // would only duplicate the rule and risk disagreeing with it.
  orbitAssistStrength: (g) => g.orbitAssistStrength,
  targetAssistStrength: (g) => g.targetAssistStrength,
  damageNumbers: (g) => g.damageNumbers,
  stuntMoments: (g) => (g.stuntMoments === 'flow' ? 'flow' : 'cinematic'),
  gameSpeed: (g) => normalizeGameSpeed(g.gameSpeed),
  velocityVectoring: (g) => g.velocityVectoring !== false,
  pauseOnFocusLoss: (g) => g.pauseOnFocusLoss !== false,
  // Row 493: Settings → Gameplay → Powers. Only 'press' changes behaviour (powersFireOnPress).
  powerFire: (g) => (g.powerFire === 'press' ? 'press' : 'hold'),
  // FB-001 opt-in chase assist; flightV3 gates on strict `=== true`.
  pursuitSlotAssist: (g) => g.pursuitSlotAssist === true,
  // FB-019 hit pips: on unless explicitly turned off.
  hitPips: (g) => g.hitPips !== false,
  // Race board: the personal ghost is on unless explicitly turned off.
  racingGhost: (g) => g.racingGhost !== false,
  // RACE-01 camera preference and its three rig sliders.
  steeringView: (g) => normalizeSteeringViewSetting(g.steeringView),
  racingDistance: (g) => normalizeRacingRigSetting('racingDistance', g.racingDistance),
  racingHeight: (g) => normalizeRacingRigSetting('racingHeight', g.racingHeight),
  racingLookAhead: (g) => normalizeRacingRigSetting('racingLookAhead', g.racingLookAhead),
});

/**
 * Gameplay keys the Settings screen exposes that deliberately stay with the run (or the build), and
 * why. The drift test accepts exactly these in addition to PROFILE_GAMEPLAY_PICKERS.
 */
export const RUN_SCOPED_GAMEPLAY_KEYS = Object.freeze({
  difficulty: 'chosen per run; Ironman is latched into the save slot itself',
});

export const PROFILE_GAMEPLAY_KEYS = Object.freeze(Object.keys(PROFILE_GAMEPLAY_PICKERS));

/** Build the gameplay bag of a profile from an already-sanitised gameplay section. */
export function profileGameplaySnapshot(gameplay) {
  const g = gameplay && typeof gameplay === 'object' ? gameplay : {};
  const out = {};
  for (const key of PROFILE_GAMEPLAY_KEYS) {
    const value = PROFILE_GAMEPLAY_PICKERS[key](g);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
