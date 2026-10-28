import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each worker owns its process-level rejection events. The Node test runner treats an
// unhandled rejection as its own failure, even when a test installs a diagnostic listener.
function run(scenario) {
  const result = spawnSync(process.execPath, [
    // fileURLToPath, not URL.pathname: on Windows the pathname is /C:/..., which node resolves
    // to C:\C:\... and the fixture never loads.
    fileURLToPath(new URL('./helpers/authored-decode-prefetch-fixture.mjs', import.meta.url)),
    scenario,
  ], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('a departed owner during current-plan decode is observed without composition', () => {
  const result = run('owner-departed');
  assert.deepEqual(result.unhandled, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'AbortError');
  assert.match(result.errors[0].message, /owner became inactive after-plan-file/);
  assert.equal(result.compositions, 0);
  assert.equal(result.activeDecodeCount, 0);
});

test('current-plan cancellation cannot abandon its later decode rejection', () => {
  const result = run('cancel-current-plan');
  assert.deepEqual(result.unhandled, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'AbortError');
  assert.equal(result.errors[0].message, 'fixture owner retired');
  assert.equal(result.errorsBeforeLateDecode, 1, 'owning cancellation settles before the late decode rejects');
  assert.equal(result.beforeDecodeCompositions, 0);
  assert.equal(result.compositions, 0);
  assert.equal(result.activeDecodeCount, 0);
});

test('a real decode failure still reaches the owning admission unchanged', () => {
  const result = run('decode-failed');
  assert.deepEqual(result.unhandled, []);
  assert.deepEqual(result.errors, [{ name: 'Error', message: 'fixture decode failed', original: true }]);
  assert.equal(result.compositions, 0);
  assert.equal(result.activeDecodeCount, 0);
});

test('a live owner waits for the exact current-plan decode before composition', () => {
  const result = run('live');
  assert.deepEqual(result.unhandled, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.beforeDecodeCompositions, 0);
  assert.equal(result.compositions, 1);
  assert.equal(result.activeDecodeCount, 0);
  assert.equal(result.hasRequiredRecord, true);
});
