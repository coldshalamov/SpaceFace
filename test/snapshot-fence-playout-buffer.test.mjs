// E1 — the playout buffer contract. The presented clock plays at newest − adaptive delay,
// interpolating between the history packs bracketing that moment. A late reply lands inside
// history (nothing visible changes); only true worker silence reaches extrapolation, and the
// re-seat afterwards is smooth. The pack writers keep reading the TRUE newest pack while the
// pose accessors serve the presented pair.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
} from '../src/render/snapshotFence.js';

const PLAYER_ID = 1;
const DT = 1 / 60;

function packOne(fence, { x, simTime = 0, poseEpoch = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  snapshot.write(PLAYER_ID, 0, x, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
}

function meshStub() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
}

function applyPose(fence, mesh, alpha) {
  applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence.previousSnapshot(), alpha);
}

test('a late pack lands inside history: the drawn pose never holds or jumps', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  // 10 ticks of steady 60 WU/s motion (1 WU per tick), then silence, then a burst.
  for (let tick = 0; tick <= 10; tick++) packOne(fence, { x: tick, simTime: tick * DT });
  const mesh = meshStub();
  const drawn = [];
  const step = (elapsedS) => {
    const alpha = fence.samplePresentationAlpha(elapsedS, 0, DT);
    applyPose(fence, mesh, alpha);
    drawn.push(mesh.position.x);
  };
  // 300 ms of worker silence: the delay buffer plays first, extrapolation after.
  for (let i = 0; i < 18; i++) step(1 / 60);
  for (let i = 1; i < drawn.length; i++) {
    assert.ok(drawn[i] >= drawn[i - 1] - 1e-9, `motion is monotone under silence: ${i}`);
  }
  // No repeat-pose frames while the hull is in motion (the E1 verify bar).
  let held = 0;
  for (let i = 1; i < drawn.length; i++) {
    held = drawn[i] - drawn[i - 1] <= 1e-4 ? held + 1 : 0;
    assert.ok(held <= 2, `pose repeated ${held} frames while moving: ${drawn.slice(i - 2, i + 1)}`);
  }
  // A late burst arrives: packs land INSIDE history (presented clock is behind them),
  // so the world continues at the same cadence. The burst also moves the delayed target
  // forward; the damped re-seat spreads that over ~90 ms. Every per-frame jump stays
  // within the E1 verify bound: 2x the body's speed x frame time (60 wu/s x 1/60 s).
  const beforeBurst = drawn.at(-1);
  for (let tick = 11; tick <= 22; tick++) packOne(fence, { x: tick, simTime: tick * DT });
  for (let i = 0; i < 10; i++) step(1 / 60);
  const speedWuS = 60; // 1 WU per tick at 60 ticks/s
  for (let i = drawn.length - 10; i < drawn.length; i++) {
    const jump = drawn[i] - drawn[i - 1];
    assert.ok(jump <= 2 * speedWuS * (1 / 60) + 1e-6,
      `per-frame jump within 2x speed x frame time: ${jump.toFixed(3)} wu`);
  }
  assert.ok(drawn.at(-1) > beforeBurst);
});

test('the presented accessors serve the delayed pair; the pack writer sees the newest', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  for (let tick = 0; tick <= 6; tick++) packOne(fence, { x: tick * 10, simTime: tick * DT });
  fence.samplePresentationAlpha(1 / 60, 0, DT);
  const presentedLatest = fence.latestSnapshot();
  const presentedPrevious = fence.previousSnapshot();
  const newest = fence.newestSnapshot();
  assert.ok(presentedLatest.simTime < newest.simTime,
    `presented moment plays behind the newest pack (${presentedLatest.simTime} < ${newest.simTime})`);
  assert.ok(presentedPrevious.simTime < presentedLatest.simTime,
    'the presented pair spans the presented moment');
  // The pack base is the true newest even while presentation runs delayed.
  assert.equal(newest.simTime, 6 * DT);
});

test('the adaptive delay grows when the buffer runs dry and shrinks when history is deep', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, simTime: 0 });
  packOne(fence, { x: 100, simTime: DT });
  // Drive the presented clock into the extrapolation zone, THEN let a pack land while
  // the clock is past the old newest — that commit prices the dry buffer.
  for (let i = 0; i < 30; i++) fence.samplePresentationAlpha(1 / 60, 0, DT);
  packOne(fence, { x: 200, simTime: 2 * DT });
  fence.samplePresentationAlpha(1 / 60, 0, DT);
  const dry = fence.getPlayoutDiagnostics();
  assert.ok(dry.playoutDryEvents > 0, 'dry commits are counted');
  assert.ok(dry.playoutDelayTargetMs > 50, `dry events raise the delay target: ${dry.playoutDelayTargetMs}`);
  assert.ok(dry.playoutDelayTargetMs <= 100, 'the delay target never exceeds 100 ms');
  // A healthy stretch of packs landing with the clock comfortably behind lowers it again.
  for (let tick = 3; tick <= 40; tick++) packOne(fence, { x: tick, simTime: tick * DT });
  for (let i = 0; i < 60; i++) fence.samplePresentationAlpha(1 / 60, 0, DT);
  const healthy = fence.getPlayoutDiagnostics();
  assert.ok(healthy.playoutDelayTargetMs < dry.playoutDelayTargetMs,
    `history headroom eases the delay down: ${healthy.playoutDelayTargetMs}`);
  assert.ok(healthy.playoutDelayTargetMs >= 33, 'the delay target never drops below 33 ms');
});
