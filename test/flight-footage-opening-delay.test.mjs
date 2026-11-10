// installFlightFootage must stay out of the opening, and must not reallocate its 2D canvas per capture.
//
// The recorder runs a captureStream of the 1832x973 WebGL canvas into a detached video and encodes 10 JPEGs a
// second. In the 2026-10-13 launch profile its toBlob readback cost ~162 ms inside the first 4.6 s of flight
// (three captures of 35-66 ms each) while the player was still paying for the opening, and every capture also
// re-assigned canvas.width/height, which resets the context. The stream now starts 5 s after the first
// playable frame (metadata keeps recording during the delay), and the canvas/context are reused.
import assert from 'node:assert/strict';
import test from 'node:test';

import { installFlightFootage } from '../src/ui/screens/flightFootage.js';

function fakeBrowser() {
  const calls = { streams: 0, dimensionWrites: 0, draws: 0 };
  let clock = 0;
  let poll = null;
  const frameCallbacks = [];
  const saved = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
      createElement(tag) {
        if (tag === 'video') {
          return {
            readyState: 2,
            play: () => Promise.resolve(),
            pause() {}, load() {}, removeAttribute() {},
            requestVideoFrameCallback(fn) { frameCallbacks.push(fn); return frameCallbacks.length; },
            cancelVideoFrameCallback() {},
          };
        }
        let width = 300;
        let height = 150;
        return {
          get width() { return width; },
          set width(value) { calls.dimensionWrites += 1; width = value; },
          get height() { return height; },
          set height(value) { calls.dimensionWrites += 1; height = value; },
          getContext: () => ({ drawImage() { calls.draws += 1; } }),
          toBlob(done) { done(new Blob([new Uint8Array(8)])); },
        };
      },
    },
  });
  const source = {
    width: 1832,
    height: 973,
    captureStream() { calls.streams += 1; return { getTracks: () => [{ stop() {} }] }; },
  };
  const state = {
    mode: 'flight',
    paused: false,
    tick: 6,
    render: { canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  return {
    calls,
    state,
    advance(ms) { clock = ms; },
    poll: async () => { poll(); await Promise.resolve(); },
    captureFrame() {
      const callback = frameCallbacks.shift();
      assert.ok(callback, 'a video-frame callback is waiting');
      state.tick += 6;
      state.replay.latestPoseSample.tick = state.tick;
      callback();
    },
    restore() {
      for (const key of ['document', 'performance']) {
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
        else delete globalThis[key];
      }
      globalThis.setInterval = saved.setInterval;
      globalThis.clearInterval = saved.clearInterval;
    },
  };
}

test('no capture stream exists during the opening; one starts exactly when the delay ends', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state });
    await browser.poll();
    assert.equal(browser.calls.streams, 0, 'the first eligible poll does not start capturing');
    browser.advance(4999);
    await browser.poll();
    assert.equal(browser.calls.streams, 0, 'still inside the 5 s opening');
    browser.advance(5000);
    await browser.poll();
    assert.equal(browser.calls.streams, 1, 'capture starts once the delay has passed');
    await browser.poll();
    assert.equal(browser.calls.streams, 1, 'and is not restarted on later polls');
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('a new game restarts the opening window from its own first playable frame', async () => {
  const browser = fakeBrowser();
  try {
    const handlers = new Map();
    const bus = { on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); } };
    const footage = installFlightFootage(bus, { stateOf: () => browser.state });
    browser.advance(1000);
    await browser.poll();
    browser.advance(6000);
    await browser.poll();
    assert.equal(browser.calls.streams, 1, 'the first flight is past its opening and capturing');

    handlers.get('game:new')();
    assert.equal(footage.status().capturing, false, 'a new game stops the old stream');
    browser.state.render.firstPlayableFrameAt = 7000; // the new game's own first picture
    browser.advance(8000);
    await browser.poll();
    assert.equal(browser.calls.streams, 1, 'one second into the new flight: no new stream yet');
    browser.advance(12000);
    await browser.poll();
    assert.equal(browser.calls.streams, 2, 'five seconds after the new first picture it captures again');
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('startDelayMs 0 keeps the old immediate start for callers that need opening pixels', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    assert.equal(browser.calls.streams, 1);
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('captures reuse one canvas and context: dimensions are written once, not per capture', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    browser.captureFrame();
    browser.captureFrame();
    assert.equal(footage.ring.frames.length, 2, 'both captures reached the ring');
    assert.deepEqual(footage.ring.frames.map((frame) => [frame.width, frame.height]), [[640, 340], [640, 340]],
      'the encoded output is unchanged: 640x340');
    assert.equal(browser.calls.dimensionWrites, 2, 'width and height assigned once for the first capture, never again');
    assert.equal(browser.calls.draws, 2);
    footage.clear();
    assert.equal(footage.ring.frames.length, 0);
    footage.dispose();
  } finally {
    browser.restore();
  }
});
