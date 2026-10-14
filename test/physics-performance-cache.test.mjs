import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPhysicsAuthority,
  queueProjectileContinuation,
  queuePhysicsTorqueImpulse,
  queueSaucerVelocity,
  readPhysicsTelemetry,
  writePhysicsControl,
  writePhysicsTelemetry,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

function ship(id, isPlayer = false) {
  return {
    id,
    occupantGeneration: 1,
    type: 'ship',
    alive: true,
    isPlayer,
    radius: 6,
    mass: 24,
    maxSpeed: 120,
    combatSpeed: 120,
    pos: { x: id * 80, z: 0 },
    vel: { x: 10, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
    data: { defId: 'ship_kestrel' },
    physicsBody: {
      schemaVersion: 1,
      radius: 6,
      mass: 24,
      inertiaY: 48,
      dynamic: true,
      ccd: false,
      revision: 0,
    },
  };
}

function expectedRow(rec) {
  return {
    x: rec.expected.x,
    z: rec.expected.z,
    vx: rec.expected.vx,
    vz: rec.expected.vz,
    wy: rec.expected.wy,
    yaw: rec.expected.yaw,
  };
}

function cloneEntity(entity) {
  return structuredClone(entity);
}

function missile(id) {
  const entity = ship(id);
  entity.type = 'projectile';
  entity.radius = 0.7;
  entity.mass = 1;
  entity.pos = { x: id * 80, z: 40 };
  entity.vel = { x: 22, z: -7 };
  entity.rot = -0.25;
  entity.data = { kind: 'missile' };
  entity.physicsBody = {
    schemaVersion: 1,
    radius: 0.7,
    mass: 1,
    inertiaY: 1,
    dynamic: true,
    ccd: true,
    material: 'projectile',
    revision: 0,
  };
  return entity;
}

function quatForYaw(yaw) {
  return {
    x: 0,
    y: -Math.sin(yaw / 2),
    z: 0,
    w: Math.cos(yaw / 2),
  };
}

function angleDelta(a, b) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function installExpectedCaptureProbe(owner, { forceNativeYaw = false } = {}) {
  const rows = new Map();
  const nativeCapture = owner._captureExpectedKinematics.bind(owner);
  owner._captureExpectedKinematics = rec => {
    if (forceNativeYaw) {
      // The reference arm deliberately disables only the new expected-yaw mirror. Angular
      // sampling remains on the production path so this isolates the yaw optimization.
      rec._preStepYawCaptureOpen = false;
      rec._preStepYawValid = false;
    }
    nativeCapture(rec);
    rows.set(rec.entity.id, expectedRow(rec));
  };
  return rows;
}

function assertYawCacheInvalid(rec, message) {
  assert.equal(rec._preStepYawCaptureOpen, false, `${message}: cache must be closed`);
  assert.equal(rec._preStepYawValid, false, `${message}: cache must be invalid`);
}

test('pre-step angular sampling removes duplicate Rapier getter work', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const actor = ship(1);
    owner.syncFromEntities([actor]);
    owner.step(DT);

    const rec = owner.records.get(actor.id);
    assert.ok(rec, 'dynamic record should exist');
    const nativeAngvel = rec.body.angvel.bind(rec.body);
    let reads = 0;
    rec.body.angvel = (...args) => {
      reads++;
      return nativeAngvel(...args);
    };

    for (let tick = 0; tick < 8; tick++) {
      writePhysicsControl(actor, {
        mode: 'assisted',
        force: { x: 8, z: 0 },
        torque: { y: 3 },
        maxSpeed: 120,
      });
      if (tick % 2 === 0) queuePhysicsTorqueImpulse(actor, { y: 12 });
      owner.syncFromEntities([actor]);
      owner.step(DT, tick);
    }

    // One native read remains for the command torque clamp and one for the post-solve readback.
    // The queued impulse and expected kinematics capture consume the retained pre-step sample.
    assert.equal(reads, 16);
  } finally {
    owner.dispose();
  }
});

test('pre-step angular cache preserves control and torque snapshots', async () => {
  const [optimized, fallback] = await Promise.all([
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
  ]);
  try {
    const actors = [ship(1), ship(1)];
    optimized.syncFromEntities([actors[0]]);
    fallback.syncFromEntities([actors[1]]);
    const capture = fallback._captureExpectedKinematics.bind(fallback);
    fallback._captureExpectedKinematics = rec => {
      // Force the old native-read path for the reference owner while leaving all solver and
      // structural-give behavior identical.
      rec._preStepAngularCaptureOpen = false;
      return capture(rec);
    };

    for (let tick = 0; tick < 40; tick++) {
      const control = {
        mode: 'assisted',
        force: { x: tick < 20 ? 8 : -4, z: 2 },
        torque: { y: tick % 3 === 0 ? 5 : -2 },
        maxSpeed: 120,
      };
      writePhysicsControl(actors[0], control);
      writePhysicsControl(actors[1], control);
      if (tick % 4 === 0) {
        queuePhysicsTorqueImpulse(actors[0], { y: 20 });
        queuePhysicsTorqueImpulse(actors[1], { y: 20 });
      }
      optimized.syncFromEntities([actors[0]]);
      fallback.syncFromEntities([actors[1]]);
      optimized.step(DT, tick);
      fallback.step(DT, tick);
      assert.deepEqual(
        optimized.quantizedSnapshot(),
        fallback.quantizedSnapshot(),
        `optimized and fallback native snapshots diverged at tick ${tick}`,
      );
    }
  } finally {
    optimized.dispose();
    fallback.dispose();
  }
});

test('pre-step angular cache matches native f32 across fractional impulses and saucer halt', async () => {
  const [optimized, fallback] = await Promise.all([
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
  ]);
  try {
    const optimizedRegular = ship(1);
    const optimizedSaucer = ship(2, true);
    const fallbackRegular = ship(1);
    const fallbackSaucer = ship(2, true);
    for (const actor of [optimizedRegular, fallbackRegular]) {
      actor.angVel = 0.123456789;
    }
    for (const actor of [optimizedSaucer, fallbackSaucer]) {
      actor.data.defId = 'ship_saucer';
      actor.angVel = -0.7654321987654321;
    }
    optimized.syncFromEntities([optimizedRegular, optimizedSaucer]);
    fallback.syncFromEntities([fallbackRegular, fallbackSaucer]);

    const optimizedExpected = new Map();
    const fallbackExpected = new Map();
    const optimizedSaucerPreStep = [];
    const optimizedCapture = optimized._captureExpectedKinematics.bind(optimized);
    optimized._captureExpectedKinematics = rec => {
      if (rec.entity.id === 2) optimizedSaucerPreStep.push(rec._preStepAngvelY);
      optimizedCapture(rec);
      optimizedExpected.set(rec.entity.id, expectedRow(rec));
    };
    const fallbackCapture = fallback._captureExpectedKinematics.bind(fallback);
    fallback._captureExpectedKinematics = rec => {
      // Force the old native getter path for the reference owner. The body is real Rapier in
      // both owners; only the retained pre-step scalar is disabled here.
      rec._preStepAngularCaptureOpen = false;
      fallbackCapture(rec);
      fallbackExpected.set(rec.entity.id, expectedRow(rec));
    };

    for (let tick = 0; tick < 6; tick++) {
      const control = {
        mode: 'assisted',
        force: { x: 3.25, z: -1.75 },
        torque: { y: tick % 2 ? -2.375 : 4.625 },
        maxSpeed: 120,
      };
      writePhysicsControl(optimizedRegular, control);
      writePhysicsControl(fallbackRegular, control);
      writePhysicsControl(optimizedSaucer, control);
      writePhysicsControl(fallbackSaucer, control);
      // These values are deliberately not exactly representable as f32 and are applied in one
      // command so the second/third write must continue from Rapier's quantized prior value.
      const impulses = [0.123456789, -0.987654321, 1.23456789];
      for (const y of impulses) {
        queuePhysicsTorqueImpulse(optimizedRegular, { y });
        queuePhysicsTorqueImpulse(fallbackRegular, { y });
        queuePhysicsTorqueImpulse(optimizedSaucer, { y });
        queuePhysicsTorqueImpulse(fallbackSaucer, { y });
      }
      assert.equal(queueSaucerVelocity(
        optimizedSaucer,
        { x: 173.125 + tick * 0.25, z: -81.875 },
        { tick, haltYaw: true },
      ), true);
      assert.equal(queueSaucerVelocity(
        fallbackSaucer,
        { x: 173.125 + tick * 0.25, z: -81.875 },
        { tick, haltYaw: true },
      ), true);
      optimized.syncFromEntities([optimizedRegular, optimizedSaucer]);
      fallback.syncFromEntities([fallbackRegular, fallbackSaucer]);
      optimized.step(DT, tick);
      fallback.step(DT, tick);

      assert.deepEqual(
        optimizedExpected,
        fallbackExpected,
        `optimized and native-read expected kinematics diverged at tick ${tick}`,
      );
      assert.equal(optimizedSaucerPreStep[tick], 0, 'saucer haltYaw must clear cached angular rate');
    }
  } finally {
    optimized.dispose();
    fallback.dispose();
  }
});

test('sleeping skip closes pre-step angular cache before out-of-phase native writes', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const actor = ship(3);
    actor.vel = { x: 0, z: 0 };
    actor.activity = { simTier: 'S2_ABSTRACT' };
    owner.syncFromEntities([actor]);
    const rec = owner.records.get(actor.id);
    assert.ok(rec, 'sleep-eligible dynamic record should exist');

    let sleptAt = -1;
    for (let tick = 0; tick < 180; tick++) {
      owner.step(DT, tick);
      if (rec.body.isSleeping() === true) {
        sleptAt = tick;
        break;
      }
    }
    assert.ok(sleptAt >= 0, 'real Rapier body should enter the eligible sleeping island');

    // This commandless turn takes both sleeping skips and therefore must close the pre-step
    // cache before any public/native writes can occur between owner turns.
    owner.step(DT, sleptAt + 1);
    assert.equal(rec._postStepSleepSkip, true);
    assert.equal(rec._preStepAngularCaptureOpen, false);
    assert.equal(rec._preStepAngularValid, false);

    // The first out-of-phase torque call would populate a still-open cache in the old lifecycle.
    // A native write then changes the body before the second call; the second call must reread
    // that native value rather than use the stale first-call sample.
    assert.equal(owner.applyTorqueImpulse({
      entityId: actor.id,
      impulse: { y: 0.314159265 },
    }), true);
    const externalY = 0.2718281828;
    rec.body.setAngvel({ x: 0, y: externalY, z: 0 }, true);
    const nativeY = rec.body.angvel().y;
    const secondImpulse = 0.111111113;
    assert.equal(owner.applyTorqueImpulse({
      entityId: actor.id,
      impulse: { y: secondImpulse },
    }), true);
    assert.equal(
      rec.body.angvel().y,
      Math.fround(nativeY - secondImpulse / rec.effectiveInertiaY),
      'out-of-phase torque must continue from the external native write',
    );
  } finally {
    owner.dispose();
  }
});

test('expected-yaw mirror matches native f32 across torque and missile continuations', async () => {
  const [optimized, fallback] = await Promise.all([
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
    createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT }),
  ]);
  try {
    const optimizedActors = [ship(1), missile(2)];
    const fallbackActors = optimizedActors.map(cloneEntity);
    optimized.syncFromEntities(optimizedActors);
    fallback.syncFromEntities(fallbackActors);
    const optimizedRows = installExpectedCaptureProbe(optimized);
    const fallbackRows = installExpectedCaptureProbe(fallback, { forceNativeYaw: true });
    const optimizedRegular = optimized.records.get(1);
    const fallbackRegular = fallback.records.get(1);
    const nativeOptimizedRotation = optimizedRegular.body.rotation.bind(optimizedRegular.body);
    const nativeFallbackRotation = fallbackRegular.body.rotation.bind(fallbackRegular.body);
    let optimizedRotationReads = 0;
    let fallbackRotationReads = 0;
    optimizedRegular.body.rotation = (...args) => {
      optimizedRotationReads++;
      return nativeOptimizedRotation(...args);
    };
    fallbackRegular.body.rotation = (...args) => {
      fallbackRotationReads++;
      return nativeFallbackRotation(...args);
    };

    for (let tick = 0; tick < 30; tick++) {
      const control = {
        mode: 'assisted',
        force: { x: tick % 5 === 0 ? 7.25 : -2.5, z: 1.125 },
        torque: { y: tick % 4 === 0 ? 3.75 : -1.625 },
        maxSpeed: 120,
      };
      writePhysicsControl(optimizedActors[0], control);
      writePhysicsControl(fallbackActors[0], control);
      if (tick % 3 === 0) {
        queuePhysicsTorqueImpulse(optimizedActors[0], { y: 0.123456789 });
        queuePhysicsTorqueImpulse(fallbackActors[0], { y: 0.123456789 });
      }
      // A continuation is an owner-side direct pose write. It must invalidate the mirror for
      // that projectile, then recapture from Rapier's f32 quaternion rather than stale kin.yaw.
      if (tick % 5 === 0) {
        const continuation = {
          velocity: { x: 31.375 + tick * 0.125, z: -9.625 },
          yaw: -1.23456789 + tick * 0.03125,
          tick,
        };
        assert.equal(queueProjectileContinuation(optimizedActors[1], continuation), true);
        assert.equal(queueProjectileContinuation(fallbackActors[1], continuation), true);
      }
      optimized.syncFromEntities(optimizedActors);
      fallback.syncFromEntities(fallbackActors);
      optimized.step(DT, tick);
      fallback.step(DT, tick);

      for (const id of [1, 2]) {
        const expected = optimizedRows.get(id);
        const reference = fallbackRows.get(id);
        assert.ok(expected && reference, `both arms must capture expected row ${id}`);
        for (const key of ['x', 'z', 'vx', 'vz', 'wy']) {
          assert.ok(Math.abs(expected[key] - reference[key]) < 1e-12,
            `expected ${key} diverged for ${id} at tick ${tick}`);
        }
        assert.ok(Math.abs(angleDelta(expected.yaw, reference.yaw)) < 1e-12,
          `expected yaw diverged for ${id} at tick ${tick}`);
      }
      assert.deepEqual(
        optimized.quantizedSnapshot(),
        fallback.quantizedSnapshot(),
        `optimized and native-read snapshots diverged at tick ${tick}`,
      );
    }

    // One regular-body expected yaw read disappears per fixed step; the post-step authoritative
    // read remains in both arms. This makes the optimization observable without hiding writes.
    assert.ok(optimizedRotationReads < fallbackRotationReads,
      `expected-yaw mirror should reduce native rotation reads (${optimizedRotationReads} < ${fallbackRotationReads})`);
  } finally {
    optimized.dispose();
    fallback.dispose();
  }
});

test('sleeping expected-yaw cache falls back after an external native rotation', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const actor = ship(7);
    actor.vel = { x: 0, z: 0 };
    actor.activity = { simTier: 'S2_ABSTRACT' };
    owner.syncFromEntities([actor]);
    const rec = owner.records.get(actor.id);
    assert.ok(rec, 'sleep-eligible body should be present');

    let sleptAt = -1;
    for (let tick = 0; tick < 180; tick++) {
      owner.step(DT, tick);
      if (rec.body.isSleeping() === true) {
        sleptAt = tick;
        break;
      }
    }
    assert.ok(sleptAt >= 0, 'real Rapier body should enter the eligible sleeping island');
    owner.step(DT, sleptAt + 1);
    assert.equal(rec._postStepSleepSkip, true, 'the preceding tick must take the sleeping skip');
    assertYawCacheInvalid(rec, 'sleep skip');

    const externalYaw = 1.23456789;
    rec.body.setRotation(quatForYaw(externalYaw), false);
    assert.equal(rec.body.isSleeping(), true, 'the test write must remain outside the owner turn');
    rec.body.wakeUp();
    actor.physicsSleeping = false;
    writePhysicsControl(actor, {
      mode: 'assisted',
      force: { x: 0, z: 0 },
      torque: { y: 0 },
      maxSpeed: 120,
    });
    owner.syncFromEntities([actor]);
    let expected;
    const nativeCapture = owner._captureExpectedKinematics.bind(owner);
    owner._captureExpectedKinematics = bodyRecord => {
      nativeCapture(bodyRecord);
      expected = expectedRow(bodyRecord);
    };
    owner.step(DT, sleptAt + 2);
    assert.ok(expected, 'woken body must run expected-kinematics capture');
    assert.ok(Math.abs(angleDelta(expected.yaw, externalYaw)) < 1e-7,
      `expected yaw must use the external native pose (${expected.yaw} vs ${externalYaw})`);
  } finally {
    owner.dispose();
  }
});

test('rebind and native snapshot adoption invalidate expected-yaw cache state', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const actor = ship(8);
    actor.rot = 0.73;
    owner.syncFromEntities([actor]);
    owner.step(DT, 0);
    const rec = owner.records.get(actor.id);
    assert.ok(rec, 'record should exist before rebind');

    const replacement = cloneEntity(actor);
    assert.equal(owner.rebindEntity(replacement), true, 'same-state restored entity should rebind');
    assertYawCacheInvalid(owner.records.get(actor.id), 'entity rebind');

    const payload = owner.exportWorldSnapshot();
    assert.ok(payload, 'real Rapier owner should export a native snapshot');
    assert.equal(owner.canonicalizeWorldSnapshot(payload), true,
      'native snapshot canonicalization should commit');
    const restored = owner.records.get(actor.id);
    assert.ok(restored, 'snapshot adoption should retain the dynamic record');
    assertYawCacheInvalid(restored, 'native snapshot adoption');
  } finally {
    owner.dispose();
  }
});

test('physics telemetry shares unchanged immutable value parts across fresh ticks', () => {
  const entity = {};
  const first = writePhysicsTelemetry(entity, {
    tick: 10,
    bodyHandle: 4,
    dynamic: true,
    force: { x: 1, y: 0, z: 2 },
    torque: { x: 0, y: 3, z: 0 },
    linearAcceleration: { x: 0.5, y: 0, z: -0.25 },
    authority: { forward: 0.9, reverse: 0.8, strafe: 0.7, yaw: 0.6 },
    mode: 'assisted',
  });
  const second = writePhysicsTelemetry(entity, {
    tick: 11,
    bodyHandle: 4,
    dynamic: true,
    force: { x: 1, y: 0, z: 2 },
    torque: { x: 0, y: 3, z: 0 },
    linearAcceleration: { x: 0.5, y: 0, z: -0.25 },
    authority: { forward: 0.9, reverse: 0.8, strafe: 0.7, yaw: 0.6 },
    mode: 'assisted',
  });

  assert.notEqual(second, first, 'fresh tick must publish a fresh outer snapshot');
  for (const key of ['force', 'torque', 'linearAcceleration', 'authority']) {
    assert.equal(second[key], first[key], `${key} should be structurally shared when unchanged`);
    assert.equal(Object.isFrozen(second[key]), true, `${key} must remain immutable`);
  }
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(second), true);
  assert.equal(readPhysicsTelemetry(entity), second);

  const third = writePhysicsTelemetry(entity, {
    tick: 12,
    bodyHandle: 4,
    dynamic: true,
    force: { x: 7, y: 0, z: 2 },
    torque: { x: 0, y: 3, z: 0 },
    linearAcceleration: { x: 0.5, y: 0, z: -0.25 },
    authority: { forward: 0.9, reverse: 0.8, strafe: 0.7, yaw: 0.4 },
    mode: 'assisted',
  });
  assert.notEqual(third.force, second.force, 'changed force must receive a new immutable value');
  assert.notEqual(third.authority, second.authority, 'changed authority must receive a new immutable value');
  assert.equal(third.torque, second.torque);
  assert.equal(third.linearAcceleration, second.linearAcceleration);
  assert.equal(first.force.x, 1, 'older snapshots must remain unchanged');
  assert.equal(second.authority.yaw, 0.6, 'older authority snapshots must remain unchanged');

  clearPhysicsAuthority(entity);
  const afterClear = writePhysicsTelemetry(entity, {
    tick: 13,
    force: { x: 7, y: 0, z: 2 },
    torque: { x: 0, y: 3, z: 0 },
    linearAcceleration: { x: 0.5, y: 0, z: -0.25 },
    authority: { forward: 0.9, reverse: 0.8, strafe: 0.7, yaw: 0.4 },
  });
  assert.notEqual(afterClear.force, third.force, 'clear must drop the sharing history');
  assert.equal(readPhysicsTelemetry(entity), afterClear);
  clearPhysicsAuthority(entity);
});
