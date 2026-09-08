// PQ-WANTED-steal-pod — player seizure of an NPC-owned jettisoned payload.
//
// Law reports through the existing reportIncident({ kind:'payload_theft' }) door. Heat is the only
// writer: an accepted law:reportIncidentReceipt prices +0.22. Own-jettison never enters intake.

import test from 'node:test';
import assert from 'node:assert/strict';

import { protectedStationAt } from '../src/ai/engagementAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import { heat, INCIDENT_HEAT } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';

const SEED = 19022;
const TETHYS = 'sector_tethys_junction';
const STATION_POS = Object.freeze({ x: 0, z: 0 });
const THEFT_POS = Object.freeze({ x: 240, z: 0 });
const CERES_FAR_POS = Object.freeze({ x: 4200, z: 80 });
const COMMODITY_ID = 'cmdty_ore_iron';
const THEFT_HEAT = INCIDENT_HEAT.byKind.payload_theft;

function boot({
  sectorId = TETHYS,
  stationPos = STATION_POS,
  stationId = 'station_tethys_customs',
  factionId = 'faction_scn',
  theftPos = THEFT_POS,
} = {}) {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.tick = 40;
  state.world.currentSectorId = sectorId;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[sectorId] = { id: sectorId, factionId, security: 0.9, tier: 0 };
  state.player.heat = 0;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: theftPos.x + 10, z: theftPos.z },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;

  const station = sim.spawn({
    type: 'station', team: 2, factionId, pos: { ...stationPos }, radius: 42,
    data: { stationId, dockRadius: 72, factionId },
  });
  const patrol = sim.spawn({
    type: 'ship', team: 2, factionId, pos: { x: theftPos.x + 40, z: theftPos.z + 20 },
    radius: 9, hull: 100, hullMax: 100,
    data: { worldRecordId: 'wr_witness_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
  });

  const reports = [];
  const heatChanges = [];
  bus.on('law:reportIncidentReceipt', (p) => reports.push(p));
  bus.on('heat:changed', (p) => heatChanges.push(p));

  return {
    sim, state, bus, player, station, patrol, reports, heatChanges,
    law: sim.registry.get('lawSecurity'),
    heat: sim.registry.get('heat'),
    helpers: { spawnEntity: (spec) => sim.spawn(spec) },
  };
}

function spawnHauler(sim, { pos = THEFT_POS, slotId = null } = {}) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { ...pos },
    radius: 16, hull: 120, hullMax: 120,
    data: {
      displayName: 'Mira Bluepack',
      trafficRole: 'hauler',
      activityActorSlotId: slotId,
      ai: { role: 'hauler', spawnContext: 'convoy_civilian' },
    },
  });
}

function spawnPod(h, { ownerId, pos = THEFT_POS } = {}) {
  const pod = spawnJettisonedCargoPod(h.state, {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 4,
    commodityId: COMMODITY_ID,
    amount: 4,
    unitMass: 0.5,
    ownerId,
    ownerName: 'Mira Bluepack',
    factionId: 'faction_free',
  }, h.helpers);
  assert.ok(pod, 'spawnJettisonedCargoPod must return a payload body');
  assert.equal(pod.type, 'payload');
  assert.equal(pod.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
  return pod;
}

function collectPod(h, pod, extras = {}) {
  h.bus.emit('pickup:collected', {
    pickupId: pod.id,
    collectorId: h.player.id,
    kind: 'cargo',
    commodityId: COMMODITY_ID,
    amount: 4,
    acceptedAmount: 4,
    pos: { x: pod.pos.x, z: pod.pos.z },
    ...extras,
  });
}

function latchPod(h, pod) {
  h.bus.emit('tether:latched', { targetId: pod.id, type: 'tether' });
}

test('NPC-owned jettisoned pod collect reports payload_theft and heat rises 0.22 via the law receipt', () => {
  const h = boot();
  const hauler = spawnHauler(h.sim);
  const pod = spawnPod(h, { ownerId: hauler.id });
  const heatBefore = h.state.player.heat;
  assert.equal(heatBefore, 0);

  collectPod(h, pod);

  const accepted = h.reports.filter((row) => row.accepted === true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].kind, 'payload_theft');
  assert.equal(accepted[0].source, 'lawSecurity');
  assert.equal(accepted[0].validatedWitnessedTheft, true);
  assert.equal(accepted[0].offenderEntityId, h.player.id);
  assert.equal(accepted[0].payloadStableId, `jettisoned-${pod.id}`);
  assert.equal(h.state.player.heat, THEFT_HEAT);
  assert.equal(h.state.player.heat - heatBefore, 0.22);
  assert.equal(h.heatChanges.length, 1);
  assert.match(h.heatChanges[0].reason, /law incident \(payload_theft\)/);
  assert.equal(h.heatChanges[0].previousValue, heatBefore);
  assert.equal(h.heatChanges[0].value, THEFT_HEAT);
});

test('own-jettison collect does not report and does not raise heat', () => {
  const h = boot();
  const pod = spawnPod(h, { ownerId: h.player.id });

  collectPod(h, pod);
  latchPod(h, pod);

  assert.equal(h.reports.length, 0, 'own-jettison never enters reportIncident');
  assert.equal(h.state.player.heat, 0);
  assert.equal(h.heatChanges.length, 0);
});

test('tether latch of an NPC pod is the same theft door, and a later collect does not double-apply', () => {
  const h = boot();
  const hauler = spawnHauler(h.sim);
  const pod = spawnPod(h, { ownerId: hauler.id });

  latchPod(h, pod);
  const afterLatch = h.state.player.heat;
  assert.equal(afterLatch, THEFT_HEAT);
  assert.equal(h.reports.filter((row) => row.accepted === true).length, 1);

  collectPod(h, pod);
  assert.equal(h.state.player.heat, afterLatch, 'heat listener consumes the receipt once');
  assert.equal(Object.keys(h.state.player.heatIncidentsApplied || {}).length, 1);
});

test('Ceres/Ambush theft outside the station ring uses ceresDistressJurisdiction, not a fake patrol', () => {
  const h = boot({
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    stationPos: STATION_POS,
    stationId: 'station_ceres',
    factionId: 'faction_dmc',
    theftPos: CERES_FAR_POS,
  });
  const hauler = spawnHauler(h.sim, {
    pos: CERES_FAR_POS,
    slotId: 'ceres_ambush_loaded_hauler',
  });
  const pod = spawnPod(h, { ownerId: hauler.id, pos: CERES_FAR_POS });
  const before = h.state.entityList.length;

  assert.equal(protectedStationAt(h.state, { pos: CERES_FAR_POS }), null,
    'Ambush is outside the Ceres station protection ring');

  collectPod(h, pod);

  const accepted = h.reports.filter((row) => row.accepted === true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].stationId, 'station_ceres');
  assert.equal(accepted[0].kind, 'payload_theft');
  assert.equal(accepted[0].validatedWitnessedTheft, true);
  assert.equal(h.state.player.heat, THEFT_HEAT);
  assert.equal(h.state.entityList.length, before, 'reportIncident must not spawn a patrol');
  assert.deepEqual(Object.keys(h.state.lawSecurity.incidents || {}), [],
    'intake must not open the dispatching incident map');
});

test('a freight-custody pickup is not claimed by the jettisoned-pod door', () => {
  const h = boot();
  const pickup = h.sim.spawn({
    type: 'pickup',
    pos: { ...THEFT_POS },
    radius: 3,
    data: {
      kind: 'cargo',
      commodityId: COMMODITY_ID,
      amount: 4,
      ownerId: 'civilian-carrier',
      freightCustodyPod: { custodyId: 'freight:test', legalOwnerKind: 'civilian' },
    },
  });
  collectPod(h, pickup);
  assert.equal(h.reports.length, 0);
  assert.equal(h.state.player.heat, 0);
});
