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
