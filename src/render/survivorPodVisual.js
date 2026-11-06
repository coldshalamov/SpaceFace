// Survivor-pod presentation spec — the mayday read, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// A pod ejected from a killed crew (`payloadType === 'survivor_pod'`, the sim constant in
// src/systems/survivorPod.js — CAUSAL_SURVIVOR_PAYLOAD_TYPE) used to render as the generic
// sealed cargo canister: same cylinder, same commodity band, same loot transponder. A
// life-or-death mayday with a 180 s oxygen window was visually indistinguishable from every
// freight canister in the field. This module is the single owner of the lifeboat's identity:
//
//   silhouette  an ejection capsule — a blunt capsule with a viewport ring on the nose, a
//               retro block on the tail, foam crash collar, and a distress lamp mast. It
//               never reads as cargo; the builder in visualFactory.js composes it from these
//               decisions only.
//   lamp code   maritime distress: a repeating "two short, one long" flash group — a rhythm
//               the loot transponder's two equal kicks can never be mistaken for, and the
//               same family the NPC job signal code speaks (rhythm is the identity at range).
//   urgency     the oxygen clock made visible: the group period tightens as the pod's window
//               drains (period 1.6 s → 0.55 s across urgency 0 → 1), so a pod that has been
//               adrift for minutes visibly pants while a fresh eject still holds a steady
//               distress cadence. A pod with no expiry clock (the player's own wreck pod)
//               holds the steady cadence.
//
// PURE: no Three.js, no state, no wall clock of its own — `now` arrives as a parameter (the
// caller passes the presentation clock, the same cosmetic convention as the repair-cell
// breathe). The lamp's paint is per-pod cloned material, so pods never share a strobe.
//
// Reduced motion: the rhythm holds its period and shape but the flash gain halves. Never
// silenced — a distress beacon that stops blinking is a dead beacon.

/** The sim's CAUSAL_SURVIVOR_PAYLOAD_TYPE (src/systems/survivorPod.js). Literal + comment, not
 * an import: render reads the value, it does not couple to the system module. */
export const SURVIVOR_POD_PAYLOAD_TYPE = 'survivor_pod';

/**
 * True only for the causal/player survivor pods. Wreck squatters share `tetherRole` but carry
 * payloadType 'wreck_squatter' — they are a person in a hole, not a lifeboat, and keep the
 * canister. NaN-safe.
 */
export function isSurvivorPodEntity(e) {
  return !!(e && e.data && e.data.payloadType === SURVIVOR_POD_PAYLOAD_TYPE);
}

// --- The lamp's authored palette -------------------------------------------------------------
// Warning red from the station luminaire family (ambientFixtures 'warning'), with a white-hot
// core the top-down camera reads as the flame the lamp code carries. Deliberately NOT a
// commodity tint — a distress beacon is not cargo color.
export const MAYDAY_LAMP_COLOR = '#ff4a3c';
export const MAYDAY_LAMP_CORE_COLOR = '#fff2ea';

/** Fresh-eject distress group period, seconds. */
export const MAYDAY_PERIOD_CALM_S = 1.6;
/** The period a pod at the end of its oxygen pants at, seconds. */
export const MAYDAY_PERIOD_CRITICAL_S = 0.55;

/** Flash pattern per group, as fractions of the group period: two shorts then one long. */
const GROUP_PATTERN = Object.freeze([
  { start: 0.0, end: 0.1 },    // short 1
  { start: 0.18, end: 0.28 },  // short 2
  { start: 0.42, end: 0.78 },  // long hold — the "mayday" syllable
]);

/**
 * How far through its oxygen window the pod is: 0 at eject, 1 exhausted. A pod with no expiry
 * stamp (the player's wreck pod) holds steady at 0.25 — distressed, not yet dying. NaN-safe.
 */
export function maydayUrgency(now, ejectedAt, expireAt) {
  const t = Number(now);
  const e0 = Number(ejectedAt);
  const e1 = Number(expireAt);
  if (!Number.isFinite(t)) return 0.25;
  if (!Number.isFinite(e0) || !Number.isFinite(e1) || e1 <= e0) return 0.25;
  return Math.min(1, Math.max(0, (t - e0) / (e1 - e0)));
}

/** The group period at an urgency: tightens from calm to critical, never below critical. Pure. */
export function maydayGroupPeriod(urgency) {
  const u = Number.isFinite(urgency) ? Math.min(1, Math.max(0, urgency)) : 0;
  return MAYDAY_PERIOD_CALM_S + (MAYDAY_PERIOD_CRITICAL_S - MAYDAY_PERIOD_CALM_S) * u;
}

/**
 * One lamp sample: how lit the distress lamp is at `now`.
 *
 * `phase` (0..1, per-pod) staggers pods so two maydays never blink in lockstep; `flashGain`
 * scales the answer (reduced motion passes 0.5, accessibility passes 0 — a flashReduce rig
 * still sees the lamp's steady burn through its viewport, just no strobe kick). Returns
 * { flash, urgency, period }: flash 0..1, the urgency and resolved period for callers that
 * want to paint the burn or pace an intake.
 */
export function resolveMaydayLamp(now, ejectedAt, expireAt, phase, flashGain = 1) {
  const urgency = maydayUrgency(now, ejectedAt, expireAt);
  const period = maydayGroupPeriod(urgency);
  const gain = Number.isFinite(flashGain) ? Math.min(1, Math.max(0, flashGain)) : 1;
  const p = Number.isFinite(phase) ? (phase % 1 + 1) % 1 : 0;
  const u = ((Number.isFinite(now) ? now : 0) / period + p) % 1;
  let flash = 0;
  for (const span of GROUP_PATTERN) {
    if (u >= span.start && u < span.end) {
      // Crisp attack, soft tail inside each element: a lamp, not a square wave.
      const k = (u - span.start) / (span.end - span.start);
      flash = Math.max(flash, k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75);
      break;
    }
  }
  return { flash: flash * gain, urgency, period };
}

/**
 * The steady burn the viewport keeps between strobe groups: a mayday is always visibly alive,
 * the strobe is the shout on top of it. Pure.
 */
export function maydayViewportBurn(flash) {
  const f = Number.isFinite(flash) ? Math.min(1, Math.max(0, flash)) : 0;
  return 0.9 + f * 1.8;
}
