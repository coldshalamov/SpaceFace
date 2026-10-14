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
    window.SF.state.mode = 'loading';
    owner.drawPreparedFrame();
    callback(32);
    const record = window.__SF_GAME_CADENCE__.stop();
    assert.deepEqual(record.rows.map(r => r.submissions), [0, 1, 1]);
    assert.equal(owner.drawPreparedFrame, original);
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedRequest === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = savedRequest;
    if (savedCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = savedCancel;
  }
});
