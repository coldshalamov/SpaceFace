import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';

// VERB-04 — The first Well you drop tells you, once, that you dropped it.
// The first player fields:deployed emits one hint and does not repeat that session.

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
    player: { id: 1, hints: {}, flags: {} },
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
    state,
    events,
    deployed(payload) {
      (handlers.get('fields:deployed') || []).forEach((fn) => fn(payload));
    },
    wellHints() {
      return events.filter((e) => e.event === 'hud:firstUse' && e.payload && e.payload.verbId === 'firstWellDrop');
    },
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('VERB-04: first player well deployment emits one hint and does not repeat that session', () => {
  const h = drive();
  try {
    h.deployed({ kind: 'well', sourceId: 1 });
    assert.equal(h.wellHints().length, 1, 'first well deployment emits one hint');
    assert.match(h.wellHints()[0].payload.text, /Well/i, 'hint mentions Well');

    // Second deployment in the same session stays silent
    h.deployed({ kind: 'well', sourceId: 1 });
    assert.equal(h.wellHints().length, 1, 'does not repeat that session');
  } finally {
    h.restore();
  }
});

test('VERB-04: NPC well does not trigger player hint', () => {
  const h = drive();
  try {
    h.deployed({ kind: 'well', sourceId: 99, npc: true });
    assert.equal(h.wellHints().length, 0, 'npc well does not emit player hint');
  } finally {
    h.restore();
  }
});

test('VERB-04: other field kinds (cone, repulsor) do not emit firstWellDrop hint', () => {
  const h = drive();
  try {
    h.deployed({ kind: 'cone', sourceId: 1 });
    h.deployed({ kind: 'repulsor', sourceId: 1 });
    assert.equal(h.wellHints().length, 0, 'non-well fields do not emit well hint');
  } finally {
    h.restore();
  }
});
