// Lab runner: run==repeat, observer on/off, failed oracle, replay fingerprint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import { replayFailure } from '../src/testing/lab/replay.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

test('run==repeat: identical trace and deterministic-covered hashes', async () => {
  const rep = await repeatScenario(flightDoc, { verbosity: 1, runs: 2 });
  assert.equal(rep.exitClass === 0 || rep.exitClass === 1, true, `unexpected exit ${rep.exitClass}: ${rep.status} ${rep.error || ''}`);
  if (rep.exitClass === 3) {
    assert.fail(`infra failure: ${JSON.stringify(rep.primary && rep.primary.error)}`);
  }
  assert.equal(rep.equivalence['run-eq-repeat'].ok, true, JSON.stringify(rep.mismatches));
  assert.ok(rep.traceHash);
  assert.ok(rep.deterministicHash);
});

test('observer-on produces identical authoritative checkpoints as observer-off', async () => {
  const off = await runLabScenario(flightDoc, { observerEnabled: false, verbosity: 1 });
  const on = await runLabScenario(flightDoc, { observerEnabled: true, verbosity: 1 });
  assert.equal(off.exitClass === 3, false, off.error);
  assert.equal(on.exitClass === 3, false, on.error);
  assert.equal(
    off.checkpoints.final.deterministicCovered.hash,
    on.checkpoints.final.deterministicCovered.hash,
  );
  assert.equal(
    off.checkpoints.final.semantic.hash,
    on.checkpoints.final.semantic.hash,
  );
  assert.equal(off.traceHash, on.traceHash);
  assert.equal(off.rendering.detached, true);
  assert.equal(on.rendering.detached, true);
});

test('failed oracle reports firstBadTick + quantitative delta', async () => {
  const failing = {
    ...flightDoc,
    id: 'flight.force-fail',
    metrics: [
      {
        name: 'invariant.finiteState',
        version: 1,
        threshold: { op: '==', value: 1 },
      },
      {
        name: 'flight.finalSpeed',
        version: 1,
        // Impossible: require final speed <= -1
        threshold: { op: '<=', value: -1 },
      },
    ],
  };
  const result = await runLabScenario(failing, { verbosity: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 1);
  assert.ok(result.oracle);
  assert.equal(result.oracle.ok, false);
  assert.ok(Number.isInteger(result.oracle.firstBadTick), 'firstBadTick must be integer');
  const failed = result.oracle.failed || [];
  assert.ok(failed.length > 0);
  const quant = failed.find((f) => f.family === 'quantitative' || f.id.includes('finalSpeed'));
  assert.ok(quant, 'expected quantitative failure');
  assert.ok(quant.signedDelta != null || quant.actual != null);
  assert.ok(result.failure);
  assert.equal(result.failure.schema, 'spaceface.labFailure.v1');
  assert.ok(result.failure.failureFingerprint);
  assert.ok(result.failure.replayCommand.includes('sf lab replay'));
});

test('replay reproduces the failure fingerprint', async () => {
  const failing = {
    ...flightDoc,
    id: 'flight.replay-fail',
    ticks: 30,
    metrics: [
      { name: 'flight.finalSpeed', version: 1, threshold: { op: '<=', value: -1 } },
    ],
  };
  const first = await runLabScenario(failing, { verbosity: 1 });
  assert.equal(first.ok, false);
  assert.ok(first.failure && first.failure.failureFingerprint);

  const replayed = await replayFailure(failing, first, { verbosity: 1 });
  assert.equal(replayed.ok, true, `fingerprint mismatch: ${replayed.expectedFingerprint} vs ${replayed.actualFingerprint}`);
  assert.equal(replayed.actualFingerprint, first.failure.failureFingerprint);
});

test('sf lab run flight-fixed-input exits successfully', () => {
  const child = spawnSync(
    process.execPath,
    [join(ROOT, '../scripts/sf.mjs'), 'lab', 'run', 'flight-fixed-input', '--verbosity', '1'],
    { cwd: join(ROOT, '..'), encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(child.error, undefined, String(child.error));
  // Parse stdout even if the process hits a Windows post-exit handle race (UV_HANDLE_CLOSING).
  const stdout = child.stdout || '';
  assert.ok(stdout.includes('spaceface.labCliResult.v1'), `no lab result in stdout: ${stdout.slice(0, 500)}`);
  const parsed = JSON.parse(stdout.split('\n').filter((l) => l.trim().startsWith('{')).pop());
  assert.equal(parsed.ok, true, JSON.stringify(parsed.result && parsed.result.oracle));
  assert.equal(parsed.command, 'run');
  assert.equal(parsed.exitClass, 0);
  // Prefer clean exit; accept known Windows libuv close race after successful result.
  if (child.status !== 0) {
    assert.ok(
      /UV_HANDLE_CLOSING|STATUS_STACK_BUFFER|3221226505/.test(String(child.stderr) + String(child.status)),
      `unexpected failure status=${child.status} stderr=${child.stderr}`,
    );
  }
});
