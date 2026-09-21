import test from 'node:test';
import assert from 'node:assert/strict';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { onboarding } from '../src/systems/onboarding.js';

// INF-063 — skipping instruction skips only instruction. A hints-off start lands in story
// mode with no staged cast and no armed triggers; tearing down a guided run leaves no
// streak, no actors, no panel; restarting never double-stages. Reconciled through the
// existing new-game/onboarding state — never by faking beat completion.

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...v) { v.forEach((x) => this.values.add(x)); }
  remove(...v) { v.forEach((x) => this.values.delete(x)); }
  toggle(v, f) { if (f === undefined ? !this.values.has(v) : f) this.values.add(v); else this.values.delete(v); }
  contains(v) { return this.values.has(v); }
}
class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.className = '';
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  setAttribute(n, v) { this[`attr:${n}`] = String(v); }
  getAttribute(n) { return this[`attr:${n}`] ?? null; }
  hasAttribute(n) { return (`attr:${n}`) in this; }
  removeAttribute(n) { delete this[`attr:${n}`]; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  remove() {}
}
class FakeDocument {
  constructor() {
    this.head = new FakeElement(this, 'head');
    this.body = new FakeElement(this, 'body');
    this.roots = new Map();
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById(id) {
    if (!this.roots.has(id)) this.roots.set(id, new FakeElement(this, 'div'));
    return this.roots.get(id);
  }
  querySelector() { return null; }
}

function drive(hintsOn) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const entities = new Map();
  let nextId = 100;
  const spawns = [];
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    tick: 0,
    simTime: 0,
    entities,
    entityList: [player],
    player: { hints: {}, flags: {} },
    settings: hintsOn ? {} : { gameplay: { tutorialHints: false } },
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
  system.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const entity = {
          id: nextId++, alive: true, vel: { x: 0, z: 0 }, ...spec,
          pos: { x: spec.pos.x, z: spec.pos.z }, data: spec.data ? { ...spec.data } : {},
        };
        entities.set(entity.id, entity);
        spawns.push(entity);
        return entity;
      },
      removeEntity(id) { entities.delete(id); },
    },
  });
  return {
    system, state, events, spawns,
    fire: (event, payload) => (handlers.get(event) || []).forEach((fn) => fn(payload || {})),
    restore() {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
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

test('INF-063: a skipped start is coherent — story tracker, no cast, no triggers', () => {
  const h = drive(false);
  try {
    h.fire('game:started', {});
    assert.equal(h.state.onboarding.active, false, 'the rail never arms');
    assert.equal(h.state.onboarding.rescue, undefined, 'no rescue cast staged');
    assert.equal(h.state.onboarding.raid, null, 'no raid cast staged');
    assert.equal(h.system._storyMode, true, 'the story tracker still answers "what now"');
    assert.equal(h.system._panel, null, 'no tutorial panel lingers');
  } finally { h.restore(); }
});

test('INF-063: tearing down a guided run leaves no streak, no actors, no panel', () => {
  withThrowFlag(() => {
    const h = drive(true);
    try {
      h.fire('game:started', {});
      assert.ok(h.state.onboarding.active, 'precondition: the guided rail runs');
      h.fire('tether:latchDenied', { reason: 'no-target' });
      h.fire('tether:latchDenied', { reason: 'no-target' });
      h.system._teardown();
      assert.equal(h.state.onboarding.active, false);
      assert.equal(h.system._latchDenialStreak, 0, 'the failure streak does not cross the skip');
      assert.equal(h.system._panel, null);
      // A fresh begin after the teardown starts clean: two denials earn no hint.
      h.fire('game:started', {});
      h.fire('tether:latchDenied', { reason: 'no-target' });
      h.fire('tether:latchDenied', { reason: 'no-target' });
      const hints = h.events.filter((e) => e.event === 'hud:firstUse');
      assert.equal(hints.length, 0, 'no leftover streak trigger from before the skip');
      // While the fresh rail runs it owns the voice — no second lesson queues behind it.
      h.fire('tether:latchDenied', { reason: 'no-target' });
      assert.equal(h.events.filter((e) => e.event === 'hud:firstUse').length, 0, 'mid-rail denials wait their turn');
      // Rail finished: a fresh streak of three still teaches.
      h.system._latchDenialStreak = 0;
      h.state.onboarding.finished = true;
      h.fire('tether:latchDenied', { reason: 'no-target' });
      h.fire('tether:latchDenied', { reason: 'no-target' });
      h.fire('tether:latchDenied', { reason: 'no-target' });
      assert.equal(h.events.filter((e) => e.event === 'hud:firstUse').length, 1, 'post-rail struggle earns the hint');
    } finally { h.restore(); }
  });
});

test('INF-063: restarting never double-stages the cast or pays twice', () => {
  const h = drive(true);
  try {
    h.fire('game:started', {});
    const firstIds = { ...(h.state.onboarding.rescue ? h.state.onboarding.rescue.ids : {}) };
    const firstSpawnCount = h.spawns.length;
    assert.ok(firstSpawnCount > 0, 'precondition: the guided start stages its cast');
    h.fire('game:started', {});
    const secondIds = h.state.onboarding.rescue ? h.state.onboarding.rescue.ids : {};
    for (const slot of Object.keys(firstIds)) {
      const entity = h.state.entities.get(secondIds[slot]);
      assert.ok(entity && entity.alive !== false, `slot ${slot} resolves to a live actor, not a ghost id`);
    }
    const orphans = h.spawns.filter((e) => !h.state.entities.has(e.id));
    assert.equal(orphans.length, 0, 'restaging removes the old tableau instead of duplicating it');
    assert.deepEqual(h.state.onboarding.beatDoneAt, {}, 'no beat is faked complete on restart');
  } finally { h.restore(); }
});
