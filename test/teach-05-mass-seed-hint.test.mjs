import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';

// TEACH-05 — deploying a mass seed for the first time speaks its warning-then-collapse
// rule once; later deploys stay silent; the profile flag is pinned. The lesson belongs
// at the deploy (never at the collapse) and a foreign owner's deploy cannot teach it.

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
    deploy(ownerId = 1) {
      (handlers.get('massSeed:deployed') || []).forEach((fn) => fn({
        seedId: 77, ownerId, spawnPos: { x: 0, z: 0 }, lockPos: { x: 400, z: 0 },
      }));
    },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
  };
}

test('TEACH-05: the first deploy speaks the warning-then-collapse rule once per profile', () => {
  const h = drive();
  try {
    h.deploy();
    const shown = h.hints();
    assert.equal(shown.length, 1, 'the first deploy earns exactly one hint');
    assert.equal(shown[0].payload.verbId, 'massSeedDeploy');
    assert.match(shown[0].payload.text, /warns.*folds|warns.*collapse/i,
      'the line names the warning-then-collapse rule');
    h.deploy();
    h.deploy();
    assert.equal(h.hints().length, 1, 'later deploys stay silent');
    assert.equal(h.state.player.hints.massSeedDeploy, true, 'the profile flag is pinned');
  } finally { h.restore(); }
});

test('TEACH-05: a foreign owner deploy never teaches the lesson', () => {
  const h = drive();
  try {
    h.deploy(99); // not the player — if NPC deploys ever exist they cannot spend the flag
    assert.equal(h.hints().length, 0);
    assert.equal(h.state.player.hints.massSeedDeploy, undefined);
    h.deploy(1);
    assert.equal(h.hints().length, 1, "the player's own first deploy still earns it");
  } finally { h.restore(); }
});

test('TEACH-05: a profile that already learned never relearns', () => {
  const h = drive();
  try {
    h.state.player.hints.massSeedDeploy = true; // learned on a previous save
    h.deploy();
    assert.equal(h.hints().length, 0);
  } finally { h.restore(); }
});
