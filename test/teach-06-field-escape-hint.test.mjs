import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';
import { FIELD_ESCAPES } from '../src/data/fields.js';

// TEACH-06 — FIELD_ESCAPES is the authored "never trapped without a verb" table. A hostile
// field that owns the player's hull earns ONE named-escape lesson per power, through the same
// once-only hint path as combat/dock/gate. Player-owned fields and open space teach nothing.

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

function wellAt(x, z, extra = {}) {
  return {
    id: 'field_npc_well_1', kind: 'well', volume: 'ring',
    center: { x, z }, dir: { x: 1, z: 0 },
    radius: 120, innerRadius: 0, strength: 60,
    tag: 'npc', ownerId: 'npc_9', sourceId: 'npc_9',
    ...extra,
  };
}

function drive(fields = []) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const events = [];
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, alive: true }]]),
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
    fields: { snapshot: fields },
    onboarding: { active: false, finished: true },
  };
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return {
    events, state, system,
    tick(dt = 0.25) { system.update(dt, state); },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('TEACH-06: a hostile field that owns the hull teaches its authored escape, once', () => {
  const h = drive([wellAt(10, 0)]);
  try {
    h.tick();
    const shown = h.hints();
    assert.equal(shown.length, 1, 'inside the well earns exactly one lesson');
    assert.equal(shown[0].payload.verbId, 'fieldEscape:well');
    assert.equal(shown[0].payload.text, FIELD_ESCAPES.well.sentence, 'the authored sentence is what the player reads');
    h.tick();
    h.tick();
    assert.equal(h.hints().length, 1, 'player.hints keeps it once-only across further containment');
  } finally { h.restore(); }
});

test('TEACH-06: open space and your own field teach nothing', () => {
  const away = drive([wellAt(10, 0)]);
  try {
    away.state.entities.get(1).pos = { x: 900, z: 0 };
    away.tick();
    assert.equal(away.hints().length, 0, 'outside the radius is no lesson');
  } finally { away.restore(); }

  const own = drive([wellAt(10, 0, { ownerId: 1, sourceId: 1, tag: 'player' })]);
  try {
    own.tick();
    assert.equal(own.hints().length, 0, 'your own well is not a trap — no lesson');
  } finally { own.restore(); }
});

test('TEACH-06: different powers teach different verbs; a skim sheet maps to out-mass', () => {
  const coneField = {
    id: 'f_cone', kind: 'cone', volume: 'cone',
    center: { x: 0, z: 0 }, dir: { x: 1, z: 0 },
    radius: 400, halfAngleRad: 0.6, tag: 'npc', ownerId: 'npc_9',
  };
  const h = drive([coneField]);
  try {
    h.state.entities.get(1).pos = { x: 100, z: 0 };
    h.tick();
    assert.equal(h.hints()[0].payload.verbId, 'fieldEscape:cone', 'the cone teaches the sidestep');
  } finally { h.restore(); }

  const sheet = drive([{
    id: 'f_sheet', kind: 'sheet', volume: 'sheet',
    center: { x: 0, z: 0 }, dir: { x: 1, z: 0 },
    radius: 300, halfWidth: 80, tag: 'npc', ownerId: 'npc_9',
  }]);
  try {
    sheet.state.entities.get(1).pos = { x: 100, z: 0 };
    sheet.tick();
    assert.equal(sheet.hints()[0].payload.verbId, 'fieldEscape:skim',
      'a sheet-kind field teaches the skim power\'s out-mass escape');
  } finally { sheet.restore(); }
});

test('TEACH-06: fields without a named escape never hint', () => {
  const h = drive([{
    id: 'f_snare', kind: 'anchorSnare',
    center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 200,
    tag: 'npc', ownerId: 'npc_9',
  }]);
  try {
    h.tick();
    assert.equal(h.hints().length, 0, 'no authored escape row means silence, not noise');
  } finally { h.restore(); }
});
