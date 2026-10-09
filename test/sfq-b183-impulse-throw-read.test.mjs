// SFQ-B183 — a shove or slam depicts the actual contact point and direction before its aftermath.
//
// Three pins, one seed (4242):
//   1. The sim owner signs the throw. A physics:impact normal is oriented aId→bId, so the victim
//      (bId) is thrown along +normal and the victim (aId) along −normal; combat:collisionConsequence
//      carries that signed throwDir. An unsigned axis carries NO throwDir — a hole, not a guess.
//   2. The impulse effect renders at the receipt's CONTACT POINT along the signed direction — the
//      structural burst is aimed (hasDir=1) at the throw from the receipt pos, and the throw spray
//      spawns only on the thrown side. Seat and fallback rungs both.
//   3. An unsigned-axis hit renders the honest uncertain read: the burst stays unaimed (hasDir=0),
//      the spray stays bilateral, and impactRead returns a zero axis instead of an invented +X.
//
// Deterministic: seeded state.rng in the sim harness; the presentation harness uses a throwing
// rng to prove the render path never consumes sim randomness (build_map §22 B5 law).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { collisionThrowRead, impactRead } from '../src/render/combat/impactRead.js';
import { vfx } from '../src/render/vfx.js';

void THREE;

const SEED = 4242;

// ── sim-owner harness (pattern: test/collision-tearoff.test.mjs) ─────────────────────────────

function bootSim() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.tick = 500;
  state.world.currentSectorId = 'sector-test';
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const consequences = Object.create(collisionConsequences);
  consequences.init({
    state,
    bus,
    helpers,
    registry: {
      get: (id) => (id === 'combat' ? {
        kernel: { routeDamage() { return { ok: true }; } },
      } : null),
    },
  });
  return { state, bus, helpers, consequences };
}

function makeShip(h, { x = 0, z = 0, vx = 0, vz = 0, mass = 40, radius = 12 } = {}) {
  return h.helpers.spawnEntity({
    type: 'ship', team: 1,
    pos: { x, z }, vel: { x: vx, z: vz }, angVel: 0.1,
    radius, mass, hull: 80, hullMax: 100,
    data: { defId: 'ship_test' },
  });
}

// A contact at x=94 between a wall (static) and a hull that rammed it +X. `normal` follows the
// physics contract: oriented aId→bId.
function impactPayload(a, b, normal, tick = 500) {
  return {
    consequenceKernelVersion: 1,
    tick,
    aId: a.id,
    bId: b.id,
    impulse: 20000,
    dp: 20000,
    pos: { x: 94, z: 0 },
    normal,
    preSolveClosingSpeed: 90,
  };
}

function capture(bus, event) {
  const seen = [];
  bus.on(event, (p) => seen.push(p));
  return seen;
}

// ── presentation harness (pattern: test/causal-vfx-grammar.test.mjs) ─────────────────────────

const PLAYER_ID = 1;
const VICTIM_ID = 9;
const OTHER_ID = 8;

function makeVfxHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  };
  const victim = {
    id: VICTIM_ID, type: 'ship', alive: true,
    pos: { x: 7, z: 2 }, vel: { x: -3, z: 0 }, rot: 0, radius: 8,
  };
  const other = {
    id: OTHER_ID, type: 'ship', alive: true,
    pos: { x: 2, z: 2 }, vel: { x: 4, z: 0 }, rot: 0, radius: 8,
  };
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: VICTIM_ID },
    entities: new Map([[PLAYER_ID, player], [VICTIM_ID, victim], [OTHER_ID, other]]),
    entityList: [player, victim, other],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false, forcedColors: false },
    },
    // Presentation never consumes sim RNG (§22 B5): a read throws.
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
    render: { scene, renderer: { domElement: makeCanvas() } },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });

  const burstReqs = [];
  const composeCalls = [];
  const sprites = [];
  const streaks = [];
  system._spawnArcadeStructuralBurst = (req) => {
    burstReqs.push({
      x: req.x, z: req.z, dirX: req.dirX, dirZ: req.dirZ,
      hasDir: req.hasDir, axisAngle: req.axisAngle,
    });
    return true;
  };
  system._composeImpact = (...args) => {
    composeCalls.push(args);
    return true;
  };
  system._spawnSprite = (sprite, x, y, z, a, b, c, d, e, color, vx, vz, f, angle) => {
    sprites.push({ sprite, x, z, vx, vz, angle });
    return true;
  };
  system._spawnProjectileTrailStreak = (
    x, y, z, life, width, length, alpha, color, vx, vz, dirX, dirZ,
  ) => {
    streaks.push({ x, z, vx, vz, dirX, dirZ });
    return true;
  };
  return { system, state, bus, scene, burstReqs, composeCalls, sprites, streaks, victim, other };
}

function makeCanvas() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].type === type && listeners[i].fn === fn) listeners.splice(i, 1);
      }
    },
    dispatchEvent(event) {
      for (const listener of listeners) {
        if (listener.type === event.type) listener.fn(event);
      }
      return true;
    },
  };
}

function collisionReceipt({ withThrow = true, contact = { x: 6, z: 2 } } = {}) {
  const receipt = {
    schemaVersion: 1,
    tick: 720,
    targetId: VICTIM_ID,
    otherId: OTHER_ID,
    surface: 'terrain',
    exchangedMomentum: 30000,
    deltaV: 40,
    control: 'tumble',
    staggerTicks: 60,
    impactDamage: 12,
    debrisCount: 0,
    pos: contact,
    normal: { x: 1, z: 0 },
    feelDeltaV: 60,
    provenance: { actorId: null, weaponId: null, tag: 'environment', appliedTick: 720 },
  };
  if (withThrow) receipt.throwDir = { x: -1, z: 0 }; // victim thrown back along −normal
  return receipt;
}

// ── the pins ──────────────────────────────────────────────────────────────────────────────────

describe('SFQ-B183 impulse throw read (seed 4242)', { concurrency: false }, () => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  process.on('exit', () => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });

  it('seed 4242: the sim owner signs the throw — +normal for a bId victim, −normal for aId', () => {
    const h = bootSim();
    try {
      // Wall is body a, ramming hull is body b: the solver pushes b along +normal. The wall sits
      // at +X of the victim, so the normal (a→b) points −X and the bounce-back is −X too.
      const wall = makeShip(h, { x: 100, mass: 400 });
      const rammer = makeShip(h, { x: 88, vx: 90 });
      const seen = capture(h.bus, 'combat:collisionConsequence');
      h.consequences._onImpact(impactPayload(wall, rammer, { x: -1, z: 0 }));
      // _resolveContact resolves BOTH bodies; the rammer's own receipt is the one under test.
      const receipts = seen.filter((p) => p.targetId === rammer.id);
      assert.equal(receipts.length, 1, 'one consequence receipt published for the rammer');
      assert.ok(receipts[0].throwDir, 'a signed pair role yields a signed throw');
      assert.ok(Math.abs(receipts[0].throwDir.x + 1) < 1e-9 && Math.abs(receipts[0].throwDir.z) < 1e-9,
        `bId victim is thrown along +normal (−X): ${JSON.stringify(receipts[0].throwDir)}`);
      assert.equal(receipts[0].pos.x, 94, 'the receipt keeps the contact point');

      // Same contact, roles swapped: the victim is body a, so its throw is −normal — still −X,
      // because physics (not id order) decides which way the hull was thrown.
      const wall2 = makeShip(h, { x: 200, mass: 400 });
      const rammer2 = makeShip(h, { x: 188, vx: 90 });
      const seen2 = capture(h.bus, 'combat:collisionConsequence');
      h.state.tick = 501;
      h.consequences._onImpact(impactPayload(rammer2, wall2, { x: 1, z: 0 }, 501));
      const receipts2 = seen2.filter((p) => p.targetId === rammer2.id);
      assert.equal(receipts2.length, 1, 'one consequence receipt for the swapped pair');
      assert.ok(Math.abs(receipts2[0].throwDir.x + 1) < 1e-9 && Math.abs(receipts2[0].throwDir.z) < 1e-9,
        `aId victim is thrown along −normal (still −X): ${JSON.stringify(receipts2[0].throwDir)}`);
    } finally {
      h.consequences.destroy();
      h.bus.clear();
    }
  });

  it('seed 4242: an unsigned axis carries NO throwDir — a hole, not a fabricated direction', () => {
    const h = bootSim();
    try {
      const a = makeShip(h, { x: 300, mass: 60 });
      const b = makeShip(h, { x: 312, vx: -90 });
      const seen = capture(h.bus, 'combat:collisionConsequence');
      h.consequences._onImpact(impactPayload(a, b, { x: 0, z: 0 }));
      const receipts = seen.filter((p) => p.targetId === b.id);
      assert.equal(receipts.length, 1, 'the consequence still publishes');
      assert.equal(false, 'throwDir' in receipts[0], 'an unsigned axis stays a hole on the receipt');
    } finally {
      h.consequences.destroy();
      h.bus.clear();
    }
  });

  it('seed 4242: an impulse effect renders at the receipt contact point along the signed throw', () => {
    const h = makeVfxHarness();
    const receipt = collisionReceipt({ withThrow: true });
    h.system._emitCombatContact = () => false; // drive the fallback rung deterministically
    h.bus.emit('combat:collisionConsequence', receipt);

    const req = h.burstReqs[0];
    assert.ok(req, 'the structural burst request was filled');
    assert.equal(req.x, receipt.pos.x, 'burst anchored at the receipt contact point x');
    assert.equal(req.z, receipt.pos.z, 'burst anchored at the receipt contact point z');
    assert.equal(req.hasDir, 1, 'a signed throw aims the burst (hasDir = 1)');
    assert.ok(Math.abs(req.dirX + 1) < 1e-9 && Math.abs(req.dirZ) < 1e-9,
      `burst direction is the signed throw: ${JSON.stringify({ dirX: req.dirX, dirZ: req.dirZ })}`);

    // The thrown spray: every MOVING element leaves along −X (the static central collapse flash
    // legitimately has vx=0). Nothing may spawn moving +X — that is the unthrown half.
    const allVelX = [...h.sprites.map((s) => s.vx), ...h.streaks.map((s) => s.vx)];
    const moving = allVelX.filter((vx) => Math.abs(vx) > 1e-9);
    assert.ok(moving.length >= 2, `the throw spray drew (${h.sprites.length} sprites, ${h.streaks.length} streaks)`);
    for (const vx of moving) {
      assert.ok(vx < 0, `every moving spray element leaves along the throw (−X), saw vx=${vx}`);
    }
    h.system.destroy();
  });

  it('seed 4242: the seat rung sprays the thrown side; the family burst owns the structural read', () => {
    const h = makeVfxHarness();
    h.system._emitCombatContact = () => true; // the seat drew
    h.bus.emit('combat:collisionConsequence', collisionReceipt({ withThrow: true }));

    // The collision receipt's structural primitives are the ONE family burst below (arcs+shards
    // on a tumble, nothing on a stagger). The seat composes no impact-beats sheet of its own.
    assert.equal(h.composeCalls.length, 0, 'the seat composes no second structural sheet');
    const req = h.burstReqs[0];
    assert.ok(req, 'tumble still fills the structural request');
    assert.equal(req.hasDir, 1, 'the signed throw aims the structural read');
    assert.equal(req.x, 6, 'structural read sits at the receipt contact point');

    const allVelX = [...h.sprites.map((s) => s.vx), ...h.streaks.map((s) => s.vx)];
    const moving = allVelX.filter((vx) => Math.abs(vx) > 1e-9);
    assert.ok(moving.length >= 2, 'the seat drew the one-sided throw fan');
    for (const vx of moving) {
      assert.ok(vx < 0, `seat throw fan leaves along −X only, saw vx=${vx}`);
    }
    h.system.destroy();
  });

  it('seed 4242: an unsigned-axis hit renders the honest uncertain read, both sides, nothing aimed', () => {
    const h = makeVfxHarness();
    h.system._emitCombatContact = () => false;
    h.bus.emit('combat:collisionConsequence', collisionReceipt({ withThrow: false }));

    const req = h.burstReqs[0];
    assert.ok(req, 'the burst request was still filled');
    assert.equal(req.hasDir, 0, 'no signed throw — the burst stays unaimed (hasDir = 0)');
    assert.equal(req.x, 6, 'still anchored at the receipt contact point');

    const spriteVelX = h.sprites.map((s) => s.vx).filter((vx) => Math.abs(vx) > 1e-9);
    const hasNegative = spriteVelX.some((vx) => vx < 0);
    const hasPositive = spriteVelX.some((vx) => vx > 0);
    assert.ok(hasNegative && hasPositive,
      `the unsigned read stays bilateral (−X and +X present): ${JSON.stringify(spriteVelX)}`);
    h.system.destroy();
  });

  it('impactRead/collisionThrowRead: unsigned in, honest zero out — never an invented +X', () => {
    // The old fallback fabricated {x:1, z:0} here.
    const blind = impactRead({ hullHit: true });
    assert.equal(blind.signed, false, 'no approach/impulse/normal — unsigned');
    assert.equal(blind.axisX, 0, 'no fabricated axis x');
    assert.equal(blind.axisZ, 0, 'no fabricated axis z');
    assert.equal(blind.shapeId, 'hull-cone', 'shape class is unchanged');

    const aimed = impactRead({ hullHit: true, approach: { x: 0, z: 40 } });
    assert.equal(aimed.signed, true, 'a signed approach stays signed');
    assert.ok(Math.abs(aimed.axisX) < 1e-9 && Math.abs(aimed.axisZ - 1) < 1e-9,
      'the axis follows the measured impulse');

    assert.equal(collisionThrowRead({}).signed, false, 'no throwDir field — unsigned');
    assert.equal(collisionThrowRead({ throwDir: { x: 0, z: 0 } }).signed, false, 'zero throw — unsigned');
    const thrown = collisionThrowRead({ throwDir: { x: -3, z: 0 } });
    assert.equal(thrown.signed, true, 'a real throw reads signed');
    assert.ok(Math.abs(thrown.x + 1) < 1e-9 && Math.abs(thrown.z) < 1e-9, 'unit throw along −X');
  });
});
