import assert from 'node:assert/strict';
import test from 'node:test';

import {
  M6_PLATFORM_MATRIX_SCHEMA,
  M6_PLATFORM_WAVES,
  captureHeadedReleaseSoaks,
  runM6PlatformMatrix,
  validateM6PlatformMatrix,
} from '../scripts/lib/m6PlatformMatrix.mjs';

const headedPass = {
  status: 'pass',
  currentWorktreeId: 'head-digest',
  currentWorktreeDigest: 'a'.repeat(64),
  runtimes: [
    { runtime: 'browser', status: 'pass', evidencePath: '.devshots/spec2/release-soak-browser/evidence.json', failures: [] },
    { runtime: 'electron', status: 'pass', evidencePath: '.devshots/spec2/release-soak-electron/evidence.json', failures: [] },
  ],
  failures: [],
};
const stableFingerprint = async () => ({ id: 'head-digest', digest: 'a'.repeat(64), head: 'b'.repeat(40), branch: 'master', changedFileCount: 0 });

test('M6 matrix is exactly five ordered waves and fails closed per check', async () => {
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => ({ id: spec.id, pass: spec.id !== 'bundle', exitCode: spec.id === 'bundle' ? 1 : 0, stdout: '', stderr: spec.id === 'bundle' ? 'bundle red' : '' }),
  });

  assert.equal(matrix.schema, M6_PLATFORM_MATRIX_SCHEMA);
  assert.deepEqual(matrix.waves.map((wave) => wave.id), M6_PLATFORM_WAVES.map((wave) => wave.id));
  assert.equal(matrix.waves.length, 5);
  assert.equal(matrix.waves[4].pass, false);
  assert.equal(matrix.pass, false);
  assert.match(matrix.failures.join('\n'), /wave-5-release-floor\/bundle: bundle red/);
  assert.deepEqual(validateM6PlatformMatrix(matrix), { pass: true, failures: [] });
});

test('fresh headed mode requires sequential browser and Electron capture success', async () => {
  let captureCalls = 0;
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    captureHeaded: true,
    headedCaptureRunner: async () => {
      captureCalls += 1;
      return { requested: true, pass: false, runtimes: [{ runtime: 'browser', pass: true }], failures: ['Electron was not captured'] };
    },
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => ({ id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' }),
  });

  assert.equal(captureCalls, 1);
  assert.equal(matrix.captureMode, 'fresh-headed');
  assert.equal(matrix.waves[0].checks[0].id, 'headed-browser-electron-evidence');
  assert.equal(matrix.waves[0].checks[0].pass, false);
  assert.equal(matrix.pass, false);
});

test('matrix digest rejects altered outcome claims', async () => {
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => ({ id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' }),
  });
  assert.equal(matrix.pass, true);
  assert.deepEqual(validateM6PlatformMatrix(matrix), { pass: true, failures: [] });

  const altered = structuredClone(matrix);
  altered.waves[2].checks[0].pass = false;
  const validation = validateM6PlatformMatrix(altered);
  assert.equal(validation.pass, false);
  assert(validation.failures.some((failure) => /matrixDigest/.test(failure)));
});

test('fresh capture attempts both runtimes in canonical order even when browser fails', async () => {
  const calls = [];
  const capture = await captureHeadedReleaseSoaks({
    root: 'C:/repo',
    soakRunner: async ({ runtime }) => {
      calls.push(runtime);
      return runtime === 'browser'
        ? { pass: false, failures: ['browser red'], receipt: null }
        : { pass: true, failures: [], receipt: { evidencePath: 'electron/evidence.json', evidenceSha256: 'c'.repeat(64) } };
    },
  });
  assert.deepEqual(calls, ['browser', 'electron']);
  assert.equal(capture.pass, false);
  assert.equal(capture.runtimes.length, 2);
});

test('canonical waves and checks execute serially without self-induced contention', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => {
      calls.push(spec.id);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(calls, M6_PLATFORM_WAVES.flatMap((wave) => wave.commands.map((command) => command.id)));
});

test('stale headed evidence cannot pass a current-revision matrix', async () => {
  const stale = structuredClone(headedPass);
  stale.currentWorktreeDigest = 'c'.repeat(64);
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => stale,
    commandRunner: async ({ spec }) => ({ id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' }),
  });
  assert.equal(matrix.pass, false);
  assert.equal(matrix.waves[0].checks[0].pass, false);
  assert.match(matrix.waves[0].checks[0].stderr, /not bound to the matrix start revision/);
});

test('malformed command success fails closed and later waves still run', async () => {
  const calls = [];
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => {
      calls.push(spec.id);
      if (spec.id === 'ui-a11y') return { id: 'wrong-check', pass: true, exitCode: 0, stdout: '', stderr: '' };
      if (spec.id === 'release-soak-quick') throw new Error('fixture runner failure');
      return { id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(matrix.pass, false);
  assert.equal(calls.at(-1), 'asset-reachability');
  assert.match(matrix.failures.join('\n'), /command result id wrong-check/);
  assert.match(matrix.failures.join('\n'), /fixture runner failure/);
  assert.deepEqual(validateM6PlatformMatrix(matrix), { pass: true, failures: [] });
});

test('fresh capture records a thrown browser owner and still attempts Electron', async () => {
  const calls = [];
  const capture = await captureHeadedReleaseSoaks({
    root: 'C:/repo',
    soakRunner: async ({ runtime }) => {
      calls.push(runtime);
      if (runtime === 'browser') throw new Error('browser owner failed');
      return {
        pass: true,
        failures: [],
        receipt: { evidencePath: 'electron/evidence.json', evidenceSha256: 'c'.repeat(64) },
      };
    },
  });
  assert.deepEqual(calls, ['browser', 'electron']);
  assert.equal(capture.pass, false);
  assert.match(capture.failures.join('\n'), /browser owner failed/);
});

test('validator rejects missing canonical checks even if outcome flags are internally consistent', async () => {
  const matrix = await runM6PlatformMatrix({
    root: 'C:/repo',
    fingerprintReader: stableFingerprint,
    headedEvidenceChecker: async () => headedPass,
    commandRunner: async ({ spec }) => ({ id: spec.id, pass: true, exitCode: 0, stdout: '', stderr: '' }),
  });
  matrix.waves[1].checks.pop();
  matrix.waves[1].pass = true;
  matrix.pass = true;
  const validation = validateM6PlatformMatrix(matrix);
  assert.equal(validation.pass, false);
  assert(validation.failures.some((failure) => /check ids\/order/.test(failure)));
});

test('validator rejects malformed envelopes without throwing', () => {
  for (const malformed of [null, {}, { waves: {} }, { headed: { status: 'pass', runtimes: {} }, capture: { runtimes: {} } }]) {
    assert.doesNotThrow(() => validateM6PlatformMatrix(malformed));
    assert.equal(validateM6PlatformMatrix(malformed).pass, false);
  }
});
