import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), 'sg02-physics-liveness.worker.mjs');
const READY_TIMEOUT_MS = 60_000;
const OP_TIMEOUT_MS = 1_500;
const SANE_MAX_YAW_RATE = 6.0;
const BOUND = SANE_MAX_YAW_RATE + 0.5;

function runOp(op, extra = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const worker = new Worker(WORKER);
    worker.unref();
    let settled = false;
    let opTimer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      if (opTimer) clearTimeout(opTimer);
      Promise.resolve(worker.terminate()).then(() => fn(value), () => fn(value));
    };
    const readyTimer = setTimeout(
      () => settle(rejectRun, new Error(`worker never reported READY for op=${op}`)),
      READY_TIMEOUT_MS,
    );
    worker.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        opTimer = setTimeout(
          () => settle(rejectRun, new Error(`op ${op} did not return within ${OP_TIMEOUT_MS}ms`)),
          OP_TIMEOUT_MS,
        );
      } else if (msg.type === 'done') {
        settle(resolveRun, msg);
      }
    });
    worker.on('error', (error) => settle(rejectRun, error));
    worker.on('exit', (code) => {
      if (code !== 0) settle(rejectRun, new Error(`worker exited with code ${code}`));
    });
    worker.postMessage({ op, ...extra });
  });
}

async function resultOf(op, extra) {
  const msg = await runOp(op, extra);
  assert.equal(msg.error, undefined, `op ${op} worker error: ${msg.error && msg.error.message}`);
  return msg.result;
}

function assertBounded(result, label) {
  assert.ok(Number.isFinite(result.angVel), `${label}: entity.angVel not finite (${result.angVel})`);
  assert.ok(Math.abs(result.angVel) <= BOUND,
    `${label}: entity.angVel ${result.angVel} exceeds bound`);
  assert.ok(Number.isFinite(result.rot), `${label}: rot not finite (${result.rot})`);
}

for (const angVel of [1e30, -1e30, Number.MAX_VALUE, Infinity, NaN]) {
  test(`npc ingress angular velocity ${angVel} produces a bounded step`, async () => {
    const r = await resultOf('stepAngvel', { angVel });
    assert.equal(r.tick, 1);
    assert.ok(Math.abs(r.preY) <= SANE_MAX_YAW_RATE + 1e-9,
      `body angvel at registration ${r.preY} exceeds bound`);
    assertBounded(r, `npc ${angVel}`);
  });

  test(`player ingress angular velocity ${angVel} produces a bounded step`, async () => {
    const r = await resultOf('stepAngvel', { angVel, isPlayer: true });
    assert.equal(r.tick, 1);
    assertBounded(r, `player ${angVel}`);
    assert.equal(typeof r.ceilingFlag, 'boolean');
  });
}

for (const angVel of [2.0, -2.0]) {
  test(`normal angular velocity ${angVel} preserves yaw-mapping parity`, async () => {
    const r = await resultOf('stepAngvel', { angVel });
    assert.equal(r.tick, 1);
    assert.ok(Math.sign(r.preY) === -Math.sign(angVel),
      `body angvel ${r.preY} lost the native sign flip of game ${angVel}`);
    assert.ok(Math.sign(r.angVel) === Math.sign(angVel),
      `entity.angVel ${r.angVel} flipped sign`);
    assert.ok(Math.abs(Math.abs(r.angVel) - 2) < 0.1,
      `entity.angVel ${r.angVel} drifted from 2.0`);
  });
}

test('synced kinematics with huge angular velocity never reach unsafe WASM state', async () => {
  for (const angVel of [1e30, -1e30, Infinity]) {
    const r = await resultOf('syncAngvel', { angVel });
    assert.ok(Math.abs(r.y) <= SANE_MAX_YAW_RATE + 1e-9,
      `body angvel after sync ${r.y} exceeds bound`);
  }
});

test('saved-kinematics resync with huge angular velocity is bounded', async () => {
  for (const angVel of [1e30, -1e30, Infinity]) {
    const r = await resultOf('resyncAngvel', { angVel });
    assert.ok(Math.abs(r.y) <= SANE_MAX_YAW_RATE + 1e-9,
      `body angvel after resync ${r.y} exceeds bound`);
  }
});

test('pooled ghost body reuse with huge angular velocity is bounded', async () => {
  const r = await resultOf('pooledReuse', { angVel: 1e30 });
  assert.equal(r.reused, true, 'ghost projectile body was not reused from the pool');
  assert.ok(Math.abs(r.y) <= SANE_MAX_YAW_RATE + 1e-9,
    `pooled body angvel ${r.y} exceeds bound`);
});

test('raw body API angular override after sync is caught before world.step', async () => {
  const r = await resultOf('rawOverride', { value: 1e30 });
  assert.ok(Number.isFinite(r.beforeY) && r.beforeY > 1e29,
    `raw setAngvel override did not land on the body (${r.beforeY})`);
  assert.ok(Math.abs(r.afterY) <= BOUND,
    `body angvel after step ${r.afterY} exceeds bound`);
  assertBounded(r, 'raw override');
});

for (const axis of ['x', 'z', 'both']) {
  test(`forbidden-axis angular override (${axis}) cannot reach native integration`, async () => {
    const r = await resultOf('rawOverride', { value: 1e30, axis });
    assert.ok(Math.abs(r.beforeX) > 1e29 || Math.abs(r.beforeZ) > 1e29,
      `raw XZ override did not land on the body (${r.beforeX}, ${r.beforeZ})`);
    assert.ok(r.atStep.length >= 1, 'world.step never ran');
    for (const [i, w] of r.atStep.entries()) {
      assert.equal(w.x, 0, `world.step ${i} received angvel.x=${w.x} on the disabled axis`);
      assert.equal(w.z, 0, `world.step ${i} received angvel.z=${w.z} on the disabled axis`);
      assert.ok(Number.isFinite(w.y) && Math.abs(w.y) <= BOUND,
        `world.step ${i} received angvel.y=${w.y}`);
    }
    assert.equal(r.afterX, 0, `body angvel.x after step is ${r.afterX}`);
    assert.equal(r.afterZ, 0, `body angvel.z after step is ${r.afterZ}`);
    assert.ok(Number.isFinite(r.afterY) && Math.abs(r.afterY) <= BOUND);
    assertBounded(r, `xz override ${axis}`);
  });
}

test('player yaw-ceiling flag covers a raw body override clamped before the step', async () => {
  const r = await resultOf('rawOverride', { value: 1e30, isPlayer: true });
  assert.ok(r.beforeY > 1e29);
  assert.ok(Math.abs(r.afterY) <= BOUND);
  assert.equal(r.ceilingFlag, true);
  assertBounded(r, 'player raw override');
});

test('queued torque impulse 1e30 is bounded before integration', async () => {
  const r = await resultOf('torqueImpulse', { value: 1e30 });
  assert.ok(Math.abs(r.bodyY) <= BOUND,
    `body angvel after impulse step ${r.bodyY} exceeds bound`);
  assertBounded(r, 'torque impulse');
});

test('continuous control torque 1e30 is bounded before addTorque', async () => {
  const r = await resultOf('controlTorque', { value: 1e30 });
  const maxTorque = SANE_MAX_YAW_RATE * 320 / (1 / 60);
  assert.ok(Number.isFinite(r.appliedY), `applied torque not finite (${r.appliedY})`);
  assert.ok(Math.abs(r.appliedY) <= maxTorque + 1e-6,
    `applied torque ${r.appliedY} exceeds safe bound ${maxTorque}`);
  assert.equal(r.controlY, r.appliedY);
  assertBounded(r, 'control torque');
});

test('repeated saturated control torque cannot accumulate past the yaw ceiling', async () => {
  const r = await resultOf('controlTorqueRepeat', { value: 1e30, steps: 4 });
  assert.ok(Math.abs(r.bodyY) <= BOUND,
    `body angvel ${r.bodyY} exceeds bound after repeated saturated control`);
  assert.ok(Math.abs(r.angVel) <= BOUND,
    `entity.angVel ${r.angVel} exceeds bound`);
});

test('ordinary finite control torque is passed through unchanged', async () => {
  const r = await resultOf('controlTorque', { value: 500 });
  assert.equal(r.appliedY, 500);
  assert.equal(r.controlY, 500);
  assert.ok(r.angVel > 0, `expected positive game yaw from +500 torque, got ${r.angVel}`);
});

for (const fixedDt of [0, -1 / 60, NaN, Infinity]) {
  test(`mutable fixedDt ${fixedDt} raises RangeError before any step`, async () => {
    const r = await resultOf('stepGuard', { fixedDt, dt: 1 / 60 });
    assert.equal(r.threw, 'RangeError', `expected RangeError, got ${r.threw}: ${r.message}`);
    assert.equal(r.tick, 0);
    assert.equal(r.accumulator, 0);
  });
}

test('tiny fixedDt with a normal frame raises RangeError instead of looping', async () => {
  const r = await resultOf('stepGuard', { fixedDt: 1e-30, dt: 0.25 });
  assert.equal(r.threw, 'RangeError', `expected RangeError, got ${r.threw}`);
  assert.equal(r.tick, 0);
  assert.equal(r.accumulator, 0);
});

for (const accumulator of [Infinity, 1e30]) {
  test(`corrupt accumulator ${accumulator} raises RangeError before mutation`, async () => {
    const r = await resultOf('stepGuard', { accumulator, dt: 1 / 60 });
    assert.equal(r.threw, 'RangeError', `expected RangeError, got ${r.threw}`);
    assert.equal(r.tick, 0);
    assert.equal(r.accumulator, accumulator);
  });
}

test('restoring a valid fixedDt allows normal stepping again', async () => {
  const r = await resultOf('restoreAfterGuard');
  assert.equal(r.threw, 'RangeError');
  assert.equal(r.tick, 1);
  assert.ok(Math.abs(r.angVel - 2) < 0.1,
    `entity.angVel ${r.angVel} drifted from 2.0 after restoring fixedDt`);
});
