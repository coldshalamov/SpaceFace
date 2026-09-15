// Solver sanity nets (PQ-033.02 soak teleport): a body may never cross the galaxy in one fixed
// step. Corrupted pre-step velocities are clamped before prediction so structural give cannot
// re-arm them, and impossible single-step displacements are reverted to the pre-step pose.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

test('corrupted pre-step velocity is clamped and cannot teleport the player', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 1224, z: -421, vx: -1.5, vz: 4.9 });
    owner.syncFromEntities([player]);
    const rec = owner.records.get(1);
    // The soak failure signature: a ~22M wu/s linvel would integrate ~373k wu in one step.
    rec.body.setLinvel({ x: -22351530, y: 0, z: 0 }, true);
    owner.step(DT);
    const p = rec.body.translation();
    const v = rec.body.linvel();
    assert.ok(Math.hypot(v.x, v.z) <= 2000.01, `linvel must be clamped, got ${v.x},${v.z}`);
    assert.ok(Math.abs(p.x - 1224) < 100, `position must stay bounded, got x=${p.x}`);
    assert.ok(player.pos.x > 0, `entity must not publish a galaxy-scale move, got ${player.pos.x}`);
  } finally {
    owner.dispose?.();
  }
});

test('containing-collider depenetration is reverted to the pre-step pose', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 10, z: 0, vx: -1.5, vz: 4.9 });
    // A collider large enough to contain the player near its center ejects it along the
    // degenerate radial normal in one solver step — the measured 373k wu soak teleport
    // mechanism (deep containment only fires near the center; rim placements depenetrate
    // normally and stay bounded).
    const giant = makeGiant(2, { x: 11, z: 0, radius: 373516 });
    owner.syncFromEntities([player, giant]);
    owner.step(DT);
    const rec = owner.records.get(1);
    const p = rec.body.translation();
    const diag = owner.diagnostics();
    assert.ok((diag.stepDisplacementRejects || 0) >= 1,
      `the deep-containment ejection must actually fire for this test to mean anything`);
    const moved = Math.hypot(p.x - 10, p.z);
    assert.ok(moved <= 101, `depenetration must be reverted, moved ${moved} to ${p.x},${p.z}`);
    assert.ok(player.pos.x < 1000, `entity must not publish the fling, got ${player.pos.x}`);
  } finally {
    owner.dispose?.();
  }
});

test('ordinary flight never trips the sanity nets', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0, vx: 90, vz: 0 });
    const rock = makeRock(2, { x: 400, z: 0 });
    owner.syncFromEntities([player, rock]);
    for (let i = 0; i < 120; i++) owner.step(DT);
    const diag = owner.diagnostics();
    assert.equal(diag.velocitySanityClamps || 0, 0);
    assert.equal(diag.stepDisplacementRejects || 0, 0);
  } finally {
    owner.dispose?.();
  }
});

function makeCraft(id, pose) {
  const radius = 6;
  const mass = 24;
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: pose.isPlayer === true,
    radius,
    mass,
    combatSpeed: 100,
    maxSpeed: 100,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: 48,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    data: { defId: 'ship_kestrel' },
  };
}

function makeRock(id, pose) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 10,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
  };
}

function makeGiant(id, pose) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: pose.radius,
    mass: 1e12,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: pose.radius,
      mass: 1e12,
      inertiaY: 1e12,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
  };
}
