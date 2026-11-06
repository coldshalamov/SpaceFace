// inf-lance-aim — the armory call-ins answer to the crosshair. The Orbital Lance's blurb
// promises "Paints the aim point"; the decoy is "a thrown lure". Both read the input owner's
// aimAngle — minted as atan2(dz, dx) and aimed by every gun consumer with cos→x, sin→z — so
// the paint and the drop sit ON the aim line. They had been reading the pairing swapped, which
// put the paid lance a quarter-turn off the crosshair and the decoy off the nose line.
//
// Harness: the SW-03 rig (real run ledger, the director on the arena's fixed slot).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { fields } from '../src/systems/fields.js';
import { runSession } from '../src/systems/runSession.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';

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
    // Observable stand-in for the damage owner: the packet the director routes is receipted
    // on the bus so the test can read who took what.
    routeCombatDamage(request) {
      bus.emit('combat:damage', {
        targetId: request.targetId,
        attackerId: request.attackerId,
        applied: 1,
      });
      return { ok: true };
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
  return { state, bus, emitted, helpers, player };
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

function aimAlong(h, angle) {
  h.state.input.aimAngle = angle;
  // The un-latched lance reads the same aimAngle when no cursor world point is published.
  delete h.state.input.aimWorld;
}

test('the lance paints ON the aim line: the diagonal aim lands the column on the diagonal', t => {
  const h = makeHarness();
  openArmory(h, 2, 500);
  survivalDraft.currentOffers();
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_orbital_lance' });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  // A hostile sitting on the TRUE aim line: player + 320·(cos θ, sin θ). θ = π/6 keeps the
  // swapped pairing off the same point (π/4 is the mirror axis where swap and truth meet).
  const angle = Math.PI / 6;
  const dist = 320;
  aimAlong(h, angle);
  const onLine = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: h.player.pos.x + Math.cos(angle) * dist, z: h.player.pos.z + Math.sin(angle) * dist },
    vel: { x: 0, z: 0 }, radius: 9, mass: 24, hull: 60, hullMax: 60, rot: 0, team: 1,
    physicsBody: BODY({ mass: 24 }), data: { runCohort: 'survival' },
  });
  // A decoy hull on the swapped pairing — where the old reading dropped the column.
  const offLine = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: h.player.pos.x + Math.sin(angle) * dist, z: h.player.pos.z + Math.cos(angle) * dist },
    vel: { x: 0, z: 0 }, radius: 9, mass: 24, hull: 60, hullMax: 60, rot: 0, team: 1,
    physicsBody: BODY({ mass: 24 }), data: { runCohort: 'survival' },
  });

  pressBomb(h);
  const telegraphs = h.emitted.filter((e) => e.event === 'swarm:callinTelegraph');
  assert.equal(telegraphs.length, 1, 'one painted marker');
  const paint = telegraphs[0].payload;
  assert.equal(paint.x, onLine.pos.x, 'the paint sits on the aim line (cos→x)');
  assert.equal(paint.z, onLine.pos.z, 'the paint sits on the aim line (sin→z)');
  assert.notEqual(paint.x, offLine.pos.x, 'the paint is not on the old swapped point');

  h.state.simTime = paint.atS + 1 / 60;
  survivalArena.update(1 / 60, h.state);
  const struck = consumePhysicsCommand(onLine);
  assert.ok(struck && struck.impulses.length >= 1, 'the column lands on the hull the crosshair named');
  const neighborShoved = consumePhysicsCommand(offLine);
  assert.equal(neighborShoved, null, 'the column never touches the swapped point');
});

test('the decoy drops ahead of the aim line, not a quarter-turn off the nose', t => {
  const h = makeHarness();
  openArmory(h, 1, 500);
  survivalDraft.currentOffers();
  h.bus.emit('run:draftPickRequested', { offerId: 'callin_decoy' });
  h.state.run.phase = 'active';
  h.state.mode = 'flight';
  aimAlong(h, 0); // aiming straight along +x
  pressBomb(h);
  const deployed = h.emitted.find((e) => e.event === 'swarm:callinDeployed' && e.payload.callinId === 'decoy');
  assert.ok(deployed, 'the decoy deploys on the press');
  const decoy = h.helpers.spawned
    ? h.helpers.spawned.find((s) => s.data && s.data.swarmCallin === 'decoy')
    : null;
  const body = decoy || [...h.state.entities.values()].find((e) => e.data && e.data.swarmCallin === 'decoy');
  assert.ok(body, 'the lure body exists');
  // Drop offset 14 wu along +x from the player at (400, 0).
  assert.equal(body.pos.x, h.player.pos.x + 14, 'the lure drops on the aim line (cos→x)');
  assert.equal(body.pos.z, h.player.pos.z, 'the lure holds the nose line (sin→z)');
});
