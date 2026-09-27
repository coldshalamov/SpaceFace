import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DamagedPortVfxPlanner,
  resolveDamagedPort,
} from '../src/render/vfx/damagedPortVfx.js';

function makeState(overrides = {}) {
  const ship = {
    id: 7,
    type: 'ship',
    alive: true,
    pos: { x: 100, y: 0, z: 40 },
    rot: 0,
    radius: 10,
    hp: 24,
    maxHp: 100,
    data: {},
  };
  const runtime = {
    subsystems: {
      subsystem_drive: {
        health: 0, maxHealth: 45, destroyed: true, effectiveDisabled: true,
      },
      subsystem_weapon: {
        health: 38, maxHealth: 38, destroyed: false, effectiveDisabled: true,
      },
      subsystem_power: {
        health: 52, maxHealth: 52, destroyed: false, effectiveDisabled: false,
      },
    },
  };
  return {
    tick: 60,
    simTime: 1,
    entities: new Map([[ship.id, ship]]),
    combat: { entities: { [ship.id]: runtime } },
    ...overrides,
  };
}

test('hull damage alone does not invent a port release', () => {
  const state = makeState();
  state.combat.entities[7].subsystems.subsystem_drive.destroyed = false;
  state.combat.entities[7].subsystems.subsystem_drive.effectiveDisabled = false;
  state.combat.entities[7].subsystems.subsystem_weapon.effectiveDisabled = false;
  const planner = new DamagedPortVfxPlanner();
  assert.deepEqual(planner.collect(state), [], 'a low hull is not a global damage flag');
});

test('destroyed subsystem resolves to an asymmetric measured combat port', () => {
  const state = makeState();
  const runtime = state.combat.entities[7];
  const record = resolveDamagedPort(state.entities.get(7), runtime, 'subsystem_drive', { ageTicks: 0 });
  assert.equal(record.mode, 'rupture');
  assert.equal(record.subsystemId, 'subsystem_drive');
  assert.equal(record.destroyed, true);
  assert.ok(record.direction.x < -0.9, 'the drive release points from the aft port');
  assert.ok(record.contactPoint.x < state.entities.get(7).pos.x, 'the port is outside the hull centre');
  assert.ok(record.occluder.radius < state.entities.get(7).radius, 'the hull remains the soft occluder');
  assert.ok(record.severity > 0.7, 'a true rupture is stronger than dependency cooling');
  assert.equal(record.phase, 'release');
});

test('planner emits bounded lifecycle pulses and separates dependency cooling', () => {
  const state = makeState();
  const planner = new DamagedPortVfxPlanner();
  const first = planner.collect(state);
  assert.equal(first.length, 2);
  const drive = first.find((row) => row.subsystemId === 'subsystem_drive');
  const child = first.find((row) => row.subsystemId === 'subsystem_weapon');
  assert.equal(drive.phase, 'release');
  assert.equal(child.mode, 'dependencyCooling');
  assert.ok(drive.severity > child.severity * 2, 'dependent cooling is visibly subordinate');
  assert.equal(planner.collect({ ...state, tick: 64 }).length, 0, 'cadence does not replay every render frame');

  const later = planner.collect({ ...state, tick: 69, simTime: 1.15 });
  assert.equal(later.length, 2);
  assert.equal(later[0].pulse, 1);
  assert.notEqual(later[0].seed, first[0].seed, 'successive parcels vary deterministically');

  const recovered = makeState({ tick: 80, simTime: 1.33 });
  recovered.combat.entities[7].subsystems.subsystem_drive.destroyed = false;
  recovered.combat.entities[7].subsystems.subsystem_drive.effectiveDisabled = false;
  recovered.combat.entities[7].subsystems.subsystem_weapon.effectiveDisabled = false;
  assert.deepEqual(planner.collect(recovered), []);
  recovered.tick = 100;
  recovered.combat.entities[7].subsystems.subsystem_drive.destroyed = true;
  recovered.combat.entities[7].subsystems.subsystem_drive.effectiveDisabled = true;
  const rearmed = planner.collect(recovered);
  assert.equal(rearmed.length, 1);
  assert.equal(rearmed[0].phase, 'release', 'a new disable gets a fresh onset');
});

test('dead hulls stop port releases and the planner stays bounded', () => {
  const state = makeState();
  const planner = new DamagedPortVfxPlanner({ maxTracked: 1 });
  assert.equal(planner.collect(state).length, 2);
  state.entities.get(7).alive = false;
  state.tick = 80;
  assert.deepEqual(planner.collect(state), []);
  assert.equal(planner._records.size, 0);
});
