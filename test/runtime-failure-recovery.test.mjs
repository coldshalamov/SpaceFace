import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOP_FIXED_DT, startLoop, createSimulationRunner } from '../src/core/loop.js';
import { createRuntimeFailurePresenter } from '../src/ui/runtimeFailurePresenter.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function createRaf() {
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      pending.delete(id);
    },
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one presentation callback');
      pending.delete(entry[0]);
      entry[1](now);
    },
    count: () => pending.size,
  };
}

function silenceConsoleError(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
}

function createFlightState() {
  return {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: { actions: {} },
    settings: { video: {} },
  };
}

test('a quarantined simulation step notifies once, stops scheduling, and keeps the cause', () => {
  const raf = createRaf();
  const state = createFlightState();
  let steps = 0;
  let draws = 0;
  const failures = [];
  const registry = {
    step() {
      steps++;
      state.tick++;
      throw new Error('fault-injection: broken component');
    },
    renderUpdate() { draws++; },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
    onSimulationFailure(failure) { failures.push(failure); },
  });

  silenceConsoleError(() => {
    raf.flushOne(1000 + 40);
  });

  assert.equal(steps, 1, 'the quarantined tick must never be advanced a second time');
  assert.equal(draws, 0, 'a frame whose simulation was corrupted must never present');
  assert.equal(raf.count(), 0, 'no further frame may be scheduled after quarantine');
  assert.equal(failures.length, 1, 'the failure hook fires exactly once');
  const failure = failures[0];
  assert.equal(Object.isFrozen(failure), true);
  assert.equal(failure.message, 'fault-injection: broken component');
  assert.equal(failure.site, controller.simulationRunner.getDiagnostics().closeCauseSite);
  assert.equal(failure.tick, 1);
  assert.equal(failure.simTime, 0);

  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.simulationFailureNotified, true);
  assert.equal(diagnostics.simulationFailure, failure);
  assert.equal(diagnostics.destroyed, true);
  assert.equal(diagnostics.stopCount, 1);
  assert.equal(diagnostics.frameErrorCount, 1);
  assert.equal(diagnostics.lastFrameError, 'fault-injection: broken component',
    'the recorded cause is the original step error, not "SimulationRunner is closed"');
  assert.equal(diagnostics.simulation.closed, true);
  assert.equal(diagnostics.simulation.closeCauseMessage, 'fault-injection: broken component');
});

test('a throwing failure hook cannot resurrect the loop or replace the recorded cause', () => {
  const raf = createRaf();
  const state = createFlightState();
  let steps = 0;
  let hookCalls = 0;
  const registry = {
    step() {
      steps++;
      state.tick++;
      throw new Error('fault-injection: broken component');
    },
    renderUpdate() {},
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
    onSimulationFailure() {
      hookCalls++;
      throw new Error('recovery hook exploded');
    },
  });

  silenceConsoleError(() => {
    raf.flushOne(1000 + 40);
  });

  assert.equal(hookCalls, 1);
  assert.equal(steps, 1);
  assert.equal(raf.count(), 0);
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.destroyed, true);
  assert.equal(diagnostics.simulationFailureNotified, true);
  assert.equal(diagnostics.simulationFailure.message, 'fault-injection: broken component');
  assert.equal(diagnostics.lastFrameError, 'fault-injection: broken component');
});

test('a manual simulation close without a close cause is teardown, never a fault', () => {
  const raf = createRaf();
  const state = createFlightState();
  const failures = [];
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {},
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
    onSimulationFailure(failure) { failures.push(failure); },
  });

  controller.simulationRunner.close();
  assert.equal(controller.simulationRunner.getDiagnostics().closed, true);
  assert.equal(controller.simulationRunner.getDiagnostics().closeCauseMessage, null);

  silenceConsoleError(() => {
    raf.flushOne(1000 + 40);
  });

  assert.equal(failures.length, 0, 'intentional teardown must not raise the failure hook');
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.simulationFailureNotified, false);
  assert.equal(diagnostics.simulationFailure, null);
  assert.equal(diagnostics.destroyed, false, 'manual sim close alone does not stop presentation');
  controller.destroy();
});

test('recoverable draw exceptions keep rescheduling and never raise the failure hook', () => {
  const raf = createRaf();
  const state = createFlightState();
  let draws = 0;
  const failures = [];
  const registry = {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {
      draws++;
      throw new Error('transient draw failure');
    },
    get() { return null; },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => 1000,
    visibilityTarget: null,
    lifecyclePort: null,
    onSimulationFailure(failure) { failures.push(failure); },
  });

  silenceConsoleError(() => {
    for (let i = 0; i < 3; i++) raf.flushOne(1000 + 20 * (i + 1));
  });

  assert.equal(draws, 3, 'every frame still reaches the draw and is retried');
  assert.equal(raf.count(), 1, 'the loop reschedules after a recoverable draw throw');
  assert.equal(failures.length, 0);
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.simulationFailureNotified, false);
  assert.equal(diagnostics.simulationFailure, null);
  assert.equal(diagnostics.simulation.closed, false);
  assert.equal(diagnostics.frameErrorCount, 3);
  controller.destroy();
});

function enhanceNode(node, focused) {
  node.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(node.attributes, name);
  node.removeAttribute = (name) => { delete node.attributes[name]; };
  node.removeChild = (child) => {
    const index = node.children.indexOf(child);
    if (index >= 0) node.children.splice(index, 1);
    child.parentNode = null;
    return child;
  };
  node.contains = (other) => {
    for (let cur = other; cur; cur = cur.parentNode) {
      if (cur === node) return true;
    }
    return false;
  };
  const matches = (n, selector) => {
    if (selector.startsWith('.')) {
      return n.className.split(/\s+/).includes(selector.slice(1));
    }
    return n.tagName === selector;
  };
  const visit = (n, selector, out) => {
    for (const child of n.children || []) {
      if (matches(child, selector)) out.push(child);
      visit(child, selector, out);
    }
    return out;
  };
  node.querySelector = (selector) => visit(node, selector, [])[0] || null;
  node.querySelectorAll = (selector) => visit(node, selector, []);
  node.focus = () => { focused.push(node); };
  return node;
}

function createBootFixture() {
  const doc = fakeDom();
  const focused = [];
  const make = (tag) => enhanceNode(doc._make(tag), focused);
  doc.createElement = make;
  const host = {
    listeners: [],
    addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); },
    removeEventListener(type, fn) {
      const index = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (index >= 0) this.listeners.splice(index, 1);
    },
    keydown(key, target = null) {
      const event = {
        key,
        target,
        defaultPrevented: false,
        stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; },
      };
      for (const capture of [true, false]) {
        for (const entry of [...this.listeners]) {
          if (event.stopped) return event;
          if (entry.type === 'keydown' && !!entry.capture === capture) entry.fn(event);
        }
      }
      return event;
    },
    location: { reloads: 0, reload() { this.reloads++; } },
  };
  doc.defaultView = host;

  const overlay = make('div');
  overlay.id = 'boot-overlay';
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-busy', 'true');
  const lockup = make('div');
  lockup.className = 'boot-lockup';
  const label = make('span');
  label.textContent = 'Initializing systems…';
  lockup.appendChild(label);
  overlay.appendChild(lockup);
  const hud = make('div');
  hud.id = 'hud';
  const screens = make('div');
  screens.id = 'screens';
  const glCanvas = make('canvas');
  glCanvas.id = 'gl-canvas';
  doc.head.appendChild(hud);
  doc.head.appendChild(screens);
  doc.head.appendChild(overlay);
  doc.head.appendChild(glCanvas);
  return { doc, host, overlay, lockup, hud, screens, glCanvas, focused };
}

function withDocument(doc, fn) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
}

test('the failure pane mounts once over the boot overlay with the authored copy', () => {
  const fixture = createBootFixture();
  let restarts = 0;
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc,
    host: fixture.host,
    onRestart() { restarts++; },
  });

  const shown = withDocument(fixture.doc, () => presenter.show({
    message: 'fault-injection: broken component',
    site: 'at registry.step',
    tick: 12,
    simTime: 4.5,
  }));

  assert.equal(shown, true);
  assert.equal(fixture.overlay.classList.contains('hidden'), false);
  assert.equal(fixture.overlay.style.display, 'flex');
  assert.equal(fixture.overlay.getAttribute('aria-busy'), 'false');
  const panes = findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state'));
  assert.equal(panes.length, 1);
  const pane = panes[0];
  assert.equal(pane.classList.contains('boot-error'), true);
  assert.equal(pane.getAttribute('role'), 'alertdialog');
  assert.equal(pane.getAttribute('aria-modal'), 'true');
  const head = pane.querySelector('.sf-state__head');
  const detail = pane.querySelector('.sf-state__detail');
  assert.equal(head.textContent, 'Flight interrupted');
  assert.equal(detail.textContent,
    'Restart from the main menu to recover. Progress since your last save may be lost.');
  assert.equal(pane.getAttribute('aria-labelledby'), head.id);
  assert.equal(pane.getAttribute('aria-describedby'), detail.id);
  assert.equal(pane.querySelector('.sf-state__word').textContent, 'FLIGHT INTERRUPTED');
  assert.equal(pane.querySelector('.sf-state__fills').textContent,
    'The simulation stopped before another frame could be completed.');
  assert.equal(fixture.focused[0], pane.sfStateVerb,
    'the real restart button takes focus when the pane opens');

  withDocument(fixture.doc, () => presenter.show({ message: 'second fault' }));
  assert.equal(findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state')).length,
    1, 'a repeated show must not stack a second pane');
  assert.equal(restarts, 0, 'showing the pane never navigates on its own');
  presenter.destroy();
});

test('the restart verb fires on click and passes native Enter/Space, nothing else', () => {
  const fixture = createBootFixture();
  let restarts = 0;
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc,
    host: fixture.host,
    onRestart() { restarts++; },
  });
  const order = [];
  fixture.host.addEventListener('keydown', () => order.push('global-capture'), true);
  fixture.host.addEventListener('keydown', () => order.push('global-bubble'), false);
  withDocument(fixture.doc, () => presenter.show({ message: 'fault' }));
  const pane = findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state'))[0];
  const verb = pane.sfStateVerb;

  pane.sfStateVerb.click();
  assert.equal(restarts, 1, 'the verb button activates on click');

  const enter = fixture.host.keydown('Enter', verb);
  assert.equal(enter.defaultPrevented, false, 'native Enter on the button is allowed through');
  assert.equal(enter.stopped, true,
    'allowed native activation still stops propagation to gameplay/save listeners');
  assert.deepEqual(order, ['global-capture'],
    'the earlier capture listener sees the event but no bubble listener ever does');
  const space = fixture.host.keydown(' ', verb);
  assert.equal(space.defaultPrevented, false, 'native Space on the button is allowed through');
  assert.equal(space.stopped, true);

  order.length = 0;
  const f5 = fixture.host.keydown('F5', verb);
  assert.equal(f5.defaultPrevented, true, 'F5 must not reload-and-save during the hold');
  assert.equal(f5.stopped, true);
  const gameplayKey = fixture.host.keydown('s', verb);
  assert.equal(gameplayKey.defaultPrevented, true, 'gameplay/save keys stay blocked');
  assert.equal(gameplayKey.stopped, true);
  const escape = fixture.host.keydown('Escape', verb);
  assert.equal(escape.defaultPrevented, true, 'Escape does not dismiss the safe hold');
  assert.deepEqual(order, ['global-capture', 'global-capture', 'global-capture'],
    'each blocked key stops in the presenter before any bubble listener runs');

  order.length = 0;
  fixture.focused.length = 0;
  const tab = fixture.host.keydown('Tab', verb);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(tab.stopped, true, 'Tab stops propagation after wrapping focus');
  assert.deepEqual(order, ['global-capture']);
  assert.equal(fixture.focused[fixture.focused.length - 1], verb,
    'Tab wraps back onto the one control in the dialog');

  assert.equal(fixture.host.location.reloads, 0, 'no autonavigation happened');
  presenter.destroy();
});

test('an HTML-shaped cause stays inert text and the hold releases cleanly on destroy', () => {
  const fixture = createBootFixture();
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc,
    host: fixture.host,
    onRestart() {},
  });
  withDocument(fixture.doc, () => presenter.show({
    message: '<img src=x onerror=alert(1)><script>alert(2)</script>',
    site: null,
    tick: 1,
    simTime: 0,
  }));

  assert.equal(findAll(fixture.overlay, (n) => n.tagName === 'img').length, 0);
  assert.equal(findAll(fixture.overlay, (n) => n.tagName === 'script').length, 0);
  const pane = findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state'))[0];
  assert.equal(pane.getAttribute('data-failure-message'),
    '<img src=x onerror=alert(1)><script>alert(2)</script>',
    'the cause is stored as text data, never parsed as markup');

  assert.equal(fixture.hud.getAttribute('aria-hidden'), 'true');
  assert.equal(fixture.hud.hasAttribute('inert'), true);
  assert.equal(fixture.screens.getAttribute('aria-hidden'), 'true');
  assert.equal(fixture.glCanvas.getAttribute('aria-hidden'), 'true');
  assert.equal(fixture.lockup.style.display, 'none',
    'the stale boot lockup is hidden while the pane owns the overlay');
  assert.equal(fixture.host.listeners.length, 1);

  presenter.destroy();
  assert.equal(fixture.hud.hasAttribute('inert'), false);
  assert.equal(fixture.hud.getAttribute('aria-hidden'), null);
  assert.equal(fixture.glCanvas.hasAttribute('inert'), false);
  assert.equal(fixture.lockup.style.display, '');
  assert.equal(fixture.overlay.classList.contains('hidden'), true);
  assert.equal(fixture.host.listeners.length, 0, 'the keydown capture is removed on destroy');
  assert.equal(findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state')).length, 0);

  assert.doesNotThrow(() => presenter.destroy(), 'repeated destroy is safe');
  assert.equal(fixture.host.keydown('F5').defaultPrevented, false,
    'after destroy nothing intercepts keys');
});

test('the presenter stays inert when the boot overlay is absent', () => {
  const doc = fakeDom();
  let restarts = 0;
  const presenter = createRuntimeFailurePresenter({
    document: doc,
    host: doc.defaultView,
    onRestart() { restarts++; },
  });
  assert.equal(presenter.show({ message: 'fault' }), false);
  assert.equal(restarts, 0);
  assert.doesNotThrow(() => presenter.destroy());
});
