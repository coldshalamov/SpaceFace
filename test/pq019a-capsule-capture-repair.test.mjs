import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CAPTURE_SOURCE = new URL('../scripts/capture-pq019a-acceptance.mjs', import.meta.url);
const NDC_LIMIT = 0.62;

const RETAINED_H1_OFFSCREEN_FINGERPRINT = Object.freeze([
  Object.freeze({ framing: 'close', x: 4.385936963473403, y: 6.7265673025073065 }),
  Object.freeze({ framing: 'default', x: 4.405463075383872, y: 6.7529917361414125 }),
  Object.freeze({ framing: 'far', x: 4.4268426378597665, y: 6.785944619650366 }),
]);

function projectionIsInFrame(projection) {
  return !!projection
    && Math.abs(projection.x) <= NDC_LIMIT
    && Math.abs(projection.y) <= NDC_LIMIT;
}

test('retained H1 row-3 capsule projections reproduce the offscreen failure', () => {
  for (const projection of RETAINED_H1_OFFSCREEN_FINGERPRINT) {
    assert.equal(
      projectionIsInFrame(projection),
      false,
      `${projection.framing} must retain the recorded offscreen classification`,
    );
  }
});

test('PQ-019A applies and verifies its declared seed through visible New Game', async () => {
  const source = await readFile(CAPTURE_SOURCE, 'utf8');

  for (const required of [
    "waitFor({ state: 'visible'",
    "page.fill('#sf-ng-seed', String(CAPTURE_SEED))",
    'window.SF.state.meta?.seed ?? null',
    "assert.equal(recordedSeed, CAPTURE_SEED, 'New Game must consume the declared capture seed')",
  ]) {
    assert.ok(source.includes(required), `missing seeded New Game contract: ${required}`);
  }
});

test('PQ-019A tracks the frozen live capsule with the game camera and rejects offscreen stills', async () => {
  const source = await readFile(CAPTURE_SOURCE, 'utf8');

  for (const required of [
    'async function trackFrozenSubject(page, targetId, framing)',
    'tracked.mesh.getWorldPosition(focus)',
    'ctrl.follow = function pq019aFrozenSubjectFollow(frameDt)',
    'originalFollow.call(ctrl, frameDt)',
    'cam.lookAt(focus)',
    'cam.updateMatrixWorld(true)',
    'await clearFrozenSubjectTracking(page)',
    'assertInFrame(receipt, `cargo_capsule/${framing.name}`)',
  ]) {
    assert.ok(source.includes(required), `missing frozen-capsule camera contract: ${required}`);
  }
  assert.doesNotMatch(source, /projection check is advisory for the capsule/i);
});
