// D96 — the optic-awareness layer must cover beam mounts. A continuous beam prisms a diamond
// exactly like an energy bolt (weapons.js stamps the burst's opticFamilyId and the lattice
// throws one ring per burst), so a beam-only ship needs the same two judgments: the splinter
// return refusal when its own ring would land on it, and the bank planner when the direct
// lane is dead. Homing ordnance stays out — its steering already chases the lock.
//
// Same authored stand as optic-fire-discipline: the Ceres prism gallery, shooter due west of
// the fuse mouth on the pi heading so the mouth's ring lands back through the shooter.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { OPTIC_SPLINTER_RETURN_REASON, assessOpticSplinterReturn, planOpticBankShot } from '../src/ai/fireDiscipline.js';
import { compileCeresPrismGallery } from '../src/data/opticStructures.js';
import { createGameState } from '../src/core/gameState.js';
import { applyAIFiringIntent, opticLaneBodies } from '../src/systems/aiFireIntent.js';

const SEED = 4242;
const BEAM = [{ defId: 'wpn_beam_laser_m', slotIndex: 0 }]; // energy, hitscan, continuous, range 240
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
    squadId: 'beam_wing',
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

function gallery() {
  const bodies = compileCeresPrismGallery();
  const entities = bodies.map((body, index) => opticRock(900 + index, body));
  const at = (ix, iz) => entities[bodies.findIndex((b) => b.ix === ix && b.iz === iz)];
  return { entities, mouth: at(0, 0), northFlank: at(1, 4), southFlank: at(1, -4) };
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

test('a beam aimed through a lattice is refused when the ring lands on the shooter', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z, combatAI(), BEAM);
  const target = ship(20, 0, mouth.pos.x + 400, mouth.pos.z, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  const lane = assessOpticSplinterReturn({
    shooter,
    target,
    aimAngle: Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x),
    entities: opticLaneBodies(state),
    weapons: shooter.data.weapons,
  });
  assert.equal(lane.clear, false, 'the beam lane reads the prism it would light');
  assert.equal(lane.blockerId, mouth.id);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, false);
  assert.equal(shooter.data.intent.fireBlockReason, OPTIC_SPLINTER_RETURN_REASON);
});

test('a beam off the splinter heading still fires', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z - 200, combatAI(), BEAM);
  const target = ship(20, 0, mouth.pos.x + 100, mouth.pos.z - 400, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, true);
});

test('a beam whose ray cannot reach the lattice is not refused', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  const SHORT_BEAM = [{ defId: 'wpn_beam_laser_m', slotIndex: 0, range: 40 }];
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z, combatAI(), SHORT_BEAM);
  const target = ship(20, 0, mouth.pos.x + 400, mouth.pos.z, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  const lane = assessOpticSplinterReturn({
    shooter,
    target,
    aimAngle: Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x),
    entities: opticLaneBodies(state),
    weapons: shooter.data.weapons,
  });
  assert.equal(lane.clear, true, 'a diamond beyond beam reach is not a splinter risk');
});

test('the bank planner steers a beam-only battery onto the fuse mouth', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  // The bank stand from optic-bank-shot: the direct lane dies on the south flank mirror.
  const shooter = ship(10, 1, -150, -110, combatAI(), BEAM);
  shooter.rot = Math.atan2(0 - (-110), 0 - (-150));
  const target = ship(20, 0, -80, 80, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  const bank = planOpticBankShot({
    shooter,
    target,
    aimAngle: Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x),
    entities: opticLaneBodies(state),
    weapons: shooter.data.weapons,
  });
  assert.ok(bank, 'a beam can fly the fuse shot — the corridor was never bolt-shaped');
  assert.equal(bank.opticId, mouth.id);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, true, 'a blocked lane is not a held trigger');
  const bankAim = Math.atan2(mouth.pos.z - shooter.pos.z, mouth.pos.x - shooter.pos.x);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - bankAim) < 1e-9
    || Math.abs(shooter.data.intent.aimAngle - bankAim) > Math.PI - 1e-9,
    'the beam volley is aimed at the fuse mouth');
  assert.equal(shooter.data.combat.opticBankId, mouth.id);
});
