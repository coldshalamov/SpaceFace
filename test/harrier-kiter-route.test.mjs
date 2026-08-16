import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import HARRIER_ENCOUNTER from '../src/data/encounters/352-specialist-harrier-kite.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';

const SECTOR_ID = 'sector_pallas_drift';
const ENCOUNTER_ID = 'plan15:harrier-kite';

test('ordinary encounter 352 admits one Harrier and its exact ranged doctrine never commits close', () => {
  const zone = zonesForSector(SECTOR_ID)
    .find((candidate) => HARRIER_ENCOUNTER.zoneTypes.includes(candidate.type));
  assert.ok(zone, 'a production sector offers the ordinary weighted Harrier route');
  const planned = planEncounterShape(HARRIER_ENCOUNTER, zone, zone.sectorId, 0, 352, () => 0.25);
  assert.equal(planned.ships[0].archetype, 'harrier_kiter');
  assert.equal(planned.ships[0].compositionRole, 'identity_anchor');
  assert.ok(planned.ships.slice(1).every((ship) => ship.compositionRole === 'light'));

  const runtime = new CombatDoctrineRuntime({ seed: 0x1500_3520 });
  const long = runtime.update(doctrineFrame(0, 820, 0));
  assert.equal(long.flightProfile, 'harrier_kiter');
  assert.equal(long.maneuverKind, ManeuverKind.ORBIT);
  assert.equal(long.preferredRange, 820);
  const closed = runtime.update(doctrineFrame(1, 690, 0));
  assert.equal(closed.phase, 'retreat');
  assert.equal(closed.maneuverKind, ManeuverKind.RETREAT);
  assert.equal(closed.fireWindow, false);
  const chased = runtime.update(doctrineFrame(2, 850, 30));
  assert.equal(chased.phase, 'retreat', 'a closing player keeps the Harrier disengaging at long range');
});

test('equal-budget wing-first play resolves materially faster than chasing the low-DPS Harrier', async () => {
  const wingFirst = await runProductionRoute('wing_first', 0x1500_3521);
  const chase = await runProductionRoute('chase_harrier', 0x1500_3521);

  assert.equal(wingFirst.playerWeaponId, chase.playerWeaponId);
  assert.equal(wingFirst.initialEnemyIds.length, chase.initialEnemyIds.length);
  assert.equal(wingFirst.harrierKilled, false, routeDump(wingFirst));
  assert.equal(wingFirst.outcome, 'wing_broken', routeDump(wingFirst));
  assert.equal(wingFirst.harrierFleeReason, 'harrier_screen_broken');
  assert.ok(wingFirst.harrierWithdrawal > 35,
    `the surviving Harrier must physically leave after resolution: ${routeDump(wingFirst)}`);
  assert.ok(wingFirst.harrierLongRangeFires > 0,
    `the existing projectile owner must produce a distant tracer during the standoff: ${routeDump(wingFirst)}`);
  assert.ok(wingFirst.harrierLandedDamage >= 0 && wingFirst.harrierLandedDamage <= 18,
    `the Harrier should land a plink, not a damage race: ${routeDump(wingFirst)}`);
  assert.ok(wingFirst.minStandoffAfterReady >= 650,
    `after reaching its long bearing the Harrier cannot voluntarily collapse it: ${routeDump(wingFirst)}`);

  assert.equal(chase.harrierKilled, true, routeDump(chase));
  assert.equal(chase.outcome, 'cleared', routeDump(chase));
  assert.ok(chase.playerTravel > wingFirst.playerTravel + 120,
    `the naive route must physically chase the disengager: ${routeDump({ wingFirst, chase })}`);
  assert.ok(
    wingFirst.resolvedTick * 1.35 <= chase.resolvedTick,
    `clearing the close wing should beat the equal-fit chase by at least 35%: ${routeDump({ wingFirst, chase })}`,
  );
});

function doctrineFrame(tick, distance, playerClosingSpeed) {
  return {
    tick,
    entityId: 2,
    doctrineId: 'ranged_disengager',
    perception: {
      self: {
        id: 2, team: 1, pos: { x: distance, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
        radius: 14, hullFraction: 1, energyFraction: 1, heatFraction: 0, disabled: false,
        tethered: false, capabilities: ['ranged'], subsystemFractions: {},
        activity: { kind: 'attack_run', reason: 'specialist_harrier_kite:conflict:squad' },
        roe: 'weapons_free', combatDoctrineId: 'ranged_disengager', combatRoleId: 'harrier_kiter',
        maxSpeed: 146, factionBehavior: null,
        operationalMassBand: 'medium', mobilityBand: 'high', cargoBand: 'empty', tetherabilityBand: 'good',
      },
      contacts: [{
        id: 1, kind: ContactKind.SHIP, team: 0, hostile: true, alive: true, valid: true,
        visible: true, confidence: 1, threat: 1, pos: { x: 0, z: 0 },
        vel: { x: playerClosingSpeed, z: 0 }, radius: 12,
        operationalMassBand: 'medium', mobilityBand: 'high', cargoBand: 'empty', tetherabilityBand: 'good',
      }],
    },
    directive: {
      objective: { kind: ObjectiveKind.ENGAGE, targetId: 1 },
      formation: { slot: { x: distance, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170 },
    },
  };
}

async function runProductionRoute(strategy, seed) {
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const physicsSystem = Object.create(physics);
  const flightSystem = Object.create(flightV3);
  const portsSystem = Object.create(aiPorts);
  const weaponsSystem = Object.create(weapons);
  const combatSystem = Object.create(combat);
  const budgetSystem = Object.create(spawnBudget);
  const directorSystem = Object.create(encounterDirector);
  const sim = createSimulation({
    seed,
    systems: [tactical, flightSystem, portsSystem, weaponsSystem, physicsSystem, combatSystem, budgetSystem, directorSystem],
    updateOrder: [tactical, flightSystem, portsSystem, weaponsSystem, physicsSystem, combatSystem, directorSystem],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  const player = sim.spawn(playerSpec());
  state.playerId = player.id;
  const playerStart = { x: player.pos.x, z: player.pos.z };
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  assert.deepEqual(sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: HARRIER_ENCOUNTER.id,
    encounterId: ENCOUNTER_ID,
    sectorId: SECTOR_ID,
    anchor: { x: 0, z: 0 },
    zoneType: 'ambush_lane',
    zoneRadius: 520,
    force: true,
  }), { ok: true, encounterId: ENCOUNTER_ID });
  const live = state.encounterDirector.live[ENCOUNTER_ID];
  const initialEnemies = live.ids.map((id) => state.entities.get(id));
  const harrier = initialEnemies.find((entity) => entity.data?.lootTableId === 'harrier_kiter');
  const wing = initialEnemies.filter((entity) => entity.data?.ai?.encounterCompositionRole === 'light');
  assert.ok(harrier);
  assert.ok(wing.length >= 2);

  const resolved = [];
  const flees = [];
  const harrierHits = [];
  const harrierFires = [];
  bus.on('encounter:resolved', (payload) => {
    if (payload.encounterId === ENCOUNTER_ID) resolved.push(structuredClone(payload));
  });
  bus.on('ai:flee', (payload) => {
    if (payload.entityId === harrier.id) flees.push(structuredClone(payload));
  });
  bus.on('projectile:hit', (payload) => {
    if (payload.ownerId === harrier.id && payload.targetId === player.id) harrierHits.push(structuredClone(payload));
  });
  bus.on('combat:fire', (payload) => {
    if (payload.ownerId === harrier.id) harrierFires.push(structuredClone(payload));
  });

  while (live.phase !== 'conflict' && state.tick < 360) sim.step(SIM_DT);
  assert.equal(live.phase, 'conflict');
  let ready = false;
  let minStandoffAfterReady = Infinity;
  let maxHarrierDistance = 0;
  const harrierPhases = new Set();
  let target = null;
  let path = 0;
  let previousPlayer = { x: player.pos.x, z: player.pos.z };
  for (let i = 0; i < 1800 && resolved.length === 0; i++) {
    const harrierDistance = distance(player, harrier);
    maxHarrierDistance = Math.max(maxHarrierDistance, harrierDistance);
    const aiInspection = sim.helpers.inspectAI?.({ entityId: harrier.id });
    const inspectedPhase = aiInspection?.result?.combatDoctrine?.phase;
    if (inspectedPhase) harrierPhases.add(inspectedPhase);
    const livingWing = wing.filter((entity) => entity.alive !== false);
    if (!ready && harrierDistance >= 700 && harrierFires.length > 0
      && livingWing.some((entity) => distance(player, entity) <= 520)) ready = true;
    if (ready) minStandoffAfterReady = Math.min(minStandoffAfterReady, harrierDistance);

    if (strategy === 'wing_first') {
      target = ready ? nearest(player, livingWing) : null;
      state.nav.autopilot = null;
    } else {
      target = ready ? (harrier.alive !== false ? harrier : nearest(player, livingWing)) : null;
      state.nav.autopilot = target ? {
        active: true, targetEntityId: target.id, arrivalRadius: 260, label: 'Harrier chase',
      } : null;
    }
    aimAndFire(state, player, target, target && distance(player, target) <= 515);
    sim.step(SIM_DT);
    path += Math.hypot(player.pos.x - previousPlayer.x, player.pos.z - previousPlayer.z);
    previousPlayer = { x: player.pos.x, z: player.pos.z };
  }
  state.input.fire = false;
  assert.equal(resolved.length, 1, JSON.stringify({ strategy, tick: state.tick, live, harrier: actorDump(harrier), wing: wing.map(actorDump) }));
  const resolvedTick = state.tick;
  const retreatStart = { x: harrier.pos.x, z: harrier.pos.z };
  if (strategy === 'wing_first') sim.runTicks(120);
  const harrierWithdrawal = Math.hypot(harrier.pos.x - retreatStart.x, harrier.pos.z - retreatStart.z);
  const result = {
    strategy,
    playerWeaponId: player.data.weapons[0].defId,
    initialEnemyIds: initialEnemies.map((entity) => entity.data?.lootTableId),
    resolvedTick,
    outcome: resolved[0].outcome,
    harrierKilled: harrier.alive === false,
    harrierFleeReason: flees.find((entry) => entry.reason === 'harrier_screen_broken')?.reason || null,
    harrierWithdrawal,
    harrierLongRangeFires: harrierFires.length,
    harrierLandedDamage: harrierHits.reduce((sum, entry) => sum + (Number(entry.damage) || 0), 0),
    minStandoffAfterReady,
    maxHarrierDistance,
    harrierPhases: [...harrierPhases],
    playerTravel: path,
    finalTick: state.tick,
  };
  sim.registry.get('physics')._disableSg02DynamicAuthority?.();
  sim.dispose();
  return result;
}

function aimAndFire(state, player, target, inRange) {
  state.input.fire = !!(target && inRange);
  state.player.targetId = target && target.id || null;
  state.input.autoAim = target ? { targetId: target.id } : null;
  if (!target) return;
  const angle = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
  state.input.aimAngle = angle;
  // This is the pilot's ordinary nose-aim input outcome. Weapons still owns the beam and Combat
  // still owns every point of damage; the harness does not route or mutate target health.
  player.rot = angle;
}

function playerSpec() {
  return {
    type: 'ship', alive: true, collides: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 24, hull: 5_000, hullMax: 5_000,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 5_000, capMax: 5_000, capRegen: 500,
    physicsBody: {
      schemaVersion: 1, radius: 12, mass: 24, inertiaY: 1_728,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      defId: 'ship_kestrel', driveId: 'drive_reaction_s', intent: {}, combat: {},
      derived: { mass: 24, operationalMass: 24 },
      weapons: [{ defId: 'wpn_beam_laser_m' }],
    },
  };
}

function nearest(origin, entities) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    const d = distance(origin, entity);
    if (d < bestDistance) { best = entity; bestDistance = d; }
  }
  return best;
}

function distance(a, b) {
  if (!a || !b || !a.pos || !b.pos) return Infinity;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

function actorDump(entity) {
  return entity && {
    id: entity.id, alive: entity.alive, hull: entity.hull,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    role: entity.data?.lootTableId,
    activity: entity.data?.ai?.activity,
    roe: entity.data?.ai?.roe,
    forceFlee: entity.data?.ai?.forceFlee,
  };
}

function routeDump(value) {
  return JSON.stringify(value);
}
