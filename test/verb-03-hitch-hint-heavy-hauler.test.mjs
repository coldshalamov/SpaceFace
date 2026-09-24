import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';

// VERB-03 — the hitch hint gated on the express liner's itinerary flag, so the only
// ship that could teach "ride, then cut" was the rarest liner in the sky. Any passive
// civilian on the ship_mule freight frame (the opening mule, cargo haulers, arclight,
// tanker, shuttle, express) is a real ride; the hint must fire on them too.

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

function drive(entitiesById = new Map()) {
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
    entities: entitiesById,
    entityList: [...entitiesById.values()],
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
    events,
    latched(targetId) {
      (handlers.get('tether:latched') || []).forEach((fn) => fn({ targetId }));
    },
    hitchHints() {
      return events.filter((e) => e.event === 'hud:firstUse' && e.payload && e.payload.verbId === 'masslineHitchhiking');
    },
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

function withHitchFlag(fn) {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.hitchhiking;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.hitchhiking = true;
  try {
    return fn();
  } finally {
    MASSLINE2_FLAGS.hitchhiking = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
}

const openingMule = {
  id: 42,
  alive: true,
  team: 2,
  data: {
    defId: 'ship_mule',
    onboarding: true,
    raidRole: 'hauler',
    ai: { passive: true, archetype: 'mule_trader' },
  },
};

const ordinaryHauler = {
  id: 43,
  alive: true,
  team: 2,
  data: { defId: 'ship_mule', trafficRole: 'hauler', ai: { passive: true } },
};

const kestrelCourier = {
  id: 44,
  alive: true,
  team: 2,
  data: { defId: 'ship_kestrel', trafficRole: 'courier', ai: { passive: true } },
};

const expressLiner = {
  id: 45,
  alive: true,
  team: 2,
  data: {
    defId: 'ship_mule',
    trafficRole: 'express',
    itinerary: { kind: 'express_hitch_route', hitchable: true },
    ai: { passive: true },
  },
};

test('VERB-03: locking the opening mule shows the hitch hint once', () => {
  withHitchFlag(() => {
    const h = drive(new Map([[openingMule.id, openingMule]]));
    try {
      h.latched(openingMule.id);
      assert.equal(h.hitchHints().length, 1, 'the opening mule is a hitchable ride');
      h.latched(openingMule.id);
      assert.equal(h.hitchHints().length, 1, 'the hint stays once-only');
    } finally { h.restore(); }
  });
});

test('VERB-03: an ordinary heavy hauler also teaches the hitch', () => {
  withHitchFlag(() => {
    const h = drive(new Map([[ordinaryHauler.id, ordinaryHauler]]));
    try {
      h.latched(ordinaryHauler.id);
      assert.equal(h.hitchHints().length, 1, 'a cargo hauler on the mule frame qualifies');
    } finally { h.restore(); }
  });
});

test('VERB-03: a light courier still does not teach the hitch', () => {
  withHitchFlag(() => {
    const h = drive(new Map([[kestrelCourier.id, kestrelCourier]]));
    try {
      h.latched(kestrelCourier.id);
      assert.equal(h.hitchHints().length, 0, 'non-freight frames stay silent');
    } finally { h.restore(); }
  });
});

test('VERB-03: the express itinerary contract still qualifies', () => {
  withHitchFlag(() => {
    const h = drive(new Map([[expressLiner.id, expressLiner]]));
    try {
      h.latched(expressLiner.id);
      assert.equal(h.hitchHints().length, 1, 'the original express path is preserved');
    } finally { h.restore(); }
  });
});
