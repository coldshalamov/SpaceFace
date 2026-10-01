import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';
import { FIELD_ESCAPES } from '../src/data/fields.js';

// TEACH-06 — each field power's authored escape is taught once, the first time a field actually
// owns the player hull. The FIELD_ESCAPES table existed with no consumer; onboarding now reads the
// published field snapshot and speaks the matching sentence once per kind per profile.

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

function drive({ fields = [], playerPos = { x: 50, z: 0 } } = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const events = [];
  const entities = new Map([[1, {
    id: 1, type: 'ship', team: 'player',
    pos: { x: playerPos.x, z: playerPos.z },
    vel: { x: 0, z: 0 },
  }]]);
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities,
    entityList: [...entities.values()],
    player: { id: 1, hints: {}, flags: {} },
    settings: {},
    onboarding: { active: false, finished: false },
    fields: { snapshot: fields },
  };
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return {
    state,
    events,
    tick() { system.update(0.25, state); },
    escapeHints() {
      return events.filter((e) => e.event === 'hud:firstUse'
        && e.payload && String(e.payload.verbId).startsWith('fieldEscape:'));
    },
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

const hostileWell = { kind: 'well', center: { x: 0, z: 0 }, radius: 100, innerRadius: 0, filters: { excludeId: 99 } };

test('TEACH-06: first capture by a hostile well speaks the authored escape once', () => {
  const h = drive({ fields: [hostileWell] });
  try {
    h.tick();
    assert.equal(h.escapeHints().length, 1, 'one hint on first capture');
    const hint = h.escapeHints()[0];
    assert.equal(hint.payload.verbId, 'fieldEscape:well');
    assert.match(hint.payload.text, new RegExp(FIELD_ESCAPES.well.name, 'i'));
    assert.match(hint.payload.text, /boost/i, 'the sentence is the authored escape');
    assert.equal(h.state.player.hints['fieldEscape:well'], true, 'profile flag set');

    h.tick();
    h.tick();
    assert.equal(h.escapeHints().length, 1, 'second and later captures stay silent');
  } finally {
    h.restore();
  }
});

test('TEACH-06: once per field kind — a cone still teaches after the well already did', () => {
  const cone = { kind: 'cone', center: { x: 0, z: 0 }, radius: 200, innerRadius: 0, dir: { x: 1, z: 0 }, halfAngleRad: 0.5, edgeSoftRad: 0.2, filters: { excludeId: 99 } };
  const h = drive({ fields: [hostileWell] });
  try {
    h.tick();
    h.state.fields.snapshot = [cone];
    h.tick();
    const hints = h.escapeHints();
    assert.equal(hints.length, 2, 'each kind gets its own lesson');
    assert.equal(hints[1].payload.verbId, 'fieldEscape:cone');
    assert.match(hints[1].payload.text, new RegExp(FIELD_ESCAPES.cone.name, 'i'));
  } finally {
    h.restore();
  }
});

test('TEACH-06: a field that excludes the player hull cannot teach', () => {
  const ownWell = { ...hostileWell, filters: { excludeId: 1 } };
  const h = drive({ fields: [ownWell] });
  try {
    h.tick();
    assert.equal(h.escapeHints().length, 0, 'own deployed well never nags its owner');
  } finally {
    h.restore();
  }
});

test('TEACH-06: outside every field there is nothing to escape', () => {
  const h = drive({ fields: [hostileWell], playerPos: { x: 500, z: 500 } });
  try {
    h.tick();
    assert.equal(h.escapeHints().length, 0);
  } finally {
    h.restore();
  }
});
