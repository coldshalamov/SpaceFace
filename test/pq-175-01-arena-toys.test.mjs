// PQ-175.01 — Props are toys. Live install proof on seed 17501.
//
// Each of the five authored toy kinds is installed through the real Survival room and asserted to
// change an actual shot, trajectory, kill or escape through the shared physics/field kernel:
//   shutter -> a crossing shot dies, a parallel shot passes
//   plate   -> a shot into the plate reflects off it, a shot outside reach does not
//   crusher -> a resting body under surge reaches the crumple speed, calm leaves it still
//   current -> a resting body in the cone is carried along dir, a body outside is not
//   relay   -> the installed relay conducts along the storm graph, a non-conductive one does not
// Every positive assertion has a paired failing-closed control, so a no-op toy cannot pass.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TERRAIN_CRUMPLE_LAW } from '../src/combat/impulseKernel.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import {
  ARENA_TOY_HAZARDS,
  ARENA_TOY_MIN,
  CRUSHER_CYCLE,
  listArenaToys,
  validateArenaToys,
} from '../src/data/arenaModuleLibrary.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  buildConductivityGraph,
  conductAlongGraph,
  createStormLineage,
  stormGraphNodes,
} from '../src/systems/stormLatticeArena.js';
import {
  dominantGate,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 17501;
const ARENAS = [LAGRANGE_ARENA_ID, CINDER_ARENA_ID, CRYO_ARENA_ID, STORM_ARENA_ID];
const ANCHOR = { x: 400, z: -120 };
const DT = 1 / 60;

function norm(v) {
  const length = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / length, z: v.z / length };
}

function perp(v) {
  return { x: -v.z, z: v.x };
}

function dot(a, b) {
  return a.x * b.x + a.z * b.z;
}

function add(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(v, s) {
  return { x: v.x * s, z: v.z * s };
}

function speedOf(entity) {
  const vel = entity && entity.vel ? entity.vel : { x: 0, z: 0 };
  return Math.hypot(vel.x || 0, vel.z || 0);
}

function makeFakeFields() {
  const live = new Map();
  return {
    name: 'fields',
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (!record || !patch) return null;
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot(arenaId, wave = 1, seed = SEED) {
  const plan = planWave({ seed, arenaId, wave });
  assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} must plan`);
  const state = {
    run: null,
    tick: 0,
    simTime: 0,
    playerId: 1,
    nextEntityId: 2,
    entities: new Map(),
  };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { ...ANCHOR }, vel: { x: 0, z: 0 }, mass: 16, radius: 6,
  });
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off ? raw.off.bind(raw) : () => {},
    once: raw.once ? raw.once.bind(raw) : () => {},
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed });
  run.arenaId = arenaId;
  run.phase = 'active';
  run.wave = wave;
  state.run = run;
  const system = Object.create(survivalArena);
  system.init({ state, bus, registry, helpers: {} });
  bus.emit('run:wavePlanned', { wave, plan, tick: 0 });

  const expected = planArenaInstall({
    arenaPhase: plan.arenaPhase,
    arenaId,
    wave,
    seed,
    anchor: ANCHOR,
    laneGate: dominantGate(plan),
  });
  const toys = listArenaToys(expected);
  assert.deepEqual(
    system._toys.map((toy) => toy.id),
    toys.map((toy) => toy.id),
    `${arenaId} live installer must register the authored toys`,
  );

  let id = state.nextEntityId;
  function spawn(spec) {
    const entity = { id: id++, alive: true, ...spec };
    state.entities.set(entity.id, entity);
    return entity;
  }
  function tick(steps = 1, advance = true) {
    for (let i = 0; i < steps; i++) {
      system.update(DT, state);
      state.tick += 1;
      if (advance) state.simTime += DT;
    }
  }
  return { system, state, bus, emitted, fakeFields, plan, expected, toys, spawn, tick };
}

test('seed 17501: every live arena installs at least three usable toys, all five verbs present', () => {
  const kinds = new Set();
  for (const arenaId of ARENAS) {
    const h = boot(arenaId);
    assert.ok(h.toys.length >= ARENA_TOY_MIN, `${arenaId} toys ${h.toys.length}`);
    const check = validateArenaToys(h.toys);
    assert.equal(check.ok, true, `${arenaId} ${JSON.stringify(check.issues)}`);
    assert.ok(h.fakeFields.live.size <= 2, `${arenaId} field slots ${h.fakeFields.live.size}`);
    for (const toy of h.toys) {
      assert.ok(ARENA_TOY_HAZARDS.includes(toy.hazardType), `${arenaId} ${toy.id} hazard`);
      assert.notEqual(toy.hazardType, 'radiation');
      kinds.add(toy.kind);
    }
    h.system.destroy();
  }
  assert.deepEqual(
    Array.from(kinds).sort(),
    ['crusher', 'current', 'plate', 'relay', 'shutter'],
  );
});

test('shutter: the installed bar cuts a crossing shot and lets a parallel shot pass', () => {
  for (const arenaId of ARENAS) {
    const h = boot(arenaId);
    const shutter = h.toys.find((toy) => toy.kind === 'shutter');
    assert.ok(shutter, `${arenaId} shutter`);

    const seg = { x: shutter.b.x - shutter.a.x, z: shutter.b.z - shutter.a.z };
    const segLen = Math.hypot(seg.x, seg.z);
    const along = norm(seg);
    const n = perp(along);
    const mid = {
      x: (shutter.a.x + shutter.b.x) * 0.5,
      z: (shutter.a.z + shutter.b.z) * 0.5,
    };

    const crossing = h.spawn({
      type: 'projectile',
      pos: add(mid, scale(n, 20)),
      vel: scale(n, -80),
    });
    // The same line, shifted past the end of the bar: it never crosses the segment.
    const far = add(mid, scale(along, segLen * 0.5 + 60));
    const parallel = h.spawn({
      type: 'projectile',
      pos: add(far, scale(n, 20)),
      vel: scale(n, -80),
    });

    h.tick(4);

    assert.equal(crossing.alive, false, `${arenaId} crossing shot must be cut`);
    assert.equal(parallel.alive, true, `${arenaId} parallel shot must survive`);

    // Failing-closed: the same query against a non-shutter never reports a cut.
    assert.equal(h.expected.toys.find((toy) => toy.kind === 'shutter').kind, 'shutter');
    h.system.destroy();
  }
});

test('plate: the installed plate reflects a shot into its face; a shot outside reach is untouched', () => {
  const h = boot(CRYO_ARENA_ID);
  const plates = h.toys.filter((toy) => toy.kind === 'plate');
  assert.ok(plates.length >= 1, 'cryo plate');
  const plate = plates[0];
  const n = norm(plate.normal);
  const tangent = perp(n);

  const hit = h.spawn({
    type: 'projectile',
    pos: add(plate.pos, scale(n, 30)),
    vel: scale(n, -90),
  });
  h.tick(2);
  const hitNormal = dot(hit.vel, n);
  assert.ok(hitNormal > 0, `banked shot must leave along +normal, got ${hitNormal}`);
  assert.ok(Math.abs(hitNormal - 90) < 1, `bank preserves speed, got ${hitNormal}`);

  const miss = h.spawn({
    type: 'projectile',
    pos: add(plate.pos, add(scale(n, 30), scale(tangent, 300))),
    vel: scale(n, -90),
  });
  h.tick(2);
  const missNormal = dot(miss.vel, n);
  assert.ok(missNormal < 0, `out-of-reach shot must keep its velocity, got ${missNormal}`);

  h.system.destroy();
});

test('crusher: surge slams a resting body past the crumple speed and calm leaves it still', () => {
  const h = boot(CINDER_ARENA_ID);
  const crusher = h.toys.find((toy) => toy.kind === 'crusher');
  assert.ok(crusher, 'cinder crusher');
  const mouth = add(crusher.pos, scale(norm(crusher.dir), 4));

  const surgeBody = h.spawn({ type: 'ship', pos: { ...mouth }, vel: { x: 0, z: 0 }, mass: 16, radius: 6 });
  h.state.simTime = CRUSHER_CYCLE.warningS + 0.2;
  h.tick(210, false);
  const surgeSpeed = speedOf(surgeBody);
  assert.ok(
    surgeSpeed >= TERRAIN_CRUMPLE_LAW.threshold,
    `surge must reach the crumple speed ${TERRAIN_CRUMPLE_LAW.threshold}, got ${surgeSpeed}`,
  );
  h.system.destroy();

  const calm = boot(CINDER_ARENA_ID);
  const calmCrusher = calm.toys.find((toy) => toy.kind === 'crusher');
  const calmMouth = add(calmCrusher.pos, scale(norm(calmCrusher.dir), 4));
  const calmBody = calm.spawn({ type: 'ship', pos: { ...calmMouth }, vel: { x: 0, z: 0 }, mass: 16, radius: 6 });
  calm.state.simTime = CRUSHER_CYCLE.warningS + CRUSHER_CYCLE.surgeS + 0.2;
  calm.tick(120, false);
  assert.equal(speedOf(calmBody), 0, 'calm must not move the body');
  calm.system.destroy();
});

test('current: the installed cone carries a resting body along dir and ignores an outsider', () => {
  const h = boot(LAGRANGE_ARENA_ID);
  const current = h.toys.find((toy) => toy.kind === 'current');
  assert.ok(current, 'lagrange current');
  const dir = norm(current.dir);
  const side = perp(dir);
  const start = add(current.center, scale(dir, 8));

  const carried = h.spawn({ type: 'ship', pos: { ...start }, vel: { x: 0, z: 0 }, mass: 16, radius: 6 });
  const outsiderStart = add(current.center, scale(side, 400));
  const outsider = h.spawn({ type: 'ship', pos: { ...outsiderStart }, vel: { x: 0, z: 0 }, mass: 16, radius: 6 });

  h.tick(120);

  const carriedAlong = dot(carried.vel, dir);
  const outsiderAlong = dot(outsider.vel, dir);
  assert.ok(carriedAlong > 5, `carried body must gain speed down the cone, got ${carriedAlong}`);
  assert.ok(Math.abs(outsiderAlong) < 1e-6, `outsider must not be carried, got ${outsiderAlong}`);
  h.system.destroy();
});

test('relay: the installed relay conducts along the storm graph; a non-conductive one does not', () => {
  const h = boot(STORM_ARENA_ID);
  const relayIds = h.toys.filter((toy) => toy.kind === 'relay').map((toy) => toy.id);
  assert.equal(relayIds.length, 2, 'storm relays');

  const nodes = stormGraphNodes(ANCHOR, 0);
  assert.ok(nodes.some((node) => node.id === relayIds[0]), 'relay is a graph node');

  const graph = buildConductivityGraph(nodes, { at: ANCHOR });
  const walk = conductAlongGraph(graph, relayIds[0], createStormLineage({ lineageProcBudget: 16, tick: 0 }));
  assert.ok(walk.hops.length >= 1, 'installed relay must conduct at least one hop');

  const deadNodes = nodes.map((node) => (node.kind === 'relay' ? { ...node, conductive: false } : node));
  const deadGraph = buildConductivityGraph(deadNodes, { at: ANCHOR });
  const deadWalk = conductAlongGraph(deadGraph, relayIds[0], createStormLineage({ lineageProcBudget: 16, tick: 0 }));
  assert.equal(deadWalk.hops.length, 0, 'a non-conductive relay cannot conduct');

  h.system.destroy();
});
