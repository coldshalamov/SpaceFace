import test from 'node:test';
import assert from 'node:assert/strict';
import { installGameCadenceProbe, summarizeGameCadence, distribution } from '../scripts/lib/gameCadenceProbe.mjs';

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
  const playerMesh = mesh ? { visible: true, parent: {}, matrixWorld: { elements } } : null;
  const state = {
    mode, timeScale, tick: 0, simTime: 0, playerId: 1,
    entities: new Map([[1, player]]),
    world: { frameOriginSeq: origin },
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
  } finally {
    harness.restore();
  }
});

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
