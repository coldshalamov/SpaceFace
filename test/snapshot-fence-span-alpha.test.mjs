// A multi-step present used to draw the stale previous pack: the render alpha is normalized to
// ONE sim tick (accumulator/fixedDt), but on any frame that completes k > 1 steps (missed vsync,
// long frame, present-first recovery) the previous pack sits k ticks behind the latest, so the
// one-tick alpha landed near the stale pose — the hull froze for a present, then snapped the whole
// span forward. The span-normalized blend is the contract under test: it must reduce to the legacy
// alpha for one-tick spans and spread catch-up motion across the real span otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  poseSpanAlpha,
  snapshotIndexOf,
} from '../src/render/snapshotFence.js';

const PLAYER_ID = 1;
const DT = 1 / 60;

function packOne(fence, { x, z = 0, simTime = 0, poseEpoch = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  snapshot.write(PLAYER_ID, 0, x, 0, z, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
}

function meshStub() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
}

function twoPackFence(spanTicks, x0 = 0, x1 = 100) {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: x0, simTime: 0 });
  packOne(fence, { x: x1, simTime: spanTicks * DT });
  return fence;
}

test('a one-tick span reduces to the legacy accumulator alpha', () => {
  const fence = twoPackFence(1);
  const latest = fence.latestSnapshot();
  const previous = fence.previousSnapshot();
  for (const acc of [0, 0.25 * DT, 0.5 * DT, 0.9 * DT]) {
    assert.ok(
      Math.abs(poseSpanAlpha(latest, previous, acc, DT, 0.42) - acc / DT) < 1e-12,
      `span=1 tick, acc=${acc}: must equal accumulator/fixedDt`,
    );
  }
});

test('a multi-step catch-up present no longer draws the stale previous pose', () => {
  // The ship moved 200 WU over two ticks; the present after both steps must draw mid-span,
  // not hold the previous pose (legacy behavior with acc≈0) nor overshoot onto the latest.
  const fence = twoPackFence(2, 0, 200);
  const latest = fence.latestSnapshot();
  const previous = fence.previousSnapshot();
  const t = poseSpanAlpha(latest, previous, 0, DT, 0);
  assert.ok(Math.abs(t - 0.5) < 1e-12, `acc=0 across a 2-tick span must blend 0.5, got ${t}`);
  const mesh = meshStub();
  applySnapshotPoseToMesh(mesh, latest, PLAYER_ID, { x: 0, z: 0 }, previous, t);
  assert.ok(Math.abs(mesh.position.x - 100) < 1e-9, `hull mid-span at 100, got ${mesh.position.x}`);
});

test('the blended pose always lands at latest.simTime + accumulator - fixedDt', () => {
  // renderTime = prev.simTime + t*span must equal the moment one tick behind the newest
  // completed state, for every catch-up depth and accumulator phase.
  for (let spanTicks = 1; spanTicks <= 4; spanTicks++) {
    const fence = twoPackFence(spanTicks, 0, 100);
    const latest = fence.latestSnapshot();
    const previous = fence.previousSnapshot();
    // The live accumulator is always a sub-tick leftover after advance; sweep exactly that domain.
    for (let accTicks = 0; accTicks < 1; accTicks += 0.25) {
      const acc = accTicks * DT;
      const t = poseSpanAlpha(latest, previous, acc, DT, 0);
      const renderedT = previous.simTime + t * (latest.simTime - previous.simTime);
      const expectedT = latest.simTime + acc - DT;
      assert.ok(
        Math.abs(renderedT - expectedT) < 1e-9,
        `span=${spanTicks} acc=${acc}: rendered ${renderedT}, expected ${expectedT}`,
      );
    }
  }
});

test('degenerate spans fall back to the raw alpha', () => {
  const fence = twoPackFence(1);
  const latest = fence.latestSnapshot();
  // No predecessor (first pack, or across a pose epoch).
  assert.equal(poseSpanAlpha(latest, null, 0.5 * DT, DT, 0.42), 0.42);
  assert.equal(poseSpanAlpha(null, latest, 0.5 * DT, DT, 0.42), 0.42);
  // Same stamp twice (a repack with no completed tick between) has no blend geometry.
  assert.equal(poseSpanAlpha(latest, latest, 0.5 * DT, DT, 0.42), 0.42);
  // A caller without a usable fixed dt cannot normalize anything.
  const previous = fence.previousSnapshot();
  assert.equal(poseSpanAlpha(latest, previous, 0.5 * DT, NaN, 0.42), 0.42);
  assert.equal(poseSpanAlpha(latest, previous, 0.5 * DT, 0, 0.42), 0.42);
});

test('the blend parameter stays inside [0, 1] for hostile inputs', () => {
  const fence = twoPackFence(4);
  const latest = fence.latestSnapshot();
  const previous = fence.previousSnapshot();
  for (const [acc, dt] of [[-1, DT], [10, DT], [0.5 * DT, 1e-9], [0.5 * DT, -DT]]) {
    const t = poseSpanAlpha(latest, previous, acc, dt, 0.5);
    assert.ok(t >= 0 && t <= 1, `acc=${acc} dt=${dt}: ${t} out of range`);
    assert.ok(Number.isFinite(t));
  }
});

test('a spawned entity absent from the previous pack draws at its latest pose', () => {
  // poseSpanAlpha only gates the blend parameter; entities the previous pack never saw must
  // still resolve exactly at the latest pose (applySnapshotPoseToMesh fails closed to latest).
  const fence = twoPackFence(2, 0, 500);
  const mesh = meshStub();
  applySnapshotPoseToMesh(
    mesh,
    fence.latestSnapshot(),
    PLAYER_ID + 7,
    { x: 0, z: 0 },
    fence.previousSnapshot(),
    0.5,
  );
  assert.equal(mesh.position.x, 0, 'unknown ids pose nothing rather than guessing');
  assert.equal(snapshotIndexOf(fence.latestSnapshot(), PLAYER_ID + 7), -1);
});
