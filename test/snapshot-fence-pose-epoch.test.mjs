// A sector jump is a pose discontinuity. Before this contract existed, the render fence happily
// blended the pack taken at Helios against the pack taken at Ceres, so the player's own hull was
// drawn thousands of world units from its camera — and because a standing-still root is neither
// dirty nor pose-delta, that wrong pose then froze for the rest of the session.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as snapshotFence from '../src/render/snapshotFence.js';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  snapshotIndexOf,
} from '../src/render/snapshotFence.js';

const PLAYER_ID = 1;

function packOne(fence, { x, z, simTime = 0, poseEpoch = 0, generation = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  const index = snapshot.write(PLAYER_ID, 0, x, 0, z, 0, 0, 0, 1, 1, 1, 1, 0);
  snapshot.setGeneration(index, generation);
  fence.commit();
}

function meshStub() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
}

test('two packs in one pose epoch interpolate', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, z: 0, simTime: 0, poseEpoch: 3 });
  packOne(fence, { x: 10, z: 4, simTime: 1 / 60, poseEpoch: 3 });
  const previous = fence.previousSnapshot();
  assert.ok(previous, 'a same-epoch predecessor is a valid blend source');
  const mesh = meshStub();
  assert.equal(
    applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 }, previous, 0.5),
    true,
  );
  assert.equal(mesh.position.x, 5);
  assert.equal(mesh.position.z, 2);
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
  packOne(fence, { x: -9619, z: 6279, poseEpoch: 8 });
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
  assert.equal(Math.round(mesh.position.x), -1432);
});

test('an unstamped pack keeps the default epoch and still interpolates', () => {
  // Callers that predate the epoch argument must not silently lose interpolation.
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, z: 0 });
  packOne(fence, { x: 10, z: 0 });
  assert.ok(fence.previousSnapshot());
});

test('two frames after an epoch change both draw the new sector, even at the same slot', () => {
  // Sector transition via world:playerRelocated: all bodies keep their id and generation
  // (nothing was recycled) and are reassigned mirror slots. The presented clock lags inside
  // the new stream, so the bracket resolver must never fall back to the old epoch's pair —
  // that drew the player's hull in the previous sector for the first 2–3 frames.
  const fence = createSnapshotFence({ capacity: 4 });
  const generation = 5;
  packOne(fence, { x: -84, z: 4, simTime: 0, poseEpoch: 7, generation });
  packOne(fence, { x: -74, z: 4, simTime: 1 / 60, poseEpoch: 7, generation });
  packOne(fence, { x: -9629, z: 6279, simTime: 2 / 60, poseEpoch: 8, generation });
  packOne(fence, { x: -9619, z: 6279, simTime: 3 / 60, poseEpoch: 8, generation });
  const mesh = meshStub();
  for (let frame = 1; frame <= 2; frame++) {
    const alpha = fence.samplePresentationAlpha(1 / 60, 0, 1 / 60);
    const previous = fence.previousSnapshot();
    const latest = fence.latestSnapshot();
    assert.ok(snapshotIndexOf(latest, PLAYER_ID) >= 0, `frame ${frame}: the player is packed`);
    assert.equal(latest.columns.generation[snapshotIndexOf(latest, PLAYER_ID)], generation,
      `frame ${frame}: the same generation-preserving body is the presented row`);
    applySnapshotPoseToMesh(mesh, latest, PLAYER_ID, { x: 0, z: 0 }, previous, alpha);
    assert.ok(mesh.position.x > -10000 && mesh.position.x < -9000,
      `frame ${frame} draws the new sector, not the old one: x=${mesh.position.x}`);
    assert.ok(mesh.position.z > 6000,
      `frame ${frame} draws the new sector z: z=${mesh.position.z}`);
    if (previous) {
      assert.ok(previous.poseEpoch === latest.poseEpoch,
        `frame ${frame}: the served pair shares the newest pack's epoch`);
    }
  }
  // Two frames in, the presentation has not advanced past the oldest new-sector pack: the
  // fallback serves it at alpha 0 rather than inventing motion or the old pose.
  assert.equal(Math.round(mesh.position.x), -9629);
});

test('a recycled live entity waits for its own completed pose and never borrows the former body', () => {
  // The live renderer's two gates, exercised through the public fence seam:
  // _hasCompletedPresentationPose is snapshotHasEntityGeneration, and the pose writer's
  // same-generation blend gate is snapshotSameGenerationRow. A recycled id may only be
  // posed from the current generation's completed pack.
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 100, z: 20, poseEpoch: 3, simTime: 0, generation: 1 });
  assert.equal(snapshotFence.snapshotHasEntityGeneration(fence.latestSnapshot(), PLAYER_ID, 2),
    false, 'an id match from the previous body is not a completed current-generation pose');
  const mesh = meshStub();
  mesh.position.x = 900;
  mesh.position.z = 80;
  applySnapshotPoseToMesh(
    mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 }, fence.previousSnapshot(), 0.5,
  );
  assert.deepEqual({ x: mesh.position.x, z: mesh.position.z }, { x: 100, z: 20 },
    'the old generation cannot be blended into the replacement');

  packOne(fence, { x: 900, z: 80, poseEpoch: 3, simTime: 1 / 60, generation: 2 });
  assert.equal(snapshotFence.snapshotHasEntityGeneration(fence.latestSnapshot(), PLAYER_ID, 2),
    true, 'the current generation is accepted');
  applySnapshotPoseToMesh(
    mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 }, fence.previousSnapshot(), 0.5,
  );
  assert.deepEqual({ x: mesh.position.x, z: mesh.position.z }, { x: 900, z: 80 },
    'the current body is accepted without interpolating toward the old generation');

  packOne(fence, { x: 910, z: 80, poseEpoch: 3, simTime: 2 / 60, generation: 2 });
  applySnapshotPoseToMesh(
    mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 }, fence.previousSnapshot(), 0.5,
  );
  assert.deepEqual({ x: mesh.position.x, z: mesh.position.z }, { x: 905, z: 80 },
    'same-generation motion still blends while the hull is live');
});
