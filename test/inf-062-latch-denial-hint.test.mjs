import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';

// INF-062 — the latch lesson is taught by repeated genuine failure, not by interrupting
// competent play. Three consecutive latch denials earn ONE contextual hint naming the
// block; any clean latch resets the streak; player.hints keeps it once-only.

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

function drive() {
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
    entities: new Map(),
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
    handlers, events, system,
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    denied(reason = 'no-target') {
      (handlers.get('tether:latchDenied') || []).forEach((fn) => fn({ reason }));
    },
    latched() {
      (handlers.get('tether:latched') || []).forEach((fn) => fn({ targetId: 7 }));
    },
    hints() {
      return events.filter((e) => e.event === 'hud:firstUse');
    },
  };
}

function withThrowFlag(fn) {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;
  try {
    return fn();
  } finally {
    MASSLINE2_FLAGS.throw = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
}

test('INF-062: competent play is never interrupted', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.latched();
      h.latched();
      assert.equal(h.hints().length, 0, 'clean latches teach nothing and interrupt nothing');
    } finally { h.restore(); }
  });
});

test('INF-062: three straight denials earn one contextual hint naming the block', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.denied('no-target');
      h.denied('no-target');
      assert.equal(h.hints().length, 0, 'one or two failures are still the player\'s business');
      h.denied('no-target');
      const shown = h.hints();
      assert.equal(shown.length, 1, 'the third consecutive denial earns exactly one hint');
      assert.match(shown[0].payload.text, /Target .* first/i, 'the line names the targeting block');
      h.denied('no-target');
      h.denied('no-target');
      assert.equal(h.hints().length, 1, 'once-only: further failure never repeats it');
    } finally { h.restore(); }
  });
});

test('INF-062: the line follows the denial reason', () => {
  withThrowFlag(() => {
    const cooldown = drive();
    try {
      cooldown.denied('cooldown');
      cooldown.denied('cooldown');
      cooldown.denied('cooldown');
      const shown = cooldown.hints();
      assert.equal(shown.length, 1);
      assert.match(shown[0].payload.text, /resetting|wait/i);
    } finally { cooldown.restore(); }
    const other = drive();
    try {
      other.denied('owner_attachment_limit');
      other.denied('owner_attachment_limit');
      other.denied('owner_attachment_limit');
      const shown = other.hints();
      assert.equal(shown.length, 1);
      assert.match(shown[0].payload.text, /range/i, 'unknown blocks fall back to the range line');
    } finally { other.restore(); }
  });
});

test('INF-062: a clean latch resets the streak — success suppresses the lesson', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.denied('no-target');
      h.denied('no-target');
      h.latched();
      h.denied('no-target');
      h.denied('no-target');
      assert.equal(h.hints().length, 0, 'the intervening success wiped the streak');
      h.denied('no-target');
      assert.equal(h.hints().length, 1, 'a fresh streak of three still earns the hint');
    } finally { h.restore(); }
  });
});

test('INF-062: flag-off sessions never see the hint', () => {
  const previous = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.throw = false;
  const h = drive();
  try {
    h.denied('no-target');
    h.denied('no-target');
    h.denied('no-target');
    assert.equal(h.hints().length, 0);
  } finally {
    h.restore();
    MASSLINE2_FLAGS.throw = previous;
  }
});
