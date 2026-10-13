// Swarm fire shaping: only the nearest few cohort hulls may shoot at the pilot at once,
// fresh arrivals hold a beat, and a hull the pilot just hit may always answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalWave, SWARM_THREAT_MARK_SCALE } from '../src/systems/survivalWave.js';

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

test('an idle swarm round holds every gun until the pilot acts', () => {
  const sys = world(6);
  sys.state.entities.get(10).radius = 12;
  sys.state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  sys.state.input = { fire: false, moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, autoFire: true };
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((id) => held(sys, id)), [true, true, true, true, true, true]);
  // Radius-12 wasp: 12 × 1.12 = 13.44. The stroke ends inside 1.2× body radius,
  // which is where the readability background ring starts.
  const mark = sys.state.entities.get(10).data.swarmMarkRadius;
  assert.equal(mark, 12 * SWARM_THREAT_MARK_SCALE);
  assert.ok(mark > 12 && mark <= 12 * 1.2);
  sys.state.input.fire = true;
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((id) => held(sys, id)), [false, false, true, true, true, true]);
});

test('combat-stick axes written under autoFire do not count as a pilot act', () => {
  const sys = world(3);
  sys.state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  // followAutoTargetPath writes these three while autoFire is on. They are the assist.
  sys.state.input = {
    fire: false, moveX: 0.6, moveZ: -1, turnIntent: 0.4, boost: false, brake: false, autoFire: true,
  };
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12].map((id) => held(sys, id)), [true, true, true]);
  sys.state.input.autoFire = false;
  sys._shapeSwarmFire();
  assert.equal(held(sys, 10), false, 'a real stick with autoFire off still latches');
});

test('later waves clear more guns at once', () => {
  const sys = world(8, { wave: 4 });
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._cursor = 30;
  sys._shapeSwarmFire();
  assert.equal([10, 11, 12, 13, 14, 15, 16, 17].filter((id) => !held(sys, id)).length, 4);
});
