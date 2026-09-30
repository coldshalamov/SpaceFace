import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), 'sg02-angle-liveness.worker.mjs');
const READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 1_500;

function priorWrapAngle(value) {
  let out = Number.isFinite(value) ? value : 0;
  while (out <= -Math.PI) out += Math.PI * 2;
  while (out > Math.PI) out -= Math.PI * 2;
  return out;
}

function runSpin(angVel) {
  return new Promise((resolveRun, rejectRun) => {
    const worker = new Worker(WORKER);
    worker.unref();
    let settled = false;
    let stepTimer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      if (stepTimer) clearTimeout(stepTimer);
      Promise.resolve(worker.terminate()).then(() => fn(value), () => fn(value));
    };
    const readyTimer = setTimeout(
      () => settle(rejectRun, new Error(`worker never reported READY for angVel=${angVel}`)),
      READY_TIMEOUT_MS,
    );
    let readyMsg = null;
    worker.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        readyMsg = msg;
        stepTimer = setTimeout(
          () => settle(rejectRun, new Error(
            `owner.step did not return within ${STEP_TIMEOUT_MS}ms for angVel=${angVel} (ready angvel.y=${msg.angvelY})`,
          )),
          STEP_TIMEOUT_MS,
        );
      } else if (msg.type === 'done') {
        settle(resolveRun, { ...msg, angvelY: readyMsg ? readyMsg.angvelY : null });
      }
    });
    worker.on('error', (error) => settle(rejectRun, error));
    worker.on('exit', (code) => {
      if (code !== 0) settle(rejectRun, new Error(`worker exited with code ${code}`));
    });
    worker.postMessage({ angVel });
  });
}

function assertWrappedYaw(result, angVel) {
  assert.equal(Number.isFinite(result.rot), true, `entity.rot must stay finite for angVel=${angVel}`);
  assert.equal(Number.isFinite(result.expectedYaw), true, `expected.yaw must be finite for angVel=${angVel}`);
  assert.ok(result.expectedYaw <= Math.PI && result.expectedYaw > -Math.PI,
    `expected.yaw ${result.expectedYaw} must land in (-PI, PI] for angVel=${angVel}`);
  assert.equal(result.recordsAfterDispose, 0, 'owner.dispose() must retire every record');
}

test('a huge positive angular velocity completes one fixed step with a wrapped finite yaw', async () => {
  const result = await runSpin(1e30);
  assert.equal(Number.isFinite(result.angvelY), true);
  assert.ok(Math.abs(result.angvelY) > 1e29, `the solver must see the huge rate, got ${result.angvelY}`);
  assertWrappedYaw(result, 1e30);
});

test('a huge negative angular velocity completes one fixed step with a wrapped finite yaw', async () => {
  const result = await runSpin(-1e30);
  assert.equal(Number.isFinite(result.angvelY), true);
  assert.ok(Math.abs(result.angvelY) > 1e29, `the solver must see the huge rate, got ${result.angvelY}`);
  assertWrappedYaw(result, -1e30);
});

test('a zero angular velocity completes one fixed step', async () => {
  const result = await runSpin(0);
  assertWrappedYaw(result, 0);
  assert.equal(result.expectedYaw, 0);
});

test('a non-finite angular velocity degrades to the finite fallback path', async () => {
  const result = await runSpin(Number.NaN);
  assertWrappedYaw(result, Number.NaN);
});

for (const angVel of [1, -1, 150, -150, 300, -300, 540, -540]) {
  test(`ordinary angVel=${angVel} keeps exact small-angle wrapping arithmetic`, async () => {
    const result = await runSpin(angVel);
    assertWrappedYaw(result, angVel);
    assert.equal(result.expectedYaw, priorWrapAngle(result.wy * (1 / 60)),
      `expected.yaw must equal the prior wrap of wy*dt bit-for-bit for angVel=${angVel}`);
  });
}
