import test from 'node:test';
import assert from 'node:assert/strict';
import { installGameCadenceProbe, summarizeGameCadence, distribution } from '../scripts/lib/gameCadenceProbe.mjs';
import { createSnapshotFence, applySnapshotPoseToMesh } from '../src/render/snapshotFence.js';

test('healthy browser cadence cannot hide a frozen world behind a live HUD', () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({
    t: i * 16, gapMs: i ? 16 : undefined, sim: i / 60, tick: i,
    mode: 'flight', timeScale: 1, submissions: 0, worldStaleMs: i * 16, calls: 100,
  }));
  const result = summarizeGameCadence({ rows, submissionObserved: true, submissionGaps: [] });
  assert.equal(result.browserFps, 62.5);
  assert.equal(result.worldSubmitFps, 0);
  assert.ok(result.healthyCallbacksFrozenWorld > 0);
});

test('long callback stalls survive short callback work and appear in tail metrics', () => {
  assert.deepEqual(distribution([16, 16, 16, 500]), {
    count: 4, p50: 16, p95: 500, p99: 500, max: 500, over50: 1, over100: 1,
  });
});

test('redrawing a stale simulation snapshot does not pass as a moving game', () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({ t: i * 16,
    gapMs: i ? 16 : undefined, mode: 'flight', timeScale: 1,
    sim: 1, tick: 60, submissions: i, worldStaleMs: 1, simStaleMs: i * 16,
  }));
  const result = summarizeGameCadence({ rows, submissionObserved: true, submissionGaps: [16] });
  assert.equal(result.healthyCallbacksFrozenWorld, 0);
  assert.ok(result.healthyCallbacksFrozenSimulation > 0);
});

test('pause frames do not count as unexplained frozen-world callbacks', () => {
  const result = summarizeGameCadence({ submissionObserved: false, rows: [
    { t: 0, sim: 1, submissions: 0 },
    { t: 16, sim: 1, submissions: 0, gapMs: 16, worldStaleMs: 1000, mode: 'pause', timeScale: 0 },
  ] });
  assert.equal(result.healthyCallbacksFrozenWorld, 0);
  assert.equal(result.worldSubmitFps, null);
});

test('live hook counts successful world draws only and restores the original renderer', () => {
  const savedWindow = globalThis.window, savedRequest = globalThis.requestAnimationFrame;
  const savedCancel = globalThis.cancelAnimationFrame;
  const original = () => true;
  const owner = { drawPreparedFrame: original };
  let callback;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { SF: { registry: { get: () => owner }, state: {
    mode: 'flight', timeScale: 1, simTime: 1, tick: 60, render: {},
  } } };
  try {
    installGameCadenceProbe();
    callback(0);
    owner.drawPreparedFrame();
    callback(16);
    owner.drawPreparedFrame();
    callback(24);
    window.SF.state.tick++;
    window.SF.state.simTime += 1 / 60;
    owner.drawPreparedFrame();
    callback(28);
    window.SF.state.mode = 'loading';
    owner.drawPreparedFrame();
    callback(32);
    const record = window.__SF_GAME_CADENCE__.stop();
    assert.deepEqual(record.rows.map(r => r.submissions), [0, 1, 2, 3, 3]);
    assert.deepEqual(record.rows.map(r => r.motionSubmissions), [0, 1, 1, 2, 2]);
    assert.equal(record.motionSubmissionGaps.length, 1);
    assert.equal(owner.drawPreparedFrame, original);
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedRequest === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = savedRequest;
    if (savedCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = savedCancel;
  }
});

test('60 redraws per second distinguish 20 distinct world poses from smooth motion', () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({ t: i * 1000 / 60,
    gapMs: i ? 1000 / 60 : undefined, mode: 'flight', timeScale: 1,
    sim: i / 60, tick: i, submissions: i, motionSubmissions: Math.floor(i / 3),
    worldStaleMs: 1, simStaleMs: 1,
  }));
  const result = summarizeGameCadence({ rows, submissionObserved: true,
    motionSubmissionGaps: [50, 50], submissionGaps: [1000 / 60] });
  assert.equal(result.worldSubmitFps, 60);
  assert.ok(Math.abs(result.worldMotionFps - 20) < 1e-9);
  assert.equal(result.motionSubmissionGaps.p99, 50);
  assert.equal(summarizeGameCadence({ rows: rows.map(({ motionSubmissions, ...r }) => r),
    submissionObserved: true }).worldMotionFps, null);
});

function createMeshProbeHarness({ mode = 'flight', timeScale = 1, speed = 30,
  origin = 1, generation = 1, mesh = true } = {}) {
  const savedWindow = globalThis.window;
  const savedRequest = globalThis.requestAnimationFrame;
  const savedCancel = globalThis.cancelAnimationFrame;
  const savedPerformance = globalThis.performance;
  let now = 0;
  const callbacks = [];
  const elements = new Array(16).fill(0);
  elements[12] = 0;
  elements[13] = 0;
  elements[14] = 0;
  const player = { occupantGeneration: generation, vel: { x: speed, z: 0 } };
  const playerMesh = mesh ? { visible: true, parent: {}, matrixWorld: { elements },
    position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, userData: {}, matrixAutoUpdate: false,
    updateMatrix() {
      elements[12] = this.position.x; elements[13] = this.position.y; elements[14] = this.position.z;
    },
  } : null;
  const state = {
    mode, timeScale, tick: 0, simTime: 0, playerId: 1,
    entities: new Map([[1, player]]),
    world: { frameOriginSeq: origin, frameOrigin: { x: 0, z: 0 } },
    render: {
      meshes: new Map(mesh ? [[1, playerMesh]] : []),
      diagnostics: { info: { calls: 1 } },
    },
  };
  const owner = { drawPreparedFrame: () => true };
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = callback => {
    callbacks.push(callback);
    return callbacks.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { SF: { state, registry: { get: () => owner } } };
  installGameCadenceProbe();
  let stopped = false;
  return {
    state,
    player,
    mesh: playerMesh,
    owner,
    setNow(value) { now = value; },
    draw() { return owner.drawPreparedFrame(); },
    sample(t = now) {
      const callback = callbacks.shift();
      assert.ok(callback, 'expected a queued cadence callback');
      callback(t);
    },
    stop() {
      if (!stopped) {
        stopped = true;
        return window.__SF_GAME_CADENCE__.stop();
      }
      return null;
    },
    restore() {
      if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
      if (savedRequest === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = savedRequest;
      if (savedCancel === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = savedCancel;
      globalThis.performance = savedPerformance;
    },
  };
}

test('actual mesh observation counts interpolated movement when the simulation tick repeats', () => {
  const harness = createMeshProbeHarness();
  try {
    harness.setNow(10);
    harness.draw();
    harness.setNow(20);
    harness.mesh.matrixWorld.elements[12] = 1;
    harness.draw();
    const result = summarizeGameCadence(harness.stop());
    assert.equal(result.actualMeshObserved, true);
    assert.equal(result.actualMeshEligibleSamples, 2);
    assert.equal(result.actualMeshPoseChanges, 1);
    assert.equal(result.actualMeshIdenticalPoses, 0);
    assert.equal(result.actualMeshPoseChangeGaps.count, 1);
    assert.equal(result.actualMeshPoseChangeGaps.max, 10);
    assert.equal(result.actualMeshSignedMotionStatus, 'unknown-insufficient-stable-authority');
  } finally {
    harness.restore();
  }
});

function attachMotionFence(harness) {
  const fence = createSnapshotFence({ capacity: 4 });
  harness.owner._snapshotFence = fence;
  const world = { getSlotForEntityId: id => id === 1 ? 0 : -1,
    alive: Uint8Array.of(1), entityIds: Uint32Array.of(1), slotGenerations: Uint32Array.of(7) };
  harness.owner._presentationWorld = world;
  const pack = (x, simTime, { epoch = 0, poseGeneration = 7 } = {}) => {
    const snapshot = fence.beginPack(1, simTime, epoch, 1);
    snapshot.slotRows[0] = snapshot.write(1, 0, x, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
    snapshot.setGeneration(0, poseGeneration);
    fence.commit();
    world.slotGenerations[0] = poseGeneration;
    harness.mesh.userData.presentationOccupantGeneration = harness.player.occupantGeneration;
  };
  let frame = 0;
  const draw = alpha => {
    harness.setNow(++frame * 16);
    harness.owner._snapshotPresentationAlpha = alpha;
    harness.owner._snapshotPresentationSequence = fence.sequence;
    // Deliberately different: the observer must read the fence's actual alpha.
    harness.state.render.interpolationAlpha = 1;
    applySnapshotPoseToMesh(harness.mesh, fence.latestSnapshot(), 1, harness.state.world.frameOrigin,
      fence.previousSnapshot(), alpha);
    harness.draw();
  };
  pack(0, 0);
  pack(10, 0.1);
  return { fence, pack, draw };
}

function attachCamera(harness) {
  const identity = () => Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const camera = { matrixWorld: { elements: identity() }, matrixWorldInverse: { elements: identity() },
    projectionMatrix: { elements: identity() } };
  harness.state.render.camera = camera;
  return x => {
    camera.matrixWorld.elements[12] = x;
    camera.matrixWorldInverse.elements[12] = -x;
  };
}

test('small drawn backtracks are visible despite healthy pose-change cadence, with bounded witnesses', () => {
  const harness = createMeshProbeHarness();
  try {
    const motion = attachMotionFence(harness);
    for (const alpha of [0.2, 0.4, 0.6]) motion.draw(alpha);
    for (let i = 0; i < 12; i++) {
      motion.draw(0.5999);
      motion.draw(0.6);
    }
    const result = summarizeGameCadence(harness.stop());
    assert.equal(result.actualMeshPoseChanges, 26, 'backward jiggles still count in the unchanged cadence metric');
    assert.equal(result.actualMeshSignedMotion.backtracks, 12);
    assert.ok(Math.abs(result.actualMeshSignedMotion.maxBacktrackWu - 0.001) < 1e-9);
    assert.equal(result.actualMeshSignedMotion.witnesses.length, 8);
    const witness = result.actualMeshSignedMotion.witnesses[0];
    assert.equal(witness.kind, 'rendered-backtrack');
    assert.equal(witness.before.alpha, 0.6);
    assert.equal(witness.after.alpha, 0.5999, 'the legacy alpha of 1 cannot hide a replayed blend');
    assert.equal(witness.before.sequence, witness.after.sequence);
    assert.equal(witness.generation, 1);
    assert.equal(witness.poseGeneration, 7, 'render-slot generation is independent of the occupant life');
    assert.deepEqual(witness.authority, { priorX: 0, priorZ: 0, latestX: 10, latestZ: 0 });
  } finally { harness.restore(); }
});

test('an authoritative physical reversal is classified separately from presentation rewind', () => {
  const harness = createMeshProbeHarness();
  try {
    const motion = attachMotionFence(harness);
    for (const alpha of [0.2, 0.4, 0.6]) motion.draw(alpha);
    motion.pack(5, 0.2);
    motion.draw(1);
    motion.draw(1);
    motion.pack(0, 0.3);
    motion.draw(0.5);
    motion.draw(1);
    const signed = summarizeGameCadence(harness.stop()).actualMeshSignedMotion;
    assert.equal(signed.backtracks, 0);
    assert.equal(signed.authoritativeReversals, 1);
    assert.ok(signed.assessedIntervals > 1, 'stable travel in the new physical direction becomes assessable');
    assert.equal(signed.witnesses[0].kind, 'authoritative-reversal');
    assert.ok(signed.unknownSamples > 0, 'the direction-transition samples are not a smooth-motion pass');
  } finally { harness.restore(); }
});

test('camera movement can change the apparent ship position without a world-space backtrack', () => {
  const harness = createMeshProbeHarness();
  try {
    const motion = attachMotionFence(harness), moveCamera = attachCamera(harness);
    for (let i = 0; i < 3; i++) motion.draw(0.6);
    moveCamera(0.1);
    motion.draw(0.6);
    moveCamera(0.2);
    motion.draw(0.6);
    const signed = summarizeGameCadence(harness.stop()).actualMeshSignedMotion;
    assert.equal(signed.backtracks, 0);
    assert.equal(signed.cameraMotionIntervals, 2);
    assert.equal(signed.cameraOnlyMoves, 2);
    assert.equal(signed.witnesses[0].kind, 'camera-only-motion');
    assert.equal(signed.witnesses[0].before.x, signed.witnesses[0].after.x);
    assert.ok(signed.witnesses[0].after.screenX < signed.witnesses[0].before.screenX);
  } finally { harness.restore(); }
});

test('origin rebases preserve world progress and do not masquerade as camera or hull reversal', () => {
  const harness = createMeshProbeHarness();
  try {
    const motion = attachMotionFence(harness), moveCamera = attachCamera(harness);
    for (const alpha of [0.2, 0.4, 0.6]) motion.draw(alpha);
    harness.state.world.frameOrigin.x = 1000;
    harness.state.world.frameOriginSeq++;
    moveCamera(-1000);
    motion.draw(0.8);
    const result = summarizeGameCadence(harness.stop());
    assert.equal(result.actualMeshIdentityBoundaryResets, 1, 'the existing cadence boundary stays unchanged');
    assert.equal(result.actualMeshSignedMotion.boundaryResets, 0, 'world-space comparison survives a render-origin shift');
    assert.equal(result.actualMeshSignedMotion.backtracks, 0);
    assert.equal(result.actualMeshSignedMotion.cameraMotionIntervals, 0);
    assert.equal(result.actualMeshSignedMotion.assessedIntervals, 2);
  } finally { harness.restore(); }
});

for (const boundary of ['generation', 'render-slot generation', 'epoch']) {
  test(`${boundary} changes start a new signed-pose stream instead of reporting a teleport as rewind`, () => {
    const harness = createMeshProbeHarness();
    try {
      const motion = attachMotionFence(harness);
      for (const alpha of [0.2, 0.4, 0.6]) motion.draw(alpha);
      if (boundary === 'generation') harness.player.occupantGeneration++;
      motion.pack(-1000, 0.2, { epoch: boundary === 'epoch' ? 1 : 0,
        poseGeneration: boundary === 'render-slot generation' ? 8 : 7 });
      motion.draw(1);
      const signed = summarizeGameCadence(harness.stop()).actualMeshSignedMotion;
      assert.equal(signed.backtracks, 0);
      assert.equal(signed.boundaryResets, 1);
      assert.ok(signed.unknownSamples > 0);
    } finally { harness.restore(); }
  });
}

test('actual mesh observation exposes a frozen drawn pose despite healthy callbacks and changing ticks', () => {
  const harness = createMeshProbeHarness();
  try {
    harness.sample(0);
    for (const t of [16, 32, 48, 64, 80, 96, 112, 128]) {
      harness.setNow(t);
      harness.state.tick++;
      harness.state.simTime += 1 / 60;
      harness.draw();
      harness.sample(t);
    }
    const result = summarizeGameCadence(harness.stop());
    assert.equal(result.healthyCallbacksFrozenWorld, 0);
    assert.equal(result.actualMeshPoseChanges, 0);
    assert.equal(result.actualMeshIdenticalPoses, 7);
    assert.ok(result.actualMeshStaleMs.max > 100);
    assert.ok(result.actualMeshStaleMs.over100 > 0);
  } finally {
    harness.restore();
  }
});

test('idle frames and identity boundaries do not create a false actual-pose freeze', () => {
  const idle = createMeshProbeHarness({ mode: 'menu', timeScale: 0 });
  try {
    idle.draw();
    const result = summarizeGameCadence(idle.stop());
    assert.equal(result.actualMeshObserved, false);
    assert.equal(result.actualMeshStatus, 'unavailable-no-eligible-samples');
    assert.equal(result.actualMeshMissingSamples, null);
    assert.equal(result.actualMeshPoseChanges, null);
    assert.equal(result.actualMeshStaleMs, null);
  } finally {
    idle.restore();
  }

  const boundary = createMeshProbeHarness();
  try {
    boundary.setNow(0);
    boundary.draw();
    boundary.setNow(120);
    boundary.state.world.frameOriginSeq = 2;
    boundary.draw();
    boundary.setNow(136);
    boundary.draw();
    const result = summarizeGameCadence(boundary.stop());
    assert.equal(result.actualMeshObserved, true);
    assert.equal(result.actualMeshIdentityBoundaryResets, 1);
    assert.equal(result.actualMeshStaleMs.max, 16);
    assert.equal(result.actualMeshStaleMs.over100, 0);
  } finally {
    boundary.restore();
  }
});

test('missing player mesh is reported as unavailable rather than healthy zero motion', () => {
  const harness = createMeshProbeHarness({ mesh: false });
  try {
    harness.draw();
    const result = summarizeGameCadence(harness.stop());
    assert.equal(result.actualMeshObserved, false);
    assert.equal(result.actualMeshStatus, 'unavailable-no-eligible-samples');
    assert.equal(result.actualMeshMissingSamples, 1);
    assert.equal(result.actualMeshPoseChanges, null);
    assert.equal(result.actualMeshStaleMs, null);
  } finally {
    harness.restore();
  }
});
