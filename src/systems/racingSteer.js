// RACE-01 — stern-camera racing. Presentation and contract policy only.
//
// The live chase camera (src/render/camera.js) is a tilted top-down frame that never follows yaw.
// This module does not replace it. It answers one question — overhead or racing — and supplies the
// pose, the lap rule, the plane-gate test, and the contract assists the mission driver applies
// through the physics membrane. Absent settings stay overhead, so a profile that never touched
// the row is unchanged.
//
// Forward is the propulsion convention: (cos rot, sin rot) in the XZ plane. Positive yaw is
// counter-clockwise from above. With the eye behind the nose, that swing is already screen-right,
// so A (yawLeft, negative turnIntent) stays screen-left. This module does not negate yaw.

import { planeCrossFraction, circuitProgress, circuitLaps, circuitPacePoint } from './racingGeometry.js';
import { hash32 } from '../core/rng.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';

export const STEERING_VIEWS = Object.freeze(['overhead', 'racing', 'auto']);

export const RACING_RIG_DEFAULT = Object.freeze({
  distance: 58,
  height: 22,
  lookAhead: 36,
});

const DRAFT_MIN_WU = 18;
const DRAFT_MAX_WU = 150;
const DRAFT_WAKE_HALF_WIDTH_WU = 45;
const DRAFT_ACCEL_WU_S2 = 40;
const BOOST_IMPULSE_PER_MASS = 42;
const LEASH_PULSE_S = 0.4;
const LEASH_BRAKE = 0.22;

export function racingPaceSpeed(params) {
  const value = params && params.paceSpeedWU;
  const speed = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(speed) ? Math.min(640, Math.max(80, speed)) : 640;
}

export function normalizeSteeringView(value) {
  return STEERING_VIEWS.includes(value) ? value : 'overhead';
}

function activeMissions(state) {
  const list = state && state.missions && state.missions.active;
  return Array.isArray(list) ? list : [];
}

/** The contract that is allowed to ignore the player's overhead preference, if one is live. */
export function activeSteerLock(state) {
  for (const mission of activeMissions(state)) {
    if (!mission || mission.status !== 'active' || !mission.params) continue;
    if (mission.params.steerLock === 'racing' && (!Array.isArray(mission.params.steerLockPhases)
      || mission.params.steerLockPhases.includes(mission.phase ?? mission.params.phase))) {
      return mission;
    }
  }
  return null;
}

export function activeRaceMission(state) {
  for (const mission of activeMissions(state)) {
    if (mission && mission.status === 'active' && mission.type === 'race') return mission;
  }
  return null;
}

/** An authored circuit (not an FB-066 board race) currently on the book. */
export function activeAuthoredRace(state) {
  for (const mission of activeMissions(state)) {
    if (!mission || mission.status !== 'active' || mission.type !== 'race' || !mission.params) continue;
    if (mission.params.racingContractId) return mission;
  }
  return null;
}

/**
 * Which picture to draw. Photo mode and the death cam keep the overhead frame — they are
 * pictures of a moment, not a steering mode. A steer-lock contract beats the setting.
 */
export function resolveSteeringView(state, opts = {}) {
  if ((opts && (opts.photo || opts.death)) || state?.render?.photoMode?.active) return 'overhead';
  if (activeSteerLock(state)) return 'racing';
  const pref = normalizeSteeringView(state && state.settings && state.settings.gameplay
    && state.settings.gameplay.steeringView);
  if (pref === 'racing') return 'racing';
  const race = pref === 'auto' ? activeRaceMission(state) : null;
  if (race && (!race.params?.sectionMission
    || race.params.phase === 'grid' || race.params.phase === 'chase')) return 'racing';
  return 'overhead';
}

export function racingRigOf(settings, out = {}) {
  const g = (settings && settings.gameplay) || {};
  const num = (value, fallback, lo, hi) => {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  out.distance = num(g.racingDistance, RACING_RIG_DEFAULT.distance, 24, 140);
  out.height = num(g.racingHeight, RACING_RIG_DEFAULT.height, 6, 64);
  out.lookAhead = num(g.racingLookAhead, RACING_RIG_DEFAULT.lookAhead, 0, 120);
  return out;
}

/**
 * Player yaw command. Identity in every view: A is already screen-left under a stern camera
 * because positive yaw is counter-clockwise and the eye sits behind the nose.
 */
export function chaseYawCommand(turn, _view) {
  return Number.isFinite(turn) ? turn : 0;
}

/** True while an authored circuit is holding the grid. Procedural races never set the stamp. */
export function raceGridHolding(state) {
  const now = state && Number.isFinite(state.simTime) ? state.simTime : 0;
  for (const mission of activeMissions(state)) {
    if (!mission || mission.status !== 'active' || !mission.params) continue;
    if (!mission.params.racingContractId) continue;
    if (mission.params.sectionMission
      && mission.params.phase !== 'grid' && mission.params.phase !== 'chase') continue;
    const until = Number(mission.params.gridUntilSimS);
    if (Number.isFinite(until) && now < until) return true;
  }
  return false;
}

/** Encounter/traffic bail. Only an authored circuit sets raceLease, so board races are untouched. */
export function raceLeaseActive(state) {
  for (const mission of activeMissions(state)) {
    if (!mission || mission.status !== 'active' || !mission.params) continue;
    if (!mission.params.racingContractId || mission.params.raceLease !== true) continue;
    if (mission.params.sectionMission
      && mission.params.phase !== 'grid' && mission.params.phase !== 'chase') continue;
    return true;
  }
  return false;
}

/** Desired eye and look target. Anchor is frame-local; yaw is the ship's rot. */
export function racingChaseTarget(anchor, yaw, speed, rig, motionReduce) {
  const x = anchor && Number.isFinite(anchor.x) ? anchor.x : 0;
  const z = anchor && Number.isFinite(anchor.z) ? anchor.z : 0;
  const rot = Number.isFinite(yaw) ? yaw : 0;
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const distance = rig && Number.isFinite(rig.distance) ? rig.distance : RACING_RIG_DEFAULT.distance;
  const height = rig && Number.isFinite(rig.height) ? rig.height : RACING_RIG_DEFAULT.height;
  const look = rig && Number.isFinite(rig.lookAhead) ? rig.lookAhead : RACING_RIG_DEFAULT.lookAhead;
  const spd = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const ahead = look + (motionReduce ? 0 : Math.min(48, spd * 0.08));
  return {
    eyeX: x - fx * distance,
    eyeY: height,
    eyeZ: z - fz * distance,
    lookX: x + fx * ahead,
    lookY: Math.min(4, height * 0.16),
    lookZ: z + fz * ahead,
    fovKick: motionReduce ? 0 : Math.min(10, spd / 45),
  };
}

/**
 * After the final gate of a lap. Procedural one-pass races (no laps, or laps <= 1) finish
 * exactly as FB-066 always did — this returns 'finish' and the caller must not write lap state.
 */
export function resolveLapAfterFinalGate(params) {
  const laps = Math.max(1, Math.round(Number(params && params.laps) || 1));
  if (laps <= 1) return { action: 'finish', laps: 1 };
  const lap = (params.lap | 0) + 1;
  if (lap < laps) return { action: 'next-lap', lap, laps, nextGate: params.closedCircuit ? 1 : 0 };
  return { action: 'finish', lap, laps };
}

export function raceObjectiveUnits(params) {
  const gates = params && Array.isArray(params.gates) ? params.gates.length : 0;
  const n = Math.max(1, gates || 1);
  const laps = Math.max(1, Math.round(Number(params && params.laps) || 1));
  return params?.closedCircuit ? (n - 1) * laps + 1 : n * laps;
}

/**
 * Plane crossing for an authored gate. The plane stands on `gate`, normal running from `from`
 * toward `gate`. A cross is the sample moving from behind the plane to on/past it, with forward
 * speed along that normal, and still inside the corridor. Occupying the bubble without a
 * crossing does not count — that is the FB-066 test, and this is not it.
 */
export function planeGateCross(sample) {
  return planeCrossFraction(sample) !== null;
}

/**
 * Sector-local recovery: behind the last CLEARED gate, aimed toward the gate still owed.
 * Gate 0 (the start, or a lap just wrapped) is the caller's start line, not this pose.
 */
export function resetPoseLocal(params) {
  const gates = params && params.gates;
  if (!Array.isArray(gates) || gates.length < 2) return null;
  const next = params.nextGate | 0;
  if (next <= 0 || next >= gates.length) return null;
  const target = gates[next];
  const prev = gates[next - 1];
  const dx = target.x - prev.x;
  const dz = target.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  const back = Math.min(80, len * 0.25);
  return {
    x: prev.x - (dx / len) * back,
    z: prev.z - (dz / len) * back,
    heading: Math.atan2(dz, dx),
  };
}

export function sampleRacingWake(params, player, gatesGlobal, simTime, out = {}) {
  const sample = out && typeof out === 'object' ? out : {};
  const paceSpeedWU = racingPaceSpeed(params);
  const startTime = params?.adventureSpeedId ? params.adventureSpeedStartSimS : params?.raceStartSimS;
  sample.active = false;
  sample.paceSpeedWU = paceSpeedWU;
  sample.behindWU = null;
  sample.lateralWU = null;
  sample.paceHeading = null;
  if (!params || !player || !player.pos || !player.vel || !Array.isArray(gatesGlobal)
    || gatesGlobal.length < 2 || !Number.isFinite(simTime)
    || !Number.isFinite(startTime) || simTime < startTime
    || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)
    || !Number.isFinite(player.vel.x) || !Number.isFinite(player.vel.z)
    || !Number.isFinite(player.rot)
    || gatesGlobal.some((gate) => !gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.z))
    || (Number.isFinite(params.gridUntilSimS) && simTime < params.gridUntilSimS)
    || params.phase === 'approach' || params.phase === 'grid' || params.phase === 'handoff'
    || (params.sectionMission && params.phase !== 'chase')) return sample;

  const pace = circuitPacePoint(gatesGlobal,
    (simTime - startTime) * paceSpeedWU + 70);
  if (!pace || !Number.isFinite(pace.x) || !Number.isFinite(pace.z)
    || !Number.isFinite(pace.heading)) return sample;
  const hx = Math.cos(pace.heading);
  const hz = Math.sin(pace.heading);
  const dx = player.pos.x - pace.x;
  const dz = player.pos.z - pace.z;
  const behindWU = -(dx * hx + dz * hz);
  const lateralWU = Math.abs(-dx * hz + dz * hx);
  const speedWU = Math.hypot(player.vel.x, player.vel.z);
  const headingDot = Math.cos(player.rot) * hx + Math.sin(player.rot) * hz;
  const velocityDot = speedWU > 0 ? (player.vel.x * hx + player.vel.z * hz) / speedWU : 0;
  sample.behindWU = behindWU;
  sample.lateralWU = lateralWU;
  sample.paceHeading = pace.heading;
  sample.active = Number.isFinite(behindWU) && Number.isFinite(lateralWU)
    && behindWU >= DRAFT_MIN_WU && behindWU <= DRAFT_MAX_WU
    && lateralWU <= DRAFT_WAKE_HALF_WIDTH_WU
    && headingDot >= 0.8 && velocityDot >= 0.8
    && speedWU >= paceSpeedWU * 0.35;
  return sample;
}

function massOf(player) {
  const m = Number(player && player.mass);
  return Number.isFinite(m) && m > 0 ? m : 400;
}

/**
 * Impulses for a locked/authored circuit. Returns a patch the mission driver writes onto
 * params (pulse clocks) plus world-space impulses. The caller must not invoke this for a
 * procedural board race.
 */
export function racingAssistIntents({ params, player, simTime, gatesGlobal, dt = 0 }) {
  const impulses = [];
  const patch = {};
  if (!params || !player || !player.pos || !Array.isArray(gatesGlobal) || gatesGlobal.length < 2) {
    return { impulses, patch };
  }
  const now = Number.isFinite(simTime) ? simTime : 0;
  const yaw = Number(player.rot) || 0;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const mass = massOf(player);
  const px = player.pos.x;
  const pz = player.pos.z;
  const radius = Math.max(24, Number(params.gateRadiusWU) || 90);

  // Pace lights are visual coaching. Only the physical pack owner can award a draft.
  if (params.sectionMission && params.racingKind === 'draft') {
    const pace = sampleRacingWake(params, player, gatesGlobal, simTime);
    const validDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const required = Number(params.draftRequiredS);
    patch.pacing = pace.active;
    patch.draftTimeS = Math.min(required > 0 ? Math.min(60, required) : 60,
      Math.max(0, Number(params.draftTimeS) || 0) + (pace.active ? validDt : 0));
  }

  const boostIndex = Number(params.boostGateIndex);
  if (Number.isInteger(boostIndex) && boostIndex >= 0 && boostIndex < gatesGlobal.length) {
    if (Number.isInteger(params.boostClearedLap) && params.boostSpentLap !== params.boostClearedLap) {
      impulses.push({
        kind: 'boost-ring',
        impulse: { x: fx * mass * BOOST_IMPULSE_PER_MASS, y: 0, z: fz * mass * BOOST_IMPULSE_PER_MASS },
      });
      patch.boostSpentLap = params.boostClearedLap;
    }
  }

  const next = Math.max(0, Math.min(gatesGlobal.length - 1, params.nextGate | 0));
  const prevIndex = next > 0 ? next - 1 : gatesGlobal.length - 1;
  const a = gatesGlobal[prevIndex];
  const b = gatesGlobal[next];
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const abLen = Math.hypot(abx, abz) || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abLen * abLen)));
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  const off = Math.hypot(px - cx, pz - cz);
  const leash = radius * 3.2;
  const leashAt = Number(params.leashNextSimS) || 0;
  if (off > leash && now >= leashAt) {
    const vx = player.vel ? Number(player.vel.x) || 0 : 0;
    const vz = player.vel ? Number(player.vel.z) || 0 : 0;
    const spd = Math.hypot(vx, vz);
    if (spd > 8) {
      impulses.push({
        kind: 'leash',
        impulse: { x: -vx * mass * LEASH_BRAKE, y: 0, z: -vz * mass * LEASH_BRAKE },
      });
      patch.leashNextSimS = now + LEASH_PULSE_S;
    }
  }
  return { impulses, patch };
}

/**
 * Bearing of a gate off the nose, degrees. Positive is screen-right under the stern camera
 * (ship facing +X, camera behind, +Z is camera-right). The tape uses it; the sim does not.
 */
export function gateBearingDeg(player, gate) {
  if (!player || !player.pos || !gate) return 0;
  const yaw = Number(player.rot) || 0;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const tx = gate.x - player.pos.x;
  const tz = gate.z - player.pos.z;
  const cross = fx * tz - fz * tx;
  const dot = fx * tx + fz * tz;
  return Math.atan2(cross, dot) * 180 / Math.PI;
}

export function readRaceTape(params, player, gatesGlobal, simTime) {
  const gates = Array.isArray(gatesGlobal) ? gatesGlobal : [];
  const gateCount = params && Array.isArray(params.gates) ? params.gates.length : gates.length;
  const laps = Math.max(1, Math.round(Number(params && params.laps) || 1));
  const lap = Math.max(0, params && params.lap | 0);
  const nextGate = Math.max(0, params && params.nextGate | 0);
  const startTime = params?.adventureSpeedId ? params.adventureSpeedStartSimS : params?.raceStartSimS;
  const started = Number.isFinite(startTime);
  const now = Number.isFinite(simTime) ? simTime : 0;
  const gridUntil = params && params.gridUntilSimS;
  const holding = Number.isFinite(gridUntil) && now < gridUntil;
  const elapsed = started ? Math.max(0, now - startTime) : 0;
  const recordS = Number(params && params.recordS) || 0;
  const gate = gates[Math.min(nextGate, Math.max(0, gates.length - 1))] || null;
  const bearing = gateBearingDeg(player, gate);
  const progress = circuitProgress(params, player && player.pos, gates);
  let wrongWay = false;
  let offRibbon = false;
  if (player && player.pos && gate) {
    const tx = gate.x - player.pos.x;
    const tz = gate.z - player.pos.z;
    const dist = Math.hypot(tx, tz);
    const vx = player.vel ? Number(player.vel.x) || 0 : 0;
    const vz = player.vel ? Number(player.vel.z) || 0 : 0;
    const spd = Math.hypot(vx, vz);
    const toward = dist > 1 ? (vx * tx + vz * tz) / dist : 0;
    wrongWay = spd > 30 && toward < -12 && dist > (Number(params.gateRadiusWU) || 90);
    offRibbon = progress.distance > (Number(params.gateRadiusWU) || 90) * 3.2 && nextGate > 0;
  }
  const drafting = (params?.raceDraft?.strength || 0) > 0;
  return {
    lap: Math.min(laps, lap + 1),
    laps,
    nextGate: Math.min(gateCount, nextGate + 1),
    gateCount,
    elapsed,
    recordS,
    delta: started && recordS && nextGate > 0 ? elapsed - recordS * progress.fraction : null,
    progress: progress.fraction,
    speed: player && player.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0,
    distanceToGate: player && player.pos && gate ? Math.hypot(gate.x-player.pos.x, gate.z-player.pos.z) : 0,
    resets: Math.max(0, params?.resetCount | 0),
    bearing,
    steerHint: bearing > 8 ? 'right' : bearing < -8 ? 'left' : 'ahead',
    wrongWay,
    offRibbon,
    drafting,
    pacing: params?.racingKind === 'draft',
    draftTimeS: Math.max(0, Number(params && params.draftTimeS) || 0),
    draftRequiredS: Number.isFinite(Number(params && params.draftRequiredS))
      ? Number(params.draftRequiredS) : 0,
    phase: params && params.phase || null,
    started,
    holding,
    gridLeft: holding ? Math.max(0, gridUntil - now) : 0,
    gridLine: params && params.gridLine || '',
    locked: params && params.steerLock === 'racing',
    contractId: params && params.racingContractId || null,
    levelId: params && params.levelId || null,
    courseName: params && params.courseName || '',
  };
}

const RECORD_KEY = 'spaceface.raceRecords.v2';
export function raceRecordKey(params, category = params?.raceCategory) {
  if (!params || !params.racingContractId || !params.courseId) return null;
  const base = `${params.courseId}@${params.courseRevision || 1}:${params.racingContractId}:${circuitLaps(params)}L`;
  const mode = params.raceMode === 'race' || params.raceMode === 'cup'
    ? `:pack-${params.raceDifficulty || 'club'}` : '';
  return category ? `${base}:${category}${mode}` : base;
}

/** Comparable fitted hulls only. Camera preference is presentation, never a speed category. */
export function racingLoadoutCategory(state, player = state?.entities?.get?.(state.playerId)) {
  const owned = state?.player?.ownedShips?.[state.player.activeShipIndex || 0];
  const derived = player?.data?.derived || {};
  const fittings = (owned?.fittings || []).map(row => typeof row === 'string' ? row
    : row ? [row.slotId || row.slotIndex || '', row.moduleId || row.defId || '', row.tier || 0] : null);
  const identity = [owned?.defId || player?.data?.shipDefId || 'unknown', fittings,
    Math.round((Number(player?.mass) || 0) * 1000) / 1000,
    derived.propulsion || null,
    ...['maxSpeed','accelMult','turnMult','thrust','turnRate','mass'].map(key => Number(derived[key]) || 0),
    isRacingCorridorSession(state) ? 'circuit-layout-v1' : 'campaign',
    state?.settings?.gameplay?.flightLabDrive || '', state?.input?.flightMode || 'assisted'];
  return `fit5-${hash32(JSON.stringify(identity)).toString(16)}`;
}


export function readRaceRecords(storage) {
  try {
    const raw = storage && storage.getItem && storage.getItem(RECORD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(parsed).slice(0, 128)) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
        && key.length < 200 && Number.isFinite(value) && value > 0) clean[key] = value;
    }
    return clean;
  } catch {
    return {};
  }
}

export function rememberRaceRecord(storage, levelId, elapsedS) {
  if (!storage || typeof levelId !== 'string' || !levelId || levelId.length >= 200
    || ['__proto__', 'constructor', 'prototype'].includes(levelId)
    || !Number.isFinite(elapsedS) || elapsedS <= 0) return null;
  const bag = readRaceRecords(storage);
  const prev = Number(bag[levelId]);
  if (Number.isFinite(prev) && prev <= elapsedS) return prev;
  bag[levelId] = Math.max(0.01, Math.round(elapsedS * 100) / 100);
  const keys = Object.keys(bag);
  for (const key of keys.slice(0, Math.max(0, keys.length - 128))) delete bag[key];
  try { storage.setItem(RECORD_KEY, JSON.stringify(bag)); } catch { return null; }
  return bag[levelId];
}
