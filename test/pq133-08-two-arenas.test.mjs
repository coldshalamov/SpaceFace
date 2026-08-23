// PQ-133.08 — Lagrange Crucible and Cinder Sluice.
//
// The two new arena laws are not Helios ricochet. They consume the existing well/repulsor/cone
// kernel, stay arena-scoped, stay deterministic, and the strongest Foundry (Helios) build is
// not automatically strongest in both new rooms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import {
  couplingScale,
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  COMBAT_LAB_BUILD_CODE_VERSION,
  decodeCombatLabBuildCode,
  encodeCombatLabBuildCode,
} from '../src/contracts/combatLabBuildCode.js';
import { COMBAT_LAB_SETUP_SCHEMA } from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_ARENAS,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_STARTER_PACKAGES,
} from '../src/data/combatLabSetups.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_LOCAL_POS,
} from '../src/data/environmentalMachinery.js';
import { FIELD_COUPLING, FIELD_MAX_ACCEL } from '../src/data/fields.js';
import { SHIPS } from '../src/data/ships.js';
import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import {
  CINDER_ARENA_ID,
  CINDER_BOSS_ROLE,
  CINDER_CURRENT_EDGE_SOFT,
  CINDER_CURRENT_HALF_ANGLE,
  CINDER_CURRENT_RADIUS,
  CINDER_CURRENT_STRENGTH,
  planCinderInstall,
  stepCinderMachinery,
} from '../src/systems/cinderSluiceArena.js';
import {
  LAGRANGE_ARENA_ID,
  LAGRANGE_BOSS_ROLE,
  LAGRANGE_PYLON_SEP,
  LAGRANGE_WELL_RADIUS,
  lagrangePylons,
  planLagrangeInstall,
} from '../src/systems/lagrangeCrucible.js';
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
const BEFORE_DIGEST = '0U3BLV9';
const GRAVITY_MARK_COUPLE = 1.9;
const HERE = dirname(fileURLToPath(import.meta.url));
const OLD_WORKED_EXAMPLE = 'SFCR1-0U3B-LV91-*SHI-P_KE-STRE-L*0*-WPN_-PULS-E_LA-SER_-S*PH-YSIC-S_SW-ARM*-HELI-OS_C-ORE*-1*10-7VN1-XO';

const energyStarter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'energy_baseline');
const kineticStarter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'kinetic_baseline');
const physicsStarter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'physics_toolkit');
const physicsSwarm = COMBAT_LAB_ENEMY_PACKAGES.find((p) => p.id === 'physics_swarm');
const heliosArena = COMBAT_LAB_ARENAS.find((a) => a.id === 'helios_core');
const lagrangeArena = COMBAT_LAB_ARENAS.find((a) => a.id === LAGRANGE_ARENA_ID);
const cinderArena = COMBAT_LAB_ARENAS.find((a) => a.id === CINDER_ARENA_ID);
const kestrel = SHIPS.find((s) => s.id === 'ship_kestrel');
const hornet = SHIPS.find((s) => s.id === 'ship_hornet');

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
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, emitted, fakeFields, player };
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

function profileFor(starter, marked) {
  const ship = SHIPS.find((entry) => entry.id === starter.hullId);
  return {
    mass: ship.mass,
    type: 'ship',
    fieldResponseMult: marked ? GRAVITY_MARK_COUPLE : 1,
  };
}

function scoreRoom(fields, start, axis, profile) {
  const a0 = accelAt(fields, start, profile);
  const traj = projectFieldTrajectory(start, { x: 0, z: 0 }, fields, profile, {
    dt: 1 / 60,
    steps: 180,
  });
  let sumSq = 0;
  for (const point of traj.points) {
    const dx = point.x - start.x;
    const dz = point.z - start.z;
    sumSq += dx * dx + dz * dz;
  }
  return {
    peak: mag(a0),
    rms: Math.sqrt(sumSq / traj.points.length),
    ride: (traj.end.x - start.x) * axis.x + (traj.end.z - start.z) * axis.z,
    endDist: Math.hypot(traj.end.x - start.x, traj.end.z - start.z),
    couple: couplingScale(profile),
  };
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

function digestOf(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase().slice(5, 12);
}

function recipesFor(arenaId) {
  return SURVIVAL_WAVES.filter((recipe) => recipe.arenaId === arenaId);
}

function sourceOf(rel) {
  return readFileSync(join(HERE, '..', rel), 'utf8');
}

test('both law arenas are catalogued away from the world sluice', () => {
  assert.ok(lagrangeArena);
  assert.ok(cinderArena);
  assert.match(lagrangeArena.id, /^[a-z0-9_]+$/);
  assert.match(cinderArena.id, /^[a-z0-9_]+$/);
  assert.equal(lagrangeArena.sectorId, 'sector_helios_prime');
  assert.equal(cinderArena.sectorId, 'sector_ceres_belt');
  const dx = cinderArena.spawnPos.x - CINDER_SLUICE_LOCAL_POS.x;
  const dz = cinderArena.spawnPos.z - CINDER_SLUICE_LOCAL_POS.z;
  assert.ok(Math.hypot(dx, dz) > CINDER_SLUICE_FIELD.radius + 200);
});

test('law ten-wave blocks match Helios content; only gates differ', () => {
  const helios = recipesFor('helios_core');
  assert.equal(helios.length, 10);
  for (const arenaId of [LAGRANGE_ARENA_ID, CINDER_ARENA_ID]) {
    const block = recipesFor(arenaId);
    assert.equal(block.length, 10);
    for (let i = 0; i < 10; i++) {
      const shape = (recipe) => recipe.packages.map(
        (pkg) => `${pkg.atTick}:${pkg.role}:${pkg.enemyId}:${pkg.count}:${pkg.batchSize}:${pkg.batchGapTicks}`,
      ).join('|');
      assert.equal(shape(block[i]), shape(helios[i]), `${arenaId} wave ${i + 1} changed content`);
      assert.equal(block[i].arenaPhase, helios[i].arenaPhase);
      if (i === 9) {
        assert.ok(block[i].packages.some((pkg) => pkg.enemyId === 'dreadnought_boss'));
      }
    }
  }
});

test('bosses are roles over the existing dreadnought, not new hulls', () => {
  assert.equal(LAGRANGE_BOSS_ROLE.hullId, 'dreadnought_boss');
  assert.equal(CINDER_BOSS_ROLE.hullId, 'dreadnought_boss');
  assert.equal(LAGRANGE_BOSS_ROLE.role, 'elite');
  assert.equal(CINDER_BOSS_ROLE.role, 'elite');
  assert.equal(LAGRANGE_BOSS_ROLE.law, LAGRANGE_ARENA_ID);
  assert.equal(CINDER_BOSS_ROLE.law, CINDER_ARENA_ID);
});

test('Cinder current matches the world sluice numbers and never reuses its id or centre', () => {
  assert.equal(CINDER_CURRENT_RADIUS, CINDER_SLUICE_FIELD.radius);
  assert.equal(CINDER_CURRENT_STRENGTH, CINDER_SLUICE_FIELD.strength);
  assert.equal(CINDER_CURRENT_HALF_ANGLE, CINDER_SLUICE_FIELD.halfAngleRad);
  assert.equal(CINDER_CURRENT_EDGE_SOFT, CINDER_SLUICE_FIELD.edgeSoftRad);
  const idle = planCinderInstall({ arenaPhase: 'idle', at: ANCHOR, lane: { x: 1, z: 0 } });
  assert.equal(idle.fields.length, 1);
  assert.equal(idle.fields[0].kind, 'cone');
  assert.notEqual(idle.fields[0].id, CINDER_SLUICE_FIELD.id);
  assert.notEqual(idle.fields[0].center.x, CINDER_SLUICE_FIELD.center.x);
});

test('Helios idle is still empty with or without an explicit arena id', () => {
  const omitted = planArenaInstall({ arenaPhase: 'idle', seed: SEED, wave: 1, anchor: ANCHOR });
  const namedHelios = planArenaInstall({
    arenaPhase: 'idle', arenaId: 'helios_core', seed: SEED, wave: 1, anchor: ANCHOR,
  });
  assert.equal(omitted.fields.length, 0);
  assert.equal(omitted.mines.length, 0);
  assert.equal(omitted.cover, false);
  assert.deepEqual(namedHelios, omitted);
});

test('law arenas keep their law on every authored phase and never ask for a third slot', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    for (const arenaId of [LAGRANGE_ARENA_ID, CINDER_ARENA_ID]) {
      const install = planArenaInstall({
        arenaPhase: phase, arenaId, seed: SEED, wave: 3, anchor: ANCHOR, laneGate: 'front',
      });
      assert.ok(install.fields.length <= ARENA_FIELD_SLOT_IDS.length, `${arenaId} ${phase} asked for a third slot`);
      assert.ok(install.fields.length > 0, `${arenaId} ${phase} installed nothing`);
      for (const field of install.fields) {
        assert.ok(ARENA_FIELD_SLOT_IDS.includes(field.id));
        assert.ok(field.kind === 'well' || field.kind === 'repulsor' || field.kind === 'cone');
      }
    }
  }
});

test('an unknown phase is inert on every arena', () => {
  for (const arenaId of [null, 'helios_core', LAGRANGE_ARENA_ID, CINDER_ARENA_ID]) {
    const install = planArenaInstall({
      arenaPhase: 'trapdoor_of_unknowing', arenaId, seed: SEED, wave: 1, anchor: ANCHOR,
    });
    assert.equal(install.fields.length, 0, `${arenaId} guessed a room`);
    assert.equal(install.mines.length, 0);
  }
});

test('same seed rebuilds the same law room', () => {
  for (const arenaId of [LAGRANGE_ARENA_ID, CINDER_ARENA_ID]) {
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
    'src/systems/lagrangeCrucible.js',
    'src/systems/cinderSluiceArena.js',
    'src/systems/survivalArena.js',
  ]) {
    const src = sourceOf(rel);
    assert.equal(src.includes('Math.random('), false, `${rel} rolls the dice`);
    assert.equal(src.includes('Date.now('), false, `${rel} reads the wall clock`);
  }
});

test('Lagrange midpoint is a saddle: hold off-axis, throw along the pylons', () => {
  const at = { x: 0, z: 0 };
  const lane = { x: 1, z: 0 };
  const fields = kernelFields(planLagrangeInstall({ arenaPhase: 'idle', at, lane }));
  const hull = { mass: 18, type: 'ship', fieldResponseMult: 1 };
  const pylons = lagrangePylons(at, lane);
  assert.equal(Math.round(Math.hypot(pylons.a.x - at.x, pylons.a.z - at.z)), LAGRANGE_PYLON_SEP);

  const saddle = accelAt(fields, at, hull);
  assert.ok(mag(saddle) < 1e-6, `saddle accel ${mag(saddle)}`);

  const along = accelAt(fields, { x: 40, z: 0 }, hull);
  assert.ok(along.ax > 1, 'axis step should throw toward the nearer well');
  assert.ok(Math.abs(along.az) < 1e-6);

  const off = accelAt(fields, { x: 0, z: 40 }, hull);
  assert.ok(off.az < -1, 'off-axis step should restore toward the ridge');
  assert.ok(Math.abs(off.ax) < 1e-6);

  const far = accelAt(fields, { x: 20000, z: 20000 }, hull);
  assert.equal(mag(far), 0);
  assert.ok(LAGRANGE_WELL_RADIUS < 20000);
});

test('Cinder drives downstream on-axis and is silent outside the wedge', () => {
  const at = { x: 0, z: 0 };
  const lane = { x: 1, z: 0 };
  const fields = kernelFields(planCinderInstall({ arenaPhase: 'idle', at, lane }));
  const hull = { mass: 18, type: 'ship', fieldResponseMult: 1 };

  const onAxis = accelAt(fields, at, hull);
  assert.ok(onAxis.ax > 1, 'on-axis should be carried downstream');
  assert.ok(Math.abs(onAxis.az) < 1e-6);

  const offWedge = accelAt(fields, { x: 0, z: 400 }, hull);
  assert.equal(mag(offWedge), 0);

  const far = accelAt(fields, { x: 20000, z: 20000 }, hull);
  assert.equal(mag(far), 0);

  assert.equal(stepCinderMachinery(0).phase, 'warning');
  assert.equal(stepCinderMachinery(0).strength, 0);
  assert.equal(stepCinderMachinery(3).phase, 'surge');
  assert.equal(stepCinderMachinery(3).strength, CINDER_CURRENT_STRENGTH);
  assert.equal(stepCinderMachinery(10).phase, 'calm');
  assert.equal(stepCinderMachinery(10).strength, 0);
  assert.deepEqual(stepCinderMachinery(0), stepCinderMachinery(12));
});

test('Helios shutter_slow is still a single well, not a Lagrange pair', () => {
  const helios = planArenaInstall({
    arenaPhase: 'shutter_slow', seed: SEED, wave: 3, anchor: ANCHOR, laneGate: 'front',
  });
  const lagrange = planArenaInstall({
    arenaPhase: 'shutter_slow', arenaId: LAGRANGE_ARENA_ID, seed: SEED, wave: 3, anchor: ANCHOR, laneGate: 'front',
  });
  assert.equal(helios.fields.length, 1);
  assert.equal(helios.fields[0].kind, 'well');
  assert.equal(lagrange.fields.length, 2);
  assert.notDeepEqual(helios.fields.map((f) => f.center), lagrange.fields.map((f) => f.center));
});

test('no live Survival run means no law install', () => {
  const h = boot();
  const plan = planWave({ seed: SEED, arenaId: LAGRANGE_ARENA_ID, wave: 1 });
  assert.notEqual(plan.ok, false);
  h.bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
  assert.equal(named(h.emitted, 'mines:placeRequest').length, 0);

  installRun(h, { kind: 'adventure', arenaId: LAGRANGE_ARENA_ID, phase: 'wave_intro' });
  h.bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
});

test('live Helios wave 1 is still empty; live Lagrange wave 1 is not', () => {
  const helios = boot();
  installRun(helios, { arenaId: 'helios_core', wave: 1 });
  emitPlanned(helios, { arenaId: 'helios_core', wave: 1 });
  assert.equal(helios.fakeFields.live.size, 0);

  const lagrange = boot();
  installRun(lagrange, { arenaId: LAGRANGE_ARENA_ID, wave: 1 });
  emitPlanned(lagrange, { arenaId: LAGRANGE_ARENA_ID, wave: 1 });
  assert.equal(lagrange.fakeFields.live.size, 2);
  for (const record of lagrange.fakeFields.live.values()) {
    assert.equal(record.kind, 'well');
    assert.ok(ARENA_FIELD_SLOT_IDS.includes(record.id));
  }
});

test('live Cinder machinery cycles slot A without a third field', () => {
  const h = boot();
  installRun(h, { arenaId: CINDER_ARENA_ID, wave: 1 });
  emitPlanned(h, { arenaId: CINDER_ARENA_ID, wave: 1 });
  assert.equal(h.fakeFields.live.size, 1);
  const slot = ARENA_FIELD_SLOT_IDS[0];
  assert.equal(h.fakeFields.live.get(slot).kind, 'cone');
  assert.equal(h.fakeFields.live.get(slot).strength, CINDER_CURRENT_STRENGTH);
  assert.equal(survivalArena.diagnostics().lawId, CINDER_ARENA_ID);

  h.state.simTime = 1;
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.fakeFields.live.get(slot).strength, 0);

  h.state.simTime = 3;
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.fakeFields.live.get(slot).strength, CINDER_CURRENT_STRENGTH);
  assert.equal(h.fakeFields.live.size, 1);
});

test('an adventure run never receives the law', () => {
  const h = boot();
  installRun(h, { arenaId: CINDER_ARENA_ID, kind: 'adventure', phase: 'wave_intro' });
  const plan = planWave({ seed: SEED, arenaId: CINDER_ARENA_ID, wave: 5 });
  h.bus.emit('run:wavePlanned', { wave: 5, plan, tick: 0 });
  assert.equal(h.fakeFields.live.size, 0);
  h.state.simTime = 3;
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.fakeFields.live.size, 0);
});

test('exit gate: physics_toolkit standing changes across the three arenas', () => {
  assert.ok(energyStarter && kineticStarter && physicsStarter && kestrel && hornet);
  assert.equal(energyStarter.hullId, 'ship_kestrel');
  assert.equal(kineticStarter.hullId, 'ship_hornet');
  assert.equal(physicsStarter.hullId, 'ship_hornet');
  assert.ok(physicsStarter.loadout.some((entry) => entry.defId === 'wpn_gravity_marker_s'));

  const builds = {
    energy: profileFor(energyStarter, false),
    kinetic: profileFor(kineticStarter, false),
    physics: profileFor(physicsStarter, true),
  };
  assert.equal(builds.energy.mass, 18);
  assert.equal(builds.kinetic.mass, 24);
  assert.equal(builds.physics.mass, 24);

  const origin = { x: 0, z: 0 };
  const heliosFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: 'helios_core', seed: 1, wave: 1, anchor: origin,
  }));
  const lagrangeFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: LAGRANGE_ARENA_ID, seed: 1, wave: 1, anchor: origin, laneGate: 'diagonal_b',
  }));
  const cinderFields = kernelFields(planArenaInstall({
    arenaPhase: 'idle', arenaId: CINDER_ARENA_ID, seed: 1, wave: 1, anchor: origin, laneGate: 'diagonal_b',
  }));

  const helios = {};
  const lagrangeControl = {};
  const lagrangeRide = {};
  const cinderControl = {};
  const cinderRide = {};
  for (const [name, profile] of Object.entries(builds)) {
    helios[name] = scoreRoom(heliosFields, { x: 120, z: 0 }, { x: 1, z: 0 }, profile);
    lagrangeControl[name] = scoreRoom(lagrangeFields, { x: 0, z: 120 }, { x: 0, z: 1 }, profile);
    lagrangeRide[name] = scoreRoom(lagrangeFields, { x: 40, z: 0 }, { x: 1, z: 0 }, profile);
    cinderControl[name] = scoreRoom(cinderFields, origin, { x: 1, z: 0 }, profile);
    cinderRide[name] = scoreRoom(cinderFields, origin, { x: 1, z: 0 }, profile);
  }

  const figures = {
    couple: {
      energy: couplingScale(builds.energy),
      kinetic: couplingScale(builds.kinetic),
      physics: couplingScale(builds.physics),
    },
    heliosIdleRms: { energy: helios.energy.rms, kinetic: helios.kinetic.rms, physics: helios.physics.rms },
    lagrangeControlRms: {
      energy: lagrangeControl.energy.rms,
      kinetic: lagrangeControl.kinetic.rms,
      physics: lagrangeControl.physics.rms,
    },
    lagrangeRide: {
      energy: lagrangeRide.energy.ride,
      kinetic: lagrangeRide.kinetic.ride,
      physics: lagrangeRide.physics.ride,
    },
    cinderControlRms: {
      energy: cinderControl.energy.rms,
      kinetic: cinderControl.kinetic.rms,
      physics: cinderControl.physics.rms,
    },
    cinderRide: {
      energy: cinderRide.energy.ride,
      kinetic: cinderRide.kinetic.ride,
      physics: cinderRide.physics.ride,
    },
    peakAccel: {
      lagrangePhysics: lagrangeRide.physics.peak,
      cinderPhysics: cinderRide.physics.peak,
    },
  };
  console.log('PQ-133.08 exit-gate figures', JSON.stringify(figures, null, 2));

  assert.ok(helios.physics.rms < 1e-6);
  assert.ok(helios.kinetic.rms < 1e-6);
  assert.ok(helios.energy.rms < 1e-6);

  assert.ok(lagrangeControl.kinetic.rms < lagrangeControl.physics.rms,
    'physics must not be the best station-keeper in Lagrange');
  assert.ok(Math.abs(lagrangeRide.physics.ride) > Math.abs(lagrangeRide.kinetic.ride),
    'physics must be the better well-ride in Lagrange');

  assert.ok(cinderControl.kinetic.rms < cinderControl.physics.rms,
    'physics must not be the best station-keeper in Cinder');
  assert.ok(cinderRide.physics.ride > cinderRide.kinetic.ride,
    'physics must be the better downstream ride in Cinder');

  assert.ok(lagrangeRide.physics.peak <= FIELD_MAX_ACCEL);
  assert.ok(cinderRide.physics.peak <= FIELD_MAX_ACCEL);
  assert.ok(lagrangeRide.physics.endDist < LAGRANGE_WELL_RADIUS);
  assert.ok(cinderRide.physics.endDist < CINDER_CURRENT_RADIUS);
  assert.ok(figures.couple.physics > figures.couple.kinetic);
  assert.ok(figures.couple.physics <= FIELD_COUPLING.markedCap + 1e-9);
});

test('adding the two arenas changes the content digest and rejects the old worked example', () => {
  const code = encodeCombatLabBuildCode(labSetup(energyStarter, heliosArena));
  const digest = digestOf(code);
  assert.equal(digest.length, 7);
  assert.notEqual(digest, BEFORE_DIGEST);
  console.log(`PQ-133.08 build-code digest before=${BEFORE_DIGEST} after=${digest}`);
  console.log(`PQ-133.08 worked-example now ${code}`);

  const decodedOld = decodeCombatLabBuildCode(OLD_WORKED_EXAMPLE);
  assert.equal(decodedOld.ok, false);
  const messages = (decodedOld.issues || []).map((issue) => issue && issue.message).join(' ');
  assert.match(messages, /digest/i);

  const roundTrip = decodeCombatLabBuildCode(code);
  assert.equal(roundTrip.ok, true);
  assert.equal(roundTrip.value.arenaId, 'helios_core');
  assert.equal(COMBAT_LAB_BUILD_CODE_VERSION, 1);

  assert.equal(decodeCombatLabBuildCode(encodeCombatLabBuildCode(labSetup(physicsStarter, lagrangeArena))).ok, true);
  assert.equal(decodeCombatLabBuildCode(encodeCombatLabBuildCode(labSetup(kineticStarter, cinderArena))).ok, true);
});
