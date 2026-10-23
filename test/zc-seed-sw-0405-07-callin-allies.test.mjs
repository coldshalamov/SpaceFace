// SEED-SW-04/05/07 — the called call-ins: a bought charge deploys through the arena's spawn seam
// the moment the ledger records it, the body is a real team-0 combat body the wave teardown
// removes, the wing is exactly four, and the decoy dies on its battery.
//
// Harness: the SW-01 rig. Each test owns one line; the shared machinery was committed with SW-01.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { swarmCallinCount } from '../src/data/swarmDraft.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { DECOY_TTL_S, TURRET_SHIP_ID, WING_COUNT } from '../src/systems/swarmCallins.js';

const SEED = 4242;
const ARENA = 'helios_core';

function makeHarness() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    combatPhysics: { applyImpulse() { return true; } },
    routeCombatDamage() { return { ok: true }; },
    despawned: [],
    despawnEntity(id) { this.despawned.push(id); const e = state.entities.get(id); if (e) e.alive = false; return true; },
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: spec.id ?? state.nextEntityId++,
        alive: true, collides: true,
        flags: {}, data: { ...(spec.data || {}) },
        pos: { ...(spec.pos || {}) }, vel: { ...(spec.vel || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const systems = {};
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  systems.ships = { fitModule() { return true; }, unfitModule() { return true; }, moduleFitBlocker() { return null; }, grantModule(s) { return s; }, setActiveShip() { return true; } };
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
  state.spatialHash = null;
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0, data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  return { state, bus, emitted, helpers, player };
}

function buyCalled(h, offerId, wave = 2) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = wave;
  h.state.run.credits = 500;
  assert.ok(survivalDraft.currentOffers().some((r) => r.id === offerId), `${offerId} is on the shelf`);
  h.bus.emit('run:draftPickRequested', { offerId });
  // The wave the charge fights in: the run goes active after the shop.
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
}

function teamZeroAllies(h) {
  return [...h.state.entities.values()].filter((e) => e.data && e.data.swarmCallin && e.team === 0 && e.id !== h.player.id);
}

test('SW-04 turret drop: one allied turret body fights beside you and the wave teardown strikes it', () => {
  const h = makeHarness();
  buyCalled(h, 'callin_turret_drop');
  const allies = teamZeroAllies(h);
  assert.equal(allies.length, 1, 'one called body');
  const turret = allies[0];
  assert.equal(turret.data.swarmCallin, 'turret_drop');
  assert.ok(turret.hullMax > 0 && turret.data.ai, 'a real combat body with its own AI');
  assert.ok(String(TURRET_SHIP_ID).length > 0);
  assert.ok(h.emitted.some((e) => e.event === 'swarm:callinDeployed' && e.payload.callinId === 'turret_drop'));
  // The wave teardown removes the called body with the room.
  survivalArena._teardown ? survivalArena._teardown('wave_cleared') : survivalArena.destroy();
  assert.equal(turret.alive, false, 'the turret leaves with its wave');
});

test('SW-05 drone wing: four escorts, no more, and they leave with the wave', () => {
  const h = makeHarness();
  buyCalled(h, 'callin_drone_wing', 3);
  const allies = teamZeroAllies(h);
  assert.equal(allies.length, WING_COUNT, `the wing is ${WING_COUNT} escorts`);
  assert.ok(allies.every((a) => a.data.swarmCallin === 'drone_wing' && a.data.ai));
  survivalArena._teardown ? survivalArena._teardown('wave_cleared') : survivalArena.destroy();
  assert.ok(allies.every((a) => a.alive === false), 'the wing leaves with its wave');
});

test('SW-07 decoy: a soft lure the pack can latch, dead when its battery runs out', () => {
  const h = makeHarness();
  buyCalled(h, 'callin_decoy', 1);
  const allies = teamZeroAllies(h);
  assert.equal(allies.length, 1, 'one lure');
  const decoy = allies[0];
  assert.equal(decoy.data.swarmCallin, 'decoy');
  // It is itself throwable: the massline admits team-0 ship-class bodies.
  assert.equal(decoy.type, 'ship');
  survivalArena.update(1 / 60, h.state);
  h.state.simTime += DECOY_TTL_S + 1 / 60;
  survivalArena.update(1 / 60, h.state);
  assert.equal(decoy.alive === false || h.helpers.despawned.includes(decoy.id), true,
    'the lure dies like debris when the battery does');
  assert.equal(swarmCallinCount(h.state.run, 'decoy'), 1, 'the ledger row stays (the record is the receipt)');
});
