// Tuning lab #236: under rapier-dynamic the body owns a projectile's position, so the homing steer
// (weapons._steerHoming rewrites entity.vel) has to reach the body or the missile flies its launch line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

function fakeRec(vx, vz) {
  const rec = { spec: { dynamic: true }, writes: [], v: { x: vx, y: 0, z: vz } };
  rec.body = { linvel: () => rec.v, setLinvel: (v) => { rec.writes.push({ ...v }); rec.v = { ...v }; } };
  return rec;
}

test('a steered missile pushes its new velocity into the body', async () => {
  const owner = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  try {
    const rec = fakeRec(180, 0);
    owner._syncGuidedVelocity(rec, { type: 'projectile', data: { kind: 'missile' }, vel: { x: 150, z: 99 } });
    assert.equal(rec.writes.length, 1);
    assert.deepEqual(rec.v, { x: 150, y: 0, z: 99 });
    owner._syncGuidedVelocity(rec, { type: 'projectile', data: { kind: 'missile' }, vel: { x: 150, z: 99 } });
    assert.equal(rec.writes.length, 1, 'no write when the body already matches');
  } finally { owner.dispose(); }
});

test('bullets and ships keep body-owned velocity', async () => {
  const owner = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  try {
    const bullet = fakeRec(300, 0);
    owner._syncGuidedVelocity(bullet, { type: 'projectile', data: { kind: 'bullet' }, vel: { x: 0, z: 300 } });
    const ship = fakeRec(50, 0);
    owner._syncGuidedVelocity(ship, { type: 'ship', data: {}, vel: { x: 0, z: 50 } });
    assert.equal(bullet.writes.length + ship.writes.length, 0);
  } finally { owner.dispose(); }
});
