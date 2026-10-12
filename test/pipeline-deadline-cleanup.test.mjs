import assert from 'node:assert/strict';
import test from 'node:test';
import { createPipelineAdmissionTracker, createGpuResidencyAdmissionTracker } from '../src/render/pipelineReadiness.js';

// Observe long deadline ownership without waiting fifty seconds or changing production bounds.
async function withDeadlineProbe(run) {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const pending = new Map();
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms < 10000) return originalSet(fn, ms, ...args);
    const handle = {};
    pending.set(handle, { ms, fire: () => { pending.delete(handle); fn(...args); } });
    return handle;
  };
  globalThis.clearTimeout = (handle) => pending.delete(handle) || originalClear(handle);
  try { await run(pending); }
  finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
}

test('completed link releases its unchanged fifty-second deadline', async () => {
  await withDeadlineProbe(async (pending) => {
    const tracker = createPipelineAdmissionTracker(() => 'ready');
    assert.equal(await tracker.compile({}, { urgent: true }), 'ready');
    assert.equal(pending.size, 0, 'settled links retain no timeout callback');
  });
});

for (const kind of ['pipeline', 'residency']) {
  for (const method of ['waitForCaptured', 'waitForPending']) {
    test(`${kind} ${method} releases deadline after actual completion`, async () => {
      await withDeadlineProbe(async (pending) => {
        let resolve;
        const operation = new Promise(r => { resolve = r; });
        const tracker = kind === 'pipeline'
          ? createPipelineAdmissionTracker(() => operation, { deferAutoFlush: () => true })
          : createGpuResidencyAdmissionTracker(() => operation);
        const admitted = kind === 'pipeline' ? tracker.compile({}) : tracker.prepare({});
        const wait = method === 'waitForCaptured'
          ? tracker.waitForCaptured(tracker.capturePending(), { timeoutMs: 20000 })
          : tracker.waitForPending({ timeoutMs: 20000 });
        resolve('ready');
        await admitted;
        const result = await wait;
        assert.notEqual(result.timedOut, true);
        assert.equal(pending.size, 0, 'completion clears both observer and link deadlines');
      });
    });
  }
}

test('unsettled link still times out at fifty seconds and advances its queue', async () => {
  await withDeadlineProbe(async (pending) => {
    let resolveOld;
    const tracker = createPipelineAdmissionTracker(([subject]) => subject === 'stuck'
      ? new Promise(resolve => { resolveOld = resolve; }) : 'next-ready');
    const stuck = tracker.compile('stuck', { urgent: true });
    const next = tracker.compile('next', { urgent: true });
    await Promise.resolve();
    const deadline = [...pending.values()].find(row => row.ms === 50000);
    assert.ok(deadline, 'original deadline is retained');
    deadline.fire();
    assert.deepEqual(await stuck, { tailTimeout: true });
    assert.equal(await next, 'next-ready');
    resolveOld('late');
    await Promise.resolve();
    assert.equal(pending.size, 0);
  });
});

for (const kind of ['pipeline', 'residency']) {
  test(`${kind} rejection clears deadlines without changing the error`, async () => {
    await withDeadlineProbe(async (pending) => {
      let reject;
      const error = new Error('original driver failure');
      const operation = new Promise((_, fail) => { reject = fail; });
      const tracker = kind === 'pipeline'
        ? createPipelineAdmissionTracker(() => operation, { deferAutoFlush: () => true })
        : createGpuResidencyAdmissionTracker(() => operation);
      const admitted = kind === 'pipeline' ? tracker.compile({}) : tracker.prepare({});
      const admissionError = admitted.catch(value => value);
      const wait = tracker.waitForCaptured(tracker.capturePending(), { timeoutMs: 20000 });
      const rejected = assert.rejects(wait, value => value === error);
      reject(error);
      await rejected;
      assert.equal(await admissionError, error);
      assert.equal(pending.size, 0);
    });
  });
}
