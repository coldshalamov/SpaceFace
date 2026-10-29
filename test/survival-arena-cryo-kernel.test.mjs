import assert from 'node:assert/strict';
import { test } from 'node:test';

import { helmControlScaleFromCombat } from '../src/combat/cryoLock.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { BURNING_STATUS_ID } from '../src/combat/thermalShock.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { ensureCombatant } from '../src/combat/runtime.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';

function makeFields() {
  const live = new Map();
  return {
    registerEnvironmental(spec) { live.set(spec.id, spec); return spec; },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(id); },
    updateExternal(id, patch) { const row = live.get(id); if (row) Object.assign(row, patch); return row || null; },
    hasExternal(id) { return live.has(id); },
  };
}

function boot() {
  const state = createGameState(7);
  const rawBus = createBus();
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit: rawBus.emit.bind(rawBus),
  };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const fields = makeFields();
  const ctx = { state, bus, helpers, registry: { get: (name) => name === 'fields' ? fields : null } };
  survivalArena.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
  run.arenaId = CRYO_ARENA_ID;
  run.wave = 1;
  run.phase = 'wave_intro';
  state.run = run;
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 7, arenaId: CRYO_ARENA_ID, wave: 1 }) });
  const kernel = getCombatKernel(ctx);
  return {
    state, ctx, bus, kernel,
    spawn(spec) {
      const entity = helpers.spawnEntity({ type: 'ship', team: 2, vel: { x: 0, z: 0 },
        mass: 2, radius: 12, hull: 100, hullMax: 100, shield: 0, ...spec });
      entity.physicsBody = { schemaVersion: 1, radius: entity.radius, mass: entity.mass,
        inertiaY: 1, dynamic: true, revision: 0 };
      return entity;
    },
    tick(entity, tick) {
      state.tick = tick;
      state.simTime = tick / 60;
      kernel.prePhysics(1 / 60);
      survivalArena.update(1 / 60, state);
      return state.combat.entities[String(entity.id)];
    },
    destroy() { survivalArena.destroy(); kernel.dispose(); },
  };
}

test('Cryo room cold pocket reaches the helm reader and expires through combat status time', () => {
  const h = boot();
  try {
    const ship = h.spawn({ pos: { x: -400, z: 0 } });
    h.tick(ship, 0); // room schedules; kernel applies on its next simulation tick
    h.tick(ship, 1);
    assert.equal(helmControlScaleFromCombat(h.state, ship.id), 0.35);
    assert.equal(ship.controlScale, undefined, 'arena must not leave an unconsumed entity override');

    ship.pos = { x: 10000, z: 10000 };
    for (let tick = 2; tick <= 91; tick++) h.tick(ship, tick);
    assert.equal(helmControlScaleFromCombat(h.state, ship.id), 1);
    assert.equal(ship.controlScale, undefined);
  } finally {
    h.destroy();
  }
});

test('Cryo hot pocket applies canonical periodic burning damage without stacking each tick', () => {
  const h = boot();
  try {
    const ship = h.spawn({ pos: { x: 400, z: 0 } });
    h.tick(ship, 0);
    let runtime = h.tick(ship, 1);
    assert.equal(runtime.statuses[BURNING_STATUS_ID].stacks, 1);
    const hullBefore = ship.hull;
    for (let tick = 2; tick <= 31; tick++) runtime = h.tick(ship, tick);
    assert.equal(ship.hull, hullBefore - 4);
    assert.equal(runtime.statuses[BURNING_STATUS_ID].stacks, 1);
  } finally {
    h.destroy();
  }
});

test('Cryo thermal overlap consumes one burn stack, queues one mass-scaled impulse, then leaves no room override', () => {
  const h = boot();
  try {
    const ship = h.spawn({ pos: { x: -360, z: 0 } });
    h.ctx.state.run.arenaId = CRYO_ARENA_ID;
    // Bring the authored coolant and heat pockets together to exercise their intended overlap.
    for (const role of ['coolant_tank', 'heat_manifold']) {
      const prop = survivalArena._roomSolids.get(role);
      assert.ok(prop, `expected live ${role} prop`);
      prop.pos = { x: -360, z: 0 };
    }
    const initialRuntime = ensureCombatant(h.state, ship, h.kernel.catalog);
    h.kernel.statuses.schedule(ship, initialRuntime, {
      id: 'status_cryo_lock', stacks: 1, durationTicks: 90,
    }, { attackerId: 'test_source' });
    h.kernel.statuses.schedule(ship, initialRuntime, {
      id: 'status_ionized', stacks: 1, durationTicks: 120,
    }, { attackerId: 'unrelated_source' });
    const driveBeforeShock = initialRuntime.subsystems.subsystem_drive.health;
    assert.equal(h.kernel.statuses.schedule(ship, initialRuntime, {
      id: BURNING_STATUS_ID, stacks: 2, durationTicks: 120,
    }, { attackerId: 'test_source', actionId: 'test_burn_action' }).ok, true);
    h.state.tick = 1;
    h.state.simTime = 1 / 60;
    h.kernel.prePhysics(1 / 60);
    assert.equal(initialRuntime.statuses[BURNING_STATUS_ID].stacks, 2);
    survivalArena.update(1 / 60, h.state);
    let runtime = initialRuntime;
    const command = consumePhysicsCommand(ship);
    assert.equal(command?.impulses.length, 1);
    const magnitude = Math.hypot(command.impulses[0].x, command.impulses[0].z);
    assert.equal(magnitude, 160, '80 delta-v is scaled by the body mass of 2');
    assert.equal(runtime.statuses.status_cryo_lock, undefined);
    assert.equal(runtime.statuses[BURNING_STATUS_ID], undefined);
    assert.ok(runtime.statuses.status_ionized, 'thermal shock leaves unrelated combat statuses intact');
    assert.equal(runtime.subsystems.subsystem_drive.health, driveBeforeShock - 1,
      'the authored pulse removes one drive health unit through the subsystem owner');
    h.state.tick = 2;
    h.state.simTime = 2 / 60;
    h.kernel.prePhysics(1 / 60);
    survivalArena.update(1 / 60, h.state);
    assert.equal(runtime.statuses[BURNING_STATUS_ID].stacks, 1,
      'shock removes one of two burning stacks and preserves the remaining stack via the status owner');
    assert.equal(runtime.statuses[BURNING_STATUS_ID].attackerId, 'test_source');
    assert.equal(runtime.statuses[BURNING_STATUS_ID].actionId, 'test_burn_action');
    assert.equal(runtime.subsystems.subsystem_drive.health, driveBeforeShock - 1,
      'the one-point pulse is applied once, alongside the one-shot physical impulse');
    assert.equal(consumePhysicsCommand(ship), null, 'overlapping hot/cold sources do not impulse every tick');
    h.bus.emit('run:waveCleared', { wave: 1 });
    assert.equal(survivalArena._cryoRoom, null);
    assert.equal(ship.controlScale, undefined);
  } finally {
    h.destroy();
  }
});

test('thermal immunity prevents synthetic arena statuses from triggering or consuming Thermal Shock', () => {
  const h = boot();
  try {
    const ship = h.spawn({ pos: { x: -360, z: 0 } });
    for (const role of ['coolant_tank', 'heat_manifold']) {
      survivalArena._roomSolids.get(role).pos = { x: -360, z: 0 };
    }
    const runtime = ensureCombatant(h.state, ship, h.kernel.catalog);
    runtime.immunityTags = ['thermal_immune'];
    const driveHealth = runtime.subsystems.subsystem_drive.health;
    h.tick(ship, 0);
    assert.ok(runtime.pendingStatuses.some((status) => status.id === 'status_cryo_lock'));
    assert.equal(runtime.pendingStatuses.some((status) => status.id === BURNING_STATUS_ID), false);

    h.tick(ship, 1);
    assert.ok(runtime.statuses.status_cryo_lock, 'accepted Cryo Lock still uses the combat owner');
    assert.equal(runtime.statuses[BURNING_STATUS_ID], undefined);
    assert.equal(runtime.subsystems.subsystem_drive.health, driveHealth,
      'a refused thermal status cannot pulse the drive');
    assert.equal(consumePhysicsCommand(ship), null, 'immune heat cannot synthesize and consume a shock pair');
  } finally {
    h.destroy();
  }
});

test('a shock in continuous cold does not repeat while its remaining burn stack or Cryo refresh is active', () => {
  const h = boot();
  try {
    const ship = h.spawn({ pos: { x: -400, z: 0 } });
    const runtime = ensureCombatant(h.state, ship, h.kernel.catalog);
    const driveHealth = runtime.subsystems.subsystem_drive.health;
    h.kernel.statuses.schedule(ship, runtime, {
      id: BURNING_STATUS_ID, stacks: 2, durationTicks: 120,
    }, { attackerId: 'test_source', actionId: 'continuous_cold_burn' });
    h.tick(ship, 0);
    h.tick(ship, 1);
    const first = consumePhysicsCommand(ship);
    assert.equal(first?.impulses.length, 1, 'the first canonical pair reacts once');

    for (let tick = 2; tick <= 70; tick++) {
      h.tick(ship, tick);
      const repeated = consumePhysicsCommand(ship);
      assert.equal(repeated?.impulses.length || 0, 0, `no repeat thermal impulse at tick ${tick}`);
    }
    assert.equal(runtime.statuses[BURNING_STATUS_ID].stacks, 1);
    assert.equal(runtime.statuses[BURNING_STATUS_ID].attackerId, 'test_source');
    assert.equal(runtime.statuses[BURNING_STATUS_ID].actionId, 'continuous_cold_burn');
    assert.equal(runtime.subsystems.subsystem_drive.health, driveHealth - 1,
      'ongoing cold and the residual burn stack do not repeat the subsystem pulse');
  } finally {
    h.destroy();
  }
});
