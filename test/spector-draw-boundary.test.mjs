import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSpectorFrame } from '../src/testing/perf/spectorIntegration.js';

class EventChannel {
  constructor() {
    this.listeners = new Set();
  }

  add(listener) {
    this.listeners.add(listener);
  }

  remove(listener) {
    this.listeners.delete(listener);
  }

  emit(value) {
    for (const listener of [...this.listeners]) listener(value);
  }
}

class MockSpector {
  constructor() {
    this.onCapture = new EventChannel();
    this.onError = new EventChannel();
    this.startCalls = [];
    this.stopCalls = 0;
    this.capturingContext = undefined;
    this.noFrameTimeout = -1;
  }

  startCapture(canvas, commandCount, quickCapture, fullCapture) {
    this.startCalls.push({ canvas, commandCount, quickCapture, fullCapture });
    this.capturingContext = {};
  }

  stopCapture() {
    this.stopCalls += 1;
    if (!this.capturingContext) return undefined;
    this.capturingContext = undefined;
    const capture = { commands: [{ name: 'drawElements' }] };
    this.onCapture.emit(capture);
    return capture;
  }
}

async function settleCaptureSetup() {
  // captureSpectorFrame awaits initSpector before installing the owner hook.
  await Promise.resolve();
  await Promise.resolve();
}

test('Spector capture follows the live draw owner and cleans up every boundary', async () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const spector = new MockSpector();
  let currentOwner;
  const canvas = { id: 'gl-canvas' };
  globalThis.window = {
    SPECTOR: { Spector: class { constructor() { return spector; } } },
    SF: { registry: { get: () => currentOwner } },
  };
  globalThis.document = {
    getElementById: () => canvas,
  };

  try {
    let drawCount = 0;
    const originalDraw = function (label) {
      drawCount += 1;
      assert.equal(this, currentOwner);
      assert.equal(label, 'world');
      return drawCount === 2;
    };
    currentOwner = { drawPreparedFrame: originalDraw };

    const capturePromise = captureSpectorFrame(canvas, {
      timeoutMs: 100,
      commandCount: 321,
      quickCapture: true,
      fullCapture: true,
    });
    await settleCaptureSetup();
    assert.notEqual(currentOwner.drawPreparedFrame, originalDraw);

    assert.equal(currentOwner.drawPreparedFrame('world'), false);
    assert.equal(spector.startCalls.length, 1);
    assert.equal(spector.startCalls[0].commandCount, 321);
    assert.equal(spector.stopCalls, 1, 'discard commands from the skipped draw');

    assert.equal(currentOwner.drawPreparedFrame('world'), true);
    const capture = await capturePromise;
    assert.equal(capture.commands.length, 1);
    assert.equal(spector.startCalls.length, 2, 'successful draw gets a fresh command capture');
    assert.deepEqual(capture.spacefaceBoundary, { successfulWorldDraw: true, commandLimit: 321, truncated: false });
    assert.equal(drawCount, 2);
    assert.equal(currentOwner.drawPreparedFrame, originalDraw);
    assert.equal(spector.onCapture.listeners.size, 0);
    assert.equal(spector.onError.listeners.size, 0);

    const failedOwner = {
      drawPreparedFrame() {
        throw new Error('draw failed');
      },
    };
    currentOwner = failedOwner;
    const failedPromise = captureSpectorFrame(canvas, { timeoutMs: 100 });
    await settleCaptureSetup();
    assert.throws(() => failedOwner.drawPreparedFrame(), /draw failed/);
    await assert.rejects(failedPromise, /draw failed/);
    assert.equal(failedOwner.drawPreparedFrame.name, 'drawPreparedFrame');
    assert.equal(spector.onCapture.listeners.size, 0);
    assert.equal(spector.onError.listeners.size, 0);

    const originalErrorDraw = function () {
      return false;
    };
    const errorOwner = { drawPreparedFrame: originalErrorDraw };
    currentOwner = errorOwner;
    const errorPromise = captureSpectorFrame(canvas, { timeoutMs: 100 });
    await settleCaptureSetup();
    assert.equal(errorOwner.drawPreparedFrame(), false);
    spector.onError.emit(new Error('context lost'));
    await assert.rejects(errorPromise, /context lost/);
    assert.equal(errorOwner.drawPreparedFrame, originalErrorDraw);
    assert.equal(spector.onCapture.listeners.size, 0);
    assert.equal(spector.onError.listeners.size, 0);

    const timeoutOwner = {
      drawPreparedFrame() {
        return false;
      },
    };
    currentOwner = timeoutOwner;
    const timeoutPromise = captureSpectorFrame(canvas, { timeoutMs: 10 });
    await settleCaptureSetup();
    assert.equal(timeoutOwner.drawPreparedFrame(), false);
    await assert.rejects(timeoutPromise, /timed out after 10ms/);
    assert.equal(spector.capturingContext, undefined);
    assert.equal(timeoutOwner.drawPreparedFrame.name, 'drawPreparedFrame');
    assert.equal(spector.onCapture.listeners.size, 0);
    assert.equal(spector.onError.listeners.size, 0);
  } finally {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
  }
});
