// Cheap fodder cohort: a loose moving frame with shared flow, local separation,
// and a visible physics-coast after player impulses. Planning only — no position
// or velocity writes. Members track desired state through the canonical actuator.
// Neighbor scans use the existing spatial hash; steering weights are normalized
// so the result does not grow with neighbor count (§21A.14).

import {
  clamp,
  distance2,
  finite,
  saturate,
  wrapAngle,
} from './contracts.js';
import {
  COHORT_PHASE,
  COHORT_RECIPE_CRESCENT,
  COHORT_RECIPE_RIVER,
  getCohortRecipe,
  hullClearanceSpacing,
} from '../data/squadChoreography.js';
import { hasActiveSpatialHash, queryNearbyEntities } from '../core/spatialQuery.js';

export {
  COHORT_PHASE,
  COHORT_RECIPE_CRESCENT,
  COHORT_RECIPE_RIVER,
};

export const STEERING_KEYS = Object.freeze([
  'flow',
  'slot',
  'separation',
  'alignment',
  'hazard',
  'pressure',
]);

export const PHASE_WEIGHTS = Object.freeze({
  [COHORT_PHASE.STREAM]: Object.freeze({
    flow: 0.38, slot: 0.12, separation: 0.32, alignment: 0.10, hazard: 0.12, pressure: 0.05,
  }),
  [COHORT_PHASE.PRESS]: Object.freeze({
    flow: 0.28, slot: 0.16, separation: 0.30, alignment: 0.08, hazard: 0.12, pressure: 0.14,
  }),
  [COHORT_PHASE.REFORM]: Object.freeze({
    flow: 0.24, slot: 0.28, separation: 0.30, alignment: 0.10, hazard: 0.12, pressure: 0.04,
  }),
});

const INTERCEPT_REF = 72;
const FRAME_MAX_ACCEL = 38;
const FRAME_MAX_YAW = 0.72;
const EPS = 1e-9;
const LOOKAHEAD_S = 0.55;

let forcedMutation = null;

export function forceFodderCohortMutation(spec = null) {
  if (spec == null || spec === false) {
    forcedMutation = null;
    return null;
  }
  forcedMutation = { ...spec };
  return forcedMutation;
}

export function isFodderCohortMutationForced() {
  return forcedMutation != null;
}

export function cohortRecipeFromEntity(entity) {
  const ai = entity && entity.data && entity.data.ai;
  if (!ai) return null;
  const id = ai.cohortRecipe || ai.fodderRecipe;
  return getCohortRecipe(id) ? id : null;
}

export function createFodderCohortDirector({ seed = 1 } = {}) {
  return new FodderCohortDirector(seed);
}

export class FodderCohortDirector {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.cohorts = new Map();
    this.byEntity = new Map();
    this.lastTick = -1;
    this.lastCost = emptyCost();
    this.queryScratch = [];
    this.fallbackScratch = [];
    this.neighborScratch = [];
    this.componentScratch = {
      flow: { x: 0, z: 0 },
      slot: { x: 0, z: 0 },
      separation: { x: 0, z: 0 },
      alignment: { x: 0, z: 0 },
      hazard: { x: 0, z: 0 },
      pressure: { x: 0, z: 0 },
    };
    this.weightScratch = {
      flow: 0, slot: 0, separation: 0, alignment: 0, hazard: 0, pressure: 0,
    };
  }

  has(entityId) {
    return this.byEntity.has(entityId);
  }

  activeCohortCount() {
    return this.cohorts.size;
  }

  planFor(entityId) {
    const link = this.byEntity.get(entityId);
    return link ? link.plan : null;
  }

  inspect(cohortId = null) {
    if (cohortId != null) {
      const cohort = this.cohorts.get(cohortId);
      return cohort ? snapshotCohort(cohort) : null;
    }
    const out = {};
    for (const [id, cohort] of this.cohorts) out[String(id)] = snapshotCohort(cohort);
    return out;
  }

  forget(entityId) {
    const link = this.byEntity.get(entityId);
    if (!link) return;
    this.byEntity.delete(entityId);
    const cohort = this.cohorts.get(link.cohortId);
    if (!cohort) return;
    const rec = cohort.members.get(entityId);
    if (rec) rec.alive = false;
  }

  stepAll(tick, dt, groups, targetLookup, state) {
    this.lastTick = tick | 0;
    const live = new Set();
    resetCost(this.lastCost);
    for (const group of groups || []) {
      if (!group || group.id == null) continue;
      live.add(group.id);
      this._stepCohort(tick | 0, dt, group, targetLookup, state);
    }
    for (const id of [...this.cohorts.keys()]) {
      if (live.has(id)) continue;
      this._retire(id);
    }
  }

  _retire(cohortId) {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) return;
    for (const id of cohort.members.keys()) this.byEntity.delete(id);
    this.cohorts.delete(cohortId);
  }

  _stepCohort(tick, dt, group, targetLookup, state) {
    const recipeId = group.recipeId || COHORT_RECIPE_RIVER;
    const recipe = getCohortRecipe(recipeId);
    if (!recipe) return;
    let cohort = this.cohorts.get(group.id);
    const members = Array.isArray(group.members) ? group.members : [];
    if (!cohort) {
      cohort = seedCohort(group.id, recipeId, recipe, members, tick, this.seed);
      this.cohorts.set(group.id, cohort);
    }
    syncMembers(cohort, members, recipe);
    const target = resolveTarget(group, members, targetLookup, cohort);
    const mutation = mutationSpec();
    stepCohort(this, cohort, recipe, target, tick, dt, state, mutation);
    publishPlans(this, cohort, recipe, tick);
  }
}

export function normalizeSteeringWeights(weights) {
  const out = {
    flow: 0, slot: 0, separation: 0, alignment: 0, hazard: 0, pressure: 0,
  };
  let sum = 0;
  for (let i = 0; i < STEERING_KEYS.length; i++) {
    const key = STEERING_KEYS[i];
    const w = weights && Number.isFinite(weights[key]) ? Math.max(0, weights[key]) : 0;
    out[key] = w;
    sum += w;
  }
  if (sum <= EPS) return out;
  for (let i = 0; i < STEERING_KEYS.length; i++) {
    const key = STEERING_KEYS[i];
    out[key] /= sum;
  }
  return out;
}

/**
 * Mean (not sum) of in-radius repulsion. Identical neighbors in the same place
 * do not grow the vector when the count rises — the result is O(1) in N.
 */
export function meanNeighborSeparation(self, neighbors, radius, membersOnly = false) {
  let x = 0;
  let z = 0;
  let n = 0;
  const r = radius > EPS ? radius : 0;
  for (let i = 0; i < (neighbors ? neighbors.length : 0); i++) {
    const other = neighbors[i];
    if (!other) continue;
    if (membersOnly && other.member === false) continue;
    const dx = self.x - other.x;
    const dz = self.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist < EPS || dist >= r) continue;
    const push = (r - dist) / r;
    x += (dx / dist) * push;
    z += (dz / dist) * push;
    n++;
  }
  if (!n) return { x: 0, z: 0, neighbors: 0 };
  return { x: x / n, z: z / n, neighbors: n };
}

export function composeDesiredVelocity(components, weights, speedCap) {
  const w = normalizeSteeringWeights(weights);
  let x = 0;
  let z = 0;
  for (let i = 0; i < STEERING_KEYS.length; i++) {
    const key = STEERING_KEYS[i];
    const c = components && components[key];
    if (!c) continue;
    x += w[key] * finite(c.x);
    z += w[key] * finite(c.z);
  }
  const cap = speedCap > 0 ? speedCap : 0;
  const mag = Math.hypot(x, z);
  if (cap > EPS && mag > cap) {
    const s = cap / mag;
    x *= s;
    z *= s;
  }
  return { x, z, weights: w, mag: Math.hypot(x, z) };
}

function mutationSpec() {
  return forcedMutation || null;
}

function emptyCost() {
  return {
    members: 0,
    neighborQueries: 0,
    neighborVisits: 0,
    maxNeighbors: 0,
    usedSpatialHash: false,
    allPairs: false,
    queryMode: 'none',
  };
}

function resetCost(cost) {
  cost.members = 0;
  cost.neighborQueries = 0;
  cost.neighborVisits = 0;
  cost.maxNeighbors = 0;
  cost.usedSpatialHash = false;
  cost.allPairs = false;
  cost.queryMode = 'none';
}

function seedCohort(id, recipeId, recipe, members, tick, seed) {
  const live = members.filter((e) => e && e.alive !== false && e.pos);
  const origin = centroid(live);
  const heading = averageHeading(live);
  const vel = averageVel(live);
  const gate = readGate(members, origin);
  const dirX = Math.cos(heading);
  const dirZ = Math.sin(heading);
  let px = origin.x;
  let pz = origin.z;
  if (recipe.shape === 'crescent') {
    px = gate.x;
    pz = gate.z;
  } else {
    const head = headCentroid(live, dirX, dirZ);
    px = head.x;
    pz = head.z;
  }
  return {
    id,
    recipeId,
    shape: recipe.shape,
    seed: seed >>> 0,
    bornTick: tick,
    originGate: { x: gate.x, z: gate.z },
    targetId: null,
    flowPath: {
      ax: gate.x,
      az: gate.z,
      bx: gate.x + dirX * 420,
      bz: gate.z + dirZ * 420,
      width: recipe.corridorWidth,
      dirX,
      dirZ,
    },
    phase: COHORT_PHASE.STREAM,
    phaseStartedTick: tick,
    densityTarget: recipe.densityTarget,
    speedBand: { min: recipe.speedBand.min, max: recipe.speedBand.max },
    disruption: { count: 0, until: -1 },
    reformPolicy: recipe.reformPolicy,
    position: { x: px, z: pz },
    velocity: { x: vel.x, z: vel.z },
    heading,
    angularVelocity: 0,
    integrity: 1,
    integrityMin: 1,
    members: new Map(),
    lastTarget: { id: null, x: 0, z: 0, vx: 0, vz: 0, radius: 8 },
    lastCost: emptyCost(),
    predicted: { x: 0, z: 0 },
  };
}

function headCentroid(entities, dirX, dirZ) {
  if (!entities.length) return { x: 0, z: 0 };
  let best = -Infinity;
  for (const e of entities) {
    const along = finite(e.pos.x) * dirX + finite(e.pos.z) * dirZ;
    if (along > best) best = along;
  }
  let x = 0;
  let z = 0;
  let n = 0;
  for (const e of entities) {
    const along = finite(e.pos.x) * dirX + finite(e.pos.z) * dirZ;
    if (along < best - 24) continue;
    x += finite(e.pos.x);
    z += finite(e.pos.z);
    n++;
  }
  return n ? { x: x / n, z: z / n } : { x: entities[0].pos.x, z: entities[0].pos.z };
}

function readGate(members, fallback) {
  for (const entity of members || []) {
    const ai = entity && entity.data && entity.data.ai;
    const gate = ai && ai.cohortGate;
    if (gate && Number.isFinite(gate.x) && Number.isFinite(gate.z)) {
      return { x: gate.x, z: gate.z };
    }
  }
  return { x: fallback.x, z: fallback.z };
}

function syncMembers(cohort, members, recipe) {
  const seen = new Set();
  const ordered = members.slice().sort((a, b) => compareId(a && a.id, b && b.id));
  const liveCount = ordered.filter((e) => e && e.id != null).length;
  const laneCount = laneCountFor(recipe, liveCount);
  let index = 0;
  for (let i = 0; i < ordered.length; i++) {
    const entity = ordered[i];
    if (!entity || entity.id == null) continue;
    seen.add(entity.id);
    let rec = cohort.members.get(entity.id);
    if (!rec) {
      rec = makeMember(entity.id, index, laneCount, recipe);
      cohort.members.set(entity.id, rec);
    }
    rec.lane = index % laneCount;
    rec.along = Math.floor(index / laneCount);
    rec.arcIndex = index;
    rec.memberIndex = index;
    rec.entity = entity;
    copyLive(rec, entity);
    index++;
  }
  for (const [id, rec] of cohort.members) {
    if (seen.has(id)) continue;
    rec.alive = false;
    rec.hullFraction = 0;
    rec.entity = null;
  }
  cohort.liveCount = index;
  cohort.laneCount = laneCount;
}

function laneCountFor(recipe, n) {
  if (recipe.shape === 'crescent') return Math.max(1, n);
  if (n <= 6) return 2;
  if (n <= 12) return 3;
  if (n <= 20) return 4;
  return 5;
}

function makeMember(id, index, laneCount, recipe) {
  return {
    id,
    lane: index % laneCount,
    along: Math.floor(index / laneCount),
    arcIndex: index,
    memberIndex: index,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    hullFraction: 1,
    slot: { x: 0, z: 0, vx: 0, vz: 0, heading: 0 },
    shapeSlot: { x: 0, z: 0, vx: 0, vz: 0 },
    slotError: 0,
    shapeError: 0,
    slotReady: false,
    disrupted: false,
    disruptedUntil: -1,
    coast: false,
    breakFormation: false,
    speedFraction: recipe.cruiseSpeed / INTERCEPT_REF,
    faceTarget: false,
    neighborCount: 0,
    lastRelV: 0,
    rejoinTick: null,
    live: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, hullFraction: 1 },
    entity: null,
    plan: null,
  };
}

function copyLive(rec, entity) {
  const pos = entity.pos || { x: 0, z: 0 };
  const vel = entity.vel || { x: 0, z: 0 };
  rec.alive = entity.alive !== false && !(entity.flags && entity.flags.disabled);
  if (entity.hull != null && entity.hull <= 0) rec.alive = false;
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
}

function resolveTarget(group, members, targetLookup, cohort) {
  let id = group.targetId;
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
    cohort.lastTarget.id = entity.id;
    cohort.lastTarget.x = finite(entity.pos.x);
    cohort.lastTarget.z = finite(entity.pos.z);
    cohort.lastTarget.vx = finite(entity.vel && entity.vel.x);
    cohort.lastTarget.vz = finite(entity.vel && entity.vel.z);
    cohort.lastTarget.radius = Math.max(4, finite(entity.radius, 8));
    cohort.targetId = entity.id;
    return cohort.lastTarget;
  }
  if (cohort.lastTarget.id != null) return cohort.lastTarget;
  return null;
}

function stepCohort(director, cohort, recipe, target, tick, dt, state, mutation) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  writeShapeSlots(cohort, recipe, target);
  updateIntegrity(cohort);
  detectDisruption(cohort, recipe, tick, step, mutation);
  advancePhase(cohort, recipe, target, tick, step);
  integrateFrame(cohort, recipe, target, step);
  writeShapeSlots(cohort, recipe, target);
  steerMembers(director, cohort, recipe, target, tick, step, state, mutation);
}

function currentSpacing(cohort, recipe) {
  const radii = [];
  for (const rec of cohort.members.values()) {
    if (rec.alive) radii.push(rec.radius);
  }
  const scale = recipe.shape === 'crescent' ? 1.05 : 1;
  return Math.max(recipe.densityTarget, hullClearanceSpacing(radii, scale));
}

function writeShapeSlots(cohort, recipe, target) {
  const spacing = currentSpacing(cohort, recipe);
  const c = Math.cos(cohort.heading);
  const s = Math.sin(cohort.heading);
  const fwdX = c;
  const fwdZ = s;
  const rightX = -s;
  const rightZ = c;
  const cruise = recipe.cruiseSpeed;
  const n = Math.max(1, cohort.liveCount || 1);
  const lanes = Math.max(1, cohort.laneCount || 1);
  const mid = (lanes - 1) * 0.5;
  const laneSpacing = recipe.laneSpacing || spacing;
  const alongSpacing = recipe.alongSpacing || spacing;
  const arcSpan = recipe.arcSpan;
  const arcRadius = recipe.arcRadius;

  for (const rec of cohort.members.values()) {
    if (!rec.alive) continue;
    let ox;
    let oz;
    if (recipe.shape === 'crescent') {
      const u = n <= 1 ? 0.5 : rec.arcIndex / Math.max(1, n - 1);
      const ang = -arcSpan * 0.5 + arcSpan * u;
      const localFwd = -Math.cos(ang) * arcRadius;
      const localRight = Math.sin(ang) * arcRadius;
      ox = fwdX * localFwd + rightX * localRight;
      oz = fwdZ * localFwd + rightZ * localRight;
    } else {
      const rightOff = (rec.lane - mid) * laneSpacing;
      const backOff = -rec.along * alongSpacing;
      ox = fwdX * backOff + rightX * rightOff;
      oz = fwdZ * backOff + rightZ * rightOff;
    }
    rec.shapeSlot.x = cohort.position.x + ox;
    rec.shapeSlot.z = cohort.position.z + oz;
    rec.shapeSlot.vx = cohort.velocity.x;
    rec.shapeSlot.vz = cohort.velocity.z;
    rec.shapeError = distance2(rec.pos, rec.shapeSlot);
    rec.slotReady = true;
  }
  cohort.spacing = spacing;
  cohort.cruise = cruise;
}

function updateIntegrity(cohort) {
  let total = 0;
  let live = 0;
  let disrupted = 0;
  for (const rec of cohort.members.values()) {
    total++;
    if (!rec.alive) continue;
    live++;
    if (rec.disrupted) disrupted++;
  }
  const liveFrac = total ? live / total : 0;
  const disruptFrac = live ? disrupted / live : 0;
  const integrity = saturate(liveFrac * (1 - 0.32 * disruptFrac));
  cohort.integrity = integrity;
  if (integrity < cohort.integrityMin) cohort.integrityMin = integrity;
  cohort.disruption.count = disrupted;
}

function detectDisruption(cohort, recipe, tick, dt, mutation) {
  const cancel = !!(mutation && mutation.cancelImpulses);
  const spacing = cohort.spacing || recipe.densityTarget;
  const flowVx = cohort.velocity.x;
  const flowVz = cohort.velocity.z;
  const flowSpd = Math.hypot(flowVx, flowVz) || 1;
  const flowX = flowVx / flowSpd;
  const flowZ = flowVz / flowSpd;
  const settling = tick - (cohort.bornTick || 0) < 24;
  for (const rec of cohort.members.values()) {
    if (!rec.alive) {
      rec.disrupted = true;
      rec.coast = false;
      rec.breakFormation = true;
      continue;
    }
    if (!rec.slotReady) continue;
    const relV = Math.hypot(rec.vel.x - flowVx, rec.vel.z - flowVz);
    const lateral = Math.abs((rec.pos.x - rec.shapeSlot.x) * -flowZ + (rec.pos.z - rec.shapeSlot.z) * flowX);
    rec.lateralError = lateral;
    const prevRelV = rec.lastRelV || 0;
    rec.lastRelV = relV;
    const velocitySpike = !settling && relV > 44 && relV > prevRelV + 16;
    if (velocitySpike && cancel) {
      rec.disrupted = true;
      rec.disruptedUntil = tick;
    } else if (velocitySpike && !rec.disrupted && !cancel) {
      const extra = saturate((relV - 44) / 60);
      const coastTicks = Math.round((recipe.coastMinS + extra * (recipe.coastMaxS - recipe.coastMinS)) / dt);
      rec.disrupted = true;
      rec.disruptedUntil = tick + clamp(coastTicks, 48, 96);
    }
    rec.coast = !cancel && rec.disrupted && tick < rec.disruptedUntil;
    rec.breakFormation = rec.coast;
    const spd = Math.hypot(rec.vel.x, rec.vel.z);
    const align = spd > 0.5 ? (rec.vel.x * flowX + rec.vel.z * flowZ) / spd : 0;
    if (rec.disrupted && !rec.coast && (align > 0.42 || tick >= rec.disruptedUntil + 18)) {
      rec.disrupted = false;
      rec.disruptedUntil = -1;
      rec.rejoinTick = tick;
    }
  }
  let until = cohort.disruption.until;
  for (const rec of cohort.members.values()) {
    if (rec.alive && rec.coast && rec.disruptedUntil > until) until = rec.disruptedUntil;
  }
  cohort.disruption.until = until;
}

function advancePhase(cohort, recipe, target, tick, dt) {
  const age = (tick - cohort.phaseStartedTick) * dt;
  const dist = target
    ? Math.hypot(target.x - cohort.position.x, target.z - cohort.position.z)
    : Infinity;
  const standoff = recipe.standoff || 0;
  if (cohort.phase === COHORT_PHASE.STREAM) {
    if (cohort.integrity < 0.74) {
      enterPhase(cohort, COHORT_PHASE.REFORM, tick);
    } else if (standoff > 0 && dist <= standoff * 1.15) {
      enterPhase(cohort, COHORT_PHASE.PRESS, tick);
    }
  } else if (cohort.phase === COHORT_PHASE.PRESS) {
    if (cohort.integrity < 0.74) enterPhase(cohort, COHORT_PHASE.REFORM, tick);
    else if (standoff > 0 && dist > standoff * 1.55) enterPhase(cohort, COHORT_PHASE.STREAM, tick);
  } else if (cohort.phase === COHORT_PHASE.REFORM) {
    const settled = formationSettled(cohort);
    if ((settled && age >= 0.35) || age >= 2.4) {
      enterPhase(cohort, standoff > 0 && dist <= standoff * 1.15 ? COHORT_PHASE.PRESS : COHORT_PHASE.STREAM, tick);
    }
  }
}

function enterPhase(cohort, phase, tick) {
  if (cohort.phase === phase) return;
  cohort.phase = phase;
  cohort.phaseStartedTick = tick;
}

function formationSettled(cohort) {
  const spacing = cohort.spacing || 40;
  let n = 0;
  let ok = 0;
  for (const rec of cohort.members.values()) {
    if (!rec.alive || rec.coast) continue;
    n++;
    if (rec.shapeError <= spacing * 1.2) ok++;
  }
  return n >= 2 && ok >= Math.max(2, n - 1);
}

function integrateFrame(cohort, recipe, target, dt) {
  const predX = target ? target.x + target.vx * 0.35 : cohort.position.x + cohort.flowPath.dirX * 80;
  const predZ = target ? target.z + target.vz * 0.35 : cohort.position.z + cohort.flowPath.dirZ * 80;
  cohort.predicted.x = predX;
  cohort.predicted.z = predZ;

  const gateX = cohort.originGate.x;
  const gateZ = cohort.originGate.z;
  const toGateX = gateX - cohort.position.x;
  const toGateZ = gateZ - cohort.position.z;
  const gateAhead = toGateX * cohort.flowPath.dirX + toGateZ * cohort.flowPath.dirZ;
  let aimX;
  let aimZ;
  if (recipe.shape === 'river' && gateAhead > 28) {
    aimX = gateX;
    aimZ = gateZ;
  } else {
    aimX = predX;
    aimZ = predZ;
  }
  const dx = aimX - cohort.position.x;
  const dz = aimZ - cohort.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desiredHeading = Math.atan2(dz, dx);
  const headingErr = wrapAngle(desiredHeading - cohort.heading);
  const yaw = clamp(headingErr * 1.15, -FRAME_MAX_YAW, FRAME_MAX_YAW);
  cohort.angularVelocity = yaw;
  cohort.heading = wrapAngle(cohort.heading + yaw * dt);
  const dirX = Math.cos(cohort.heading);
  const dirZ = Math.sin(cohort.heading);
  cohort.flowPath.dirX = dirX;
  cohort.flowPath.dirZ = dirZ;
  cohort.flowPath.bx = predX;
  cohort.flowPath.bz = predZ;

  const anchored = liveAnchor(cohort, recipe, dirX, dirZ);
  let cruise = recipe.cruiseSpeed;
  if (recipe.shape === 'crescent') {
    const standoff = recipe.standoff || 240;
    if (dist < standoff) cruise *= saturate((dist - standoff * 0.45) / Math.max(standoff * 0.55, 1));
  }
  const follow = 3.2;
  cohort.position.x += (anchored.x - cohort.position.x) * saturate(follow * dt);
  cohort.position.z += (anchored.z - cohort.position.z) * saturate(follow * dt);
  const dvx = dirX * cruise - cohort.velocity.x;
  const dvz = dirZ * cruise - cohort.velocity.z;
  cohort.velocity.x += clamp(dvx * 2.2, -FRAME_MAX_ACCEL, FRAME_MAX_ACCEL) * dt;
  cohort.velocity.z += clamp(dvz * 2.2, -FRAME_MAX_ACCEL, FRAME_MAX_ACCEL) * dt;
  const spd = Math.hypot(cohort.velocity.x, cohort.velocity.z);
  const maxSpd = recipe.speedBand.max;
  if (spd > maxSpd && spd > EPS) {
    const s = maxSpd / spd;
    cohort.velocity.x *= s;
    cohort.velocity.z *= s;
  }
  cohort.position.x += cohort.velocity.x * dt * 0.35;
  cohort.position.z += cohort.velocity.z * dt * 0.35;
}

function liveAnchor(cohort, recipe, dirX, dirZ) {
  let x = 0;
  let z = 0;
  let n = 0;
  let best = -Infinity;
  for (const rec of cohort.members.values()) {
    if (!rec.alive || rec.coast) continue;
    x += rec.pos.x;
    z += rec.pos.z;
    n++;
    const along = rec.pos.x * dirX + rec.pos.z * dirZ;
    if (along > best) best = along;
  }
  if (!n) return { x: cohort.position.x, z: cohort.position.z };
  const cx = x / n;
  const cz = z / n;
  if (recipe.shape === 'crescent') {
    return { x: cx + dirX * recipe.arcRadius * 0.35, z: cz + dirZ * recipe.arcRadius * 0.35 };
  }
  let hx = 0;
  let hz = 0;
  let hn = 0;
  for (const rec of cohort.members.values()) {
    if (!rec.alive || rec.coast) continue;
    const along = rec.pos.x * dirX + rec.pos.z * dirZ;
    if (along < best - 28) continue;
    hx += rec.pos.x;
    hz += rec.pos.z;
    hn++;
  }
  return hn ? { x: hx / hn, z: hz / hn } : { x: cx, z: cz };
}

function steerMembers(director, cohort, recipe, target, tick, dt, state, mutation) {
  const hashOn = hasActiveSpatialHash(state && state.spatialHash);
  const fallback = director.fallbackScratch;
  fallback.length = 0;
  for (const rec of cohort.members.values()) {
    if (rec.alive && rec.entity) fallback.push(rec.entity);
  }
  const queryR = recipe.queryRadius;
  const sepR = Math.max(recipe.separationRadius, cohort.spacing || recipe.densityTarget);
  const speedCap = recipe.speedBand.max;
  const cost = director.lastCost;
  const local = cohort.lastCost;
  resetCost(local);
  const noSep = !!(mutation && mutation.disableSeparation);
  const cancel = !!(mutation && mutation.cancelImpulses);
  const weights = weightsFor(cohort.phase, mutation);

  for (const rec of cohort.members.values()) {
    if (!rec.alive) continue;
    cost.members++;
    local.members++;
    if (noSep) {
      rec.shapeSlot.x = cohort.position.x;
      rec.shapeSlot.z = cohort.position.z;
      rec.shapeError = distance2(rec.pos, rec.shapeSlot);
    }
    if (rec.coast) {
      rec.slot.x = rec.pos.x;
      rec.slot.z = rec.pos.z;
      rec.slot.vx = rec.vel.x;
      rec.slot.vz = rec.vel.z;
      rec.slot.heading = rec.rot;
      rec.slotError = rec.shapeError;
      rec.speedFraction = 0;
      rec.neighborCount = 0;
      continue;
    }

    const query = director.queryScratch;
    query.length = 0;
    const found = queryNearbyEntities(state, rec.pos, queryR, query, fallback);
    cost.neighborQueries++;
    local.neighborQueries++;
    if (hashOn) {
      cost.usedSpatialHash = true;
      local.usedSpatialHash = true;
      cost.queryMode = 'spatial_hash';
      local.queryMode = 'spatial_hash';
    } else {
      if (cost.queryMode === 'none') cost.queryMode = 'cohort_radius';
      if (local.queryMode === 'none') local.queryMode = 'cohort_radius';
    }

    const neighbors = director.neighborScratch;
    let visits = 0;
    const source = found || query;
    for (let i = 0; i < source.length; i++) {
      const other = source[i];
      if (!other || other.id === rec.id || !other.pos) continue;
      const dx = rec.pos.x - other.pos.x;
      const dz = rec.pos.z - other.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > queryR) continue;
      let slot = neighbors[visits];
      if (!slot) {
        slot = { id: null, x: 0, z: 0, vx: 0, vz: 0, radius: 8, member: false, hazard: false };
        neighbors[visits] = slot;
      }
      const inCohort = cohort.members.has(other.id);
      slot.id = other.id;
      slot.x = other.pos.x;
      slot.z = other.pos.z;
      slot.vx = finite(other.vel && other.vel.x);
      slot.vz = finite(other.vel && other.vel.z);
      slot.radius = Math.max(4, finite(other.radius, 8));
      slot.member = inCohort;
      slot.hazard = !inCohort && isHazard(other, cohort.targetId);
      visits++;
    }
    neighbors.length = visits;
    neighbors.sort((a, b) => compareId(a.id, b.id));
    rec.neighborCount = visits;
    cost.neighborVisits += visits;
    local.neighborVisits += visits;
    if (visits > cost.maxNeighbors) cost.maxNeighbors = visits;
    if (visits > local.maxNeighbors) local.maxNeighbors = visits;

    const desired = desiredForMember(
      director,
      rec,
      cohort,
      recipe,
      target,
      neighbors,
      weights,
      sepR,
      speedCap,
      noSep,
      cancel,
    );
    rec.slot.x = rec.pos.x + desired.x * LOOKAHEAD_S;
    rec.slot.z = rec.pos.z + desired.z * LOOKAHEAD_S;
    rec.slot.vx = desired.x;
    rec.slot.vz = desired.z;
    rec.slot.heading = Math.atan2(desired.z, desired.x);
    rec.slotError = rec.shapeError;
    rec.speedFraction = clamp(desired.mag / INTERCEPT_REF, 0.28, 1);
    rec.faceTarget = cohort.phase === COHORT_PHASE.PRESS;
  }
  cost.allPairs = false;
  local.allPairs = false;
}

function isHazard(entity, targetId) {
  if (!entity || entity.id === targetId) return false;
  if (entity.alive === false) return false;
  if (entity.collides === false) return false;
  if (entity.type === 'asteroid' || entity.type === 'station' || entity.type === 'prop') return true;
  if (entity.type === 'ship' && entity.team !== 1) return false;
  return !!(entity.collides && entity.type !== 'ship');
}

function weightsFor(phase, mutation) {
  const base = PHASE_WEIGHTS[phase] || PHASE_WEIGHTS[COHORT_PHASE.STREAM];
  if (!mutation) return base;
  const next = { ...base };
  if (mutation.disableSeparation) {
    next.separation = 0;
    next.slot = 0.55;
    next.alignment = 0.05;
    next.pressure = 0.08;
    next.flow = 0.22;
  }
  if (mutation.cancelImpulses) {
    next.slot = (next.slot || 0) + 0.55;
    next.flow = (next.flow || 0) + 0.35;
    next.alignment = (next.alignment || 0) + 0.12;
  }
  return next;
}

function desiredForMember(
  director,
  rec,
  cohort,
  recipe,
  target,
  neighbors,
  weights,
  sepR,
  speedCap,
  noSep,
  cancel,
) {
  const comps = director.componentScratch;
  const dirX = cohort.flowPath.dirX;
  const dirZ = cohort.flowPath.dirZ;
  const cruise = Math.max(recipe.speedBand.min, Math.min(speedCap, recipe.cruiseSpeed));

  comps.flow.x = dirX * cruise;
  comps.flow.z = dirZ * cruise;

  const sdx = rec.shapeSlot.x - rec.pos.x;
  const sdz = rec.shapeSlot.z - rec.pos.z;
  const sdist = Math.hypot(sdx, sdz);
  const slotPull = saturate(sdist / Math.max(cohort.spacing || sepR, 1));
  const slotScale = (cancel ? 1.35 : 0.85) * cruise;
  if (sdist > EPS) {
    comps.slot.x = (sdx / sdist) * slotPull * slotScale;
    comps.slot.z = (sdz / sdist) * slotPull * slotScale;
  } else {
    comps.slot.x = dirX * cruise * 0.2;
    comps.slot.z = dirZ * cruise * 0.2;
  }

  if (noSep) {
    comps.separation.x = 0;
    comps.separation.z = 0;
  } else {
    const sep = meanNeighborSeparation(rec.pos, neighbors, sepR, true);
    const sepMag = Math.hypot(sep.x, sep.z);
    if (sepMag > EPS) {
      const boost = Math.min(1, sepMag) * cruise;
      comps.separation.x = (sep.x / sepMag) * boost;
      comps.separation.z = (sep.z / sepMag) * boost;
    } else {
      comps.separation.x = 0;
      comps.separation.z = 0;
    }
  }

  let ax = 0;
  let az = 0;
  let an = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (!n.member) continue;
    const mag = Math.hypot(n.vx, n.vz);
    if (mag < 0.5) continue;
    ax += n.vx / mag;
    az += n.vz / mag;
    an++;
  }
  if (an > 0) {
    ax /= an;
    az /= an;
    const am = Math.hypot(ax, az) || 1;
    comps.alignment.x = (ax / am) * cruise;
    comps.alignment.z = (az / am) * cruise;
  } else {
    comps.alignment.x = comps.flow.x;
    comps.alignment.z = comps.flow.z;
  }

  let hx = 0;
  let hz = 0;
  let hn = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (!n.hazard) continue;
    const dx = rec.pos.x - n.x;
    const dz = rec.pos.z - n.z;
    const dist = Math.hypot(dx, dz);
    const clear = sepR + n.radius;
    if (dist < EPS || dist >= clear) continue;
    const push = (clear - dist) / clear;
    hx += (dx / dist) * push;
    hz += (dz / dist) * push;
    hn++;
  }
  if (hn > 0) {
    hx /= hn;
    hz /= hn;
    const hm = Math.hypot(hx, hz) || 1;
    comps.hazard.x = (hx / hm) * cruise;
    comps.hazard.z = (hz / hm) * cruise;
  } else {
    comps.hazard.x = 0;
    comps.hazard.z = 0;
  }

  const pred = cohort.predicted;
  const pdx = pred.x - rec.pos.x;
  const pdz = pred.z - rec.pos.z;
  const pdist = Math.hypot(pdx, pdz);
  if (pdist > EPS) {
    const pressure = recipe.pressureGain * cruise;
    comps.pressure.x = (pdx / pdist) * pressure;
    comps.pressure.z = (pdz / pdist) * pressure;
  } else {
    comps.pressure.x = 0;
    comps.pressure.z = 0;
  }

  const composed = composeDesiredVelocity(comps, weights, speedCap);
  let nearest = Infinity;
  let nx = 0;
  let nz = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (!n.member) continue;
    const dx = rec.pos.x - n.x;
    const dz = rec.pos.z - n.z;
    const dist = Math.hypot(dx, dz);
    if (dist < EPS || dist >= nearest) continue;
    nearest = dist;
    nx = dx / dist;
    nz = dz / dist;
  }
  const hullFloor = Math.max(24, rec.radius * 2 + 4);
  if (!noSep && nearest < hullFloor) {
    const extra = ((hullFloor - nearest) / hullFloor) * speedCap * 0.7;
    composed.x += nx * extra;
    composed.z += nz * extra;
    const mag = Math.hypot(composed.x, composed.z);
    if (mag > speedCap && mag > EPS) {
      const s = speedCap / mag;
      composed.x *= s;
      composed.z *= s;
    }
    composed.mag = Math.hypot(composed.x, composed.z);
  }
  return composed;
}

function publishPlans(director, cohort, recipe, tick) {
  const bound = Math.max(90, (cohort.spacing || recipe.densityTarget) * 2.2);
  for (const rec of cohort.members.values()) {
    if (!rec.plan) {
      rec.plan = {
        squadId: cohort.id,
        recipeId: cohort.recipeId,
        tick: 0,
        phase: cohort.phase,
        role: 'fodder',
        socket: null,
        token: null,
        laneId: rec.lane,
        laneSide: 0,
        integrity: cohort.integrity,
        morphAborted: false,
        slot: rec.slot,
        slotVel: { x: rec.slot.vx, z: rec.slot.vz },
        bound,
        speedFraction: rec.speedFraction,
        faceTarget: rec.faceTarget,
        fireAuthorized: false,
        coast: rec.coast,
        disrupted: rec.disrupted,
        breakFormation: rec.breakFormation,
        targetId: cohort.targetId,
        slotError: rec.slotError,
        shapeError: rec.shapeError,
        rejoinTick: null,
        live: rec.live,
        neighborCount: rec.neighborCount,
        usedSpatialHash: director.lastCost.usedSpatialHash,
        queryMode: director.lastCost.queryMode,
        reason: `fodder_cohort:${cohort.recipeId}:${cohort.phase}`,
      };
    }
    const plan = rec.plan;
    plan.tick = tick;
    plan.phase = cohort.phase;
    plan.laneId = rec.lane;
    plan.integrity = cohort.integrity;
    plan.slot = rec.slot;
    plan.slotVel.x = rec.slot.vx;
    plan.slotVel.z = rec.slot.vz;
    plan.bound = bound;
    plan.speedFraction = rec.speedFraction;
    plan.faceTarget = rec.faceTarget;
    plan.fireAuthorized = false;
    plan.coast = rec.coast;
    plan.disrupted = rec.disrupted;
    plan.breakFormation = rec.breakFormation;
    plan.targetId = cohort.targetId;
    plan.slotError = rec.slotError;
    plan.shapeError = rec.shapeError;
    plan.live = rec.live;
    plan.neighborCount = rec.neighborCount;
    plan.usedSpatialHash = director.lastCost.usedSpatialHash;
    plan.queryMode = director.lastCost.queryMode;
    plan.reason = `fodder_cohort:${cohort.recipeId}:${cohort.phase}`;
    director.byEntity.set(rec.id, { cohortId: cohort.id, plan });
  }
}

function snapshotCohort(cohort) {
  const members = {};
  for (const [id, rec] of cohort.members) {
    members[String(id)] = {
      lane: rec.lane,
      along: rec.along,
      phase: cohort.phase,
      disrupted: rec.disrupted,
      coast: rec.coast,
      slotError: rec.slotError,
      shapeError: rec.shapeError,
      neighborCount: rec.neighborCount,
    };
  }
  return {
    id: cohort.id,
    recipeId: cohort.recipeId,
    shape: cohort.shape,
    phase: cohort.phase,
    integrity: cohort.integrity,
    integrityMin: cohort.integrityMin,
    heading: cohort.heading,
    disruption: { count: cohort.disruption.count, until: cohort.disruption.until },
    cost: { ...cohort.lastCost },
    members,
  };
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
