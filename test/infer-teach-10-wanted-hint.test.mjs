import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';
import { lawfulPatrolOnGlass } from '../src/systems/lawSecurity.js';

// TEACH-10 — the first wanted escalation teaches the stand-down path. The first
// heat:changed crossing into wanted with a lawful patrol on glass earns exactly one
// onboarding hint naming the surrender verb; repeats, non-crossing heat gains, and
// patrol-absent escalations stay silent. Once per profile via player.hints. The heat
// law is untouched — the lesson only reads the transition (no heat/rep/credit write).

const SEED = 4242;

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

function drive({ patrols = 'near' } = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const player = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const list = [player];
  const entities = new Map([[player.id, player]]);
  if (patrols === 'near') {
    // Inside the law's own witness radius (450): on glass.
    const patrol = {
      id: 'patrol-1', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
      pos: { x: 120, z: 0 }, data: { ai: { lawful: true } },
    };
    entities.set(patrol.id, patrol);
    list.push(patrol);
  } else if (patrols === 'far') {
    // A lawful hull past the witness radius is traffic, not glass.
    const patrol = {
      id: 'patrol-1', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
      pos: { x: 1200, z: 0 }, data: { ai: { lawful: true } },
    };
    entities.set(patrol.id, patrol);
    list.push(patrol);
  } else if (patrols === 'raider') {
    // An unlawful hull on glass is not the law and cannot teach the stand-down.
    const raider = {
      id: 'raider-1', type: 'ship', alive: true, rot: 0, factionId: 'faction_reach',
      pos: { x: 120, z: 0 }, data: { ai: { lawful: false } },
    };
    entities.set(raider.id, raider);
    list.push(raider);
  }
  const state = {
    meta: { seed: SEED },
    playerId: 'player',
    tick: 4242,
    simTime: 424.2,
    mode: 'flight',
    entities,
    entityList: list,
    player: { heat: 0, hints: {}, flags: {} },
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
    heatChanged(payload) {
      (handlers.get('heat:changed') || []).forEach((fn) => fn(payload));
    },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
  };
}

function crossing(value = 0.65) {
  return { value, previousValue: 0, level: 1, wanted: true, wantedCrossed: true, reason: 'test' };
}

test('TEACH-10: the first wanted crossing with a patrol on glass names surrender once', () => {
  const h = drive({ patrols: 'near' });
  try {
    assert.ok(lawfulPatrolOnGlass(h.state), 'the scene has a patrol on glass');
    h.heatChanged(crossing());
    const shown = h.hints();
    assert.equal(shown.length, 1, 'the first wanted escalation earns exactly one hint');
    assert.equal(shown[0].payload.verbId, 'firstWantedStandDown');
    assert.match(shown[0].payload.text, /surrender/i, 'the line names the surrender verb');
    assert.equal(h.state.player.hints.firstWantedStandDown, true, 'the profile flag is pinned');
  } finally { h.restore(); }
});

test('TEACH-10: repeats and non-crossing heat gains stay silent', () => {
  const h = drive({ patrols: 'near' });
  try {
    h.heatChanged(crossing());
    assert.equal(h.hints().length, 1);
    // A second crossing (re-wanted after clearing) is not the first escalation.
    h.heatChanged(crossing(0.8));
    // A heat gain that stays wanted without crossing is never the transition.
    h.heatChanged({ value: 0.9, previousValue: 0.7, level: 2, wanted: true, wantedCrossed: false });
    // Suspicion climbing below the gate is not wanted at all.
    h.heatChanged({ value: 0.2, previousValue: 0.1, level: 0, wanted: false, wantedCrossed: false });
    // Clearing wanted is an edge, but not INTO wanted.
    h.heatChanged({ value: 0, previousValue: 0.7, level: 0, wanted: false, wantedCrossed: true });
    assert.equal(h.hints().length, 1, 'nothing after the first escalation speaks');
  } finally { h.restore(); }
});

test('TEACH-10: a patrol-absent escalation stays silent and does not spend the flag', () => {
  const h = drive({ patrols: 'none' });
  try {
    assert.equal(lawfulPatrolOnGlass(h.state), null, 'no patrol on glass');
    h.heatChanged(crossing());
    assert.equal(h.hints().length, 0, 'no patrol, no lesson');
    assert.equal(h.state.player.hints.firstWantedStandDown, undefined,
      'the un-taught flag is not spent by a patrol-absent escalation');
  } finally { h.restore(); }
});

test('TEACH-10: a distant lawful hull and an unlawful hull on glass stay silent', () => {
  const far = drive({ patrols: 'far' });
  try {
    assert.equal(lawfulPatrolOnGlass(far.state), null, 'a 1200 WU hull is not on glass');
    far.heatChanged(crossing());
    assert.equal(far.hints().length, 0);
  } finally { far.restore(); }
  const raider = drive({ patrols: 'raider' });
  try {
    assert.equal(lawfulPatrolOnGlass(raider.state), null, 'a raider is not the law');
    raider.heatChanged(crossing());
    assert.equal(raider.hints().length, 0);
  } finally { raider.restore(); }
});

test('TEACH-10: a profile that already learned never relearns', () => {
  const h = drive({ patrols: 'near' });
  try {
    h.state.player.hints.firstWantedStandDown = true; // learned on a previous save
    h.heatChanged(crossing());
    assert.equal(h.hints().length, 0);
  } finally { h.restore(); }
});
