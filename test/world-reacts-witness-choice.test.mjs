import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 4242;
const OWN = Object.prototype.hasOwnProperty;
const AI_FIELDS_FOR_DESCRIPTOR = Object.freeze([
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
  'witnessRole',
  'witnessIncidentId',
]);

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
    ai: descriptorShape(entity.data.ai, AI_FIELDS_FOR_DESCRIPTOR),
    combat: descriptorShape(entity.data.combat, ['targetId', 'lockTarget']),
    intent: descriptorShape(entity.data.intent, ['fire', 'fireGroup']),
  };
}

function bootHarness({ responderPositions = [{ x: 160, z: 10 }, { x: 200, z: 0 }, { x: 300, z: 0 }] } = {}) {
  const sim = createSimulation({
    seed: SEED,
    systems: [lawSecurity],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const sectorId = 'sector_helios_prime';
  state.world.currentSectorId = sectorId;
  state.world.sectors[sectorId] = {
    id: sectorId,
    factionId: 'faction_scn',
    security: 0.8,
    tier: 1,
  };

  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    radius: 50,
    data: { stationId: 'station_helios', dockRadius: 80, factionId: 'faction_scn' },
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

  const victim = sim.spawn(makeShipEntitySpec('ship_mule', {
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 150, z: 0 },
  }));
  victim.data.trafficRole = 'hauler';

  const responders = responderPositions.map((pos) => sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z },
    hull: 150,
    hullMax: 150,
    radius: 7,
    data: {
      trafficRole: 'patrol',
      ai: { lawful: true, passive: true, roe: RulesOfEngagement.HOLD_FIRE },
      combat: {},
      intent: { fire: false },
    },
  }));

  const events = [];
  for (const name of ['law:incidentOpened', 'law:dispatchStarted', 'law:witnessChoice', 'law:incidentResolved']) {
    bus.on(name, (payload) => events.push({ name, t: state.simTime, payload }));
  }

  return {
    sim,
    state,
    bus,
    station,
    player,
    victim,
    responders,
    events,
    law: sim.registry.get('lawSecurity'),
  };
}

test('three-way split: 2+ responders and valid wreck anchor choose 1 nearest holder and 2 chasers', () => {
  const h = bootHarness({
    responderPositions: [
      { x: 160, z: 0 }, // dist to (150,0) is 10 (nearest)
      { x: 220, z: 0 }, // dist to (150,0) is 70
      { x: 300, z: 0 }, // dist to (150,0) is 150
    ],
  });

  // Aggression opens incident
  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  assert.ok(incident, 'incident must open');
  assert.equal(incident.status, 'distress');

  // Advance to dispatch
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);
  assert.equal(incident.status, 'responding');
  assert.equal(incident.responderIds.length, 3);

  // Before anchor is known, all responders chase
  for (const resp of h.responders) {
    assert.equal(resp.data.ai.witnessRole, 'chase');
    assert.equal(resp.data.ai.witnessIncidentId, incident.id);
  }
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 0);

  // Kill victim and spawn wreck
  h.victim.alive = false;
  h.victim.hull = 0;
  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_mule_1',
      aftermath: {
        victimId: h.victim.id,
        killerId: h.player.id,
        markerId: 'aft_mule_1',
        salvagePool: { cmdty_scrap_metal: 4 },
      },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_mule_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.ok(incident.victimAnchor, 'victimAnchor must be populated on incident');
  assert.equal(incident.victimAnchor.x, 150);
  assert.equal(incident.victimAnchor.z, 0);
  assert.equal(incident.victimAnchor.wreckEntityId, wreck.id);
  assert.equal(incident.victimAnchor.valuable, true);

  // Nearest responder is responders[0] at (160, 0)
  const holder = h.responders[0];
  const chaser1 = h.responders[1];
  const chaser2 = h.responders[2];

  assert.equal(holder.data.ai.witnessRole, 'hold');
  assert.equal(holder.data.ai.witnessIncidentId, incident.id);
  assert.equal(holder.data.ai.securityTargetId, null, 'holder must clear securityTargetId');
  assert.equal(holder.data.ai.roe, RulesOfEngagement.DEFENSIVE);
  assert.equal(holder.data.ai.activity.kind, ActivityKind.LOITER);
  assert.deepEqual(holder.data.ai.activity.anchor, { x: 150, z: 0 });
  assert.equal(holder.data.combat.targetId, null);
  assert.equal(holder.data.combat.lockTarget, null);
  assert.equal(holder.data.intent.fire, false);

  assert.equal(chaser1.data.ai.witnessRole, 'chase');
  assert.equal(chaser1.data.ai.witnessIncidentId, incident.id);
  assert.equal(chaser1.data.ai.securityTargetId, h.player.id);
  assert.equal(chaser1.data.ai.activity.kind, ActivityKind.ATTACK_RUN);

  assert.equal(chaser2.data.ai.witnessRole, 'chase');
  assert.equal(chaser2.data.ai.witnessIncidentId, incident.id);
  assert.equal(chaser2.data.ai.securityTargetId, h.player.id);
  assert.equal(chaser2.data.ai.activity.kind, ActivityKind.ATTACK_RUN);

  const choices = h.events.filter((e) => e.name === 'law:witnessChoice');
  assert.equal(choices.length, 1, 'exactly one witness choice event emitted');
  assert.equal(choices[0].payload.decision, 'split');
  assert.equal(choices[0].payload.holderId, holder.id);
  assert.deepEqual(choices[0].payload.chaserIds, [chaser1.id, chaser2.id]);
  assert.deepEqual(choices[0].payload.anchor, { x: 150, z: 0 });
});

test('lone-responder chase: fewer than two responders never split and keep chasing', () => {
  const h = bootHarness({
    responderPositions: [{ x: 180, z: 0 }],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  incident.reserveAllowed = false;
  incident.responderCap = 1;
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  assert.equal(incident.responderIds.length, 1);
  const loneResponder = h.responders[0];

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_lone_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_lone_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_lone_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.ok(incident.victimAnchor);
  assert.equal(loneResponder.data.ai.witnessRole, 'chase');
  assert.equal(loneResponder.data.ai.witnessIncidentId, incident.id);
  assert.equal(loneResponder.data.ai.securityTargetId, h.player.id);
  assert.equal(loneResponder.data.ai.activity.kind, ActivityKind.ATTACK_RUN);
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 0);
});

test('stable tie-breaking: equidistant responders break tie stably by entity id', () => {
  const h = bootHarness({
    responderPositions: [
      { x: 150, z: 50 },  // dist to (150, 0) = 50
      { x: 150, z: -50 }, // dist to (150, 0) = 50
    ],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  incident.reserveAllowed = false;
  incident.responderCap = 2;
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_tie_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_tie_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_tie_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  const sortedById = h.responders.slice().sort((a, b) => a.id - b.id);
  const expectedHolder = sortedById[0];
  const expectedChaser = sortedById[1];

  assert.equal(expectedHolder.data.ai.witnessRole, 'hold');
  assert.equal(expectedChaser.data.ai.witnessRole, 'chase');

  const choices = h.events.filter((e) => e.name === 'law:witnessChoice');
  assert.equal(choices.length, 1);
  assert.equal(choices[0].payload.holderId, expectedHolder.id);
  assert.deepEqual(choices[0].payload.chaserIds, [expectedChaser.id]);
});

test('one event per incident group: no spam every cadence when decision is materially unchanged', () => {
  const h = bootHarness({
    responderPositions: [{ x: 160, z: 0 }, { x: 220, z: 0 }],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_nospam_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_nospam_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_nospam_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1);

  // Step law system over multiple updates
  for (let i = 0; i < 10; i++) {
    h.state.simTime += 0.25;
    h.state.tick += 15;
    h.law.update(SIM_DT, h.state);
  }

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1,
    'law:witnessChoice must not re-emit when split is unchanged');
});

test('survival-cohort rejection: aftermath from survival cohort entities never opens anchor or splits', () => {
  const h = bootHarness({
    responderPositions: [{ x: 160, z: 0 }, { x: 220, z: 0 }],
  });

  h.victim.data.runCohort = 'survival';

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      runCohort: 'survival',
      markerId: 'aft_survival_1',
      aftermath: {
        victimId: h.victim.id,
        killerId: h.player.id,
        markerId: 'aft_survival_1',
        runCohort: 'survival',
      },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_survival_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.equal(incident.victimAnchor, null, 'survival cohort must be rejected');
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 0);
});

test('deferred top-up: one initial chaser splits into 1 holder and 2 chasers when top-up brings group to 3', () => {
  // Start with 1 responder available
  const h = bootHarness({
    responderPositions: [{ x: 250, z: 0 }],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  incident.reserveAllowed = false;
  incident.responderCap = 1;
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  assert.equal(incident.responderIds.length, 1);
  assert.equal(h.responders[0].data.ai.witnessRole, 'chase');

  // Wreck spawns
  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_topup_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_topup_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_topup_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  // Still 1 responder, so no split yet
  assert.equal(h.responders[0].data.ai.witnessRole, 'chase');
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 0);

  // Now 2 new responders arrive and join the incident (top-up)
  const newResp1 = h.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 155, z: 0 }, // Very close to wreck!
    hull: 150,
    hullMax: 150,
    radius: 7,
    data: {
      trafficRole: 'patrol',
      ai: { lawful: true, passive: true, roe: RulesOfEngagement.HOLD_FIRE },
      combat: {},
      intent: { fire: false },
    },
  });
  const newResp2 = h.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 350, z: 0 },
    hull: 150,
    hullMax: 150,
    radius: 7,
    data: {
      trafficRole: 'patrol',
      ai: { lawful: true, passive: true, roe: RulesOfEngagement.HOLD_FIRE },
      combat: {},
      intent: { fire: false },
    },
  });

  // Top up incident
  incident.responderCap = 3;
  h.law._dispatchIncident(incident, h.victim, h.player);
  assert.equal(incident.responderIds.length, 3);

  // newResp1 is closest to wreck (155 vs 150) -> becomes holder!
  assert.equal(newResp1.data.ai.witnessRole, 'hold');
  assert.equal(newResp1.data.ai.securityTargetId, null);
  assert.equal(newResp1.data.ai.activity.kind, ActivityKind.LOITER);

  // original responder and newResp2 are chasers
  assert.equal(h.responders[0].data.ai.witnessRole, 'chase');
  assert.equal(newResp2.data.ai.witnessRole, 'chase');

  const choices = h.events.filter((e) => e.name === 'law:witnessChoice');
  assert.equal(choices.length, 1);
  assert.equal(choices[0].payload.decision, 'split');
  assert.equal(choices[0].payload.holderId, newResp1.id);
});

test('ordinary-holder cleanup: holder with no target clears witness state and returns toward station', () => {
  const h = bootHarness({
    responderPositions: [{ x: 160, z: 0 }, { x: 220, z: 0 }],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_clean_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_clean_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_clean_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  const holder = h.responders[0];
  assert.equal(holder.data.ai.witnessRole, 'hold');
  assert.equal(holder.data.ai.securityTargetId, null);

  // Threat clear: attacker destroyed
  h.player.alive = false;
  h.state.simTime += 0.25;
  h.state.tick += 15;
  h.law.update(SIM_DT, h.state);

  assert.equal(Object.keys(h.state.lawSecurity.incidents).length, 0, 'incident must resolve');
  assert.equal(holder.data.ai.witnessRole, null, 'holder witnessRole must be cleared');
  assert.equal(holder.data.ai.witnessIncidentId, null, 'holder witnessIncidentId must be cleared');
  assert.equal(holder.data.ai.securityTargetId, null);
  assert.equal(holder.data.ai.roe, RulesOfEngagement.LAWFUL_WANTED_ONLY);
  assert.equal(holder.data.ai.activity.kind, ActivityKind.RETURN_TO_ANCHOR);
  assert.deepEqual(holder.data.ai.activity.anchor, { x: h.station.pos.x, z: h.station.pos.z },
    'ordinary holder must return toward station');
});

test('exact Ceres job-lease restoration: Ceres job hull as holder restores exact pre-claim shape on resolve', () => {
  const TEST_SEED = 47;
  const slotId = 'ceres_cathedral_patrol';
  const pocket = CERES_ACTIVITY_POCKETS.find((p) => p.actorSlots.some((s) => s.id === slotId));
  const slot = pocket.actorSlots.find((s) => s.id === slotId);
  const slotPos = sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
    z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
  }, CERES_ACTIVITY_SECTOR_ID);

  function routeFor(p, s) {
    return s.route.marks.map((mark) => ({
      id: mark.id,
      label: mark.id,
      pos: sectorLocalToGlobalForSector({
        x: p.activityAnchor.localPos.x + mark.offset.x,
        z: p.activityAnchor.localPos.z + mark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID),
      targetRef: mark.targetRef,
    }));
  }

  const worldRecordId = stableRecordId(
    TEST_SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );

  const sim = createSimulation({
    seed: TEST_SEED,
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

  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x, z: slotPos.z },
    radius: 42,
    data: { stationId: 'station_ceres_test', dockRadius: 72, factionId: 'faction_scn' },
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

  // Ceres job-owned patrol
  const jobPatrol = sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x + 60, z: slotPos.z }, // Closest to victim
    hull: 140,
    hullMax: 140,
    radius: 7,
    data: {
      worldRecordId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      activityActorSlotId: slotId,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: 'patrol',
      ai: {
        lawful: true,
        passive: true,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.HOLD_FIRE,
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

  const jobsApi = sim.registry.get('npcJobsRuntime');
  const jobId = jobsApi.assign(jobPatrol, {
    kind: NPC_JOB_KIND.PATROL,
    route: routeFor(pocket, slot),
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

  // Second responder: ordinary responder so total >= 2
  const ordinaryPatrol = sim.spawn({
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
        roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
      },
      combat: {},
      intent: { fire: false },
    },
  });

  const law = sim.registry.get('lawSecurity');
  const before = responseShape(jobPatrol);

  // Attack player
  bus.emit('combat:damage', {
    attackerId: attacker.id,
    targetId: player.id,
    applied: 12,
    amount: 12,
    kind: 'kinetic',
  });

  const incident = Object.values(state.lawSecurity.incidents)[0];
  assert.ok(incident);
  incident.responderCap = 2;
  state.simTime = incident.dispatchAt;
  law.update(SIM_DT, state);

  assert.equal(incident.responderIds.length, 2);
  assert.ok(jobsApi.controlClaim(jobId), 'job patrol must be leased');

  // Kill player to spawn wreck
  player.alive = false;
  const wreck = sim.spawn({
    type: 'wreck',
    pos: { x: slotPos.x + 20, z: slotPos.z },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_ceres_1',
      aftermath: {
        victimId: player.id,
        killerId: attacker.id,
        markerId: 'aft_ceres_1',
        salvagePool: { cmdty_scrap_metal: 4 },
      },
    },
  });

  bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_ceres_1',
    entityId: wreck.id,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
  });

  // jobPatrol at x+60 is closer to wreck (x+20) than ordinaryPatrol at x+180
  // jobPatrol becomes HOLDER!
  assert.equal(jobPatrol.data.ai.witnessRole, 'hold');
  assert.equal(jobPatrol.data.ai.witnessIncidentId, incident.id);
  assert.equal(jobPatrol.data.ai.securityTargetId, null);
  assert.equal(ordinaryPatrol.data.ai.witnessRole, 'chase');

  // Threat clear: attacker dies
  attacker.alive = false;
  state.simTime += 0.25;
  state.tick += 15;
  law.update(SIM_DT, state);

  assert.equal(Object.keys(state.lawSecurity.incidents).length, 0);
  assert.equal(jobsApi.controlClaim(jobId), null, 'lease must be released');
  assert.deepEqual(responseShape(jobPatrol), before,
    'exact pre-claim shape including new AI fields must be restored');
});

test('distance ordering regression: moving responders across distance ordering retains holder, original startedTick, and single event', () => {
  const h = bootHarness({
    responderPositions: [
      { x: 160, z: 0 }, // dist to (150, 0) is 10 (nearest -> holder)
      { x: 200, z: 0 }, // dist to (150, 0) is 50
      { x: 300, z: 0 }, // dist to (150, 0) is 150
    ],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_reorder_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_reorder_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_reorder_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  const holder = h.responders[0];
  const chaser1 = h.responders[1];
  const chaser2 = h.responders[2];

  assert.equal(holder.data.ai.witnessRole, 'hold');
  assert.equal(chaser1.data.ai.witnessRole, 'chase');
  assert.equal(chaser2.data.ai.witnessRole, 'chase');

  const initialStartedTick = holder.data.ai.activity.startedTick;
  assert.equal(typeof initialStartedTick, 'number');
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1);

  // Advance many law cadences without moving responders
  for (let i = 0; i < 20; i++) {
    h.state.simTime += 0.25;
    h.state.tick += 15;
    h.law.update(SIM_DT, h.state);
  }

  assert.equal(holder.data.ai.witnessRole, 'hold');
  assert.equal(holder.data.ai.activity.startedTick, initialStartedTick,
    'holder activity startedTick must be preserved across cadences');
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1);

  // Now move chaser1 past the holder, much closer to the wreck (dist 2 vs dist 10)
  chaser1.pos.x = 152;
  chaser1.pos.z = 0;

  // Advance many more law cadences
  for (let i = 0; i < 20; i++) {
    h.state.simTime += 0.25;
    h.state.tick += 15;
    h.law.update(SIM_DT, h.state);
  }

  // Holder must NOT swap just because chaser moved past it
  assert.equal(holder.data.ai.witnessRole, 'hold', 'original holder must retain hold role');
  assert.equal(chaser1.data.ai.witnessRole, 'chase', 'chaser must retain chase role even when closer');
  assert.equal(chaser2.data.ai.witnessRole, 'chase');
  assert.equal(holder.data.ai.activity.startedTick, initialStartedTick,
    'holder original startedTick must remain stable');
  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1,
    'no additional witnessChoice event emitted when membership is unchanged');
});

test('repeated wreck and pod events: duplicate wreck and subsequent pod events do not re-emit choice and preserve holder startedTick', () => {
  const h = bootHarness({
    responderPositions: [
      { x: 160, z: 0 },
      { x: 220, z: 0 },
    ],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_dup_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_dup_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_dup_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1);
  const holder = h.responders[0];
  const initialStartedTick = holder.data.ai.activity.startedTick;
  assert.deepEqual(holder.data.ai.activity.anchor, { x: 150, z: 0 });

  // Duplicate aftermathWreck:spawned event
  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_dup_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  h.state.simTime += 0.25;
  h.state.tick += 15;
  h.law.update(SIM_DT, h.state);

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1,
    'duplicate wreck event must not re-emit witnessChoice');
  assert.equal(holder.data.ai.activity.startedTick, initialStartedTick);

  // Survivor pod ejected event for the same victim/incident at drifting position
  const pod = h.sim.spawn({
    type: 'survivorPod',
    pos: { x: 154, z: 3 },
    data: {},
  });

  h.bus.emit('survivorPod:ejected', {
    entity: pod,
    entityId: pod.id,
    victimId: h.victim.id,
    sectorId: 'sector_helios_prime',
  });

  h.state.simTime += 0.25;
  h.state.tick += 15;
  h.law.update(SIM_DT, h.state);

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1,
    'subsequent survivorPod event must not re-emit witnessChoice when membership is unchanged');
  assert.equal(holder.data.ai.activity.startedTick, initialStartedTick,
    'holder startedTick must be preserved through pod ejection');
  assert.deepEqual(holder.data.ai.activity.anchor, { x: 154, z: 3 },
    'holder activity anchor must follow moving anchor');
});

test('responder-removal and top-up regression: responder departure reselects with one event and preserves holder startedTick; top-up reselects nearest', () => {
  const h = bootHarness({
    responderPositions: [
      { x: 160, z: 0 }, // dist 10 -> holder
      { x: 220, z: 0 }, // dist 70 -> chaser1
      { x: 280, z: 0 }, // dist 130 -> chaser2
    ],
  });

  h.bus.emit('combat:damage', {
    attackerId: h.player.id,
    targetId: h.victim.id,
    applied: 20,
    amount: 20,
    pos: { x: h.victim.pos.x, z: h.victim.pos.z },
  });

  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  h.state.simTime = incident.dispatchAt;
  h.law.update(SIM_DT, h.state);

  const wreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_dep_1',
      aftermath: { victimId: h.victim.id, killerId: h.player.id, markerId: 'aft_dep_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_dep_1',
    entityId: wreck.id,
    sectorId: 'sector_helios_prime',
  });

  assert.equal(h.events.filter((e) => e.name === 'law:witnessChoice').length, 1);
  const holder = h.responders[0];
  const initialStartedTick = holder.data.ai.activity.startedTick;

  // Chaser 2 is destroyed / dies
  h.responders[2].alive = false;

  h.state.simTime += 0.25;
  h.state.tick += 15;
  h.law.update(SIM_DT, h.state);

  const choicesAfterRemoval = h.events.filter((e) => e.name === 'law:witnessChoice');
  assert.equal(choicesAfterRemoval.length, 2, 'departure of chaser changes material assignment and emits exactly one new choice event');
  assert.equal(choicesAfterRemoval[1].payload.holderId, holder.id);
  assert.deepEqual(choicesAfterRemoval[1].payload.chaserIds, [h.responders[1].id]);
  assert.equal(holder.data.ai.activity.startedTick, initialStartedTick,
    'holder retains original startedTick when material assignment changes but holder identity is unchanged');

  // Top-up arrives with a new patrol that is CLOSER to the wreck than the current holder
  const newPatrol = h.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 151, z: 0 }, // dist 1 to wreck vs holder's dist 10
    hull: 150,
    hullMax: 150,
    radius: 7,
    data: {
      trafficRole: 'patrol',
      ai: { lawful: true, passive: true, roe: RulesOfEngagement.HOLD_FIRE },
      combat: {},
      intent: { fire: false },
    },
  });

  incident.responderCap = 3;
  h.law._dispatchIncident(incident, h.victim, h.player);

  const choicesAfterTopUp = h.events.filter((e) => e.name === 'law:witnessChoice');
  assert.equal(choicesAfterTopUp.length, 3, 'top-up emits exactly one new choice event');
  assert.equal(choicesAfterTopUp[2].payload.holderId, newPatrol.id, 'closer new patrol becomes holder');
  assert.equal(newPatrol.data.ai.witnessRole, 'hold');
  assert.equal(holder.data.ai.witnessRole, 'chase', 'former holder transitions to chaser');
});

test('incident matching ambiguity regression: unanchored killer fallback fails closed on two open incidents; exact victimId attaches cleanly', () => {
  const h = bootHarness({
    responderPositions: [{ x: 160, z: 0 }, { x: 220, z: 0 }],
  });

  const victim2 = h.sim.spawn(makeShipEntitySpec('ship_mule', {
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 530, z: 0 },
  }));
  victim2.data.trafficRole = 'hauler';

  h.state.simTime = 10;

  const inc1 = {
    id: 'law:inc_open_1',
    stationId: 'station_helios_a',
    stationEntityId: h.station.id,
    factionId: 'faction_scn',
    radius: 1200,
    attackerId: h.player.id,
    victimId: h.victim.id,
    cause: 'player_assault',
    startedAt: 10,
    lastDamageAt: 10,
    responderIds: h.responders.map((r) => r.id),
    status: 'distress',
    victimAnchor: null,
  };
  const inc2 = {
    id: 'law:inc_open_2',
    stationId: 'station_helios_b',
    stationEntityId: h.station.id,
    factionId: 'faction_scn',
    radius: 1200,
    attackerId: h.player.id,
    victimId: victim2.id,
    cause: 'player_assault',
    startedAt: 10,
    lastDamageAt: 10,
    responderIds: h.responders.map((r) => r.id),
    status: 'distress',
    victimAnchor: null,
  };
  h.state.lawSecurity.incidents['station_helios_a:' + h.player.id] = inc1;
  h.state.lawSecurity.incidents['station_helios_b:' + h.player.id] = inc2;

  const incidents = Object.values(h.state.lawSecurity.incidents);
  assert.equal(incidents.length, 2, 'both incidents must be open');

  // Wreck spawns with killerId matching attacker, but NO victimId (ambiguous between inc1 and inc2)
  const ambigWreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 150, z: 40 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_ambig_1',
      aftermath: { killerId: h.player.id, markerId: 'aft_ambig_1' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_ambig_1',
    entityId: ambigWreck.id,
    sectorId: 'sector_helios_prime',
  });

  // Fails closed under ambiguity: neither incident is anchored
  assert.equal(inc1.victimAnchor, null, 'ambiguous fallback must not attach to inc1');
  assert.equal(inc2.victimAnchor, null, 'ambiguous fallback must not attach to inc2');

  // Wreck spawns with exact victimId for victim2
  const exactWreck = h.sim.spawn({
    type: 'wreck',
    pos: { x: 530, z: 0 },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_exact_2',
      aftermath: { victimId: victim2.id, killerId: h.player.id, markerId: 'aft_exact_2' },
    },
  });

  h.bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_exact_2',
    entityId: exactWreck.id,
    sectorId: 'sector_helios_prime',
  });

  // Exact victim match wins and attaches cleanly
  assert.equal(inc1.victimAnchor, null, 'inc1 remains unanchored');
  assert.ok(inc2.victimAnchor, 'inc2 attaches cleanly to exact victim match');
  assert.equal(inc2.victimAnchor.wreckEntityId, exactWreck.id);
});

test('failed lease release and successor change: failed release reports false, fallback cleanup never overwrites foreign successors, and exact shape restores on retry', () => {
  const TEST_SEED = 48;
  const slotId = 'ceres_cathedral_patrol';
  const pocket = CERES_ACTIVITY_POCKETS.find((p) => p.actorSlots.some((s) => s.id === slotId));
  const slot = pocket.actorSlots.find((s) => s.id === slotId);
  const slotPos = sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
    z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
  }, CERES_ACTIVITY_SECTOR_ID);

  function routeFor(p, s) {
    return s.route.marks.map((mark) => ({
      id: mark.id,
      label: mark.id,
      pos: sectorLocalToGlobalForSector({
        x: p.activityAnchor.localPos.x + mark.offset.x,
        z: p.activityAnchor.localPos.z + mark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID),
      targetRef: mark.targetRef,
    }));
  }

  const worldRecordId = stableRecordId(
    TEST_SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );

  const sim = createSimulation({
    seed: TEST_SEED,
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

  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x, z: slotPos.z },
    radius: 42,
    data: { stationId: 'station_ceres_test_failed', dockRadius: 72, factionId: 'faction_scn' },
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

  const jobPatrol = sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: slotPos.x + 60, z: slotPos.z },
    hull: 140,
    hullMax: 140,
    radius: 7,
    data: {
      worldRecordId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      activityActorSlotId: slotId,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: 'patrol',
      ai: {
        lawful: true,
        passive: true,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.HOLD_FIRE,
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

  const jobsApi = sim.registry.get('npcJobsRuntime');
  const jobId = jobsApi.assign(jobPatrol, {
    kind: NPC_JOB_KIND.PATROL,
    route: routeFor(pocket, slot),
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

  const ordinaryPatrol = sim.spawn({
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
        roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
      },
      combat: {},
      intent: { fire: false },
    },
  });

  const law = sim.registry.get('lawSecurity');
  const before = responseShape(jobPatrol);

  // Attack player
  bus.emit('combat:damage', {
    attackerId: attacker.id,
    targetId: player.id,
    applied: 12,
    amount: 12,
    kind: 'kinetic',
  });

  const incident = Object.values(state.lawSecurity.incidents)[0];
  assert.ok(incident);
  incident.responderCap = 2;
  state.simTime = incident.dispatchAt;
  law.update(SIM_DT, state);

  // Kill player to spawn wreck
  player.alive = false;
  const wreck = sim.spawn({
    type: 'wreck',
    pos: { x: slotPos.x + 20, z: slotPos.z },
    mass: 55,
    hull: 1,
    data: {
      markerId: 'aft_ceres_fail_1',
      aftermath: {
        victimId: player.id,
        killerId: attacker.id,
        markerId: 'aft_ceres_fail_1',
        salvagePool: { cmdty_scrap_metal: 4 },
      },
    },
  });

  bus.emit('aftermathWreck:spawned', {
    markerId: 'aft_ceres_fail_1',
    entityId: wreck.id,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
  });

  // jobPatrol becomes HOLDER
  assert.equal(jobPatrol.data.ai.witnessRole, 'hold');

  // Replace intent container with a foreign successor before release
  const foreignIntent = {
    moveX: -0.1,
    moveZ: 0.3,
    boost: true,
    brake: false,
    customForeignProperty: 'authoritative_foreign',
  };
  const foreignIntentSnapshot = { ...foreignIntent };
  jobPatrol.data.intent = foreignIntent;

  // Stub releaseControl to fail on first attempt
  const origReleaseControl = jobsApi.releaseControl;
  let releaseAttempts = 0;
  jobsApi.releaseControl = () => {
    releaseAttempts += 1;
    return { released: false, reason: 'temporary_residual_hold', restored: false };
  };

  // Threat cleared -> incident resolves
  attacker.alive = false;
  state.simTime += 0.25;
  state.tick += 15;
  law.update(SIM_DT, state);

  assert.equal(releaseAttempts, 2, 'both reconcile and clearResponder attempt release');
  assert.equal(law._jobResponseClaims.size, 1, 'record retained when release fails');
  assert.equal(jobPatrol.data.intent, foreignIntent, 'foreign successor identity remains authoritative');
  assert.deepEqual(jobPatrol.data.intent, foreignIntentSnapshot,
    'fallback cleanup must not overwrite foreign successor intent');

  // Allow release to succeed on retry
  jobsApi.releaseControl = origReleaseControl;
  law.update(SIM_DT, state);

  assert.equal(law._jobResponseClaims.size, 0, 'retry releases claim');
  assert.equal(jobsApi.controlClaim(jobId), null);
  assert.deepEqual(responseShape(jobPatrol).ai, before.ai,
    'exact AI pre-claim shape is restored on successful release');
  assert.deepEqual(responseShape(jobPatrol).combat, before.combat,
    'exact combat pre-claim shape is restored on successful release');
  assert.deepEqual(jobPatrol.data.intent, foreignIntentSnapshot,
    'foreign intent successor was never overwritten');
});
