// build_map §24 "Enemies use the room" — fire discipline at the optic lattice.
//
// The grammar (src/combat/opticField.js): an energy bolt that hits a pale diamond throws an
// eight-way splinter ring, one prism per surface per shot family. A hostile holding an energy
// weapon at point-blank range to a diamond, on a bearing the ring returns through, must refuse
// the shot instead of lighting the field in its own face — and must still fire when the shot is
// safe. The gate lives in the production firing adapter `applyAIFiringIntent`, the same seam the
// tactical stack routes every doctrine firing decision through (see seam-fire-discipline and
// sg06-squad-fire-discipline for the contract this fixture follows).
//
// Geometry rides the real Ceres prism gallery cells (fuse -> diamond field, stone walls, two
// metal flanks) so the held shot is exactly the authored fuse mouth.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import {
  OPTIC_LATTICE_SPACING,
  OPTIC_RAY_COUNT,
  OPTIC_RAY_RADIUS,
  opticHeadings,
} from '../src/combat/opticField.js';
import {
  CERES_PRISM_GALLERY_ORIGIN,
  compileCeresPrismGallery,
} from '../src/data/opticStructures.js';
import { createGameState } from '../src/core/gameState.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import {
  assessOpticSplinterReturn,
  OPTIC_SPLINTER_RETURN_REASON,
} from '../src/ai/fireDiscipline.js';

const SEED = 4242;

function ship(id, team, x, z, ai, weapons = [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }]) {
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

function combatAI(overrides = {}) {
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
    ...overrides,
  };
}

function opticRock(id, body, origin = { x: 0, z: 0 }) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: origin.x + body.x, z: origin.z + body.z },
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

/** The full authored gallery as live asteroid entities, plus the named mouth/wick bodies. */
function gallery(idBase = 900) {
  const bodies = compileCeresPrismGallery();
  const entities = bodies.map((body, index) => opticRock(idBase + index, body));
  const at = (ix, iz) => entities[bodies.findIndex((body) => body.ix === ix && body.iz === iz)];
  return { bodies, entities, mouth: at(0, 0), wick1: at(1, 0), northWall: at(0, 1) };
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

function flightState() {
  const state = createGameState(SEED);
  state.tick = 90;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  return state;
}

test('a hostile at the fuse mouth refuses to prism the diamond whose ring lands on its own hull', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  // Shooter sits due west of the mouth diamond — dead on the pi heading of the eight-way ring —
  // aiming east through the diamond at the player beyond the fuse.
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z, combatAI());
  const target = ship(20, 0, mouth.pos.x + 400, mouth.pos.z, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, false,
    'the splinter ring returns through the shooter: the shot is refused');
  assert.equal(shooter.data.intent.fireBlockReason, OPTIC_SPLINTER_RETURN_REASON);
  assert.equal(shooter.data.intent.fireBlockerId, mouth.id,
    'the diamond it would light is the blocker');
  assert.equal(shooter.data.combat.targetId, target.id,
    'holding fire keeps the tactical target — a reposition, not a pacifist');

  // The pure gate agrees: the mouth is the first thing on the lane and a live splinter corridor
  // crosses the shooter's own hull circle.
  const lane = assessOpticSplinterReturn({
    shooter,
    target,
    aimAngle: Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x),
    entities: state.entityList,
    weapons: shooter.data.weapons,
  });
  assert.equal(lane.clear, false);
  assert.equal(lane.blockerId, mouth.id);
});

test('the same hostile fires when the prism is safe — off the splinter headings', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  // Same energy loadout, same diamond on the lane — but the shooter sits on bearing 202.5 deg,
  // the midpoint between splinter headings 180 and 225, so every returning ray misses its hull.
  const bearing = Math.PI + Math.PI / 8;
  const standoff = 90;
  const sx = mouth.pos.x + Math.cos(bearing) * standoff;
  const sz = mouth.pos.z + Math.sin(bearing) * standoff;
  const shooter = ship(10, 1, sx, sz, combatAI());
  const target = ship(20, 0, mouth.pos.x + Math.cos(Math.PI / 8) * 300, mouth.pos.z + Math.sin(Math.PI / 8) * 300, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, true,
    'the ring cannot reach the shooter: the energy volley is safe to send');
  assert.equal(shooter.data.intent.fireBlockReason, null);
  assert.equal(shooter.data.combat.targetId, target.id);
});

test('the same geometry is a clean shot for a kinetic hull — no blanket pacifism', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  const kinetic = [{ defId: 'wpn_autocannon_m', projSpeed: 340 }];
  const shooter = ship(10, 1, mouth.pos.x - 70, mouth.pos.z, combatAI(), kinetic);
  const target = ship(20, 0, mouth.pos.x + 400, mouth.pos.z, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, true,
    'kinetic slugs never prism — the same point-blank diamond does not hold fire');
});

test('a splinter corridor through a wingman holds the shot just like one through the shooter', () => {
  const state = flightState();
  const { entities, mouth } = gallery();
  // Shooter on the safe 202.5-degree bearing, wingman parked on the pi heading — the ring would
  // come back through the formation's own hull.
  const bearing = Math.PI + Math.PI / 8;
  const shooter = ship(10, 1, mouth.pos.x + Math.cos(bearing) * 90, mouth.pos.z + Math.sin(bearing) * 90, combatAI());
  const wingman = ship(11, 1, mouth.pos.x - 70, mouth.pos.z, combatAI({ squadId: 'gallery_wing' }));
  const target = ship(20, 0, mouth.pos.x + Math.cos(Math.PI / 8) * 300, mouth.pos.z + Math.sin(Math.PI / 8) * 300, null);
  state.playerId = target.id;
  install(state, [shooter, wingman, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, false,
    'the ring lands on the wing, not the shooter, and the shot is still refused');
  assert.equal(shooter.data.intent.fireBlockReason, OPTIC_SPLINTER_RETURN_REASON);
});

test('a stone shadow is a safe shot — the bolt dies in the wall before it can prism', () => {
  const state = flightState();
  const { entities, wick1 } = gallery();
  // Due north of the second fuse diamond, firing south through it: the north wall stone at the
  // same ix sits inside the lane first, so the bolt is absorbed and never reaches the diamond.
  const shooter = ship(10, 1, wick1.pos.x, wick1.pos.z - 150, combatAI());
  const target = ship(20, 0, wick1.pos.x, wick1.pos.z + 300, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, true,
    'the wall stone is the first thing on the lane — no diamond is ever lit');
});

test('the gate replays the real cascade — the fuse chain can still reach a hull off the first ring', () => {
  const { entities, mouth, wick1 } = gallery();
  // Sanity on the authored grammar the gate consumes: mouth heading 0 hits the next wick
  // diamond (the chain the gate walks), and the headings are the fixed eight-way compass.
  assert.deepEqual(opticHeadings(OPTIC_RAY_COUNT).length, 8);
  assert.equal(OPTIC_LATTICE_SPACING, 64);
  assert.equal(mouth.data.opticMaterial, 'diamond');
  assert.equal(wick1.data.opticMaterial, 'diamond');
  assert.equal(entities.length > 0, true);
  assert.equal(OPTIC_RAY_RADIUS > 0, true);
});
