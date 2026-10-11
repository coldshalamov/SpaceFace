// Reactive-matter world. Material state lives here. Positions change only when
// a caller (the witness, or later Rapier) applies the impulses step() returns.

import { mulberry32, mulberry32FromContinuation } from '../../core/rng.js';
import {
  REACTIVE_BUDGETS,
  REACTIVE_SCHEMA,
} from '../../data/reactiveMatter/budgets.js';
import { modelById } from '../../data/reactiveMatter/models.js';
import { emptyLaws } from '../../data/reactiveMatter/families.js';

const BUDGET = REACTIVE_BUDGETS;

export function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function byId(a, b) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function noteLost(world, id) {
  if (id == null) return;
  const key = String(id);
  if (world.lostIds.length < 32 && !world.lostIds.includes(key)) world.lostIds.push(key);
}

export function createReactiveWorld({ seed = 1, tick = 0 } = {}) {
  const seed0 = (seed >>> 0) || 1;
  return {
    schema: REACTIVE_SCHEMA,
    seed: seed0,
    tick: tick | 0,
    simTime: 0,
    bodies: new Map(),
    machines: new Map(),
    hitches: new Map(),
    fields: [],
    salvage: new Map(),
    terminal: new Map(),
    reactionLog: [],
    deferred: [],
    lostIds: [],
    chemicalInjected: 0,
    dissipatedImpulse: 0,
    creditsGranted: 0,
    reactionCount: 0,
    destroyed: false,
    rng: mulberry32(seed0),
    playerBudget: { lastTick: 0, samples: [] },
  };
}

function lawsFromModel(model) {
  return {
    ferromagnetic: model.laws.ferromagnetic === true,
    volatile: model.laws.volatile === true,
    brittle: model.laws.brittle === true,
    elastic: model.laws.elastic === true,
  };
}

function clampSpeed(vx, vz, cap) {
  const v = Math.hypot(vx, vz);
  if (!(v > cap) || v === 0) return { vx, vz };
  const s = cap / v;
  return { vx: vx * s, vz: vz * s };
}

/**
 * Spawn one instance from a frozen model. Duplicate ids are rejected.
 * A terminal id cannot return to intact.
 */
export function spawnReactiveBody(world, spec) {
  if (!world || world.destroyed) throw new Error('reactive world is destroyed');
  if (!spec || typeof spec.id !== 'string' || spec.id.length === 0) return null;
  if (world.bodies.has(spec.id)) return null;
  const model = modelById(spec.modelId);
  if (!model) {
    noteLost(world, spec.id);
    return null;
  }
  if (world.bodies.size >= BUDGET.maxBodies) return null;
  const speed = clampSpeed(finite(spec.vx), finite(spec.vz), BUDGET.speedCap);
  let mass = model.mass;
  let radius = model.radius;
  // Saved or derived mass may shrink (a spent shell, a shard). It may not grow
  // past the catalog mass unless the model is a runtime fragment.
  if (Number.isFinite(Number(spec.mass)) && Number(spec.mass) > 0) {
    mass = model.derived
      ? clamp(finite(spec.mass), 0.25, 80)
      : clamp(finite(spec.mass), 0.25, model.mass);
  }
  if (Number.isFinite(Number(spec.radius))) {
    radius = model.derived
      ? clamp(finite(spec.radius), 0.2, 40)
      : clamp(finite(spec.radius), 0, model.radius);
  }
  const terminalPhase = world.terminal.get(spec.id) || null;
  let phase = 'intact';
  if (spec.role === 'shard' || model.role === 'shard') phase = 'shard';
  if (spec.phase === 'spent' || spec.phase === 'fractured' || spec.phase === 'shard') phase = spec.phase;
  if (terminalPhase === 'spent' || terminalPhase === 'fractured') phase = terminalPhase;
  const body = {
    id: spec.id,
    modelId: model.id,
    role: spec.role || model.role,
    laws: lawsFromModel(model),
    marker: model.marker,
    x: finite(spec.x),
    z: finite(spec.z),
    y: 0,
    vx: speed.vx,
    vz: speed.vz,
    mass,
    radius: phase === 'fractured' ? 0 : radius,
    heat: clamp(finite(spec.heat), 0, BUDGET.heatCap),
    integrity: phase === 'intact' || phase === 'shard' ? 1 : 0,
    stored: 0,
    pressNx: 1,
    pressNz: 0,
    partnerId: null,
    phase,
    parentId: spec.parentId || null,
    generation: spec.generation | 0,
    hitchable: model.hitchable && phase !== 'fractured',
    collides: phase !== 'fractured',
    solid: model.solid && phase !== 'fractured',
    anchored: spec.anchored === true || model.anchored === true,
    isPlayer: spec.isPlayer === true,
    susceptibility: model.susceptibility,
    salvageId: null,
    age: 0,
    shardSpread: model.shardSpread,
    spawnRadius: radius,
  };
  if (body.laws.elastic) {
    body.stored = clamp(finite(spec.stored), 0, BUDGET.elasticMaxStored);
  }
  world.bodies.set(body.id, body);
  return body;
}

export function addMachine(world, spec) {
  if (!world || world.destroyed) throw new Error('reactive world is destroyed');
  if (!spec || typeof spec.id !== 'string') return null;
  if (world.machines.has(spec.id)) return null;
  if (world.machines.size >= BUDGET.maxMachines) return null;
  const machine = {
    id: spec.id,
    x: finite(spec.x),
    z: finite(spec.z),
    y: 0,
    strength: Math.max(0, finite(spec.strength)),
    fieldRadius: Math.max(1, finite(spec.fieldRadius, 20)),
    polarity: finite(spec.polarity, 1) >= 0 ? 1 : -1,
    anchored: spec.anchored !== false,
    bodyId: spec.bodyId || null,
    flipEvery: Math.max(0, spec.flipEvery | 0),
    enabled: spec.enabled !== false,
    marker: 'machine',
  };
  world.machines.set(machine.id, machine);
  return machine;
}

export function addHitch(world, spec) {
  if (!spec || typeof spec.id !== 'string') return null;
  if (world.hitches.has(spec.id)) return null;
  const owner = world.bodies.get(spec.ownerId);
  const target = world.bodies.get(spec.targetId);
  if (!owner || !target) {
    noteLost(world, !owner ? spec.ownerId : spec.targetId);
    return null;
  }
  const hitch = {
    id: spec.id,
    ownerId: spec.ownerId,
    targetId: spec.targetId,
    rest: Math.max(1, finite(spec.rest, 20)),
    lugLocalX: finite(spec.lugLocalX),
    lugLocalZ: finite(spec.lugLocalZ),
    alive: spec.alive !== false,
    overload: 0,
    broken: null,
  };
  world.hitches.set(hitch.id, hitch);
  return hitch;
}

export function debrisCount(world) {
  let n = 0;
  for (const body of world.bodies.values()) {
    if (body.role === 'debris' || body.role === 'shard') n += 1;
  }
  return n;
}

export function markTerminal(world, id, phase) {
  if (world.terminal.size >= BUDGET.maxTerminal && !world.terminal.has(id)) return;
  world.terminal.set(id, phase);
}

export function pushReaction(world, entry) {
  world.reactionCount += 1;
  world.reactionLog.push(entry);
  if (world.reactionLog.length > BUDGET.maxEventLog) {
    world.reactionLog.splice(0, world.reactionLog.length - BUDGET.maxEventLog);
  }
}

export function mintSalvage(world, salvageId, bodyId) {
  if (!salvageId || world.salvage.has(salvageId)) return world.salvage.get(salvageId) || null;
  const row = { id: salvageId, bodyId, claimed: false, credits: 0 };
  world.salvage.set(salvageId, row);
  const body = world.bodies.get(bodyId);
  if (body) body.salvageId = salvageId;
  return row;
}

/** Claiming never grants credits. A second claim is a duplicate. */
export function claimReactiveSalvage(world, salvageId) {
  const row = world.salvage.get(salvageId);
  if (!row) return { ok: false, credits: 0, reason: 'missing', intent: null };
  if (row.claimed) return { ok: false, credits: 0, reason: 'duplicate', intent: null };
  row.claimed = true;
  row.credits = 0;
  world.creditsGranted = 0;
  return { ok: true, credits: 0, reason: 'claimed', intent: null };
}

export function reapReactiveWorld(world) {
  const doomed = [];
  for (const body of world.bodies.values()) {
    const reapable = body.role === 'debris' || body.role === 'shard' || body.phase === 'spent';
    if (reapable && body.age >= BUDGET.reapAge) doomed.push(body.id);
  }
  doomed.sort();
  let debris = debrisCount(world);
  if (debris > BUDGET.maxDebrisAlive) {
    const extra = [];
    for (const body of world.bodies.values()) {
      if (body.role === 'debris' || body.role === 'shard') extra.push(body);
    }
    extra.sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
    for (let i = 0; i < extra.length && debris > BUDGET.maxDebrisAlive; i++) {
      if (!doomed.includes(extra[i].id)) doomed.push(extra[i].id);
      debris -= 1;
    }
  }
  for (let i = 0; i < doomed.length; i++) world.bodies.delete(doomed[i]);
  return doomed;
}

export function destroyReactiveWorld(world) {
  world.bodies.clear();
  world.machines.clear();
  world.hitches.clear();
  world.fields = [];
  world.salvage.clear();
  world.deferred = [];
  world.destroyed = true;
  world.rng = null;
}

function slimBody(body) {
  return {
    id: body.id,
    modelId: body.modelId,
    role: body.role,
    x: body.x,
    z: body.z,
    y: 0,
    vx: body.vx,
    vz: body.vz,
    mass: body.mass,
    radius: body.radius,
    heat: body.heat,
    integrity: body.integrity,
    stored: body.stored,
    pressNx: body.pressNx,
    pressNz: body.pressNz,
    partnerId: body.partnerId,
    phase: body.phase,
    parentId: body.parentId,
    generation: body.generation,
    anchored: body.anchored,
    isPlayer: body.isPlayer,
    salvageId: body.salvageId,
    age: body.age,
  };
}

export function saveReactiveWorld(world) {
  const bodies = [...world.bodies.values()].sort(byId).slice(0, BUDGET.maxSaveBodies).map(slimBody);
  const machines = [...world.machines.values()].sort(byId).map((m) => ({
    id: m.id,
    x: m.x,
    z: m.z,
    strength: m.strength,
    fieldRadius: m.fieldRadius,
    polarity: m.polarity,
    anchored: m.anchored,
    bodyId: m.bodyId,
    flipEvery: m.flipEvery,
    enabled: m.enabled,
  }));
  const hitches = [...world.hitches.values()].sort(byId).map((h) => ({
    id: h.id,
    ownerId: h.ownerId,
    targetId: h.targetId,
    rest: h.rest,
    lugLocalX: h.lugLocalX,
    lugLocalZ: h.lugLocalZ,
    alive: h.alive,
    overload: h.overload,
    broken: h.broken,
  }));
  const terminal = [...world.terminal.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, BUDGET.maxTerminal)
    .map(([id, phase]) => ({ id, phase }));
  const salvage = [...world.salvage.values()]
    .sort(byId)
    .map((row) => ({ id: row.id, bodyId: row.bodyId, claimed: row.claimed === true }));
  return {
    schema: REACTIVE_SCHEMA,
    seed: world.seed,
    tick: world.tick,
    simTime: world.simTime,
    rng: world.rng ? world.rng.getState() : null,
    bodies,
    machines,
    hitches,
    fields: world.fields.map((f) => ({ ...f })),
    salvage,
    terminal,
    reactionLog: world.reactionLog.slice(-BUDGET.maxEventLog),
    chemicalInjected: world.chemicalInjected,
    dissipatedImpulse: world.dissipatedImpulse,
    creditsGranted: 0,
    reactionCount: world.reactionCount,
    playerBudget: {
      lastTick: world.playerBudget.lastTick | 0,
      samples: world.playerBudget.samples.slice(-30).map((sample) => ({
        tick: sample.tick | 0,
        dv: sample.dv,
        continuous: sample.continuous === true,
      })),
    },
  };
}

export function loadReactiveWorld(data) {
  const world = createReactiveWorld({ seed: data && data.seed });
  if (!data || data.schema !== REACTIVE_SCHEMA) {
    noteLost(world, 'schema');
    return world;
  }
  world.tick = data.tick | 0;
  world.simTime = finite(data.simTime);
  world.chemicalInjected = finite(data.chemicalInjected);
  world.dissipatedImpulse = finite(data.dissipatedImpulse);
  world.creditsGranted = 0;
  world.reactionCount = data.reactionCount | 0;
  if (data.rng) world.rng = mulberry32FromContinuation(data.rng);
  for (const row of data.terminal || []) {
    if (row && (row.phase === 'spent' || row.phase === 'fractured')) markTerminal(world, row.id, row.phase);
  }
  const seen = new Set();
  for (const row of data.bodies || []) {
    if (!row || seen.has(row.id)) {
      noteLost(world, row && row.id);
      continue;
    }
    seen.add(row.id);
    const model = modelById(row.modelId);
    if (!model) {
      noteLost(world, row.id);
      continue;
    }
    const body = spawnReactiveBody(world, {
      ...row,
      runtime: model.derived === true,
      phase: world.terminal.has(row.id) ? world.terminal.get(row.id) : row.phase,
    });
    if (!body) continue;
    if (world.terminal.has(row.id)) body.phase = world.terminal.get(row.id);
    if (body.phase === 'fractured') {
      body.radius = 0;
      body.mass = 0;
      body.collides = false;
      body.solid = false;
      body.vx = 0;
      body.vz = 0;
    }
    body.age = Math.max(0, row.age | 0);
    body.heat = clamp(finite(row.heat), 0, BUDGET.heatCap);
    if (body.laws.elastic) body.stored = clamp(finite(row.stored), 0, BUDGET.elasticMaxStored);
    else body.stored = 0;
    body.pressNx = finite(row.pressNx, 1) || 1;
    body.pressNz = finite(row.pressNz, 0);
    body.partnerId = row.partnerId || null;
  }
  for (const row of data.machines || []) addMachine(world, row);
  world.fields = (data.fields || []).map((f) => ({
    id: f.id,
    kind: f.kind,
    x: finite(f.x),
    z: finite(f.z),
    radius: Math.max(0, finite(f.radius)),
    heatPerSec: finite(f.heatPerSec),
  }));
  for (const row of data.hitches || []) {
    const hitch = addHitch(world, row);
    if (!hitch) noteLost(world, row && row.targetId);
    else {
      hitch.alive = row.alive !== false;
      hitch.overload = row.overload | 0;
      hitch.broken = row.broken || null;
      if (!world.bodies.has(hitch.targetId) || !world.bodies.has(hitch.ownerId)) {
        hitch.alive = false;
        hitch.broken = 'lost-id';
        noteLost(world, hitch.targetId);
      }
    }
  }
  for (const row of data.salvage || []) {
    if (!row || world.salvage.has(row.id)) continue;
    world.salvage.set(row.id, {
      id: row.id,
      bodyId: row.bodyId,
      claimed: row.claimed === true,
      credits: 0,
    });
    const body = world.bodies.get(row.bodyId);
    if (body && !body.salvageId) body.salvageId = row.id;
  }
  world.reactionLog = (data.reactionLog || []).slice(-BUDGET.maxEventLog);
  const budget = data.playerBudget || {};
  world.playerBudget = {
    lastTick: budget.lastTick | 0,
    samples: (budget.samples || []).slice(-30).map((sample) => ({
      tick: sample.tick | 0,
      dv: finite(sample.dv),
      continuous: sample.continuous === true,
    })),
  };
  return world;
}

export function reactiveSnapshot(world) {
  return {
    tick: world.tick,
    simTime: world.simTime,
    rng: world.rng ? world.rng.getState() : null,
    bodies: [...world.bodies.values()].sort(byId).map(slimBody),
    hitches: [...world.hitches.values()].sort(byId).map((h) => ({
      id: h.id,
      targetId: h.targetId,
      alive: h.alive,
      rest: h.rest,
      broken: h.broken,
    })),
    machines: [...world.machines.values()].sort(byId).map((m) => ({
      id: m.id,
      polarity: m.polarity,
      x: m.x,
      z: m.z,
    })),
    terminal: [...world.terminal.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    salvage: [...world.salvage.values()].sort(byId).map((row) => ({
      id: row.id,
      claimed: row.claimed,
      credits: row.credits,
    })),
    chemicalInjected: world.chemicalInjected,
    dissipatedImpulse: world.dissipatedImpulse,
    creditsGranted: world.creditsGranted,
    reactionCount: world.reactionCount,
    lostIds: [...world.lostIds],
  };
}

export function bodyHasLaws(body) {
  const laws = body && body.laws ? body.laws : emptyLaws();
  return laws.ferromagnetic || laws.volatile || laws.brittle || laws.elastic;
}

export function worldHasLaws(world) {
  for (const body of world.bodies.values()) {
    if (bodyHasLaws(body)) return true;
  }
  return false;
}
