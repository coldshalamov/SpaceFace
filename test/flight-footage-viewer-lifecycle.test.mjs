import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFootageViewer,
  installFlightFootage,
} from '../src/ui/screens/flightFootage.js';
import { decodeFootageFrameToBlob } from '../src/ui/screens/footageVideoCodec.js';

function setupRecorder() {
  const saved = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'),
    createImageBitmap: Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap'),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const state = {
    mode: 'flight',
    paused: false,
    tick: 12,
    render: { canvas: { width: 640, height: 360 }, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 12, poses: [], events: [] } },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { hidden: false, addEventListener() {}, removeEventListener() {}, createElement() { return {}; } },
  });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 5000 } });
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => state, startDelayMs: 0 });
  return {
    state,
    footage,
    restore() {
      footage.dispose();
      if (saved.document) Object.defineProperty(globalThis, 'document', saved.document);
      else delete globalThis.document;
      if (saved.performance) Object.defineProperty(globalThis, 'performance', saved.performance);
      else delete globalThis.performance;
      if (saved.createImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', saved.createImageBitmap);
      else delete globalThis.createImageBitmap;
      globalThis.setInterval = saved.setInterval;
      globalThis.clearInterval = saved.clearInterval;
    },
  };
}

test('viewer retries the same tick after bitmap materialization fails', async () => {
  const recorder = setupRecorder();
  let bitmapCalls = 0;
  let draws = 0;
  const bitmap = { close() {} };
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: async () => {
      bitmapCalls += 1;
      if (bitmapCalls === 1) throw new Error('decode failed');
      return bitmap;
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() { draws += 1; } }) };
  recorder.footage.ring.push({ tick: 12, blob: new Blob([new Uint8Array([1])]), width: 640, height: 360 });
  const viewer = createFootageViewer(canvas);
  try {
    await assert.rejects(viewer.show(12), /decode failed/);
    assert.equal(await viewer.show(12), true);
    assert.equal(bitmapCalls, 2);
    assert.equal(draws, 1);
  } finally {
    viewer.dispose();
    recorder.restore();
  }
});

test('viewer drops a delayed decode when the recorder ring is cleared', async () => {
  const recorder = setupRecorder();
  let resolveBitmap;
  let draws = 0;
  let closes = 0;
  const bitmap = { close() { closes += 1; } };
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: () => new Promise((resolve) => { resolveBitmap = resolve; }),
  });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() { draws += 1; } }) };
  recorder.footage.ring.push({ tick: 12, blob: new Blob([new Uint8Array([1])]), width: 640, height: 360 });
  const viewer = createFootageViewer(canvas);
  try {
    const pending = viewer.show(12);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(typeof resolveBitmap, 'function', 'the viewer reached bitmap decoding');
    recorder.footage.clear();
    resolveBitmap(bitmap);
    assert.equal(await pending, false);
    assert.equal(draws, 0);
    assert.equal(closes, 1);
  } finally {
    viewer.dispose();
    recorder.restore();
  }
});

test('a later request for the visible frame cancels an older delayed frame', async () => {
  const recorder = setupRecorder();
  let resolveB;
  let draws = 0;
  const bitmapA = { close() {} };
  const bitmapB = { close() {} };
  let bitmapCalls = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: async () => {
      bitmapCalls += 1;
      if (bitmapCalls === 1) return bitmapA;
      return new Promise((resolve) => { resolveB = resolve; });
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() { draws += 1; } }) };
  recorder.footage.ring.push({ tick: 12, blob: new Blob([new Uint8Array([1])]), width: 640, height: 360 });
  recorder.footage.ring.push({ tick: 18, blob: new Blob([new Uint8Array([2])]), width: 640, height: 360 });
  const viewer = createFootageViewer(canvas);
  try {
    assert.equal(await viewer.show(12), true);
    const pendingB = viewer.show(18);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(typeof resolveB, 'function', 'the second frame is awaiting materialization');
    assert.equal(await viewer.show(12), true, 'the visible frame remains a fast no-op');
    resolveB(bitmapB);
    assert.equal(await pendingB, false);
    assert.equal(draws, 1, 'the stale delayed frame did not repaint the viewer');
  } finally {
    viewer.dispose();
    recorder.restore();
  }
});

test('blob materialization honors an already-aborted decode signal', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    decodeFootageFrameToBlob({ blob: new Blob([new Uint8Array([1])]) }, { signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
});
