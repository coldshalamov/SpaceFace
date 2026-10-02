// PRO-09 — the floor voice pill can be dismissed with a key, which the arbiter already listens
// for. The listener existed; nothing emitted `voice:dismiss`. A registered Delete binding now
// asks, and the arbiter decides what may be cleared — never a critical squelch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createUiInput } from '../src/ui/input.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { voiceArbiter, DANGER_PRIORITY } from '../src/ui/voiceArbiter.js';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = false) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, capture: options === true || Boolean(options && options.capture) });
  }
  removeEventListener(type, fn, options = false) {
    const capture = options === true || Boolean(options && options.capture);
    const ls = this.listeners.get(type) || [];
    this.listeners.set(type, ls.filter((row) => row.fn !== fn || row.capture !== capture));
  }
  dispatch(type, event) {
    const ls = [...(this.listeners.get(type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const row of ls) {
      row.fn(event);
      if (event.immediateStopped) break;
    }
  }
}

function keyEvent(key, code = key) {
  return {
    key, code, target: null, shiftKey: false,
    prevented: false, immediateStopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.immediateStopped = true; },
  };
}

function boot() {
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
  const state = { mode: 'flight', simTime: 10, ui: { docked: false }, settings: {} };
  const helpers = {};
  const screenManager = {
    isOpen: () => false,
    pushScreen() {}, popScreen() {}, top: () => null,
    getActiveScreenDef: () => null,
  };
  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  const input = createUiInput({ state, bus, gamepad: null }, screenManager);
  return {
    bus, state, helpers, documentTarget, input,
    restore() {
      input.destroy && input.destroy();
      globalThis.document = priorDocument;
      globalThis.window = priorWindow;
    },
  };
}

test('the registered Delete binding emits voice:dismiss and the pill clears once', () => {
  const t = boot();
  try {
    const dismissals = [];
    const surfaces = [];
    const clears = [];
    t.bus.on('voice:dismiss', (p) => dismissals.push(p));
    t.bus.on('voice:surface', (p) => surfaces.push(p.text));
    t.bus.on('voice:clear', (p) => clears.push(p.id));

    t.helpers.voice.say({ channel: 'news', text: 'Ore prices moved.', ttl: 30, id: 'n1' });
    voiceArbiter.update(0, t.state);
    assert.deepEqual(surfaces, ['Ore prices moved.']);
    assert.ok(voiceArbiter.queue.active, 'the pill holds the floor');

    const ev = keyEvent('Delete', 'Delete');
    t.documentTarget.dispatch('keydown', ev);
    assert.equal(ev.prevented, true, 'the binding owns the key');
    assert.equal(dismissals.length, 1, 'exactly one voice:dismiss is emitted per press');
    assert.equal(voiceArbiter.queue.active, null, 'the pill is cleared');
    assert.ok(clears.includes('n1'), 'the presenter hears the clear');
  } finally {
    t.restore();
  }
});

test('a critical squelch line is not dismissable', () => {
  const t = boot();
  try {
    t.helpers.voice.say({ channel: 'alert', text: 'HULL BREACH', ttl: 30, id: 'd1', priority: DANGER_PRIORITY });
    voiceArbiter.update(0, t.state);
    assert.equal(voiceArbiter.queue.active.text, 'HULL BREACH');

    t.bus.emit('voice:dismiss', { source: 'keyboard' });
    assert.equal(voiceArbiter.queue.active.text, 'HULL BREACH', 'danger holds the floor');
  } finally {
    t.restore();
  }
});

test('the binding is registered and resolvable for prompts', () => {
  assert.ok(BINDINGS.dismissVoice, 'dismissVoice must be a registered binding');
  assert.equal(BINDINGS.dismissVoice.code, 'Delete');
});
