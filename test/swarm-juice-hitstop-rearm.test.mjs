// R10: a sustained kill storm keeps the clock normal. Champion defeat alone has a
// short Swarm chase hold, with an admission budget on the presentation clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { feel as feelDefinition } from '../src/render/feel.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { createChaseCamera } from '../src/render/camera.js';

const DT = 1 / 60;

function boot({ effects = 'full' } = {}) {
  const state = createGameState(9);
  state.mode = 'flight';
  state.settings.video.arcadeEffects = effects;
  const bus = createBus();
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;
  const effects_ = createTimeEffects(state);
  const ctx = { state, bus, helpers: {}, timeEffects: effects_ };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 3;
  return { state, bus, effects: effects_ };
}

let victimN = 0;
/** Spawn a cohort body, then emit its death at the current sim time (player-caused). */
function kill(h, bodyData = {}, capital = false) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: false, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: victimN++, stuntThreat: { baseScore: 120, credits: 4 }, ...bodyData },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: h.state.playerId, type: 'ship', capital,
    pos: { x: 10, z: 10 },
    presentation: { cause: 'direct', playerCaused: true },
  });
}

function tick(h) {
  h.state.simTime += DT;
  swarmJuice.update(DT, h.state);
}

test('a sustained kill storm cannot hold the ordinary Swarm chase or simulation', () => {
  const h = boot();
  const camera = h.state.render.cameraCtrl = createChaseCamera(h.state);
  const feel = initFeel(h);
  try {
    for (let i = 0; i < 180; i += 1) {
      if (i % 3 === 0) kill(h, {}, true); // even heavy non-champion kills keep moving
      tick(h);
      feel.frame(DT, h.state);
      assert.equal(h.state.timeScale, 1);
      assert.equal(camera.holdRemaining(), 0);
    }
    assert.deepEqual(h.effects.describeRequests(), {});
    assert.ok(camera.killBeatLog().some((beat) => beat.zoom && beat.holdS === 0));
  } finally {
    feel.destroy();
    swarmJuice.destroy();
  }
});

function defeatChampion(h, wave) {
  h.state.run.wave = wave;
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave, plan: {} });
  h.state.run.phase = 'active';
  kill(h, { runWave: wave, swarmChampion: true }, true);
}

test('champion defeat owns one 50 ms chase hold with an 800 ms presentation re-arm', () => {
  const h = boot();
  const camera = h.state.render.cameraCtrl = createChaseCamera(h.state);
  const feel = initFeel(h);
  const defeats = [];
  const stingers = [];
  h.bus.on('swarm:bossDown', (beat) => defeats.push(beat.wave));
  h.bus.on('audio:cue', ({ id }) => { if (id === 'moment.stinger') stingers.push(id); });
  try {
    defeatChampion(h, 5);
    assert.equal(camera.holdRemaining(), 0, 'capital kill does not add a longer hold');
    feel.frame(DT, h.state);
    assert.equal(camera.holdRemaining(), 0.05);
    assert.equal(h.state.timeScale, 1);
    camera.follow(0.06);
    assert.equal(camera.holdRemaining(), 0);

    feel.frame(0.79, h.state);
    defeatChampion(h, 10);
    feel.frame(0, h.state);
    assert.equal(camera.holdRemaining(), 0, 'a second champion cannot bypass presentation re-arm');
    feel.frame(0.02, h.state);
    defeatChampion(h, 15);
    feel.frame(0, h.state);
    assert.equal(camera.holdRemaining(), 0.05, 'elapsed presentation time re-arms while sim time is unchanged');
    assert.deepEqual(defeats, [5, 10, 15]);
    assert.equal(stingers.length, 3);
    assert.equal(h.state.timeScale, 1);
  } finally {
    feel.destroy();
    swarmJuice.destroy();
  }
});

test('reduced and off effects skip the hero hold, and explicit Pause owns its own clock', () => {
  for (const effects of ['reduced', 'off']) {
    const h = boot({ effects });
    const camera = h.state.render.cameraCtrl = createChaseCamera(h.state);
    const feel = initFeel(h);
    defeatChampion(h, 5);
    feel.frame(DT, h.state);
    assert.equal(camera.holdRemaining(), 0);
    assert.equal(h.state.timeScale, 1);
    feel.destroy();
    swarmJuice.destroy();
  }
  const h = boot();
  const camera = h.state.render.cameraCtrl = createChaseCamera(h.state);
  const feel = initFeel(h);
  defeatChampion(h, 5);
  h.effects.set('pause', { scale: 0 });
  h.state.mode = 'paused';
  h.bus.emit('sim:pause');
  feel.frame(DT, h.state);
  assert.equal(h.state.timeScale, 0);
  h.effects.clear('pause');
  h.state.mode = 'flight';
  feel.frame(DT, h.state);
  assert.equal(h.state.timeScale, 1);
  assert.equal(camera.holdRemaining(), 0);
  feel.destroy();
  swarmJuice.destroy();
});

// --- feel beats (presentation layer, real-frame cadence) --------------------------------------
// The 0.12 signature from the headed witness: every player-caused kill called _trigger(HS_KILL)
// and every heavy combat:damage called _trigger(HS_HEAVY); with no cooldown each receipt
// re-topped the window, holding 'feel:hit-stop' at HS_DEPTH continuously. The writer is gone:
// the beats still land their punch/window/vignette, but nothing in feel touches timeEffects.

installDomFixture();

function makeFeelFixture(seed, { motionReduce = false } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui.screenStack = [];
  state.ui.docked = false;
  state.settings.video.motionReduce = motionReduce;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } });
  state.entityList.push(state.entities.get(1));
  return { state, bus: createBus(), effects: createTimeEffects(state) };
}

function initFeel(fx, feel) {
  const host = feel || Object.create(feelDefinition);
  host.init({ state: fx.state, bus: fx.bus, helpers: {}, timeEffects: fx.effects });
  return host;
}

// The authored beat window a fired beat leaves armed, whichever internal field carries it —
// evidence that a beat landed, never a clock contract.
function beatWindow(host) {
  return host._beatTimer ?? host._hsTimer ?? 0;
}

function killReceipt(fx, i) {
  fx.bus.emit('entity:killed', {
    id: 100 + i, killerId: fx.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
  });
}

test('a kill stream lands its beats as presentation and never writes the clock', () => {
  const fx = makeFeelFixture(21);
  const feel = initFeel(fx);
  const FRAME = 0.05;                        // 20 fps wall cadence — the low-FPS witness regime
  let sawPunch = false;
  for (let i = 0; i < 60; i += 1) {          // 3 wall-seconds of kills every 50 ms
    killReceipt(fx, i);
    feel.frame(FRAME, fx.state);
    assert.equal(fx.state.timeScale, 1, `frame ${i}: an automatic beat wrote the clock`);
    if (feel._fovPunch > 0 || feel._fovPunchApplied > 0) sawPunch = true;
  }
  assert.ok(sawPunch, 'kill beats must still land their FOV punch');
  assert.deepEqual(fx.effects.describeRequests(), {}, 'feel must never arm a request');
  for (let i = 0; i < 10; i += 1) feel.frame(FRAME, fx.state);
  assert.equal(fx.state.timeScale, 1);
  killReceipt(fx, 999);
  assert.equal(fx.state.timeScale, 1, 'a lone kill after the storm stays presentation only');
  feel.destroy();
});

test('kill, capital, and death beats keep their authored windows — clock untouched', () => {
  const fx = makeFeelFixture(22);
  const camera = fx.state.render.cameraCtrl = createChaseCamera(fx.state);
  const feel = initFeel(fx);
  killReceipt(fx, 0);
  assert.equal(fx.state.timeScale, 1, 'the kill beat never writes the clock');
  const killWindow = beatWindow(feel);
  assert.ok(killWindow > 0, 'the kill beat still arms its window');
  fx.bus.emit('entity:killed', {
    id: 200, killerId: fx.state.playerId, type: 'ship', capital: true, pos: { x: 10, z: 10 },
  });
  const capitalWindow = beatWindow(feel);
  assert.ok(capitalWindow > killWindow, 'the capital kill keeps the larger authored window');
  assert.equal(camera.holdRemaining(), 0.35, 'Adventure retains its authored capital framing');
  assert.equal(fx.state.timeScale, 1);
  fx.bus.emit('player:death', {});
  assert.ok(beatWindow(feel) >= capitalWindow, 'the death beat always lands its own window');
  assert.equal(fx.state.timeScale, 1);
  assert.deepEqual(fx.effects.describeRequests(), {});
  feel.destroy();
});

test('motionReduce keeps every beat silent and the clock untouched', () => {
  const fx = makeFeelFixture(23, { motionReduce: true });
  const feel = initFeel(fx);
  for (let i = 0; i < 20; i += 1) { killReceipt(fx, i); feel.frame(0.05, fx.state); }
  assert.equal(fx.state.timeScale, 1, 'motionReduce keeps the clock at 1');
  assert.equal(beatWindow(feel), 0, 'motionReduce keeps the beat window at zero');
  assert.equal(fx.effects.describeRequests()['feel:hit-stop'], undefined);
  feel.destroy();
});

function installDomFixture() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) {
      if (force === undefined) force = !this.values.has(value);
      if (force) this.values.add(value); else this.values.delete(value);
      return force;
    }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) elements.set(child.id, child); return child; }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    contains(candidate) { for (let node = candidate; node; node = node.parentNode) if (node === this) return true; return false; }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; },
        set globalCompositeOperation(_value) {},
      };
    }
  }
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  globalThis.document = {
    body, head, activeElement: body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(tagName); },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => { callback(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
}
