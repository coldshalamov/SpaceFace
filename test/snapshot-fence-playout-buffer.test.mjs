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
import { presentedAnchorRot, presentedAnchorXZ } from '../src/render/presentedAnchor.js';

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
  // The clock runs at the extrapolation cap after the dry window, so the servo must first
  // slow down and let the new stream catch up before the trough reads healthy; keep packing
  // (one tick per frame) through the recovery instead of stopping the stream.
  for (let tick = 3; tick <= 120; tick++) {
    packOne(fence, { x: tick, simTime: tick * DT });
    fence.samplePresentationAlpha(1 / 60, 0, DT);
  }
  const healthy = fence.getPlayoutDiagnostics();
  assert.ok(healthy.playoutDelayTargetMs < dry.playoutDelayTargetMs,
    `history headroom eases the delay down: ${healthy.playoutDelayTargetMs} < ${dry.playoutDelayTargetMs}`);
  assert.ok(healthy.playoutDelayTargetMs >= 33, 'the delay target never drops below 33 ms');
  assert.ok(healthy.playoutDelayTargetMs <= 100, 'the delay target never exceeds 100 ms');
  assert.ok(healthy.leadMs >= 33, `the applied lead is maintained: ${healthy.leadMs}`);
});

test('the servo maintains the reserve across 300 sustained 60 Hz frames', () => {
  // One completed pack per presented frame (the 60 Hz cadence). After warm-up the applied
  // delay must stay inside [33, 100] ms and the bracket must trail the newest by at least
  // two packs — the reserve the old one-sided gap-close collapsed to depth 0 / ~15 ms.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 195;
  let lead = 0;
  let depth = 0;
  for (let frame = 0; frame < 300; frame++) {
    packOne(fence, { x: frame * speed * DT, simTime: frame * DT });
    const alpha = fence.samplePresentationAlpha(DT, 0, DT);
    applySnapshotPoseToMesh(
      meshStub(), fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    if (frame >= 120) {
      const diag = fence.getPlayoutDiagnostics();
      assert.ok(diag.delayMs >= 33 && diag.delayMs <= 100,
        `frame ${frame}: applied delay ${diag.delayMs.toFixed(1)} ms outside [33,100]`);
      assert.ok(diag.playoutDelayMs >= 33 && diag.playoutDelayMs <= 100,
        `frame ${frame}: applied playout delay ${diag.playoutDelayMs.toFixed(1)} ms outside [33,100]`);
      assert.ok(diag.bracketDepthPacks >= 2,
        `frame ${frame}: bracket depth ${diag.bracketDepthPacks} must be >= 2`);
      lead += 1;
      depth += diag.bracketDepthPacks;
    }
  }
  assert.ok(lead > 0);
  assert.ok(depth / lead >= 2);
});

test('a boosted hull extrapolates 500 ms of silence without a backward snap or freeze', () => {
  // 390 wu/s at 60 Hz is 6.5 wu per hop. The old absolute 40 wu guard tripped at the 150 ms
  // window (extra*hop > 40), reset the blend to t=1, snapped ~40 wu backwards and then held.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 390;
  const hop = speed * DT;
  for (let tick = 0; tick < 20; tick++) {
    packOne(fence, { x: tick * hop, simTime: tick * DT });
  }
  const mesh = meshStub();
  const xs = [];
  let held = 0;
  let maxHeld = 0;
  let maxAlpha = 0;
  for (let frame = 0; frame < 30; frame++) {
    const alpha = fence.samplePresentationAlpha(DT, 0, DT);
    maxAlpha = Math.max(maxAlpha, alpha);
    applySnapshotPoseToMesh(
      mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    xs.push(mesh.position.x);
  }
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] >= xs[i - 1] - 1e-9,
      `frame ${i}: the boosted hull never rewinds (${xs[i - 1]} -> ${xs[i]})`);
    if (xs[i] - xs[i - 1] <= 1e-4) {
      held++;
      maxHeld = Math.max(maxHeld, held);
    } else {
      held = 0;
    }
  }
  assert.equal(maxHeld, 0, 'the boosted hull keeps moving through the extrapolation window');
  assert.ok(maxAlpha > 1, `the window extrapolates: max alpha ${maxAlpha}`);
  assert.ok(xs.at(-1) > xs[0] + 50, 'the 500 ms silence advances the hull materially');
  // The recorder and the mesh must agree on the guard frame: presentedRowPose uses the same
  // shared resolver and clamp, so it cannot report a smooth pose while the mesh snapped.
  const reported = { x: 0, y: 0, z: 0 };
  assert.ok(fence.presentedRowPose(PLAYER_ID, reported), 'the presented row resolves');
  assert.ok(Math.abs(mesh.position.x - reported.x) <= 0.01,
    `recorder and mesh agree on the guard frame: ${mesh.position.x} vs ${reported.x}`);
});

test('a 4-tick coalesced pack cannot exceed the 2x jump bar at 60 fps', () => {
  // The worker reply coalesces four ticks into one pack. The rate servo may run at 1.2x the
  // body speed to recover the reserve, but it must never replay the whole four-tick span in
  // one frame. 195 wu/s => 3.25 wu per tick, 13 wu over four ticks; the per-frame bar is
  // 2 * 195 * (1/60) = 6.5 wu.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 195;
  const mesh = meshStub();
  let x = 0;
  let worstRatio = 0;
  let previousX = null;
  let maxHeld = 0;
  let held = 0;
  for (let frame = 0; frame < 240; frame++) {
    if (frame % 4 === 0) {
      for (let k = 0; k < 4; k++) {
        x += speed * DT;
        packOne(fence, { x, simTime: (frame + k + 1) * DT });
      }
    }
    const alpha = fence.samplePresentationAlpha(DT, 0, DT);
    applySnapshotPoseToMesh(
      mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    if (previousX !== null) {
      const jump = Math.abs(mesh.position.x - previousX);
      worstRatio = Math.max(worstRatio, jump / (2 * speed * DT));
      if (jump <= 1e-4) {
        held++;
        maxHeld = Math.max(maxHeld, held);
      } else {
        held = 0;
      }
    }
    previousX = mesh.position.x;
  }
  assert.ok(worstRatio <= 2, `coalesced pack stayed under the 2x bar: ${worstRatio.toFixed(2)}x`);
  assert.ok(maxHeld <= 1, `coalesced packs do not freeze the hull: ${maxHeld} held frames`);
});

test('a 124 ms pack cadence at 60 fps and 1x stays under the 2x jump bar', () => {
  // The reviewer's fence reproduction: 124 ms replies at 60 fps / 1x gave 9.57 wu = 2.94x
  // the bar and 13 frames over in 4 s. The symmetric servo must never replay a whole reply
  // in one frame; after warm-up the drawn motion tracks the body at <=1.2x.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 195;
  const mesh = meshStub();
  let simTime = 0;
  let x = 0;
  let tick = 0;
  let lastPackTime = 0;
  let previousX = null;
  let worstRatio = 0;
  let over = 0;
  let backward = 0;
  let held = 0;
  let maxHeld = 0;
  for (let frame = 0; frame < 60 * 10; frame++) {
    simTime += DT;
    if (simTime - lastPackTime >= 0.124) {
      while (lastPackTime + DT <= simTime) {
        tick++;
        x += speed * DT;
        lastPackTime += DT;
      }
      packOne(fence, { x, simTime: tick * DT });
    }
    const alpha = fence.samplePresentationAlpha(DT, 0, DT);
    applySnapshotPoseToMesh(
      mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    if (previousX !== null && frame > 120) {
      const delta = mesh.position.x - previousX;
      const ratio = Math.abs(delta) / (2 * speed * DT);
      worstRatio = Math.max(worstRatio, ratio);
      if (ratio > 2) over++;
      if (delta < -1e-9) backward++;
      if (Math.abs(delta) <= 1e-4) {
        held++;
        maxHeld = Math.max(maxHeld, held);
      } else {
        held = 0;
      }
    }
    previousX = mesh.position.x;
  }
  assert.equal(over, 0, `no frame exceeds the 2x bar (worst ${worstRatio.toFixed(2)}x)`);
  assert.equal(backward, 0, 'the cadence never rewinds the drawn hull');
  assert.ok(maxHeld <= 1, `the cadence does not freeze the hull: ${maxHeld} held frames`);
});

test('a 30 Hz present cadence plays the world at wall speed', () => {
  // The 30 fps cap presents every second 60 Hz callback. The fence must receive the elapsed
  // time since the last present (33.3 ms), not the last callback's 16.7 ms; the old source could
  // only reach 0.9x wall speed and drifted back through the pack ring.
  const fence = createSnapshotFence({ capacity: 20 });
  const speed = 60;
  let simNow = 0;
  let lastPack = 0;
  let x = 0;
  let first = null;
  let last = null;
  for (let present = 0; present < 300; present++) {
    simNow += 1 / 30;
    while (lastPack + 0.1 <= simNow + 1e-9) {
      lastPack += 0.1;
      x += speed * 0.1;
      packOne(fence, { x, simTime: lastPack });
    }
    const alpha = fence.samplePresentationAlpha(1 / 30, 0, 1 / 60);
    assert.ok(Number.isFinite(alpha) || alpha === 0, 'the sampled alpha stays finite');
    const diag = fence.getPlayoutDiagnostics({});
    if (present > 30 && Number.isFinite(diag.presentedTimeS)) {
      if (!first) first = { sim: simNow, presented: diag.presentedTimeS };
      last = { sim: simNow, presented: diag.presentedTimeS,
        depth: diag.bufferDepthPacks, rate: diag.playbackRate };
    }
  }
  assert.ok(first && last, 'the fence presented during the window');
  const slope = (last.presented - first.presented) / (last.sim - first.sim);
  assert.ok(Math.abs(slope - 1) < 0.02, `presented clock ran at ${slope.toFixed(3)}x wall speed`);
  assert.ok(last.depth <= 2, `the presented bracket stayed near the newest pack (depth ${last.depth})`);
  assert.ok(last.rate <= 1.05, `the playout rate was not saturated (${last.rate.toFixed(3)})`);
});

test('a true 400 ms sim gap rides out, then re-seats at the bounded gap limit', () => {
  // The presentation consumer withholds completed packs for 400 ms while the sim keeps
  // running; the fence sees a real 400 ms gap in sim time. The runway modulation keeps the
  // hull moving through the silence (zero held frames); the burst that ends it is beyond the
  // bounded playout gap, so the clock re-seats at newest − delay in one frame instead of
  // replaying ~4 s of backlog. The re-seat jump is the distance the world actually travelled
  // while unobserved, never an interpolation overshoot.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 195;
  const mesh = meshStub();
  let x = 0;
  for (let tick = 0; tick < 20; tick++) {
    x += speed * DT;
    packOne(fence, { x, simTime: tick * DT });
  }
  const xs = [];
  let held = 0;
  let maxHeld = 0;
  const frame = () => {
    const alpha = fence.samplePresentationAlpha(DT, 0, DT);
    applySnapshotPoseToMesh(
      mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    if (xs.length > 0) {
      const jump = Math.abs(mesh.position.x - xs.at(-1));
      if (jump <= 1e-4) {
        held++;
        maxHeld = Math.max(maxHeld, held);
      } else {
        held = 0;
      }
    }
    xs.push(mesh.position.x);
  };
  // 400 ms of silence at 60 fps.
  for (let i = 0; i < 24; i++) frame();
  assert.equal(maxHeld, 0, 'the 400 ms gap never holds the hull');
  const beforeBurst = xs.at(-1);
  // The sim resumes: the 400 ms that elapsed arrives as one coalesced pack, then the normal
  // one-pack-per-frame stream continues.
  for (let tick = 20; tick < 44; tick++) {
    x += speed * DT;
    packOne(fence, { x, simTime: tick * DT });
  }
  frame();
  const reseatJump = Math.abs(mesh.position.x - beforeBurst);
  const reseatFrameIndex = xs.length - 1;
  assert.ok(mesh.position.x >= beforeBurst, 'the re-seat never moves the hull backwards');
  assert.ok(reseatJump <= 2 * speed * 0.4 + 1e-6,
    `the re-seat covers at most the gap's real travel: ${reseatJump.toFixed(2)} wu`);
  assert.ok(fence.getPlayoutDiagnostics().gapResets >= 1, 'the bounded-gap re-seat fired');
  const afterReseat = xs.slice(reseatFrameIndex + 1);
  let previous = xs[reseatFrameIndex];
  let worstRatio = 0;
  for (let tick = 44; tick < 284; tick++) {
    x += speed * DT;
    packOne(fence, { x, simTime: tick * DT });
    frame();
    const jump = Math.abs(xs.at(-1) - previous);
    worstRatio = Math.max(worstRatio, jump / (2 * speed * DT));
    previous = xs.at(-1);
  }
  assert.ok(afterReseat.every((value, i, arr) => i === 0 || value >= arr[i - 1] - 1e-9),
    'post-re-seat motion is monotone');
  assert.ok(worstRatio <= 2,
    `post-re-seat frames stay under the 2x bar: ${worstRatio.toFixed(2)}x`);
  const leads = [];
  for (let i = 0; i < 120; i++) {
    x += speed * DT;
    packOne(fence, { x, simTime: (284 + i) * DT });
    frame();
    leads.push(fence.getPlayoutDiagnostics().leadMs);
  }
  leads.sort((a, b) => a - b);
  const p50 = leads[Math.floor(leads.length * 0.5)];
  assert.ok(p50 >= 33 && p50 <= 100, `re-seated lead p50 in [33,100]: ${p50.toFixed(1)} ms`);
  const diag = fence.getPlayoutDiagnostics();
  assert.ok(diag.playoutDelayMs >= 33 && diag.playoutDelayMs <= 100,
    `re-seated playout delay in [33,100]: ${diag.playoutDelayMs.toFixed(1)} ms`);
});

test('presentation anchors read the ONE presented pose, not the newest tick blend', () => {
  // The tether/beam/wake anchor used to blend entity.prevPos -> entity.pos (the newest sim
  // tick) with the bracket alpha, so it sat ahead of the drawn hull by the playout delay.
  const fence = createSnapshotFence({ capacity: 4 });
  const speed = 195;
  for (let tick = 0; tick < 20; tick++) {
    packOne(fence, { x: tick * speed * DT, simTime: tick * DT });
  }
  fence.samplePresentationAlpha(DT, 0, DT);
  const entity = {
    id: PLAYER_ID,
    pos: { x: 19 * speed * DT, z: 0 },
    prevPos: { x: 18 * speed * DT, z: 0 },
    rot: 0.8,
    prevRot: 0.7,
  };
  const out = { x: 0, z: 0 };
  presentedAnchorXZ(entity, 0.5, out);
  const pose = fence.presentedPose(PLAYER_ID, {});
  assert.ok(Math.abs(out.x - pose.x) <= 1e-9 && Math.abs(out.z - pose.z) <= 1e-9,
    `anchor matches the presented pose (${out.x} vs ${pose.x})`);
  const legacy = entity.prevPos.x + (entity.pos.x - entity.prevPos.x) * 0.5;
  assert.ok(Math.abs(out.x - legacy) > 0.5,
    `anchor is not the newest-tick alpha blend (${out.x} vs ${legacy})`);
  const rot = presentedAnchorRot(entity, 0.5);
  assert.ok(Math.abs(rot - pose.rot) <= 1e-9, `anchor heading matches the presented pose (${rot} vs ${pose.rot})`);
  // Under silence the anchor keeps following the extrapolated presented pose.
  for (let i = 0; i < 10; i++) fence.samplePresentationAlpha(DT, 0, DT);
  presentedAnchorXZ(entity, 0.5, out);
  const later = fence.presentedPose(PLAYER_ID, {});
  assert.ok(Math.abs(out.x - later.x) <= 1e-9,
    `the anchor tracks the extrapolated pose: ${out.x} vs ${later.x}`);
  assert.ok(later.x > pose.x, 'the presented pose advanced under silence');
});

test('presentedRowPose reads a stale fast pack without rebuilding the identity map', () => {
  // beginFrameReuse marks the index stale because membership is unchanged; the recorder only
  // needs the player's row, so it scans the entityId column. Minting the ~150-entry Map on
  // every presented frame was ~10 KB/frame of garbage.
  const fence = createSnapshotFence({ capacity: 4 });
  const first = fence.beginPack(1, 0, 0);
  first.write(PLAYER_ID, 0, 5, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
  fence.samplePresentationAlpha(DT, 0, DT);
  const before = fence.indexRebuildCount;
  const pose = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60; i++) {
    const previous = fence.newestSnapshot();
    const fast = fence.beginPackReuse(1, (i + 1) * DT, 0, 4);
    fast.blitColumnsFrom(previous.columns, previous.count);
    fence.commit();
    fence.samplePresentationAlpha(DT, 0, DT);
    assert.ok(fence.presentedRowPose(PLAYER_ID, pose), `frame ${i}: presented row resolves`);
    assert.equal(pose.x, 5);
  }
  assert.equal(fence.indexRebuildCount, before,
    'the presented-pose reader never rebuilds the stale identity map');
});

test('a same-epoch respawn never blends the old body into the new pose', () => {
  // A wreck->station relocation is 5000 wu in one completed pack, same sector/epoch. The
  // extrapolation guard must run for any alpha, not only t > 1, or half the relocation is
  // drawn as a 2500 wu blend.
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, simTime: 0, poseEpoch: 2 });
  packOne(fence, { x: 5000, simTime: DT, poseEpoch: 2 });
  const mesh = meshStub();
  applySnapshotPoseToMesh(
    mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence.previousSnapshot(), 0.5,
  );
  assert.equal(mesh.position.x, 5000, 'the arriving pose is drawn exactly, never half-blended');
  // Extrapolation beyond the window is clamped to the hop count, not reset.
  const fence2 = createSnapshotFence({ capacity: 4 });
  packOne(fence2, { x: 0, simTime: 0 });
  packOne(fence2, { x: 6.5, simTime: DT });
  applySnapshotPoseToMesh(
    mesh, fence2.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence2.previousSnapshot(), 20,
  );
  assert.ok(Math.abs(mesh.position.x - 6.5 * 13) < 1e-6,
    `overshoot clamps to 13 hops: ${mesh.position.x}`);
});
