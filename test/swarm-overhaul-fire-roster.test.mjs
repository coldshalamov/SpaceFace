// Swarm fire is not rationed (owner, 2026-11-20): "there just shouldn't be rules that only allow
// like 5 enemies to attack while the others are frozen." Every cohort hull that can shoot may
// shoot from the tick it arrives; no shooter cap, no arrival beat, no idle-pilot hold. The pilot's
// first act is still noted (damage admission and the opening beat read it) — it just gates no gun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalWave, SWARM_THREAT_MARK_SCALE } from '../src/systems/survivalWave.js';
import { swarmPilotHasActed } from '../src/systems/swarmSafety.js';

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
  return ai.swarmFireHeld === true || Number(ai.swarmFireHoldUntil) > sys.state.simTime;
};

test('a fresh arrival may fire at once: no arrival hold, every swarm gun is live', () => {
  const sys = world(3);
  sys._shapeSwarmFire();
  for (const id of [10, 11, 12]) assert.equal(held(sys, id), false, `hull ${id} is not held on arrival`);
});

test('no shooter cap: all six wave-1 hulls may fire, not just the two nearest', () => {
  const sys = world(6);
  sys._shapeSwarmFire();
  sys.state.simTime += 3;
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((id) => held(sys, id)), Array(6).fill(false));
});

test('an idle pilot does not freeze the room; the threat mark is still stamped', () => {
  const sys = world(6);
  sys.state.entities.get(10).radius = 12;
  sys.state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  sys.state.input = { fire: false, moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, autoFire: true };
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((id) => held(sys, id)), Array(6).fill(false));
  // Radius-12 wasp: 12 × 1.12 = 13.44. The stroke ends inside 1.2× body radius,
  // which is where the readability background ring starts.
  const mark = sys.state.entities.get(10).data.swarmMarkRadius;
  assert.equal(mark, 12 * SWARM_THREAT_MARK_SCALE);
  assert.ok(mark > 12 && mark <= 12 * 1.2);
});

test('combat-stick axes written under autoFire do not count as a pilot act', () => {
  const sys = world(3);
  sys.state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  // followAutoTargetPath writes these three while autoFire is on. They are the assist.
  sys.state.input = {
    fire: false, moveX: 0.6, moveZ: -1, turnIntent: 0.4, boost: false, brake: false, autoFire: true,
  };
  sys._shapeSwarmFire();
  assert.equal(swarmPilotHasActed(sys.state), false, 'the assist is not the pilot');
  sys.state.input.autoFire = false;
  sys._shapeSwarmFire();
  assert.equal(swarmPilotHasActed(sys.state), true, 'a real stick with autoFire off still latches');
});

test('a hive node holds fire because it has no guns, not because of a rule', () => {
  const sys = world(2);
  sys.state.entities.get(11).data.circuitNode = true;
  sys._shapeSwarmFire();
  assert.equal(held(sys, 10), false);
  assert.equal(held(sys, 11), true);
  assert.equal(sys.state.entities.get(11).data.ai.roe, 'hold_fire');
});

test('Gauntlet rounds are not touched by the swarm shaper', () => {
  const sys = world(6);
  sys._swarm = null;
  sys.state.run = { kind: 'survival', ruleset: 'scored', phase: 'active', wave: 1 };
  sys.state.input = { fire: false, moveX: 0, moveZ: 0, turnIntent: 0, actions: {} };
  sys._shapeSwarmFire();
  assert.deepEqual([10, 11, 12, 13, 14, 15].map(id => held(sys, id)), Array(6).fill(false));
  for (const member of sys._cohort.values()) assert.equal(member.entity.data.swarmMarkRadius, undefined);
});
