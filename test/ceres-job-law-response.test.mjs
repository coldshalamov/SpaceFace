import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  CombatDoctrineRuntime,
  applyCombatDoctrineToSelection,
  overrideDirectiveForCombatDoctrine,
} from '../src/ai/combatDoctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { RulesOfEngagement } from '../src/ai/doctrine.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { aiPorts, clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { weapons } from '../src/systems/weapons.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;
const SLOT_ID = 'ceres_cathedral_patrol';
const LAW_HOLDER = 'lawSecurity';
const LAW_TRAFFIC_SLOT_IDS = Object.freeze([
  'ceres_ambush_escort',
  'ceres_cathedral_patrol',
]);
const CERES_TRAFFIC_SLOT_IDS = Object.freeze([
  ...CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== 'ceres_refinery_tender')
    .map((slot) => slot.id)),
  ...CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => slot.id),
]);
const OWN = Object.prototype.hasOwnProperty;
const AI_RESPONSE_FIELDS = Object.freeze([
  'lawful',
  'passive',
  'securityTargetId',
  'motive',
  'engagementTrigger',
  'zoneId',
  'approachTelegraph',
  'noFireResponseWindowS',
  'roe',
  'activity',
]);

const SLOT_ROW = (() => {
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    const slot = pocket.actorSlots.find((candidate) => candidate.id === SLOT_ID);
    if (slot) return { pocket, slot };
  }
  throw new Error(`missing authored Ceres slot ${SLOT_ID}`);
})();
const WORLD_RECORD_ID = stableRecordId(
  SEED,
  CERES_ACTIVITY_SECTOR_ID,
  RECORD_KIND.CONVOY,
  SLOT_ROW.slot.worldRecordSlotId,
);

function routeFor(pocket, slot) {
  return slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES_ACTIVITY_SECTOR_ID),
    targetRef: mark.targetRef,
  }));
}

function globalSlotPosition(pocket, slot) {
  return sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
    z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
  }, CERES_ACTIVITY_SECTOR_ID);
}

function descriptorShape(value, fields) {
  const source = value && typeof value === 'object' ? value : null;
  const out = {};
  for (const field of fields) {
    out[field] = source && OWN.call(source, field)
      ? { own: true, value: source[field] }
      : { own: false };
  }
  return out;
}

function responseShape(entity) {
  return {
    ai: descriptorShape(entity.data.ai, AI_RESPONSE_FIELDS),
    combat: descriptorShape(entity.data.combat, ['targetId', 'lockTarget']),
    intent: descriptorShape(entity.data.intent, ['fire', 'fireGroup']),
  };
}

function bootProductionTrafficCast() {
  const sim = createSimulation({
    seed: SEED,
    systems: [lawSecurity, aiPorts, npcJobsRuntime, traffic, combat, weapons, physics],
    updateOrder: [physics],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
  state.world.sectors[CERES_ACTIVITY_SECTOR_ID] = {
    id: CERES_ACTIVITY_SECTOR_ID,
    factionId: 'faction_scn',
    security: 0.3,
    tier: 2,
  };

  const slotPos = globalSlotPosition(SLOT_ROW.pocket, SLOT_ROW.slot);
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x - 200, z: slotPos.z },
    radius: 42,
    data: {
      stationId: 'station_ceres_test',
      dockRadius: 72,
      factionId: 'faction_scn',
    },
  });
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_free',
    pos: { x: slotPos.x - 120, z: slotPos.z + 60 },
  }));
  state.playerId = player.id;
  const attacker = sim.spawn(makeShipEntitySpec('ship_hornet', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: slotPos.x + 45, z: slotPos.z },
    rot: Math.PI,
    ai: { lawful: false, passive: false, spawnContext: 'zone_hostile' },
  }));

  let stateRngDraws = 0;
  let trafficRngDraws = 0;
  const stateRng = state.rng;
  state.rng = () => {
    stateRngDraws += 1;
    return stateRng();
  };
  const trafficSystem = sim.registry.get('traffic');
  const trafficRng = trafficSystem._rng;
  trafficSystem._rng = () => {
    trafficRngDraws += 1;
    return trafficRng();
  };
  bus.emit('sector:enter', {
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    sector: {
      ...state.world.sectors[CERES_ACTIVITY_SECTOR_ID],
      trafficPerMin: 999,
      industries: { mining: true, refinery: true },
    },
  });
  const cast = state.traffic.freighters.map((record) => state.entities.get(record.id));
  return {
    sim,
    state,
    bus,
    station,
    player,
    attacker,
    cast,
    patrol: cast.find((entity) => entity?.data?.activityActorSlotId === SLOT_ID),
    runtime: sim.registry.get('npcJobsRuntime'),
    law: sim.registry.get('lawSecurity'),
    ports: sim.registry.get('aiPorts'),
    combat: sim.registry.get('combat'),
    weapons: sim.registry.get('weapons'),
    physics: sim.registry.get('physics'),
    rngDraws: () => ({ state: stateRngDraws, traffic: trafficRngDraws }),
  };
}

function boot({ withOrdinaryResponder = false } = {}) {
  // This order matches the production update order. Helpers are shared by reference, so the NPC
  // job API installed during init is visible to the earlier law and AI systems at dispatch time.
  const sim = createSimulation({
    seed: SEED,
    systems: [lawSecurity, aiPorts, npcJobsRuntime],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
  state.world.sectors[CERES_ACTIVITY_SECTOR_ID] = {
    id: CERES_ACTIVITY_SECTOR_ID,
    factionId: 'faction_scn',
    security: 0.3,
    tier: 2,
  };

  const slotPos = globalSlotPosition(SLOT_ROW.pocket, SLOT_ROW.slot);
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x, z: slotPos.z },
    radius: 42,
    data: {
      stationId: 'station_ceres_test',
      dockRadius: 72,
      factionId: 'faction_scn',
    },
  });
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: slotPos.x + 20, z: slotPos.z },
    hull: 200,
    hullMax: 200,
    radius: 8,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  const attacker = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: slotPos.x + 45, z: slotPos.z },
    hull: 120,
    hullMax: 120,
    radius: 7,
    data: {
      ai: { lawful: false, passive: false, spawnContext: 'zone_hostile' },
      combat: {},
      intent: { fire: false },
    },
  });

  const patrol = sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x + 65, z: slotPos.z },
    hull: 140,
    hullMax: 140,
    radius: 7,
    data: {
      worldRecordId: WORLD_RECORD_ID,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      activityActorSlotId: SLOT_ID,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: 'patrol',
      ai: {
        lawful: true,
        passive: true,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.HOLD_FIRE,
        activity: undefined,
      },
      combat: { lockTarget: 'prior_lock' },
      intent: {
        moveX: 0.25,
        moveZ: -0.5,
        boost: false,
        brake: false,
        aimAngle: 0.7,
        fireGroup: null,
      },
    },
  });
  const runtime = sim.registry.get('npcJobsRuntime');
  const jobId = runtime.assign(patrol, {
    kind: NPC_JOB_KIND.PATROL,
    route: routeFor(SLOT_ROW.pocket, SLOT_ROW.slot),
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    speed: 100,
    commissionS: 1,
    departS: 1,
    approachS: 1,
    workS: 4,
    loadS: 1,
    unloadS: 1,
    dwellS: 1,
  });
  assert.ok(jobId, 'fixture must own a real Ceres patrol job');

  let ordinary = null;
  if (withOrdinaryResponder) {
    ordinary = sim.spawn({
      type: 'ship',
      team: 1,
      factionId: 'faction_scn',
      pos: { x: slotPos.x + 180, z: slotPos.z },
      hull: 140,
      hullMax: 140,
      radius: 7,
      data: {
        trafficRole: 'patrol',
        ai: {
          lawful: true,
          passive: false,
          combatDoctrineId: 'interceptor_flyby',
          motive: 'law_enforcement',
          engagementTrigger: 'wanted_status',
          zoneId: 'ceres_test_patrol',
          approachTelegraph: 'patrol_challenge',
          noFireResponseWindowS: 1,
          roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
        },
        combat: {},
        intent: { fire: false },
      },
    });
  }

  return {
    sim,
    state,
    bus,
    station,
    player,
    attacker,
    patrol,
    ordinary,
    runtime,
    jobId,
    law: sim.registry.get('lawSecurity'),
    ports: sim.registry.get('aiPorts'),
  };
}

function bootNonCeresJobPatrol() {
  const sectorId = 'sector_helios_prime';
  const sim = createSimulation({
    seed: SEED,
    systems: [lawSecurity, aiPorts, npcJobsRuntime],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.world.sectors[sectorId] = {
    id: sectorId,
    factionId: 'faction_scn',
    security: 0.3,
    tier: 0,
  };
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    radius: 42,
    data: { stationId: 'station_helios', dockRadius: 72, factionId: 'faction_scn' },
  });
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    pos: { x: 80, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
  });
  state.playerId = player.id;
  const attacker = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 110, z: 0 },
    hull: 120,
    hullMax: 120,
    radius: 7,
    data: {
      ai: { lawful: false, passive: false, spawnContext: 'zone_hostile' },
      combat: {},
      intent: { fire: false },
    },
  });
  const patrol = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_scn',
    homeSectorId: sectorId,
    pos: { x: 150, z: 20 },
    hull: 140,
    hullMax: 140,
    radius: 7,
    data: {
      worldRecordId: 'wr_helios_durable_patrol_1',
      sectorId,
      homeSectorId: sectorId,
      activityActorSlotId: 'helios_durable_patrol',
      trafficRole: 'patrol',
      ai: {
        lawful: true,
        passive: true,
        roe: RulesOfEngagement.HOLD_FIRE,
      },
      combat: {},
      intent: { moveX: 0, moveZ: 0, boost: false, brake: false, fire: false },
    },
  });
  const runtime = sim.registry.get('npcJobsRuntime');
  const jobId = runtime.assign(patrol, {
    kind: NPC_JOB_KIND.PATROL,
    route: [
      { id: 'helios_patrol_a', label: 'Helios patrol A', pos: { x: 150, z: 20 } },
      { id: 'helios_patrol_b', label: 'Helios patrol B', pos: { x: 220, z: 80 } },
    ],
    sectorId,
    speed: 80,
    commissionS: 1,
    departS: 1,
    approachS: 1,
    workS: 4,
    loadS: 1,
    unloadS: 1,
    dwellS: 1,
  });
  assert.ok(jobId, 'fixture must own a production npcJobs patrol outside Ceres');
  return {
    sim,
    state,
    bus,
    station,
    player,
    attacker,
    patrol,
    runtime,
    jobId,
    law: sim.registry.get('lawSecurity'),
    ports: sim.registry.get('aiPorts'),
  };
}

function dispatch(harness) {
  harness.bus.emit('combat:damage', {
    attackerId: harness.attacker.id,
    targetId: harness.player.id,
    applied: 12,
    amount: 12,
    kind: 'kinetic',
  });
  const incidents = Object.values(harness.state.lawSecurity.incidents);
  assert.equal(incidents.length, 1, 'real protected damage must open one incident');
  const incident = incidents[0];
  harness.state.simTime = incident.dispatchAt;
  harness.state.tick = Math.max(1, harness.state.tick | 0);
  harness.law.update(SIM_DT, harness.state);
  assert.equal(incident.status, 'responding');
  return incident;
}

test('production Ceres law job hulls carry canonical weapons and interceptor doctrine without cast drift', () => {
  const harness = bootProductionTrafficCast();
  assert.deepEqual(
    harness.cast.map((entity) => entity?.data?.activityActorSlotId),
    CERES_TRAFFIC_SLOT_IDS,
    'the exact R5 authored cast and spawn order stay fixed',
  );
  assert.equal(Object.keys(harness.state.npcJobs.byId).length, 7);
  assert.deepEqual(harness.rngDraws(), { state: 0, traffic: 0 });
  assert.deepEqual(
    harness.cast
      .filter((entity) => LAW_TRAFFIC_SLOT_IDS.includes(entity?.data?.activityActorSlotId))
      .map((entity) => ({
        slotId: entity.data.activityActorSlotId,
        defId: entity.data.defId,
        fittedIds: entity.data.fittings.filter(Boolean),
        weaponIds: entity.data.weapons.map((weapon) => weapon.defId),
        combatDoctrineId: entity.data.ai.combatDoctrineId,
      })),
    LAW_TRAFFIC_SLOT_IDS.map((slotId) => ({
      slotId,
      defId: 'ship_wasp',
      fittedIds: ['wpn_pulse_laser_s'],
      weaponIds: ['wpn_pulse_laser_s'],
      combatDoctrineId: 'interceptor_flyby',
    })),
  );
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.actorSlots) {
      if (slot.id === 'ceres_refinery_tender') continue;
      const worldRecordId = stableRecordId(
        SEED,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        slot.worldRecordSlotId,
      );
      const entry = harness.state.npcJobs.byId[`job:${worldRecordId}`];
      assert.ok(entry, `${slot.id} retains its stable job identity`);
      assert.deepEqual(entry.job.route, routeFor(pocket, slot), `${slot.id} route is unchanged`);
    }
  }
  for (const entity of harness.cast) {
    if (LAW_TRAFFIC_SLOT_IDS.includes(entity.data.activityActorSlotId)) continue;
    assert.equal(entity.data.weapons.length, 0, `${entity.data.activityActorSlotId} stays unarmed`);
    assert.equal(Object.hasOwn(entity.data.ai, 'combatDoctrineId'), false,
      `${entity.data.activityActorSlotId} gains no combat doctrine`);
  }
});

test('a real production patrol fires its authored weapon through physics damage after the response window', async () => {
  const harness = bootProductionTrafficCast();
  try {
    assert.equal(harness.state.settings.gameplay.physicsBackend, 'rapier-dynamic',
      'the proof uses the production-default physics authority');
    assert.equal(await harness.physics.prepareBackend(harness.state), true,
      'the weapons proof prepares the production Rapier authority');
    const weaponList = harness.patrol.data.weapons;
    const fittingList = harness.patrol.data.fittings;
    const responseBefore = responseShape(harness.patrol);
    assert.equal(Object.hasOwn(harness.patrol.data, 'intent'), true);
    assert.equal(harness.patrol.data.intent, null, 'production traffic begins with an exact null intent');
    const incident = dispatch(harness);
    assert.equal(incident.responderIds.includes(harness.patrol.id), true);
    assert.equal(harness.patrol.data.weapons, weaponList, 'law borrows rather than synthesizes weapons');
    assert.equal(harness.patrol.data.fittings, fittingList, 'law never rewrites canonical fittings');
    assert.equal(harness.patrol.data.intent.fire, false, 'dispatch itself does not retain a fire bit');

    const ai = harness.patrol.data.ai;
    const responseReadyTick = ai.activity.startedTick + Math.ceil(ai.noFireResponseWindowS * 60);
    const doctrineRuntime = new CombatDoctrineRuntime({ seed: SEED });
    const baseDirective = {
      tactic: 'swarm_pincer',
      objective: { kind: ObjectiveKind.ENGAGE, targetId: harness.attacker.id, reason: 'security_response' },
    };
    const perception = {
      self: {
        id: harness.patrol.id,
        pos: harness.patrol.pos,
        vel: harness.patrol.vel,
        rot: harness.patrol.rot,
        activity: ai.activity,
        roe: ai.roe,
        combatDoctrineId: ai.combatDoctrineId,
        operationalMassBand: 'light',
        factionBehavior: null,
      },
      contacts: [{
        id: harness.attacker.id,
        kind: ContactKind.SHIP,
        alive: true,
        valid: true,
        visible: true,
        hostile: true,
        confidence: 1,
        threat: 1,
        mobilityBand: 'medium',
        pos: harness.attacker.pos,
        vel: harness.attacker.vel,
      }],
      events: [],
    };
    function productionDecision(tick) {
      const combatDoctrine = doctrineRuntime.update({
        tick,
        entityId: harness.patrol.id,
        doctrineId: ai.combatDoctrineId,
        perception,
        directive: baseDirective,
      });
      const directive = overrideDirectiveForCombatDoctrine(baseDirective, combatDoctrine);
      const selected = applyCombatDoctrineToSelection({
        actionId: 'action_burst',
        targetId: harness.attacker.id,
        targetContact: perception.contacts[0],
      }, combatDoctrine);
      return {
        entityId: harness.patrol.id,
        directive,
        action: {
          actionId: selected.actionId,
          targetId: selected.targetId,
          status: selected.actionId ? 'running' : 'idle',
        },
        combatDoctrine,
      };
    }

    harness.state.tick = responseReadyTick - 1;
    const telegraphDecision = productionDecision(harness.state.tick);
    assert.equal(telegraphDecision.combatDoctrine.phase, 'engine_flare');
    applyAIFiringIntent(telegraphDecision, harness.state);
    assert.equal(harness.patrol.data.intent.fire, false,
      'the traffic-authored doctrine keeps its gun cold through the challenge/telegraph beat');

    harness.state.tick += 30;
    harness.state.simTime = harness.state.tick * SIM_DT;
    const strikeDecision = productionDecision(harness.state.tick);
    assert.equal(strikeDecision.combatDoctrine.doctrineId, ai.combatDoctrineId);
    assert.equal(strikeDecision.combatDoctrine.phase, 'strike');
    assert.equal(strikeDecision.action.actionId, 'action_burst');
    applyAIFiringIntent(strikeDecision, harness.state);
    assert.equal(harness.patrol.data.intent.fire, true,
      'the production firing adapter authors the first eligible fire intent');
    harness.ports.update(SIM_DT, harness.state);
    assert.equal(harness.patrol.data.intent.fire, true, 'the exact live law lease passes the team-2 port');

    const fireReceipts = [];
    const hitReceipts = [];
    const damageReceipts = [];
    harness.bus.on('combat:fire', (payload) => fireReceipts.push(payload));
    harness.bus.on('projectile:hit', (payload) => hitReceipts.push(payload));
    harness.bus.on('combat:damage', (payload) => damageReceipts.push(payload));
    harness.weapons.update(SIM_DT, harness.state);
    const projectile = harness.state.entityList.find((entity) => entity?.type === 'projectile'
      && entity.data?.ownerId === harness.patrol.id
      && entity.data?.weaponId === 'wpn_pulse_laser_s');
    assert.ok(projectile, 'the live weapons system spawns the fitted pulse-laser projectile');
    assert.equal(fireReceipts.some((receipt) => receipt.ownerId === harness.patrol.id
      && receipt.weaponId === 'wpn_pulse_laser_s'), true);

    const durabilityBefore = harness.attacker.shield + harness.attacker.armorHp + harness.attacker.hull;
    for (let step = 0; step < 30 && projectile.alive !== false; step++) harness.sim.step(SIM_DT);
    const hit = hitReceipts.find((receipt) => receipt.ownerId === harness.patrol.id
      && receipt.targetId === harness.attacker.id
      && receipt.weaponId === 'wpn_pulse_laser_s');
    assert.ok(hit, 'the production physics sweep collides the spawned projectile with the attacker');
    assert.deepEqual(hit.damagePacket.channels, projectile.data.damagePacket.channels,
      'physics preserves the weapons-owned damage channels');
    assert.deepEqual(hit.damagePacket.source, projectile.data.damagePacket.source,
      'physics preserves the weapons-owned source identity');
    assert.ok(Number.isFinite(hit.damagePacket.hit?.pos?.x)
      && Number.isFinite(hit.damagePacket.hit?.pos?.z),
    'physics owns the finite collision payload added to the weapon packet');
    assert.equal(harness.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
    assert.equal(harness.state.physicsRuntime.diagnostics.sweptProjectileHits, 1,
      'the hit tick records exactly one production sweep collision');
    assert.equal(projectile.alive, false, 'physics retires the consumed projectile');
    assert.equal(harness.state.entities.has(projectile.id), false,
      'the core lifetime sweep removes the retired projectile from authority');
    assert.equal(harness.state.entityList.includes(projectile), false,
      'the retired projectile also leaves the ordered entity membrane');
    const durabilityAfter = harness.attacker.shield + harness.attacker.armorHp + harness.attacker.hull;
    assert.ok(durabilityAfter < durabilityBefore, 'combat authority applies the physics-owned hit');
    assert.equal(damageReceipts.some((receipt) => receipt.attackerId === harness.patrol.id
      && receipt.targetId === harness.attacker.id
      && receipt.weaponId === 'wpn_pulse_laser_s'
      && receipt.applied > 0), true, 'the physics hit reaches the canonical damage receipt');

    harness.patrol.data.intent.moveX = 0.875;
    harness.patrol.data.intent.brake = true;
    harness.patrol.data.intent.unrelatedMovementKey = 'law-successor-only';
    harness.attacker.alive = false;
    harness.state.tick += 1;
    harness.state.simTime += SIM_DT;
    harness.law.update(SIM_DT, harness.state);
    assert.equal(harness.runtime.controlClaim(harness.patrol.data.jobId), null);
    assert.deepEqual(responseShape(harness.patrol), responseBefore,
      'stand-down restores absent and present traffic-owned field shapes exactly');
    assert.equal(Object.hasOwn(harness.patrol.data, 'intent'), true);
    assert.equal(harness.patrol.data.intent, null,
      'stand-down restores the production top-level null and drops the law-created successor');
  } finally {
    harness.physics._disableSg02DynamicAuthority();
    harness.sim.dispose();
  }
});

test('real protected damage borrows the authored Ceres patrol before steering it', () => {
  const harness = boot();
  const entry = harness.runtime._byId()[harness.jobId];
  const jobTimeBefore = entry.job.simTime;
  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), true);
  const claim = harness.runtime.controlClaim(harness.jobId);
  assert.equal(claim?.holder, LAW_HOLDER);
  assert.equal(claim?.claimedEntityId, harness.patrol.id);
  assert.match(claim?.claimId || '', new RegExp(`^lawSecurity:${incident.id}:`));

  harness.patrol.data.intent.moveX = 0.625;
  harness.patrol.data.intent.moveZ = -0.375;
  harness.patrol.data.intent.boost = true;
  harness.sim.runTicks(12);
  assert.equal(harness.patrol.data.intent.moveX, 0.625, 'leased movement has one writer');
  assert.equal(harness.patrol.data.intent.moveZ, -0.375, 'leased movement has one writer');
  assert.equal(harness.patrol.data.intent.boost, true, 'leased movement has one writer');
  assert.ok(entry.job.simTime > jobTimeBefore, 'the kernel route clock must continue under the lease');
});

test('the exact live law lease opens the team-2 firing port without bypassing final authority', () => {
  const harness = boot();
  dispatch(harness);
  const ai = harness.patrol.data.ai;
  const activityReadyTick = ai.activity.startedTick + Math.ceil(ai.noFireResponseWindowS * 60);
  harness.state.tick = activityReadyTick;
  harness.patrol.data.intent.fire = true;
  harness.patrol.data.intent.fireGroup = 'primary';

  assert.equal(clearIneligibleAIFiringIntents(harness.state, harness.sim.helpers), 0);
  assert.equal(harness.patrol.data.intent.fire, true);
  assert.equal(harness.patrol.data.intent.fireGroup, 'primary');
  assert.deepEqual(authorizeAIEngagement({
    state: harness.state,
    self: harness.patrol,
    target: harness.attacker,
    tick: harness.state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  }), { ok: true, reason: 'authorized' });
});

test('a foreign movement claim makes the job hull ineligible and preserves ordinary fallback', () => {
  const harness = boot({ withOrdinaryResponder: true });
  const foreign = harness.runtime.claimControl(harness.jobId, {
    claimId: 'mission:foreign:pursuit',
    holder: 'missionSystem',
  });
  assert.equal(foreign.granted, true);
  const before = descriptorShape(harness.patrol.data.ai, AI_RESPONSE_FIELDS);
  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), false);
  assert.equal(incident.responderIds.includes(harness.ordinary.id), true);
  assert.equal(harness.runtime.controlClaim(harness.jobId)?.claimId, 'mission:foreign:pursuit');
  assert.deepEqual(descriptorShape(harness.patrol.data.ai, AI_RESPONSE_FIELDS), before);
});

test('a canonical slot tag cannot lend an unrelated stable job identity law authority', () => {
  const harness = boot({ withOrdinaryResponder: true });
  const before = responseShape(harness.patrol);
  harness.patrol.data.worldRecordId = 'wr_convoy_spoofed';
  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), false);
  assert.equal(incident.responderIds.includes(harness.ordinary.id), true);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.deepEqual(responseShape(harness.patrol), before);
});

test('a foreign home-sector authority cannot borrow a canonically tagged Ceres job', () => {
  const harness = boot({ withOrdinaryResponder: true });
  const before = responseShape(harness.patrol);
  harness.patrol.data.homeSectorId = 'sector_helios_prime';
  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), false);
  assert.equal(incident.responderIds.includes(harness.ordinary.id), true);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.deepEqual(responseShape(harness.patrol), before);
});

test('threat clear returns movement ownership and restores every law-touched own-property shape', () => {
  const harness = boot();
  const before = responseShape(harness.patrol);
  const originalIntent = harness.patrol.data.intent;
  const incident = dispatch(harness);
  assert.ok(harness.runtime.controlClaim(harness.jobId));
  assert.notDeepEqual(responseShape(harness.patrol), before);
  assert.equal(JSON.stringify(harness.state.lawSecurity).includes('lawSecurity:'), false,
    'the private lease ledger must not expand save state');
  harness.patrol.data.intent.unrelatedMovementKey = 'keep-through-law-release';

  harness.attacker.alive = false;
  harness.state.tick += 15;
  harness.state.simTime += 0.25;
  harness.law.update(SIM_DT, harness.state);

  assert.equal(Object.keys(harness.state.lawSecurity.incidents).length, 0);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.deepEqual(responseShape(harness.patrol), before);
  assert.equal(harness.patrol.data.intent, originalIntent,
    'an original object container keeps its exact identity');
  assert.equal(harness.patrol.data.intent.unrelatedMovementKey, 'keep-through-law-release',
    'law restoration leaves unrelated controller-era keys alone');
});

test('stand-down restores absent, own-undefined, and null response containers exactly', () => {
  const cases = [
    ['absent combat', 'combat', 'absent'],
    ['own undefined combat', 'combat', 'undefined'],
    ['own null combat', 'combat', 'null'],
    ['absent intent', 'intent', 'absent'],
    ['own undefined intent', 'intent', 'undefined'],
  ];
  for (const [label, field, shape] of cases) {
    const harness = boot();
    if (shape === 'absent') delete harness.patrol.data[field];
    else if (shape === 'undefined') harness.patrol.data[field] = undefined;
    else harness.patrol.data[field] = null;
    const ownBefore = OWN.call(harness.patrol.data, field);
    const valueBefore = harness.patrol.data[field];

    dispatch(harness);
    assert.equal(typeof harness.patrol.data[field], 'object', `${label}: law creates a live successor`);
    harness.attacker.alive = false;
    harness.state.simTime += 0.25;
    harness.state.tick += 15;
    harness.law.update(SIM_DT, harness.state);

    assert.equal(harness.runtime.controlClaim(harness.jobId), null, `${label}: lease releases`);
    assert.equal(OWN.call(harness.patrol.data, field), ownBefore, `${label}: own-property shape`);
    assert.equal(harness.patrol.data[field], valueBefore, `${label}: exact top-level value`);
  }
});

test('a replaced successor container is never law-restored or overwritten during lease release', () => {
  const harness = boot();
  const responseBefore = responseShape(harness.patrol);
  dispatch(harness);
  const replacementIntent = {
    moveX: -0.2,
    moveZ: 0.4,
    boost: true,
    brake: true,
    replacementIntent: true,
    unrelatedMovementKey: 'foreign-owner',
  };
  const replacementBefore = { ...replacementIntent };
  harness.patrol.data.intent = replacementIntent;

  harness.law.update(SIM_DT, harness.state);

  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.patrol.data.intent, replacementIntent,
    'the foreign successor identity stays authoritative');
  assert.deepEqual(harness.patrol.data.intent, replacementBefore,
    'release neither restores law fields nor neutralizes unrelated foreign movement');
  assert.deepEqual(responseShape(harness.patrol).ai, responseBefore.ai,
    'the still-exact AI successor cannot retain law response authority');
  assert.deepEqual(responseShape(harness.patrol).combat, responseBefore.combat,
    'the still-exact combat successor returns to its pre-dispatch shape');
});

test('a replaced combat successor stays foreign while exact AI and intent state restore', () => {
  const harness = boot();
  const responseBefore = responseShape(harness.patrol);
  const originalIntent = harness.patrol.data.intent;
  dispatch(harness);
  const replacementCombat = {
    targetId: 'foreign_target',
    lockTarget: 'foreign_lock',
    replacementCombat: true,
  };
  const replacementBefore = { ...replacementCombat };
  harness.patrol.data.combat = replacementCombat;

  harness.law.update(SIM_DT, harness.state);

  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.patrol.data.combat, replacementCombat);
  assert.deepEqual(harness.patrol.data.combat, replacementBefore,
    'law cleanup never targets the foreign combat successor');
  assert.deepEqual(responseShape(harness.patrol).ai, responseBefore.ai);
  assert.equal(harness.patrol.data.intent, originalIntent);
  assert.deepEqual(responseShape(harness.patrol).intent, responseBefore.intent,
    'the exact intent successor still returns to its pre-dispatch fire shape');
});

test('a same-id replacement entity stays exact while the obsolete live lease is released', () => {
  const harness = boot();
  dispatch(harness);
  const entry = harness.runtime._byId()[harness.jobId];
  const replacementData = {
    ...harness.patrol.data,
    ai: {
      lawful: true,
      passive: true,
      combatDoctrineId: 'interceptor_flyby',
      roe: RulesOfEngagement.HOLD_FIRE,
      replacementMarker: 'live-lease-replacement',
    },
    combat: { replacementTarget: 'none' },
    intent: {
      moveX: -0.6,
      moveZ: 0.3,
      boost: true,
      brake: true,
      replacementIntent: true,
      unrelatedMovementKey: 'replacement-owner',
    },
  };
  const replacement = { ...harness.patrol, data: replacementData };
  const aiBefore = { ...replacementData.ai };
  const combatBefore = { ...replacementData.combat };
  const intentBefore = { ...replacementData.intent };
  harness.state.entities.set(replacement.id, replacement);
  const listIndex = harness.state.entityList.indexOf(harness.patrol);
  harness.state.entityList[listIndex] = replacement;

  harness.law.update(SIM_DT, harness.state);

  assert.equal(harness.runtime.activeControlClaimCount(), 0);
  assert.equal(harness.runtime._byId()[harness.jobId], entry, 'the live job remains the kernel owner');
  assert.equal(replacement.data, replacementData, 'replacement data identity is never borrowed');
  assert.deepEqual(replacement.data.ai, aiBefore);
  assert.deepEqual(replacement.data.combat, combatBefore);
  assert.deepEqual(replacement.data.intent, intentBefore,
    'owner release does not neutralize the replacement entity movement container');
});

test('a same-id entity wrapper reusing captured data and intent receives no owner release writes', () => {
  const harness = boot();
  dispatch(harness);
  const capturedData = harness.patrol.data;
  const capturedIntent = capturedData.intent;
  const intentBefore = { ...capturedIntent };
  const replacement = { ...harness.patrol, replacementWrapper: true };
  harness.state.entities.set(replacement.id, replacement);
  const listIndex = harness.state.entityList.indexOf(harness.patrol);
  harness.state.entityList[listIndex] = replacement;

  harness.law.update(SIM_DT, harness.state);

  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(replacement.data, capturedData, 'the wrapper keeps the exact reused data authority');
  assert.equal(replacement.data.intent, capturedIntent, 'the wrapper keeps the exact reused intent ref');
  assert.deepEqual(replacement.data.intent, intentBefore,
    'entity-wrapper replacement forces owner release through private scratch only');
});

test('a job-entry wrapper reusing the live entity and intent receives no owner release writes', () => {
  const harness = boot();
  dispatch(harness);
  const capturedIntent = harness.patrol.data.intent;
  const intentBefore = { ...capturedIntent };
  const priorEntry = harness.state.npcJobs.byId[harness.jobId];
  const replacementEntry = {
    ...priorEntry,
    job: { ...priorEntry.job },
    replacementWrapper: true,
  };
  harness.state.npcJobs.byId[harness.jobId] = replacementEntry;

  harness.law.update(SIM_DT, harness.state);

  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.state.npcJobs.byId[harness.jobId], replacementEntry);
  assert.equal(harness.patrol.data.intent, capturedIntent);
  assert.deepEqual(harness.patrol.data.intent, intentBefore,
    'entry/job-wrapper replacement forces owner release through private scratch only');
});

test('death, destroy, sector exit, restore, new game, and destroy all release the private lease', () => {
  const cases = [
    ['responder death', (h) => h.bus.emit('entity:killed', { id: h.patrol.id })],
    ['responder destroy', (h) => h.bus.emit('entity:destroyed', { entityId: h.patrol.id })],
    ['sector exit', (h) => h.bus.emit('sector:exit', { sectorId: CERES_ACTIVITY_SECTOR_ID })],
    ['save restore', (h) => h.bus.emit('save:restoring', { version: 1 })],
    ['new game', (h) => h.law.newGame()],
    ['system destroy', (h) => h.law.destroy()],
  ];
  for (const [label, terminate] of cases) {
    const harness = boot();
    dispatch(harness);
    assert.equal(harness.runtime.activeControlClaimCount(), 1, `${label}: precondition`);
    terminate(harness);
    assert.equal(harness.runtime.activeControlClaimCount(), 0, `${label}: claim must release`);
  }
});

test('a failed owner release retains the private record and retries after incident close', () => {
  const harness = boot();
  dispatch(harness);
  const api = harness.sim.helpers.npcJobs;
  const releaseControl = api.releaseControl;
  let releaseAttempts = 0;
  api.releaseControl = () => {
    releaseAttempts += 1;
    return { released: false, reason: 'test_residual_claim', restored: false };
  };

  harness.attacker.alive = false;
  harness.state.simTime += 0.25;
  harness.state.tick += 15;
  harness.law.update(SIM_DT, harness.state);
  assert.equal(releaseAttempts, 1);
  assert.ok(harness.runtime.controlClaim(harness.jobId), 'the owner still reports the residual lease');
  assert.equal(harness.law._jobResponseClaims.size, 1,
    'law retains the bounded private record until owner release is verified');

  api.releaseControl = releaseControl;
  harness.law.update(SIM_DT, harness.state);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.law._jobResponseClaims.size, 0, 'the terminal retry clears the verified record');
});

test('a Continue-style replacement with the same numeric id is never restored from the old hull', () => {
  const harness = boot();
  dispatch(harness);
  const oldEntry = harness.runtime._byId()[harness.jobId];
  const replacement = {
    ...harness.patrol,
    data: {
      ...harness.patrol.data,
      ai: {
        lawful: true,
        passive: true,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.HOLD_FIRE,
        replacementMarker: 'continue',
      },
      combat: { replacementTarget: 'none' },
      intent: { moveX: -0.2, moveZ: 0.4, replacementIntent: true },
    },
  };
  const replacementBefore = responseShape(replacement);
  harness.state.entities.set(replacement.id, replacement);
  const listIndex = harness.state.entityList.indexOf(harness.patrol);
  harness.state.entityList[listIndex] = replacement;
  harness.state.npcJobs.byId[harness.jobId] = {
    ...oldEntry,
    job: JSON.parse(JSON.stringify(oldEntry.job)),
    control: null,
  };

  harness.law.update(SIM_DT, harness.state);
  assert.equal(harness.runtime.activeControlClaimCount(), 0);
  assert.deepEqual(responseShape(replacement), replacementBefore,
    'a reused entity id cannot receive the captured object\'s pre-dispatch state');
});

test('all stale or mismatched team-2 response shapes remain disarmed', () => {
  const cases = [
    ['missing helpers', (h) => ({ helpers: null })],
    ['wrong slot', (h) => { h.patrol.data.activityActorSlotId = 'ceres_seam_surveyor'; }],
    ['missing stable job id', (h) => { delete h.patrol.data.jobId; }],
    ['spoofed stable identity', (h) => { h.patrol.data.worldRecordId = 'wr_convoy_spoofed'; }],
    ['wrong target', (h) => { h.patrol.data.combat.targetId = h.player.id; }],
    ['wrong doctrine', (h) => { h.patrol.data.ai.combatDoctrineId = 'ranged_disengager'; }],
    ['reopened response window', (h) => {
      h.patrol.data.ai.activity = { ...h.patrol.data.ai.activity, startedTick: h.state.tick };
    }],
    ['passive', (h) => { h.patrol.data.ai.passive = true; }],
    ['foreign sector', (h) => { h.state.world.currentSectorId = 'sector_helios_prime'; }],
    ['foreign home sector', (h) => { h.patrol.data.homeSectorId = 'sector_helios_prime'; }],
    ['foreign lease', (h) => {
      const claim = h.runtime.controlClaim(h.jobId);
      h.runtime.releaseControl(h.jobId, claim.claimId);
      h.runtime.claimControl(h.jobId, { claimId: 'mission:foreign', holder: 'missionSystem' });
    }],
  ];
  for (const [label, mutate] of cases) {
    const harness = boot();
    dispatch(harness);
    const options = mutate(harness) || {};
    harness.patrol.data.intent.fire = true;
    harness.patrol.data.intent.fireGroup = 'primary';
    assert.equal(
      clearIneligibleAIFiringIntents(harness.state, options.helpers === null ? null : harness.sim.helpers),
      1,
      label,
    );
    assert.equal(harness.patrol.data.intent.fire, false, label);
    assert.equal(harness.patrol.data.intent.fireGroup, null, label);
  }
});

test('a production non-Ceres job patrol retains the ordinary law-dispatch path', () => {
  const harness = bootNonCeresJobPatrol();
  const stableJobIdentity = {
    jobId: harness.patrol.data.jobId,
    worldRecordId: harness.patrol.data.worldRecordId,
    activityActorSlotId: harness.patrol.data.activityActorSlotId,
  };

  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), true,
    'a genuine non-Ceres durable patrol remains an ordinary lawful responder');
  assert.equal(harness.runtime.controlClaim(harness.jobId), null,
    'legacy non-Ceres dispatch gains no Ceres movement lease');
  assert.equal(harness.law._jobResponseClaims.size, 0,
    'legacy non-Ceres dispatch never enters the private Ceres response ledger');
  assert.deepEqual({
    jobId: harness.patrol.data.jobId,
    worldRecordId: harness.patrol.data.worldRecordId,
    activityActorSlotId: harness.patrol.data.activityActorSlotId,
  }, stableJobIdentity, 'ordinary dispatch does not rewrite durable job identity fields');
  assert.equal(OWN.call(harness.patrol.data, 'ceresActivityCast'), false);
  assert.equal(OWN.call(harness.patrol.data, 'ceresActivityJobOwned'), false);
  assert.equal(harness.patrol.data.ai.securityTargetId, harness.attacker.id,
    'the unchanged ordinary response still authorizes the real patrol');
  assert.equal(harness.patrol.data.ai.engagementTrigger, 'security_response');
});

test('current Ceres residency alone does not special-case a marker-free non-Ceres job patrol', () => {
  const harness = bootNonCeresJobPatrol();
  harness.state.world.sectors[CERES_ACTIVITY_SECTOR_ID] = {
    id: CERES_ACTIVITY_SECTOR_ID,
    factionId: 'faction_scn',
    security: 0.3,
    tier: 2,
  };
  harness.state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;

  const incident = dispatch(harness);

  assert.equal(incident.responderIds.includes(harness.patrol.id), true);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.law._jobResponseClaims.size, 0,
    'current-sector residency alone cannot opt a foreign durable patrol into Ceres leasing');
});

test('a non-Ceres patrol carrying a stale Ceres world-record marker still fails closed', () => {
  const harness = bootNonCeresJobPatrol();
  harness.patrol.data.worldRecordId = WORLD_RECORD_ID;
  delete harness.patrol.data.jobId;
  delete harness.patrol.data.activityActorSlotId;
  const before = responseShape(harness.patrol);
  harness.bus.emit('combat:damage', {
    attackerId: harness.attacker.id,
    targetId: harness.player.id,
    applied: 12,
    amount: 12,
    kind: 'kinetic',
  });
  const incident = Object.values(harness.state.lawSecurity.incidents)[0];
  assert.ok(incident);
  harness.state.simTime = incident.dispatchAt;
  harness.state.tick = 1;
  harness.law.update(SIM_DT, harness.state);

  assert.equal(incident.responderIds.includes(harness.patrol.id), false);
  assert.equal(harness.runtime.controlClaim(harness.jobId), null);
  assert.equal(harness.law._jobResponseClaims.size, 0);
  assert.deepEqual(responseShape(harness.patrol), before,
    'a stale Ceres identity marker cannot enter either ordinary or leased dispatch');
});

test('ordinary no-job responder behavior and seeded dispatch identity remain unchanged', () => {
  const ordinaryHarness = boot({ withOrdinaryResponder: true });
  dispatch(ordinaryHarness);
  ordinaryHarness.ordinary.data.intent.fire = true;
  ordinaryHarness.ordinary.data.intent.fireGroup = 'primary';
  assert.equal(clearIneligibleAIFiringIntents(ordinaryHarness.state, ordinaryHarness.sim.helpers), 0,
    'an ordinary team-1 patrol keeps the existing firing sweep behavior');

  const civilian = ordinaryHarness.sim.spawn({
    type: 'ship',
    team: 2,
    pos: { ...ordinaryHarness.ordinary.pos },
    data: {
      ai: {
        lawful: true,
        passive: false,
        motive: 'jurisdiction_enforcement',
        engagementTrigger: 'security_response',
        zoneId: 'test',
        approachTelegraph: 'patrol_challenge',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.WEAPONS_FREE,
        activity: ordinaryHarness.ordinary.data.ai.activity,
        securityTargetId: ordinaryHarness.attacker.id,
      },
      combat: { targetId: ordinaryHarness.attacker.id },
      intent: { fire: true, fireGroup: 'primary' },
    },
  });
  assert.equal(clearIneligibleAIFiringIntents(ordinaryHarness.state, ordinaryHarness.sim.helpers), 1);
  assert.equal(civilian.data.intent.fire, false, 'team 2 without the exact job lease remains disarmed');

  function seededOutcome() {
    const harness = boot();
    const incident = dispatch(harness);
    const claim = harness.runtime.controlClaim(harness.jobId);
    return {
      incidentId: incident.id,
      responderIds: incident.responderIds.slice(),
      claimId: claim.claimId,
      holder: claim.holder,
      jobId: harness.jobId,
    };
  }
  assert.deepEqual(seededOutcome(), seededOutcome());
});
