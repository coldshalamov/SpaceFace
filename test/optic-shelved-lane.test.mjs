// D95 — the optic-awareness layer must see lattice cells still SHELVED in the compact field.
// Decode-disc residency keeps lattices field-resident until the player approaches, but a bolt
// prisms a shelved cell exactly the same as a promoted one: an NPC banking beside a shelved
// gallery must find the prism, and a bolt aimed through a shelved lattice must read the
// splinter-return refusal instead of "clear until promotion".
//
// Same authored stand as optic-bank-shot/optic-fire-discipline — the Ceres prism gallery —
// with the mouth cell shelved into `state.world.asteroidField` instead of promoted live.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { OPTIC_SPLINTER_RETURN_REASON, assessOpticSplinterReturn } from '../src/ai/fireDiscipline.js';
import { compileCeresPrismGallery } from '../src/data/opticStructures.js';
import { createGameState } from '../src/core/gameState.js';
import { applyAIFiringIntent, opticLaneBodiesWithShelved } from '../src/systems/aiFireIntent.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';

const SEED = 4242;
const ENERGY = [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }];

function ship(id, team, x, z, ai, weapons = ENERGY) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: team === 1 ? 'faction_reach' : 'faction_free',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 32,
    maxSpeed: 140,
    turnRate: 2.4,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {
      ...(ai ? { ai } : {}),
      intent: { fire: false },
      combat: {},
      weapons,
    },
  };
}

function combatAI() {
  return {
    squadId: 'gallery_wing',
    doctrine: 'scavenger',
    preferredRole: 'striker',
    passive: false,
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    roe: 'weapons_free',
    forcePlayerTarget: true,
    activity: normalizeActivity({
      kind: 'attack_run',
      reason: 'test_attack_run',
      anchor: { x: 0, z: 0 },
      leashRadius: 2600,
      startedTick: 0,
    }),
  };
}

function opticRock(id, body) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: body.x, z: body.z },
    vel: { x: 0, z: 0 },
    radius: body.radius,
    collides: true,
    data: {
      typeId: body.typeId,
      opticMaterial: body.material,
      opticStructureId: 'optic_ceres_prism_gallery',
      opticCell: `${body.ix},${body.iz}`,
    },
  };
}

function shelveOpticRock(state, entity) {
  insertAsteroidFieldRock(state, {
    id: entity.id,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: 0, z: 0 },
    radius: entity.radius,
    data: { ...entity.data },
  });
}

function flightState() {
  const state = createGameState(SEED);
  state.tick = 90;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  return state;
}

function install(state, entities) {
  state.entities = new Map(entities.map((entity) => [entity.id, entity]));
  state.entityList = entities.slice();
}

function firingDecision(entityId, targetId) {
  return {
    entityId,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS,
        targetId,
        reason: 'combat_doctrine:interceptor_flyby:strike',
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { fireWindow: true },
  };
}

test('the bank planner finds a shelved mouth cell — the lane view covers field residency', () => {
  const state = flightState();
  const bodies = compileCeresPrismGallery();
  const entities = bodies.map((body, index) => opticRock(900 + index, body));
  const at = (ix, iz) => entities[bodies.findIndex((b) => b.ix === ix && b.iz === iz)];
  const mouth = at(0, 0);

  // The stand from optic-bank-shot: shooter SW at (-150,-110), direct lane to (-80,80) dies on
  // the south flank mirror — but the prism itself is SHELVED, not live. Before the fix the
  // planner's lane index could not see it and the blocked lane degraded to straight fire.
  shelveOpticRock(state, mouth);
  const live = entities.filter((e) => e !== mouth);
  const shooter = ship(10, 1, -150, -110, combatAI());
  shooter.rot = Math.atan2(0 - (-110), 0 - (-150));
  const target = ship(20, 0, -80, 80, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...live]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, true, 'a blocked lane is not a held trigger');
  const bankAim = Math.atan2(mouth.pos.z - shooter.pos.z, mouth.pos.x - shooter.pos.x);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - bankAim) < 1e-9,
    'the volley is aimed at the shelved fuse mouth');
  assert.equal(shooter.data.combat.opticBankId, mouth.id,
    'the chosen cell keeps its field-record identity');
});

test('a bolt aimed through a shelved lattice is refused when the ring lands on the shooter', () => {
  const state = flightState();
  const bodies = compileCeresPrismGallery();
  const entities = bodies.map((body, index) => opticRock(900 + index, body));
  const at = (ix, iz) => entities[bodies.findIndex((b) => b.ix === ix && b.iz === iz)];
  const mouth = at(0, 0);

  // Same refusal stand as optic-fire-discipline: shooter due west of the mouth, dead on the
  // pi heading — but the mouth is shelved. The physical bolt still prisms it, so the lane
  // must read the refusal, not "clear until promotion".
  shelveOpticRock(state, mouth);
  const live = entities.filter((e) => e !== mouth);
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z, combatAI());
  const target = ship(20, 0, mouth.pos.x + 400, mouth.pos.z, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...live]);

  const lane = assessOpticSplinterReturn({
    shooter,
    target,
    aimAngle: Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x),
    entities: opticLaneBodiesWithShelved(state),
    weapons: shooter.data.weapons,
  });
  assert.equal(lane.clear, false, 'the shelved lattice reads as terrain, not empty space');
  assert.equal(lane.blockerId, mouth.id);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, false);
  assert.equal(shooter.data.intent.fireBlockReason, OPTIC_SPLINTER_RETURN_REASON);
});

test('the shelved view is replayable and version-cached', () => {
  const state = flightState();
  const body = compileCeresPrismGallery()[0];
  const rock = opticRock(950, body);
  shelveOpticRock(state, rock);
  state.entities = new Map();
  state.entityList = [];

  const lane = opticLaneBodiesWithShelved(state);
  const first = [...lane.values()];
  const second = [...lane.values()];
  assert.equal(first.length, second.length, 'iterable replays');
  assert.equal(first[first.length - 1].id, rock.id, 'shelved record trails the live list');
});
