// Acceptance witness. This is not a second physics engine and it is not registered.
// Rapier stays the integrator in the live game (see ADAPTER.md). The witness
// applies the impulses this module already computed, with the same player
// external budget the physics membrane uses, so fixed-seed scenes can be scored.

import { PLAYER_EXTERNAL_RESPONSE } from '../../core/physicalResponse.js';
import { DEFAULT_MASSLINE_DEF } from '../../core/constraints/masslineController.js';
import { REACTIVE_BUDGETS, REACTIVE_DT } from '../../data/reactiveMatter/budgets.js';
import { configurationById, REACTIVE_CONFIGURATION_IDS } from '../../data/reactiveMatter/configurations.js';
import { stepReactiveMatter } from './step.js';
import {
  addHitch,
  addMachine,
  byId,
  clamp,
  createReactiveWorld,
  finite,
  reactiveSnapshot,
  spawnReactiveBody,
} from './world.js';

const THRUST_ACCEL = 40;
const HITCH_K = 900;
const HITCH_MAX = DEFAULT_MASSLINE_DEF.maxImpulse;
const REEL_SPEED = DEFAULT_MASSLINE_DEF.reelInSpeed;
const REST_MIN = DEFAULT_MASSLINE_DEF.minLength;
const REST_MAX = DEFAULT_MASSLINE_DEF.maxLength;
const OVERLOAD_TICKS = 18;

export function tapeAt(segments, tick) {
  const tape = { thrust: 0, heading: 0, reel: 0, brake: 0, cut: false };
  const rows = segments || [];
  for (let i = 0; i < rows.length; i++) {
    const seg = rows[i];
    if (tick < seg.from || tick >= seg.to) continue;
    if (seg.thrust != null) tape.thrust = seg.thrust;
    if (seg.heading != null) tape.heading = seg.heading;
    if (seg.reel != null) tape.reel = seg.reel;
    if (seg.brake != null) tape.brake = seg.brake;
    if (seg.cut) tape.cut = true;
  }
  return tape;
}

export function measureContacts(world) {
  const list = [...world.bodies.values()]
    .filter((body) => body.collides && body.radius > 0 && body.mass > 0)
    .sort(byId);
  const out = [];
  const cap = REACTIVE_BUDGETS.maxContactsPerTick;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > a.radius + b.radius) continue;
      const nx = dist > 1e-8 ? dx / dist : 1;
      const nz = dist > 1e-8 ? dz / dist : 0;
      const relN = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      out.push({
        aId: a.id,
        bId: b.id,
        nx,
        nz,
        closingSpeed: relN < 0 ? -relN : 0,
        pointX: a.x + nx * a.radius,
        pointZ: a.z + nz * a.radius,
      });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

export function admitExternalImpulse(world, body, jx, jz, dt, continuous) {
  const response = PLAYER_EXTERNAL_RESPONSE;
  const rawDv = Math.hypot(jx, jz) / Math.max(0.1, body.mass);
  const tick = world.tick;
  if (!world.playerBudget || tick < world.playerBudget.lastTick) {
    world.playerBudget = { lastTick: tick, samples: [] };
  }
  const book = world.playerBudget;
  book.lastTick = tick;
  book.samples = book.samples.filter((sample) => sample.tick > tick - response.windowTicks);
  const used = book.samples.reduce((sum, sample) => sum + sample.dv, 0);
  const tickContinuous = book.samples
    .filter((sample) => sample.tick === tick && sample.continuous)
    .reduce((sum, sample) => sum + sample.dv, 0);
  const continuousCap = continuous
    ? Math.max(0, response.maxAcceleration * dt - tickContinuous)
    : Infinity;
  const accepted = Math.min(
    rawDv * response.scale,
    continuousCap,
    Math.max(0, response.impulseBudget - used),
  );
  const scale = rawDv > 0 ? accepted / rawDv : 0;
  if (accepted > 0) book.samples.push({ tick, dv: accepted, continuous: continuous === true });
  return { jx: jx * scale, jz: jz * scale, accepted, rawDv };
}

export function applyReactiveImpulses(world, impulses, dt) {
  for (let i = 0; i < impulses.length; i++) {
    const impulse = impulses[i];
    const body = world.bodies.get(impulse.bodyId);
    if (!body) continue;
    let jx = finite(impulse.jx);
    let jz = finite(impulse.jz);
    if (!Number.isFinite(jx) || !Number.isFinite(jz)) continue;
    const other = impulse.otherId ? world.bodies.get(impulse.otherId) : null;
    const player = body.isPlayer ? body : (other && other.isPlayer ? other : null);
    let scale = 1;
    if (player && impulse.externalEffect) {
      const sign = body.isPlayer ? 1 : -1;
      const admitted = admitExternalImpulse(world, player, jx * sign, jz * sign, dt, impulse.continuous === true);
      const raw = Math.hypot(jx, jz);
      const got = Math.hypot(admitted.jx, admitted.jz);
      scale = raw > 1e-8 ? got / raw : 0;
      jx *= scale;
      jz *= scale;
    }
    if (impulse.storeId && impulse.storeJ > 0 && scale < 1) {
      const store = world.bodies.get(impulse.storeId);
      if (store) store.stored = Math.max(0, store.stored - impulse.storeJ * (1 - scale));
    }
    if (!body.anchored && body.mass > 0) {
      body.vx += jx / body.mass;
      body.vz += jz / body.mass;
    } else if (impulse.anchorId) {
      pushRecoil(world, impulse.anchorId, -jx, -jz);
    }
    if (other && !other.anchored && other.mass > 0) {
      other.vx -= jx / other.mass;
      other.vz -= jz / other.mass;
    } else if (impulse.anchorId && other == null && !body.anchored) {
      pushRecoil(world, impulse.anchorId, -jx, -jz);
    }
    body.y = 0;
  }
}

function pushRecoil(world, id, jx, jz) {
  if (!world.anchorRecoil) world.anchorRecoil = [];
  world.anchorRecoil.push({ id, jx, jz, tick: world.tick });
  if (world.anchorRecoil.length > 64) world.anchorRecoil.splice(0, world.anchorRecoil.length - 64);
}

export function applyHitches(world, dt) {
  const hitches = [...world.hitches.values()].sort(byId);
  for (let i = 0; i < hitches.length; i++) {
    const hitch = hitches[i];
    if (!hitch.alive) continue;
    const owner = world.bodies.get(hitch.ownerId);
    const target = world.bodies.get(hitch.targetId);
    if (!owner || !target || target.phase === 'fractured' || !(target.mass > 0)) {
      hitch.alive = false;
      hitch.broken = hitch.broken || 'lost-id';
      continue;
    }
    const tx = target.x + hitch.lugLocalX;
    const tz = target.z + hitch.lugLocalZ;
    const dx = tx - owner.x;
    const dz = tz - owner.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / dist;
    const nz = dz / dist;
    const err = dist - hitch.rest;
    const unclamped = err * HITCH_K * dt;
    const j = clamp(unclamped, -HITCH_MAX, HITCH_MAX);
    if (!owner.anchored && owner.mass > 0) {
      owner.vx += (nx * j) / owner.mass;
      owner.vz += (nz * j) / owner.mass;
    }
    if (!target.anchored && target.mass > 0) {
      target.vx -= (nx * j) / target.mass;
      target.vz -= (nz * j) / target.mass;
    }
    if (Math.abs(unclamped) > HITCH_MAX) {
      hitch.overload += 1;
      if (hitch.overload >= OVERLOAD_TICKS) {
        hitch.alive = false;
        hitch.broken = 'overload';
      }
    } else hitch.overload = 0;
  }
}

export function integrateWitness(world, dt) {
  for (const body of world.bodies.values()) {
    if (body.anchored || !(body.mass > 0) || body.phase === 'fractured') continue;
    const cap = body.isPlayer ? REACTIVE_BUDGETS.playerWitnessSpeed : REACTIVE_BUDGETS.speedCap;
    const v = Math.hypot(body.vx, body.vz);
    if (v > cap) {
      const s = cap / v;
      body.vx *= s;
      body.vz *= s;
    }
    body.x += body.vx * dt;
    body.z += body.vz * dt;
    body.y = 0;
  }
}

function killClosing(a, b, nx, nz) {
  if (!(a.mass > 0) || !(b.mass > 0) || a.anchored || b.anchored) return;
  const relN = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (!(relN < 0)) return;
  const invA = 1 / a.mass;
  const invB = 1 / b.mass;
  const j = -relN / (invA + invB);
  a.vx -= j * invA * nx;
  a.vz -= j * invA * nz;
  b.vx += j * invB * nx;
  b.vz += j * invB * nz;
}

export function separateSolids(world) {
  const list = [...world.bodies.values()]
    .filter((body) => body.solid && body.collides && body.radius > 0 && body.phase !== 'fractured')
    .sort(byId);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (dist >= min) continue;
        if (dist < 1e-8) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = min - dist;
        const elastic = a.laws.elastic || b.laws.elastic;
        if (a.anchored && b.anchored) continue;
        if (a.anchored) {
          b.x += nx * pen;
          b.z += nz * pen;
          if (!elastic) killClosing(b, { mass: 1e9, vx: 0, vz: 0, anchored: false }, nx, nz);
        } else if (b.anchored) {
          a.x -= nx * pen;
          a.z -= nz * pen;
          if (!elastic) killClosing(a, { mass: 1e9, vx: 0, vz: 0, anchored: false }, -nx, -nz);
        } else {
          a.x -= nx * pen * 0.5;
          a.z -= nz * pen * 0.5;
          b.x += nx * pen * 0.5;
          b.z += nz * pen * 0.5;
          if (!elastic) killClosing(a, b, nx, nz);
        }
      }
    }
  }
}

function applyControl(world, dt) {
  const demo = world.demo;
  if (!demo) return;
  const tape = tapeAt(demo.tape, world.tick);
  const player = world.bodies.get('player');
  if (player && !player.anchored) {
    if (tape.thrust > 0) {
      player.vx += Math.cos(tape.heading) * THRUST_ACCEL * tape.thrust * dt;
      player.vz += Math.sin(tape.heading) * THRUST_ACCEL * tape.thrust * dt;
    }
    if (tape.brake > 0) {
      const damp = Math.exp(-3 * tape.brake * dt);
      player.vx *= damp;
      player.vz *= damp;
    }
  }
  if (tape.cut) {
    for (const hitch of world.hitches.values()) {
      if (hitch.ownerId === 'player' && hitch.alive) {
        hitch.alive = false;
        hitch.broken = 'cut';
      }
    }
  }
  if (tape.reel) {
    for (const hitch of world.hitches.values()) {
      if (!hitch.alive || hitch.ownerId !== 'player') continue;
      hitch.rest = clamp(hitch.rest - tape.reel * REEL_SPEED * dt, REST_MIN, REST_MAX);
    }
  }
}

export function witnessTick(world, opts = {}) {
  const dt = opts.dt == null ? REACTIVE_DT : opts.dt;
  if (opts.control !== false) applyControl(world, dt);
  // Move first so an approach is actually overlapping when contacts are read.
  // Impulses change velocity for the next move. Depenetration happens after the laws.
  if (opts.integrate !== false) integrateWitness(world, dt);
  const contacts = opts.contacts || measureContacts(world);
  const result = stepReactiveMatter(world, { dt, contacts });
  applyReactiveImpulses(world, result.impulses, result.dt);
  for (let i = 0; i < result.anchorRecoil.length; i++) {
    const recoil = result.anchorRecoil[i];
    pushRecoil(world, recoil.machineId, recoil.jx, recoil.jz);
  }
  if (opts.hitch !== false) applyHitches(world, result.dt);
  if (opts.separate !== false) separateSolids(world);
  return result;
}

export function instantiateConfiguration(id, opts = {}) {
  const spec = configurationById(id);
  const world = createReactiveWorld({ seed: opts.seed == null ? spec.seed : opts.seed });
  world.demo = {
    id: spec.id,
    tape: opts.tape === 'idle' ? [] : (opts.segments || spec.tape),
  };
  for (let i = 0; i < spec.machines.length; i++) addMachine(world, spec.machines[i]);
  for (let i = 0; i < spec.bodies.length; i++) spawnReactiveBody(world, spec.bodies[i]);
  for (let i = 0; i < spec.hitches.length; i++) addHitch(world, spec.hitches[i]);
  world.fields = spec.fields.map((field) => ({ ...field }));
  return world;
}

function slimSample(world, result) {
  const bodies = [];
  for (const body of world.bodies.values()) {
    bodies.push({
      id: body.id,
      x: body.x,
      z: body.z,
      vx: body.vx,
      vz: body.vz,
      phase: body.phase,
      heat: body.heat,
      stored: body.stored,
      radius: body.radius,
      mass: body.mass,
    });
  }
  bodies.sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    tick: world.tick,
    reactions: result.reactions.length,
    bodies,
  };
}

export function runConfiguration(id, opts = {}) {
  const spec = configurationById(id);
  const world = instantiateConfiguration(id, opts);
  const ticks = opts.ticks == null ? spec.ticks : opts.ticks;
  const samples = [];
  const cues = [];
  let lawEvals = 0;
  let maxReactions = 0;
  const peakStored = {};
  for (let i = 0; i < ticks; i++) {
    const result = witnessTick(world, opts.witness || {});
    lawEvals += result.lawEvals;
    if (result.reactions.length > maxReactions) maxReactions = result.reactions.length;
    for (let c = 0; c < result.cues.length; c++) cues.push(result.cues[c]);
    for (const body of world.bodies.values()) {
      peakStored[body.id] = Math.max(peakStored[body.id] || 0, body.stored);
    }
    samples.push(slimSample(world, result));
  }
  return {
    id,
    kind: spec.kind,
    crosses: spec.crosses,
    families: spec.families,
    world,
    samples,
    cues,
    lawEvals,
    maxReactions,
    peakStored,
    creditsGranted: world.creditsGranted,
    chemicalInjected: world.chemicalInjected,
    reactionCount: world.reactionCount,
    snapshot: reactiveSnapshot(world),
  };
}

export function listConfigurationIds() {
  return REACTIVE_CONFIGURATION_IDS;
}

export function probeSolid(world, x, z) {
  let hit = null;
  for (const body of world.bodies.values()) {
    if (!body.solid || !(body.radius > 0) || body.phase === 'fractured') continue;
    if (Math.hypot(body.x - x, body.z - z) <= body.radius) hit = body.id;
  }
  return hit;
}

function buildCrowded(live) {
  const world = createReactiveWorld({ seed: 11 });
  for (let m = 0; m < 8; m++) {
    addMachine(world, {
      id: `m${m}`,
      x: (m - 3.5) * 12,
      z: 0,
      strength: 400,
      fieldRadius: 18,
      polarity: 1,
      anchored: true,
    });
  }
  for (let i = 0; i < 48; i++) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    spawnReactiveBody(world, {
      id: `b${i}`,
      modelId: live ? 'ferro_crate' : 'inert_puck',
      x: (col - 3.5) * 12,
      z: 8 + row * 6,
    });
  }
  return world;
}

export function benchCrowded(ticks = 120) {
  const live = buildCrowded(true);
  const inert = buildCrowded(false);
  const t0 = performance.now();
  let liveEvals = 0;
  for (let i = 0; i < ticks; i++) liveEvals += witnessTick(live).lawEvals;
  const liveMs = performance.now() - t0;
  const t1 = performance.now();
  let inertEvals = 0;
  for (let i = 0; i < ticks; i++) inertEvals += witnessTick(inert).lawEvals;
  const inertMs = performance.now() - t1;
  return {
    ticks,
    bodies: 48,
    machines: 8,
    liveEvals,
    inertEvals,
    liveMs,
    inertMs,
    expectedLiveEvals: 48 * 8 * ticks,
  };
}

export { PLAYER_EXTERNAL_RESPONSE, DEFAULT_MASSLINE_DEF, HITCH_MAX, REEL_SPEED };
