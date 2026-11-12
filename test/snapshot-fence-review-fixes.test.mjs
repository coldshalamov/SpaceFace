// E1/E10 second-round review contracts: forward-gap re-seat, a cadence-sized reserve (124 ms
// replies and 12.3 fps), the per-slot presented-sample token that finishes a stop, the
// pair-selection rule, the one-tick teleport bar, and the allocation-free diagnostics scratch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  PLAYOUT_MAX_GAP_S,
} from '../src/render/snapshotFence.js';
import { presentedAnchorRot, presentedAnchorXZ } from '../src/render/presentedAnchor.js';

const PLAYER_ID = 1;
const DT = 1 / 60;
const SPEED = 195;

function packOne(fence, { x, z = 0, simTime = 0, poseEpoch = 0 }) {
  const snapshot = fence.beginPack(1, simTime, poseEpoch);
  snapshot.write(PLAYER_ID, 0, x, 0, z, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
}

function meshStub() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
}

function draw(fence, mesh, elapsedS, rawElapsedS = elapsedS) {
  const alpha = fence.samplePresentationAlpha(elapsedS, 0, DT, 1, rawElapsedS);
  applySnapshotPoseToMesh(
    mesh,
    fence.latestSnapshot(),
    PLAYER_ID,
    { x: 0, z: 0 },
    fence.previousSnapshot(),
    alpha,
  );
  return alpha;
}

function leadStats(fence, scratch) {
  const diag = fence.getPlayoutDiagnostics(scratch);
  return diag.leadMs;
}

// Wall-paced cadence: `rate` is the game time scale, so the fence receives time-scaled frame
// elapsed exactly like presentationRunner does. Packs are placed at their EXACT scheduled sim
// times (sub-frame), so `packMs` is the real emulated reply interval rather than the next frame
// boundary: at 12.3 fps a 123 ms reply is 123 ms, not 162.6 ms.
function runCadence({ fps, packMs, seconds, rate = 1, warmS = 6, speed = SPEED }) {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = meshStub();
  const scratch = {};
  const wallDt = 1 / fps;
  const presentedDt = wallDt * rate;
  const packIntervalS = (packMs / 1000) * rate;
  let sim = 0;
  let nextPackSim = packIntervalS;
  let previousX = null;
  let held = 0;
  let maxHeld = 0;
  let backward = 0;
  let worstRatio = 0;
  let extrapolatedFrames = 0;
  let sampledFrames = 0;
  let maxLead = -Infinity;
  let minLead = Infinity;
  const leads = [];
  const frames = Math.ceil(seconds * fps);
  for (let frame = 0; frame < frames; frame++) {
    sim += presentedDt;
    // Sub-frame pack timing: a frame that crosses one or more scheduled reply moments packs
    // each at its own sim stamp, so the fence sees the named cadence exactly.
    let packedThisFrame = 0;
    while (sim + 1e-12 >= nextPackSim && packedThisFrame < 8) {
      packOne(fence, { x: speed * nextPackSim, simTime: nextPackSim });
      nextPackSim += packIntervalS;
      packedThisFrame++;
    }
    const alpha = fence.samplePresentationAlpha(presentedDt, 0, DT);
    applySnapshotPoseToMesh(
      mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
      fence.previousSnapshot(), alpha,
    );
    const diag = fence.getPlayoutDiagnostics(scratch);
    if (frame / fps >= warmS) {
      sampledFrames++;
      leads.push(diag.leadMs);
      if (diag.leadMs < minLead) minLead = diag.leadMs;
      if (diag.leadMs > maxLead) maxLead = diag.leadMs;
      if (diag.extrapolateMs > 0) extrapolatedFrames++;
      if (previousX !== null) {
        const jump = Math.abs(mesh.position.x - previousX);
        worstRatio = Math.max(worstRatio, jump / (2 * speed * presentedDt));
        if (jump < -1e-9) backward++;
        if (jump <= 1e-4) {
          held++;
          maxHeld = Math.max(maxHeld, held);
        } else {
          held = 0;
        }
      }
    }
    previousX = mesh.position.x;
  }
  leads.sort((a, b) => a - b);
  const p50 = leads[Math.floor(leads.length * 0.5)] || 0;
  const diag = fence.getPlayoutDiagnostics(scratch);
  return {
    fence, diag, p50, minLead, maxLead,
    sampledFrames, extrapolatedFrames, maxHeld, backward, worstRatio,
    packIntervalMs: packIntervalS * 1000,
    gapResets: diag.gapResets,
  };
}

test('a 3 s worker silence re-seats on the burst and recovers in under 1 s', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = meshStub();
  // One second of settled flight.
  for (let tick = 0; tick < 60; tick++) {
    packOne(fence, { x: SPEED * tick * DT, simTime: tick * DT });
  }
  for (let i = 0; i < 30; i++) draw(fence, mesh, DT);
  const beforeSilence = mesh.position.x;

  // 3 s of worker silence at 60 fps: the reserve + extrapolation window runs out and the
  // hull holds (an honest stall); motion is monotone throughout.
  const silence = [];
  for (let i = 0; i < 180; i++) {
    draw(fence, mesh, DT);
    silence.push(mesh.position.x);
  }
  for (let i = 1; i < silence.length; i++) {
    assert.ok(silence[i] >= silence[i - 1] - 1e-9, `silence never rewinds: frame ${i}`);
  }
  const atBurst = mesh.position.x;
  assert.ok(atBurst - beforeSilence <= SPEED * 0.25,
    'the silence advances at most the reserve + extrapolation window');

  // The worker bursts: every tick since the silence lands at once (3 s of sim time).
  for (let tick = 60; tick < 240; tick++) {
    packOne(fence, { x: SPEED * tick * DT, simTime: tick * DT });
  }
  draw(fence, mesh, DT);
  const reseatJump = mesh.position.x - atBurst;
  const diag = fence.getPlayoutDiagnostics();
  assert.equal(diag.gapResets, 1, 'the forward gap re-seated once');
  assert.ok(diag.lastGapResetGapMs >= 2900,
    `the re-seat priced the real gap: ${diag.lastGapResetGapMs} ms`);
  assert.ok(reseatJump > 0, 'the re-seat moves forward, never backward');
  assert.ok(reseatJump <= 2 * SPEED * 3 + 1e-6,
    `the re-seat covers at most 2x the gap's travel: ${reseatJump.toFixed(1)} wu`);

  // Recovery: the lead returns to the delay band immediately (well inside 1 s), and every
  // post-re-seat frame is under the 2x presented-rate bar.
  let previous = mesh.position.x;
  let recoveredAtFrame = -1;
  let worstAfter = 0;
  for (let i = 0; i < 60; i++) {
    draw(fence, mesh, DT);
    const jump = mesh.position.x - previous;
    assert.ok(jump >= -1e-9, `no backward pose after the re-seat: frame ${i}`);
    worstAfter = Math.max(worstAfter, Math.abs(jump) / (2 * SPEED * DT));
    previous = mesh.position.x;
    const lead = leadStats(fence, {});
    if (recoveredAtFrame < 0 && lead >= 33 && lead <= 100) recoveredAtFrame = i;
  }
  assert.ok(recoveredAtFrame >= 0 && recoveredAtFrame < 60,
    `recovered under 100 ms within 1 s (frame ${recoveredAtFrame})`);
  assert.ok(worstAfter <= 2, `post-re-seat jumps stay under the 2x bar: ${worstAfter.toFixed(2)}x`);
});

test('a long no-frame interval re-seats instead of replaying the occlusion backlog', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = meshStub();
  for (let tick = 0; tick < 30; tick++) {
    packOne(fence, { x: SPEED * tick * DT, simTime: tick * DT });
  }
  draw(fence, mesh, DT);
  const before = mesh.position.x;
  // A 2 s hidden-tab frame reaches the fence as TWO values: the loop-clamped 0.25 s presented
  // elapsed and the unclamped 2 s raw interval (presentationRunner stamps rawFrameDt and the
  // renderer forwards it). The raw value is what re-seats.
  draw(fence, mesh, 0.25, 2);
  const diag = fence.getPlayoutDiagnostics();
  assert.equal(diag.gapResets, 1, 'the long frame re-seated');
  assert.ok(diag.lastGapResetRawElapsedMs >= 1900);
  assert.ok(mesh.position.x <= before + SPEED * (PLAYOUT_MAX_GAP_S + PLAYOUT_MAX_GAP_S),
    'the long frame does not invent seconds of motion');
});

test('124 ms replies at 60 fps hold the reserve inside the documented band for 30 s', () => {
  const result = runCadence({ fps: 60, packMs: 124, seconds: 30 });
  const { diag } = result;
  assert.ok(Math.abs(result.packIntervalMs - 124) < 1e-9,
    `the emulated reply interval is the named one: ${result.packIntervalMs} ms`);
  assert.equal(result.gapResets, 0, 'a steady 124 ms cadence is not worker silence');
  assert.equal(result.backward, 0, 'the cadence never rewinds the hull');
  assert.equal(result.maxHeld, 0, `the cadence never freezes the hull (${result.maxHeld} held)`);
  assert.ok(result.worstRatio <= 2,
    `per-frame jumps stay under the 2x bar: ${result.worstRatio.toFixed(2)}x`);
  // The delay is a target sized from the reply interval, not a reserve parked at 100 ms.
  assert.ok(diag.playoutDelayTargetMs > 100,
    `the target moved off the configured ceiling: ${diag.playoutDelayTargetMs.toFixed(1)} ms`);
  const bandMax = diag.playoutDelayMaxMs + 5;
  assert.ok(result.p50 >= 33 && result.p50 <= bandMax,
    `lead p50 in [33, ${bandMax.toFixed(1)}]: ${result.p50.toFixed(1)} ms`);
  assert.ok(result.minLead >= 33,
    `the lead never goes dry: min ${result.minLead.toFixed(1)} ms`);
  assert.equal(result.extrapolatedFrames, 0,
    `the presented moment stays inside history (${result.extrapolatedFrames} extrapolated frames)`);
});

test('12.3 fps with 123 ms replies holds the reserve at 1x and 0.109x time scale', () => {
  // The reviewer's frame-rate reproduction: 12.3 fps / 1x with 123 ms packs had lead 19 ms
  // and 34 % extrapolated frames on the old 100 ms ceiling. The reserve now sizes from the
  // observed interval; the 60 fps test cannot hide a low-frame-rate cap. Sub-frame pack timing
  // makes 123 ms the real interval at 12.3 fps (frame-boundary packing would be 162.6 ms).
  const slow = runCadence({ fps: 12.3, packMs: 123, seconds: 30, rate: 1 });
  assert.ok(Math.abs(slow.packIntervalMs - 123) < 1e-9,
    `1x emulated interval is 123 ms: ${slow.packIntervalMs} ms`);
  assert.equal(slow.gapResets, 0, '1x steady cadence is not worker silence');
  assert.ok(slow.minLead >= 33, `1x min lead ${slow.minLead.toFixed(1)} ms`);
  assert.ok(slow.p50 >= 33 && slow.p50 <= slow.diag.playoutDelayMaxMs + 5,
    `1x p50 in band: ${slow.p50.toFixed(1)} / max ${slow.diag.playoutDelayMaxMs.toFixed(1)}`);
  assert.equal(slow.extrapolatedFrames, 0,
    `1x stays inside history: ${slow.extrapolatedFrames} extrapolated frames`);
  assert.equal(slow.maxHeld, 0, `1x never freezes: ${slow.maxHeld} held frames`);

  const slowed = runCadence({ fps: 12.3, packMs: 123, seconds: 30, rate: 0.109 });
  assert.ok(Math.abs(slowed.packIntervalMs - 123 * 0.109) < 1e-9,
    `0.109x emulated sim interval is 13.407 ms: ${slowed.packIntervalMs} ms`);
  assert.equal(slowed.gapResets, 0, '0.109x steady cadence is not worker silence');
  assert.ok(slowed.minLead >= 33, `0.109x min lead ${slowed.minLead.toFixed(1)} ms`);
  assert.ok(slowed.p50 <= 100,
    `0.109x p50 inside the configured band: ${slowed.p50.toFixed(1)} ms`);
  assert.equal(slowed.extrapolatedFrames, 0,
    `0.109x stays inside history: ${slowed.extrapolatedFrames} extrapolated frames`);
  assert.equal(slowed.maxHeld, 0, `0.109x never freezes: ${slowed.maxHeld} held frames`);
});

test('a steady 400/500/600 ms reply cadence is learned, not re-seated, at 60 and 12.3 fps', () => {
  // The final E1 review's material defect: the old fixed 350 ms gap threshold treated every
  // 400/500/600 ms reply as silence, re-seated on each arrival, and never let the interval ring
  // size the reserve. Each cadence must learn, hold the documented lead band, and never jump.
  for (const fps of [60, 12.3]) {
    for (const packMs of [400, 500, 600]) {
      const label = `${packMs} ms replies @ ${fps} fps`;
      const result = runCadence({ fps, packMs, seconds: 30 });
      assert.ok(Math.abs(result.packIntervalMs - packMs) < 1e-9,
        `${label}: real emulated interval ${result.packIntervalMs} ms`);
      assert.equal(result.gapResets, 0,
        `${label}: steady cadence must never re-seat (${result.gapResets} resets)`);
      assert.equal(result.backward, 0, `${label}: never rewinds`);
      assert.equal(result.maxHeld, 0, `${label}: never freezes (${result.maxHeld} held)`);
      assert.ok(result.worstRatio <= 2,
        `${label}: worst jump ${result.worstRatio.toFixed(2)}x the presented-rate bar`);
      assert.ok(result.diag.playoutDelayTargetMs >= packMs - 1,
        `${label}: the reserve sized to the cadence (${result.diag.playoutDelayTargetMs.toFixed(1)} ms)`);
      const bandMax = result.diag.playoutDelayMaxMs + 5;
      assert.ok(result.p50 >= 33 && result.p50 <= bandMax,
        `${label}: lead p50 in [33, ${bandMax.toFixed(1)}]: ${result.p50.toFixed(1)} ms`);
      assert.ok(result.minLead >= 33,
        `${label}: lead never goes dry (min ${result.minLead.toFixed(1)} ms)`);
      assert.equal(result.extrapolatedFrames, 0,
        `${label}: stays inside history (${result.extrapolatedFrames} extrapolated frames)`);
    }
  }
});

test('a live 2 Hz worker stream slows playout to its delivered simulation rate', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = meshStub();
  let tick = 0;
  const publish = (ticks) => {
    tick += ticks;
    packOne(fence, { x: SPEED * tick * DT, simTime: tick * DT });
  };
  for (let frame = 0; frame < 180; frame++) {
    publish(1);
    draw(fence, mesh, DT);
  }
  const expectedRate = 3 / 30;
  let previousX = mesh.position.x;
  let held = 0;
  let worstStep = 0;
  for (let frame = 1; frame <= 720; frame++) {
    if (frame % 30 === 0) publish(3);
    draw(fence, mesh, DT);
    if (frame > 360) {
      const step = mesh.position.x - previousX;
      assert.ok(step >= -1e-9, 'the presented hull never rewinds');
      if (step <= 1e-4) held++;
      worstStep = Math.max(worstStep, step);
    }
    previousX = mesh.position.x;
  }
  const diag = fence.getPlayoutDiagnostics();
  assert.equal(diag.gapResets, 0, 'steady replies must not reseat the world');
  assert.ok(Math.abs(diag.playbackRate - expectedRate) < 0.01,
    `three ticks per 500 ms should play at 0.1x, got ${diag.playbackRate}x`);
  assert.equal(held, 0, 'the moving hull never holds after the rate settles');
  assert.ok(worstStep < SPEED * DT * expectedRate * 1.5,
    `worst frame advances ${worstStep} WU at the slow rate`);

  for (let frame = 0; frame < 120; frame++) draw(fence, mesh, 0, DT);
  const paused = fence.getPlayoutDiagnostics();
  assert.equal(paused.presentedTimeS, diag.presentedTimeS, 'a paused simulation holds its presented time');
  assert.equal(paused.playbackRate, diag.playbackRate, 'paused wall time is excluded from cadence');
  assert.equal(paused.gapResets, 0, 'an explicit pause is not a worker gap');

  let resumedFastAt = 0;
  for (let frame = 1; frame <= 120; frame++) {
    publish(1);
    draw(fence, mesh, DT);
    const step = mesh.position.x - previousX;
    assert.ok(step > 0 && step < SPEED * DT * 1.5, 'resumed flight moves without a snap');
    previousX = mesh.position.x;
    if (!resumedFastAt && fence.getPlayoutDiagnostics().playbackRate >= 0.95) resumedFastAt = frame;
  }
  assert.ok(resumedFastAt > 0 && resumedFastAt <= 15, '60 Hz replies restore playback within 250 ms');
  assert.ok(fence.getPlayoutDiagnostics().packLagMs <= 100, 'the normal reserve returns within two seconds');
});

test('349/351 ms replies sit on the cadence side of the old fixed 350 ms knife edge', () => {
  // 351 ms is the exact first interval the old `simDelta > PLAYOUT_MAX_GAP_S` clause re-seated;
  // 349 ms was just under it. Both must be learned as cadence at both frame rates.
  for (const fps of [60, 12.3]) {
    for (const packMs of [349, 351]) {
      const label = `${packMs} ms replies @ ${fps} fps`;
      const result = runCadence({ fps, packMs, seconds: 30 });
      assert.ok(Math.abs(result.packIntervalMs - packMs) < 1e-9,
        `${label}: real emulated interval ${result.packIntervalMs} ms`);
      assert.equal(result.gapResets, 0,
        `${label}: the knife edge is cadence, not silence (${result.gapResets} resets)`);
      assert.equal(result.backward, 0, `${label}: never rewinds`);
      assert.ok(result.worstRatio <= 2,
        `${label}: worst jump ${result.worstRatio.toFixed(2)}x the presented-rate bar`);
      assert.ok(result.diag.playoutDelayTargetMs >= packMs - 1,
        `${label}: the reserve sized to the cadence (${result.diag.playoutDelayTargetMs.toFixed(1)} ms)`);
      const bandMax = result.diag.playoutDelayMaxMs + 5;
      assert.ok(result.p50 >= 33 && result.p50 <= bandMax,
        `${label}: lead p50 in [33, ${bandMax.toFixed(1)}]: ${result.p50.toFixed(1)} ms`);
      assert.ok(result.minLead >= 33,
        `${label}: lead never goes dry (min ${result.minLead.toFixed(1)} ms)`);
    }
  }
});

test('the per-slot presented token finishes a stop on the hull and the anchor', () => {
  for (const speed of [195, 390]) {
    const fence = createSnapshotFence({ capacity: 4 });
    const mesh = meshStub();
    const anchor = { x: 0, z: 0 };
    const entity = {
      id: PLAYER_ID,
      pos: { x: 0, z: 0 },
      prevPos: { x: 0, z: 0 },
      rot: 0,
      prevRot: 0,
    };
    let sim = 0;
    const stopS = 1.0;
    const stopX = speed * stopS;
    // 2 s at 60 fps; one pack per frame. The render walk is simulated faithfully: a row is
    // re-posed only while the sim changes OR the presented token changes. After the stop tick
    // the sim bytes are identical forever — only the token can finish the last reserve.
    let lastPackSim = -Infinity;
    for (let frame = 0; frame < 120; frame++) {
      sim += DT;
      const simDirty = sim <= stopS + 1e-9;
      if (sim - lastPackSim >= DT - 1e-9) {
        lastPackSim = sim;
        packOne(fence, { x: speed * Math.min(sim, stopS), simTime: sim });
      }
      const alpha = fence.samplePresentationAlpha(DT, 0, DT);
      const token = fence.presentedSampleToken(0, PLAYER_ID);
      const tokenChanged = token !== 0 && token !== mesh.userData.sfPresentedSampleToken;
      if (simDirty || tokenChanged) {
        applySnapshotPoseToMesh(
          mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
          fence.previousSnapshot(), alpha,
        );
        mesh.userData.sfPresentedSampleToken = token;
      }
      entity.pos.x = mesh.position.x;
      entity.prevPos.x = mesh.position.x;
      presentedAnchorXZ(entity, alpha, anchor);
    }
    assert.ok(Math.abs(mesh.position.x - stopX) <= 0.1,
      `${speed} wu/s hull lands on the stop: ${mesh.position.x.toFixed(3)} vs ${stopX}`);
    assert.ok(Math.abs(anchor.x - stopX) <= 0.1,
      `${speed} wu/s anchor lands on the stop: ${anchor.x.toFixed(3)} vs ${stopX}`);
    assert.ok(Math.abs(presentedAnchorRot(entity, 0) - 0) <= 1e-9,
      'the stopped hull heading is stable');
  }
});

test('a one-tick near respawn never half-blends; a normal hop still interpolates', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, simTime: 0, poseEpoch: 3 });
  packOne(fence, { x: 60, simTime: DT, poseEpoch: 3 });
  const mesh = meshStub();
  applySnapshotPoseToMesh(
    mesh, fence.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence.previousSnapshot(), 0.5,
  );
  assert.equal(mesh.position.x, 60,
    'a 60 wu one-tick relocation draws the arriving pose, not a 30 wu blend');

  // 41 wu is also over the tightened 40 wu/tick bar.
  const fence41 = createSnapshotFence({ capacity: 4 });
  packOne(fence41, { x: 0, simTime: 0 });
  packOne(fence41, { x: 41, simTime: DT });
  applySnapshotPoseToMesh(
    mesh, fence41.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence41.previousSnapshot(), 0.5,
  );
  assert.equal(mesh.position.x, 41, 'a 41 wu one-tick relocation is not blended');

  // A legitimate 39 wu hop (a 2340 wu/s kick) still interpolates.
  const fence39 = createSnapshotFence({ capacity: 4 });
  packOne(fence39, { x: 0, simTime: 0 });
  packOne(fence39, { x: 39, simTime: DT });
  applySnapshotPoseToMesh(
    mesh, fence39.latestSnapshot(), PLAYER_ID, { x: 0, z: 0 },
    fence39.previousSnapshot(), 0.5,
  );
  assert.ok(Math.abs(mesh.position.x - 19.5) < 1e-6,
    `a sub-bar hop still blends: ${mesh.position.x}`);
});

test('a new-epoch transition serves no newer previous pack than its presented latest', () => {
  // 5 old-sector packs then 3 new-sector packs: the presented bracket is the oldest new pack
  // at alpha 0. The old previousSnapshot() fell through to the newest previous/latest pair —
  // a pack NEWER than presented latest — and the mesh drew -9619 while presentedPose drew
  // -9629. Both readers must now serve the same pose.
  const fence = createSnapshotFence({ capacity: 4 });
  for (let i = 0; i < 5; i++) {
    packOne(fence, { x: -10000 + i * 10, simTime: i * DT, poseEpoch: 7 });
  }
  for (let i = 0; i < 3; i++) {
    packOne(fence, { x: -9629 + i * 10, simTime: (5 + i) * DT, poseEpoch: 8 });
  }
  const mesh = meshStub();
  const alpha = draw(fence, mesh, DT);
  const presented = fence.presentedPose(PLAYER_ID, {});
  assert.equal(alpha, 0, 'the presented moment sits on the oldest new-epoch pack');
  assert.equal(fence.previousSnapshot(), null,
    'no blend source exists on the far side of the epoch transition');
  assert.ok(Math.abs(mesh.position.x - presented.x) <= 1e-9,
    `mesh and presented pose agree (${mesh.position.x} vs ${presented.x})`);
  const anchor = { x: 0, z: 0 };
  presentedAnchorXZ({ id: PLAYER_ID, pos: { x: 0, z: 0 } }, alpha, anchor);
  assert.ok(Math.abs(anchor.x - presented.x) <= 1e-9,
    `the anchor agrees too (${anchor.x} vs ${presented.x})`);
});

test('a restart re-seat serves the oldest new-stream pack with no previous', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, simTime: 0, poseEpoch: 1 });
  packOne(fence, { x: 10, simTime: DT, poseEpoch: 1 });
  draw(fence, meshStub(), DT);
  // A restarted simulation rewinds the pack clock inside the same epoch.
  packOne(fence, { x: 0, simTime: 0, poseEpoch: 1 });
  packOne(fence, { x: 10, simTime: DT, poseEpoch: 1 });
  const mesh = meshStub();
  const alpha = draw(fence, mesh, DT);
  const presented = fence.presentedPose(PLAYER_ID, {});
  assert.equal(alpha, 0);
  assert.equal(fence.previousSnapshot(), null, 'the re-seat has no blend source');
  assert.ok(Math.abs(mesh.position.x - presented.x) <= 1e-9,
    `mesh and presented pose agree after the restart (${mesh.position.x} vs ${presented.x})`);
});

test('the presented reader scans once per pack, not once per anchor call', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const first = fence.beginPack(1, 0, 0);
  first.write(PLAYER_ID, 0, 5, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  fence.commit();
  // A stale fast pack: membership did not move, so the identity map is deliberately stale.
  for (let i = 0; i < 4; i++) {
    const previous = fence.newestSnapshot();
    const fast = fence.beginPackReuse(1, (i + 1) * DT, 0, 4);
    fast.blitColumnsFrom(previous.columns, previous.count);
    fence.commit();
    fence.samplePresentationAlpha(DT, 0, DT);
  }
  const pose = {};
  assert.ok(fence.presentedRowPose(PLAYER_ID, pose));
  const afterFirst = fence.presentedScanCount;
  for (let i = 0; i < 60; i++) {
    assert.ok(fence.presentedRowPose(PLAYER_ID, pose));
    assert.equal(pose.x, 5);
  }
  assert.equal(fence.presentedScanCount, afterFirst,
    'repeated anchor reads reuse the per-pack probe cache');
  // The slot-hint path resolves without any column scan at all.
  for (let i = 0; i < 10; i++) assert.ok(fence.presentedPose(PLAYER_ID, pose, 0));
  assert.equal(fence.presentedScanCount, afterFirst, 'the slot hint never scans');
});

test('getPlayoutDiagnostics reuses caller-owned scratch', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  packOne(fence, { x: 0, simTime: 0 });
  fence.samplePresentationAlpha(DT, 0, DT);
  const scratch = {};
  const first = fence.getPlayoutDiagnostics(scratch);
  assert.equal(first, scratch, 'the caller-owned object is returned');
  const second = fence.getPlayoutDiagnostics(scratch);
  assert.equal(second, first, 'no second object is minted');
  assert.equal(typeof second.leadMs, 'number');
  assert.equal(typeof second.playoutDelayMaxMs, 'number');
  assert.equal(typeof second.gapResets, 'number');
});

test('the presented token is stable for a static row and changes for a moving one', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  // Static row across two packs.
  packOne(fence, { x: 42, simTime: 0 });
  packOne(fence, { x: 42, simTime: DT });
  fence.samplePresentationAlpha(DT, 0, DT);
  const staticToken = fence.presentedSampleToken(0, PLAYER_ID);
  packOne(fence, { x: 42, simTime: 2 * DT });
  fence.samplePresentationAlpha(DT, 0, DT);
  assert.equal(fence.presentedSampleToken(0, PLAYER_ID), staticToken,
    'a static row does not churn the render walk');
  // Moving row: the token advances with the presented sample while the bracket pair is live.
  const moving = createSnapshotFence({ capacity: 4 });
  for (let i = 0; i <= 6; i++) packOne(moving, { x: i * 10, simTime: i * DT });
  moving.samplePresentationAlpha(DT, 0, DT);
  const firstToken = moving.presentedSampleToken(0, PLAYER_ID);
  moving.samplePresentationAlpha(DT, 0, DT);
  const secondToken = moving.presentedSampleToken(0, PLAYER_ID);
  assert.notEqual(secondToken, firstToken,
    'a moving row changes the presented sample token');
});
