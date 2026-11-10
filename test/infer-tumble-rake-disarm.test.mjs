import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTumbleRakeSeed, readTumbleRake, stepTumbleRake } from '../src/ai/tumbleRake.js';

function encounter() {
  const mount = (subsystemId) => ({ defId: 'wpn_flak_turret_s', subsystemId });
  const heavy = { id: 2, type: 'ship', alive: true, team: 1, mass: 420, rot: 0,
    pos: { x: 0, z: 0 }, data: { weapons: [mount('left'), mount('right')], intent: { fire: true, aimAngle: 0 } } };
  const wing = { id: 3, type: 'ship', alive: true, team: 1, radius: 10, pos: { x: 100, z: 0 } };
  const subsystems = { left: {}, right: {} };
  const state = { playerId: 1, tick: 100, combat: { entities: { 2: { subsystems } } } };
  assert.equal(captureTumbleRakeSeed(state, heavy), true);
  const first = stepTumbleRake(state, heavy, [wing]);
  assert.equal(first.length, 1);
  state.tick += 18;
  return { state, heavy, wing, subsystems, firstDamage: first[0].damage };
}

test('destroying one turret reduces an already spinning heavy battery immediately', () => {
  const h = encounter();
  h.subsystems.left.destroyed = true;
  const hits = stepTumbleRake(h.state, h.heavy, [h.wing]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].damage, h.firstDamage / 2);
  assert.equal(readTumbleRake(h.heavy).localBearing, 0, 'disarming never retargets the frozen bearing');
});

test('a reactor-disabled battery ends the existing sweep and cannot resume without a new salvo', () => {
  const h = encounter();
  h.subsystems.left.effectiveDisabled = true;
  h.subsystems.right.effectiveDisabled = true;
  assert.deepEqual(stepTumbleRake(h.state, h.heavy, [h.wing]), []);
  assert.equal(readTumbleRake(h.heavy), null);
  h.subsystems.left.effectiveDisabled = false;
  h.subsystems.right.effectiveDisabled = false;
  h.state.tick += 18;
  assert.deepEqual(stepTumbleRake(h.state, h.heavy, [h.wing]), []);
});
