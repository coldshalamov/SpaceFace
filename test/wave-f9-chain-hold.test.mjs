// Wave F §22.8 row F9 — "A chain holds a beat."
//
// When a player-caused release's contact chain reaches a THIRD distinct body inside a
// short window, the existing hit-stop dips once more — exactly one extra beat per causal
// root. A two-body contact, an NPC-only chain, or a contact past the window earns
// nothing. It is not a resource: no meter, no pool, no stacking on every contact.
//
// This fixture drives the real feel.js collision path (receipt → queue → flush →
// frame drain → trigger) on seeds 4242 and 8008. `document` is stubbed because the
// vignette mount has no headless guard; the trigger itself is real and spied.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CHAIN_BEAT_DIP_S,
  CHAIN_BEAT_WINDOW_TICKS,
  feel,
} from '../src/render/feel.js';

const SEEDS = [4242, 8008];
const DT = 1 / 60;

function installDomStub() {
  if (globalThis.document && globalThis.document.__waveF9Stub) return;
  // Absorbing element: any method call succeeds, any property set sticks, known
  // reads return sane values. Only the hit-stop timers are under test here.
  const makeAbsorber = () => new Proxy({ style: {}, isConnected: true }, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string') return (...args) => makeAbsorber();
      return undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  globalThis.document = {
    __waveF9Stub: true,
    getElementById: () => null,
    createElement: () => makeAbsorber(),
    head: makeAbsorber(),
    body: makeAbsorber(),
  };
}

function makeHarness(seed) {
  installDomStub();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.ui = {};
  state.settings = { video: { motionReduce: false } };
  const bus = createBus();
  const bodies = {
    1: { id: 1, type: 'ship', pos: { x: 0, z: 0 }, mass: 26 },
    11: { id: 11, type: 'ship', pos: { x: 0, z: 0 }, mass: 10 },
    12: { id: 12, type: 'ship', pos: { x: 10, z: 0 }, mass: 10 },
    13: { id: 13, type: 'ship', pos: { x: 20, z: 0 }, mass: 10 },
    14: { id: 14, type: 'ship', pos: { x: 30, z: 0 }, mass: 10 },
  };
  for (const id of Object.keys(bodies)) state.entities.set(Number(id), bodies[id]);
  state.playerId = 1;

  // Manual init: the real init mounts DOM vignette layers; every field the
  // collision/frame path reads is set here instead.
  const system = Object.create(feel);
  system.state = state;
  system.bus = bus;
  system.timeEffects = { set() {}, clear() {} };
  system._hsTimer = 0;
  system._hsRampIn = 0;
  system._hsFreezeTimer = 0;
  system._hsRequest = { scale: 1 };
  system._collisionHitstopCooldown = 0;
  system._armedCollisionDeltaV = 0;
  system._pendingCollisionFeel = null;
  system._collisionFeelScratch = {};
  system._collisionFeelContext = {};
  system._armedCollisionTick = null;
  system._armedCollisionAId = null;
  system._armedCollisionBId = null;
  system._chainBeats = new Map();
  system._chainBeatQueued = 0;
  system._fovPunch = 0;
  system._fovPunchApplied = 0;
  system._vig = 0;
  system._vigEl = null;

  const triggers = [];
  const realTrigger = system._trigger.bind(system);
  system._trigger = (hsDur, fovAdd, vigPeak, vigCls) => {
    triggers.push({ hsDur, fovAdd });
    realTrigger(hsDur, fovAdd, vigPeak, vigCls);
  };
  return { state, system, triggers };
}

function contact(harness, { aId, bId, tick, rootId, rootTick, actorId }) {
  harness.state.tick = tick;
  harness.system._onCollisionConsequence({
    targetId: aId,
    otherId: bId,
    tick,
    exchangedMomentum: 500,
    deltaV: 30,
    feelDeltaV: 30,
    pos: { x: 5, z: 0 },
    normal: { x: 1, z: 0 },
    provenance: { actorId, rootId, tick: rootTick },
  });
  harness.system.frame(DT, harness.state);
}

function settle(harness) {
  for (let i = 0; i < 120; i += 1) {
    harness.system.frame(DT, harness.state);
    if (harness.system._hsTimer <= 0 && harness.system._chainBeatQueued === 0) break;
  }
}

function chainDips(harness) {
  return harness.triggers.filter((t) => Math.abs(t.hsDur - CHAIN_BEAT_DIP_S) < 1e-9);
}

for (const seed of SEEDS) {
  test(`a three-body chain from one release dips exactly once (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    const player = harness.state.playerId;
    contact(harness, { aId: 11, bId: 12, tick: 101, rootId: 'root-1', rootTick: 100, actorId: player });
    contact(harness, { aId: 12, bId: 13, tick: 102, rootId: 'root-1', rootTick: 100, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 1);
    // A fourth body on the same root earns nothing: one beat per causal root.
    contact(harness, { aId: 13, bId: 14, tick: 103, rootId: 'root-1', rootTick: 100, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 1);
  });

  test(`a two-body hit earns no extra dip (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    const player = harness.state.playerId;
    contact(harness, { aId: 11, bId: 12, tick: 101, rootId: 'root-1', rootTick: 100, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 0);
  });

  test(`a second chain later dips again (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    const player = harness.state.playerId;
    contact(harness, { aId: 11, bId: 12, tick: 101, rootId: 'root-1', rootTick: 100, actorId: player });
    contact(harness, { aId: 12, bId: 13, tick: 102, rootId: 'root-1', rootTick: 100, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 1);
    contact(harness, { aId: 11, bId: 12, tick: 201, rootId: 'root-2', rootTick: 200, actorId: player });
    contact(harness, { aId: 12, bId: 13, tick: 202, rootId: 'root-2', rootTick: 200, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 2);
  });

  test(`an NPC-only chain stays silent (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    contact(harness, { aId: 11, bId: 12, tick: 101, rootId: 'root-1', rootTick: 100, actorId: 99 });
    contact(harness, { aId: 12, bId: 13, tick: 102, rootId: 'root-1', rootTick: 100, actorId: 99 });
    settle(harness);
    assert.equal(chainDips(harness).length, 0);
  });

  test(`a contact past the window earns nothing (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    const player = harness.state.playerId;
    contact(harness, { aId: 11, bId: 12, tick: 101, rootId: 'root-1', rootTick: 100, actorId: player });
    const late = 100 + CHAIN_BEAT_WINDOW_TICKS + 5;
    contact(harness, { aId: 12, bId: 13, tick: late, rootId: 'root-1', rootTick: 100, actorId: player });
    settle(harness);
    assert.equal(chainDips(harness).length, 0);
  });
}
