// A sector jump is a pose discontinuity. Before this contract existed, the render fence happily
// blended the pack taken at Helios against the pack taken at Ceres, so the player's own hull was
// drawn thousands of world units from its camera — and because a standing-still root is neither
// dirty nor pose-delta, that wrong pose then froze for the rest of the session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('a recycled live entity waits for its own completed pose and never borrows the former body', () => {
  // Exercise the live renderer's two gates without constructing a WebGL context.
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const applyMethod = source.match(/  _applyPresentationPose\([^]*?\n  \},/)[0];
  const hasMethod = source.match(/  _hasCompletedPresentationPose\([^]*?\n  \},/)[0];
  const methods = new Function(
    'applySnapshotPoseToMesh', 'snapshotHasEntityGeneration', 'snapshotIndexOf', 'poseSpanAlpha',
    'LOOP_FIXED_DT', 'POSE_JUMP_WU', 'attributePoseJump',
    `return { ${applyMethod} ${hasMethod} };`,
  )(
    applySnapshotPoseToMesh, snapshotFence.snapshotHasEntityGeneration, snapshotIndexOf,
    snapshotFence.poseSpanAlpha, 1 / 60, Infinity, () => {},
  );
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 100, z: 20, poseEpoch: 3, simTime: 1, generation: 1 });
  const owner = {
    ...methods,
    _presentationWorld: {
      entityIds: Uint32Array.of(PLAYER_ID),
      slotGenerations: Uint32Array.of(2),
    },
    _snapshotFence: fence,
    _frameMembrane: { origin: { x: 0, z: 0 } },
    state: { accumulator: 0, render: {} },
  };
  const mesh = meshStub();
  mesh.position.x = 900;
  mesh.position.z = 80;
  assert.equal(owner._hasCompletedPresentationPose(0, PLAYER_ID), false,
    'an id match from the previous body is not a completed current-generation pose');
  assert.equal(owner._applyPresentationPose(0, mesh, 0.5), false);
  assert.deepEqual(mesh.position, { x: 900, y: 0, z: 80 }, 'rejection leaves the new body pose alone');

  packOne(fence, { x: 900, z: 80, poseEpoch: 3, simTime: 1 + 1 / 60, generation: 2 });
  assert.equal(owner._hasCompletedPresentationPose(0, PLAYER_ID), true);
  assert.equal(owner._applyPresentationPose(0, mesh, 0.5), true);
  assert.deepEqual(mesh.position, { x: 900, y: 0, z: 80 },
    'the current body is accepted without interpolating toward the old generation');
});
