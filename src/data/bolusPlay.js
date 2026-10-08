// Play predicates for The Bolus. Pure. Tick and the throat view both read this.
// The lane is the refusal. The tooth is the lie. The iris is the clock. The cough is the period.

import { BOLUS_FORCES as F } from './bolusForces.js';
import { bolusIrisOpen } from './theBolus.js';

export const BOLUS_PLAY = Object.freeze({
  laneCrestBonus: 10,
  threadFast: 24,
  threadLate: 12,
  threadSpeed: 18,
  threadBand: 40,
  threadSkirt: 200,
  coughZ: 40,
  coughLine: 1173,
  gallRadius: 80,
  gallSeconds: 2,
  swingSeconds: 0.8,
  berthX: -980,
  berthZ: -900,
  berthRadius: 120,
  nurseryX: -560,
  nurseryZ: -400,
  nurseryLoose: 30,
  nurseryHuddle: 12,
  schoolNear: 220,
  schoolRadius: 400,
  fingerlingFlee: 36,
  drumSlide: 0.8,
  miteFlee: 36,
  miteFleeSeconds: 4,
  brushRadius: 50,
  brushExposure: 0.02,
  floaterHeavyAt: 0.25,
  floaterWakeAt: 0.35,
  floaterHeavyScale: 0.5,
  ribLodge: 100,
  coughAnchorX: 2347,
  coughAnchorZ: 1173,
  coughGap: 48,
  shutterLate: 0.35,
});

const P = BOLUS_PLAY;

export function bolusInLane(x) {
  return x >= F.ciliaX0 && x <= F.ciliaX1;
}

export function bolusIrisCycle(simTime) {
  return Math.floor((Number(simTime) || 0) / 20);
}

export function bolusIrisPhase(simTime) {
  const span = 20;
  const t = Number(simTime) || 0;
  return ((t % span) + span) % span;
}

/** Blade slide. 1 through most of the open window, 0.35 on the last second, else shut. */
export function bolusIrisShutter(simTime) {
  const m = bolusIrisPhase(simTime);
  if (m >= 2 && m < 7) return 1;
  if (m >= 7 && m < 8) return P.shutterLate;
  return 0;
}

/** +Z only inside the open iris, once the ship is already moving through the throat of it. */
export function bolusThreadZ(simTime, speed, x, z) {
  if (!bolusIrisOpen(simTime)) return 0;
  if (!(speed > P.threadSpeed)) return 0;
  if (Math.abs(z - F.irisAt) >= P.threadBand) return 0;
  if (Math.abs(x) >= P.threadSkirt) return 0;
  const m = bolusIrisPhase(simTime);
  if (m < 7) return P.threadFast;
  if (m < 8) return P.threadLate;
  return 0;
}

/** Gutter wave is the base crest. The lane wave is harder. */
export function bolusCrestZ(x) {
  return F.peristalsisZ + (bolusInLane(x) ? P.laneCrestBonus : 0);
}

export function bolusCoughDue(x, z, tolled, paid) {
  return bolusInLane(x) && z >= P.coughLine && !tolled && !paid;
}

export function bolusCoughGap(cracked) {
  return cracked ? P.coughGap : 0;
}

export function bolusCoughOffset(cracked, part) {
  const gap = bolusCoughGap(cracked);
  if (part === 'cough_crease') return gap;
  if (part === 'cough_lip') return -gap;
  return 0;
}

/** A tight cable slips the tooth. A loaded cable still bites. */
export function bolusToothSlips(phase) {
  return phase === 'overload';
}

export function bolusIsSwingRole(role) {
  return role === 'knob' || role === 'tendril' || role === 'valve' || role === 'suture';
}

export function bolusSwingBlocksCilia(until, simTime) {
  return Number(until) > Number(simTime);
}

export function bolusInBerth(x, z) {
  return Math.hypot(x - P.berthX, z - P.berthZ) < P.berthRadius;
}

/** Drift, heavy, or wake. Wake only when the sac itself is in the lane. */
export function bolusFloaterKind(exposure, x) {
  const e = Number(exposure) || 0;
  if (e >= P.floaterWakeAt && bolusInLane(x)) return 'wake';
  if (e >= P.floaterHeavyAt) return 'heavy';
  return 'drift';
}

export function bolusNurseryRadius(huddle) {
  return huddle ? P.nurseryHuddle : P.nurseryLoose;
}

export function bolusNearNursery(x, z) {
  return Math.hypot(x - P.nurseryX, z - P.nurseryZ) <= P.schoolRadius;
}
