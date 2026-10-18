// Sustained-hitstop contract: kill-storm dips are BEATS, not a held floor.
// Two stacked re-arm defects produced the headed-Swarm slowdown (sim ~0.09-0.2 s per wall s
// while presentation kept animating):
//  1. swarmJuice: 'swarm:juice-hitstop' (~0.35) re-armed on nearly every multi-kill receipt —
//     each fresh ~60-80 ms window beats the drained sim-clock remainder, so the request pinned
//     the floor for as long as killing continued.
//  2. feel: 'feel:hit-stop' (HS_DEPTH 0.12) re-topped on every player-caused kill/heavy-damage
//     receipt via _trigger — no cooldown — so a kill stream holds the 0.12 floor indefinitely.
// Both layers now share the established real/sim-clock re-arm gates; these tests drive a
// sustained kill storm through the production event paths and assert the floor releases
// between beats while discrete dips still land.
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
import { SWARM_HITSTOP_SOURCE } from '../src/data/swarmJuice.js';

const DT = 1 / 60;

function boot({ effects = 'full' } = {}) {
  const state = createGameState(9);
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
function kill(h) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: false, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: victimN++, stuntThreat: { baseScore: 120, credits: 4 } },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: h.state.playerId, type: 'ship',
    pos: { x: 10, z: 10 },
    presentation: { cause: 'direct', playerCaused: true },
  });
}

function tick(h) {
  h.state.simTime += DT;
  swarmJuice.update(DT, h.state);
}

test('a sustained kill storm produces discrete dips, not a held time floor', () => {
  const h = boot();
  const totalSteps = Math.round(12 / DT);         // 12 sim-seconds of continuous killing
  let dips = 0;                                    // transitions into the dip
  let heldSteps = 0;                               // steps where the request pins the scale
  let measuredSteps = 0;
  let freeSteps = 0;
  const stormStartS = 2;                           // let the multi-kill window establish first
  for (let i = 0; i < totalSteps; i += 1) {
    const before = h.state.timeScale;
    if (i % 3 === 0) kill(h);                      // ~20 kills per sim-second — a dense wipe storm
    tick(h);
    if (before === 1 && h.state.timeScale < 1) dips += 1;
    if (h.state.timeScale < 1) heldSteps += 1;
    if (h.state.simTime >= stormStartS) {
      measuredSteps += 1;
      if (h.state.timeScale === 1) freeSteps += 1;
    }
  }
  assert.ok(dips >= 3, `distinct kill beats must still dip (got ${dips})`);
  const freeFraction = freeSteps / measuredSteps;
  assert.ok(freeFraction >= 0.5,
    `the dip must release between beats — held ${heldSteps} steps, only ${(freeFraction * 100).toFixed(0)}% free`);

  // The floor always recovers once the storm stops: drain the last live dip, then verify
  // no request remains.
  for (let i = 0; i < Math.round(1.5 / DT); i += 1) tick(h);
  assert.equal(h.state.timeScale, 1, 'the floor must release after the last beat');
  assert.equal(h.effects.describeRequests()[SWARM_HITSTOP_SOURCE], undefined,
    'no swarm hit-stop request may survive the storm');
  swarmJuice.destroy();
});

test('an explicitly forced beat (boss down) still lands inside the re-arm window', () => {
  const h = boot();
  for (let i = 0; i < 3; i += 1) kill(h);          // TRIPLE arms the dip inside the same tick
  assert.ok(h.state.timeScale <= 0.35, 'fixture must begin inside a live dip');
  swarmJuice._requestHitStop(null, 1);             // the boss-down marquee dip is forced
  assert.equal(swarmJuice._hitStopLeft, 1, 'the forced beat must arm its full duration');
  assert.equal(h.effects.describeRequests()[SWARM_HITSTOP_SOURCE].scale, 0.35);
  swarmJuice.destroy();
});

test('the re-arm gate still respects reduced/off effects', () => {
  for (const effects of ['reduced', 'off']) {
    const h = boot({ effects });
    for (let i = 0; i < 60; i += 1) { kill(h); tick(h); }
    assert.equal(h.state.timeScale, 1, `${effects} effects never dip`);
    assert.equal(h.effects.describeRequests()[SWARM_HITSTOP_SOURCE], undefined);
    swarmJuice.destroy();
  }
});

// --- feel:hit-stop (presentation layer, real-frame clock) ------------------------------------
// The 0.12 signature from the headed witness: every player-caused kill calls _trigger(HS_KILL)
// and every heavy combat:damage calls _trigger(HS_HEAVY); with no cooldown each receipt
// re-topped _hsTimer, holding 'feel:hit-stop' at HS_DEPTH continuously.

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

function killReceipt(fx, i) {
  fx.bus.emit('entity:killed', {
    id: 100 + i, killerId: fx.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
  });
}

test('a kill stream cannot hold feel:hit-stop at the dip floor continuously', () => {
  const fx = makeFeelFixture(21);
  const feel = initFeel(fx);
  const FRAME = 0.05;                        // 20 fps wall cadence — the low-FPS witness regime
  let dips = 0;
  let held = 0;
  let measured = 0;
  for (let i = 0; i < 60; i += 1) {          // 3 wall-seconds of kills every 50 ms
    const before = fx.state.timeScale;
    killReceipt(fx, i);
    feel.frame(FRAME, fx.state);
    if (before === 1 && fx.state.timeScale < 1) dips += 1;
    if (i >= 10) { measured += 1; if (fx.state.timeScale < 1) held += 1; }
  }
  assert.ok(dips >= 2, `kill beats must still dip (got ${dips})`);
  assert.ok(held / measured < 0.75,
    `the dip must release between beats — held ${held}/${measured} frames dipped`);

  // The floor always recovers once the stream stops; a later lone kill still dips.
  for (let i = 0; i < 10; i += 1) feel.frame(FRAME, fx.state);
  assert.equal(fx.state.timeScale, 1, 'the floor releases after the stream');
  for (let i = 0; i < 40; i += 1) feel.frame(FRAME, fx.state); // let the cooldown fully pass
  killReceipt(fx, 999);
  assert.equal(fx.state.timeScale, 0.12, 'a lone kill after the storm still dips');
  feel.destroy();
});

test('big beats still land inside the small-beat cooldown', () => {
  const fx = makeFeelFixture(22);
  const feel = initFeel(fx);
  killReceipt(fx, 0);                        // arm a small dip + its cooldown
  assert.equal(fx.state.timeScale, 0.12);
  fx.bus.emit('entity:killed', {
    id: 200, killerId: fx.state.playerId, type: 'ship', capital: true, pos: { x: 10, z: 10 },
  });
  assert.equal(feel._hsTimer, 0.8, 'the capital kill beat overrides a cooling small dip');
  fx.bus.emit('player:death', {});
  assert.equal(feel._hsTimer, 0.9, 'the death beat always lands');
  feel.destroy();
});

test('motionReduce still suppresses every dip tier', () => {
  const fx = makeFeelFixture(23, { motionReduce: true });
  const feel = initFeel(fx);
  for (let i = 0; i < 20; i += 1) { killReceipt(fx, i); feel.frame(0.05, fx.state); }
  assert.equal(fx.state.timeScale, 1, 'motionReduce keeps the floor at 1');
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
