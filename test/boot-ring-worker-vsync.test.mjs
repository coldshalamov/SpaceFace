// The loading ring is drawn by a worker. Until now the worker's own cadence was a 100 ms
// setTimeout net and the page's main thread forwarded vsync beats to it, so a long main-thread task
// (the 2026-10-13 launch profile has 267 of them, up to 736 ms) dropped the needle to 10 Hz — the
// "blip" on the loading screen. The worker now owns a requestAnimationFrame beat of its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { bootRingWorkerRuntime } from '../src/ui/orrery/bootRingWorker.js';
import { createLoadingProgressModel } from '../src/ui/loadingProgressModel.js';

function boot({ withRaf }) {
  let time = 0;
  const posted = [];
  const timers = new Map();
  const frames = new Map();
  let serial = 0;
  let drawCalls = 0;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === 'clearRect') return () => { drawCalls += 1; };
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const sandbox = {
    performance: { now: () => time, timeOrigin: 1000 },
    postMessage: (message) => posted.push(message),
    setTimeout: (fn) => { timers.set(++serial, fn); return serial; },
    clearTimeout: (id) => timers.delete(id),
    close() {},
    onmessage: null,
  };
  if (withRaf) {
    sandbox.requestAnimationFrame = (fn) => { frames.set(++serial, fn); return serial; };
    sandbox.cancelAnimationFrame = (id) => frames.delete(id);
  }
  vm.createContext(sandbox);
  vm.runInContext(`(${bootRingWorkerRuntime.toString()})(${createLoadingProgressModel.toString()});`, sandbox);
  const send = (data) => sandbox.onmessage({ data });
  send({ type: 'init', canvas: { getContext: () => ctx }, stage: { id: 'gpu-resources', progress: 0.5 }, reduced: false });
  return {
    send, posted, timers, frames,
    draws: () => drawCalls,
    advance(ms) { time += ms; },
    // Deliver the pending display frame, as the compositor would.
    vsync() {
      const [id, fn] = [...frames.entries()][0] || [];
      if (!fn) return false;
      frames.delete(id);
      fn(time);
      return true;
    },
  };
}

test('with worker rAF the ring beats on its own vsync and keeps no timer net', () => {
  const w = boot({ withRaf: true });
  assert.ok(w.posted.some((p) => p.type === 'ready'));
  assert.equal(w.frames.size, 1, 'one display frame is pending after init');
  assert.equal(w.timers.size, 0, 'the 100 ms setTimeout net is not armed');
  const before = w.draws();
  // 30 display frames with NO message from the main thread at all (it is stalled).
  for (let i = 0; i < 30; i++) {
    w.advance(16.7);
    assert.ok(w.vsync(), `a frame is always pending (frame ${i})`);
  }
  assert.ok(w.draws() - before >= 28, `drew on its own beat while the page was silent: ${w.draws() - before} of 30`);
  assert.equal(w.frames.size, 1, 'exactly one frame stays queued');
});

test('a main-thread beat inside the same frame does not draw twice', () => {
  const w = boot({ withRaf: true });
  w.advance(16.7); w.vsync();
  const after = w.draws();
  w.send({ type: 'frame' });
  assert.equal(w.draws(), after, 'a forwarded beat within the 14 ms guard is collapsed');
  w.advance(20);
  w.send({ type: 'frame' });
  assert.equal(w.draws(), after + 1, 'a beat after the guard still paints (harmless extra trigger)');
});

test('pause cancels the pending frame and resume restarts one', () => {
  const w = boot({ withRaf: true });
  assert.equal(w.frames.size, 1);
  w.send({ type: 'pause' });
  assert.equal(w.frames.size, 0, 'nothing keeps drawing behind a hidden shell');
  assert.equal(w.timers.size, 0);
  w.send({ type: 'resume' });
  assert.equal(w.frames.size, 1);
  w.send({ type: 'destroy' });
  assert.equal(w.frames.size, 0);
});

test('reduced motion keeps the slow timer cadence even when rAF exists', () => {
  const w = boot({ withRaf: true });
  w.send({ type: 'motion', reduced: true });
  w.send({ type: 'pause' });
  w.send({ type: 'resume' });
  assert.equal(w.frames.size, 0, 'no per-frame animation under reduced motion');
  assert.equal(w.timers.size, 1, 'the 250 ms net carries it');
});

test('a host without worker rAF still falls back to the timer net', () => {
  const w = boot({ withRaf: false });
  assert.equal(w.frames.size, 0);
  assert.equal(w.timers.size, 1);
  w.send({ type: 'pause' });
  assert.equal(w.timers.size, 0);
});
