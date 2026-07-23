#!/usr/bin/env node
// PQ-017 cheap regression boundary. This must pass and issue a current receipt before a live probe.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acquirePq017FastRunLock,
  createPq017FastGateReceipt,
  evaluatePq017FastGate,
  loadPq017GateState,
  publishPq017FastGatePending,
  publishPq017FastGateReceipt,
  readPq017ProbeInflight,
  releasePq017FastRunLock,
} from './lib/pq017ProbeIterationGuard.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq017-world-site');
const TESTS = Object.freeze([
  'test/world-site-public-route-contract.test.mjs',
  'test/pq017-closed-loop-control.test.mjs',
  'test/pq017-probe-iteration-guard.test.mjs',
]);

const fastRunLock = await acquirePq017FastRunLock({ outputRoot: OUTPUT_ROOT });
if (!fastRunLock) {
  console.error('[pq017-fast] PQ017_FAST_RUN_INFLIGHT: inspect .devshots/pq017-world-site/fast-run.lock');
  process.exitCode = 5;
} else {
  try {
    const inflight = await readPq017ProbeInflight({ outputRoot: OUTPUT_ROOT });
    if (inflight.length) {
      console.error(`[pq017-fast] PQ017_PROBE_INFLIGHT: ${inflight
        .map((entry) => entry.claimToken)
        .join(', ')}`);
      console.error('[pq017-fast] inspect the interrupted probe before settling its claim');
      process.exitCode = 4;
    } else {
      await runFastGate();
    }
  } finally {
    await releasePq017FastRunLock({
      outputRoot: OUTPUT_ROOT,
      lockToken: fastRunLock.lockToken,
    });
  }
}

async function runFastGate() {
  await publishPq017FastGatePending({ outputRoot: OUTPUT_ROOT });
  const inflightAfterRevocation = await readPq017ProbeInflight({
    outputRoot: OUTPUT_ROOT,
  });
  if (inflightAfterRevocation.length) {
    console.error('[pq017-fast] FAIL: a probe claimed the previous receipt during revocation');
    process.exitCode = 4;
    return;
  }
  const beforeState = await loadPq017GateState({ root: ROOT, outputRoot: OUTPUT_ROOT });
  const testExitCode = await runNode(['--test', ...TESTS]);
  if (testExitCode !== 0) {
    console.error(`[pq017-fast] FAIL: regression tests exited ${testExitCode}`);
    process.exitCode = testExitCode || 1;
  } else {
    const inflightAfterTests = await readPq017ProbeInflight({ outputRoot: OUTPUT_ROOT });
    if (inflightAfterTests.length) {
      console.error('[pq017-fast] FAIL: a probe claimed a receipt while tests were running');
      process.exitCode = 4;
    } else {
      const afterState = await loadPq017GateState({ root: ROOT, outputRoot: OUTPUT_ROOT });
      if (
        beforeState.routeDigest !== afterState.routeDigest
        || beforeState.regressionDigest !== afterState.regressionDigest
      ) {
        console.error('[pq017-fast] FAIL: source digests changed while regression tests were running');
        process.exitCode = 3;
      } else {
        const result = evaluatePq017FastGate({
          latestFailure: afterState.latestFailure,
          acceptedRuntimeKind: afterState.acceptedRuntimeKind,
          acceptedGeneratedAt: afterState.acceptedGeneratedAt,
          currentRegressionDigest: afterState.regressionDigest,
        });
        if (!result.pass) {
          console.error(
            `[pq017-fast] PQ017_REGRESSION_REQUIRED: ${
              afterState.latestFailure?.failureFingerprint ?? 'unknown'
            }`,
          );
          console.error(
            `[pq017-fast] unresolved: ${afterState.latestFailure?.artifactPath ?? 'pointer only'}`,
          );
          process.exitCode = 2;
        } else {
          const receipt = createPq017FastGateReceipt({
            routeDigest: afterState.routeDigest,
            regressionDigest: afterState.regressionDigest,
            acknowledgesFailureFingerprint: result.acknowledgesFailureFingerprint,
          });
          await publishPq017FastGateReceipt({ outputRoot: OUTPUT_ROOT, receipt });
          console.log(`[pq017-fast] PASS: ${result.reason}`);
          console.log('[pq017-fast] receipt: .devshots/pq017-world-site/fast-gate.json');
        }
      }
    }
  }
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`[pq017-fast] test process terminated by ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}
