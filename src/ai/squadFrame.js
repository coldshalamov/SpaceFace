// Virtual squad motion frame, shape morphs, attack tokens, and lane reservations.
// Planning state only: no position/velocity writes. Members track slots through
// the canonical desired-state actuator (§21A.9–.13).

import {
  clamp,
  distance2,
  finite,
  saturate,
  wrapAngle,
} from './contracts.js';
import {
  FORMATION_SHAPE_FAN_4,
  FORMATION_SHAPE_WEDGE_4,
  SQUAD_PHASE,
  SQUAD_RECIPE_INTERCEPTOR_SCISSORS,
  SQUAD_SOCKET,
  SQUAD_TOKEN,
  getFormationShape,
  getSquadRecipe,
  hullClearanceSpacing,
} from '../data/squadChoreography.js';

export {
  SQUAD_PHASE,
  SQUAD_RECIPE_INTERCEPTOR_SCISSORS,
  SQUAD_SOCKET,
  SQUAD_TOKEN,
  hullClearanceSpacing,
};

const INTERCEPT_SPEED = 72;
const FRAME_MAX_ACCEL = 46;
const FRAME_MAX_YAW = 1.18;
const SOCKET_ORDER = Object.freeze([
  SQUAD_SOCKET.LEAD,
  SQUAD_SOCKET.LEFT,
  SQUAD_SOCKET.RIGHT,
  SQUAD_SOCKET.REAR,
]);
const PHASE = SQUAD_PHASE;
const EPS = 1e-9;

let forcedMutation = null;

export function forceSquadFrameMutation(spec = null) {
  if (spec == null || spec === false) {
    forcedMutation = null;
    return null;
  }
  forcedMutation = { ...spec };
  return forcedMutation;
}

export function isSquadFrameMutationForced() {
  return forcedMutation != null;
}

export function recipeIdFromEntity(entity) {
  const ai = entity && entity.data && entity.data.ai;
  if (!ai) return null;
  const id = ai.squadRecipe || ai.choreographyRecipe;
  return getSquadRecipe(id) ? id : null;
}

export function createSquadFrameDirector({ seed = 1 } = {}) {
  return new SquadFrameDirector(seed);
}

export class SquadFrameDirector {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.frames = new Map();
    this.byEntity = new Map();
    this.cohorts = null;
    this.lastTick = -1;
    this.scratchMembers = [];
  }

  attachCohorts(director) {
    this.cohorts = director || null;
    return this.cohorts;
  }

  has(entityId) {
    if (this.byEntity.has(entityId)) return true;
    return !!(this.cohorts && typeof this.cohorts.has === 'function' && this.cohorts.has(entityId));
  }

  activeSquadCount() {
    return this.frames.size;
  }

  planFor(entityId) {
    const link = this.byEntity.get(entityId);
    if (link) return link.plan;
    return this.cohorts && typeof this.cohorts.planFor === 'function'
      ? this.cohorts.planFor(entityId)
      : null;
  }

  inspect(squadId = null) {
    if (squadId != null) {
      const frame = this.frames.get(squadId);
      return frame ? snapshotFrame(frame) : null;
    }
    const out = {};
    for (const [id, frame] of this.frames) out[String(id)] = snapshotFrame(frame);
    return out;
  }

  forget(entityId) {
    const link = this.byEntity.get(entityId);
    if (!link) {
      if (this.cohorts && typeof this.cohorts.forget === 'function') this.cohorts.forget(entityId);
      return;
    }
    this.byEntity.delete(entityId);
    const frame = this.frames.get(link.squadId);
    if (!frame) return;
    const rec = frame.members.get(entityId);
    if (rec) rec.alive = false;
  }

  stepAll(tick, dt, squads, targetLookup) {
    this.lastTick = tick | 0;
    const live = new Set();
    for (const squad of squads) {
      if (!squad || squad.id == null) continue;
      live.add(squad.id);
      this._stepSquad(tick | 0, dt, squad, targetLookup);
    }
    for (const squadId of [...this.frames.keys()]) {
      if (live.has(squadId)) continue;
      this._retire(squadId);
    }
  }

  _retire(squadId) {
    const frame = this.frames.get(squadId);
    if (!frame) return;
    for (const id of frame.members.keys()) this.byEntity.delete(id);
    this.frames.delete(squadId);
  }

  _stepSquad(tick, dt, squad, targetLookup) {
    const recipeId = squad.recipeId || SQUAD_RECIPE_INTERCEPTOR_SCISSORS;
    const recipe = getSquadRecipe(recipeId);
    if (!recipe) return;
    let frame = this.frames.get(squad.id);
    const members = Array.isArray(squad.members) ? squad.members : [];
    if (!frame) {
      frame = seedFrame(squad.id, recipeId, recipe, members, tick, this.seed);
      this.frames.set(squad.id, frame);
    }
    syncMembers(frame, members, recipe, tick);
    const target = resolveTarget(squad, members, targetLookup, frame);
    stepFrame(frame, recipe, target, tick, dt, mutationSpec());
    publishPlans(this, frame, recipe, tick);
  }
}

function mutationSpec() {
  return forcedMutation || null;
}

function seedFrame(id, recipeId, recipe, members, tick, seed) {
  const live = members.filter((e) => e && e.alive !== false && e.pos);
  const leader = pickSeedLeader(members, live);
  const origin = leader && leader.pos ? { x: finite(leader.pos.x), z: finite(leader.pos.z) } : centroid(live);
  const heading = leader && Number.isFinite(leader.rot) ? leader.rot : averageHeading(live);
  const vel = leader && leader.vel
    ? { x: finite(leader.vel.x), z: finite(leader.vel.z) }
    : averageVel(live);
  return {
    id,
    recipeId,
    seed: seed >>> 0,
    position: { x: origin.x, z: origin.z },
    velocity: { x: vel.x, z: vel.z },
    heading,
    angularVelocity: 0,
    pathProgress: 0,
    phase: PHASE.INGRESS,
    phaseStartedTick: tick,
    shapeId: recipe.shapes.ingress,
    morphFromId: recipe.shapes.ingress,
    morphToId: recipe.shapes.telegraph,
    morphU: 0,
    spacingScale: 1,
    integrity: 1,
    integrityMin: 1,
    successorPolicy: 'priority_alive',
    commandId: null,
    leaderLostTick: null,
    railDirX: Math.cos(heading),
    railDirZ: Math.sin(heading),
    railLocked: false,
    reformHeading: heading,
    cycle: 0,
    morphAborted: false,
    passComplete: false,
    members: new Map(),
    sockets: { lead: null, left: null, right: null, rear: null },
    lastTarget: { id: null, x: 0, z: 0, vx: 0, vz: 0, radius: 8 },
    strikeStartedTick: null,
    extendStartedTick: null,
    reformStartedTick: null,
    passTick: null,
    committedPeak: 0,
  };
}

function syncMembers(frame, members, recipe, tick) {
  const seen = new Set();
  const ordered = members.slice().sort((a, b) => compareId(a && a.id, b && b.id));
  const claimed = new Set();
  for (let i = 0; i < ordered.length; i++) {
    const entity = ordered[i];
    if (!entity || entity.id == null) continue;
    seen.add(entity.id);
    let rec = frame.members.get(entity.id);
    if (!rec) {
      const socket = pickSocket(entity, i, claimed, frame.sockets);
      claimed.add(socket);
      rec = makeMember(entity.id, socket, recipe);
      frame.members.set(entity.id, rec);
      if (!frame.sockets[socket]) frame.sockets[socket] = entity.id;
    }
    copyLive(rec, entity);
  }
  for (const [id, rec] of frame.members) {
    if (seen.has(id)) continue;
    rec.alive = false;
    rec.hullFraction = 0;
  }
  for (const socket of SOCKET_ORDER) {
    const id = frame.sockets[socket];
    const rec = id != null ? frame.members.get(id) : null;
    if (rec && rec.alive) continue;
    const replacement = firstFreeMember(frame, claimed);
    frame.sockets[socket] = replacement ? replacement.id : null;
    if (replacement) {
      replacement.socket = socket;
      claimed.add(socket);
    }
  }
  if (frame.commandId == null || !memberAlive(frame, frame.commandId)) {
    const previous = frame.commandId;
    if (previous != null && frame.leaderLostTick == null) frame.leaderLostTick = tick;
    frame.commandId = chooseCommand(frame);
  } else {
    frame.leaderLostTick = null;
  }
}

function pickSocket(entity, index, claimed, sockets) {
  const ai = entity.data && entity.data.ai;
  const requested = socketFromAi(ai);
  if (requested && !claimed.has(requested) && !sockets[requested]) return requested;
  for (const socket of SOCKET_ORDER) {
    if (!claimed.has(socket) && !sockets[socket]) return socket;
  }
  return SOCKET_ORDER[Math.min(index, SOCKET_ORDER.length - 1)];
}

function socketFromAi(ai) {
  const role = ai && (ai.squadSocket || ai.squadRole);
  if (role === 'lead' || role === 'leader') return SQUAD_SOCKET.LEAD;
  if (role === 'left' || role === 'striker_left') return SQUAD_SOCKET.LEFT;
  if (role === 'right' || role === 'striker_right') return SQUAD_SOCKET.RIGHT;
  if (role === 'rear' || role === 'support' || role === 'screen') return SQUAD_SOCKET.REAR;
  return null;
}

function makeMember(id, socket, recipe) {
  const spec = recipe.sockets[socket] || recipe.sockets.rear;
  return {
    id,
    socket,
    role: spec.role,
    token: spec.tokens[0] || SQUAD_TOKEN.RESERVE,
    laneId: null,
    laneSide: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    hullFraction: 1,
    slot: { x: 0, z: 0, vx: 0, vz: 0, heading: 0 },
    slotError: 0,
    slotReady: false,
    tracking: false,
    disrupted: false,
    disruptedUntil: -1,
    coast: false,
    rejoinTick: null,
    fireAuthorized: false,
    faceTarget: false,
    speedFraction: recipe.ingressSpeedFraction,
    breakFormation: false,
    live: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, hullFraction: 1 },
    plan: null,
  };
}

function copyLive(rec, entity) {
  const pos = entity.pos || { x: 0, z: 0 };
  const vel = entity.vel || { x: 0, z: 0 };
  rec.alive = entity.alive !== false && !(entity.flags && entity.flags.disabled) && rec.hullFraction > 0;
  if (entity.alive === false || (entity.flags && entity.flags.disabled) || (entity.hull != null && entity.hull <= 0)) {
    rec.alive = false;
  }
  rec.pos.x = finite(pos.x);
  rec.pos.z = finite(pos.z);
  rec.vel.x = finite(vel.x);
  rec.vel.z = finite(vel.z);
  rec.rot = finite(entity.rot);
  rec.radius = Math.max(4, finite(entity.radius, 8));
  const hullMax = Number.isFinite(entity.hullMax) && entity.hullMax > 0 ? entity.hullMax : 1;
  rec.hullFraction = rec.alive ? saturate(finite(entity.hull, hullMax) / hullMax) : 0;
  rec.live.pos.x = rec.pos.x;
  rec.live.pos.z = rec.pos.z;
  rec.live.vel.x = rec.vel.x;
  rec.live.vel.z = rec.vel.z;
  rec.live.rot = rec.rot;
  rec.live.radius = rec.radius;
  rec.live.hullFraction = rec.hullFraction;
  if (!rec.slotReady) {
    rec.slot.x = rec.pos.x;
    rec.slot.z = rec.pos.z;
    rec.slot.vx = rec.vel.x;
    rec.slot.vz = rec.vel.z;
    rec.slot.heading = rec.rot;
    rec.slotError = 0;
  }
}

function firstFreeMember(frame, claimedSockets) {
  for (const rec of frame.members.values()) {
    if (!rec.alive) continue;
    let used = false;
    for (const socket of SOCKET_ORDER) {
      if (frame.sockets[socket] === rec.id) used = true;
    }
    if (!used) return rec;
  }
  return null;
}

function chooseCommand(frame) {
  for (const socket of SOCKET_ORDER) {
    const id = frame.sockets[socket];
    if (memberAlive(frame, id)) return id;
  }
  for (const rec of frame.members.values()) {
    if (rec.alive) return rec.id;
  }
  return null;
}

function memberAlive(frame, id) {
  const rec = id != null ? frame.members.get(id) : null;
  return !!(rec && rec.alive);
}

function resolveTarget(squad, members, targetLookup, frame) {
  let id = squad.targetId;
  if (id == null && typeof targetLookup === 'function') {
    for (const entity of members) {
      const combat = entity && entity.data && entity.data.combat;
      if (combat && combat.targetId != null) {
        id = combat.targetId;
        break;
      }
    }
  }
  const entity = id != null && typeof targetLookup === 'function' ? targetLookup(id) : null;
  if (entity && entity.pos) {
    frame.lastTarget.id = entity.id;
    frame.lastTarget.x = finite(entity.pos.x);
    frame.lastTarget.z = finite(entity.pos.z);
    frame.lastTarget.vx = finite(entity.vel && entity.vel.x);
    frame.lastTarget.vz = finite(entity.vel && entity.vel.z);
    frame.lastTarget.radius = Math.max(4, finite(entity.radius, 8));
    return frame.lastTarget;
  }
  if (frame.lastTarget.id != null) return frame.lastTarget;
  return null;
}

function stepFrame(frame, recipe, target, tick, dt, mutation) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  updateIntegrity(frame);
  detectDisruption(frame, recipe, tick, step);
  maybeAbortMorph(frame, recipe, tick);
  advancePhase(frame, recipe, target, tick, step);
  assignTokensAndLanes(frame, recipe, target, tick, mutation);
  integrateFrame(frame, recipe, target, tick, step);
  writeSlots(frame, recipe, target, tick);
  tagFireAndCommitment(frame, recipe, target);
}

function updateIntegrity(frame) {
  let total = 0;
  let live = 0;
  let disrupted = 0;
  for (const rec of frame.members.values()) {
    total++;
    if (!rec.alive) continue;
    live++;
    if (rec.disrupted) disrupted++;
  }
  const liveFrac = total ? live / total : 0;
  const disruptFrac = live ? disrupted / live : 0;
  const commandOk = memberAlive(frame, frame.commandId) ? 1 : 0.62;
  const integrity = saturate(liveFrac * (1 - 0.28 * disruptFrac) * commandOk);
  frame.integrity = integrity;
  if (integrity < frame.integrityMin) frame.integrityMin = integrity;
}

function detectDisruption(frame, recipe, tick, dt) {
  const spacing = currentSpacing(frame);
  const deform = Math.max(48, spacing * recipe.deformRadiusMult);
  for (const rec of frame.members.values()) {
    if (!rec.alive) {
      rec.disrupted = true;
      rec.coast = false;
      rec.breakFormation = true;
      continue;
    }
    if (!rec.slotReady) continue;
    const err = rec.slotError || distance2(rec.pos, rec.slot);
    rec.slotError = err;
    const relV = Math.hypot(rec.vel.x - rec.slot.vx, rec.vel.z - rec.slot.vz);
    const quiet = frame.phase === PHASE.TELEGRAPH
      || frame.phase === PHASE.REFORM
      || frame.phase === PHASE.RECOVER;
    const blown = !quiet && (err > deform || (rec.tracking && relV > 52 && err > spacing * 0.45));
    if (blown) {
      rec.disrupted = true;
      const extra = saturate((err - deform) / Math.max(deform, 1));
      const coastTicks = Math.round((recipe.coastMinS + extra * (recipe.coastMaxS - recipe.coastMinS)) / dt);
      const until = tick + clamp(coastTicks, 18, 180);
      if (until > rec.disruptedUntil) rec.disruptedUntil = until;
    }
    rec.coast = rec.disrupted && tick < rec.disruptedUntil;
    rec.breakFormation = rec.coast;
    if (rec.disrupted && !rec.coast && rec.rejoinTick == null && err <= spacing * 0.9) {
      rec.rejoinTick = tick;
    }
    if (rec.disrupted && !rec.coast && err <= spacing * 0.55) {
      rec.disrupted = false;
      rec.disruptedUntil = -1;
    }
    rec.tracking = rec.alive && err < spacing * 0.85 && relV < 26;
  }
}

function maybeAbortMorph(frame, recipe, tick) {
  const morphing = frame.phase === PHASE.TELEGRAPH
    || frame.phase === PHASE.COMMIT
    || frame.phase === PHASE.STRIKE;
  if (!morphing) return;
  let coasting = 0;
  for (const rec of frame.members.values()) {
    if (rec.alive && rec.coast) coasting++;
  }
  if (frame.integrity < 0.72 || coasting > 0) {
    frame.morphAborted = true;
    enterPhase(frame, PHASE.RECOVER, tick);
  }
}

function advancePhase(frame, recipe, target, tick, dt) {
  if (!target) return;
  const dist = Math.hypot(target.x - frame.position.x, target.z - frame.position.z);
  const age = (tick - frame.phaseStartedTick) * dt;
  const passU = passParameter(frame, target);
  const phase = frame.phase;

  if (phase === PHASE.INGRESS) {
    if (dist <= recipe.telegraphRange) {
      lockRail(frame, target);
      enterPhase(frame, PHASE.TELEGRAPH, tick);
    }
  } else if (phase === PHASE.TELEGRAPH) {
    frame.morphU = saturate(age / recipe.morphTelegraphS);
    frame.spacingScale = 1 + 0.85 * frame.morphU;
    if (frame.morphU >= 1 && (dist <= recipe.commitRange || age >= recipe.morphTelegraphS + 0.15)) {
      enterPhase(frame, PHASE.COMMIT, tick);
    }
  } else if (phase === PHASE.COMMIT) {
    frame.morphU = 1;
    frame.spacingScale = 1.85;
    if (age >= recipe.morphCommitS || dist <= recipe.strikeRange) {
      frame.strikeStartedTick = tick;
      enterPhase(frame, PHASE.STRIKE, tick);
    }
  } else if (phase === PHASE.STRIKE) {
    if (age >= recipe.strikeWindowS || passU > 12) {
      frame.extendStartedTick = tick;
      frame.passTick = frame.passTick == null ? tick : frame.passTick;
      frame.passComplete = true;
      enterPhase(frame, PHASE.EXTEND, tick);
    }
  } else if (phase === PHASE.EXTEND) {
    const away = passU > 40 && dist >= recipe.extendAway;
    if ((away && age >= recipe.extendHoldS * 0.45) || age >= recipe.extendHoldS) {
      beginReform(frame, target, tick);
    }
  } else if (phase === PHASE.RECOVER) {
    if (age >= 0.45) beginReform(frame, target, tick);
  } else if (phase === PHASE.REFORM) {
    frame.morphU = saturate(age / recipe.morphReformS);
    frame.spacingScale = 1.85 - 0.85 * frame.morphU;
    const settled = formationSettled(frame);
    if (frame.passComplete && frame.morphU >= 1) return;
    if ((frame.morphU >= 1 && settled) || age >= recipe.morphReformS + 1.6) {
      frame.cycle += 1;
      frame.morphAborted = false;
      frame.railLocked = false;
      enterPhase(frame, PHASE.INGRESS, tick);
    }
  }
}

function enterPhase(frame, phase, tick) {
  if (frame.phase === phase) return;
  frame.phase = phase;
  frame.phaseStartedTick = tick;
  if (phase === PHASE.TELEGRAPH) {
    frame.morphFromId = FORMATION_SHAPE_WEDGE_4.id;
    frame.morphToId = FORMATION_SHAPE_FAN_4.id;
    frame.morphU = 0;
    frame.shapeId = FORMATION_SHAPE_FAN_4.id;
  } else if (phase === PHASE.REFORM) {
    frame.morphFromId = FORMATION_SHAPE_FAN_4.id;
    frame.morphToId = FORMATION_SHAPE_WEDGE_4.id;
    frame.morphU = 0;
    frame.shapeId = FORMATION_SHAPE_WEDGE_4.id;
  } else if (phase === PHASE.INGRESS) {
    frame.shapeId = FORMATION_SHAPE_WEDGE_4.id;
    frame.morphU = 0;
    frame.spacingScale = 1;
    frame.strikeStartedTick = null;
    frame.extendStartedTick = null;
    frame.reformStartedTick = null;
    frame.passTick = null;
    for (const rec of frame.members.values()) {
      rec.laneSide = 0;
      rec.laneId = null;
    }
  }
}

function lockRail(frame, target) {
  const dx = target.x - frame.position.x;
  const dz = target.z - frame.position.z;
  const len = Math.hypot(dx, dz) || 1;
  frame.railDirX = dx / len;
  frame.railDirZ = dz / len;
  frame.railLocked = true;
  frame.heading = Math.atan2(frame.railDirZ, frame.railDirX);
}

function beginReform(frame, target, tick) {
  const turn = 2.35;
  const hx = frame.railDirX;
  const hz = frame.railDirZ;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const nx = hx * c - hz * s;
  const nz = hx * s + hz * c;
  const nlen = Math.hypot(nx, nz) || 1;
  frame.reformHeading = Math.atan2(nz / nlen, nx / nlen);
  frame.railLocked = false;
  frame.reformStartedTick = tick;
  enterPhase(frame, PHASE.REFORM, tick);
}

function passParameter(frame, target) {
  return (frame.position.x - target.x) * frame.railDirX + (frame.position.z - target.z) * frame.railDirZ;
}

function formationSettled(frame) {
  const spacing = currentSpacing(frame);
  let n = 0;
  let ok = 0;
  for (const rec of frame.members.values()) {
    if (!rec.alive || rec.coast) continue;
    n++;
    if (rec.slotError <= spacing * 1.15) ok++;
  }
  return n >= 2 && ok >= Math.max(2, n - 1);
}

function assignTokensAndLanes(frame, recipe, target, tick, mutation) {
  const closeBudget = mutation && Number.isFinite(mutation.closeAttackTokens)
    ? Math.max(0, mutation.closeAttackTokens | 0)
    : recipe.tokens.close_attack;
  const hysteresis = !(mutation && mutation.laneHysteresis === false);
  const defaultMap = {
    [SQUAD_SOCKET.LEAD]: SQUAD_TOKEN.RESERVE,
    [SQUAD_SOCKET.LEFT]: SQUAD_TOKEN.CLOSE_ATTACK,
    [SQUAD_SOCKET.RIGHT]: SQUAD_TOKEN.CLOSE_ATTACK,
    [SQUAD_SOCKET.REAR]: SQUAD_TOKEN.RANGED_FIRE,
  };
  const closeSockets = [];
  if (closeBudget >= 1) closeSockets.push(SQUAD_SOCKET.LEFT);
  if (closeBudget >= 2) closeSockets.push(SQUAD_SOCKET.RIGHT);
  if (closeBudget >= 3) closeSockets.push(SQUAD_SOCKET.LEAD);
  if (closeBudget >= 4) closeSockets.push(SQUAD_SOCKET.REAR);

  for (const rec of frame.members.values()) {
    if (!rec.alive) {
      rec.token = SQUAD_TOKEN.RESERVE;
      continue;
    }
    if (closeSockets.includes(rec.socket)) rec.token = SQUAD_TOKEN.CLOSE_ATTACK;
    else rec.token = defaultMap[rec.socket] || SQUAD_TOKEN.RESERVE;
    if (closeBudget >= 4) rec.token = SQUAD_TOKEN.CLOSE_ATTACK;
  }

  const attacking = frame.phase === PHASE.COMMIT
    || frame.phase === PHASE.STRIKE
    || frame.phase === PHASE.EXTEND;
  if (!attacking || !target) return;

  const holders = [];
  for (const rec of frame.members.values()) {
    if (rec.alive && rec.token === SQUAD_TOKEN.CLOSE_ATTACK) holders.push(rec);
  }
  holders.sort((a, b) => compareId(a.id, b.id));
  if (!hysteresis) {
    for (const rec of holders) {
      rec.laneSide = 1;
      rec.laneId = 'strike_right';
    }
    return;
  }
  for (const rec of holders) {
    if (rec.laneSide === 0) {
      rec.laneSide = rec.socket === SQUAD_SOCKET.RIGHT || rec.socket === SQUAD_SOCKET.REAR ? 1 : -1;
    }
    rec.laneId = rec.laneSide < 0 ? 'strike_left' : 'strike_right';
  }
  enforceDistinctLanes(holders);
}

function enforceDistinctLanes(holders) {
  if (holders.length < 2) return;
  const leftish = holders.filter((h) => h.laneSide < 0);
  const rightish = holders.filter((h) => h.laneSide > 0);
  if (leftish.length && rightish.length) return;
  holders[0].laneSide = -1;
  holders[0].laneId = 'strike_left';
  holders[1].laneSide = 1;
  holders[1].laneId = 'strike_right';
}

function integrateFrame(frame, recipe, target, tick, dt) {
  if (!target) return;
  const speedFrac = speedFractionFor(frame.phase, recipe);
  const maxSpeed = INTERCEPT_SPEED * speedFrac;
  const desired = desiredFrameMotion(frame, recipe, target, maxSpeed);
  const ax = clamp(0.9 * (desired.x - frame.position.x) + 1.4 * (desired.vx - frame.velocity.x), -FRAME_MAX_ACCEL, FRAME_MAX_ACCEL);
  const az = clamp(0.9 * (desired.z - frame.position.z) + 1.4 * (desired.vz - frame.velocity.z), -FRAME_MAX_ACCEL, FRAME_MAX_ACCEL);
  frame.velocity.x += ax * dt;
  frame.velocity.z += az * dt;
  const spd = Math.hypot(frame.velocity.x, frame.velocity.z);
  if (spd > maxSpeed && spd > EPS) {
    const s = maxSpeed / spd;
    frame.velocity.x *= s;
    frame.velocity.z *= s;
  }
  frame.position.x += frame.velocity.x * dt;
  frame.position.z += frame.velocity.z * dt;
  const headingErr = wrapAngle(desired.heading - frame.heading);
  const yaw = clamp(headingErr * 2.4, -FRAME_MAX_YAW, FRAME_MAX_YAW);
  frame.angularVelocity = yaw;
  frame.heading = wrapAngle(frame.heading + yaw * dt);
  if (frame.railLocked) {
    frame.pathProgress += spd * dt;
  }
}

function desiredFrameMotion(frame, recipe, target, maxSpeed) {
  const predX = target.x + target.vx * 0.35;
  const predZ = target.z + target.vz * 0.35;
  if (frame.phase === PHASE.REFORM || frame.phase === PHASE.RECOVER || frame.phase === PHASE.INGRESS && !frame.railLocked) {
    const hx = Math.cos(frame.phase === PHASE.INGRESS ? Math.atan2(predZ - frame.position.z, predX - frame.position.x) : frame.reformHeading);
    const hz = Math.sin(frame.phase === PHASE.INGRESS ? Math.atan2(predZ - frame.position.z, predX - frame.position.x) : frame.reformHeading);
    const standoff = frame.phase === PHASE.INGRESS ? recipe.telegraphRange * 0.72 : 340;
    return {
      x: predX - hx * standoff,
      z: predZ - hz * standoff,
      vx: hx * maxSpeed,
      vz: hz * maxSpeed,
      heading: Math.atan2(hz, hx),
    };
  }
  const dirX = frame.railDirX;
  const dirZ = frame.railDirZ;
  return {
    x: frame.position.x + dirX * 36,
    z: frame.position.z + dirZ * 36,
    vx: dirX * maxSpeed,
    vz: dirZ * maxSpeed,
    heading: Math.atan2(dirZ, dirX),
  };
}

function speedFractionFor(phase, recipe) {
  if (phase === PHASE.INGRESS) return recipe.ingressSpeedFraction;
  if (phase === PHASE.TELEGRAPH) return recipe.telegraphSpeedFraction;
  if (phase === PHASE.COMMIT || phase === PHASE.STRIKE) return recipe.strikeSpeedFraction;
  if (phase === PHASE.EXTEND) return recipe.extendSpeedFraction;
  return recipe.reformSpeedFraction;
}

function currentSpacing(frame) {
  const radii = [];
  for (const rec of frame.members.values()) {
    if (rec.alive) radii.push(rec.radius);
  }
  return hullClearanceSpacing(radii, frame.spacingScale);
}

function writeSlots(frame, recipe, target, tick) {
  const spacing = currentSpacing(frame);
  const shapeA = getFormationShape(frame.morphFromId) || FORMATION_SHAPE_WEDGE_4;
  const shapeB = getFormationShape(frame.morphToId) || shapeA;
  const u = saturate(frame.morphU);
  const c = Math.cos(frame.heading);
  const s = Math.sin(frame.heading);
  const fwdX = c;
  const fwdZ = s;
  const rightX = -s;
  const rightZ = c;
  const omega = frame.angularVelocity || 0;
  const passU = target ? passParameter(frame, target) : -999;
  const attacking = frame.phase === PHASE.COMMIT || frame.phase === PHASE.STRIKE || frame.phase === PHASE.EXTEND;

  for (const rec of frame.members.values()) {
    const local = blendedLocal(shapeA, shapeB, rec.socket, u);
    let right = local.right;
    let forward = local.forward;
    const collapseLanes = mutationSpec() && mutationSpec().laneHysteresis === false;
    if (collapseLanes && attacking && rec.token === SQUAD_TOKEN.CLOSE_ATTACK && target) {
      rec.slot.x = target.x - frame.railDirX * 160;
      rec.slot.z = target.z - frame.railDirZ * 160;
      rec.slot.vx = target.vx;
      rec.slot.vz = target.vz;
      rec.slot.heading = frame.heading;
      rec.slotError = distance2(rec.pos, rec.slot);
      rec.slotReady = true;
      rec.speedFraction = speedFractionFor(frame.phase, recipe);
      rec.faceTarget = true;
      rec.fireAuthorized = rec.alive && frame.phase === PHASE.STRIKE && !rec.coast;
      continue;
    } else if (attacking && rec.token === SQUAD_TOKEN.CLOSE_ATTACK && rec.laneSide !== 0) {
      const cross = saturate((passU + 160 - rec.laneSide * 96) / 260);
      const start = rec.laneSide * 1.55;
      const end = -rec.laneSide * 1.45;
      right = start + (end - start) * cross;
      forward = rec.laneSide * 0.72 - 0.08 + 0.12 * cross;
    } else if (attacking && rec.socket === SQUAD_SOCKET.LEAD) {
      right = 0;
      forward = -0.95;
    } else if (attacking && rec.socket === SQUAD_SOCKET.REAR) {
      right = 0;
      forward = -2.15;
    }
    const ox = fwdX * (forward * spacing) + rightX * (right * spacing);
    const oz = fwdZ * (forward * spacing) + rightZ * (right * spacing);
    rec.slot.x = frame.position.x + ox;
    rec.slot.z = frame.position.z + oz;
    let morphVx = 0;
    let morphVz = 0;
    if (frame.phase === PHASE.TELEGRAPH || frame.phase === PHASE.REFORM) {
      const dur = frame.phase === PHASE.TELEGRAPH ? recipe.morphTelegraphS : recipe.morphReformS;
      const dU = 1 / Math.max(dur, 0.05);
      const a = (shapeA.slots && shapeA.slots[rec.socket]) || { right: 0, forward: 0 };
      const b = (shapeB.slots && shapeB.slots[rec.socket]) || a;
      const dRight = (b.right - a.right) * dU * spacing;
      const dForward = (b.forward - a.forward) * dU * spacing;
      const scaleRate = frame.phase === PHASE.TELEGRAPH ? 0.85 * dU : -0.85 * dU;
      const base = spacing / Math.max(frame.spacingScale, 0.05);
      const dSp = scaleRate * base;
      morphVx = fwdX * (dForward + forward * dSp) + rightX * (dRight + right * dSp);
      morphVz = fwdZ * (dForward + forward * dSp) + rightZ * (dRight + right * dSp);
    } else if (attacking && rec.token === SQUAD_TOKEN.CLOSE_ATTACK && rec.laneSide !== 0) {
      const passRate = frame.velocity.x * frame.railDirX + frame.velocity.z * frame.railDirZ;
      const dCross = (1 / 240) * passRate;
      const dRight = (-rec.laneSide * 1.18 - rec.laneSide * 1.22) * dCross * spacing;
      morphVx = rightX * dRight;
      morphVz = rightZ * dRight;
    }
    rec.slot.vx = frame.velocity.x - oz * omega + morphVx;
    rec.slot.vz = frame.velocity.z + ox * omega + morphVz;
    rec.slot.heading = frame.heading;
    rec.slotError = distance2(rec.pos, rec.slot);
    rec.slotReady = true;
    rec.speedFraction = speedFractionFor(frame.phase, recipe);
    rec.faceTarget = rec.token === SQUAD_TOKEN.CLOSE_ATTACK
      ? (frame.phase === PHASE.COMMIT || frame.phase === PHASE.STRIKE)
      : (frame.phase === PHASE.TELEGRAPH || frame.phase === PHASE.COMMIT);
    rec.fireAuthorized = rec.alive
      && rec.token === SQUAD_TOKEN.CLOSE_ATTACK
      && frame.phase === PHASE.STRIKE
      && !rec.coast;
  }
  if (!(mutationSpec() && mutationSpec().laneHysteresis === false)) {
    separateSlots(frame, Math.max(72, spacing * 1.2));
  }
  for (const rec of frame.members.values()) {
    rec.slotError = distance2(rec.pos, rec.slot);
  }
}

function separateSlots(frame, minDist) {
  const recs = [];
  for (const rec of frame.members.values()) {
    if (rec.alive) recs.push(rec);
  }
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i].slot;
      const b = recs[j].slot;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= minDist || dist < EPS) continue;
      const push = (minDist - dist) * 0.5;
      const ux = dist > EPS ? dx / dist : 1;
      const uz = dist > EPS ? dz / dist : 0;
      a.x += ux * push;
      a.z += uz * push;
      b.x -= ux * push;
      b.z -= uz * push;
    }
  }
}

function blendedLocal(shapeA, shapeB, socket, u) {
  const a = (shapeA.slots && shapeA.slots[socket]) || { right: 0, forward: 0 };
  const b = (shapeB.slots && shapeB.slots[socket]) || a;
  return {
    right: a.right + (b.right - a.right) * u,
    forward: a.forward + (b.forward - a.forward) * u,
  };
}

function tagFireAndCommitment(frame, recipe, target) {
  let committed = 0;
  for (const rec of frame.members.values()) {
    if (!rec.alive || rec.token !== SQUAD_TOKEN.CLOSE_ATTACK) continue;
    const attacking = frame.phase === PHASE.COMMIT || frame.phase === PHASE.STRIKE || frame.phase === PHASE.EXTEND;
    if (!attacking) continue;
    committed++;
  }
  if (committed > frame.committedPeak) frame.committedPeak = committed;
}

function publishPlans(director, frame, recipe, tick) {
  const bound = Math.max(90, currentSpacing(frame) * 2.4);
  for (const rec of frame.members.values()) {
    if (!rec.plan) {
      rec.plan = {
        squadId: frame.id,
        recipeId: frame.recipeId,
        tick: 0,
        phase: frame.phase,
        role: rec.role,
        socket: rec.socket,
        token: rec.token,
        laneId: rec.laneId,
        laneSide: rec.laneSide,
        integrity: frame.integrity,
        morphAborted: frame.morphAborted,
        slot: rec.slot,
        slotVel: { x: rec.slot.vx, z: rec.slot.vz },
        bound,
        speedFraction: rec.speedFraction,
        faceTarget: rec.faceTarget,
        fireAuthorized: rec.fireAuthorized,
        coast: rec.coast,
        disrupted: rec.disrupted,
        breakFormation: rec.breakFormation,
        targetId: frame.lastTarget.id,
        slotError: rec.slotError,
        rejoinTick: rec.rejoinTick,
        live: rec.live,
        reason: `squad_frame:${frame.recipeId}:${frame.phase}`,
      };
    }
    const plan = rec.plan;
    plan.tick = tick;
    plan.phase = frame.phase;
    plan.role = rec.role;
    plan.socket = rec.socket;
    plan.token = rec.token;
    plan.laneId = rec.laneId;
    plan.laneSide = rec.laneSide;
    plan.integrity = frame.integrity;
    plan.morphAborted = frame.morphAborted;
    plan.slot = rec.slot;
    plan.slotVel.x = rec.slot.vx;
    plan.slotVel.z = rec.slot.vz;
    plan.bound = bound;
    plan.speedFraction = rec.speedFraction;
    plan.faceTarget = rec.faceTarget;
    plan.fireAuthorized = rec.fireAuthorized;
    plan.coast = rec.coast;
    plan.disrupted = rec.disrupted;
    plan.breakFormation = rec.breakFormation;
    plan.targetId = frame.lastTarget.id;
    plan.slotError = rec.slotError;
    plan.rejoinTick = rec.rejoinTick;
    plan.live = rec.live;
    plan.reason = `squad_frame:${frame.recipeId}:${frame.phase}`;
    director.byEntity.set(rec.id, { squadId: frame.id, plan });
  }
}

function snapshotFrame(frame) {
  const members = {};
  for (const [id, rec] of frame.members) {
    members[String(id)] = {
      socket: rec.socket,
      role: rec.role,
      token: rec.token,
      laneId: rec.laneId,
      phase: frame.phase,
      disrupted: rec.disrupted,
      coast: rec.coast,
      slotError: rec.slotError,
      fireAuthorized: rec.fireAuthorized,
      rejoinTick: rec.rejoinTick,
    };
  }
  return {
    id: frame.id,
    recipeId: frame.recipeId,
    phase: frame.phase,
    integrity: frame.integrity,
    integrityMin: frame.integrityMin,
    morphAborted: frame.morphAborted,
    cycle: frame.cycle,
    committedPeak: frame.committedPeak,
    commandId: frame.commandId,
    heading: frame.heading,
    shapeId: frame.shapeId,
    members,
  };
}

function pickSeedLeader(members, live) {
  for (const entity of members || []) {
    const ai = entity && entity.data && entity.data.ai;
    const socket = socketFromAi(ai);
    if (socket === SQUAD_SOCKET.LEAD && entity.alive !== false) return entity;
  }
  return (live && live[0]) || (members && members[0]) || null;
}

function centroid(entities) {
  if (!entities.length) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const e of entities) {
    x += finite(e.pos.x);
    z += finite(e.pos.z);
  }
  return { x: x / entities.length, z: z / entities.length };
}

function averageVel(entities) {
  if (!entities.length) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const e of entities) {
    x += finite(e.vel && e.vel.x);
    z += finite(e.vel && e.vel.z);
  }
  return { x: x / entities.length, z: z / entities.length };
}

function averageHeading(entities) {
  if (!entities.length) return 0;
  let x = 0;
  let z = 0;
  for (const e of entities) {
    const rot = finite(e.rot);
    x += Math.cos(rot);
    z += Math.sin(rot);
  }
  if (Math.hypot(x, z) < EPS) return 0;
  return Math.atan2(z, x);
}

function compareId(a, b) {
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}
