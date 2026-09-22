import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAIN_BEAT_DIP_S,
  CHAIN_BEAT_WINDOW_TICKS,
  feel,
} from '../src/render/feel.js';

// F9 — "a chain holds a beat": a player shove/throw whose contact chain reaches a third
// body earns exactly one extra hit-stop dip. Two-body contacts, NPC-only chains, and
// contacts past the window earn nothing; a second chain later earns its own.

const VISION = 'the best moment is three bodies agreeing — time should acknowledge it once';

function makeHost() {
  const triggers = [];
  const host = Object.create(feel);
  host.state = {
    mode: 'flight',
    playerId: 'player',
    tick: 0,
    settings: { video: { motionReduce: false } },
    ui: {},
    entities: new Map(),
    render: { cameraCtrl: { addTrauma() {}, impactKick() {} } },
  };
  host._modalClear = () => true;
  host._trigger = (hsDur) => triggers.push(hsDur);
  host._ensureVignette = () => null;
  host._ensureHullCrit = () => null;
  host._updateSpeedLines = () => {};
  host._mountSpeedLines = () => {};
  host.timeEffects = { set() {}, clear() {} };
  host._hsTimer = 0;
  host._hsRampIn = 0;
  host._hsFreezeTimer = 0;
  host._hsRequest = { scale: 0.12 };
  host._collisionHitstopCooldown = 0;
  host._armedCollisionDeltaV = 0;
  host._armedCollisionTick = null;
  host._armedCollisionAId = null;
  host._armedCollisionBId = null;
  host._pendingCollisionFeel = null;
  host._collisionFeelScratch = {};
  host._collisionFeelContext = {};
  host._chainBeats = new Map();
  host._chainBeatQueued = 0;
  host._fovPunch = 0;
  host._fovPunchApplied = 0;
  host._vig = 0;
  host._vigEl = null;
  host._hullCritOn = false;
  host._hullCritDepth = 1;
  host._hullCritEl = null;
  return { host, triggers };
}

function consequence(rootId, targetId, otherId, tick, actorId = 'player', rootTick = tick - 1) {
  return {
    exchangedMomentum: 600,
    deltaV: 30,
    feelDeltaV: 30,
    tick,
    targetId,
    otherId,
    provenance: { actorId, weaponId: 'massline', tag: 'massline', tick: rootTick, rootId },
  };
}

function runFrames(host, count, frameDt = 1 / 60) {
  for (let i = 0; i < count; i++) host.frame(frameDt, host.state);
}

test('a three-body chain from one player release earns exactly one extra dip', () => {
  const { host, triggers } = makeHost();

  // Player throws X into A — a two-body contact: its own dip, nothing extra.
  host._onCollisionConsequence(consequence('r1', 'x', 'a', 10));
  runFrames(host, 20);
  assert.equal(triggers.length, 1, `${VISION}: first contact is its own dip only`);

  // The same release's chain reaches B — the third body. Its contact dips, then once
  // that dip clears the chain beat lands: exactly one extra hit-stop.
  host._onCollisionConsequence(consequence('r1', 'x', 'b', 20));
  runFrames(host, 20);
  assert.equal(triggers.length, 3,
    `${VISION}: third-body contact dips once more (got ${triggers.length} triggers)`);
  assert.equal(triggers[2], CHAIN_BEAT_DIP_S,
    `${VISION}: the extra beat is the chain dip, not another contact curve`);

  // A later contact on the same root is just a contact — the beat fired once per chain.
  host._onCollisionConsequence(consequence('r1', 'x', 'c', 40));
  runFrames(host, 20);
  assert.equal(triggers.length, 4,
    `${VISION}: subsequent contacts on a spent chain do not stack dips`);
});

test('a two-body contact and an NPC-only chain stay silent', () => {
  const { host, triggers } = makeHost();

  // Two bodies meeting twice under a player root: never a third body, never an extra dip.
  host._onCollisionConsequence(consequence('r2', 'x', 'a', 10));
  runFrames(host, 20);
  host._onCollisionConsequence(consequence('r2', 'x', 'a', 30));
  runFrames(host, 20);
  assert.equal(triggers.length, 2,
    `${VISION}: a two-body hit does not get the extra dip`);

  // An NPC-caused chain reaching a third body earns nothing — the joke belongs to the player.
  host._onCollisionConsequence(consequence('r3', 'x', 'a', 50, 'npc-7'));
  runFrames(host, 20);
  host._onCollisionConsequence(consequence('r3', 'x', 'b', 60, 'npc-7'));
  runFrames(host, 20);
  assert.equal(triggers.length, 4,
    `${VISION}: NPC-only collisions never earn the chain beat`);
});

test('a second chain later earns its own beat; a stale chain earns nothing', () => {
  const { host, triggers } = makeHost();

  host._onCollisionConsequence(consequence('r4', 'x', 'a', 10));
  runFrames(host, 20);
  host._onCollisionConsequence(consequence('r4', 'x', 'b', 20));
  runFrames(host, 20);
  assert.equal(triggers.length, 3, `${VISION}: first chain beats once`);

  // A different player release later — a new causal root — earns its own extra dip.
  host._onCollisionConsequence(consequence('r5', 'y', 'c', 80));
  runFrames(host, 20);
  host._onCollisionConsequence(consequence('r5', 'y', 'd', 90));
  runFrames(host, 20);
  assert.equal(triggers.length, 6,
    `${VISION}: a second chain later does earn the beat`);

  // A contact arriving long after its root reads as a new event, not a chain beat.
  // The root was struck at tick 99; the third body lands far past the window.
  const lateTick = 100 + CHAIN_BEAT_WINDOW_TICKS + 30;
  host._onCollisionConsequence(consequence('r6', 'x', 'a', 100, 'player', 99));
  runFrames(host, 20);
  host._onCollisionConsequence(consequence('r6', 'x', 'b', lateTick, 'player', 99));
  runFrames(host, 20);
  assert.equal(triggers.length, 8,
    `${VISION}: a contact past the window is not the same joke`);
});
