import assert from 'node:assert/strict';
import { test } from 'node:test';

import { queueProjectileContinuation } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

function makeProjectile(id, pose) {
  return {
    id,
    type: 'projectile',
    alive: true,
    radius: pose.radius != null ? pose.radius : 0.7,
    mass: 1,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: pose.rot || 0,
    angVel: 0,
    flags: pose.noInterp ? { noInterp: true } : {},
    physicsBody: {
      schemaVersion: 1,
      radius: pose.radius != null ? pose.radius : 0.7,
      mass: 1,
      inertiaY: 1,
      dynamic: true,
      ccd: true,
      material: 'projectile',
      revision: 0,
    },
    data: {},
  };
}

function padFor(radius) {
  return (radius || 0.7) + 0.05;
}

for (const sign of [1, -1]) {
  test(`a bounce continuation seats the body exactly one pad along +${sign > 0 ? 'x' : '-x'}`, async () => {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      const radius = 0.7;
      const impactX = 5;
      const proj = makeProjectile(1, { x: impactX, z: 3, vx: -30 * sign, radius });
      owner.syncFromEntities([proj]);

      const out = { x: 40 * sign, z: 0 };
      assert.equal(queueProjectileContinuation(proj, { velocity: out, yaw: sign > 0 ? 0 : Math.PI, tick: 0 }), true);
      const pad = padFor(radius);
      assert.ok(Math.abs(proj.pos.x - (impactX + pad * sign)) < 1e-9,
        'the membrane mirror already paid the pad once');

      owner.syncFromEntities([proj]);
      owner.step(DT);

      const expected = impactX + pad * sign + out.x * DT;
      assert.ok(Math.abs(proj.pos.x - expected) < 1e-3,
        `one pad total: expected x≈${expected.toFixed(4)}, got ${proj.pos.x.toFixed(4)}`);
      assert.ok(Math.abs(proj.vel.x - out.x) < 1e-6, 'the outgoing velocity is the bounce velocity');
    } finally {
      owner.dispose();
    }
  });
}

test('the one-pad rule holds under a non-zero frame origin and a rebase', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    owner.setFrameOrigin({ x: 200, z: -50 }, 1);
    const radius = 0.7;
    const impactX = 210;
    const proj = makeProjectile(1, { x: impactX, z: -40, vx: -30, radius });
    owner.syncFromEntities([proj]);

    const out = { x: 0, z: 55 };
    assert.equal(queueProjectileContinuation(proj, { velocity: out, yaw: Math.PI / 2, tick: 0 }), true);
    owner.syncFromEntities([proj]);
    owner.step(DT);

    const pad = padFor(radius);
    assert.ok(Math.abs(proj.pos.z - (-40 + pad + out.z * DT)) < 1e-3,
      `one pad in +z under a frame offset: got z=${proj.pos.z.toFixed(4)}`);
    assert.ok(Math.abs(proj.pos.x - impactX) < 1e-3, 'no lateral drift from the frame origin');

    owner.setFrameOrigin({ x: 400, z: -50 }, 2);
    owner.syncFromEntities([proj]);
    owner.step(DT);
    const expectedAfterRebase = -40 + pad + out.z * DT * 2;
    assert.ok(Math.abs(proj.pos.z - expectedAfterRebase) < 1e-3,
      `the rebase must not repay or eat the pad: got z=${proj.pos.z.toFixed(4)}`);
    assert.ok(Math.abs(proj.pos.x - impactX) < 1e-3);
  } finally {
    owner.dispose();
  }
});

test('repeated distinct bounces pay one pad each and the queue consumes once', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const radius = 0.4;
    const pad = padFor(radius);
    const proj = makeProjectile(1, { x: 5, z: 5, vx: 30, radius });
    owner.syncFromEntities([proj]);

    const first = { x: -20, z: 0 };
    queueProjectileContinuation(proj, { velocity: first, yaw: Math.PI, tick: 0 });
    owner.syncFromEntities([proj]);
    owner.step(DT);
    owner.step(DT);

    const afterFirst = 5 - pad + first.x * DT * 2;
    assert.ok(Math.abs(proj.pos.x - afterFirst) < 1e-3,
      `a consumed continuation must not re-apply on later steps: got ${proj.pos.x.toFixed(4)}`);

    const second = { x: 0, z: -25 };
    const beforeSecond = proj.pos.x;
    queueProjectileContinuation(proj, { velocity: second, yaw: -Math.PI / 2, tick: 0 });
    owner.syncFromEntities([proj]);
    owner.step(DT);

    assert.ok(Math.abs(proj.pos.x - beforeSecond) < 1e-3,
      'the second bounce changes direction, not lateral position');
    const expectedZ = 5 - pad + second.z * DT;
    assert.ok(Math.abs(proj.pos.z - expectedZ) < 1e-3,
      `the second bounce pays exactly one pad: expected z≈${expectedZ.toFixed(4)}, got ${proj.pos.z.toFixed(4)}`);
  } finally {
    owner.dispose();
  }
});

test('a tiny radius pad still applies exactly once, under noInterp both ways', async () => {
  for (const noInterp of [false, true]) {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      const radius = 0.05;
      const pad = padFor(radius);
      const impactX = 2;
      const proj = makeProjectile(1, { x: impactX, z: 0, vx: -10, radius, noInterp });
      owner.syncFromEntities([proj]);

      const out = { x: 15, z: 0 };
      queueProjectileContinuation(proj, { velocity: out, yaw: 0, tick: 0 });
      owner.syncFromEntities([proj]);
      owner.step(DT);

      const expected = impactX + pad + out.x * DT;
      assert.ok(Math.abs(proj.pos.x - expected) < 1e-3,
        `noInterp=${noInterp}: expected x≈${expected.toFixed(4)}, got ${proj.pos.x.toFixed(4)}`);
    } finally {
      owner.dispose();
    }
  }
});
