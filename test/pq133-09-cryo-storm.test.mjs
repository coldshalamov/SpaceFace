// PQ-133.09 — Cryo Drift and Storm Lattice.
//
// The two new arena laws are not ricochet, pull, or current. Cryo consumes Cryo Lock / Thermal
// Shock. Storm reuses the orbit-node kernel for relays and pays the shared chain proc budget.
// Both stay arena-scoped, stay deterministic, and the five rooms produce five distinguishable
// outcomes from one build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CRYO_LOCK_CONTROL_SCALE,
  CRYO_LOCK_STATUS_ID,
  applyCryoLock,
} from '../src/combat/cryoLock.js';
import {
  createOrbitWorld,
  orbitNodePose,
  trySpawnOrbitNodes,
} from '../src/combat/orbitNodes.js';
import {
  PROC_COSTS,
  createLineage,
  lineageMetrics,
  resetLineageIds,
} from '../src/combat/attackLineage.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { BURNING_STATUS_ID } from '../src/combat/thermalShock.js';
import { createBus } from '../src/core/eventBus.js';
import {
  normalizeField,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  decodeCombatLabBuildCode,
  encodeCombatLabBuildCode,
} from '../src/contracts/combatLabBuildCode.js';
import { COMBAT_LAB_SETUP_SCHEMA } from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_ARENAS,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_STARTER_PACKAGES,
} from '../src/data/combatLabSetups.js';
import { peakConcurrentDemand, SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import {
  CRYO_ARENA_ID,
  CRYO_BOSS_ROLE,
  CRYO_FIELD_RADIUS,
  applyCryoDrift,
  planCryoInstall,
} from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  STORM_BOSS_ROLE,
  STORM_CONDUCT_RANGE,
  STORM_PYLON_COUNT,
  STORM_RELAY_COUNT,
  buildConductivityGraph,
  conductAlongGraph,
  createStormLineage,
  placeStormRelays,
  planStormInstall,
  stormGraphNodes,
  stormPylons,
} from '../src/systems/stormLatticeArena.js';
import { mines } from '../src/systems/mines.js';
import {
  ARENA_FIELD_SLOT_IDS,
  SURVIVAL_ARENA_PHASES,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 7;
const ANCHOR = { x: 400, z: -120 };
const ORIGIN = { x: 0, z: 0 };
const BEFORE_DIGEST = '0GWHFVV';
const OLD_WORKED_EXAMPLE = 'SFCR1-0GWH-FVV1-*SHI-P_KE-STRE-L*0*-WPN_-PULS-E_LA-SER_-S*PH-YSIC-S_SW-ARM*-HELI-OS_C-ORE*-1*10-7VN1-XO';
const HERE = dirname(fileURLToPath(import.meta.url));

const energyStarter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'energy_baseline');
const physicsSwarm = COMBAT_LAB_ENEMY_PACKAGES.find((p) => p.id === 'physics_swarm');
const heliosArena = COMBAT_LAB_ARENAS.find((a) => a.id === 'helios_core');
const cryoArena = COMBAT_LAB_ARENAS.find((a) => a.id === CRYO_ARENA_ID);
const stormArena = COMBAT_LAB_ARENAS.find((a) => a.id === STORM_ARENA_ID);

function makeFakeFields() {
  const live = new Map();
  const calls = [];
  let peak = 0;
  return {
    name: 'fields',
    live,
    calls,
    get peak() { return peak; },
    registerEnvironmental(spec) {
      calls.push({ call: 'registerEnvironmental', spec });
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);
      if (live.size > peak) peak = live.size;
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) {
      calls.push({ call: 'unregisterExternal', id });
      return live.delete(String(id));
    },
    updateExternal(id, patch) {
      calls.push({ call: 'updateExternal', id, patch });
      const record = live.get(String(id));
      if (!record || !patch) return null;
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot({ seed = SEED, anchor = ANCHOR } = {}) {
  const state = createGameState(seed);
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { ...anchor },
    vel: { x: 40, z: 0 },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, emitted, fakeFields, player, helpers };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function installRun(harness, {
  wave = 1,
  phase = 'wave_intro',
  seed = SEED,
  arenaId = 'helios_core',
  kind = 'survival',
} = {}) {
  const run = createRunState({ kind, ruleset: 'scored', seed });
  run.arenaId = arenaId;
  run.phase = phase;
  run.wave = wave;
  harness.state.run = run;
  return run;
}

function emitPlanned(harness, { wave = 1, seed = SEED, arenaId }) {
  const plan = planWave({ seed, arenaId, wave });
  assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} must plan`);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function kernelFields(install) {
  return install.fields.map((spec) => normalizeField(spec));
}

function accelAt(fields, pos, profile) {
  return sampleFieldAcceleration(pos, { x: 0, z: 0 }, fields, 0, profile, { ax: 0, az: 0 });
}

function mag(vec) {
  return Math.hypot(vec.ax || 0, vec.az || 0);
}

function recipesFor(arenaId) {
  return SURVIVAL_WAVES.filter((recipe) => recipe.arenaId === arenaId);
}

function sourceOf(rel) {
  return readFileSync(join(HERE, '..', rel), 'utf8');
}

function digestOf(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase().slice(5, 12);
}

function labSetup(starter, arena) {
  return {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    enemyPackageId: physicsSwarm.id,
    arenaId: arena.id,
    seed: 1,
    wave: 1,
  };
}

function hull(mass = 24) {
  return { mass, type: 'ship', fieldResponseMult: 1 };
}

test('both law arenas are catalogued on live sectors', () => {
  assert.ok(cryoArena);
  assert.ok(stormArena);
  assert.match(cryoArena.id, /^[a-z0-9_]+$/);
  assert.match(stormArena.id, /^[a-z0-9_]+$/);
  assert.equal(cryoArena.sectorId, 'sector_vesta_forge');
  assert.equal(stormArena.sectorId, 'sector_tethys_junction');
  assert.deepEqual(cryoArena.spawnPos, { x: 680, z: 320 });
  assert.deepEqual(stormArena.spawnPos, { x: -640, z: -1180 });
});

test('law ten-wave blocks match Helios content; only gates differ', () => {
  const helios = recipesFor('helios_core');
  assert.equal(helios.length, 10);
  for (const arenaId of [CRYO_ARENA_ID, STORM_ARENA_ID]) {
    const block = recipesFor(arenaId);
    assert.equal(block.length, 10);
    for (let i = 0; i < 10; i++) {
      const shape = (recipe) => recipe.packages.map(
        (pkg) => `${pkg.atTick}:${pkg.role}:${pkg.enemyId}:${pkg.count}:${pkg.batchSize}:${pkg.batchGapTicks}`,
      ).join('|');
      assert.equal(shape(block[i]), shape(helios[i]), `${arenaId} wave ${i + 1} changed content`);
      assert.equal(block[i].arenaPhase, helios[i].arenaPhase);
      assert.ok(peakConcurrentDemand(block[i].packages) <= 24);
      if (i === 9) {
        assert.ok(block[i].packages.some((pkg) => pkg.enemyId === 'dreadnought_boss'));
      }
    }
  }
});

test('bosses are roles over the existing dreadnought, not new hulls', () => {
  assert.equal(CRYO_BOSS_ROLE.hullId, 'dreadnought_boss');
  assert.equal(STORM_BOSS_ROLE.hullId, 'dreadnought_boss');
  assert.equal(CRYO_BOSS_ROLE.role, 'elite');
  assert.equal(STORM_BOSS_ROLE.role, 'elite');
  assert.equal(CRYO_BOSS_ROLE.law, CRYO_ARENA_ID);
  assert.equal(STORM_BOSS_ROLE.law, STORM_ARENA_ID);
  assert.equal(CRYO_BOSS_ROLE.id, 'manifold_warden');
  assert.equal(STORM_BOSS_ROLE.id, 'grid_tyrant');
});

test('law arenas keep their law on every authored phase and never ask for a third slot', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    for (const arenaId of [CRYO_ARENA_ID, STORM_ARENA_ID]) {
      const install = planArenaInstall({
        arenaPhase: phase, arenaId, seed: SEED, wave: 3, anchor: ANCHOR, laneGate: 'front',
      });
      assert.ok(install.fields.length <= ARENA_FIELD_SLOT_IDS.length, `${arenaId} ${phase} asked for a third slot`);
      assert.ok(install.fields.length > 0, `${arenaId} ${phase} installed nothing`);
      for (const field of install.fields) {
        assert.ok(ARENA_FIELD_SLOT_IDS.includes(field.id));
        assert.ok(field.kind === 'well' || field.kind === 'repulsor' || field.kind === 'cone');
        assert.equal(field.strength, 0, `${arenaId} ${phase} must not be a standing force`);
      }
    }
  }
});

test('an unknown phase is inert on every arena', () => {
  for (const arenaId of [null, 'helios_core', LAGRANGE_ARENA_ID, CINDER_ARENA_ID, CRYO_ARENA_ID, STORM_ARENA_ID]) {
    const install = planArenaInstall({
      arenaPhase: 'trapdoor_of_unknowing', arenaId, seed: SEED, wave: 1, anchor: ANCHOR,
    });
    assert.equal(install.fields.length, 0, `${arenaId} guessed a room`);
    assert.equal(install.mines.length, 0);
  }
});

test('same seed rebuilds the same law room', () => {
  for (const arenaId of [CRYO_ARENA_ID, STORM_ARENA_ID]) {
    const a = planArenaInstall({
      arenaPhase: 'boss', arenaId, seed: 11, wave: 10, anchor: ANCHOR, laneGate: 'front',
    });
    const b = planArenaInstall({
      arenaPhase: 'boss', arenaId, seed: 11, wave: 10, anchor: ANCHOR, laneGate: 'front',
    });
    assert.deepEqual(a, b);
  }
});

test('law modules do not call Math.random or Date.now', () => {
  for (const rel of [
    'src/systems/cryoDriftArena.js',
    'src/systems/stormLatticeArena.js',
    'src/systems/survivalArena.js',
  ]) {
    const src = sourceOf(rel);
    assert.equal(src.includes('Math.random('), false, `${rel} rolls the dice`);
    assert.equal(src.includes('Date.now('), false, `${rel} reads the wall clock`);
  }
});

test('Cryo Lock copies velocity and a far body is outside the field', () => {
  const room = planCryoInstall({ arenaPhase: 'idle', at: ORIGIN, lane: { x: 1, z: 0 } });
  const frozen = applyCryoDrift({
    id: 'in', pos: { x: -80, z: 0 }, vx: 40, vz: -12, statuses: [],
  }, room);
  assert.equal(frozen.zone, 'cold');
  assert.equal(frozen.vx, 40);
  assert.equal(frozen.vz, -12);
  assert.equal(frozen.controlScale, CRYO_LOCK_CONTROL_SCALE);
  assert.ok(frozen.statuses.includes(CRYO_LOCK_STATUS_ID));
  assert.equal(applyCryoLock({ vx: 40, vz: -12 }).vx, 40);

  const far = applyCryoDrift({
    id: 'far', pos: { x: 20000, z: 20000 }, vx: 40, vz: -12, statuses: [],
  }, room);
  assert.equal(far.zone, 'outside');
  assert.equal(far.vx, 40);
  assert.equal(far.vz, -12);
  assert.equal(far.controlScale, 1);
  assert.equal(far.statuses.includes(CRYO_LOCK_STATUS_ID), false);
  assert.ok(CRYO_FIELD_RADIUS < 20000);

  const island = applyCryoDrift({
    id: 'hub', pos: { x: 0, z: 0 }, vx: 9, vz: 3, statuses: [],
  }, room);
  assert.equal(island.zone, 'insulated');
  assert.equal(island.controlScale, 1);
});

test('heat meeting Cryo Lock is Thermal Shock, not a stun', () => {
  const room = planCryoInstall({ arenaPhase: 'idle', at: ORIGIN, lane: { x: 1, z: 0 } });
  const before = { id: 'hot', pos: { x: 80, z: 0 }, vx: 40, vz: 0, statuses: [CRYO_LOCK_STATUS_ID] };
  const hit = applyCryoDrift(before, room);
  assert.equal(hit.shock && hit.shock.ok, true);
  assert.notEqual(hit.vx, 0);
  assert.notEqual(hit.vx, 40);
  assert.ok(hit.statuses.includes(CRYO_LOCK_STATUS_ID) === false);
  assert.equal(hit.controlScale, 1);
  const again = applyCryoDrift(before, room);
  assert.deepEqual(hit, again);
});

test('Storm relays reuse orbitNodePose and the orbit spawn kernel', () => {
  const host = { x: 0, z: 0 };
  const relays = placeStormRelays(ORIGIN, 45);
  const a = orbitNodePose(host, 0, STORM_RELAY_COUNT, 70, 45, 90);
  const b = orbitNodePose(host, 1, STORM_RELAY_COUNT, 70, 45, 90);
  assert.equal(relays[0].pos.x, a.x);
  assert.equal(relays[0].pos.z, a.z);
  assert.equal(relays[1].pos.x, b.x);
  assert.equal(relays[1].pos.z, b.z);
  assert.notDeepEqual(relays[0].pos, placeStormRelays(ORIGIN, 0)[0].pos);

  resetLineageIds(1);
  const compiled = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_cryo_gyros', 1]] });
  assert.equal(compiled.ok, true);
  const parent = createLineage({ spec: compiled.spec, createdTick: 10, sourceEntityId: 'player' });
  const world = createOrbitWorld();
  const spawned = trySpawnOrbitNodes(world, parent, compiled.spec, { id: 'player', x: 0, z: 0, vx: 40, vz: 0 }, {
    tick: 10, simTime: 10,
  });
  assert.equal(spawned.spawned.length, 2);
  assert.ok(world.nodes.length <= 8);
});

test('conduction terminates, does not revisit, and cannot exceed the shared budget', () => {
  const nodes = [];
  for (let i = 0; i < 8; i++) {
    nodes.push({
      id: `n${i}`,
      conductive: true,
      score: 0,
      pos: { x: i * 20, z: 0 },
    });
  }
  const graph = buildConductivityGraph(nodes, {
    at: ORIGIN, islandRadius: 0, range: 25, neighborMax: 2,
  });
  const poor = createStormLineage({ lineageProcBudget: PROC_COSTS.chain * 2, tick: 0 });
  const walk = conductAlongGraph(graph, 'n0', poor);
  assert.equal(walk.hops.length, 2);
  assert.ok(walk.suppressed.some((row) => row.reason === 'proc_budget' || row.suppressed === true));
  const metrics = lineageMetrics(poor);
  assert.equal(metrics.consumed, PROC_COSTS.chain * 2);
  assert.equal(metrics.remaining, 0);

  const triangle = [
    { id: 'a', conductive: true, score: 0, pos: { x: 0, z: 0 } },
    { id: 'b', conductive: true, score: 0, pos: { x: 40, z: 0 } },
    { id: 'c', conductive: true, score: 0, pos: { x: 20, z: 30 } },
  ];
  const cycle = buildConductivityGraph(triangle, {
    at: ORIGIN, islandRadius: 0, range: 80, neighborMax: 3,
  });
  const rich = createStormLineage({ lineageProcBudget: 40, tick: 0 });
  const looped = conductAlongGraph(cycle, 'a', rich, { hopMax: 20 });
  assert.equal(looped.hops.length, 2);
  const seen = new Set(['a']);
  for (const hop of looped.hops) {
    assert.equal(seen.has(hop.toId), false, 'revisited a node');
    seen.add(hop.toId);
  }

  const far = [
    { id: 'left', conductive: true, score: 0, pos: { x: 0, z: 0 } },
    { id: 'right', conductive: true, score: 0, pos: { x: 400, z: 0 } },
  ];
  const unlinked = buildConductivityGraph(far, {
    at: ORIGIN, islandRadius: 0, range: STORM_CONDUCT_RANGE, neighborMax: 3,
  });
  assert.equal(unlinked.edges.length, 0);
  const cabled = buildConductivityGraph(far, {
    at: ORIGIN,
    islandRadius: 0,
    range: STORM_CONDUCT_RANGE,
    neighborMax: 3,
    tethers: [{ a: 'left', b: 'right' }],
  });
  assert.equal(cabled.edges.length, 1);
  const cableWalk = conductAlongGraph(cabled, 'left', createStormLineage({ lineageProcBudget: 12 }));
  assert.equal(cableWalk.hops.length, 1);
  assert.equal(cableWalk.hops[0].toId, 'right');
});

test('idle Storm lattice is a hexagon of pylons plus two relays', () => {
  const room = planStormInstall({ arenaPhase: 'idle', at: ORIGIN, lane: { x: 1, z: 0 } });
  assert.equal(room.pylons.length, STORM_PYLON_COUNT);
  assert.equal(room.relays.length, STORM_RELAY_COUNT);
  const graph = buildConductivityGraph(stormGraphNodes(ORIGIN, 0), { at: ORIGIN });
  const walk = conductAlongGraph(graph, 'pylon_3', createStormLineage({ lineageProcBudget: 12 }));
  assert.ok(walk.hops.length >= 1);
  const again = conductAlongGraph(
    buildConductivityGraph(stormGraphNodes(ORIGIN, 0), { at: ORIGIN }),
    'pylon_3',
    createStormLineage({ lineageProcBudget: 12 }),
  );
  assert.deepEqual(walk.hops, again.hops);
});

test('no live Survival run means no law install', () => {
  const h = boot();
  const plan = planWave({ seed: SEED, arenaId: CRYO_ARENA_ID, wave: 1 });
  assert.notEqual(plan.ok, false);
  h.bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
  assert.equal(named(h.emitted, 'mines:placeRequest').length, 0);

  installRun(h, { kind: 'adventure', arenaId: CRYO_ARENA_ID, phase: 'wave_intro' });
  h.bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
});

test('live Helios wave 1 is still empty; live Cryo and Storm wave 1 are not', () => {
  const helios = boot();
  installRun(helios, { arenaId: 'helios_core', wave: 1 });
  emitPlanned(helios, { arenaId: 'helios_core', wave: 1 });
  assert.equal(helios.fakeFields.live.size, 0);

  const cryo = boot();
  installRun(cryo, { arenaId: CRYO_ARENA_ID, wave: 1 });
  emitPlanned(cryo, { arenaId: CRYO_ARENA_ID, wave: 1 });
  assert.equal(cryo.fakeFields.live.size, 2);
  assert.equal(survivalArena.diagnostics().lawId, CRYO_ARENA_ID);
  for (const record of cryo.fakeFields.live.values()) {
    assert.equal(record.strength, 0);
    assert.ok(ARENA_FIELD_SLOT_IDS.includes(record.id));
  }

  const storm = boot();
  installRun(storm, { arenaId: STORM_ARENA_ID, wave: 1 });
  emitPlanned(storm, { arenaId: STORM_ARENA_ID, wave: 1 });
  assert.equal(storm.fakeFields.live.size, 2);
  assert.equal(survivalArena.diagnostics().lawId, STORM_ARENA_ID);
});

test('Cryo tick is arena-scoped: far bodies and other arena ids stay inert', () => {
  const cryo = boot();
  installRun(cryo, { arenaId: CRYO_ARENA_ID, wave: 1 });
  emitPlanned(cryo, { arenaId: CRYO_ARENA_ID, wave: 1 });
  const cold = cryo.helpers.spawnEntity({
    type: 'ship',
    pos: { x: ANCHOR.x - 80, z: ANCHOR.z },
    vel: { x: 40, z: 0 },
    statuses: [],
  });
  const far = cryo.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 20000, z: 20000 },
    vel: { x: 11, z: 7 },
    statuses: [],
  });
  const vx0 = cold.vel.x;
  survivalArena.update(1 / 60, cryo.state);
  assert.equal(cold.controlScale, CRYO_LOCK_CONTROL_SCALE);
  assert.equal(cold.vel.x, vx0);
  assert.equal(far.controlScale, undefined);
  assert.equal(far.vel.x, 11);
  assert.equal(far.vel.z, 7);

  const helios = boot();
  installRun(helios, { arenaId: 'helios_core', wave: 1 });
  emitPlanned(helios, { arenaId: 'helios_core', wave: 1 });
  const decoy = helios.helpers.spawnEntity({
    type: 'ship',
    pos: { x: ANCHOR.x - 80, z: ANCHOR.z },
    vel: { x: 40, z: 0 },
    statuses: [],
  });
  survivalArena.update(1 / 60, helios.state);
  assert.equal(decoy.controlScale, undefined);
  assert.equal(decoy.vel.x, 40);
  assert.equal(helios.fakeFields.live.size, 0);
});

test('an adventure run never receives the law, even after update', () => {
  const h = boot();
  installRun(h, { arenaId: STORM_ARENA_ID, kind: 'adventure', phase: 'wave_intro' });
  const plan = planWave({ seed: SEED, arenaId: STORM_ARENA_ID, wave: 5 });
  h.bus.emit('run:wavePlanned', { wave: 5, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
  h.state.simTime = 4;
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.fakeFields.live.size, 0);
  assert.equal(h.player.controlScale, undefined);
});

test('live Storm relays move with simTime through the field kernel', () => {
  const h = boot();
  installRun(h, { arenaId: STORM_ARENA_ID, wave: 1 });
  emitPlanned(h, { arenaId: STORM_ARENA_ID, wave: 1 });
  const slot = ARENA_FIELD_SLOT_IDS[0];
  const at0 = { x: h.fakeFields.live.get(slot).center.x, z: h.fakeFields.live.get(slot).center.z };
  h.state.simTime = 45;
  survivalArena.update(1 / 60, h.state);
  const at1 = h.fakeFields.live.get(slot).center;
  assert.equal(h.fakeFields.live.get(slot).strength, 0);
  assert.notDeepEqual({ x: at1.x, z: at1.z }, at0);
  const expected = placeStormRelays({ x: ANCHOR.x, z: ANCHOR.z }, 45)[0].pos;
  assert.equal(at1.x, expected.x);
  assert.equal(at1.z, expected.z);
});

test('exit gate: one build, five distinguishable arena laws', () => {
  const profile = hull(24);
  const probe = { x: -80, z: 0 };
  const heliosFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: 'helios_core', seed: 1, wave: 1, anchor: ORIGIN,
  }));
  const lagrangeFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: LAGRANGE_ARENA_ID, seed: 1, wave: 1, anchor: ORIGIN, laneGate: 'diagonal_b',
  }));
  const cinderFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: CINDER_ARENA_ID, seed: 1, wave: 1, anchor: ORIGIN, laneGate: 'diagonal_b',
  }));
  const cryoInstall = planArenaInstall({
    arenaPhase: 'idle', arenaId: CRYO_ARENA_ID, seed: 1, wave: 1, anchor: ORIGIN, laneGate: 'diagonal_b',
  });
  const cryoFields = kernelFields(cryoInstall);
  const stormInstall = planArenaInstall({
    arenaPhase: 'idle', arenaId: STORM_ARENA_ID, seed: 1, wave: 1, anchor: ORIGIN, laneGate: 'diagonal_b',
  });
  const stormFields = kernelFields(stormInstall);

  const cryoHit = applyCryoDrift({
    id: 'probe', pos: probe, vx: 40, vz: 0, statuses: [],
  }, cryoInstall);
  const stormWalk = conductAlongGraph(
    buildConductivityGraph(stormGraphNodes(ORIGIN, 0), { at: ORIGIN }),
    'pylon_3',
    createStormLineage({ lineageProcBudget: 12 }),
  );

  function measure(name, fields, extra) {
    const a = accelAt(fields, probe, profile);
    return {
      law: name,
      ax: a.ax,
      az: a.az,
      accelMag: mag(a),
      controlScale: extra.controlScale,
      vx: extra.vx,
      cryo: extra.cryo,
      burning: extra.burning,
      shock: extra.shock,
      hops: extra.hops,
    };
  }

  const rows = [
    measure('helios', heliosFields, {
      controlScale: 1, vx: 40, cryo: false, burning: false, shock: false, hops: 0,
    }),
    measure('lagrange', lagrangeFields, {
      controlScale: 1, vx: 40, cryo: false, burning: false, shock: false, hops: 0,
    }),
    measure('cinder', cinderFields, {
      controlScale: 1, vx: 40, cryo: false, burning: false, shock: false, hops: 0,
    }),
    measure('cryo', cryoFields, {
      controlScale: cryoHit.controlScale,
      vx: cryoHit.vx,
      cryo: cryoHit.statuses.includes(CRYO_LOCK_STATUS_ID),
      burning: cryoHit.statuses.includes(BURNING_STATUS_ID),
      shock: !!(cryoHit.shock && cryoHit.shock.ok),
      hops: 0,
    }),
    measure('storm', stormFields, {
      controlScale: 1, vx: 40, cryo: false, burning: false, shock: false, hops: stormWalk.hops.length,
    }),
  ];

  const figures = {};
  for (const row of rows) figures[row.law] = row;
  console.log('PQ-133.09 exit-gate figures', JSON.stringify(figures, null, 2));

  assert.ok(figures.helios.accelMag < 1e-6);
  assert.ok(figures.cryo.accelMag < 1e-6);
  assert.ok(figures.storm.accelMag < 1e-6);
  assert.ok(figures.lagrange.accelMag > 1);
  assert.ok(figures.cinder.accelMag > 1);
  assert.ok(figures.lagrange.ax < 0, 'Lagrange at x=-80 should throw toward the west well');
  assert.ok(figures.cinder.ax > 0, 'Cinder at x=-80 should carry downstream');
  assert.equal(figures.cryo.controlScale, CRYO_LOCK_CONTROL_SCALE);
  assert.equal(figures.cryo.vx, 40);
  assert.equal(figures.cryo.cryo, true);
  assert.ok(figures.storm.hops >= 1);
  assert.equal(figures.helios.hops, 0);
  assert.equal(figures.helios.controlScale, 1);

  const keys = rows.map((row) => [
    row.law === 'helios' ? 'helios' : row.law,
    Math.round(row.accelMag * 100) / 100,
    Math.sign(row.ax) || 0,
    Math.round(row.controlScale * 100) / 100,
    row.vx,
    row.cryo ? 1 : 0,
    row.hops > 0 ? 1 : 0,
  ].join('|'));
  assert.equal(new Set(keys).size, 5, `laws collapsed: ${keys.join(' / ')}`);
});

test('adding the two arenas changes the content digest and rejects the old worked example', () => {
  const code = encodeCombatLabBuildCode(labSetup(energyStarter, heliosArena));
  const digest = digestOf(code);
  assert.equal(digest.length, 7);
  assert.notEqual(digest, BEFORE_DIGEST);
  console.log(`PQ-133.09 build-code digest before=${BEFORE_DIGEST} after=${digest}`);
  console.log(`PQ-133.09 worked-example now ${code}`);

  const decodedOld = decodeCombatLabBuildCode(OLD_WORKED_EXAMPLE);
  assert.equal(decodedOld.ok, false);
  const messages = (decodedOld.issues || []).map((issue) => issue && issue.message).join(' ');
  assert.match(messages, /digest/i);

  const roundTrip = decodeCombatLabBuildCode(code);
  assert.equal(roundTrip.ok, true);
  assert.equal(roundTrip.value.arenaId, 'helios_core');
  assert.equal(decodeCombatLabBuildCode(encodeCombatLabBuildCode(labSetup(energyStarter, cryoArena))).ok, true);
  assert.equal(decodeCombatLabBuildCode(encodeCombatLabBuildCode(labSetup(energyStarter, stormArena))).ok, true);
});
