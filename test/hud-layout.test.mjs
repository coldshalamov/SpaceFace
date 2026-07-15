import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { createHudDragController, readHudLayout } from '../src/ui/hudLayout.js';

test('Ctrl-drag stores a bounded, save-serializable placement and restores it on save load', () => {
  const documentRef = new FakeTarget();
  const element = new FakeElement({ left: 20, top: 500, width: 320, height: 84 });
  const state = { settings: {} };
  const bus = createBus();
  const changes = [];
  bus.on('hud:layoutChanged', (payload) => changes.push(payload));
  const drag = createHudDragController({
    state, bus, element, key: 'objective', documentRef, windowRef: { innerWidth: 800, innerHeight: 600 },
  });

  element.dispatchEvent(pointer('pointerdown', 40, 520, { ctrlKey: true, pointerId: 7 }));
  documentRef.dispatchEvent(pointer('pointermove', 500, 400, { pointerId: 7 }));
  documentRef.dispatchEvent(pointer('pointerup', 500, 400, { pointerId: 7 }));

  assert.deepEqual(readHudLayout(state, 'objective'), { x: 468, y: 380 });
  assert.deepEqual(JSON.parse(JSON.stringify(state.settings.ui.hudLayout)), {
    objective: { x: 468, y: 380 },
  }, 'placement lives in saved settings, not transient DOM state');
  assert.deepEqual(changes, [{ key: 'objective', placement: { x: 468, y: 380 } }]);
  assert.equal(element.style.position, 'fixed');
  assert.equal(element.style.left, '468px');
  assert.equal(element.style.top, '380px');

  state.settings.ui.hudLayout.objective = { x: 40, y: 36 };
  bus.emit('save:loaded', {});
  assert.equal(element.style.left, '40px');
  assert.equal(element.style.top, '36px');
  drag.destroy();
});

test('HUD placement survives the normal settings save and prompts an autosave', () => {
  const state = {
    mode: 'flight',
    settings: {
      gameplay: { autosaveIntervalS: 120 },
      ui: { hudLayout: { band: { x: 514, y: 196 } } },
    },
  };
  const savedSettings = save._serializeSettings.call({ state });
  const restored = { settings: { gameplay: {}, controls: {} } };
  save._restoreSettings.call({
    state: restored,
    _readProfileSettings: () => null,
  }, savedSettings);
  assert.deepEqual(restored.settings.ui.hudLayout.band, { x: 514, y: 196 });

  const bus = createBus();
  const reasons = [];
  save.init.call({
    state,
    bus,
    helpers: {},
    registry: {},
    _loadProfileSettings() {},
    requestAutosave(reason) { reasons.push(reason); },
  }, { state, bus, helpers: {}, registry: {} });
  bus.emit('hud:layoutChanged', { key: 'band', placement: { x: 514, y: 196 } });
  assert.deepEqual(reasons, ['hud_layout']);
});

class FakeTarget {
  constructor() { this.listeners = new Map(); this.documentElement = { clientWidth: 800, clientHeight: 600 }; }
  addEventListener(name, fn) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(fn);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) || []) listener(event); }
}

class FakeElement extends FakeTarget {
  constructor(rect) {
    super();
    this.rect = rect;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new FakeClassList();
  }
  getBoundingClientRect() { return this.rect; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...tokens) { tokens.forEach((token) => this.values.add(token)); }
  remove(...tokens) { tokens.forEach((token) => this.values.delete(token)); }
}

function pointer(type, clientX, clientY, extra = {}) {
  return {
    type, button: 0, clientX, clientY, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  };
}
