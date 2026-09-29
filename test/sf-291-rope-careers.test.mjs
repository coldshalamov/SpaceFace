import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';
import { towClassMassFor } from '../src/systems/shipCapabilities.js';

// SF-291 — the same rope proves two careers. The fitting screen grades the fit's tow class
// and swing rating; these tests pin the two once-only beats that connect a MEASURED strain
// to that rating: latching a movable load past the drive's tow class, and whipping a mass
// the same drive could never have towed. Neither hint gates anything — refusal is simply
// never buying the named fit, and the physics that strained is what actually carried the play.

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

// The baseline Hitch honest numbers: drive_reaction_m mainAccel 100 at an operational mass of
// 32 t puts 48 t under way — the same figures shipCapabilities prints on the fitting screen.
const HITCH_DERIVED = Object.freeze({
  propulsion: { mainAccel: 100 },
  operationalMass: 32,
});
const HITCH_TOW_CLASS = towClassMassFor(HITCH_DERIVED); // 48 t — derived, not hardcoded
const HEAVY_HULK_MASS = 220;                            // onboarding raid hulk — a throw, not a tow

function loadSpec(extra = {}) {
  return {
    id: 7,
    type: extra.type || 'wreck',
    alive: true,
    mass: extra.mass != null ? extra.mass : HEAVY_HULK_MASS,
    pos: { x: 0, z: 0 },
    physicsBody: { schemaVersion: 1, radius: 14, mass: extra.mass != null ? extra.mass : HEAVY_HULK_MASS, dynamic: true, material: 'debris' },
    data: {},
  };
}

function drive() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const entities = new Map();
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities,
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
  };
  entities.set(1, {
    id: 1, type: 'ship', alive: true, mass: 32, pos: { x: 0, z: 0 },
    physicsBody: { schemaVersion: 1, radius: 14, mass: 32, dynamic: true, material: 'ship' },
    data: { derived: HITCH_DERIVED },
  });
  const system = Object.create(onboarding);
  system.init({ state, bus: {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) { events.push({ event, payload }); },
  }, helpers: {} });
  return {
    handlers, events, system, entities,
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    addLoad(spec) { entities.set(spec.id, spec); return spec; },
    latch(targetId = 7) {
      (handlers.get('tether:latched') || []).forEach((fn) => fn({ targetId }));
    },
    whip(mass) {
      (handlers.get('tether:whipImpact') || []).forEach((fn) => fn({ mass, relSpeed: 60 }));
    },
    hints(verbId = null) {
      const all = events.filter((e) => e.event === 'hud:firstUse');
      return verbId == null ? all : all.filter((e) => e.payload && e.payload.verbId === verbId);
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

test('SF-291 tow career: latching a load past the drive class earns one honest tradeoff beat', () => {
  assert.ok(HITCH_TOW_CLASS > 0 && HEAVY_HULK_MASS > HITCH_TOW_CLASS,
    `fixture honesty: ${HEAVY_HULK_MASS}t must out-rate the baseline ${HITCH_TOW_CLASS}t class`);
  const h = drive();
  try {
    h.addLoad(loadSpec({ mass: HEAVY_HULK_MASS }));
    h.latch(7);
    const shown = h.hints('masslineTowClass');
    assert.equal(shown.length, 1, 'a past-rating tow load earns exactly one tradeoff line');
    assert.match(shown[0].payload.text, /tow rating/i, 'the line names the rating it measured');
    h.latch(7);
    assert.equal(h.hints('masslineTowClass').length, 1, 'once-only: the second heavy latch stays quiet');
  } finally { h.restore(); }
});

test('SF-291 tow career: a load inside the class teaches nothing', () => {
  const h = drive();
  try {
    h.addLoad(loadSpec({ mass: 40 }));
    assert.ok(40 <= HITCH_TOW_CLASS, 'fixture honesty: the light load is inside the baseline class');
    h.latch(7);
    assert.equal(h.hints('masslineTowClass').length, 0, 'an ordinary tow is the player\'s business');
  } finally { h.restore(); }
});

test('SF-291 tow career: an anchored endpoint is a hitch, never a tow strain', () => {
  const h = drive();
  try {
    // Station-scale mass on a fixed anchor: latching it rides the hull, it does not tow.
    h.addLoad({ id: 9, type: 'station', alive: true, mass: 9000, pos: { x: 0, z: 0 },
      physicsBody: { schemaVersion: 1, radius: 60, mass: 9000, dynamic: false, material: 'station' }, data: {} });
    h.latch(9);
    assert.equal(h.hints('masslineTowClass').length, 0, 'a fixed anchor is not a tow load');
  } finally { h.restore(); }
});

test('SF-291 tow career: a hitchable hull is a ride, not a tow strain — no double lesson', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      // A passive hitchable Mule is 55 t — past the Hitch's tow class. Latching it is a ride
      // (the hitch hint's lesson), and the tow line must not double-fire on the same latch.
      h.addLoad({ id: 11, type: 'ship', alive: true, team: 2, mass: 55, pos: { x: 0, z: 0 },
        physicsBody: { schemaVersion: 1, radius: 16, mass: 55, dynamic: true, material: 'ship' },
        data: { defId: 'ship_mule', ai: { passive: true } } });
      h.latch(11);
      assert.equal(h.hints('masslineTowClass').length, 0, 'a ride is never a tow strain');
      assert.ok(h.hints('masslineHitchhiking').length <= 1, 'the hitch lesson owns the latch');
    } finally { h.restore(); }
  });
});

test('SF-291 throw career: whipping a mass the drive cannot tow earns one honest beat', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.whip(HEAVY_HULK_MASS);
      const shown = h.hints('masslineThrowClass');
      assert.equal(shown.length, 1, 'a thrown mass past tow class earns exactly one beat');
      assert.match(shown[0].payload.text, /winch/i, 'the line names the honest fit change');
      h.whip(HEAVY_HULK_MASS);
      assert.equal(h.hints('masslineThrowClass').length, 1, 'once-only: a second big throw stays quiet');
    } finally { h.restore(); }
  });
});

test('SF-291 throw career: a light whip teaches nothing, and flag-off never teaches', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.whip(20);
      assert.equal(h.hints('masslineThrowClass').length, 0, 'a towable mass is no tradeoff reveal');
    } finally { h.restore(); }
  });
  const h = drive();
  try {
    h.whip(HEAVY_HULK_MASS);
    assert.equal(h.hints('masslineThrowClass').length, 0, 'flag-off sessions never see the beat');
  } finally { h.restore(); }
});

test('SF-291: the two careers are independent once-only beats on the same rope', () => {
  withThrowFlag(() => {
    const h = drive();
    try {
      h.addLoad(loadSpec({ mass: HEAVY_HULK_MASS }));
      h.latch(7);
      h.whip(HEAVY_HULK_MASS);
      assert.equal(h.hints('masslineTowClass').length, 1);
      assert.equal(h.hints('masslineThrowClass').length, 1);
      assert.equal(h.hints().length, 2, 'each career names its own tradeoff exactly once');
    } finally { h.restore(); }
  });
});
