import assert from 'node:assert/strict';
import test from 'node:test';

import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';

function installAttractHost() {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = new Map();
  let nextFrameId = 1;

  const add = (map, name, fn) => {
    const set = map.get(name) || new Set();
    set.add(fn);
    map.set(name, set);
  };
  const remove = (map, name, fn) => map.get(name)?.delete(fn);
  globalThis.window = {
    addEventListener: (name, fn) => add(windowListeners, name, fn),
    removeEventListener: (name, fn) => remove(windowListeners, name, fn),
  };
  globalThis.document = {
    hidden: false,
    addEventListener: (name, fn) => add(documentListeners, name, fn),
    removeEventListener: (name, fn) => remove(documentListeners, name, fn),
  };
  globalThis.requestAnimationFrame = (fn) => {
    const id = nextFrameId++;
    frames.set(id, fn);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  return {
    frame(nowMs) {
      const entry = frames.entries().next().value;
      assert(entry, 'title attract must retain one animation-frame callback');
      const [id, fn] = entry;
      frames.delete(id);
      fn(nowMs);
    },
    emitWindow(name) {
      for (const fn of windowListeners.get(name) || []) fn({ type: name });
    },
    emitDocument(name) {
      for (const fn of documentListeners.get(name) || []) fn({ type: name });
    },
    restore() {
      mainMenuScreen._stopIdleAttract();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    },
  };
}

function makeFixture({ reducedMotion = false } = {}) {
  // The attract breathes the authored still, not a camera: `data-attract` on the screen root arms
  // the kit plate-drift animation. The fixture observes that DOM seam directly.
  const rootEl = { dataset: {} };
  return {
    rootEl,
    state: { settings: { video: { motionReduce: reducedMotion } } },
    drifting: () => rootEl.dataset.attract === '1',
  };
}

test('title attract uses elapsed idle time, resets on input, and tears down its own drift', () => {
  const host = installAttractHost();
  const fixture = makeFixture();
  try {
    mainMenuScreen._startIdleAttract({ state: fixture.state, rootEl: fixture.rootEl });
    host.frame(1_000);
    host.frame(12_999);
    assert.equal(fixture.drifting(), false, '11.999 seconds must remain still');
    host.frame(13_000);
    assert.equal(fixture.drifting(), true, '12 elapsed seconds must start the attract drift');

    host.emitWindow('keydown');
    assert.equal(fixture.drifting(), false, 'player input must stop the attract drift immediately');
    host.frame(25_000);
    host.frame(36_999);
    assert.equal(fixture.drifting(), false, 'the input reset starts a fresh idle window');
    host.frame(37_000);
    assert.equal(fixture.drifting(), true);

    mainMenuScreen._stopIdleAttract();
    assert.equal(fixture.drifting(), false,
      'screen teardown must clear the drift it armed');
  } finally {
    host.restore();
  }
});

test('title attract remains still when reduced motion is active', () => {
  const host = installAttractHost();
  const fixture = makeFixture({ reducedMotion: true });
  try {
    mainMenuScreen._startIdleAttract({ state: fixture.state, rootEl: fixture.rootEl });
    host.frame(2_000);
    host.frame(22_000);
    assert.equal(fixture.drifting(), false,
      'reduced-motion title route must never start the drift');
  } finally {
    host.restore();
  }
});
