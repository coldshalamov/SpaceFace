import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';
import { resolveActionLabel } from '../src/systems/input.js';

// TEACH-04 — fitting the transverse snare head speaks its deploy verb once, naming the
// player's live bound latch key. The head is inert until it is asked to lay the line,
// so the lesson is earned by the fit itself — and a second fit, a different module, or
// a flag-off session never spends or repeats it.

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
    entities: new Map([[1, { id: 1, alive: true }]]),
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
    events, system, state,
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    equip(defId) {
      (handlers.get('module:equipped') || []).forEach((fn) => fn({ shipId: 1, slotIndex: 5, defId }));
    },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
  };
}

function withSnareFlag(fn) {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.masslineHeadTransverseSnare;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.masslineHeadTransverseSnare = true;
  try {
    return fn();
  } finally {
    MASSLINE2_FLAGS.masslineHeadTransverseSnare = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
}

test('TEACH-04: fitting the snare head speaks the deploy verb once, naming the bound key', () => {
  withSnareFlag(() => {
    const h = drive();
    try {
      h.equip('mod_transverse_snare_m');
      const shown = h.hints();
      assert.equal(shown.length, 1, 'the first fit earns exactly one hint');
      const key = resolveActionLabel(h.state, 'tether', { empty: 'LATCH' });
      assert.ok(shown[0].payload.text.includes(key),
        `the line names the player's own deploy key (${key})`);
      assert.match(shown[0].payload.text, /snare/i);
      h.equip('mod_transverse_snare_m');
      assert.equal(h.hints().length, 1, 'a refit never repeats — once per profile');
      assert.equal(h.state.player.hints.masslineSnareHead, true);
    } finally { h.restore(); }
  });
});

test('TEACH-04: another module, and no fit at all, never speak the snare verb', () => {
  withSnareFlag(() => {
    const h = drive();
    try {
      h.equip('mod_cargo_scanner_s');
      assert.equal(h.hints().length, 0, 'an ordinary module stays silent');
      assert.equal(h.state.player.hints.masslineSnareHead, undefined, 'the flag is unspent');
      // The lesson still lands when the real head is fitted later — nothing was consumed.
      h.equip('mod_transverse_snare_m');
      assert.equal(h.hints().length, 1);
      assert.equal(h.hints()[0].payload.verbId, 'masslineSnareHead');
    } finally { h.restore(); }
  });
});

test('TEACH-04: flag-off sessions never see the line; a rebind names the new key', () => {
  const off = drive();
  try {
    off.equip('mod_transverse_snare_m');
    assert.equal(off.hints().length, 0, 'flag off — nothing spoken');
  } finally { off.restore(); }

  withSnareFlag(() => {
    const h = drive();
    try {
      h.state.settings = { controls: { bindings: { tether: ['KeyG'] } } };
      h.equip('mod_transverse_snare_m');
      assert.equal(h.hints().length, 1);
      assert.ok(h.hints()[0].payload.text.includes('G'), 'a rebound latch key is the one named');
    } finally { h.restore(); }
  });
});
