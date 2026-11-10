// SWARM-07 B7 (build-map row 270) — the Domino + Graviton Heart room legendaries, end to end.
//
// Covers the whole slice: the armory's legendary rows (price, gate, ownership/refusal text), the
// run-record purchase through the real wallet receipt chain, the Domino enqueue→fixed-tick shove
// through both the real Rapier owner and the Brood engine's typed buffers, the Heart's external
// moving well through the real field kernel, lifecycle release, and deterministic replay.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { SWARM_LEGENDARY_RECORD_KIND, SWARM_ROOM_LEGENDARIES, ownedSwarmLegendaryIds } from '../src/data/swarmDraft.js';
import { fields, fieldBodyProfile, fieldVelocityTermApplies } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import {
  DOMINO_CUE_ID,
  DOMINO_MAX_DV_WU_S,
  DOMINO_RADIUS_WU,
  HEART_FIELD_ID,
  HEART_RADIUS_WU,
  dominoDeltaVelocity,
} from '../src/systems/swarmLegendaries.js';
import { offerCardLines } from '../src/ui/screens/crucibleDraft.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

const BODY = (over = {}) => ({
  schemaVersion: 1, dynamic: true, mass: 20, radius: 8, inertiaY: 640, revision: 0, ...over,
});

function makeHarness({ port = null } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const impulses = [];
  const helpers = {
    spawnBudget: budget,
    combatPhysics: port || {
      applyImpulse(input) { impulses.push(input); return true; },
    },
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: spec.id ?? state.nextEntityId++,
        occupantGeneration: 1,
        alive: spec.alive !== false,
        collides: spec.collides !== false,
        flags: { ...(spec.flags || {}) },
        data: { ...(spec.data || {}) },
        pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 },
        prevPos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  // The registry seam both directors resolve through. `ships` is the fitting authority — the
  // legendary path never reaches it beyond the capability check, so a minimal stub is honest.
  const systems = {};
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  systems.ships = {
    fitModule() { return true; },
    unfitModule() { return true; },
    moduleFitBlocker() { return null; },
    grantModule(spec) { return spec; },
    setActiveShip() { return true; },
  };
  systems.fields = fields;
  systems.swarmArena = swarmArena;
  systems.survivalDraft = survivalDraft;
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  fields.init(ctx);
  survivalDraft.init(ctx);
  swarmArena.init(ctx);
  survivalArena.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0,
    physicsBody: BODY(), data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  return { state, bus, emitted, helpers, systems, player, impulses, ctx };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginSwarm(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
  });
  return h.state.run;
}

function openArmory(h, wave = 0, credits = 500) {
  beginSwarm(h);
  assert.equal(h.state.run.phase, 'loadout');
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
  });
  assert.equal(h.state.run.phase, 'draft');
  h.state.run.wave = wave;
  h.state.run.credits = credits;
  return h.state.run;
}

function pick(h, offerId) {
  h.bus.emit('run:draftPickRequested', { offerId });
}

function goActive(h, wave = null) {
  if (wave != null) h.state.run.wave = wave;
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
}

function tickArena(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalArena.update(DT, h.state);
  }
}

function spawnEnemy(h, pos, extra = {}) {
  return h.helpers.spawnEntity({
    type: 'ship', pos, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 50, hullMax: 50, rot: 0,
    physicsBody: BODY(), data: { runCohort: 'survival' }, ...extra,
  });
}

// ── armory surface ────────────────────────────────────────────────────────────

test('both legendaries ride the service counter at their gated waves with names, prices and effects', () => {
  const h = makeHarness();
  openArmory(h, 3);
  let offers = survivalDraft.currentOffers();
  const domino = offers.find((o) => o.id === 'legendary_domino');
  assert.ok(domino, 'Domino is on the shelf from wave 3');
  assert.equal(domino.name, 'Domino');
  assert.equal(domino.price, SWARM_ROOM_LEGENDARIES[0].price);
  assert.equal(domino.price, 76);
  assert.equal(domino.category, 'Service');
  assert.equal(domino.slotLabel, 'Legendary · lasts this run · uses no hardpoint');
  assert.equal(domino.blurb, 'Every credited kill shoves nearby bodies outward.');
  assert.equal(domino.available, true);
  assert.equal(offers.some((o) => o.id === 'legendary_graviton_heart'), false,
    'the Heart is gated to wave 5');

  h.state.run.wave = 5;
  offers = survivalDraft.currentOffers();
  const heart = offers.find((o) => o.id === 'legendary_graviton_heart');
  assert.ok(heart, 'the Heart is on the shelf from wave 5');
  assert.equal(heart.name, 'Graviton Heart');
  assert.equal(heart.price, 112);
  assert.equal(heart.blurb, 'A weak gravity well follows your ship and pulls nearby bodies inward.');

  const lines = offerCardLines(heart, h.state);
  assert.equal(lines.verb, 'Graviton Heart');
  assert.equal(lines.name, 'Graviton Heart');
  assert.match(lines.slot, /Legendary/);
  assert.match(lines.blurb, /gravity well/);
});

test('insufficient credit rows refuse with a priced reason and no charge', () => {
  const h = makeHarness();
  const run = openArmory(h, 3, 10);
  const offer = survivalDraft.currentOffers().find((o) => o.id === 'legendary_domino');
  assert.equal(offer.available, false);
  assert.equal(offer.unavailableReason, 'Save 66 more cr');
  const spentBefore = named(h.emitted, 'run:spent').length;
  pick(h, 'legendary_domino');
  assert.equal(named(h.emitted, 'run:spent').length, spentBefore, 'the wallet never charged');
  assert.equal(named(h.emitted, 'run:spendRejected').length, 0,
    'the row is refused at the shelf — the request never reaches the wallet');
  assert.equal(run.credits, 10);
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), []);
  assert.equal(survivalDraft.lastNotice(), 'Save 66 more cr');
});

// ── purchase path ─────────────────────────────────────────────────────────────

test('a purchase charges exactly once, records the run record, and can never re-buy', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  const specsBefore = JSON.stringify(h.state.player.ownedShips);

  pick(h, 'legendary_domino');
  assert.equal(h.state.run.credits, 424, 'exactly the listed price leaves the wallet');
  assert.equal(named(h.emitted, 'run:spent').filter((e) => e.payload.credits === 76).length, 1);
  assert.equal(named(h.emitted, 'run:shopPurchased').filter((e) => e.payload.offerId === 'legendary_domino').length, 1);
  const records = h.state.run.modifiers.filter((r) => r.kind === SWARM_LEGENDARY_RECORD_KIND);
  assert.equal(records.length, 1);
  assert.equal(records[0].legendaryId, 'domino');
  assert.equal(records[0].offerId, 'legendary_domino');
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), ['domino']);
  assert.equal(JSON.stringify(h.state.player.ownedShips), specsBefore,
    'the purchase leaves compiled fittings untouched');

  // The row stays on the shelf but is marked owned, never purchasable again.
  const after = survivalDraft.currentOffers().find((o) => o.id === 'legendary_domino');
  assert.equal(after.available, false);
  assert.equal(after.unavailableReason, 'Owned for this run');
  pick(h, 'legendary_domino');
  assert.equal(h.state.run.credits, 424, 'a second buy cannot charge');
  assert.equal(h.state.run.modifiers.filter((r) => r.kind === SWARM_LEGENDARY_RECORD_KIND).length, 1);
});

test('ownership survives a re-opened armory and a hull switch, and expires with the run', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_domino');
  pick(h, 'legendary_graviton_heart');
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), ['domino', 'graviton_heart']);

  // A second armory opening re-reads the ledger — the rows are still owned.
  h.bus.emit('run:transitioned', { phase: 'draft' });
  const offers = survivalDraft.currentOffers();
  assert.equal(offers.find((o) => o.id === 'legendary_domino').unavailableReason, 'Owned for this run');
  assert.equal(offers.find((o) => o.id === 'legendary_graviton_heart').unavailableReason, 'Owned for this run');

  // A hull switch is profile-side; the run record still owns the legendaries.
  h.state.player.activeShipIndex = 1;
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), ['domino', 'graviton_heart']);
  h.state.player.activeShipIndex = 0;

  // The run ends; ownership is a run receipt, so the effects die with it on the next tick.
  goActive(h);
  tickArena(h);
  assert.equal(survivalArena._legendaries.legendaryState().heart, true, 'the Heart well was live');
  h.bus.emit('run:endRequested', { outcome: 'aborted', reason: 't' });
  tickArena(h);
  assert.equal(survivalArena._legendaries.legendaryState().heart, false);
  assert.equal(fields.hasExternal(HEART_FIELD_ID), false);
});

// ── Domino geometry ───────────────────────────────────────────────────────────

test('dominoDeltaVelocity: linear falloff outward, zero at center and outside the radius', () => {
  assert.deepEqual(dominoDeltaVelocity({ x: 0, z: 0 }, { x: 60, z: 0 }), { x: 15, z: 0 });
  assert.deepEqual(dominoDeltaVelocity({ x: 0, z: 0 }, { x: 0, z: -60 }), { x: 0, z: -15 });
  assert.deepEqual(dominoDeltaVelocity({ x: 0, z: 0 }, { x: 0, z: 0 }), { x: 0, z: 0 });
  assert.deepEqual(dominoDeltaVelocity({ x: 0, z: 0 }, { x: DOMINO_RADIUS_WU, z: 0 }), { x: 0, z: 0 });
  assert.deepEqual(dominoDeltaVelocity({ x: 0, z: 0 }, { x: 400, z: 0 }), { x: 0, z: 0 });
  const near = dominoDeltaVelocity({ x: 0, z: 0 }, { x: 3, z: 4 });
  assert(Math.hypot(near.x, near.z) <= DOMINO_MAX_DV_WU_S);
});

// ── Domino ship delivery through the real Rapier owner ────────────────────────

test('a credited kill moves an eligible neighbor outward through real Rapier solver steps', async () => {
  const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const h = makeHarness({ port: createSg02CombatPhysicsPort(physics) });
  try {
    openArmory(h, 3, 500);
    pick(h, 'legendary_domino');
    goActive(h);
    const victim = spawnEnemy(h, { x: 400, z: 0 });
    const neighbor = spawnEnemy(h, { x: 460, z: 0 });
    const farNeighbor = spawnEnemy(h, { x: 400, z: -300 });
    const station = h.helpers.spawnEntity({
      type: 'station', pos: { x: 430, z: 0 }, vel: { x: 0, z: 0 },
      radius: 30, mass: 5000, hull: 900, hullMax: 900,
      physicsBody: BODY({ dynamic: false, mass: 5000, radius: 30 }), data: {},
    });
    physics.syncFromEntities(h.state.entityList);

    victim.alive = false;
    physics.syncFromEntities(h.state.entityList);
    h.bus.emit('entity:killed', { id: victim.id, killerId: h.player.id, pos: { x: 400, z: 0 } });
    tickArena(h);
    for (let i = 0; i < 30; i++) physics.step(DT);

    assert(neighbor.vel.x > 1, `neighbor gains outward +x velocity, got ${neighbor.vel.x}`);
    assert(Math.abs(neighbor.vel.z) < 0.01, 'the shove is radial — no tangential drift');
    assert(Math.hypot(h.player.vel.x, h.player.vel.z) < 0.001, 'the player is never shoved');
    assert(Math.hypot(station.vel.x, station.vel.z) < 0.001, 'anchored bodies never move');
    assert(Math.hypot(farNeighbor.vel.x, farNeighbor.vel.z) < 0.001, 'outside the radius is untouched');

    // A duplicate death report of the same body is one shove, not two.
    const vxAfterFirst = neighbor.vel.x;
    h.bus.emit('entity:killed', { id: victim.id, killerId: h.player.id, pos: { x: 400, z: 0 } });
    tickArena(h);
    for (let i = 0; i < 30; i++) physics.step(DT);
    assert(Math.abs(neighbor.vel.x - vxAfterFirst) < 1, `the ledger deduplicates the same body: ${neighbor.vel.x} vs ${vxAfterFirst}`);

    // A new body object reusing the id is a new life — it shoves again.
    h.state.entities.delete(victim.id);
    const reborn = { ...victim, alive: true, data: { runCohort: 'survival' } };
    h.state.entities.set(victim.id, reborn);
    reborn.alive = false;
    h.bus.emit('entity:killed', { id: victim.id, killerId: h.player.id, pos: { x: 400, z: 0 } });
    tickArena(h);
    assert(h.impulses.length === 0, 'the port path is the real owner, not the capture seam');
  } finally {
    physics.dispose();
  }
});

test('death callbacks only enqueue — the shove lands on the fixed tick, in kill order', () => {
  const h = makeHarness();
  openArmory(h, 3, 500);
  pick(h, 'legendary_domino');
  goActive(h);
  const v1 = spawnEnemy(h, { x: 100, z: 0 });
  const v2 = spawnEnemy(h, { x: 500, z: 0 });
  const n1 = spawnEnemy(h, { x: 160, z: 0 });
  const n2 = spawnEnemy(h, { x: 440, z: 0 });

  h.bus.emit('entity:killed', { id: v1.id, killerId: h.player.id, pos: { x: 100, z: 0 } });
  h.bus.emit('entity:killed', { id: v2.id, killerId: h.player.id, pos: { x: 500, z: 0 } });
  assert.equal(h.impulses.length, 0, 'nothing moves inside the callback');
  assert.equal(survivalArena._legendaries.legendaryState().pending, 2);

  tickArena(h);
  assert.equal(h.impulses.length, 2);
  assert.equal(h.impulses[0].entityId, n1.id, 'deaths process in stable kill order');
  assert.equal(h.impulses[1].entityId, n2.id);
  assert(h.impulses[0].impulse.x > 0 && h.impulses[1].impulse.x < 0, 'each shove points outward');
  assert.equal(h.impulses[0].kind || h.impulses[0].tag, 'swarm_legendary_domino');
  const cue = named(h.emitted, 'audio:cue').filter((e) => e.payload.id === DOMINO_CUE_ID);
  assert.equal(cue.length, 1, 'two deaths share the throttled texture cue');

  // A kill nobody credited — not the player's — never queues.
  const stray = spawnEnemy(h, { x: 100, z: 40 });
  h.bus.emit('entity:killed', { id: stray.id, killerId: 99999, pos: { x: 100, z: 40 } });
  tickArena(h);
  assert.equal(h.impulses.length, 2);
});

// ── Brood parity ──────────────────────────────────────────────────────────────

function broodHarness(h, wave = 5) {
  const brood = swarmArena._brood;
  brood.prepareWave(h.state.run, wave);
  brood.spawnWave(h.state);
  return brood;
}

test('credited Brood deaths report their own positions and shove cells and chain segments', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_domino');
  goActive(h);
  const brood = broodHarness(h);
  assert(brood.census().alive > 2, 'the wave actually materialized');

  // Park two cells at known coordinates: one dies, one survives beside it.
  const bodies = brood._bodies;
  const deadIdx = 0, survivorIdx = 1;
  assert(bodies.alive[deadIdx] === 1 && bodies.alive[survivorIdx] === 1);
  bodies.px[deadIdx] = 100; bodies.pz[deadIdx] = 0;
  bodies.px[survivorIdx] = 160; bodies.pz[survivorIdx] = 0;
  bodies.vx[survivorIdx] = 0; bodies.vz[survivorIdx] = 0;
  // A live chain link beside the death exercises the segment path, not a ship vx.
  const segs = brood._segs;
  segs.alive[0] = 1; segs.alive[1] = 1;
  segs.x[0] = 220; segs.z[0] = 0;
  segs.x[1] = 130; segs.z[1] = 0;
  segs.vx[1] = 0; segs.vz[1] = 0;

  const batches = named(h.emitted, 'swarm:broodDeathPositions');
  brood._killDirectForTest(deadIdx, 'direct');
  const after = named(h.emitted, 'swarm:broodDeathPositions');
  assert.equal(after.length, batches.length + 1);
  const deaths = after.at(-1).payload.deaths;
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].key, `cell:${bodies.serial[deadIdx]}`);
  assert.deepEqual(deaths[0].pos, { x: 100, z: 0 }, 'the receipt carries the cell\'s own last position');

  tickArena(h);
  assert(bodies.vx[survivorIdx] > 1, `the surviving cell is shoved outward, got ${bodies.vx[survivorIdx]}`);

  // Segment death → the surviving link flexes through its own velocity buffer.
  brood._killSegDirectForTest(0, 'direct');
  const segBatch = named(h.emitted, 'swarm:broodDeathPositions').at(-1).payload.deaths;
  assert.equal(segBatch[0].key, 'seg:0');
  assert.deepEqual(segBatch[0].pos, { x: 220, z: 0 });
  segs.vx[1] = 0; segs.vz[1] = 0;
  tickArena(h);
  assert(Math.abs(segs.vx[1]) > 1, `the surviving segment takes the shove, got ${segs.vx[1]}`);

  // A replayed batch is a duplicate — the director's ledger answers one shove per death key.
  const vxBefore = segs.vx[1];
  h.bus.emit('swarm:broodDeathPositions', named(h.emitted, 'swarm:broodDeathPositions').at(-1).payload);
  tickArena(h);
  assert.equal(segs.vx[1], vxBefore, 'a duplicated batch cannot re-shove');
});

test('environmental Brood deaths never reach the Domino ledger', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_domino');
  goActive(h);
  const brood = broodHarness(h);
  const bodies = brood._bodies;
  bodies.px[0] = 300; bodies.pz[0] = 0;
  const before = named(h.emitted, 'swarm:broodDeathPositions').length;
  // A blast nobody authored is environmental — credited=false on the kill path.
  brood.onExplosion({ pos: { x: 300, z: 0 }, radius: 40, ownerId: 99999 });
  assert.equal(named(h.emitted, 'swarm:broodDeathPositions').length, before);
  tickArena(h);
  assert.equal(h.impulses.length, 0, 'no credited death, no shove');
});

// ── Graviton Heart ────────────────────────────────────────────────────────────

test('the Heart keeps exactly one external well on the hull, follows it, and pulls inward', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_graviton_heart');
  goActive(h);
  h.player.pos = { x: 1000, z: -250 };
  const body = spawnEnemy(h, { x: 1080, z: -250 });

  tickArena(h);
  assert.equal(fields.hasExternal(HEART_FIELD_ID), true);
  let list = fields.kernelList().filter((f) => f.id === HEART_FIELD_ID);
  assert.equal(list.length, 1, 'exactly one Heart field exists');
  assert.deepEqual({ x: list[0].center.x, z: list[0].center.z }, { x: 1000, z: -250 });
  assert.equal(list[0].kind, 'well');
  assert.equal(list[0].radius, HEART_RADIUS_WU);
  assert.deepEqual(list[0].wellConsequences, { grindPriming: false, exitHitstun: false },
    'the gathering well cannot grind or release exit stun');
  assert(list[0].tag === 'external', 'external fields never enter a save');

  // Real-kernel force check first, while the body is inside the radius: the acceleration on a
  // nearby body points at the player.
  const profile = fieldBodyProfile(body, h.state);
  const vel = fieldVelocityTermApplies(body, profile) ? body.vel : null;
  const accel = sampleFieldAcceleration(body.pos, vel, fields.kernelList(), h.state.simTime, profile);
  const toPlayer = { x: 1000 - body.pos.x, z: -250 - body.pos.z };
  const dot = accel.ax * toPlayer.x + accel.az * toPlayer.z;
  assert(dot > 0, `the pull points toward the hull, got (${accel.ax}, ${accel.az})`);

  // Moving the hull moves the well; more ticks never register a second one.
  h.player.pos = { x: 640, z: 120 };
  tickArena(h, 3);
  list = fields.kernelList().filter((f) => f.id === HEART_FIELD_ID);
  assert.equal(list.length, 1);
  assert.deepEqual({ x: list[0].center.x, z: list[0].center.z }, { x: 640, z: 120 });

  // Serialization drops externals — a Continue can never restore an unowned well.
  assert.equal(fields.serialize().fields.some((f) => f.id === HEART_FIELD_ID), false);

  // No consequence receipts are emitted for the gathering well.
  assert.equal(named(h.emitted, 'well:grind').length, 0);
  assert.equal(named(h.emitted, 'combat:hitstunImpulse').length, 0);
});

test('the Heart gathers the Brood inward relative to an identical unequipped control', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_graviton_heart');
  goActive(h);
  const brood = broodHarness(h);
  const bodies = brood._bodies;
  // Park every live cell at the same spot east of the hull so the only difference is the well.
  for (let i = 0; i < bodies.alive.length; i++) {
    if (!bodies.alive[i]) continue;
    bodies.px[i] = 520; bodies.pz[i] = 0;
    bodies.vx[i] = 0; bodies.vz[i] = 0;
  }
  h.player.pos = { x: 400, z: 0 };

  const distToHull = () => {
    let n = 0, sum = 0;
    for (let i = 0; i < bodies.alive.length; i++) {
      if (!bodies.alive[i]) continue;
      n += 1;
      sum += Math.hypot(bodies.px[i] - h.player.pos.x, bodies.pz[i] - h.player.pos.z);
    }
    return n ? sum / n : 0;
  };

  // Control: a standalone engine over the SAME run/state but a field list that never sees the
  // Heart — identical plan, identical parking, so the only difference is the well's pull. (A
  // second makeHarness would rebind the swarmArena singleton and corrupt h's engine.)
  const controlBrood = createBroodEngine({
    bus: null,
    getState: () => h.state,
    fieldList: () => [],
    routeDamage: () => null,
  });
  controlBrood.prepareWave(h.state.run, 5);
  controlBrood.spawnWave(h.state);
  const cb = controlBrood._bodies;
  for (let i = 0; i < cb.alive.length; i++) {
    if (!cb.alive[i]) continue;
    cb.px[i] = 520; cb.pz[i] = 0; cb.vx[i] = 0; cb.vz[i] = 0;
  }
  const controlDist = () => {
    let n = 0, sum = 0;
    for (let i = 0; i < cb.alive.length; i++) {
      if (!cb.alive[i]) continue;
      n += 1;
      sum += Math.hypot(cb.px[i] - 400, cb.pz[i]);
    }
    return n ? sum / n : 0;
  };

  const equippedStart = distToHull();
  const controlStart = controlDist();
  tickArena(h, 6); // the field registers inside the hosted tick, then steps gather
  for (let i = 0; i < 30; i++) {
    h.state.simTime += DT;
    brood.step(h.state);
    controlBrood.step(h.state);
  }
  const equippedDelta = equippedStart - distToHull();
  const controlDelta = controlStart - controlDist();
  assert(equippedDelta > controlDelta + 0.5,
    `Heart-equipped flock closes on the hull (${equippedDelta.toFixed(2)}wu) vs control (${controlDelta.toFixed(2)}wu)`);
});

// ── lifecycle ─────────────────────────────────────────────────────────────────

test('wave clear releases runtime effects, keeps the purchase, and the next wave re-arms', () => {
  const h = makeHarness();
  openArmory(h, 5, 500);
  pick(h, 'legendary_graviton_heart');
  pick(h, 'legendary_domino');
  goActive(h);
  const victim = spawnEnemy(h, { x: 600, z: 0 });
  h.bus.emit('entity:killed', { id: victim.id, killerId: h.player.id, pos: { x: 600, z: 0 } });
  tickArena(h);
  assert.equal(fields.hasExternal(HEART_FIELD_ID), true);

  h.bus.emit('run:waveCleared', { wave: 5 });
  assert.equal(fields.hasExternal(HEART_FIELD_ID), false, 'the well leaves with the room');
  assert.equal(survivalArena._legendaries.legendaryState().pending, 0);
  assert.deepEqual(ownedSwarmLegendaryIds(h.state.run), ['graviton_heart', 'domino'],
    'purchases survive the wave boundary');

  goActive(h, 6);
  tickArena(h);
  assert.equal(fields.hasExternal(HEART_FIELD_ID), true, 'the owned Heart re-arms next wave');
});

test('run end, New Game, and save restore drop the field, the queue and stale ownership effects', () => {
  for (const event of ['run:ended', 'game:new', 'save:loaded']) {
    const h = makeHarness();
    openArmory(h, 5, 500);
    pick(h, 'legendary_graviton_heart');
    goActive(h);
    const victim = spawnEnemy(h, { x: 700, z: 0 });
    h.state.run.modifiers.push({
      kind: SWARM_LEGENDARY_RECORD_KIND, offerId: 'legendary_domino', legendaryId: 'domino', wave: 5,
    });
    h.bus.emit('entity:killed', { id: victim.id, killerId: h.player.id, pos: { x: 700, z: 0 } });
    tickArena(h);
    assert.equal(fields.hasExternal(HEART_FIELD_ID), true, `${event} setup: well live`);
    // Re-queue so the teardown has pending shoves to drop too.
    const victim2 = spawnEnemy(h, { x: 900, z: 0 });
    h.bus.emit('entity:killed', { id: victim2.id, killerId: h.player.id, pos: { x: 900, z: 0 } });

    if (event === 'run:ended') {
      h.bus.emit('run:endRequested', { outcome: 'aborted', reason: 't' });
      assert.equal(fields.hasExternal(HEART_FIELD_ID), false, 'the end receipt releases the well');
      tickArena(h);
      assert.equal(fields.hasExternal(HEART_FIELD_ID), false, 'the ended run never re-arms');
      assert.equal(survivalArena._legendaries.legendaryState().pending, 0, 'the queue dies with the run');
    } else {
      // game:new / save:loaded tear down synchronously on the event itself.
      h.bus.emit(event, {});
      assert.equal(fields.hasExternal(HEART_FIELD_ID), false, `${event} releases the well`);
      assert.equal(survivalArena._legendaries.legendaryState().pending, 0);
    }
  }
});

// ── determinism ───────────────────────────────────────────────────────────────

test('the same purchase/death/tick sequence replays byte-identically', () => {
  function run() {
    const h = makeHarness();
    openArmory(h, 5, 500);
    pick(h, 'legendary_domino');
    pick(h, 'legendary_graviton_heart');
    goActive(h);
    const v = spawnEnemy(h, { x: 300, z: 0 });
    const n = spawnEnemy(h, { x: 360, z: 0 });
    h.bus.emit('entity:killed', { id: v.id, killerId: h.player.id, pos: { x: 300, z: 0 } });
    tickArena(h, 4);
    const field = fields.kernelList().find((f) => f.id === HEART_FIELD_ID);
    return {
      credits: h.state.run.credits,
      modifiers: h.state.run.modifiers,
      impulses: h.impulses,
      center: field && { x: field.center.x, z: field.center.z },
      nVel: { x: n.vel.x, z: n.vel.z },
      pending: survivalArena._legendaries.legendaryState().pending,
    };
  }
  const a = run();
  const b = run();
  assert.deepEqual(b, a);
});
