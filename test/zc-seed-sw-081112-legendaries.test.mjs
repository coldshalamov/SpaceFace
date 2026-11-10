// SEED-SW-08/11/12 — the throw-and-room legendaries: Volatile Hulls (a thrown body detonates on
// its first solid impact, credited to the player), Bumper Walls (arena cover throws the pack
// back, per-body cooldown, the player's own contacts unchanged) and Second Sun (every credited
// death ignites what stood close, routed through the combat seam).
//
// Harness: the row-270 rig. The legendaries are purchased through the real armory service path.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  BUMPER_COOLDOWN_S,
  SECOND_SUN_RADIUS_WU,
  VOLATILE_RADIUS_WU,
} from '../src/systems/swarmLegendaries.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import * as phys from '../src/core/physicsAuthority.js';

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
  const portImpulses = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    combatPhysics: { applyImpulse(input) { portImpulses.push(input); return true; } },
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
  // The combat kernel wires its own router during fields.init; the spy goes on AFTER, and the
  // director reads the route at call time, so the packets this rig observes are the real calls.
  const routed = [];
  helpers.routeCombatDamage = (request) => { routed.push(request); return { ok: true }; };
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 200, hullMax: 200, rot: 0,
    physicsBody: BODY(), data: { runCohort: 'survival' },
  });
  state.playerId = player.id;
  return { state, bus, emitted, helpers, player, routed, portImpulses };
}

function ownLegendary(h, offerId, wave) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0 });
  h.state.run.wave = wave;
  h.state.run.credits = 500;
  assert.ok(survivalDraft.currentOffers().some((r) => r.id === offerId), `${offerId} is on the shelf at wave ${wave}`);
  h.bus.emit('run:draftPickRequested', { offerId });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
}

function hostile(h, x, z) {
  return h.helpers.spawnEntity({
    type: 'ship', pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 9, mass: 24, hull: 60, hullMax: 60, rot: 0, team: 1,
    physicsBody: BODY({ mass: 24 }), data: { runCohort: 'survival' },
  });
}

test('SW-08 volatile hulls: a thrown body detonates once on its first solid impact', () => {
  const h = makeHarness();
  ownLegendary(h, 'legendary_volatile_hulls', 4);
  const victim = hostile(h, 600, 0);
  const near = hostile(h, 640, 0);
  const far = hostile(h, 600 + VOLATILE_RADIUS_WU + 300, 0);
  // The thrown hull (other) hits the victim: massline provenance, the player is the actor.
  h.bus.emit('combat:collisionConsequence', {
    targetId: victim.id, otherId: victim.id + 100,
    targetType: 'ship', otherType: 'ship',
    targetHostile: true, damageApplied: true,
    provenance: { actorId: h.state.playerId, tag: 'massline', weaponId: null },
  });
  // The thrown body itself must exist for the blast centre; give the receipt a real pair.
  h.bus.emit('combat:collisionConsequence', {
    targetId: victim.id, otherId: near.id,
    targetType: 'ship', otherType: 'ship',
    targetHostile: true, damageApplied: true,
    provenance: { actorId: h.state.playerId, tag: 'massline', weaponId: null },
  });
  survivalArena.update(1 / 60, h.state);
  const thrownTo = h.portImpulses.filter((i) => i.entityId === near.id);
  assert.ok(thrownTo.length >= 1, 'the blast throws the hull standing next to the impact');
  assert.equal(h.portImpulses.some((i) => i.entityId === far.id), false, 'a hull outside the blast radius is untouched');
  assert.equal(h.portImpulses.some((i) => i.entityId === h.player.id), false, 'the player hull is never a blast target');
  const burned = h.routed.filter((r) => r.targetId === near.id);
  assert.ok(burned.length >= 1, 'the blast routes its packet through the combat seam');
  assert.equal(h.routed.some((r) => r.targetId === h.player.id), false, 'no packet names the player');
});


test('SW-08: a thrown body detonates once — a second identical impact does not re-blast', () => {
  const h = makeHarness();
  ownLegendary(h, 'legendary_volatile_hulls', 4);
  const victim = hostile(h, 600, 0);
  const near = hostile(h, 640, 0);
  for (let i = 0; i < 2; i += 1) {
    h.bus.emit('combat:collisionConsequence', {
      targetId: victim.id, otherId: near.id,
      targetType: 'ship', otherType: 'ship',
      targetHostile: true, damageApplied: true,
      provenance: { actorId: h.state.playerId, tag: 'massline' },
    });
  }
  survivalArena.update(1 / 60, h.state);
  const thrown = h.portImpulses.filter((i) => i.entityId === near.id);
  assert.equal(thrown.length, 1, `exactly one blast for the first impact (got ${thrown.length})`);
});

test('SW-11 bumper walls: cover reflects a hostile body back into the room, the player contacts unchanged', () => {
  const h = makeHarness();
  ownLegendary(h, 'legendary_bumper_walls', 3);
  const pack = hostile(h, 500, 0);
  const rock = h.helpers.spawnEntity({
    type: 'asteroid', pos: { x: 470, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, mass: 900, rot: 0, physicsBody: BODY({ mass: 900 }), data: {},
  });
  h.bus.emit('combat:collisionConsequence', {
    targetId: pack.id, otherId: rock.id,
    targetType: 'ship', otherType: 'asteroid',
    targetHostile: true, damageApplied: false,
    provenance: { actorId: null, tag: 'direct_contact' },
  });
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.portImpulses.some((i) => i.entityId === pack.id), true, 'the cover throws the hostile back');
  // Per-body cooldown: an immediate second contact reflects nothing.
  h.bus.emit('combat:collisionConsequence', {
    targetId: pack.id, otherId: rock.id,
    targetType: 'ship', otherType: 'asteroid',
    targetHostile: true, damageApplied: false,
    provenance: { actorId: null, tag: 'direct_contact' },
  });
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.portImpulses.filter((i) => i.entityId === pack.id).length, 1, 'the cooldown holds');
  // The player's own contact with the same rock is untouched by the record.
  h.bus.emit('combat:collisionConsequence', {
    targetId: h.player.id, otherId: rock.id,
    targetType: 'ship', otherType: 'asteroid',
    targetHostile: false, damageApplied: false,
    provenance: { actorId: h.state.playerId, tag: 'direct_contact' },
  });
  survivalArena.update(1 / 60, h.state);
  assert.equal(h.portImpulses.some((i) => i.entityId === h.player.id), false, "the player's own contacts stay unchanged");
});

test('SW-12 second sun: a credited death ignites the bodies that stood close', () => {
  const h = makeHarness();
  ownLegendary(h, 'legendary_second_sun', 5);
  const near = hostile(h, 430, 0);
  const far = hostile(h, 400 + SECOND_SUN_RADIUS_WU + 200, 0);
  // A credited brood death beside the pack (the Domino ledger's own report path: keyed, pos'd).
  h.bus.emit('swarm:broodDeathPositions', {
    deaths: [{ key: 'sw-12-1', pos: { x: 410, z: 0 } }],
  });
  survivalArena.update(1 / 60, h.state);
  const burns = h.routed.filter((r) => r.origin && r.origin.id === 'swarm_second_sun');
  assert.ok(burns.some((r) => r.targetId === near.id), 'the body standing close to the kill is ignited');
  assert.ok(burns.every((r) => r.packet.statuses.some((st) => st.id === 'burn')), 'the ignition rides a burn status');
  assert.ok(!burns.some((r) => r.targetId === far.id), 'a body far from the kill is not ignited');
  assert.ok(!burns.some((r) => r.targetId === h.player.id), 'the player is never ignited');
});
