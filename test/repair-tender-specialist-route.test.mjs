import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import TENDER_ENCOUNTER from '../src/data/encounters/351-specialist-repair-tender.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';

const SECTOR_ID = 'sector_pallas_drift';
const ENCOUNTER_ID = 'plan15:repair-tender';
const DRONE_CAPACITY = 72;

test('ordinary encounter 351 admits one Tender behind an ordinary light screen', () => {
  const zone = zonesForSector(SECTOR_ID)
    .find((candidate) => TENDER_ENCOUNTER.zoneTypes.includes(candidate.type));
  assert.ok(zone, 'a production sector offers the ordinary weighted Tender route');
  const planned = planEncounterShape(TENDER_ENCOUNTER, zone, zone.sectorId, 0, 351, () => 0.25);
  assert.equal(planned.ships[0].archetype, 'hostile_repair_tender');
  assert.equal(planned.ships[0].compositionRole, 'identity_anchor');
  assert.ok(planned.ships.slice(1).every((ship) => ship.compositionRole === 'light'));
});

test('finite combat-owned repair loses to a physical Well separation and source kill', async () => {
  const previousFieldsEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const ignored = await runSustainRoute('ignore', 0x1500_3510);
    const separated = await runSustainRoute('well', 0x1500_3510);
    const killed = await runTenderKillRoute(0x1500_3511);

    assert.equal(ignored.initialEnemyIds.join('|'), separated.initialEnemyIds.join('|'));
    assert.equal(ignored.poolSize, 1);
    assert.equal(ignored.initialCapacity, DRONE_CAPACITY);
    assert.ok(ignored.repairsInPostCounterWindow > separated.repairsInPostCounterWindow,
      `the ignored drone must keep welding through the matched post-counter window: ${dump({ ignored, separated })}`);
    assert.ok(ignored.totalApplied <= DRONE_CAPACITY, dump(ignored));
    assert.ok(separated.totalApplied <= DRONE_CAPACITY, dump(separated));
    assert.equal(separated.wellDeploys, 1, dump(separated));
    assert.ok(separated.droneTravel > 45,
      `the production Well must physically move the drone: ${dump(separated)}`);
    assert.ok(separated.separation > separated.repairRange + 8,
      `the drone must leave weld range: ${dump(separated)}`);
    assert.equal(separated.repairsInPostCounterWindow, 0,
      `combat must reject every weld while the drone is physically separated: ${dump(separated)}`);
    assert.ok(separated.greenWeldReceipts > 0,
      `real applied repair must emit the green-weld semantic: ${dump(separated)}`);
    assert.ok(separated.combatRepairTraceCount >= separated.greenWeldReceipts,
      `every weld semantic must be backed by combat-owned trace: ${dump(separated)}`);

    assert.equal(killed.tenderKilled, true, dump(killed));
    assert.equal(killed.stopReason, 'tender_destroyed', dump(killed));
    assert.equal(killed.repairsAfterTenderKill, 0,
      `destroying the source must stop all future repair: ${dump(killed)}`);
    assert.equal(killed.droneActiveAfterKill, false, dump(killed));
  } finally {
    FIELD_FLAGS.enabled = previousFieldsEnabled;
  }
});

async function runSustainRoute(strategy, seed) {
  const h = await createHarness(seed);
  try {
    await damageWingAndObserveRepair(h);
    const firstReceipt = h.welds.at(-1);
    assert.ok(firstReceipt?.applied > 0, dump(routeSnapshot(h)));
    assert.ok(distance(h.player, h.drone) <= 340,
      `encounter 351 must keep the counter inside ordinary Well placement range: ${dump(routeSnapshot(h))}`);
    let separationReceiptCount = h.welds.length;
    const beforeDrone = { x: h.drone.pos.x, z: h.drone.pos.z };
    if (strategy === 'well') {
      deployOutwardWell(h);
      assert.equal(runUntil(h, () => distance(h.drone, h.wing) > h.repairRange + 8, 300), true,
        dump(routeSnapshot(h)));
      separationReceiptCount = h.welds.length;
    }
    h.state.nav.autopilot = null;
    h.state.input.fire = false;
    h.sim.runTicks(150);
    const inspection = h.sim.helpers.inspectCombat({ entityId: h.wing.id });
    return {
      strategy,
      initialEnemyIds: h.initialEnemyIds,
      poolSize: h.runtime.poolSize,
      initialCapacity: h.runtime.totalRepairCapacity,
      totalApplied: h.welds.reduce((sum, receipt) => sum + receipt.applied, 0),
      greenWeldReceipts: h.welds.filter((receipt) => receipt.cue === 'green_weld_flashes').length,
      combatRepairTraceCount: inspection.trace.events
        .filter((entry) => entry.kind === 'combat.hullRepair').length,
      wellDeploys: h.wells.length,
      droneTravel: Math.hypot(h.drone.pos.x - beforeDrone.x, h.drone.pos.z - beforeDrone.z),
      separation: distance(h.drone, h.wing),
      repairRange: h.repairRange,
      repairsInPostCounterWindow: h.welds.length - separationReceiptCount,
      remainingRepair: h.drone.data.repairTenderDrone.remainingRepair,
      wingHull: h.wing.hull,
      wingHullMax: h.wing.hullMax,
    };
  } finally {
    disposeHarness(h);
  }
}

async function runTenderKillRoute(seed) {
  const h = await createHarness(seed);
  try {
    await damageWingAndObserveRepair(h);
    const killed = killWithPlayerWeapon(h, h.tender, 2400);
    assert.equal(killed, true, dump(routeSnapshot(h)));
    const receiptCountAtKill = h.welds.length;
    h.state.input.fire = false;
    h.state.nav.autopilot = null;
    h.sim.runTicks(180);
    return {
      tenderKilled: h.tender.alive === false,
      stopReason: h.stops.at(-1)?.reason || null,
      repairsAfterTenderKill: h.welds.length - receiptCountAtKill,
      droneActiveAfterKill: h.drone.data.repairTenderDrone.active,
      totalApplied: h.welds.reduce((sum, receipt) => sum + receipt.applied, 0),
    };
  } finally {
    disposeHarness(h);
  }
}

async function createHarness(seed) {
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const flightSystem = Object.create(flightV3);
  const portsSystem = Object.create(aiPorts);
  const weaponsSystem = Object.create(weapons);
  const fieldsSystem = Object.create(fields);
  const physicsSystem = Object.create(physics);
  const combatSystem = Object.create(combat);
  const budgetSystem = Object.create(spawnBudget);
  const directorSystem = Object.create(encounterDirector);
  const sim = createSimulation({
    seed,
    systems: [tactical, flightSystem, portsSystem, weaponsSystem, fieldsSystem, physicsSystem,
      combatSystem, budgetSystem, directorSystem],
    updateOrder: [tactical, flightSystem, portsSystem, weaponsSystem, fieldsSystem, physicsSystem,
      combatSystem, directorSystem],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  const player = sim.spawn(playerSpec());
  state.playerId = player.id;
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  assert.deepEqual(sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: TENDER_ENCOUNTER.id,
    encounterId: ENCOUNTER_ID,
    sectorId: SECTOR_ID,
    anchor: { x: 0, z: 0 },
    zoneType: 'derelict_field',
    zoneRadius: 520,
    force: true,
  }), { ok: true, encounterId: ENCOUNTER_ID });
  const live = state.encounterDirector.live[ENCOUNTER_ID];
  const initialEnemies = live.ids.map((id) => state.entities.get(id));
  const tender = initialEnemies.find((entity) => entity.data?.lootTableId === 'hostile_repair_tender');
  const wing = initialEnemies
    .filter((entity) => entity.data?.ai?.encounterCompositionRole === 'light')
    .sort((left, right) => right.hullMax - left.hullMax)[0];
  assert.ok(tender);
  assert.ok(wing);
  const welds = [];
  const wells = [];
  const stops = [];
  bus.on('combat:hullRepaired', (payload) => {
    if (payload.encounterId === ENCOUNTER_ID) welds.push(structuredClone(payload));
  });
  bus.on('fields:deployed', (payload) => {
    if (payload.kind === 'well') wells.push(structuredClone(payload));
  });
  bus.on('specialist:repairTenderStopped', (payload) => {
    if (payload.encounterId === ENCOUNTER_ID) stops.push(structuredClone(payload));
  });
  assert.equal(runUntil({ sim, state }, () => live.phase === 'conflict', 360), true, dump({ live }));
  assert.equal(runUntil({ sim, state }, () => live.data.repairTender?.droneIds?.length === 1, 90), true,
    dump({ live }));
  const runtime = live.data.repairTender;
  const drone = state.entities.get(runtime.droneIds[0]);
  assert.ok(drone?.physicsBody?.dynamic, 'the repair pool must be a real dynamic physics body');
  return {
    sim, state, bus, live, player, tender, wing, drone, runtime, welds, wells, stops,
    repairRange: drone.data.repairTenderDrone.repairRange,
    initialEnemyIds: initialEnemies.map((entity) => entity.data?.lootTableId),
  };
}

async function damageWingAndObserveRepair(h) {
  const missingTarget = Math.min(48, Math.max(38, h.wing.hullMax * 0.38));
  h.state.nav.autopilot = null;
  for (let index = 0; index < 1200 && h.wing.alive !== false
    && h.wing.hull > h.wing.hullMax - missingTarget; index++) {
    aimAndFire(h.state, h.player, h.wing, distance(h.player, h.wing) <= 515);
    h.sim.step(SIM_DT);
  }
  h.state.input.fire = false;
  assert.equal(h.wing.alive, true, dump(routeSnapshot(h)));
  assert.ok(h.wing.hull <= h.wing.hullMax - missingTarget, dump(routeSnapshot(h)));
  assert.equal(runUntil(h, () => h.welds.some((receipt) => receipt.targetId === h.wing.id), 720), true,
    dump(routeSnapshot(h)));
}

function deployOutwardWell(h) {
  let dx = h.drone.pos.x - h.wing.pos.x;
  let dz = h.drone.pos.z - h.wing.pos.z;
  let length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    dx = h.wing.pos.x - h.player.pos.x;
    dz = h.wing.pos.z - h.player.pos.z;
    length = Math.hypot(dx, dz) || 1;
  }
  const center = {
    x: h.wing.pos.x + dx / length * 170,
    z: h.wing.pos.z + dz / length * 170,
  };
  h.state.nav.autopilot = null;
  h.state.input.fire = false;
  h.state.input.aimWorld = center;
  h.state.input.aimAngle = Math.atan2(center.z - h.player.pos.z, center.x - h.player.pos.x);
  h.player.rot = h.state.input.aimAngle;
  h.state.input.actions = h.state.input.actions || {};
  h.state.input.actions.deployWell = true;
  h.sim.step(SIM_DT);
  assert.equal(h.wells.length, 1, dump(routeSnapshot(h)));
  assert.ok(Math.hypot(h.wells[0].center.x - h.drone.pos.x, h.wells[0].center.z - h.drone.pos.z) < 190,
    `the deployed production Well must actually catch the drone: ${dump(routeSnapshot(h))}`);
}

function killWithPlayerWeapon(h, target, maxTicks) {
  h.state.nav.autopilot = null;
  for (let index = 0; index < maxTicks && target.alive !== false; index++) {
    const range = distance(h.player, target);
    const closing = range > 420;
    h.state.input.moveZ = closing ? 1 : 0;
    h.state.input.throttle = closing ? 1 : 0;
    h.state.input.brake = !closing;
    aimAndFire(h.state, h.player, target, range <= 515);
    h.sim.step(SIM_DT);
  }
  h.state.input.fire = false;
  h.state.input.moveZ = 0;
  h.state.input.throttle = 0;
  h.state.input.brake = false;
  return target.alive === false;
}

function aimAndFire(state, player, target, inRange) {
  state.input.fire = !!(target && inRange);
  state.player.targetId = target?.id ?? null;
  state.input.autoAim = target ? { targetId: target.id } : null;
  if (!target) return;
  const angle = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
  state.input.aimAngle = angle;
  player.rot = angle;
}

function runUntil(h, predicate, maxTicks) {
  for (let index = 0; index < maxTicks; index++) {
    if (predicate()) return true;
    h.sim.step(SIM_DT);
  }
  return predicate();
}

function disposeHarness(h) {
  h.sim.registry.get('physics')._disableSg02DynamicAuthority?.();
  h.sim.dispose();
}

function playerSpec() {
  return {
    type: 'ship', alive: true, collides: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 24, hull: 8_000, hullMax: 8_000,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 8_000, capMax: 8_000, capRegen: 800,
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

function distance(left, right) {
  if (!left?.pos || !right?.pos) return Infinity;
  return Math.hypot(left.pos.x - right.pos.x, left.pos.z - right.pos.z);
}

function routeSnapshot(h) {
  return {
    tick: h.state.tick,
    phase: h.live.phase,
    player: actor(h.player),
    tender: actor(h.tender),
    wing: actor(h.wing),
    drone: actor(h.drone),
    droneRepair: h.drone.data?.repairTenderDrone,
    welds: h.welds,
    wells: h.wells,
    stops: h.stops,
  };
}

function actor(entity) {
  return entity && {
    id: entity.id,
    alive: entity.alive,
    hull: entity.hull,
    hullMax: entity.hullMax,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    role: entity.data?.lootTableId || entity.data?.kind,
  };
}

function dump(value) {
  return JSON.stringify(value);
}
