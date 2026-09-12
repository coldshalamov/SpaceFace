// A sector jump is a pose discontinuity. Before this contract existed, the render fence happily
// blended the pack taken at Helios against the pack taken at Ceres, so the player's own hull was
// drawn thousands of world units from its camera — and because a standing-still root is neither
// dirty nor pose-delta, that wrong pose then froze for the rest of the session.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  snapshotIndexOf,
} from '../src/render/snapshotFence.js';

const PLAYER_ID = 1;

function packOne(fence, { x, z, simTime = 0, poseEpoch = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  snapshot.write(PLAYER_ID, 0, x, 0, z, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
}

function meshStub() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
}

test('two packs in one pose epoch interpolate', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, z: 0, poseEpoch: 3 });
  packOne(fence, { x: 100, z: 40, poseEpoch: 3 });
  const previous = fence.previousSnapshot();
  assert.ok(previous, 'a same-epoch predecessor is a valid blend source');
  const mesh = meshStub();
  assert.equal(
    applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 }, previous, 0.5),
    true,
  );
  assert.equal(mesh.position.x, 50);
  assert.equal(mesh.position.z, 20);
});

test('a pack across a pose-epoch boundary has no interpolation source', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  // Helios, then the same entity id after a gate jump to Ceres.
  packOne(fence, { x: -84, z: 4, poseEpoch: 7 });
  packOne(fence, { x: -9629, z: 6279, poseEpoch: 8 });
  assert.equal(fence.previousSnapshot(), null,
    'the pre-jump pack must not be offered as a blend source');
  const mesh = meshStub();
  applySnapshotPoseToMesh(
    mesh,
    fence.latestSnapshot(),
    PLAYER_ID,
    { x: -8192, z: 8192 },
    fence.previousSnapshot(),
    0.5,
  );
  // The arriving pose, exactly — not a point 50% of the way back to the previous sector.
  assert.equal(Math.round(mesh.position.x), -1437);
  assert.equal(Math.round(mesh.position.z), -1913);
});

test('the epoch boundary lifts once two packs share the new epoch', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: -84, z: 4, poseEpoch: 7 });
  packOne(fence, { x: -9629, z: 6279, poseEpoch: 8 });
  assert.equal(fence.previousSnapshot(), null);
  packOne(fence, { x: -9529, z: 6279, poseEpoch: 8 });
  const previous = fence.previousSnapshot();
  assert.ok(previous, 'ordinary flight after the jump interpolates again');
  assert.equal(snapshotIndexOf(previous, PLAYER_ID), 0);
  const mesh = meshStub();
  applySnapshotPoseToMesh(
    mesh,
    fence.latestSnapshot(),
    PLAYER_ID,
    { x: -8192, z: 8192 },
    previous,
    0.5,
  );
  assert.equal(Math.round(mesh.position.x), -1387);
});

test('an unstamped pack keeps the default epoch and still interpolates', () => {
  // Callers that predate the epoch argument must not silently lose interpolation.
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, z: 0 });
  packOne(fence, { x: 10, z: 0 });
  assert.ok(fence.previousSnapshot());
});
