// PQ-023 `gold-corridor-required-cues` — World Site damage/recovery cue states.
//
// Headless (no THREE, no DOM) so both consumers can import it:
//   - src/render/worldSitePresentation.js  — drives fixture opacity/scale/duty-cycle
//   - src/systems/presentationOrchestrator.js — maps worldSite:failureReceipt / operationReceipt
//     onto presentation cues with accessible text
//
// WHY THIS EXISTS (measured at b6b6422d, see the Phase-0 audit handoff):
// the Wreck Cathedral did have a damage/recovery visual, but it was a stage-wide HUE SHIFT
// (#72c9d4 -> #6594a6) and nothing else — opacity, scale, visibility and geometry were
// byte-identical. Two consequences:
//   1. The only channel carrying "this is damaged" was colour, which fails the leaf's noncolor
//      requirement outright and disappears entirely for a greyscale or forced-colors viewer.
//   2. Per-component status was ignored. `worldSitePresentation` tested key EXISTENCE against a
//      map that `projectWorldSitePresentation` always fills for every component, so the predicate
//      was vacuous. Damage was visible only when it happened to un-complete a stage-gating
//      operation; any non-gating component failure was silent.
//
// The states below therefore carry meaning in OPACITY and SCALE (both survive greyscale), and only
// then in motion. Colour is left to the authored stage palette and is never the sole signal.

/** Semantic condition classes a component fixture can be in. */
export const WORLD_SITE_CONDITIONS = Object.freeze(['impaired', 'latent', 'nominal']);

const IMPAIRED = Object.freeze({
  condition: 'impaired',
  // Well below every other state so "something here is broken" reads at a glance, in greyscale,
  // without needing the fixture next to it for comparison.
  opacityScale: 0.34,
  scaleMul: 0.72,
  // Asymmetric stutter, not a smooth pulse: a damaged fixture should look like it is failing to
  // hold, which a sine pulse cannot express. Zeroed under reduced motion.
  stutter: 0.5,
  shape: 'bracket',
  priority: 'critical',
  accessibilityWord: 'failed',
});

const LATENT = Object.freeze({
  condition: 'latent',
  opacityScale: 0.66,
  scaleMul: 0.88,
  stutter: 0,
  shape: 'ring',
  priority: 'flavor',
  accessibilityWord: 'sealed',
});

const NOMINAL = Object.freeze({
  condition: 'nominal',
  opacityScale: 1,
  scaleMul: 1,
  stutter: 0,
  shape: 'pulse',
  priority: 'flavor',
  accessibilityWord: 'nominal',
});

/**
 * Component status -> condition. Statuses are authored per manifest, so this maps the vocabulary the
 * World Site kernel actually produces and falls back to `nominal` for anything unrecognised (an
 * unknown status must never render as damage).
 */
const CONDITION_BY_STATUS = Object.freeze({
  failed: IMPAIRED,
  damaged: IMPAIRED,
  offline: IMPAIRED,
  breached: IMPAIRED,
  sealed: LATENT,
  attached: LATENT,
  stowed: LATENT,
  locked: LATENT,
  stabilized: NOMINAL,
  synchronized: NOMINAL,
  extracted: NOMINAL,
  released: NOMINAL,
  settled: NOMINAL,
  ready: NOMINAL,
  operational: NOMINAL,
});

/**
 * Frozen, allocation-free lookup. Hot render loops call this per fixture per frame.
 * @param {string|null|undefined} status
 */
export function worldSiteConditionForStatus(status) {
  if (!status) return NOMINAL;
  return CONDITION_BY_STATUS[status] || NOMINAL;
}

export function isImpairedWorldSiteStatus(status) {
  return worldSiteConditionForStatus(status) === IMPAIRED;
}

/**
 * Deterministic asymmetric duty cycle for an impaired fixture: mostly held, with brief dropouts.
 * Returns a 0..1 multiplier. Pure and allocation free; `reducedMotion` collapses it to a steady
 * value so the dimming still reads but nothing moves.
 */
export function impairedDutyCycle(timeS, stutter, reducedMotion) {
  if (!(stutter > 0) || reducedMotion) return 1;
  const phase = timeS - Math.floor(timeS);
  // Two short dropouts per second — a stutter, not a sine pulse.
  const dropped = phase < 0.09 || (phase > 0.42 && phase < 0.5);
  return dropped ? 1 - stutter : 1;
}

/**
 * Accessible, non-colour text for a component transition. Used by the cue path so a screen-reader
 * or captions-only player receives the same mechanical fact the fixture carries.
 */
export function worldSiteConditionText(componentLabel, status) {
  const condition = worldSiteConditionForStatus(status);
  const label = String(componentLabel || 'Site component').trim();
  if (condition === IMPAIRED) return `${label} failed.`;
  if (condition === LATENT) return `${label} sealed.`;
  return `${label} restored.`;
}

export const WORLD_SITE_CONDITION_STATES = Object.freeze({ IMPAIRED, LATENT, NOMINAL });

export default worldSiteConditionForStatus;
