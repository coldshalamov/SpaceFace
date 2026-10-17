// The worker lane's "ship jumps forward and back" bug. In the worker lane the accumulator riding each
// reply is the Worker's remainder at the instant it posted, not a phase this thread can use, and a
// reply reaches the main thread whenever the ack handshake and the display's refresh happen to
// line up. On a 60 Hz panel the legacy accumulator clock coincidentally averages out; on 75/120/144
// Hz panels roughly four displayed frames in ten drew the hull at under 0.6x or over 1.5x of its
// true speed and one in ten held it dead still. The "follow" presentation clock is the contract
// under test: the drawn moment advances at wall rate, steered (never stopped or jumped) toward one
// tick behind the newest pack.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  EXTRAPOLATION_MAX_DISTANCE_WU,
  FOLLOW_MAX_EXTRAPOLATION_S,
} from '../src/render/snapshotFence.js';

const DT = 1 / 60;
const PLAYER_ID = 1;

function packOne(fence, { x = 0, simTime = 0, poseEpoch = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  snapshot.write(PLAYER_ID, 0, x, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Worker (deadline timer + per-step CPU cost that blocks its own message handling) + one-reply-in-flight
 * ack handshake + a display at `hz`. `burst` models a saturated Worker that runs several steps per
 * timer fire and posts one reply per burst. Returns the per-frame ratio of drawn sim-time advance to
 * wall-time advance (1.0 == perfectly even motion).
 */
function simulate({ mode, hz, secs = 20, seed = 7, workerJitterMs = 0.8, latencyMs = 1, latencyJitterMs = 0.6,
  burst = null, options = {} }) {
  const rnd = lcg(seed);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / 0.7071; };
  const fence = createSnapshotFence({ capacity: 4, presentationClock: mode, ...options });
  const lat = () => Math.max(0.1, latencyMs + gauss() * latencyJitterMs);
  const frameMs = 1000 / hz;
  let acc = 0; let anchor = 0; let deadline = DT * 1000; let simTicks = 0; let workerFree = 0;
  let awaitingAck = false; let retained = null;
  const toMain = []; const toWorker = [];
  let nextRaf = frameMs; let lastRaf = 0; let t = 0;
  let accumulator = 0;
  let prevP = null; let prevWall = null;
  const ratios = [];
  while (t < secs * 1000) {
    const tTick = Math.max(deadline, workerFree);
    const tAck = toWorker.length ? Math.max(toWorker[0], workerFree) : Infinity;
    t = Math.min(tTick, tAck, nextRaf);
    if (t === tTick) {
      acc += (t - anchor) / 1000; anchor = t;
      let steps = 0;
      while (acc >= DT && steps < 4) { acc -= DT; steps++; }
      if (acc >= DT) acc -= Math.floor(acc / DT) * DT;
      simTicks += steps;
      workerFree = t + (steps > 0 ? (burst ? burst.perStepMs : 0.5) * steps : 0.2);
      if (steps > 0) {
        const reply = { simTime: simTicks * DT, acc };
        if (awaitingAck) retained = reply;
        else { awaitingAck = true; toMain.push({ arrive: workerFree + lat(), ...reply }); }
      }
      deadline += (burst ? burst.periodMs : DT * 1000) + gauss() * (burst ? burst.jitterMs : workerJitterMs);
      if (deadline <= t) deadline = t + 0.1;
    } else if (t === tAck) {
      toWorker.shift();
      awaitingAck = false;
      if (retained) { awaitingAck = true; toMain.push({ arrive: t + lat(), ...retained }); retained = null; }
    } else {
      let got = null;
      while (toMain.length && toMain[0].arrive <= t) got = toMain.shift();
      if (got) {
        packOne(fence, { simTime: got.simTime });
        accumulator = got.acc;
        toWorker.push(t + lat());
      }
      const latest = fence.latestSnapshot();
      if (latest) {
        const prior = fence.previousSnapshot();
        const a = fence.samplePresentationAlpha((t - lastRaf) / 1000, accumulator, DT, accumulator / DT);
        const P = prior ? prior.simTime + (latest.simTime - prior.simTime) * a : latest.simTime;
        if (prevP !== null && t - prevWall > 0) ratios.push(((P - prevP) * 1000) / (t - prevWall));
        prevP = P; prevWall = t;
      }
      lastRaf = t;
      nextRaf += frameMs + gauss() * 0.4;
      if (nextRaf <= t) nextRaf = t + 0.5;
    }
  }
  const n = ratios.length;
  const mean = ratios.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    mean,
    sd: Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / n),
    wrong: ratios.filter((r) => r < 0.6 || r > 1.5).length / n,
    held: ratios.filter((r) => r < 0.05).length / n,
    backwards: ratios.filter((r) => r < 0).length,
  };
}

test('on a high-refresh display the follow clock draws the hull at an even speed', () => {
  for (const hz of [75, 120, 144]) {
    const legacy = simulate({ mode: 'accumulator', hz });
    const follow = simulate({ mode: 'follow', hz });
    // The legacy clock is the bug being pinned: a large share of frames at the wrong speed.
    assert.ok(legacy.wrong > 0.12, `${hz} Hz: expected the legacy clock to judder, wrong=${legacy.wrong}`);
    assert.ok(follow.wrong < 0.05, `${hz} Hz: follow clock drew ${(follow.wrong * 100).toFixed(1)}% of frames at the wrong speed`);
    assert.ok(follow.held < 0.03, `${hz} Hz: follow clock held the hull on ${(follow.held * 100).toFixed(1)}% of frames`);
    assert.ok(follow.sd < legacy.sd / 2, `${hz} Hz: sd ${follow.sd.toFixed(2)} must beat legacy ${legacy.sd.toFixed(2)} by half`);
    assert.equal(follow.backwards, 0, `${hz} Hz: the drawn moment never runs backwards`);
    assert.ok(Math.abs(follow.mean - 1) < 0.02, `${hz} Hz: long-run speed stays real time, got ${follow.mean}`);
  }
});

test('a 60 Hz display and noisy worker timers stay even and monotonic under the follow clock', () => {
  const noisy = simulate({ mode: 'follow', hz: 60, workerJitterMs: 2.5, latencyJitterMs: 2, seed: 11 });
  assert.ok(noisy.wrong < 0.08, `wrong-speed frames ${(noisy.wrong * 100).toFixed(1)}%`);
  assert.equal(noisy.backwards, 0);
});

test('the follow clock holds on pause, snaps on a new pose epoch, and re-seeds after a clock rewind', () => {
  const fence = createSnapshotFence({ capacity: 4, presentationClock: 'follow' });
  packOne(fence, { x: 0, simTime: 0 });
  packOne(fence, { x: 100, simTime: DT });
  const a = fence.samplePresentationAlpha(0.004, 0.5 * DT, DT, 0.5);
  assert.equal(fence.samplePresentationAlpha(0, 0.5 * DT, DT, 0.5), a, 'a frozen present holds the drawn moment');
  packOne(fence, { x: -1000, simTime: 20, poseEpoch: 1 });
  assert.equal(fence.samplePresentationAlpha(0.02, 0, DT), 1, 'a teleport never blends sectors');
  packOne(fence, { x: 0, simTime: 0, poseEpoch: 1 });
  packOne(fence, { x: 10, simTime: DT, poseEpoch: 1 });
  assert.ok(Math.abs(fence.samplePresentationAlpha(0.01, 0.5 * DT, DT) - 0.5) < 1e-12,
    'a rewound sim clock re-seeds from the accumulator phase');
});

test('a saturated Worker that posts bursts of steps still plays out evenly (the stop-motion bug)', () => {
  // Measured on the real Worker lane at ~13 ms/step: ~21 replies/s, ~3 steps each. The legacy clock
  // runs the hull for one tick and then holds it for two, over and over.
  const scenarios = [
    { periodMs: 50, jitterMs: 12, perStepMs: 13 },
    { periodMs: 33, jitterMs: 8, perStepMs: 9 },
  ];
  for (const burst of scenarios) {
    for (const hz of [60, 144]) {
      const legacy = simulate({ mode: 'accumulator', hz, burst, secs: 25 });
      const follow = simulate({ mode: 'follow', hz, burst, secs: 25 });
      const label = `${burst.periodMs} ms bursts @ ${hz} Hz`;
      assert.ok(legacy.held > 0.15, `${label}: expected the legacy clock to hold the hull, held=${legacy.held}`);
      assert.ok(follow.held < 0.03, `${label}: follow clock held ${(follow.held * 100).toFixed(1)}% of frames`);
      assert.ok(follow.wrong < 0.06, `${label}: follow clock drew ${(follow.wrong * 100).toFixed(1)}% at the wrong speed`);
      assert.equal(follow.backwards, 0, `${label}: never backwards`);
      assert.ok(Math.abs(follow.mean - 1) < 0.03, `${label}: long-run speed stays real time, got ${follow.mean}`);
    }
  }
});

test('the follow clock stays in [older pack, newer pack + headroom], never runs backwards, then settles', () => {
  const fence = createSnapshotFence({ capacity: 4, presentationClock: 'follow' });
  packOne(fence, { x: 0, simTime: 0 });
  packOne(fence, { x: 100, simTime: DT });
  const ceiling = 1 + FOLLOW_MAX_EXTRAPOLATION_S / DT;
  let last = -Infinity;
  for (let i = 0; i < 80; i++) {
    const a = fence.samplePresentationAlpha(0.01, 0, DT, 0);
    assert.ok(a >= 0 && a <= ceiling + 1e-9, `alpha ${a} outside [0, ${ceiling}]`);
    assert.ok(a >= last - 1e-12, 'alpha must not run backwards inside one bracket');
    last = a;
  }
  assert.ok(Math.abs(last - ceiling) < 1e-9,
    `with no newer pack the hull glides to the headroom and stops (alpha ${last}, ceiling ${ceiling})`);
});

test('pose application extrapolates a flying body past its newest pack and refuses to project a jump', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} });
  const origin = { x: 0, z: 0 };

  // Flying: 10 WU per tick. t = 1.5 carries it 5 WU past the newest pack.
  packOne(fence, { x: 0, simTime: 0 });
  packOne(fence, { x: 10, simTime: DT });
  let m = mesh();
  applySnapshotPoseToMesh(m, fence.latestSnapshot(), PLAYER_ID, origin, fence.previousSnapshot(), 1.5);
  assert.ok(Math.abs(m.position.x - 15) < 1e-9, `extrapolated to 15, got ${m.position.x}`);

  // The distance cap bounds how far past the newest pack a fast body is projected.
  m = mesh();
  applySnapshotPoseToMesh(m, fence.latestSnapshot(), PLAYER_ID, origin, fence.previousSnapshot(), 50);
  assert.ok(Math.abs(m.position.x - (10 + EXTRAPOLATION_MAX_DISTANCE_WU)) < 1e-6,
    `projection is capped at ${EXTRAPOLATION_MAX_DISTANCE_WU} WU past the pack, got ${m.position.x}`);

  // A teleport inside one pose epoch (5000 WU in one tick) is a jump, not flight: hold the newest pose.
  const jump = createSnapshotFence({ capacity: 4 });
  packOne(jump, { x: 0, simTime: 0 });
  packOne(jump, { x: 5000, simTime: DT });
  m = mesh();
  applySnapshotPoseToMesh(m, jump.latestSnapshot(), PLAYER_ID, origin, jump.previousSnapshot(), 3);
  assert.equal(m.position.x, 5000, 'a jump is never projected past where it landed');

  // Interpolation inside the span is unchanged by the extrapolation branch.
  m = mesh();
  applySnapshotPoseToMesh(m, fence.latestSnapshot(), PLAYER_ID, origin, fence.previousSnapshot(), 0.25);
  assert.ok(Math.abs(m.position.x - 2.5) < 1e-9);
});
