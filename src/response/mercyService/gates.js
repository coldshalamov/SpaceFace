// Stage latches. A stage flips only from a measured sample. Stuffed latches and
// stuffed hold meters are cleared. Physics, not a HUD string, is the source.

import { PHASES } from './constants.js';

export function freshMeters() {
  return {
    approach: 0, approachMax: 0,
    assess: 0, assessMax: 0,
    stable: 0, stableMax: 0,
    secure: 0, secureMax: 0,
    abandon: 0, abandonMax: 0,
  };
}

export function freshLatches() {
  return {
    distress: false,
    approached: false,
    assessed: false,
    stabilized: false,
    secured: false,
    extracted: false,
    settled: false,
  };
}

/** Add dt only when cond is true. A meter that jumped ahead of what this function stored is zeroed. */
export function accrue(meters, key, dt, cond) {
  const maxKey = `${key}Max`;
  const cap = meters[maxKey] || 0;
  let cur = meters[key] || 0;
  if (cur > cap + 1e-6) cur = 0;
  if (!cond) {
    meters[key] = 0;
    meters[maxKey] = 0;
    return 0;
  }
  cur += dt;
  meters[key] = cur;
  meters[maxKey] = cur;
  return cur;
}

export function phaseOf(inc) {
  if (!inc) return 'distress';
  if (inc.latches.settled) return 'aftermath';
  if (inc.failedForward && !inc.latches.extracted) return 'failed_forward';
  const L = inc.latches;
  if (!L.distress) return 'distress';
  if (!L.approached) return 'approach';
  if (!L.assessed) return 'assess';
  if (!L.stabilized) return 'stabilize';
  if (!L.secured) return 'secure';
  if (!L.extracted) return 'extraction';
  return 'settlement';
}

export function advanceLatches(inc, sample, dt) {
  const L = inc.latches;
  const M = inc.meters;
  const def = inc.def;

  if (L.approached && M.approach < def.approachHold) L.approached = false;
  if (L.assessed && (M.assess < def.assessHold || !inc.reading)) L.assessed = false;
  if (L.stabilized && (M.stable < def.stableHold || inc.arrest < def.minArrest || !inc.stabilizedId)) {
    L.stabilized = false;
  }
  if (L.secured && (M.secure < def.secureHold || !inc.securedId)) L.secured = false;
  if (L.extracted && !inc.deliveredTo) L.extracted = false;
  if (L.settled && !inc.settlementReceipt) L.settled = false;
  if (!(sample.dist <= def.assessR)) inc.reading = null;

  if (!L.distress) {
    if (sample.beaconEmits) L.distress = true;
    return;
  }
  if (!L.approached) {
    const held = accrue(M, 'approach', dt, sample.dist <= def.approachR && sample.relSpeed <= def.approachV);
    if (held >= def.approachHold) L.approached = true;
    return;
  }
  if (!L.assessed) {
    const near = sample.dist <= def.assessR && !!sample.reading;
    if (near) inc.reading = sample.reading;
    else inc.reading = null;
    const held = accrue(M, 'assess', dt, near);
    if (held >= def.assessHold && inc.reading) L.assessed = true;
    return;
  }
  if (inc.stabilizedId && sample.subjectId !== inc.stabilizedId) {
    L.stabilized = false;
    L.secured = false;
    M.stable = 0;
    M.stableMax = 0;
    M.secure = 0;
    M.secureMax = 0;
    inc.stabilizedId = null;
    inc.securedId = null;
  }
  if (!L.stabilized) {
    const ready = sample.spin <= def.spinLimit
      && sample.ke <= def.keEnvelope
      && inc.arrest >= def.minArrest
      && !!sample.subjectId;
    const held = accrue(M, 'stable', dt, ready);
    if (held >= def.stableHold) {
      L.stabilized = true;
      inc.stabilizedId = sample.subjectId;
    }
    return;
  }
  if (!L.secured) {
    const ready = sample.secureOk && sample.subjectId === inc.stabilizedId;
    const held = accrue(M, 'secure', dt, ready);
    if (held >= def.secureHold) {
      L.secured = true;
      inc.securedId = sample.subjectId;
    }
    return;
  }
  if (!L.extracted && sample.delivered && sample.deliveredId === inc.securedId) {
    L.extracted = true;
    inc.deliveredTo = sample.deliveredTo;
    inc.resolvedOrder = sample.resolvedOrder || inc.intentOrder;
    inc.deliveredBodyId = sample.deliveredId;
  }
}

export function notePhase(inc) {
  const phase = phaseOf(inc);
  if (inc.trace[inc.trace.length - 1] !== phase) inc.trace.push(phase);
  inc.phase = phase;
  return phase;
}

export function canonicalSuccessTrace() {
  return PHASES.slice();
}
