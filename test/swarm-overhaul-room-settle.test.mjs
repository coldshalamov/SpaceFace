import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
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

test('every round, including the opener, settles the room as it opens', () => {
  for (const wave of [1, 2]) {
    const calls = [];
    const sys = Object.create(swarmArena);
    sys._lessonHoldS = null;
    sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
    sys.state = {
      tick: 9,
      simTime: 44,
      run: Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), { phase: 'active', wave }),
      entities: new Map([[1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 16, z: 0 } }]]),
      entityList: [],
    };
    sys._onWaveStarted();
    assert.deepEqual(calls.map((c) => c.entityId), [1], `wave ${wave}`);
  }
});

test('until the pilot acts, a live round keeps settling rocks that are still fast', () => {
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
  assert.deepEqual(calls.map((c) => c.entityId), [1]);
  const settled = calls.length;
  sys.state.simTime = 1.2;
  sys.update();
  assert.equal(calls.length, settled, 'the quiet settle waits out its throttle');
  sys.state.simTime = 1.5;
  sys.update();
  assert.equal(calls.length, settled + 1);
  sys.state.input.fire = true;
  noteSwarmPilotAction(sys.state);
  sys.state.simTime = 2;
  sys.update();
  assert.equal(calls.length, settled + 1, 'once the pilot has acted, the room keeps its motion');
});
