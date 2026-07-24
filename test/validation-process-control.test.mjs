import assert from 'node:assert/strict';
import test from 'node:test';

import {
  killProcessTree,
  runWithTimeout,
} from '../scripts/lib/validationProcessControl.mjs';

test('runWithTimeout kills a long-running child within timeoutMs + margin and records exit/signal', async () => {
  const timeoutMs = 400;
  const marginMs = 2_500;
  const started = Date.now();
  const result = await runWithTimeout({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000);'],
    timeoutMs,
    ownership: {
      probeId: 'process-control-test',
      browserOwned: false,
      serverOwned: false,
    },
  });
  const elapsed = Date.now() - started;

  assert.equal(result.status, 'timeout');
  assert.equal(result.timedOut, true);
  assert.ok(elapsed < timeoutMs + marginMs,
    `child should be cleaned up within timeout+margin (elapsed=${elapsed}ms)`);
  assert.ok(result.durationMs >= timeoutMs * 0.5,
    `duration should reflect the wait (durationMs=${result.durationMs})`);
  assert.ok(result.pidRecord?.pid > 0, 'pidRecord must capture the child pid');
  assert.equal(result.pidRecord.timedOut, true);
  assert.ok(
    result.exitCode !== 0 || result.signal != null || result.timedOut,
    'timeout path must record a non-success completion',
  );
  assert.equal(result.ownership.probeId, 'process-control-test');
});

test('runWithTimeout records a clean exit for a short process', async () => {
  const result = await runWithTimeout({
    command: process.execPath,
    args: ['-e', 'process.stdout.write("ok"); process.exit(0);'],
    timeoutMs: 10_000,
  });
  assert.equal(result.status, 'pass');
  assert.equal(result.timedOut, false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /ok/);
  assert.ok(result.pidRecord?.pid > 0);
  assert.equal(result.pidRecord.exitCode, 0);
});

test('runWithTimeout records non-zero exit as fail', async () => {
  const result = await runWithTimeout({
    command: process.execPath,
    args: ['-e', 'process.exit(7);'],
    timeoutMs: 10_000,
  });
  assert.equal(result.status, 'fail');
  assert.equal(result.exitCode, 7);
  assert.equal(result.timedOut, false);
});

test('runWithTimeout missing command is infra_error', async () => {
  const result = await runWithTimeout({
    command: '',
    args: [],
    timeoutMs: 1000,
  });
  assert.equal(result.status, 'infra_error');
});

test('killProcessTree is safe for already-dead pids', async () => {
  // Spawn a process that exits immediately, then try to kill its former pid.
  const short = await runWithTimeout({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
    timeoutMs: 10_000,
  });
  const deadPid = short.pidRecord.pid;
  const killResult = await killProcessTree(deadPid);
  // On Windows taskkill may report not found; either way it must not throw.
  assert.equal(typeof killResult.ok, 'boolean');
});

test('runWithTimeout invokes onSpawn before child exit', async () => {
  const events = [];
  const result = await runWithTimeout({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => process.exit(0), 200)'],
    timeoutMs: 10_000,
    onSpawn: async (pidRecord) => {
      events.push({ phase: 'spawn', pid: pidRecord.pid, t: Date.now() });
    },
  });
  events.push({ phase: 'done', status: result.status, t: Date.now() });
  assert.equal(result.status, 'pass');
  assert.equal(events[0].phase, 'spawn');
  assert.ok(events[0].pid > 0);
  assert.equal(events[1].phase, 'done');
  assert.ok(events[0].t <= events[1].t);
});

// P1 FIX15: exit/timeout listeners must be attached before await onSpawn.
// A near-instant child + slow onSpawn must NOT hang indefinitely.
test('P1 FIX15: fast-exit during slow onSpawn still resolves (no hang)', async () => {
  const guardMs = 3_000;
  let onSpawnEntered = false;
  let onSpawnFinished = false;
  const started = Date.now();

  const resultPromise = runWithTimeout({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
    timeoutMs: 10_000,
    onSpawn: async (pidRecord) => {
      onSpawnEntered = true;
      assert.ok(pidRecord?.pid > 0);
      // Delay long enough that the child exits while we are still in onSpawn.
      await new Promise((r) => setTimeout(r, 80));
      onSpawnFinished = true;
    },
  });

  // Hard guard so a hang fails the test instead of freezing the suite.
  let timedOutGuard = false;
  const guard = new Promise((resolve) => {
    setTimeout(() => {
      timedOutGuard = true;
      resolve(null);
    }, guardMs);
  });

  const result = await Promise.race([resultPromise, guard]);
  const elapsed = Date.now() - started;

  assert.equal(timedOutGuard, false, `runWithTimeout hung beyond ${guardMs}ms (elapsed=${elapsed})`);
  assert.ok(result, 'runWithTimeout must return a result');
  assert.equal(onSpawnEntered, true);
  assert.equal(onSpawnFinished, true);
  assert.equal(result.status, 'pass');
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.ok(elapsed < guardMs, `must return promptly (elapsed=${elapsed}ms)`);
});
