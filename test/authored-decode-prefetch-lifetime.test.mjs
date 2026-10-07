import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

// Each worker owns its process-level rejection events. The Node test runner treats an
// unhandled rejection as its own failure, even when a test installs a diagnostic listener.
function run(scenario) {
  const result = spawnSync(process.execPath, [
    new URL('./helpers/authored-decode-prefetch-fixture.mjs', import.meta.url).pathname,
    scenario,
  ], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('a departed owner during plan decode is observed before the speculative prefetch settles', () => {
  const result = run('owner-departed');
  assert.deepEqual(result.unhandled, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'AbortError');
  assert.match(result.errors[0].message, /owner became inactive after-plan-file/);
  assert.equal(result.compositions, 0);
  assert.equal(result.activeDecodeCount, 0);
});

test('prefetch cancellation cannot abandon the already-started deadline rejection', () => {
  const result = run('cancel-prefetch');
  assert.deepEqual(result.unhandled, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, 'AbortError');
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

test('a live owner waits for both prefetch and deadline decode before composition', () => {
  const result = run('live');
  assert.deepEqual(result.unhandled, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.beforePrefetchCompositions, 0);
  assert.equal(result.compositions, 1);
  assert.equal(result.activeDecodeCount, 0);
  assert.equal(result.hasRequiredRecord, true);
});
