import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { installFlightFootage } from '../src/ui/screens/flightFootage.js';

const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.posted = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(data, transfer) {
    this.posted.push({ data, transfer });
  }

  reply(sequence = 0) {
    const request = this.posted[sequence];
    this.onmessage?.({ data: { id: request.data.id, blob: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) } });
  }

  terminate() { this.terminated = true; }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function installBrowser({ bitmapFailure = false } = {}) {
  const saved = new Map();
  for (const name of ['document', 'performance', 'Worker', 'OffscreenCanvas', 'createImageBitmap', 'URL']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const savedTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  const calls = { bitmaps: [], streams: 0 };
  let poll = null;
  let visibility = null;
  FakeWorker.instances.length = 0;

  const source = {
    width: 1466,
    height: 779,
    captureStream() {
      calls.streams += 1;
      const track = { stop() {} };
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    },
  };
  const video = {
    readyState: 2,
    play: () => Promise.resolve(),
    pause() {},
    load() {},
    removeAttribute() {},
    requestVideoFrameCallback() { return 1; },
    cancelVideoFrameCallback() {},
  };
  const document = {
    hidden: false,
    addEventListener(type, listener) { if (type === 'visibilitychange') visibility = listener; },
    removeEventListener() {},
    createElement(tag) {
      if (tag === 'video') return video;
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(done) { done(new Blob([new Uint8Array([3])], { type: 'image/jpeg' })); },
      };
    },
  };
  const renderer = { domElement: source };
  const state = {
    mode: 'flight',
    paused: false,
    tick: 6,
    render: { renderer, canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 5000 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    writable: true,
    value: { createObjectURL: () => 'blob:presented-test', revokeObjectURL() {} },
  });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: bitmapFailure
      ? async () => { throw new Error('presented bitmap unavailable'); }
      : (canvas, options) => {
        calls.bitmaps.push({ canvas, options });
        return Promise.resolve({ close() {} });
      },
  });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};

  const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => state, startDelayMs: 0 });
  poll();
  return {
    calls,
    state,
    footage,
    worker: () => FakeWorker.instances[0],
    poll,
    visibility,
    cleanup() {
      footage?.dispose?.();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      globalThis.setInterval = savedTimers.setInterval;
      globalThis.clearInterval = savedTimers.clearInterval;
    },
  };
}

test('presented canvas capture snapshots the submitted renderer canvas once per six ticks', async () => {
  const browser = installBrowser();
  try {
    assert.equal(browser.calls.streams, 0, 'the presented arm does not create a compositor stream');
    assert.equal(browser.footage.status().requestedCaptureSource, 'presented');
    assert.equal(browser.footage.status().captureSource, 'presented');
    const hook = browser.state.render.flightFootagePresentHook;
    assert.equal(typeof hook, 'function');

    hook(browser.state.render.renderer.domElement);
    assert.equal(browser.calls.bitmaps.length, 1, 'bitmap initiation happens synchronously at the draw boundary');
    assert.deepEqual(browser.calls.bitmaps[0].options, {
      resizeWidth: 640,
      resizeHeight: 340,
      resizeQuality: 'medium',
    }, 'the source aspect ratio is preserved');
    await flush();
    assert.equal(browser.worker().posted.length, 1);
    browser.worker().reply(0);
    await flush();
    assert.equal(browser.footage.ring.frames.length, 1);
    assert.deepEqual([browser.footage.ring.frames[0].width, browser.footage.ring.frames[0].height], [640, 340]);

    // A duplicate draw for the same tick is rejected by the existing six-sim-tick cadence gate.
    hook(browser.state.render.renderer.domElement);
    assert.equal(browser.calls.bitmaps.length, 1);
    browser.state.tick = 12;
    browser.state.replay.latestPoseSample.tick = 12;
    hook(browser.state.render.renderer.domElement);
    assert.equal(browser.calls.bitmaps.length, 2);
    await flush();
    browser.worker().reply(1);
    await flush();
    assert.equal(browser.footage.ring.frames.length, 2);

    browser.footage.dispose();
    assert.equal(browser.state.render.flightFootagePresentHook, null, 'dispose removes only its own hook');
    assert.equal(browser.worker().terminated, true);
  } finally {
    browser.cleanup();
  }
});

test('presented bitmap failure falls back to the established detached video source', async () => {
  const browser = installBrowser({ bitmapFailure: true });
  try {
    const hook = browser.state.render.flightFootagePresentHook;
    assert.equal(typeof hook, 'function');
    hook(browser.state.render.renderer.domElement);
    await flush();
    await flush();
    assert.equal(browser.calls.streams, 1, 'fallback creates one established capture stream');
    assert.equal(browser.footage.status().captureSource, 'video');
    assert.equal(browser.state.render.flightFootagePresentHook, null);
  } finally {
    browser.cleanup();
  }
});

test('renderer owns one failure-isolated presented hook at the completed draw boundary', () => {
  const drawBoundary = rendererSource.indexOf('this.state.render.worldSubmittedFrames =');
  const completedDraw = rendererSource.indexOf('return true;', drawBoundary);
  assert.ok(drawBoundary >= 0 && completedDraw > drawBoundary);
  const tail = rendererSource.slice(drawBoundary, completedDraw);
  assert.match(tail, /flightFootagePresentHook/);
  assert.match(tail, /try \{[\s\S]*flightFootagePresentHook\([\s\S]*catch \{/);
});
