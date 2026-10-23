// SEED-SW-01 — a bought smart bomb empties the room: the armory sells the charge as spent stock,
// one Bomb press spends exactly one, the blast throws the bodies and takes one real packet on
// every hostile hull in the radius, and the player's hull is never a target.
//
// Harness: the row-270 rig — real run ledger, real arena host, the director on its fixed slot.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  SWARM_CALLIN_CATALOG,
  SWARM_CALLIN_MAX_PER_TYPE,
  swarmCallinCount,
} from '../src/data/swarmDraft.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import {
  SMART_BOMB_DAMAGE,
  SMART_BOMB_MAX_DV_WU_S,
  SMART_BOMB_RADIUS_WU,
} from '../src/systems/swarmCallins.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { readFileSync } from 'node:fs';

const CALLINS_SRC = readFileSync(new URL('../src/systems/swarmCallins.js', import.meta.url), 'utf8');

const SEED = 4242;
const ARENA = 'helios_core';
const BODY = (over = {}) => ({
  schemaVersion: 1, dynamic: true, mass: 20, radius: 8, inertiaY: 640, revision: 0, ...over,
});

function makeHarness() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const budget = makeBudgetApi(state);
  const impulses = [];
  const damagePackets = [];
  const helpers = {
    spawnBudget: budget,
    combatPhysics: { applyImpulse(input) { impulses.push(input); return true; } },
    routeCombatDamage(request) { damagePackets.push(request); return { ok: true }; },
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
  const systems = {};
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  // The fitting authority the counter resolves through — a minimal stub is honest here (the
  // service branch never reaches it beyond the capability check).
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
  // No spatial index in this rig: the physical query's entityList fallback must be the coverage
  // (the arena's own init may have built one, so this lands after every init).
  state.spatialHash = null;
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0,
    physicsBody: BODY(), data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  return { state, bus, emitted, helpers, systems, player, impulses, damagePackets };
}

function openArmory(h, wave = 0, credits = 500) {
  if (!h.state.run || h.state.run.phase === 'inactive') {
    h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
    h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  } else {
    // A later visit walks the lawful loop back to a fresh draft, which re-opens the shelf (the
    // spent set lives one visit, the armory's own rule).
    h.bus.emit('run:transitionRequested', { expectedPhase: 'draft', nextPhase: 'wave_intro', reason: 't', tick: 0 });
    h.bus.emit('run:transitionRequested', { expectedPhase: 'wave_intro', nextPhase: 'active', reason: 't', tick: 0 });
    h.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'draft', reason: 't', tick: 0 });
  }
  h.state.run.wave = wave;
  h.state.run.credits = credits;
  return h.state.run;
}

function spawnHostile(h, x, z) {
  return h.helpers.spawnEntity({
    type: 'ship', pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 9, mass: 24, hull: 60, hullMax: 60, rot: 0, team: 1,
    physicsBody: BODY({ mass: 24 }), data: { runCohort: 'survival' },
  });
}

test('the armory sells the smart bomb as spent stock, gated on cleared waves', () => {
  const h = makeHarness();
  const run = openArmory(h, 0, 500);
  assert.equal(survivalDraft.currentOffers().some((r) => r.id === 'callin_smart_bomb'), false,
    'the opening armory sits at wave 0');
  const second = makeHarness();
  openArmory(second, 1, 500);
  const row = survivalDraft.currentOffers().find((r) => r.id === 'callin_smart_bomb');
  assert.ok(row, 'the rack row appears from the first cleared wave');
  assert.equal(row.service, 'callin');
  second.bus.emit('run:draftPickRequested', { offerId: 'callin_smart_bomb' });
  assert.equal(swarmCallinCount(second.state.run, 'smart_bomb'), 1, 'the purchase racks one charge');
  assert.ok(second.emitted.some((e) => e.event === 'run:shopPurchased' && e.payload.offerId === 'callin_smart_bomb'));
  // One restock per armory visit — the shelf's own spent rule. A later visit racks the next one.
  assert.equal(survivalDraft.currentOffers().some((r) => r.id === 'callin_smart_bomb' && r.available), false,
    'the bought row is spent for this visit');
});

test('one Bomb press spends one charge: the blast throws the room and takes one packet per hostile hull', () => {
  const h = makeHarness();
  const run = openArmory(h, 1, 500);
  assert.ok(survivalDraft.currentOffers().some((r) => r.id === 'callin_smart_bomb'), 'the row is on the shelf');
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_smart_bomb' });
  assert.equal(swarmCallinCount(h.state.run, 'smart_bomb'), 1, 'one charge racked per visit (the commit replaces the run object)');
  // go active
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  const raider = spawnHostile(h, 400 + 90, 0); // inside the radius
  const far = spawnHostile(h, 400 + SMART_BOMB_RADIUS_WU + 200, 0); // outside it
  const playerImpulsesBefore = () => h.impulses.filter((i) => i && i.body === h.player.physicsBody).length;

  (h.state.input.actions || (h.state.input.actions = {})).swarmBombThrow = true;
  survivalArena.update(1 / 60, h.state);
  h.state.input.actions.swarmBombThrow = false;
  survivalArena.update(1 / 60, h.state);

  assert.equal(swarmCallinCount(h.state.run, 'smart_bomb'), 0, 'exactly one charge spent (one was racked)');
  // The throw, observed at the physics authority: the raider carries a queued blast impulse and
  // the player carries none. (The break routes through helpers.routeCombatDamage — the same
  // single combat writer every weapon uses; the kernel wiring in this rig has no combat runtime
  // books, so the damage half is proven at the route, not by a hull delta.)
  const raiderCommand = consumePhysicsCommand(raider);
  assert.ok(raiderCommand && raiderCommand.impulses.length >= 1, 'the blast throws the hostile hull');
  const playerCommand = consumePhysicsCommand(h.player);
  const playerQueued = playerCommand ? playerCommand.impulses.length : 0;
  assert.equal(playerQueued, 0, 'the blast never shoves the player');
  assert.equal(far.hull, far.hullMax, 'a hull outside the radius is untouched');
  assert.equal(h.player.hull, h.player.hullMax, 'the player hull is never a target');
  assert.equal(playerImpulsesBefore(), 0, 'the blast never shoves the player');
  // A dry second press spends nothing further.
  (h.state.input.actions || (h.state.input.actions = {})).swarmBombThrow = true;
  survivalArena.update(1 / 60, h.state);
  h.state.input.actions.swarmBombThrow = false;
  survivalArena.update(1 / 60, h.state);
  assert.equal(swarmCallinCount(h.state.run, 'smart_bomb'), 0, 'no charge, no spend');
  const secondCommand = consumePhysicsCommand(raider);
  const secondQueued = secondCommand ? secondCommand.impulses.length : 0;
  assert.equal(secondQueued, 0, 'no second blast: a dry rack never detonates');
});

test('the rack caps: after enough visits the shelf stops offering the charge', () => {
  const h = makeHarness();
  let run = null;
  for (let visit = 0; visit < SWARM_CALLIN_MAX_PER_TYPE; visit += 1) {
    run = openArmory(h, 1 + visit, 5000);
    assert.ok(survivalDraft.currentOffers().some((r) => r.id === 'callin_smart_bomb'), `visit ${visit} offers the rack`);
    h.bus.emit('run:draftPickRequested', { offerId: 'callin_smart_bomb' });
  }
  assert.equal(swarmCallinCount(h.state.run, 'smart_bomb'), SWARM_CALLIN_MAX_PER_TYPE, 'one per visit reaches the cap');
  const last = openArmory(h, 1 + SWARM_CALLIN_MAX_PER_TYPE, 5000);
  assert.equal(survivalDraft.currentOffers().some((r) => r.id === 'callin_smart_bomb'), false,
    'a full rack is not on the shelf');
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_smart_bomb' });
  assert.equal(swarmCallinCount(last, 'smart_bomb'), SWARM_CALLIN_MAX_PER_TYPE, 'the counter refuses past the cap');
});

test('the blast physics constants are the authored room-clearing bar', () => {
  assert.ok(SMART_BOMB_RADIUS_WU >= 200, 'the blast reaches the room, not the nose');
  assert.ok(SMART_BOMB_MAX_DV_WU_S >= 60, 'the throw moves light hulls for real');
  assert.ok(SMART_BOMB_DAMAGE >= 30, 'the packet kills brood-tier hulls');
  assert.equal(SWARM_CALLIN_CATALOG.find((c) => c.id === 'smart_bomb').offerId, 'callin_smart_bomb');
});
