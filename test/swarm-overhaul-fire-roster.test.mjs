// Swarm fire shaping: only the nearest few cohort hulls may shoot at the pilot at once,
// fresh arrivals hold a beat, and a hull the pilot just hit may always answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalWave } from '../src/systems/survivalWave.js';

function world(n, { wave = 1, simTime = 10 } = {}) {
  const entities = new Map([[1, { id: 1, alive: true, pos: { x: 0, z: 0 } }]]);
  const cohort = new Map();
  for (let i = 0; i < n; i++) {
    const id = 10 + i;
    const e = { id, alive: true, pos: { x: 100 + i * 50, z: 0 }, data: { ai: {} } };
    entities.set(id, e);
    cohort.set(id, { role: 'chaff', entity: e });
  }
  const sys = Object.create(survivalWave);
  Object.assign(sys, { state: { playerId: 1, simTime, entities }, _swarm: {}, _cohort: cohort, _wave: wave, _cursor: 0, _bossIds: new Set() });
  return sys;
}
const held = (sys, id) => {
  const ai = sys.state.entities.get(id).data.ai;
  return Math.max(Number(ai.arrivalHoldUntil) || 0, Number(ai.swarmFireHoldUntil) || 0) > sys.state.simTime;
};

test('a fresh arrival holds its guns for the arrival beat', () => {
  const sys = world(3);
  sys._shapeSwarmFire();
  for (const id of [10, 11, 12]) assert.ok(held(sys, id), `hull ${id} holds on arrival`);
});

test('wave 1 clears only the two nearest hulls to shoot; the rest hold', () => {
  const sys = world(6);
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((id) => held(sys, id)), [false, false, true, true, true, true]);
});

test('a hull the pilot just hit may answer even when it is not the nearest', () => {
  const sys = world(6);
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys.state.entities.get(15).lastDamageT = sys.state.simTime - 0.5;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.equal(held(sys, 15), false);
  assert.equal(held(sys, 10), false);
  assert.equal(held(sys, 11), true, 'the cap still holds: the answering hull takes a slot');
});

test('later waves clear more guns at once', () => {
  const sys = world(8, { wave: 4 });
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.equal([10, 11, 12, 13, 14, 15, 16, 17].filter((id) => !held(sys, id)).length, 4);
});
