import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createUiInput, isUiInteractionFenced } from '../src/ui/input.js';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = false) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({
      fn,
      capture: options === true || Boolean(options && options.capture),
      passive: options && typeof options === 'object' ? options.passive : undefined,
    });
  }
  removeEventListener(type, fn, options = false) {
    const capture = options === true || Boolean(options && options.capture);
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((row) => row.fn !== fn || row.capture !== capture));
  }
  dispatch(type, event) {
    const listeners = [...(this.listeners.get(type) || [])]
      .sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const row of listeners) {
      row.fn(event);
      if (event.immediateStopped) break;
    }
  }
}

function keyEvent(key, code = key) {
  return {
    key,
    code,
    target: null,
    shiftKey: false,
    prevented: false,
    immediateStopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.immediateStopped = true; },
  };
}

function pointerEvent() {
  return {
    prevented: false,
    immediateStopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.immediateStopped = true; },
  };
}

test('K1 Fulfillment blackout fences keyboard, touch, and gamepad UI intents without pausing sim state', () => {
  const priorDocument = globalThis.document;
  const priorWindow = globalThis.window;
  const documentTarget = new FakeEventTarget();
  documentTarget.body = {};
  documentTarget.activeElement = documentTarget.body;
  documentTarget.documentElement = { classList: { add() {}, remove() {} } };
  const windowTarget = new FakeEventTarget();
  globalThis.document = documentTarget;
  globalThis.window = windowTarget;

  const bus = createBus();
  const opened = [];
  const screenManager = {
    isOpen: () => opened.length > 0,
    pushScreen: (id) => opened.push(id),
    popScreen: () => opened.pop(),
    top: () => opened.at(-1) || null,
    getActiveScreenDef: () => null,
  };
  const state = {
    mode: 'flight',
    timeScale: 1,
    ui: { docked: false, fulfillmentBlackoutActive: true },
    settings: { controls: { gamepad: { enabled: true } } },
  };
  const gamepad = {
    axes: { leftX: 0, leftY: 0 },
    actions: { pause: { pressed: true } },
    isConnected: () => true,
  };
  let quickLoads = 0;
  let simSteps = 0;
  let cameraZooms = 0;
  let dockIntents = 0;
  let underlyingTabMoves = 0;
  let underlyingPointerEvents = 0;
  let underlyingContextMenus = 0;
  let underlyingWheels = 0;
  // ScreenManager installs its document key trap before createUiInput.
  documentTarget.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') underlyingTabMoves += 1;
  });
  documentTarget.addEventListener('pointerdown', () => { underlyingPointerEvents += 1; });
  documentTarget.addEventListener('click', () => { underlyingPointerEvents += 1; });
  documentTarget.addEventListener('contextmenu', () => { underlyingContextMenus += 1; });
  documentTarget.addEventListener('wheel', () => { underlyingWheels += 1; });
  bus.on('game:load', () => { quickLoads += 1; });
  bus.on('camera:zoom', () => { cameraZooms += 1; });
  bus.on('dock:docked', () => { dockIntents += 1; });

  let input;
  try {
    input = createUiInput({ state, bus, gamepad }, screenManager);
    assert.equal(
      windowTarget.listeners.get('wheel').some((row) => row.passive === false),
      true,
      'the global wheel bridge must be non-passive so browser pinch zoom can be cancelled',
    );
    bus.emit('dock:range', { stationId: 'fulfillment-route-office', inRange: true });
    assert.equal(isUiInteractionFenced(state), true);

    const tabKey = keyEvent('Tab', 'Tab');
    documentTarget.dispatch('keydown', tabKey);
    const pauseKey = keyEvent('P', 'KeyP');
    documentTarget.dispatch('keydown', pauseKey);
    const loadKey = keyEvent('F9', 'F9');
    documentTarget.dispatch('keydown', loadKey);
    bus.emit('touch:uiAction', { action: 'pause' });
    bus.emit('touch:uiAction', { action: 'dock' });
    const pointerDown = pointerEvent();
    const click = pointerEvent();
    const contextMenu = pointerEvent();
    const wheelFence = pointerEvent();
    wheelFence.deltaY = 100;
    documentTarget.dispatch('pointerdown', pointerDown);
    documentTarget.dispatch('click', click);
    documentTarget.dispatch('contextmenu', contextMenu);
    documentTarget.dispatch('wheel', wheelFence);
    windowTarget.dispatch('wheel', { deltaY: 100, preventDefault() {} });
    input.tick(1 / 60);
    simSteps += 1; // the fence owns commands, not deterministic simulation time.

    assert.equal(tabKey.prevented, true);
    assert.equal(tabKey.immediateStopped, true);
    assert.equal(underlyingTabMoves, 0, 'capture fence stops the underlying screen key trap');
    assert.equal(pauseKey.prevented, true);
    assert.equal(loadKey.prevented, true);
    assert.deepEqual(opened, []);
    assert.equal(quickLoads, 0);
    assert.equal(cameraZooms, 0);
    assert.equal(dockIntents, 0);
    assert.equal(underlyingPointerEvents, 0);
    assert.equal(underlyingContextMenus, 0);
    assert.equal(underlyingWheels, 0);
    for (const event of [pointerDown, click, contextMenu, wheelFence]) {
      assert.equal(event.prevented, true);
      assert.equal(event.immediateStopped, true);
    }
    assert.equal(simSteps, 1);
    assert.equal(state.timeScale, 1);

    state.ui.fulfillmentBlackoutActive = false;
    assert.equal(isUiInteractionFenced(state), false);
    documentTarget.dispatch('pointerdown', pointerEvent());
    documentTarget.dispatch('click', pointerEvent());
    documentTarget.dispatch('contextmenu', pointerEvent());
    const resumedWheel = pointerEvent();
    resumedWheel.deltaY = 100;
    resumedWheel.ctrlKey = true;
    documentTarget.dispatch('wheel', resumedWheel);
    windowTarget.dispatch('wheel', resumedWheel);
    bus.emit('touch:uiAction', { action: 'dock' });
    assert.equal(underlyingPointerEvents, 2, 'pointer/click handlers resume when the fence clears');
    assert.equal(underlyingContextMenus, 1, 'context-menu handlers resume when the fence clears');
    assert.equal(underlyingWheels, 1, 'global wheel handlers resume when the fence clears');
    assert.equal(cameraZooms, 1, 'camera zoom resumes when the wake phase releases the fence');
    assert.equal(resumedWheel.prevented, true, 'trackpad pinch must not fall through to browser page zoom');
    assert.equal(dockIntents, 1, 'docking resumes when the wake phase releases the fence');
    bus.emit('touch:uiAction', { action: 'pause' });
    assert.deepEqual(opened, ['pause'], 'touch UI resumes when the wake phase releases the fence');
    opened.length = 0;

    const resumedLoad = keyEvent('F9', 'F9');
    documentTarget.dispatch('keydown', resumedLoad);
    assert.equal(quickLoads, 1, 'keyboard UI resumes when the fence clears');

    input.tick(1 / 60);
    assert.deepEqual(opened, ['pause'], 'gamepad UI resumes when the fence clears');
  } finally {
    if (input) input.dispose();
    globalThis.document = priorDocument;
    globalThis.window = priorWindow;
  }
});
