// TEACH-11 — the first time a scoop is refused because the hold is already full,
// one hint names the bound jettison key. Later rocks stay quiet. A scoop that
// still fits, including the one that fills the hold, is not that refusal.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { onboarding } from '../src/systems/onboarding.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';
import { setPromptDevice } from '../src/ui/bindings.js';

const ORE = 'cmdty_ore_iron';

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

function expectedHint(label) {
  return /[.!?]$/.test(label)
    ? `Hold is full — jettison — ${label}`
    : `Hold is full — jettison — ${label}.`;
}

function boot() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousDevice = setPromptDevice('kbm');
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const sim = createSimulation({ seed: 4242, systems: [cargo, onboarding] });
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
    jettisonHints() { return shown.filter((payload) => payload.verbId === 'firstFullHoldJettison'); },
    fillHold(units = 3) {
      state.player.cargo = {
        items: { [ORE]: units },
        usedVolume: units,
        usedMass: units,
        capVolume: units,
        capMass: 100,
      };
    },
    scoop(amount, extra = {}) {
      const payload = {
        kind: 'ore',
        collectorId: extra.collectorId == null ? player.id : extra.collectorId,
        commodityId: extra.commodityId || ORE,
        amount,
      };
      bus.emit('pickup:collected', payload);
      return payload;
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

test('TEACH-11 seed 4242: the first full-hold refusal names the bound jettison key once', () => {
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    h.fillHold(3);
    const label = verbBindingLabel(h.state, 'jettisonLot');
    assert.ok(label, 'this profile has a jettison binding');
    const before = h.shown.length;
    const refused = h.scoop(1);
    assert.equal(refused.acceptedAmount, 0, 'a full hold takes nothing');
    assert.equal(refused.rejectedAmount, 1);
    const added = h.shown.slice(before);
    assert.equal(added.length, 1, 'the first refusal produces one hint');
    assert.equal(added[0].verbId, 'firstFullHoldJettison');
    assert.equal(added[0].text, expectedHint(label));
    assert.equal(added[0].text.includes('jettisonLot'), false);
    assert.equal(added[0].text.includes('Period'), false);
    assert.equal(added[0].text.includes(ORE), false);
    h.scoop(1);
    h.scoop(4);
    assert.equal(h.jettisonHints().length, 1, 'later rocks stay quiet');
    assert.equal(h.state.player.hints.firstFullHoldJettison, true, 'the profile remembers');
    assert.equal(h.state.player.cargo.capVolume, 3, 'the lesson does not resize the hold');
    assert.equal(h.state.player.cargo.usedVolume, 3, 'the lesson does not dump the hold');
  } finally { h.restore(); }
});

test('TEACH-11 seed 4242: a rebound jettison key is the name the hint uses', () => {
  const h = boot();
  try {
    h.state.settings.controls.bindings = { jettisonLot: ['KeyH'] };
    h.fillHold(3);
    const label = verbBindingLabel(h.state, 'jettisonLot');
    assert.equal(label, 'H');
    h.scoop(2);
    const hint = h.jettisonHints()[0];
    assert.ok(hint, 'the refusal still teaches');
    assert.equal(hint.text, expectedHint('H'));
    assert.equal(hint.text.includes('KeyH'), false, 'the raw code is not the player word');
  } finally { h.restore(); }
});

test('TEACH-11 seed 4242: a scoop that fits, a partial fill, and a fractional gap stay quiet', () => {
  const h = boot();
  try {
    h.state.player.cargo.capVolume = 3;
    h.state.player.cargo.capMass = 100;
    assert.equal(h.scoop(1).acceptedAmount, 1);
    assert.equal(h.jettisonHints().length, 0, 'room in the hold is not a refusal');
    const partial = h.scoop(9);
    assert.equal(partial.acceptedAmount, 2);
    assert.equal(partial.rejectedAmount, 7);
    assert.equal(h.jettisonHints().length, 0, 'the scoop that fills the hold is not a refusal');
    assert.equal(h.shown.some((payload) => payload.verbId === 'firstCargoFull'), true, 'that beat still says to sell');
    h.scoop(1);
    h.scoop(1);
    assert.equal(h.jettisonHints().length, 1, 'the next rock is the one refusal lesson');
    assert.equal(h.state.player.cargo.capVolume, 3);

    const gap = boot();
    try {
      gap.state.player.cargo.capVolume = 3;
      gap.state.player.cargo.capMass = 100;
      assert.equal(gap.scoop(2, { commodityId: 'cmdty_ice_water' }).acceptedAmount, 2);
      assert.ok(gap.state.player.cargo.usedVolume < gap.state.player.cargo.capVolume);
      assert.equal(gap.scoop(1).acceptedAmount, 0, 'a fraction of a unit free still refuses the rock');
      assert.equal(gap.jettisonHints().length, 0, 'a hold that is not full does not teach jettison');
    } finally { gap.restore(); }
  } finally { h.restore(); }
});

test('TEACH-11 seed 4242: a spent profile, hints off, the tutorial rail, touch, and someone else stay quiet', () => {
  const spent = boot();
  try {
    spent.fillHold(3);
    spent.state.player.hints.firstFullHoldJettison = true;
    spent.scoop(1);
    spent.scoop(1);
    assert.equal(spent.jettisonHints().length, 0, 'the profile is not taught twice');
    assert.equal(spent.shown.some((payload) => payload.verbId === 'firstCargoFull'), false);
  } finally { spent.restore(); }

  const quiet = boot();
  try {
    quiet.fillHold(3);
    quiet.state.settings.gameplay.tutorialHints = false;
    quiet.scoop(1);
    assert.equal(quiet.jettisonHints().length, 0);
    assert.equal(quiet.state.player.hints.firstFullHoldJettison, undefined, 'hints off does not spend the lesson');
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.state.onboarding = { active: true, finished: false };
    quiet.scoop(1);
    assert.equal(quiet.jettisonHints().length, 0, 'the staged rail keeps the voice');
    assert.equal(quiet.state.player.hints.firstFullHoldJettison, undefined);
    quiet.state.onboarding = { active: false, finished: true };
    setPromptDevice('touch');
    quiet.scoop(1);
    assert.equal(quiet.jettisonHints().length, 0, 'touch has no jettison key to name');
    assert.equal(quiet.state.player.hints.firstFullHoldJettison, undefined);
    setPromptDevice('kbm');
    quiet.scoop(1, { collectorId: quiet.player.id + 99 });
    assert.equal(quiet.jettisonHints().length, 0, 'another collector does not teach the player');
    quiet.scoop(1);
    assert.equal(quiet.jettisonHints().length, 1, 'the first refusal the player can hear still teaches');
    assert.equal(quiet.state.player.cargo.capVolume, 3);
  } finally { quiet.restore(); }
});
