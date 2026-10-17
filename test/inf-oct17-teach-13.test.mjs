// TEACH-13 — the first inbound missile lock with decoys in stock names the bound
// countermeasure key, once. An empty magazine stays silent (NXI-045). The
// MISSILE LOCK warning itself is a different sentence and is not this hint.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { onboarding } from '../src/systems/onboarding.js';
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

function expectedHint(label) {
  return /[.!?]$/.test(label)
    ? `Missile locked — drop a decoy — ${label}`
    : `Missile locked — drop a decoy — ${label}.`;
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
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  if (!player.data) player.data = {};
  const shown = [];
  bus.on('hud:firstUse', (payload) => shown.push(payload));
  return {
    sim, state, bus, player, shown,
    decoyHints() { return shown.filter((payload) => payload.verbId === 'firstDecoyLock'); },
    fit(moduleId, stock) {
      player.data.fittings = [moduleId];
      player.data.cm = { cooldownT: 0, effectT: 0, effect: null };
      if (stock != null) player.data.cm.stock = stock;
    },
    lock(extra = {}) {
      bus.emit('combat:lockChanged', {
        locked: true,
        targetId: extra.targetId == null ? player.id : extra.targetId,
        shooterId: extra.shooterId || 'bandit',
      });
    },
    clearLock() {
      bus.emit('combat:lockChanged', { locked: false, targetId: player.id, shooterId: 'bandit' });
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

test('TEACH-13 seed 4242: the first lock with decoys in stock names the bound key once', () => {
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    h.fit('mod_decoy_buoy_s', 2);
    const label = verbBindingLabel(h.state, 'countermeasure');
    assert.ok(label, 'this profile has a countermeasure binding');
    const before = h.shown.length;
    h.lock();
    const added = h.shown.slice(before);
    assert.equal(added.length, 1, 'the first lock with stock produces one hint');
    assert.equal(added[0].verbId, 'firstDecoyLock');
    assert.equal(added[0].text, expectedHint(label));
    assert.equal(added[0].text.includes('countermeasure'), false);
    assert.equal(added[0].text.includes('KeyX'), false);
    assert.equal(added[0].text.includes('mod_decoy_buoy_s'), false);
    assert.notEqual(added[0].text, 'MISSILE LOCK');
    h.clearLock();
    h.lock();
    h.lock();
    assert.equal(h.decoyHints().length, 1, 'later locks stay quiet');
    assert.equal(h.state.player.hints.firstDecoyLock, true, 'the profile remembers');
    assert.equal(h.player.data.cm.stock, 2, 'the lesson does not spend a buoy');
  } finally { h.restore(); }
});

test('TEACH-13 seed 4242: a rebound countermeasure key is the name the hint uses', () => {
  const h = boot();
  try {
    h.state.settings.controls.bindings = { countermeasure: ['KeyH'] };
    h.fit('mod_decoy_buoy_s', 1);
    const label = verbBindingLabel(h.state, 'countermeasure');
    assert.equal(label, 'H');
    h.lock();
    const hint = h.decoyHints()[0];
    assert.ok(hint, 'the lock still teaches');
    assert.equal(hint.text, expectedHint('H'));
    assert.equal(hint.text.includes('KeyH'), false, 'the raw code is not the player word');
  } finally { h.restore(); }
});

test('TEACH-13 seed 4242: zero stock stays silent and does not spend the lesson', () => {
  const h = boot();
  try {
    h.fit('mod_decoy_buoy_s', 0);
    h.lock();
    h.clearLock();
    h.lock();
    assert.equal(h.decoyHints().length, 0, 'an empty magazine does not name a key');
    assert.equal(h.state.player.hints && h.state.player.hints.firstDecoyLock, undefined);
    assert.equal(h.player.data.cm.stock, 0, 'silence does not refill the magazine');
    h.player.data.cm.stock = 3;
    h.lock();
    const label = verbBindingLabel(h.state, 'countermeasure');
    assert.equal(h.decoyHints().length, 1, 'the first lock with stock still teaches');
    assert.equal(h.decoyHints()[0].text, expectedHint(label));
    assert.equal(h.player.data.cm.stock, 3);
  } finally { h.restore(); }
});

test('TEACH-13 seed 4242: a catalog buoy, chaff, a clear, hints off, the rail, and touch stay in bounds', () => {
  const live = boot();
  try {
    live.fit('mod_decoy_buoy_s', null);
    assert.equal(live.player.data.cm.stock, undefined, 'the catalog buoy is not a magazine');
    live.lock();
    const label = verbBindingLabel(live.state, 'countermeasure');
    assert.equal(live.decoyHints().length, 1, 'a buoy with no magazine is aboard');
    assert.equal(live.decoyHints()[0].text, expectedHint(label));
  } finally { live.restore(); }

  const chaff = boot();
  try {
    chaff.fit('mod_chaff_dispenser_m', 4);
    chaff.lock();
    assert.equal(chaff.decoyHints().length, 0, 'chaff stock is not a decoy magazine');
    assert.equal(chaff.state.player.hints && chaff.state.player.hints.firstDecoyLock, undefined);
  } finally { chaff.restore(); }

  const quiet = boot();
  try {
    quiet.fit('mod_decoy_buoy_s', 2);
    quiet.clearLock();
    assert.equal(quiet.decoyHints().length, 0, 'dropping the lock is not a warning');
    quiet.state.settings.gameplay.tutorialHints = false;
    quiet.lock();
    assert.equal(quiet.decoyHints().length, 0);
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.firstDecoyLock, undefined);
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.state.onboarding = { active: true, finished: false };
    quiet.lock();
    assert.equal(quiet.decoyHints().length, 0, 'the staged rail keeps the voice');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.firstDecoyLock, undefined);
    quiet.state.onboarding = { active: false, finished: true };
    setPromptDevice('touch');
    quiet.lock();
    assert.equal(quiet.decoyHints().length, 0, 'touch has no countermeasure key to name');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.firstDecoyLock, undefined);
    setPromptDevice('kbm');
    quiet.lock({ targetId: quiet.player.id + 40 });
    assert.equal(quiet.decoyHints().length, 0, 'someone else being locked does not teach');
    quiet.lock();
    assert.equal(quiet.decoyHints().length, 1, 'the first lock the player can hear still teaches');
  } finally { quiet.restore(); }
});
