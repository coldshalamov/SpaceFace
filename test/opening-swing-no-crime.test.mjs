import test from 'node:test';
import assert from 'node:assert/strict';
import { lawSecurity } from '../src/systems/lawSecurity.js';

function rig(onboarding) {
  const entities = new Map([
    [1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, data: {} }],
    [2, { id: 2, type: 'ship', team: 0, pos: { x: 30, z: 0 }, data: { civilian: true } }],
  ]);
  const state = { playerId: 1, entities, entityList: [...entities.values()], onboarding, tick: 10, simTime: 5 };
  const sys = Object.create(lawSecurity);
  sys.state = state;
  const calls = [];
  sys._observeInspectionCollateral = () => calls.push('collateral');
  sys._noteHarmOnVictim = () => calls.push('harm');
  sys._emit = () => {};
  return { sys, calls };
}
const hit = { applied: 12, attackerId: 1, targetId: 2, origin: { kind: 'projectile' } };

test('during the opening swing a pilot-caused hit on a civilian opens no law case', () => {
  const { sys, calls } = rig({ active: true, finished: false, beatDoneAt: {} });
  sys._handleDamage(hit);
  assert.deepEqual(calls, [], 'nothing recorded against the pilot');
});

test('after the raid the same hit is handled by the ordinary law rules again', () => {
  const { sys, calls } = rig({ active: true, finished: false, beatDoneAt: { raid: 1 } });
  try { sys._handleDamage(hit); } catch { /* the rest of the rules need a fuller world */ }
  assert.ok(calls.includes('collateral'), 'ordinary handling resumes');
});
