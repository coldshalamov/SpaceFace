import { FLIGHT_DRILL_SPEED_WU, FLIGHT_DRILL_BRAKE_WU } from './flightDrill.js';

export const ONBOARDING_TRACKER_STEPS = Object.freeze([
  Object.freeze({ id: 'latch', beats: Object.freeze(['tether']) }),
  Object.freeze({ id: 'raid', beats: Object.freeze(['raid']) }),
  Object.freeze({ id: 'claimed', beats: Object.freeze(['claimed']) }),
  Object.freeze({ id: 'fight', beats: Object.freeze(['thrust', 'brake', 'marker', 'focus', 'burst', 'disengage']) }),
  Object.freeze({ id: 'seam', beats: Object.freeze(['seam']) }),
  Object.freeze({ id: 'dock', beats: Object.freeze(['dock']) }),
  Object.freeze({ id: 'choice', beats: Object.freeze(['choice']) }),
]);
export const ONBOARDING_TRACKER_STEP_COUNT = ONBOARDING_TRACKER_STEPS.length;

export function trackerStepIndexForBeat(beatKey) {
  return ONBOARDING_TRACKER_STEPS.findIndex((step) => step.beats.includes(beatKey));
}

export function onboardingTrackerStep(ob, beats) {
  const index = trackerStepIndexForBeat(beats[ob.currentBeat]?.key);
  return { index, number: index + 1, total: ONBOARDING_TRACKER_STEP_COUNT, id: ONBOARDING_TRACKER_STEPS[index]?.id ?? null };
}

export function trackerStepDone(ob, stepIndex) {
  const step = ONBOARDING_TRACKER_STEPS[stepIndex];
  return !!step && step.beats.every((key) => ob.beatDoneAt?.[key] != null);
}

export const FLIGHT_FOLD_BEATS = Object.freeze(['thrust', 'brake']);
export const FLOWN_BEFORE_BEATS = Object.freeze(['thrust', 'brake', 'marker', 'focus']);
export const SWING_MISS_WINDOW_S = 6;
export const SWING_CLINIC_AFTER_MISSES = 3;
export const SWING_CLINIC_RUNG_ID = 'swing_do_not_pull';
export const SWING_CLINIC_LINE = 'Swing Clinic: circle once, let go facing the rock.';
export const RAID_WINGMAN_NAME = 'Claim Jumper Wingman';

export function freshPaceState({ flownBefore = false } = {}) {
  return { version: 1, flownBefore: flownBefore === true, fastAtS: null, slowAtS: null, folded: {},
    swing: { misses: 0, pendingAtS: null, pendingLesson: null, clinicOpenedAtS: null, clinicLesson: null } };
}

export function normalizePaceState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pace = freshPaceState({ flownBefore: raw.flownBefore });
  const finite = (n) => Number.isFinite(n) ? n : null;
  const lesson = (s) => s === 'rescue' || s === 'raid' ? s : null;
  pace.fastAtS = finite(raw.fastAtS);
  pace.slowAtS = finite(raw.slowAtS);
  for (const key of FLOWN_BEFORE_BEATS) {
    const credit = raw.folded?.[key];
    if (credit === 'flown' || credit === 'flownBefore') pace.folded[key] = credit;
  }
  const swing = raw.swing || {};
  pace.swing.misses = Number.isFinite(swing.misses) ? Math.max(0, Math.floor(swing.misses)) : 0;
  pace.swing.pendingAtS = finite(swing.pendingAtS);
  pace.swing.pendingLesson = lesson(swing.pendingLesson);
  pace.swing.clinicOpenedAtS = finite(swing.clinicOpenedAtS);
  pace.swing.clinicLesson = lesson(swing.clinicLesson);
  return pace;
}

export function notePaceFlight(pace, speedWu, atS) {
  if (!Number.isFinite(speedWu) || !Number.isFinite(atS)) return;
  if (pace.fastAtS == null && speedWu >= FLIGHT_DRILL_SPEED_WU) pace.fastAtS = atS;
  else if (pace.fastAtS != null && pace.slowAtS == null && speedWu <= FLIGHT_DRILL_BRAKE_WU) pace.slowAtS = atS;
}

export function paceCreditFor(pace, beatKey) {
  if (pace.flownBefore && FLOWN_BEFORE_BEATS.includes(beatKey)) return 'flownBefore';
  if (beatKey === 'thrust' && pace.fastAtS != null) return 'flown';
  if (beatKey === 'brake' && pace.slowAtS != null) return 'flown';
  return null;
}

export function notePendingSwing(pace, lesson, atS) {
  if (pace.swing.pendingAtS != null) return;
  pace.swing.pendingAtS = atS;
  pace.swing.pendingLesson = lesson;
}

export function settlePendingSwing(pace, { paidOff, atS }) {
  const swing = pace.swing;
  if (swing.pendingAtS == null) return null;
  const outcome = paidOff ? 'hit' : atS - swing.pendingAtS >= SWING_MISS_WINDOW_S ? 'miss' : null;
  if (!outcome) return null;
  if (outcome === 'miss') swing.misses++;
  swing.pendingAtS = null;
  swing.pendingLesson = null;
  return outcome;
}

export function swingClinicDue(pace) {
  return pace.swing.misses >= SWING_CLINIC_AFTER_MISSES && pace.swing.clinicOpenedAtS == null;
}
