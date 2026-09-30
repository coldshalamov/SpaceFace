import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  writePhysicsControl,
  queuePhysicsTorqueImpulse,
} from '../src/core/physicsAuthority.js';
import { surfaceContactFromBodies } from '../src/core/surfaceContact.js';
import {
  COLLISION_PROXY_MANIFESTS,
  proxyWorldPrimitives,
} from '../src/data/collisionProxyManifests.js';

const DT = 1 / 60;

function makeCapsuleShip(id, pose = {}) {
  const radius = 10;
  return {
    id,
    type: 'ship',
    alive: true,
    radius,
    mass: 20,
    combatSpeed: 100,
    maxSpeed: 100,
    pos: { x: pose.x || 0, z: pose.z || 0 },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: pose.rot || 0,
    angVel: pose.wy || 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass: 20,
      inertiaY: 1000,
      dynamic: true,
      ccd: false,
      shape: 'capsule',
      revision: 0,
    },
    data: { proportions: { length: 4, halfWidth: 0.1, height: 0.2 } },
  };
}

function makeGate(id, pose = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 50,
    mass: 1_000_000,
    pos: { x: pose.x || 0, z: pose.z || 0 },
    vel: { x: 0, z: 0 },
    rot: pose.rot || 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: 50,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    data: { collisionProxy: 'gate_jump_ring', dockRadius: 50 },
  };
}

function makeOwner() {
  return createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
}

async function capsuleCollider(owner, ship) {
  const rec = owner.records.get(ship.id);
  assert.ok(rec && rec.collider, 'ship record and collider must exist');
  return rec.collider;
}

function pointInside(collider, x, z) {
  return collider.projectPoint({ x, y: 0, z }, true).isInside === true;
}

function pointInsideAny(colliders, x, z) {
  return colliders.some((collider) => pointInside(collider, x, z));
}

for (const rot of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
  test(`asymmetric capsule collider faces the simulation heading at rot ${rot}`, async () => {
    const owner = await makeOwner();
    try {
      const ship = makeCapsuleShip(1, { rot });
      owner.syncFromEntities([ship]);
      const collider = await capsuleCollider(owner, ship);
      const fx = Math.cos(rot);
      const fz = Math.sin(rot);
      assert.equal(pointInside(collider, fx * 12, fz * 12), true,
        `visible nose point (${(fx * 12).toFixed(2)}, ${(fz * 12).toFixed(2)}) must be inside the collider`);
      assert.equal(pointInside(collider, fx * 19.4, fz * 19.4), true,
        'the capsule tip along the simulation heading must be inside the collider');
      const mirroredX = Math.cos(rot) * 12;
      const mirroredZ = -Math.sin(rot) * 12;
      if (Math.abs(Math.sin(2 * rot)) > 0.5) {
        assert.equal(pointInside(collider, mirroredX, mirroredZ), false,
          `mirrored-only point (${mirroredX.toFixed(2)}, ${mirroredZ.toFixed(2)}) must be outside the collider`);
      }
    } finally {
      owner.dispose();
    }
  });
}

for (const rot of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
  test(`compound gate proxy colliders land on rotated manifest offsets at rot ${rot}`, async () => {
    const owner = await makeOwner();
    try {
      const gate = makeGate(7, { rot });
      owner.syncFromEntities([gate]);
      const rec = owner.records.get(gate.id);
      assert.ok(rec && Array.isArray(rec.colliders) && rec.colliders.length === 3,
        'gate manifest must produce the three authored colliders');
      const expected = proxyWorldPrimitives(gate, COLLISION_PROXY_MANIFESTS.gate_jump_ring);
      for (const primitive of expected) {
        const match = rec.colliders.find((collider) => {
          const t = collider.translation();
          return Math.hypot(t.x - primitive.x, t.z - primitive.z) < 1e-3;
        });
        assert.ok(match, `no collider at manifest offset (${primitive.x.toFixed(2)}, ${primitive.z.toFixed(2)}) for ${primitive.id}`);
      }
      const hub = expected.find((p) => p.id === 'hub');
      assert.equal(pointInsideAny(rec.colliders, hub.x, hub.z), true,
        'the rotated hub offset must be inside the compound');
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const mx = c * -14;
      const mz = -s * -14;
      assert.equal(pointInsideAny(rec.colliders, mx, mz), false,
        `mirrored hub offset (${mx.toFixed(2)}, ${mz.toFixed(2)}) must not be inside`);
    } finally {
      owner.dispose();
    }
  });
}

test('a positive simulation torque turns the hull and its physical nose positive', async () => {
  const owner = await makeOwner();
  try {
    const ship = makeCapsuleShip(1, {});
    owner.syncFromEntities([ship]);
    const collider = owner.records.get(ship.id).collider;
    for (let i = 0; i < 30; i++) {
      writePhysicsControl(ship, { mode: 'assist', torque: { y: 60 }, source: 'test' });
      owner.step(DT);
    }
    assert.ok(ship.angVel > 0.015, `positive torque must spin the hull positive (angVel ${ship.angVel})`);
    assert.ok(ship.rot > 0.004, `positive torque must yaw the hull positive (rot ${ship.rot})`);
    const fx = Math.cos(ship.rot);
    const fz = Math.sin(ship.rot);
    assert.equal(pointInside(collider, ship.pos.x + fx * 15, ship.pos.z + fz * 15), true,
      'the physical nose must track the simulation yaw, not its mirror');
    const snapshot = owner.quantizedSnapshot().find((row) => row.id === ship.id);
    assert.ok(snapshot && snapshot.wy > 0, `snapshot wy must expose the simulation sign (${snapshot && snapshot.wy})`);
  } finally {
    owner.dispose();
  }
});

test('a positive queued torque impulse turns the hull and its physical nose positive', async () => {
  const owner = await makeOwner();
  try {
    const ship = makeCapsuleShip(1, {});
    owner.syncFromEntities([ship]);
    const collider = owner.records.get(ship.id).collider;
    queuePhysicsTorqueImpulse(ship, { y: 800 });
    for (let i = 0; i < 30; i++) owner.step(DT);
    assert.ok(ship.angVel > 0.1, `positive torque impulse must spin the hull positive (angVel ${ship.angVel})`);
    assert.ok(ship.rot > 0.05, `positive torque impulse must yaw the hull positive (rot ${ship.rot})`);
    const fx = Math.cos(ship.rot);
    const fz = Math.sin(ship.rot);
    assert.equal(pointInside(collider, ship.pos.x + fx * 15, ship.pos.z + fz * 15), true,
      'the physical nose must track the impulse-driven simulation yaw');
  } finally {
    owner.dispose();
  }
});

test('an off-centre impulse on an NPC spins the hull with the simulation sign', async () => {
  const owner = await makeOwner();
  try {
    const ship = makeCapsuleShip(1, {});
    owner.syncFromEntities([ship]);
    const collider = owner.records.get(ship.id).collider;
    owner.step(DT);
    owner.applyImpulse({ entityId: ship.id, impulse: { x: 0, y: 0, z: -50 }, point: { x: 10, y: 0, z: 0 } });
    for (let i = 0; i < 10; i++) owner.step(DT);
    assert.ok(ship.angVel < -0.01,
      `a backward push on the +X flank must yaw the nose toward -Z in simulation units (angVel ${ship.angVel})`);
    assert.ok(ship.rot < 0, `rot must integrate the same simulation sign (rot ${ship.rot})`);
    const fx = Math.cos(ship.rot);
    const fz = Math.sin(ship.rot);
    assert.equal(pointInside(collider, ship.pos.x + fx * 15, ship.pos.z + fz * 15), true,
      'the physical nose must track the spin');
  } finally {
    owner.dispose();
  }
});

test('moving-surface velocity matches the derivative of a rotating point', () => {
  const surface = {
    id: 9,
    pos: { x: 0, z: 0 },
    vel: { x: 3, z: 4 },
    angVel: 2,
    data: {},
  };
  const projectile = { id: 8, pos: { x: 5, z: 0 }, vel: { x: 1, z: 0 } };
  const at = surfaceContactFromBodies(projectile, surface, { point: { x: 5, z: 0 }, normal: { x: 1, z: 0 } });
  assert.ok(Math.abs(at.surfaceVelocity.x - 3) < 1e-5,
    `sv.x must be vel.x - w*rz = 3 (got ${at.surfaceVelocity.x})`);
  assert.ok(Math.abs(at.surfaceVelocity.z - 14) < 1e-5,
    `sv.z must be vel.z + w*rx = 14 (got ${at.surfaceVelocity.z})`);
  const at2 = surfaceContactFromBodies(projectile, surface, { point: { x: 0, z: 5 }, normal: { x: 0, z: 1 } });
  assert.ok(Math.abs(at2.surfaceVelocity.x - (3 - 10)) < 1e-5,
    `sv.x at (0,5) must be 3 - 2*5 = -7 (got ${at2.surfaceVelocity.x})`);
  assert.ok(Math.abs(at2.surfaceVelocity.z - 4) < 1e-5,
    `sv.z at (0,5) must be vel.z (got ${at2.surfaceVelocity.z})`);
});

test('rope local anchors compose with the simulation rotation convention', async () => {
  const owner = await makeOwner();
  try {
    const a = makeCapsuleShip(1, { x: 0, z: 0, rot: Math.PI / 3 });
    const b = makeCapsuleShip(2, { x: 30, z: 0, rot: -Math.PI / 6 });
    owner.syncFromEntities([a, b]);
    const ok = owner.createAttachment({
      attachmentId: 'rope-1',
      ownerId: a.id,
      targetId: b.id,
      sourceAnchorLocal: { x: 6, z: 0 },
      targetAnchorLocal: { x: -6, z: 0 },
      restLength: 24,
    });
    assert.ok(ok, 'attachment creation must succeed');
    const telemetry = owner.getAttachmentTelemetry({ attachmentId: 'rope-1' });
    assert.ok(telemetry && telemetry.sourceWorld && telemetry.targetWorld, 'telemetry must expose world anchors');
    const ca = Math.PI / 3;
    const cb = -Math.PI / 6;
    const expectedSource = { x: 6 * Math.cos(ca), z: 6 * Math.sin(ca) };
    const expectedTarget = { x: 30 - 6 * Math.cos(cb), z: -6 * Math.sin(cb) };
    assert.ok(Math.hypot(telemetry.sourceWorld.x - expectedSource.x, telemetry.sourceWorld.z - expectedSource.z) < 1e-3,
      `source anchor must compose sim-rotated (got ${JSON.stringify(telemetry.sourceWorld)}, want ${JSON.stringify(expectedSource)})`);
    assert.ok(Math.hypot(telemetry.targetWorld.x - expectedTarget.x, telemetry.targetWorld.z - expectedTarget.z) < 1e-3,
      `target anchor must compose sim-rotated (got ${JSON.stringify(telemetry.targetWorld)}, want ${JSON.stringify(expectedTarget)})`);
  } finally {
    owner.dispose();
  }
});

test('save/reload rebuild reproduces the same rotated collider pose', async () => {
  const ship = makeCapsuleShip(1, { rot: Math.PI / 4 });
  const first = await makeOwner();
  let tip1;
  try {
    first.syncFromEntities([ship]);
    const collider = first.records.get(ship.id).collider;
    const projected = collider.projectPoint({ x: Math.cos(ship.rot) * 19.4, y: 0, z: Math.sin(ship.rot) * 19.4 }, true);
    assert.equal(projected.isInside, true);
    tip1 = collider.rotation();
    for (let i = 0; i < 5; i++) first.step(DT);
  } finally {
    first.dispose();
  }
  const second = await makeOwner();
  try {
    second.syncFromEntities([ship]);
    const collider = second.records.get(ship.id).collider;
    const tip2 = collider.rotation();
    for (const key of ['x', 'y', 'z', 'w']) {
      assert.ok(Math.abs(tip1[key] - tip2[key]) < 1e-6, `rebuilt collider quaternion drifted on ${key}`);
    }
  } finally {
    second.dispose();
  }
});
