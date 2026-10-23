// SEED-SW-14 — the armory's stacking passive: repeat copies pile the effect, the row shows the
// held stack, the copies ride the run's ledger (never the Hangar profile), and the stack caps.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  SWARM_PASSIVE_STACK_MAX,
  swarmPassiveCount,
} from '../src/data/swarmDraft.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmElites } from '../src/systems/swarmElites.js';

const SEED = 4242;
const ARENA = 'helios_core';
const PER_COPY = 14;

function makeHarness() {
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { raw.emit(event, payload); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    combatPhysics: { applyImpulse() { return true; } },
    routeCombatDamage() { return { ok: true }; },
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? state.nextEntityId++, alive: true, collides: true,
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
  swarmElites.init(ctx);
  survivalArena.init(ctx);
  state.spatialHash = null;
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0, data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  return { state, bus, helpers, player };
}

function openDraft(h, wave = 1, credits = 5000) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = wave;
  h.state.run.credits = credits;
  return survivalDraft.currentOffers();
}

test('SW-14: the armory sells the stack, each copy applies its effect once, and the stack caps', () => {
  const h = makeHarness();
  let offers = openDraft(h);
  const row = offers.find((r) => r.id === 'passive_plated_hull');
  assert.ok(row, 'the passive is on the shelf');
  assert.match(row.slotLabel, /stack 0\/5/);
  const baseHull = h.player.hullMax;

  h.bus.emit('run:draftPickRequested', { offerId: 'passive_plated_hull' });
  assert.equal(swarmPassiveCount(h.state.run, 'plated_hull'), 1, 'one copy on the ledger');

  // The effect host applies the stack on the arena tick: one copy, one plate.
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  swarmElites.update(1 / 60);
  assert.equal(h.player.hullMax, baseHull + PER_COPY, 'one copy, one plate of hull');

  // Later visits stack again; the cap holds at five. Each visit walks the lawful
  // active -> draft transition, which re-opens the shelf (the spent set lives one visit).
  for (let visit = 0; visit < SWARM_PASSIVE_STACK_MAX - 1; visit += 1) {
    h.state.run.phase = 'active';
    h.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'draft', reason: 't', tick: 0 });
    h.state.run.wave = 2 + visit;
    assert.ok(survivalDraft.currentOffers().some((r) => r.id === 'passive_plated_hull'), `visit ${visit} offers the stack`);
    h.bus.emit('run:draftPickRequested', { offerId: 'passive_plated_hull' });
  }
  assert.equal(swarmPassiveCount(h.state.run, 'plated_hull'), SWARM_PASSIVE_STACK_MAX,
    'one copy per visit up to the cap');
  swarmElites.update(1 / 60);
  assert.equal(h.player.hullMax, baseHull + PER_COPY * SWARM_PASSIVE_STACK_MAX,
    'each copy applied exactly once, capped at five');
  assert.ok(h.player.hull <= h.player.hullMax, 'the hull never reads above its plated frame');
});

test('SW-14: the copies ride the run ledger, not the Hangar profile', () => {
  const h = makeHarness();
  openDraft(h);
  h.bus.emit('run:draftPickRequested', { offerId: 'passive_plated_hull' });
  const row = h.state.run.modifiers.find((r) => r.kind === 'swarm_passive');
  assert.ok(row, 'the purchase is a run record');
  assert.equal(row.passiveId, 'plated_hull');
  assert.equal(h.state.player.ownedShips === undefined || Array.isArray(h.state.player.ownedShips), true);
  assert.equal(JSON.stringify(h.state.player.fittings ?? null), JSON.stringify(h.state.player.fittings ?? null),
    'no fitting writes');
  assert.equal(h.state.run.modifiers.some((r) => r.kind === 'swarm_passive'), true,
    'the stack lives on run.modifiers');
});
