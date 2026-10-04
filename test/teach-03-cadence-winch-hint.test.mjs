import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';

// TEACH-03 — the cadence winch lesson is taught by the first swing whose readCadencePair
// shows a real pump window: live line + technique 'swing' (taut grip, tangential speed
// ≥ the working bar, motion mostly tangential). Once per profile via player.hints.
// A straight tow, slack line, dead payload, or flag-off session never speaks.

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

// A taut payload orbiting purely tangentially at 30 wu/s — a real swing on the
// cadence pair's own read: tangency 1, vt 30, slack 0.
function swingingPayload() {
  return { id: 7, alive: true, mass: 20, pos: { x: 100, z: 0 }, vel: { x: 0, z: 30 } };
}
function towingPayload() {
  return { id: 7, alive: true, mass: 20, pos: { x: 100, z: 0 }, vel: { x: 30, z: 0 } };
}

function drive(payload) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const player = { id: 1, alive: true, mass: 18, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities: new Map([[1, player], ...(payload ? [[7, payload]] : [])]),
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
    onboarding: { active: false, finished: true },
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
    tickOnce() { system.update(0.3, state); },
    setTether(tether) { state.player.tether = tether; },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
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

const TETHER = { active: true, targetId: 7, strain: 0.4, load: 0.2, attachmentId: 'a1', restLength: 100, phase: 'taut' };

test('TEACH-03: the first pump-window swing speaks the winch line once per profile', () => {
  withThrowFlag(() => {
    const h = drive(swingingPayload());
    try {
      h.setTether({ ...TETHER });
      h.tickOnce();
      const shown = h.hints();
      assert.equal(shown.length, 1, 'the first real swing earns exactly one hint');
      assert.equal(shown[0].payload.verbId, 'masslineCadenceWinch');
      assert.match(shown[0].payload.text, /pump/i, 'the line names the pump verb');
      assert.match(shown[0].payload.text, /BOOST/i, 'the line names the boost key');
      assert.equal(shown[0].payload.entityId, 7);
      // Later swings stay silent — once per profile.
      h.tickOnce();
      h.tickOnce();
      assert.equal(h.hints().length, 1, 'the lesson never repeats');
      assert.equal(h.state.player.hints.masslineCadenceWinch, true);
    } finally { h.restore(); }
  });
});

test('TEACH-03: a straight tow, slack line, and dead payload never teach', () => {
  withThrowFlag(() => {
    // Pure radial approach at speed — technique 'radial', not 'swing'.
    const h = drive(towingPayload());
    try {
      h.setTether({ ...TETHER });
      h.tickOnce();
      assert.equal(h.hints().length, 0, 'a radial haul is not a pump window');
    } finally { h.restore(); }

    const slack = drive(swingingPayload());
    try {
      slack.setTether({ ...TETHER, restLength: 140, phase: 'slack' }); // 40 wu of slack
      slack.tickOnce();
      assert.equal(slack.hints().length, 0, 'a slack line cannot pump');
      assert.equal(slack.state.player.hints.masslineCadenceWinch, undefined);
    } finally { slack.restore(); }

    const dead = drive({ ...swingingPayload(), alive: false });
    try {
      dead.setTether({ ...TETHER });
      dead.tickOnce();
      assert.equal(dead.hints().length, 0, 'a lost payload teaches nothing');
    } finally { dead.restore(); }

    const idle = drive(swingingPayload());
    try {
      idle.setTether({ ...TETHER, active: false }); // no live line at all
      idle.tickOnce();
      assert.equal(idle.hints().length, 0, 'no live line, no lesson');
    } finally { idle.restore(); }
  });
});

test('TEACH-03: flag-off sessions and an already-taught profile stay silent', () => {
  const h = drive(swingingPayload());
  try {
    h.setTether({ ...TETHER });
    h.tickOnce();
    assert.equal(h.hints().length, 0, 'flag off — nothing spoken');
  } finally { h.restore(); }

  withThrowFlag(() => {
    const taught = drive(swingingPayload());
    try {
      taught.state.player.hints.masslineCadenceWinch = true; // learned on a previous save
      taught.setTether({ ...TETHER });
      taught.tickOnce();
      assert.equal(taught.hints().length, 0, 'a profile that already learned never relearns');
    } finally { taught.restore(); }
  });
});
