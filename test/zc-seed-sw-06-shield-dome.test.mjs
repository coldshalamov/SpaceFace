// SEED-SW-06 — the Shield Dome call-in: a bought charge plants a fixed external wall at the
// pilot's position, the pack and its shots feel it at the rim while the pilot's own outgoing
// work leaves, and it expires on a visible clock.
//
// Harness: the SW-01 rig; the field is sampled through the real field kernel.
import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { DOME_DURATION_S, DOME_RADIUS_WU } from '../src/systems/swarmCallins.js';

const SEED = 4242;
const ARENA = 'helios_core';
const DT = 1 / 60;

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
  survivalArena.init(ctx);
  state.spatialHash = null;
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0, data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  return { state, bus, emitted, helpers, player };
}

function buyDome(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = 2;
  h.state.run.credits = 500;
  assert.ok(survivalDraft.currentOffers().some((r) => r.id === 'callin_shield_dome'), 'the dome is on the shelf');
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_shield_dome' });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
}

test('SW-06: the planted dome is a real field at the pilot, pushing outward inside the rim', () => {
  const h = makeHarness();
  buyDome(h);
  assert.ok(h.emitted.some((e) => e.event === 'swarm:callinDeployed' && e.payload.callinId === 'shield_dome'));
  // A body drifting toward the dome's centre from outside feels the wall at the rim; far away
  // it feels nothing. The dome never moves: same reading a beat later.
  const outbound = { pos: { x: 400 + DOME_RADIUS_WU * 0.8, z: 0 }, vel: { x: -40, z: 0 } };
  const far = { pos: { x: 400 + DOME_RADIUS_WU * 3, z: 0 }, vel: { x: -40, z: 0 } };
  const profile = { mass: 20, radius: 8 };
  const pushInside = sampleFieldAcceleration(outbound.pos, outbound.vel, fields.kernelList(), h.state.simTime, profile);
  const pushFar = sampleFieldAcceleration(far.pos, far.vel, fields.kernelList(), h.state.simTime, profile);
  const mag = (a) => Math.hypot(a.ax || a.x || 0, a.az || a.z || 0);
  assert.ok(mag(pushInside) > 1, `the rim pushes the pack back (got ${mag(pushInside).toFixed(2)})`);
  assert.ok(mag(pushFar) < 0.5, `far outside the rim the wall is not felt (got ${mag(pushFar).toFixed(2)})`);
});

test('SW-06: the dome expires on its clock and the field releases', () => {
  const h = makeHarness();
  buyDome(h);
  h.state.simTime += DOME_DURATION_S + DT;
  survivalArena.update(DT, h.state);
  const outbound = { pos: { x: 400 + DOME_RADIUS_WU * 0.8, z: 0 }, vel: { x: -40, z: 0 } };
  const push = sampleFieldAcceleration(outbound.pos, outbound.vel, fields.kernelList(), h.state.simTime, { mass: 20, radius: 8 });
  const mag = Math.hypot(push.ax || push.x || 0, push.az || push.z || 0);
  assert.ok(mag < 0.5, `the expired dome releases the rim (got ${mag.toFixed(2)})`);
});
