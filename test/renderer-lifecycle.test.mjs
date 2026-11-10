import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRendererLifecycleBindings,
  publishFirstPresentGpuReady,
  render,
} from '../src/render/renderer.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, options });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener, options) {
    const entries = this.listeners.get(type) || [];
    const index = entries.findIndex((entry) => entry.listener === listener && entry.options === options);
    if (index >= 0) entries.splice(index, 1);
  }

  dispatchEvent(event) {
    for (const { listener } of [...(this.listeners.get(event.type) || [])]) listener(event);
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

class FakeBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, listener) {
    const entries = this.listeners.get(event) || [];
    entries.push(listener);
    this.listeners.set(event, entries);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    const entries = this.listeners.get(event) || [];
    const index = entries.indexOf(listener);
    if (index >= 0) entries.splice(index, 1);
  }

  emit(event, payload) {
    for (const listener of [...(this.listeners.get(event) || [])]) listener(payload, event);
  }

  listenerCount(event) {
    return (this.listeners.get(event) || []).length;
  }
}

function createFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    pending,
    run(id) {
      const timer = pending.get(id);
      if (!timer) return false;
      pending.delete(id);
      timer.callback();
      return true;
    },
  };
}

function installSession({ canvas, windowTarget, bus, timers, counters }) {
  const lifecycle = createRendererLifecycleBindings({
    bus,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  lifecycle.listen(canvas, 'webglcontextlost', (event) => {
    event.preventDefault?.();
    counters.contextLost += 1;
  }, false);
  lifecycle.listen(canvas, 'webglcontextrestored', () => {
    counters.contextRestored += 1;
    counters.restoreTimer = lifecycle.setTimeout(() => {
      counters.restoreWork += 1;
    }, 50);
  }, false);
  lifecycle.listenResize(windowTarget, () => {
    counters.resizes += 1;
  });
  lifecycle.onBus('render:test', () => {
    counters.busEvents += 1;
  });
  counters.envTimer = lifecycle.setTimeout(() => {
    counters.envBake += 1;
  }, 120);
  return lifecycle;
}

test('renderer lifecycle is idempotent, owns deferred work, and preserves foreign listeners', () => {
  const canvas = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  const bus = new FakeBus();
  const timers = createFakeTimers();
  const counters = {
    contextLost: 0,
    contextRestored: 0,
    restoreWork: 0,
    resizes: 0,
    busEvents: 0,
    envBake: 0,
    foreignContext: 0,
    foreignResize: 0,
    foreignBus: 0,
    envTimer: null,
    restoreTimer: null,
  };

  canvas.addEventListener('webglcontextrestored', () => { counters.foreignContext += 1; });
  windowTarget.addEventListener('resize', () => { counters.foreignResize += 1; });
  bus.on('render:test', () => { counters.foreignBus += 1; });

  const renderer = {
    lifecycle: null,
    init() {
      this.lifecycle?.destroy();
      this.lifecycle = installSession({ canvas, windowTarget, bus, timers, counters });
      return this.lifecycle;
    },
    destroy() {
      return this.lifecycle?.destroy() || false;
    },
  };

  renderer.init();
  assert.equal(canvas.listenerCount('webglcontextlost'), 1);
  assert.equal(canvas.listenerCount('webglcontextrestored'), 2);
  assert.equal(windowTarget.listenerCount('resize'), 2);
  assert.equal(bus.listenerCount('render:test'), 2);
  assert.equal(timers.pending.size, 1);

  const firstLifecycle = renderer.lifecycle;
  const lifecycle = renderer.init();
  assert.equal(firstLifecycle.destroy(), false, 'idempotent init already retired the first lifecycle');
  assert.equal(canvas.listenerCount('webglcontextlost'), 1,
    'a stale destroy must not remove the replacement context-loss listener');
  assert.equal(canvas.listenerCount('webglcontextrestored'), 2,
    'foreign and replacement context-restore listeners remain');
  assert.equal(windowTarget.listenerCount('resize'), 2,
    'foreign and replacement resize listeners remain');
  assert.equal(bus.listenerCount('render:test'), 2,
    'foreign and replacement bus listeners remain');
  assert.equal(timers.pending.size, 1,
    'destroying the first session cancels only its deferred timer');

  canvas.dispatchEvent({ type: 'webglcontextlost', preventDefault() {} });
  canvas.dispatchEvent({ type: 'webglcontextrestored' });
  windowTarget.dispatchEvent({ type: 'resize' });
  bus.emit('render:test');
  assert.equal(counters.foreignContext, 1);
  assert.equal(counters.foreignResize, 1);
  assert.equal(counters.foreignBus, 1);
  assert.equal(counters.contextLost, 1);
  assert.equal(counters.contextRestored, 1);
  assert.equal(counters.resizes, 1);
  assert.equal(counters.busEvents, 1);

  const staleLostListener = canvas.listeners.get('webglcontextlost').at(-1).listener;
  const staleRestoreListener = canvas.listeners.get('webglcontextrestored').at(-1).listener;
  renderer.destroy();
  assert.equal(canvas.listenerCount('webglcontextlost'), 0);
  assert.equal(canvas.listenerCount('webglcontextrestored'), 1,
    'destroy removes the owned context listener but preserves the foreign one');
  assert.equal(windowTarget.listenerCount('resize'), 1,
    'destroy removes the owned resize listener but preserves the foreign one');
  assert.equal(bus.listenerCount('render:test'), 1,
    'destroy removes the owned bus listener but preserves the foreign one');
  assert.equal(timers.pending.size, 0, 'destroy cancels environment and restore timers');

  const staleRestoreTimer = counters.restoreTimer;
  assert.equal(timers.run(staleRestoreTimer), false,
    'a context-restore timer scheduled by the destroyed lifecycle is cancelled');
  staleLostListener({ preventDefault() {} });
  staleRestoreListener();
  assert.equal(counters.contextLost, 1,
    'a retained late context-loss callback is gated after destroy');
  assert.equal(counters.contextRestored, 1,
    'a retained late context-restore callback is gated after destroy');
  canvas.dispatchEvent({ type: 'webglcontextrestored' });
  windowTarget.dispatchEvent({ type: 'resize' });
  bus.emit('render:test');
  assert.equal(counters.foreignContext, 2);
  assert.equal(counters.foreignResize, 2);
  assert.equal(counters.foreignBus, 2);
  assert.equal(counters.contextRestored, 1, 'late restore work is a no-op after destroy');
  assert.equal(counters.resizes, 1, 'late resize work is a no-op after destroy');
  assert.equal(counters.busEvents, 1, 'late bus work is a no-op after destroy');
});

test('exported render.destroy tears down its injected generation and settles startup delay', async () => {
  const fields = [
    '_rendererLifecycle',
    '_contextRestoreReceipt',
    '_resizeHandler',
    '_videoSettingsOff',
    '_firstPresentGpuAdmission',
  ];
  const saved = fields.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(render, key),
    render[key],
  ]);
  const canvas = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  const bus = new FakeBus();
  const timers = createFakeTimers();
  const activity = { context: 0, resize: 0, bus: 0, foreign: 0 };
  canvas.addEventListener('webglcontextrestored', () => { activity.foreign += 1; });
  windowTarget.addEventListener('resize', () => { activity.foreign += 1; });
  bus.on('render:owned', () => { activity.foreign += 1; });

  try {
    const lifecycle = createRendererLifecycleBindings({
      bus,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    lifecycle.listen(canvas, 'webglcontextrestored', () => { activity.context += 1; });
    lifecycle.listenResize(windowTarget, () => { activity.resize += 1; });
    lifecycle.onBus('render:owned', () => { activity.bus += 1; });
    lifecycle.setTimeout(() => { activity.context += 1; }, 120);
    const startupDelay = lifecycle.wait(140);
    let receiptCancels = 0;
    render._rendererLifecycle = lifecycle;
    render._contextRestoreReceipt = {
      cancel() {
        receiptCancels += 1;
        return true;
      },
    };
    render._firstPresentGpuAdmission = startupDelay;

    const staleRestore = canvas.listeners.get('webglcontextrestored').at(-1).listener;
    const staleResize = windowTarget.listeners.get('resize').at(-1).listener;
    const staleBus = bus.listeners.get('render:owned').at(-1);
    assert.equal(render.destroy(), true);
    assert.equal(receiptCancels, 1, 'destroy cancels the pending context-restore receipt');
    assert.equal(render.destroy(), false, 'destroy is idempotent');
    assert.equal(canvas.listenerCount('webglcontextrestored'), 1,
      'destroy removes only the owned context listener');
    assert.equal(windowTarget.listenerCount('resize'), 1,
      'destroy removes only the owned resize listener');
    assert.equal(bus.listenerCount('render:owned'), 1,
      'destroy removes only the owned bus listener');
    assert.equal(timers.pending.size, 0, 'destroy clears every owned timer');
    assert.equal(await startupDelay, false,
      'destroy settles the first-present delay as inactive instead of leaving it pending');

    staleRestore();
    staleResize();
    staleBus();
    canvas.dispatchEvent({ type: 'webglcontextrestored' });
    windowTarget.dispatchEvent({ type: 'resize' });
    bus.emit('render:owned');
    assert.equal(activity.context, 0, 'late retained context callback is gated');
    assert.equal(activity.resize, 0, 'late retained resize callback is gated');
    assert.equal(activity.bus, 0, 'late retained bus callback is gated');
    assert.equal(activity.foreign, 3, 'foreign listeners still receive their events');
  } finally {
    for (const [key, hadValue, value] of saved) {
      if (hadValue) render[key] = value;
      else delete render[key];
    }
  }
});

test('stale first-present completion cannot publish readiness for a replacement generation', async () => {
  const hadLifecycle = Object.prototype.hasOwnProperty.call(render, '_rendererLifecycle');
  const previousLifecycle = render._rendererLifecycle;
  const hadReady = Object.prototype.hasOwnProperty.call(render, '_firstPresentGpuReady');
  const previousReady = render._firstPresentGpuReady;
  const oldLifecycle = createRendererLifecycleBindings();
  const replacementLifecycle = createRendererLifecycleBindings();
  try {
    render._rendererLifecycle = oldLifecycle;
    render._firstPresentGpuReady = false;
    const staleCompletion = Promise.resolve().then(() => (
      publishFirstPresentGpuReady(render, oldLifecycle)
    ));

    oldLifecycle.destroy();
    render._rendererLifecycle = replacementLifecycle;
    render._firstPresentGpuReady = false;
    assert.equal(await staleCompletion, false);
    assert.equal(render._firstPresentGpuReady, false,
      'an old generation cannot mark the replacement ready');
    assert.equal(publishFirstPresentGpuReady(render, replacementLifecycle), true);
    assert.equal(render._firstPresentGpuReady, true,
      'the current live generation can publish readiness');
  } finally {
    replacementLifecycle.destroy();
    if (hadLifecycle) render._rendererLifecycle = previousLifecycle;
    else delete render._rendererLifecycle;
    if (hadReady) render._firstPresentGpuReady = previousReady;
    else delete render._firstPresentGpuReady;
  }
});
