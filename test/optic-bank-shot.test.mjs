// build_map §24 "Enemies use the room" — the OFFENSIVE half of optic fire discipline.
//
// The defensive half (optic-fire-discipline.test.mjs) refuses to light a diamond whose ring
// comes back through the shooter or a wingman. This half is the named acceptance: "an enemy
// shot into the Ceres fuse reaches a target that was not on the original line." When the aimed
// lane dies on a body that is not the target and not a prism — here the gallery's flank mirror
// parked squarely on the firing line — an energy-armed hostile banks the volley into the fuse
// mouth whose replayed ring lands on the target, instead of wasting the bolt into the wall.
//
// Two proof depths: `applyAIFiringIntent` overrides `intent.aimAngle` onto the prism bearing,
// and a real swept bolt on that bearing prisms the mouth so a spawned splinter physically
// lands on the hull the straight shot could never touch.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import {
  OPTIC_RAY_RANGE,
  opticChildSpec,
  settleOpticContact,
  opticBookFor,
} from '../src/combat/opticField.js';
import { compileCeresPrismGallery } from '../src/data/opticStructures.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { planOpticBankShot } from '../src/ai/fireDiscipline.js';

const SEED = 4242;
const ENERGY = [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }];
const KINETIC = [{ defId: 'wpn_autocannon_m', projSpeed: 340 }];

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

function gallery(idBase = 900) {
  const bodies = compileCeresPrismGallery();
  const entities = bodies.map((body, index) => opticRock(idBase + index, body));
  const at = (ix, iz) => entities[bodies.findIndex((body) => body.ix === ix && body.iz === iz)];
  return { bodies, entities, mouth: at(0, 0), northFlankMetal: at(-2, 1), southFlankMetal: at(-2, -1) };
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

/**
 * The authored stand: shooter south-west of the mouth at (-150,-110). The direct lane to the
 * target parked at (-80,80) runs through the south flank mirror at (-128,-64) — a wall the
 * bolt cannot pass. The lane to the fuse mouth diamond at (0,0) is open, and that cell's
 * 135-degree splinter lands exactly on the target. Grid verified by hand: metal lateral 5.5 WU
 * on the direct lane (reach 18.2), 24.2 WU off the mouth lane (reach 18.2), mouth ring heading
 * 135 lands 3 WU off the target center (reach 14.2).
 */
// The bearing the mouth cell sits on from the authored stand — fixtures that expect the volley
// to actually leave set the nose on (or near) this bearing; a default nose at rot=0 sits ~36°
// off it, outside the fixed-mount gimbal cone, and correctly holds while the ship slews.
const BANK_BEARING = Math.atan2(0 - (-110), 0 - (-150));

function bankStand(shooterRot = BANK_BEARING) {
  const state = flightState();
  const g = gallery();
  const shooter = ship(10, 1, -150, -110, combatAI());
  shooter.rot = shooterRot;
  const target = ship(20, 0, -80, 80, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...g.entities]);
  return { state, shooter, target, ...g };
}

test('the banked shot: a lane that dies on the flank mirror re-aims into the fuse mouth', () => {
  const { state, shooter, target, mouth } = bankStand();
  const directAim = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, true, 'a blocked lane is not a held trigger');
  const bankAim = Math.atan2(mouth.pos.z - shooter.pos.z, mouth.pos.x - shooter.pos.x);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - bankAim) < 1e-9,
    'the volley is aimed at the fuse mouth, not the unreachable target');
  assert.ok(Math.abs(shooter.data.intent.aimAngle - directAim) > 0.2,
    'the banked bearing is measurably off the original line');
  assert.equal(shooter.data.combat.opticBankId, mouth.id,
    'the chosen cell is the one the bolt will actually light');
});

test('a swept bolt on the banked bearing prisms the mouth and a splinter lands on the target', () => {
  const { state, shooter, target, mouth } = bankStand();
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  const aim = shooter.data.intent.aimAngle;

  // Fly a real bolt down the chosen bearing through the real physics sweep. The bus settles
  // optic contacts with the production grammar and spawns the splinter specs as live bodies.
  const speed = 320;
  const bolt = makeEntity({
    id: 500,
    type: 'projectile',
    pos: { x: shooter.pos.x, z: shooter.pos.z },
    vel: { x: Math.cos(aim) * speed, z: Math.sin(aim) * speed },
    radius: 0.7,
    collides: true,
    ownerId: shooter.id,
    team: shooter.team,
    data: {
      damage: 8,
      damageType: 'energy',
      kind: 'bullet',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: { x: shooter.pos.x, z: shooter.pos.z },
      maxDistance: OPTIC_RAY_RANGE,
    },
  });
  state.entities.set(bolt.id, bolt);
  state.entityList.push(bolt);

  const family = opticBookFor(new Map(), `optic:${bolt.id}`);
  const hits = [];
  let nextId = 600;
  const bus = {
    emit(name, payload) {
      if (name !== 'projectile:hit') return;
      const projectile = state.entities.get(payload.projectileId);
      const victim = state.entities.get(payload.targetId);
      hits.push({ targetId: payload.targetId, generation: projectile && projectile.data && projectile.data.opticGeneration || 0 });
      const plan = settleOpticContact(projectile, victim, payload, family);
      if (!plan) { if (projectile) projectile.alive = false; return; }
      if (plan.kind !== 'prism') return;
      for (let i = 0; i < plan.rays.length; i++) {
        const child = makeEntity({ ...opticChildSpec(projectile, plan.rays[i]), id: nextId++ });
        state.entityList.push(child);
        state.entities.set(child.id, child);
      }
    },
  };
  const host = Object.create(physics);
  host.init({ state, bus, helpers: {} });

  const dt = 1 / 60;
  for (let step = 0; step < 240; step++) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'projectile') continue;
      e.prevPos = { x: e.pos.x, z: e.pos.z };
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
    }
    host.sweepProjectiles(dt, state);
    if (hits.some((h) => h.targetId === target.id)) break;
  }

  const landed = hits.find((h) => h.targetId === target.id);
  assert.ok(landed, 'a splinter physically lands on the hull the direct lane could not reach');
  assert.ok(landed.generation >= 1, 'the hit arrived via the cascade, not the aimed bolt');
  assert.equal(hits.some((h) => h.targetId === mouth.id), true,
    'the bolt prisms the fuse mouth first');
  assert.equal(hits.some((h) => h.targetId === shooter.id), false,
    'the ring never comes back through the shooter');
});

test('a clear lane never banks — the planner only exists for dead shots', () => {
  const state = flightState();
  const g = gallery();
  const shooter = ship(10, 1, -400, -300, combatAI());
  const target = ship(20, 0, -700, -500, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...g.entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  const lead = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert.equal(shooter.data.intent.fire, true);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - lead) < 1e-9,
    'nothing between the muzzle and the hull: the straight shot stands');
  assert.equal(shooter.data.combat.opticBankId, null);
});

test('a kinetic hull never banks — slugs cannot prism, so the blocked shot stays honest', () => {
  const { state, shooter, target } = bankStand();
  shooter.data.weapons = KINETIC;
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  const lead = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert.equal(shooter.data.intent.fire, true,
    'kinetic doctrine still fires the blocked lane — no optic knowledge exists to borrow');
  assert.ok(Math.abs(shooter.data.intent.aimAngle - lead) < 1e-9);
  assert.equal(shooter.data.combat.opticBankId, null);
  assert.equal(planOpticBankShot({
    shooter, target, aimAngle: lead, entities: state.entityList, weapons: KINETIC,
  }), null);
});

test('a candidate cell whose ring lands on a wingman is refused, not banked', () => {
  const state = flightState();
  const g = gallery();
  const shooter = ship(10, 1, -150, -110, combatAI());
  // Wingman parked on the mouth's 225-degree splinter heading at (-140,-140) — BEHIND the
  // shooter, off both the aimed lane and the bolt corridor to the mouth, but dead on a ring
  // corridor between the flank metals. The target sits on the 135-degree corridor further out,
  // so the cascade reaches BOTH hulls: only the same-team refusal can kill this bank.
  const wingman = ship(11, 1, -140, -140, combatAI());
  const target = ship(20, 0, -100, 100, null);
  state.playerId = target.id;
  install(state, [shooter, wingman, target, ...g.entities]);

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  const aim = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert.equal(shooter.data.combat.opticBankId, null,
    'a bank that splinters a wingman is the same refusal in a longer coat');
  assert.ok(Math.abs(shooter.data.intent.aimAngle - aim) < 1e-9,
    'the aim stays on the dead lane rather than banking through the wing');
  const bank = planOpticBankShot({ shooter, target, aimAngle: aim, entities: state.entityList, weapons: ENERGY });
  assert.equal(bank, null);

  // And it IS the own-side corridor that refused: take the wingman out and the same geometry
  // banks through the mouth — the target was reachable the whole time.
  wingman.alive = false;
  const saved = planOpticBankShot({ shooter, target, aimAngle: aim, entities: state.entityList, weapons: ENERGY });
  assert.equal(saved && saved.opticId, g.mouth.id,
    'without the wingman on the ring the same stand banks clean — the refusal was the cascade');
});

test('a bank bearing outside the gimbal cone holds the trigger until the nose slews onto it', () => {
  // rot=0 puts the fuse bearing ~36° off the nose — inside neither gimbal edge. An unvetted
  // bolt down the clamped edge is exactly what the gate exists to prevent, so fire holds and
  // the aim keeps the ship turning onto the corridor.
  const { state, shooter, target, mouth } = bankStand(0);
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  assert.equal(shooter.data.intent.fire, false,
    'a fixed mount cannot bear a corridor 36° off-bore — the trigger holds');
  assert.equal(shooter.data.intent.fireBlockReason, 'optic_bank_slew');
  assert.equal(shooter.data.combat.opticBankId, mouth.id,
    'the pending bank is the corridor the ship is slewing onto');
  assert.ok(Math.abs(shooter.data.intent.aimAngle - BANK_BEARING) < 1e-9,
    'aim stays on the bank so the nose converges on it');

  // The slew converged — the same decision now releases the volley down the certified corridor.
  shooter.rot = BANK_BEARING - 0.05;
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, true);
  assert.equal(shooter.data.combat.opticBankId, mouth.id);
});

test('a turret-only energy battery cannot bank — the mount leads the target itself', () => {
  const { state, shooter, target } = bankStand();
  // A ring-mounted gun resolves its own lead on the locked target; intent.aimAngle cannot steer
  // it onto a corridor, so no bank is stamped and the ordinary (wasted) lane stands.
  shooter.data.weapons = [{ defId: 'wpn_pulse_laser_s', projSpeed: 320, facing: 'turret' }];
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);

  const lead = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert.equal(shooter.data.intent.fire, true);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - lead) < 1e-9,
    'no aim-following mount exists to fly the corridor — the aim stays honest');
  assert.equal(shooter.data.combat.opticBankId, null,
    'telemetry never claims a bank no mount can execute');
});

test('stale bank telemetry clears when the volley can no longer bank', () => {
  const { state, shooter, target, mouth } = bankStand();
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.combat.opticBankId, mouth.id);

  // A kinetic refit cannot prism — the next decision tick must retire the old corridor claim.
  shooter.data.weapons = KINETIC;
  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.combat.opticBankId, null,
    'a no-bank tick clears the previous tick\'s bank id');
});

test('a reachable prism whose ring misses the target is not a bank', () => {
  const state = flightState();
  const g = gallery();
  const shooter = ship(10, 1, -150, -110, combatAI());
  // The flank mirror still blocks the direct lane, but (-40,140) sits inside no splinter
  // corridor from any cell this shooter can light — the only honest outcome is the dead bolt.
  const target = ship(20, 0, -40, 140, null);
  state.playerId = target.id;
  install(state, [shooter, target, ...g.entities]);

  const aim = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  const bank = planOpticBankShot({ shooter, target, aimAngle: aim, entities: state.entityList, weapons: ENERGY });
  assert.equal(bank, null,
    'no diamond the shooter can light throws a corridor onto this hull');
});
