// TEACH-12 — on seed 4242 the first latch above the authored mass-ratio threshold (MASS_ANCHOR_RATIO = 3)
// produces one hint about boost and brace. Once-only per profile via player.hints.masslineBrace.
// A lighter body, comparable mass, an NPC latch/tow, or hints-disabled stay quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { onboarding, MASS_ANCHOR_RATIO } from '../src/systems/onboarding.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';
import { setPromptDevice } from '../src/ui/bindings.js';

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
  querySelector() { return null; }
}

function boot() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousDevice = setPromptDevice('kbm');
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const sim = createSimulation({ seed: 4242, systems: [onboarding] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, mass: 35,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  const shown = [];
  bus.on('hud:firstUse', (payload) => shown.push(payload));
  return {
    sim, state, bus, player, shown,
    braceHints() { return shown.filter((payload) => payload.verbId === 'masslineBrace'); },
    spawnTarget(mass, extra = {}) {
      return sim.spawn({
        type: extra.type || 'asteroid',
        pos: { x: 100, z: 0 },
        hull: 200,
        hullMax: 200,
        mass,
        ...extra,
      });
    },
    latch(targetId, extra = {}) {
      bus.emit('tether:latched', {
        targetId,
        type: 'tether_standard',
        sourceId: extra.sourceId == null ? player.id : extra.sourceId,
        actorId: extra.actorId,
        ownerId: extra.ownerId,
        massRatio: extra.massRatio,
      });
    },
    restore() {
      try { sim.registry.get('onboarding').destroy(); } catch (_) { /* harness only */ }
      sim.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
      setPromptDevice(previousDevice || 'kbm');
    },
  };
}

test('TEACH-12 seed 4242: the first latch above the authored mass-ratio threshold produces one hint about boost and brace', () => {
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    assert.equal(MASS_ANCHOR_RATIO, 3, 'authored mass-ratio threshold is 3');
    const heavy = h.spawnTarget(120); // 120 / 35 = 3.43 >= 3
    const boostLabel = verbBindingLabel(h.state, 'boost');
    assert.ok(boostLabel, 'profile has a boost binding');

    const before = h.shown.length;
    h.latch(heavy.id);
    const added = h.shown.slice(before);
    assert.equal(added.length, 1, 'first latch on heavy body produces one hint');
    assert.equal(added[0].verbId, 'masslineBrace');
    assert.equal(added[0].entityId, heavy.id, 'the brace hint anchors to the heavy body, not the player source');
    assert.match(added[0].text, /boost/i, 'hint mentions boost');
    assert.match(added[0].text, /brace/i, 'hint mentions brace');
    assert.ok(added[0].text.includes(boostLabel), 'hint names the bound boost key');
    assert.equal(added[0].text.includes('KeyShift'), false, 'no raw codes');

    // Subsequent latches stay quiet
    h.latch(heavy.id);
    const massive = h.spawnTarget(1800);
    h.latch(massive.id);
    assert.equal(h.braceHints().length, 1, 'later latches stay quiet (once per profile)');
    assert.equal(h.state.player.hints.masslineBrace, true, 'profile records the hint flag');
  } finally { h.restore(); }
});

test('TEACH-12 seed 4242: a rebound boost key is the name the hint uses', () => {
  const h = boot();
  try {
    h.state.settings.controls.bindings = { boost: ['KeyB'] };
    const label = verbBindingLabel(h.state, 'boost');
    assert.equal(label, 'B');
    const heavy = h.spawnTarget(140);
    h.latch(heavy.id);
    const hint = h.braceHints()[0];
    assert.ok(hint, 'the latch produces hint');
    assert.match(hint.text, /boost/i);
    assert.match(hint.text, /brace/i);
    assert.ok(hint.text.includes('B'), 'hint names the rebound key B');
    assert.equal(hint.text.includes('KeyB'), false, 'no raw code KeyB');
  } finally { h.restore(); }
});

test('TEACH-12 seed 4242: lighter or comparable bodies produce no hint and do not spend profile flag', () => {
  const h = boot();
  try {
    const light = h.spawnTarget(20); // 20 / 35 = 0.57 < 3
    h.latch(light.id);
    assert.equal(h.braceHints().length, 0, 'light body produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineBrace, undefined);

    const even = h.spawnTarget(35); // 35 / 35 = 1 < 3
    h.latch(even.id);
    assert.equal(h.braceHints().length, 0, 'equal body produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineBrace, undefined);

    const justUnder = h.spawnTarget(104); // 104 / 35 = 2.97 < 3
    h.latch(justUnder.id);
    assert.equal(h.braceHints().length, 0, 'just under threshold produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineBrace, undefined);

    const justAt = h.spawnTarget(105); // 105 / 35 = 3.0 >= 3
    h.latch(justAt.id);
    assert.equal(h.braceHints().length, 1, 'latch at threshold produces hint');
    assert.equal(h.state.player.hints.masslineBrace, true);
  } finally { h.restore(); }
});

test('TEACH-12 seed 4242: NPC tows and foreign latches produce no hint', () => {
  const h = boot();
  try {
    const heavy = h.spawnTarget(500);
    const npc = h.sim.spawn({ type: 'ship', team: 1, pos: { x: 50, z: 0 }, hull: 100, hullMax: 100, mass: 35 });

    // NPC tows / latches
    h.latch(heavy.id, { sourceId: npc.id });
    assert.equal(h.braceHints().length, 0, 'NPC latch produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineBrace, undefined);

    h.latch(heavy.id, { actorId: npc.id });
    assert.equal(h.braceHints().length, 0, 'foreign actor produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineBrace, undefined);

    // Now player latches
    h.latch(heavy.id, { sourceId: h.player.id });
    assert.equal(h.braceHints().length, 1, 'player latch produces hint');
  } finally { h.restore(); }
});

test('TEACH-12 seed 4242: tutorialHints off, staged rail active, and touch device boundaries', () => {
  const quiet = boot();
  try {
    const heavy = quiet.spawnTarget(200);

    // tutorialHints off
    quiet.state.settings.gameplay.tutorialHints = false;
    quiet.latch(heavy.id);
    assert.equal(quiet.braceHints().length, 0, 'tutorialHints off stays quiet');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.masslineBrace, undefined);

    // tutorial rail active
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.state.onboarding = { active: true, finished: false };
    quiet.latch(heavy.id);
    assert.equal(quiet.braceHints().length, 0, 'active staged rail keeps voice');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.masslineBrace, undefined);

    // touch device (empty binding label)
    quiet.state.onboarding = { active: false, finished: true };
    setPromptDevice('touch');
    quiet.latch(heavy.id);
    assert.equal(quiet.braceHints().length, 1, 'touch device produces hint');
    const text = quiet.braceHints()[0].text;
    assert.match(text, /boost/i);
    assert.match(text, /brace/i);
    assert.equal(text.includes('undefined'), false, 'no undefined in touch text');
  } finally { quiet.restore(); }
});
