// First plate bite — the shield regrows in front of a new pilot; the hull never does.
// The first hit that reaches the hull speaks the survival rule once (a repair berth
// welds it back), so the hull bar is never silently persistent. Shield-only hits,
// armor-only hits, a killing blow, the staged rail's voice window, hints-off profiles,
// and somebody else's damage stay quiet and never spend the lesson.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { onboarding } from '../src/systems/onboarding.js';
import { FIRST_USE_LINE } from '../src/ui/hudAttention.js';

const LINE = FIRST_USE_LINE.firstHullBite;

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

function boot() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const sim = createSimulation({ seed: 4242, systems: [onboarding] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  const shown = [];
  bus.on('hud:firstUse', (payload) => shown.push(payload));
  return {
    sim, state, bus, player, shown,
    biteHints() { return shown.filter((payload) => payload.verbId === 'firstHullBite'); },
    hit(extra = {}) {
      const payload = {
        targetId: player.id,
        isPlayer: true,
        attackerId: extra.attackerId === undefined ? 424242 : extra.attackerId,
        shieldDamage: 0,
        armorDamage: 0,
        hullDamage: 12,
        after: { hull: 88 },
        ...extra,
      };
      bus.emit('combat:damage', payload);
      return payload;
    },
    // Same-tick hint bursts queue FIFO: firstCombat claims the 7 s HUD window on this same
    // damage event, so firstHullBite lands deferred and only speaks once the sim has stepped
    // past that window (onboarding drains the queue on its 0.2 s cadence).
    drain(seconds = 9) {
      sim.runTicks(Math.ceil(seconds * 60));
    },
    restore() {
      try { sim.registry.get('onboarding').destroy(); } catch (_) { /* harness only */ }
      sim.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('first plate bite: the first hit that reaches the hull names the berth fix once', () => {
  assert.equal(typeof LINE, 'string');
  assert.ok(LINE.length >= 8, 'a real line, not a slug');
  assert.ok(LINE.split(/\s+/).length <= 12, 'inside the one-line drill budget');
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    h.hit();
    h.drain();
    assert.equal(h.biteHints().length, 1, 'the first hull bite produces one hint');
    assert.equal(h.biteHints()[0].text, LINE, 'the table line, verbatim');
    assert.equal(h.biteHints()[0].entityId, 424242, 'the receipt attaches to the attacker');
    assert.equal(h.state.player.hints.firstHullBite, true, 'the profile remembers');
    h.hit();
    h.hit({ attackerId: 7 });
    assert.equal(h.biteHints().length, 1, 'later bites stay quiet');
  } finally { h.restore(); }
});

test('first plate bite: shield-only and armor-only hits never spend the lesson', () => {
  const h = boot();
  try {
    h.hit({ hullDamage: 0, shieldDamage: 30, after: { hull: 100 } });
    h.hit({ hullDamage: 0, armorDamage: 9, after: { hull: 100 } });
    h.hit({ hullDamage: undefined, after: { hull: 100 } });
    assert.equal(h.biteHints().length, 0, 'no plate reached means no lesson');
    assert.equal(h.state.player.hints.firstHullBite, undefined, 'the lesson stays unspent');
    h.hit();
    h.drain();
    assert.equal(h.biteHints().length, 1, 'the first real bite still teaches');
  } finally { h.restore(); }
});

test('first plate bite: a killing hit stays quiet — the defeat screen owns that moment', () => {
  const h = boot();
  try {
    h.hit({ hullDamage: 100, after: { hull: 0 } });
    assert.equal(h.biteHints().length, 0, 'no repair lesson on the blow that kills');
    assert.equal(h.state.player.hints.firstHullBite, undefined, 'the lesson was not spent');
    h.hit({ hullDamage: 100, after: { hull: -4 } });
    assert.equal(h.biteHints().length, 0, 'overkill is still the defeat screen\'s moment');
    h.hit({ hullDamage: 5, after: { hull: 95 } });
    h.drain();
    assert.equal(h.biteHints().length, 1, 'a surviving bite still teaches once');
    assert.equal(h.state.player.hints.firstHullBite, true);
  } finally { h.restore(); }
});

test('first plate bite: the staged rail, hints-off, and somebody else\'s hull stay quiet', () => {
  const h = boot();
  try {
    h.state.onboarding = { active: true, finished: false };
    h.hit();
    assert.equal(h.biteHints().length, 0, 'the staged rail keeps the voice');
    assert.equal(h.state.player.hints.firstHullBite, undefined, 'not spent, only deferred');
    h.state.onboarding = { active: false, finished: true };
    h.state.settings.gameplay.tutorialHints = false;
    h.hit();
    assert.equal(h.biteHints().length, 0, 'hints off stays quiet');
    assert.equal(h.state.player.hints.firstHullBite, undefined);
    h.state.settings.gameplay.tutorialHints = true;
    h.hit({ isPlayer: false, targetId: 999 });
    assert.equal(h.biteHints().length, 0, 'another hull\'s damage does not teach the player');
    h.hit({ isPlayer: false });
    h.drain();
    assert.equal(h.biteHints().length, 1, 'the player\'s own bite still teaches once');
  } finally { h.restore(); }
});
