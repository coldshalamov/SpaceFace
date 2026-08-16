import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { activeFieldSnapshot, fields } from '../src/systems/fields.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const DT = 1 / 60;

function withFieldsEnabled(fn) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let result;
  try {
    result = fn();
  } catch (error) {
    FIELD_FLAGS.enabled = previous;
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = previous; });
  }
  FIELD_FLAGS.enabled = previous;
  return result;
}

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: 1210, bus, systems: [fields] });
  sim.state.mode = 'flight';
  sim.state.input.actions = {};
  return { sim, bus };
}

function spawnFlea(sim, x) {
  return sim.spawn(makeEnemySpawnSpec('flea_swarmer', 3, { x, z: 0 }));
}

function setPhase(bus, flea, phase) {
  bus.emit('ai:doctrinePhase', {
    entityId: flea.id,
    targetId: 999,
    doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    phase,
    tick: 0,
  });
}

test('Flea snares are absent outside hold, follow their hull, cap at two, and unregister on death', () => {
  withFieldsEnabled(() => {
    const { sim, bus } = boot();
    const fleas = [spawnFlea(sim, 10), spawnFlea(sim, 30), spawnFlea(sim, 50)];

    sim.step(DT);
    assert.equal(activeFieldSnapshot(sim.state).length, 0, 'approach carries zero field authority');
    for (const flea of fleas) setPhase(bus, flea, 'field_spool');
    sim.step(DT);
    assert.equal(activeFieldSnapshot(sim.state).length, 0, 'the visible spool remains force-cold');

    for (const flea of fleas) setPhase(bus, flea, 'anchor_hold');
    sim.step(DT);
    let active = activeFieldSnapshot(sim.state);
    assert.equal(active.length, 2, 'the Flea family admits at most two simultaneous snares');
    assert.deepEqual(active.map((field) => field.sourceId), fleas.slice(0, 2).map((flea) => flea.id));
    assert.ok(active.every((field) => field.strength === 62), 'hold uses the authored weak strength');

    fleas[0].pos.x = 180;
    fleas[0].pos.z = -70;
    sim.step(DT);
    const moved = activeFieldSnapshot(sim.state).find((field) => field.sourceId === fleas[0].id);
    assert.deepEqual(moved.center, { x: 180, z: -70 }, 'displacing the Flea displaces its snare');

    fleas[0].alive = false;
    sim.step(DT);
    active = activeFieldSnapshot(sim.state);
    assert.equal(active.some((field) => field.sourceId === fleas[0].id), false, 'death unregisters the field in the same tick');
    assert.equal(active.length, 2, 'the waiting Flea may claim the released family slot');

    setPhase(bus, fleas[1], 'recover');
    sim.step(DT);
    active = activeFieldSnapshot(sim.state);
    assert.equal(active.some((field) => field.sourceId === fleas[1].id), false, 'recover has zero field authority');

    fleas[2].data.ai.passive = true;
    setPhase(bus, fleas[2], 'anchor_hold');
    sim.step(DT);
    assert.equal(activeFieldSnapshot(sim.state).length, 0, 'passive Fleas cannot retain a snare');
  });
});

test('a holding Flea changes a nearby hull trajectory through the shared physics owner', async () => {
  await withFieldsEnabled(async () => {
    const bus = createBus();
    const sim = createSimulation({ seed: 1212, bus, systems: [fields, physics] });
    sim.state.mode = 'flight';
    sim.state.input.actions = {};
    sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const flea = spawnFlea(sim, 0);
    const body = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_free',
      pos: { x: 80, z: 0 }, vel: { x: 30, z: 0 }, rot: 0,
      radius: 10, mass: 24, hull: 120, hullMax: 120, cap: 100, capMax: 100,
      collides: true,
      physicsBody: {
        schemaVersion: 1, radius: 10, mass: 24, inertiaY: 60,
        dynamic: true, ccd: true, material: 'ship', revision: 0,
      },
      data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    const physicsSystem = sim.registry.get('physics');
    assert.equal(await physicsSystem.prepareBackend(sim.state), true);
    setPhase(bus, flea, 'anchor_hold');
    for (let tick = 0; tick < 30; tick++) sim.step(DT);
    assert.ok(body.vel.x < 29, `the live Flea snare slows an outbound hull, got ${body.vel.x}`);
    assert.ok(sim.state.fields.telemetry.affected >= 1);
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
  });
});

function directive() {
  return {
    squadId: 'flea_route', tactic: 'screen', focusTargetId: 1,
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'flea_route' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  };
}

function perception(distance) {
  return {
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: 1, energyFraction: 1, heatFraction: 0,
      operationalMassBand: 'light', activity: { kind: 'attack_run', reason: 'flea_route' }, roe: 'weapons_free',
    },
    contacts: [{
      id: 1, kind: ContactKind.SHIP, team: 0, alive: true, valid: true, visible: true,
      confidence: 1, threat: 0.7, hostile: true, pos: { x: distance, z: 0 }, vel: { x: 0, z: 0 },
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty', tetherabilityBand: 'good', tags: [],
    }],
    events: [],
  };
}

test('the Flea hold ends in a genuine retreat before reform', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1211 });
  let result = runtime.update({
    tick: 0, entityId: 2, doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception(500), directive: directive(),
  });
  assert.equal(result.phase, 'field_spool');
  assert.equal(result.maneuverKind, ManeuverKind.HOLD);

  result = runtime.update({
    tick: 30, entityId: 2, doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception(500), directive: directive(),
  });
  assert.equal(result.phase, 'anchor_hold');

  result = runtime.update({
    tick: 31, entityId: 2, doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception(200), directive: directive(),
  });
  assert.equal(result.phase, 'recover');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);
  assert.equal(result.formationLocked, false);

  result = runtime.update({
    tick: 106, entityId: 2, doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception(300), directive: directive(),
  });
  assert.equal(result.phase, 'recover', 'elapsed time alone cannot fake a retreat while still close');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);

  result = runtime.update({
    tick: 107, entityId: 2, doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception(600), directive: directive(),
  });
  assert.equal(result.phase, 'reform', 'the Flea reforms only after opening real distance');
  assert.equal(result.maneuverKind, ManeuverKind.FORMATION);
});
