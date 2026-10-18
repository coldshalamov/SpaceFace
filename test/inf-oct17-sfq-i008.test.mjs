// SFQ-I008 — turning the combat stick on (G, desktop keys) speaks one hint: the
// bound key, and that the stick's center is the cursor. A live stick deflection
// also counts as the stroke. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { onboarding } from '../src/systems/onboarding.js';
import { resolveActionLabel } from '../src/systems/input.js';
import { toggleAutoTarget } from '../src/combat/autoTargetMode.js';
import { missingThreeStrokeActive } from '../src/onboarding/missingThree.js';
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

function expectedHint(label) {
  return `${label} — the cursor is the stick's center. Deflect from that center to fly.`;
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
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  const shown = [];
  bus.on('hud:firstUse', (payload) => shown.push(payload));
  const sys = sim.registry.get('onboarding');
  return {
    sim, state, bus, player, shown, sys,
    hints() { return shown.filter((payload) => payload && payload.verbId === 'combatStickOrigin'); },
    toggle() { return toggleAutoTarget(state, bus); },
    tick() { sys.update(1 / 60, state); },
    restore() {
      try { sys.destroy(); } catch (_) { /* harness only */ }
      sim.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
      setPromptDevice(previousDevice || 'kbm');
    },
  };
}

test('SFQ-I008 seed 4242: a live stick deflection counts as the stroke, a resting stick does not', () => {
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0.42 },
  }), true, 'autoFire plus a live deflection is the stroke');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0.42 },
    autoTargetPath: { active: false, drawing: false, points: [] },
  }), true, 'the vector counts even when no path is drawn');
  assert.equal(missingThreeStrokeActive({
    autoTargetPath: { active: true, points: [{}, {}] },
  }), true, 'a drawn path is still the stroke');
  assert.equal(missingThreeStrokeActive({
    autoTargetPath: { drawing: true, points: [] },
  }), true, 'a path still being drawn is still the stroke');

  assert.equal(missingThreeStrokeActive({
    autoFire: false,
    autoTargetVector: { active: true, magnitude: 0.42 },
  }), false, 'deflection while the stick is off is not the stroke');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: false, magnitude: 0.42 },
  }), false, 'an inactive vector is not a deflection');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: { active: true, magnitude: 0 },
  }), false, 'a centered stick is not a deflection');
  assert.equal(missingThreeStrokeActive({
    autoFire: true,
    autoTargetVector: null,
  }), false);
  assert.equal(missingThreeStrokeActive({}), false);
  assert.equal(missingThreeStrokeActive(null), false);
});

test('SFQ-I008 seed 4242: turning the combat stick on in flight names the key and the cursor center once', () => {
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    assert.equal(h.state.input.autoFire, false);
    const label = resolveActionLabel(h.state, 'autoFire');
    assert.equal(label, 'G');
    h.tick();
    assert.equal(h.hints().length, 0, 'the stick is still off');
    assert.equal(h.toggle(), true);
    h.tick();
    const hint = h.hints();
    assert.equal(hint.length, 1, 'the first on-toggle speaks one hint');
    assert.equal(hint[0].text, expectedHint(label));
    assert.equal(hint[0].text.includes(label), true);
    assert.equal(hint[0].text.includes('autoFire'), false);
    assert.equal(hint[0].text.includes('autoTargetVector'), false);
    assert.equal(hint[0].text.includes('KeyG'), false);
    assert.equal(h.state.player.hints.combatStickOrigin, true, 'the profile remembers');
    assert.equal(h.toggle(), false);
    h.tick();
    assert.equal(h.toggle(), true);
    h.tick();
    h.tick();
    assert.equal(h.hints().length, 1, 'later toggles stay quiet');
  } finally { h.restore(); }
});

test('SFQ-I008 seed 4242: a rebound key is the name the hint uses', () => {
  const h = boot();
  try {
    h.state.settings.controls.bindings = { autoFire: ['KeyH'] };
    const label = resolveActionLabel(h.state, 'autoFire');
    assert.equal(label, 'H');
    h.toggle();
    h.tick();
    const hint = h.hints()[0];
    assert.ok(hint, 'the toggle still teaches');
    assert.equal(hint.text, expectedHint('H'));
    assert.equal(hint.text.includes('KeyH'), false, 'the raw code is not the player word');
  } finally { h.restore(); }
});

test('SFQ-I008 seed 4242: menu, dock, hints off, the rail, a pad, and an unbound key stay quiet', () => {
  const menu = boot();
  try {
    menu.state.mode = 'menu';
    menu.toggle();
    menu.tick();
    assert.equal(menu.hints().length, 0, 'a menu toggle does not teach');
    assert.equal(menu.state.player.hints.combatStickOrigin, undefined);
    menu.state.mode = 'flight';
    menu.tick();
    assert.equal(menu.hints().length, 0, 'entering flight with the stick already on is not a new toggle');
  } finally { menu.restore(); }

  const docked = boot();
  try {
    docked.state.ui.docked = true;
    docked.toggle();
    docked.tick();
    assert.equal(docked.hints().length, 0, 'a docked toggle does not teach');
    docked.state.ui.docked = false;
    docked.tick();
    assert.equal(docked.hints().length, 0, 'undocking with the stick already on stays quiet');
    docked.toggle();
    docked.tick();
    docked.toggle();
    docked.tick();
    const label = resolveActionLabel(docked.state, 'autoFire');
    assert.equal(docked.hints().length, 1, 'the next on-toggle in flight still teaches');
    assert.equal(docked.hints()[0].text, expectedHint(label));
  } finally { docked.restore(); }

  const quiet = boot();
  try {
    quiet.state.settings.gameplay.tutorialHints = false;
    quiet.toggle();
    quiet.tick();
    assert.equal(quiet.hints().length, 0);
    assert.equal(quiet.state.player.hints.combatStickOrigin, undefined, 'hints off does not spend the lesson');
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.tick();
    assert.equal(quiet.hints().length, 0, 'turning hints back on does not invent a toggle');
    quiet.toggle();
    quiet.tick();
    quiet.toggle();
    quiet.tick();
    assert.equal(quiet.hints().length, 1, 'the next on-toggle teaches');
  } finally { quiet.restore(); }

  const rail = boot();
  try {
    rail.state.onboarding = { active: true, finished: false };
    rail.toggle();
    rail.tick();
    assert.equal(rail.hints().length, 0, 'the staged rail keeps the voice');
    assert.equal(rail.state.player.hints.combatStickOrigin, undefined);
    rail.state.onboarding = { active: false, finished: true };
    rail.tick();
    const label = resolveActionLabel(rail.state, 'autoFire');
    assert.equal(rail.hints().length, 1, 'the owed hint speaks once the rail releases');
    assert.equal(rail.hints()[0].text, expectedHint(label));
  } finally { rail.restore(); }

  const pad = boot();
  try {
    setPromptDevice('gamepad');
    pad.toggle();
    pad.tick();
    assert.equal(pad.hints().length, 0, 'a pad has no cursor-origin stick to explain');
    assert.equal(pad.state.player.hints.combatStickOrigin, undefined);
    setPromptDevice('touch');
    pad.toggle();
    pad.tick();
    pad.toggle();
    pad.tick();
    assert.equal(pad.hints().length, 0, 'touch has no key to name');
    setPromptDevice('kbm');
    pad.toggle();
    pad.tick();
    pad.toggle();
    pad.tick();
    assert.equal(pad.hints().length, 1, 'the desktop hand still hears it');
  } finally { pad.restore(); }

  const unbound = boot();
  try {
    unbound.state.settings.controls.bindings = { autoFire: [] };
    assert.equal(resolveActionLabel(unbound.state, 'autoFire'), '');
    unbound.toggle();
    unbound.tick();
    assert.equal(unbound.hints().length, 0, 'no key to name stays quiet');
    assert.equal(unbound.state.player.hints.combatStickOrigin, undefined);
  } finally { unbound.restore(); }
});
