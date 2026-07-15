import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createBoardingPhaseFence, createFadeLeaseController } from '../src/ui/uiRoot.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : !!force;
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

function createHarness() {
  const frames = [];
  const timers = new Map();
  let timerId = 0;
  const element = {
    hidden: true,
    style: {},
    attributes: new Map([['aria-hidden', 'true']]),
    classList: new FakeClassList(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const controller = createFadeLeaseController(element, {
    requestFrame(fn) { frames.push(fn); },
    setDelay(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearDelay(id) { timers.delete(id); },
  });
  return {
    controller,
    element,
    flushFrames() { while (frames.length) frames.shift()(); },
    flushTimers() {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
  };
}

test('K1 UI blackout leases cannot hide a concurrent dock or drill transition', () => {
  const h = createHarness();
  h.controller.acquire('dock');
  h.flushFrames();
  assert.equal(h.element.hidden, false);
  assert.equal(h.element.classList.contains('active'), true);

  h.controller.acquire('dock');
  h.controller.release('dock');
  h.flushFrames();
  h.flushTimers();
  assert.equal(h.element.hidden, false, 'One overlapping dock lease must survive the first dock release');

  h.controller.set('fulfillment', true);
  h.controller.set('fulfillment', true);
  h.flushFrames();
  assert.equal(h.element.classList.contains('sf-administrative-blackout'), true);

  h.controller.release('dock');
  h.flushFrames();
  h.flushTimers();
  assert.equal(h.element.hidden, false, 'Fulfillment must retain the overlay after docking releases it');
  assert.equal(h.element.classList.contains('active'), true);

  h.controller.acquire('drill');
  h.controller.set('fulfillment', false);
  h.flushFrames();
  h.flushTimers();
  assert.equal(h.element.hidden, false, 'Drill must retain the overlay after Fulfillment releases it');
  assert.equal(h.element.classList.contains('sf-administrative-blackout'), false);

  h.controller.release('drill');
  assert.equal(h.element.style.pointerEvents, 'none', 'pointer/touch resume with keyboard and gamepad at fade-out start');
  assert.equal(h.element.hidden, false, 'the visual fade may finish after the input fence releases');
  h.flushTimers();
  assert.equal(h.element.hidden, true);
  assert.equal(h.element.attributes.get('aria-hidden'), 'true');
  assert.equal(h.element.style.pointerEvents, 'none');

  h.controller.destroy();
  h.controller.acquire('dock');
  h.flushFrames();
  assert.equal(h.element.hidden, true, 'destroyed overlays cannot be resurrected by late callbacks');
});

test('K1 Fulfillment boarding events own and tear down the transient input fence', () => {
  const bus = createBus();
  const state = { ui: {} };
  const transitions = [];
  const fence = createBoardingPhaseFence(state, bus, (transition) => transitions.push(transition));

  bus.emit('factionPresence:boardingPhase', { phase: 'blackout', boardingId: 'b1' });
  assert.equal(state.ui.fulfillmentBlackoutActive, true);
  bus.emit('factionPresence:boardingPhase', { phase: 'transit', boardingId: 'b1' });
  assert.equal(transitions.at(-1).wasActive, true, 'active phase transitions remain idempotent');
  fence.sync({ phase: 'wake_pending', boardingId: 'b1' });
  assert.equal(fence.isActive(), true);
  bus.emit('factionPresence:boardingPhase', { phase: 'complete', boardingId: 'b1' });
  assert.equal(state.ui.fulfillmentBlackoutActive, false);

  fence.destroy();
  bus.emit('factionPresence:boardingPhase', { phase: 'blackout', boardingId: 'late' });
  assert.equal(state.ui.fulfillmentBlackoutActive, false, 'destroy unsubscribes late boarding events');
});

test('K1 Fulfillment boarding fence rehydrates an in-flight incident before the next event', () => {
  const bus = createBus();
  const state = {
    ui: {},
    factionPresence: { boarding: { phase: 'transit', boardingId: 'resume-b1' } },
  };
  const transitions = [];
  const fence = createBoardingPhaseFence(state, bus, (transition) => transitions.push(transition));

  fence.sync(state.factionPresence.boarding);
  assert.equal(fence.isActive(), true);
  assert.equal(state.ui.fulfillmentBlackoutActive, true);
  assert.equal(transitions.at(-1).phase, 'transit');

  fence.destroy();
  assert.equal(state.ui.fulfillmentBlackoutActive, false);
});

test('K1 Fulfillment boarding presentation is opaque, accessible, and lifecycle-owned', () => {
  const source = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  assert.match(source, /FULFILLMENT_BLACKOUT_PHASES\s*=\s*new Set\(\['blackout', 'transit', 'wake_pending'\]\)/);
  assert.match(source, /_fulfillmentBlackoutActive[\s\S]*externalModalOpen/);
  assert.match(source, /syncHudAccessibility\(screenOpen \|\| externalOpen/);
  assert.match(source, /_fulfillmentBlackoutTeardown/);
  assert.match(source, /aria-live', 'assertive'/);
  assert.match(source, /#sf-dock-overlay\.sf-administrative-blackout\s*\{\s*background:#05070d;/);

  const screenManagerSource = readFileSync(new URL('../src/ui/screenManager.js', import.meta.url), 'utf8');
  assert.match(screenManagerSource, /modalOpen\s*=\s*open\s*\|\|\s*state\.ui\.docked\s*===\s*true[\s\S]*fulfillmentBlackoutActive\s*===\s*true/,
    'ScreenManager init/re-init reconciliation must preserve external blackout semantics');

  const focusSnapshot = source.indexOf('blackoutPreviousFocus = document.activeElement');
  const overlayMutation = source.indexOf("dockFadeLeases.set('fulfillment', active)");
  const modalMutation = source.indexOf('syncModalChrome(screenOpen, externalOpen)', overlayMutation);
  assert.ok(focusSnapshot >= 0 && focusSnapshot < overlayMutation && focusSnapshot < modalMutation,
    'focus must be captured before overlay/body/HUD accessibility mutations');

  const lifecycleOwner = source.indexOf('this._fulfillmentBlackoutTeardown = teardownFulfillmentBlackout');
  const immediateRehydrate = source.indexOf('boardingFence.sync(this.state && this.state.factionPresence');
  assert.ok(lifecycleOwner >= 0 && lifecycleOwner < immediateRehydrate,
    're-init must own teardown before immediately rehydrating an active incident');
});
