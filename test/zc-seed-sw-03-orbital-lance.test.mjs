// SEED-SW-03 — the Orbital Lance call-in: a bought charge spends once, paints the point for at
// least 0.8 s, then the column lands a real shove on every hostile hull in it. With a line
// latched, the strike lands on the latched target instead of the aim point.
//
// Harness: the SW-01 rig (real run ledger, the director on the arena's fixed slot).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { swarmCallinCount } from '../src/data/swarmDraft.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { LANCE_TELEGRAPH_S } from '../src/systems/swarmCallins.js';

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
  const helpers = {
    spawnBudget: budget,
    combatPhysics: { applyImpulse() { return true; } },
    routeCombatDamage() { return { ok: true }; },
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
  systems.ships = {
    fitModule() { return true; }, unfitModule() { return true; }, moduleFitBlocker() { return null; },
    grantModule(spec) { return spec; }, setActiveShip() { return true; },
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
  state.spatialHash = null;
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0,
    physicsBody: BODY(), data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  return { state, bus, emitted, helpers, systems, player };
}

function openArmory(h, wave = 2, credits = 500) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = wave;
  h.state.run.credits = credits;
  survivalDraft.currentOffers();
}

function pressBomb(h) {
  (h.state.input.actions || (h.state.input.actions = {})).swarmBombThrow = true;
  survivalArena.update(1 / 60, h.state);
  h.state.input.actions.swarmBombThrow = false;
  survivalArena.update(1 / 60, h.state);
}

test('a bought lance paints, then the column lands after the telegraph, not before', () => {
  const h = makeHarness();
  const run = openArmory(h, 2, 500);
  const row = survivalDraft.currentOffers().find((r) => r.id === 'callin_orbital_lance');
  assert.ok(row, 'the lance is on the shelf from the second cleared wave');
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_orbital_lance' });
  assert.equal(swarmCallinCount(h.state.run, 'orbital_lance'), 1, 'one charge racked');

  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  // A hostile hull sitting on the aim point (rot 0 aims +z: x = sin, z = cos).
  const raider = h.helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 320 }, vel: { x: 0, z: 0 },
    radius: 9, mass: 24, hull: 60, hullMax: 60, rot: 0, team: 1,
    physicsBody: BODY({ mass: 24 }), data: { runCohort: 'survival' },
  });

  pressBomb(h);
  assert.equal(swarmCallinCount(h.state.run, 'orbital_lance'), 0, 'the charge spends on the press, not on the landing');
  const telegraphs = h.emitted.filter((e) => e.event === 'swarm:callinTelegraph');
  assert.equal(telegraphs.length, 1, 'one painted marker');
  const paintAt = telegraphs[0].payload.atS;
  assert.ok(paintAt - h.state.simTime >= LANCE_TELEGRAPH_S - 1 / 60, `the paint holds at least ${LANCE_TELEGRAPH_S}s`);
  assert.equal(consumePhysicsCommand(raider), null, 'nothing lands during the telegraph');

  // Advance past the paint; the next tick delivers the column.
  h.state.simTime = paintAt + 1 / 60;
  survivalArena.update(1 / 60, h.state);
  const command = consumePhysicsCommand(raider);
  assert.ok(command && command.impulses.length >= 1, 'the strike lands a real shove on the hull in the column');
  assert.ok(h.emitted.some((e) => e.event === 'swarm:callinStrike' && e.payload.callinId === 'orbital_lance'));
});

test('a latched target takes the strike instead of the aim point', () => {
  const h = makeHarness();
  openArmory(h, 2, 500);
  survivalDraft.currentOffers();
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_orbital_lance' });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  const latched = h.helpers.spawnEntity({
    type: 'wreck', pos: { x: -500, z: 900 }, vel: { x: 0, z: 0 },
    radius: 20, mass: 400, rot: 0, physicsBody: BODY({ mass: 400 }),
    data: { runCohort: 'survival' },
  });
  h.state.player.tether = { active: true, targetId: latched.id };

  pressBomb(h);
  const telegraphs = h.emitted.filter((e) => e.event === 'swarm:callinTelegraph');
  assert.equal(telegraphs.length, 1);
  assert.equal(telegraphs[0].payload.x, latched.pos.x, 'the paint is on the latched target');
  assert.equal(telegraphs[0].payload.z, latched.pos.z);
});

test('the player hull is never a lance target, even standing in the column', () => {
  const h = makeHarness();
  openArmory(h, 2, 500);
  survivalDraft.currentOffers();
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_orbital_lance' });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  pressBomb(h);
  h.state.simTime += LANCE_TELEGRAPH_S + 1 / 60;
  survivalArena.update(1 / 60, h.state);
  const command = consumePhysicsCommand(h.player);
  const queued = command ? command.impulses.length : 0;
  assert.equal(queued, 0, 'the player hull is never a target');
  assert.equal(h.player.hull, h.player.hullMax, 'the player hull takes no packet');
});
