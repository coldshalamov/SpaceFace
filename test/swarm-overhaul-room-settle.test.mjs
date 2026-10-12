import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena } from '../src/systems/swarmArena.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createRunState } from '../src/core/runState.js';

test('between rounds a rock still flying from the last fight is stopped through the physics port', () => {
  const calls = [];
  const sys = Object.create(swarmArena);
  sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
  sys.state = {
    tick: 5,
    entities: new Map([
      [1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 150, z: -20 } }],
      [2, { id: 2, type: 'asteroid', alive: true, mass: 40, vel: { x: 1, z: 0 } }],
      [3, { id: 3, type: 'ship', alive: true, mass: 10, vel: { x: 200, z: 0 } }],
      [4, { id: 4, type: 'wreck', alive: true, radius: 12, vel: { x: 0, z: 75 } }],
    ]),
  };
  sys._settleRoom();
  assert.deepEqual(calls.map((c) => c.entityId), [1, 4], 'moving rocks and wrecks settle; ships keep their momentum');
  const m1 = resolvePhysicsBodySpec(sys.state.entities.get(1)).mass;
  const m4 = resolvePhysicsBodySpec(sys.state.entities.get(4)).mass;
  assert.deepEqual(calls[0].impulse, { x: -150 * m1, z: 20 * m1 }, 'sized on the solver body mass');
  assert.deepEqual(calls[1].impulse, { x: -0 * m4, z: -75 * m4 });
});

function openingRoom(wave) {
  const calls = [];
  const sys = Object.create(swarmArena);
  sys._lessonHoldS = null;
  sys._brood = null;
  sys._hiveRelease = () => {};
  sys._raiseCapacity = () => {};
  sys._cullWrecks = () => {};
  sys._topUp = () => {};
  sys._installSlalomWells = () => {};
  sys._installOpeningLesson = () => {};
  sys._installMassGapWall = () => {};
  sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
  sys.state = {
    tick: 9,
    simTime: 44,
    run: Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), { phase: 'active', wave }),
    entities: new Map([[1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 16, z: 0 } }]]),
    entityList: [],
  };
  return { sys, calls };
}

test('wave 1 does not settle; a later round does, on plan and on start', () => {
  // Seed 4242 idle: parking the opener held foundry rocks at ≤5.8 u/s and the
  // lesson wasp (life 379) rammed them at sim 31.167. Master settles only
  // wave > 1, rocks reached 44 u/s, and that wasp lived the 45s hold.
  for (const method of ['_onWaveStarted', '_onWavePlanned']) {
    const opener = openingRoom(1);
    opener.sys[method](method === '_onWavePlanned' ? { wave: 1 } : undefined);
    assert.deepEqual(opener.calls.map((c) => c.entityId), [], `${method} leaves wave 1 in motion`);
    const later = openingRoom(2);
    later.sys[method](method === '_onWavePlanned' ? { wave: 2 } : undefined);
    assert.deepEqual(later.calls.map((c) => c.entityId), [1], `${method} still stops a later round`);
  }
});

test('a quiet live round does not keep settling rocks', () => {
  const calls = [];
  const sys = Object.create(swarmArena);
  sys._brood = null;
  sys._nextTerrainCheck = 1e9;
  sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
  sys.state = {
    tick: 3,
    simTime: 1,
    mode: 'flight',
    input: { fire: false, moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, autoFire: true },
    run: Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }), { phase: 'active', wave: 1 }),
    entities: new Map([[1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 16, z: 0 }, pos: { x: 0, z: 0 } }]]),
  };
  sys.update();
  sys.state.simTime = 1.5;
  sys.update();
  sys.state.simTime = 3;
  sys.update();
  assert.deepEqual(calls, [], 'wave 1 keeps the field moving until the pilot meets it');
});
