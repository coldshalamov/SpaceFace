import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
  // FIX19: retain the timer handle and clear it once the race settles so a
  // passing test does not pin the event loop for the full guardMs.
  let timedOutGuard = false;
  let guardTimer = null;
  const guard = new Promise((resolve) => {
    guardTimer = setTimeout(() => {
      timedOutGuard = true;
      resolve(null);
    }, guardMs);
  });

  const result = await Promise.race([resultPromise, guard]).finally(() => {
    if (guardTimer) clearTimeout(guardTimer);
  });
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

// P1 FIX18: timeout timer must be cancelled when the child exits during a slow
// onSpawn. Otherwise timeoutMs elapses while onSpawn is still awaiting, fires
// after exit, sets timedOut=true, and may killProcessTree a recycled PID.
//
// FIX20: inject setTimeoutFn/clearTimeoutFn so "past timeoutMs" is simulated by
// invoking uncleared hard-timeout callbacks — not by sleeping.
//
// FIX21: also inject spawnFn with an EventEmitter stand-in. The regression is
// proven purely from synthetic exit + injected clock. No real child, no
// process.kill(pid, 0) polling, no wall-clock deadline. (Real-process happy
// paths remain in the tests above for integration coverage.)
test('P1 FIX18: slow onSpawn past timeoutMs after child exit is not timedOut', async () => {
  const timeoutMs = 400;
  const fakePid = 424_242;
  const exitedPid = { value: null };
  const scheduled = [];
  const setTimeoutFn = (fn, ms) => {
    const handle = {
      fn,
      ms,
      cleared: false,
      unref() { return this; },
    };
    scheduled.push(handle);
    return handle;
  };
  const clearTimeoutFn = (handle) => {
    if (handle) handle.cleared = true;
  };

  /** @type {EventEmitter & {
   *   pid: number,
   *   stdout: null,
   *   stderr: null,
   *   killed: boolean,
   *   exitCode: number|null,
   *   signalCode: string|null,
   * }} */
  let fakeChild = null;
  const spawnFn = () => {
    fakeChild = new EventEmitter();
    fakeChild.pid = fakePid;
    fakeChild.stdout = null;
    fakeChild.stderr = null;
    fakeChild.killed = false;
    fakeChild.exitCode = null;
    fakeChild.signalCode = null;
    return fakeChild;
  };

  const result = await runWithTimeout({
    command: 'fake-node',
    args: ['-e', 'process.exit(0)'],
    timeoutMs,
    setTimeoutFn,
    clearTimeoutFn,
    spawnFn,
    onSpawn: async (pidRecord) => {
      const pid = pidRecord?.pid;
      exitedPid.value = pid ?? null;
      assert.equal(pid, fakePid);
      assert.ok(fakeChild, 'spawnFn must have produced the stand-in child');
      assert.ok(
        scheduled.some((h) => !h.cleared),
        'hard-timeout timer must be armed before synthetic exit',
      );

      // Synthetic lifecycle settle — synchronous with the injected emitter.
      // FIX18 must clearTimeout the hard timer inside settle, before onSpawn
      // returns, so a later "timeoutMs elapsed" simulation cannot fire.
      fakeChild.exitCode = 0;
      fakeChild.emit('exit', 0, null);

      // Snapshot before we simulate "timeoutMs elapsed" so the assertion is not
      // satisfied by the post-onSpawn clearTimeoutFn.
      const unclearedAfterExit = scheduled.filter((h) => !h.cleared);
      assert.equal(
        unclearedAfterExit.length,
        0,
        'hard-timeout timer must be cleared on child exit (not left armed for onSpawn)',
      );

      // Simulate wall-clock past timeoutMs: fire any still-uncleared hard-timeout
      // callbacks. With FIX18, none fire and timedOut stays false. Without it,
      // firing sets timedOut=true and may killProcessTree a recycled pid.
      for (const handle of scheduled) {
        if (!handle.cleared) {
          await handle.fn();
        }
      }
    },
  });

  assert.ok(
    scheduled.some((h) => h.ms === timeoutMs || h.ms >= 1),
    'hard-timeout timer must have been armed',
  );
  assert.equal(result.status, 'pass', 'clean exit must not become timeout');
  assert.equal(result.timedOut, false, 'must not false-positive timedOut after child exit');
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(exitedPid.value, fakePid);
  // killProcessTree must not have been invoked for the timeout path.
  assert.equal(result.pidRecord?.killResult ?? null, null,
    'timeout kill must not run against an already-exited (possibly recycled) pid');
  assert.equal(result.pidRecord?.timedOut, false);
});
