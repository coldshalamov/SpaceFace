// TEACH-14 — on seed 4242 the first swing that loads the rope toward its limit
// (crossing the strain-glow danger band STRAIN_GLOW_DANGER_THRESHOLD = 0.75)
// produces one hint about releasing early, naming the bound release key.
// Once per profile via player.hints.masslineReleaseWindow.
// Swings below the danger band (TEACH-03 boundary), straight tows, radial hauls,
// slack lines, dead payloads, and foreign/hints-disabled sessions stay quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { onboarding } from '../src/systems/onboarding.js';
import { STRAIN_GLOW_DANGER_THRESHOLD } from '../src/systems/masslineControlLaw.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';
import { setPromptDevice } from '../src/ui/bindings.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

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

function boot(options = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousDevice = setPromptDevice('kbm');
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previousThrow = MASSLINE2_FLAGS.throw;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.throw = true;

  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const sim = createSimulation({ seed: options.seed || 4242, systems: [onboarding] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, mass: 35,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  const shown = [];
  bus.on('hud:firstUse', (payload) => shown.push(payload));

  return {
    sim, state, bus, player, shown,
    releaseHints() { return shown.filter((payload) => payload.verbId === 'masslineReleaseWindow'); },
    spawnTarget(extra = {}) {
      return sim.spawn({
        type: extra.type || 'asteroid',
        pos: extra.pos || { x: 100, z: 0 },
        vel: extra.vel || { x: 0, z: 30 },
        hull: 200,
        hullMax: 200,
        mass: extra.mass || 30,
        ...extra,
      });
    },
    setTether(targetId, extra = {}) {
      state.player.tether = {
        active: true,
        targetId,
        restLength: 100,
        strain: 0,
        load: 0,
        strainGlow: 0,
        phase: 'loaded',
        ...extra,
      };
    },
    tickOnce(dt = 0.3) {
      sim.registry.get('onboarding').update(dt, state);
    },
    restore() {
      try { sim.registry.get('onboarding').destroy(); } catch (_) { /* harness only */ }
      sim.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
      setPromptDevice(previousDevice || 'kbm');
      MASSLINE2_FLAGS.enabled = previousEnabled;
      MASSLINE2_FLAGS.throw = previousThrow;
    },
  };
}

test('TEACH-14 seed 4242: the first crossing of the strain-glow danger band produces one hint about releasing early', () => {
  const h = boot();
  try {
    assert.equal(h.state.meta.seed, 4242);
    assert.equal(STRAIN_GLOW_DANGER_THRESHOLD, 0.75, 'danger band threshold is 0.75');
    const target = h.spawnTarget();
    const tetherLabel = verbBindingLabel(h.state, 'tether');
    assert.ok(tetherLabel, 'profile has a tether binding label');

    // Swing loading the rope past danger threshold (0.85 >= 0.75)
    h.setTether(target.id, { strainGlow: 0.85, strain: 0.85, load: 0.85 });
    const before = h.shown.length;
    h.tickOnce();
    const added = h.shown.slice(before);

    const release = h.releaseHints();
    assert.equal(release.length, 1, 'crossing the danger band produces exactly one release hint');
    assert.equal(release[0].verbId, 'masslineReleaseWindow');
    assert.match(release[0].text, /release/i, 'hint mentions release');
    assert.match(release[0].text, /early/i, 'hint mentions early');
    assert.match(release[0].text, /limit/i, 'hint mentions line limit');
    assert.ok(release[0].text.includes(tetherLabel), 'hint names the bound tether key');
    assert.equal(release[0].text.includes('KeySpace'), false, 'no raw key codes');

    // Subsequent ticks stay quiet (once per profile)
    h.tickOnce();
    h.tickOnce();
    assert.equal(h.releaseHints().length, 1, 'later ticks stay quiet');
    assert.equal(h.state.player.hints.masslineReleaseWindow, true, 'profile records the hint flag');
  } finally { h.restore(); }
});

test('TEACH-14 seed 4242: a rebound tether key is the name the hint uses', () => {
  const h = boot();
  try {
    h.state.settings.controls.bindings = { tether: ['KeyX'] };
    const label = verbBindingLabel(h.state, 'tether');
    assert.equal(label, 'X');
    const target = h.spawnTarget();
    h.setTether(target.id, { strainGlow: 0.8 });
    h.tickOnce();

    const hint = h.releaseHints()[0];
    assert.ok(hint, 'hint was produced');
    assert.match(hint.text, /release/i);
    assert.match(hint.text, /early/i);
    assert.ok(hint.text.includes('X'), 'hint names the rebound key X');
    assert.equal(hint.text.includes('KeyX'), false, 'no raw code KeyX');
  } finally { h.restore(); }
});

test('TEACH-14 seed 4242: swings below danger band stay quiet (TEACH-03 boundary)', () => {
  const h = boot();
  try {
    const target = h.spawnTarget();
    // Swing with strain below the danger band (0.4 < 0.75)
    h.setTether(target.id, { strainGlow: 0.4, strain: 0.4, load: 0.4 });
    h.tickOnce();

    assert.equal(h.releaseHints().length, 0, 'sub-danger swing produces no release hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineReleaseWindow, undefined);

    // Now raise strain to cross the danger band (0.75)
    h.setTether(target.id, { strainGlow: 0.75, strain: 0.75, load: 0.75 });
    h.tickOnce();

    assert.equal(h.releaseHints().length, 1, 'crossing the danger threshold produces the hint');
    assert.equal(h.state.player.hints.masslineReleaseWindow, true);
  } finally { h.restore(); }
});

test('TEACH-14 seed 4242: straight tows, radial hauls, slack lines, and dead payloads stay quiet', () => {
  const h = boot();
  try {
    // 1. Straight tow at high strain: vel = (30, 0), pos = (100, 0) -> pure radial approach
    const towingTarget = h.spawnTarget({ vel: { x: 30, z: 0 } });
    h.setTether(towingTarget.id, { strainGlow: 0.9, strain: 0.9, load: 0.9 });
    h.tickOnce();
    assert.equal(h.releaseHints().length, 0, 'radial tow at high strain produces no release hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineReleaseWindow, undefined);

    // 2. Slack line at high nominal strain: restLength 140 > distance 100
    const slackTarget = h.spawnTarget();
    h.setTether(slackTarget.id, { restLength: 140, strainGlow: 0.9, phase: 'slack' });
    h.tickOnce();
    assert.equal(h.releaseHints().length, 0, 'slack line produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineReleaseWindow, undefined);

    // 3. Dead payload at high strain
    const deadTarget = h.spawnTarget({ alive: false });
    h.setTether(deadTarget.id, { strainGlow: 0.9 });
    h.tickOnce();
    assert.equal(h.releaseHints().length, 0, 'dead payload produces no hint');
    assert.equal(h.state.player.hints && h.state.player.hints.masslineReleaseWindow, undefined);

    // 4. Inactive line
    const idleTarget = h.spawnTarget();
    h.setTether(idleTarget.id, { active: false, strainGlow: 0.9 });
    h.tickOnce();
    assert.equal(h.releaseHints().length, 0, 'inactive tether produces no hint');
  } finally { h.restore(); }
});

test('TEACH-14 seed 4242: flags, tutorialHints, staged rail, and touch device boundaries', () => {
  const quiet = boot();
  try {
    const target = quiet.spawnTarget();
    quiet.setTether(target.id, { strainGlow: 0.85 });

    // Flag off stays quiet
    MASSLINE2_FLAGS.throw = false;
    quiet.tickOnce();
    assert.equal(quiet.releaseHints().length, 0, 'flag off stays quiet');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.masslineReleaseWindow, undefined);
    MASSLINE2_FLAGS.throw = true;

    // tutorialHints off stays quiet
    quiet.state.settings.gameplay = { tutorialHints: false };
    quiet.tickOnce();
    assert.equal(quiet.releaseHints().length, 0, 'tutorialHints off stays quiet');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.masslineReleaseWindow, undefined);

    // Tutorial rail active stays quiet
    quiet.state.settings.gameplay.tutorialHints = true;
    quiet.state.onboarding = { active: true, finished: false };
    quiet.tickOnce();
    assert.equal(quiet.releaseHints().length, 0, 'active staged rail keeps voice');
    assert.equal(quiet.state.player.hints && quiet.state.player.hints.masslineReleaseWindow, undefined);

    // Touch device: empty binding label produces hint with plain phrasing and no undefined
    quiet.state.onboarding = { active: false, finished: true };
    setPromptDevice('touch');
    quiet.tickOnce();
    assert.equal(quiet.releaseHints().length, 1, 'touch device produces hint');
    const text = quiet.releaseHints()[0].text;
    assert.match(text, /release/i);
    assert.match(text, /early/i);
    assert.equal(text.includes('undefined'), false, 'no undefined in touch text');
  } finally { quiet.restore(); }
});

test('TEACH-14 seed 4242: nearBreak event during a swing produces the release hint immediately', () => {
  const h = boot();
  try {
    const target = h.spawnTarget();
    h.setTether(target.id, { strainGlow: 0.5 }); // strain not yet at danger threshold in mirror
    assert.equal(h.releaseHints().length, 0);

    // nearBreak event fires during swing with ratio >= 0.75
    h.bus.emit('tether:nearBreak', {
      actorId: h.player.id,
      targetId: target.id,
      ratio: 0.78,
    });

    assert.equal(h.releaseHints().length, 1, 'nearBreak event produces hint immediately');
    assert.equal(h.releaseHints()[0].verbId, 'masslineReleaseWindow');
    assert.equal(h.state.player.hints.masslineReleaseWindow, true);
  } finally { h.restore(); }
});
