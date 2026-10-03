import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';
import { DROP_KICK_CRUISE_SPEED } from '../src/systems/jettisonImpulse.js';

// TEACH-01 — 'Dump aft to push' is the drop-kick lesson: it is earned by jettisoning at
// cruise speed, once per profile. A parked dump teaches nothing and must not spend the
// flag; a second at-speed dump never repeats the line. Harness shape mirrors
// inf-062-latch-denial-hint.test.mjs.

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
  contains(value) { return this.values.has(value); }
}
class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.className = '';
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement(this, 'head'); this.body = new FakeElement(this, 'body'); }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

function drive(playerSpeed = 0) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities: new Map([[1, { id: 1, alive: true, vel: { x: playerSpeed, z: 0 } }]]),
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
  };
  const bus = {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return {
    handlers, events, system, state,
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    jettison() {
      (handlers.get('cargo:jettisoned') || []).forEach((fn) => fn({ commodityId: 'cmdty_ore_iron', amount: 3 }));
    },
    setSpeed(v) { state.entities.get(1).vel.x = v; },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
  };
}

function withJettisonFlag(fn) {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.jettisonImpulse;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.jettisonImpulse = true;
  try {
    return fn();
  } finally {
    MASSLINE2_FLAGS.jettisonImpulse = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
}

test('TEACH-01: jettisoning above the drop-kick bar speaks the line once per profile', () => {
  withJettisonFlag(() => {
    const h = drive(DROP_KICK_CRUISE_SPEED);
    try {
      h.jettison();
      const shown = h.hints();
      assert.equal(shown.length, 1, 'the first at-speed dump earns exactly one hint');
      assert.equal(shown[0].payload.verbId, 'masslineJettisonImpulse');
      assert.match(shown[0].payload.text, /Dump aft to push/i);
      h.jettison();
      h.jettison();
      assert.equal(h.hints().length, 1, 'once per profile — later dumps stay silent');
      assert.equal(h.state.player.hints.masslineJettisonImpulse, true, 'the profile flag persists');
    } finally { h.restore(); }
  });
});

test('TEACH-01: a parked dump teaches nothing and does not spend the flag', () => {
  withJettisonFlag(() => {
    const h = drive(0);
    try {
      h.jettison();
      assert.equal(h.hints().length, 0, 'no hint at rest');
      assert.equal(h.state.player.hints.masslineJettisonImpulse, undefined, 'the flag is unspent');
      // Just under the bar is still not the drop-kick.
      h.setSpeed(DROP_KICK_CRUISE_SPEED - 1);
      h.jettison();
      assert.equal(h.hints().length, 0, 'below cruise is still not the lesson');
      // When the pilot actually reaches cruise the lesson lands — the earlier dumps
      // did not silently consume it.
      h.setSpeed(DROP_KICK_CRUISE_SPEED + 40);
      h.jettison();
      assert.equal(h.hints().length, 1, 'the first real drop-kick still earns the line');
      assert.equal(h.hints()[0].payload.verbId, 'masslineJettisonImpulse');
    } finally { h.restore(); }
  });
});

test('TEACH-01: the kick impulse itself is untouched — flag-off emits nothing', () => {
  const h = drive(DROP_KICK_CRUISE_SPEED + 10);
  try {
    h.jettison();
    assert.equal(h.hints().length, 0, 'flag-off sessions never see the line');
  } finally { h.restore(); }
});
