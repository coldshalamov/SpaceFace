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

export const STEERING_VIEWS = Object.freeze(['overhead', 'racing', 'auto']);

export const RACING_RIG_DEFAULT = Object.freeze({
  distance: 58,
  height: 22,
  lookAhead: 36,
});

const DRAFT_SPEED_WU_S = 640;
const DRAFT_MIN_WU = 18;
const DRAFT_MAX_WU = 150;
const DRAFT_PULSE_S = 0.35;
const DRAFT_IMPULSE_PER_MASS = 14;
const BOOST_IMPULSE_PER_MASS = 42;
const LEASH_PULSE_S = 0.4;
const LEASH_BRAKE = 0.22;

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
    if (mission.params.steerLock === 'racing') {
      return {
        missionId: mission.id,
        levelId: mission.params.levelId || null,
        contractId: mission.params.racingContractId || null,
      };
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
  if (opts && (opts.photo || opts.death)) return 'overhead';
  if (activeSteerLock(state)) return 'racing';
  const pref = normalizeSteeringView(state && state.settings && state.settings.gameplay
    && state.settings.gameplay.steeringView);
  if (pref === 'racing') return 'racing';
  if (pref === 'auto' && activeRaceMission(state)) return 'racing';
  return 'overhead';
}

export function racingRigOf(settings) {
  const g = (settings && settings.gameplay) || {};
  const num = (value, fallback, lo, hi) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    distance: num(g.racingDistance, RACING_RIG_DEFAULT.distance, 24, 140),
    height: num(g.racingHeight, RACING_RIG_DEFAULT.height, 6, 64),
    lookAhead: num(g.racingLookAhead, RACING_RIG_DEFAULT.lookAhead, 0, 120),
  };
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
    const until = Number(mission.params.gridUntilSimS);
    if (Number.isFinite(until) && now < until) return true;
  }
  return false;
}

/** Encounter/traffic bail. Only an authored circuit sets raceLease, so board races are untouched. */
export function raceLeaseActive(state) {
  for (const mission of activeMissions(state)) {
    if (!mission || mission.status !== 'active' || !mission.params) continue;
    if (mission.params.racingContractId && mission.params.raceLease === true) return true;
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
  if (lap < laps) return { action: 'next-lap', lap, laps, nextGate: 0 };
  return { action: 'finish', lap, laps };
}

export function raceObjectiveUnits(params) {
  const gates = params && Array.isArray(params.gates) ? params.gates.length : 0;
  const n = Math.max(1, gates || 1);
  const laps = Math.max(1, Math.round(Number(params && params.laps) || 1));
  return n * laps;
}

/**
 * Plane crossing for an authored gate. The plane stands on `gate`, normal running from `from`
 * toward `gate`. A cross is the sample moving from behind the plane to on/past it, with forward
 * speed along that normal, and still inside the corridor. Occupying the bubble without a
 * crossing does not count — that is the FB-066 test, and this is not it.
 */
export function planeGateCross({ prev, pos, vel, from, gate, radius }) {
  if (!prev || !pos || !from || !gate) return false;
  const dx = gate.x - from.x;
  const dz = gate.z - from.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-3)) return false;
  const nx = dx / len;
  const nz = dz / len;
  const prevAlong = (prev.x - gate.x) * nx + (prev.z - gate.z) * nz;
  const nowAlong = (pos.x - gate.x) * nx + (pos.z - gate.z) * nz;
  if (!(prevAlong < 0 && nowAlong >= -0.5)) return false;
  const vx = vel && Number.isFinite(vel.x) ? vel.x : (pos.x - prev.x);
  const vz = vel && Number.isFinite(vel.z) ? vel.z : (pos.z - prev.z);
  if (!(vx * nx + vz * nz > 4)) return false;
  const ox = (pos.x - gate.x) - nowAlong * nx;
  const oz = (pos.z - gate.z) - nowAlong * nz;
  const reach = Math.max(24, Number(radius) || 90) * 1.35;
  return Math.hypot(ox, oz) <= reach;
}

/**
 * Sector-local reset pose: just short of the gate still owed, heading along the segment.
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
  const back = 80;
  return {
    x: target.x - (dx / len) * back,
    z: target.z - (dz / len) * back,
    heading: Math.atan2(dz, dx),
  };
}

function pointAlong(gates, distance) {
  if (!gates || !gates.length) return null;
  let remain = Math.max(0, distance);
  for (let i = 0; i + 1 < gates.length; i++) {
    const a = gates[i];
    const b = gates[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    if (remain <= len) {
      const t = remain / len;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remain -= len;
  }
  const last = gates[gates.length - 1];
  return { x: last.x, z: last.z };
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
export function racingAssistIntents({ params, player, simTime, gatesGlobal }) {
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

  if (params.racingKind === 'draft') {
    const started = Number.isFinite(params.raceStartSimS) ? params.raceStartSimS : now;
    const elapsed = Math.max(0, now - started);
    const pace = pointAlong(gatesGlobal, elapsed * DRAFT_SPEED_WU_S);
    if (pace) {
      const dx = pace.x - px;
      const dz = pace.z - pz;
      const dist = Math.hypot(dx, dz);
      const along = fx * dx + fz * dz;
      const nextAt = Number(params.draftNextSimS) || 0;
      if (dist >= DRAFT_MIN_WU && dist <= DRAFT_MAX_WU && along > dist * 0.45 && now >= nextAt) {
        impulses.push({
          kind: 'draft',
          impulse: { x: fx * mass * DRAFT_IMPULSE_PER_MASS, y: 0, z: fz * mass * DRAFT_IMPULSE_PER_MASS },
        });
        patch.draftNextSimS = now + DRAFT_PULSE_S;
      }
    }
  }

  const boostIndex = Number(params.boostGateIndex);
  if (Number.isInteger(boostIndex) && boostIndex >= 0 && boostIndex < gatesGlobal.length) {
    const gate = gatesGlobal[boostIndex];
    const d = Math.hypot(px - gate.x, pz - gate.z);
    if (d <= radius && params.boostSpent !== boostIndex) {
      impulses.push({
        kind: 'boost-ring',
        impulse: { x: fx * mass * BOOST_IMPULSE_PER_MASS, y: 0, z: fz * mass * BOOST_IMPULSE_PER_MASS },
      });
      patch.boostSpent = boostIndex;
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
  const started = params && Number.isFinite(params.raceStartSimS);
  const now = Number.isFinite(simTime) ? simTime : 0;
  const gridUntil = params && Number(params.gridUntilSimS);
  const holding = Number.isFinite(gridUntil) && now < gridUntil;
  const elapsed = started ? Math.max(0, now - params.raceStartSimS) : 0;
  const recordS = Number(params && params.recordS) || 0;
  const gate = gates[Math.min(nextGate, Math.max(0, gates.length - 1))] || null;
  const bearing = gateBearingDeg(player, gate);
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
    offRibbon = dist > (Number(params.gateRadiusWU) || 90) * 3.2 && nextGate > 0;
  }
  const drafting = !!(params && Number.isFinite(params.draftNextSimS) && now < params.draftNextSimS);
  return {
    lap: Math.min(laps, lap + (started ? 1 : 0)),
    laps,
    nextGate: Math.min(gateCount, nextGate + 1),
    gateCount,
    elapsed,
    recordS,
    delta: started && recordS ? elapsed - recordS : null,
    bearing,
    steerHint: bearing > 8 ? 'right' : bearing < -8 ? 'left' : 'ahead',
    wrongWay,
    offRibbon,
    drafting,
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

const RECORD_KEY = 'spaceface.raceRecords.v1';

export function readRaceRecords(storage) {
  try {
    const raw = storage && storage.getItem && storage.getItem(RECORD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberRaceRecord(storage, levelId, elapsedS) {
  if (!storage || !levelId || !Number.isFinite(elapsedS) || elapsedS <= 0) return null;
  const bag = readRaceRecords(storage);
  const prev = Number(bag[levelId]);
  if (Number.isFinite(prev) && prev <= elapsedS) return prev;
  bag[levelId] = Math.round(elapsedS * 100) / 100;
  try { storage.setItem(RECORD_KEY, JSON.stringify(bag)); } catch { /* private mode */ }
  return bag[levelId];
}
