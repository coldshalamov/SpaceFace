// NXB-041 — an absent witness cannot accuse, a relay stays a report, and a stale
// explanation stops driving new action without erasing the settled record.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { protectedStationAt } from '../src/ai/engagementAuthority.js';
import { KillCause } from '../src/combat/killCausality.js';
import { factions } from '../src/systems/factions.js';
import {
  heat,
  ACTIONABLE_EVIDENCE_S,
  THRESHOLD as WANTED_THRESHOLD,
} from '../src/systems/heat.js';
import {
  lawSecurity,
  LAW_INCIDENT_WITNESS_RADIUS,
} from '../src/systems/lawSecurity.js';
import { wantedReasonText } from '../src/ui/wantedReason.js';

const SEED = 41041;
const SECTOR = 'sector_tethys_junction';

function boot({ withStation = false } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, factions, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  sim.registry.get('factions').newGame();

  let station = null;
  if (withStation) {
    station = sim.spawn({
      type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
      data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
    });
  }

  const receipts = [];
  const truths = [];
  const repEvents = [];
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(p));
  bus.on('law:killedAdjudicated', (p) => truths.push(p));
  bus.on('faction:repChanged', (p) => repEvents.push(p));
  return {
    sim, state, bus, player, station, receipts, truths, repEvents,
    heat: sim.registry.get('heat'),
  };
}

function lawfulEye(run, pos) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
}

function shipAt(run, pos, extra = {}) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: extra.factionId || 'faction_free',
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: 'hauler', ai: { archetype: 'fleeing_trader', lawful: extra.lawful === true } },
  });
}

function killOf(run, victim, overrides = {}) {
  return {
    id: victim.id,
    killerId: run.state.playerId,
    type: 'ship',
    pos: { x: victim.pos.x, z: victim.pos.z },
    victimClass: 'hauler',
    factionId: victim.factionId,
    factionLawful: !!(victim.data && victim.data.ai && victim.data.ai.lawful),
    targetHostileToPlayer: false,
    ...overrides,
  };
}

function destroy(victim) {
  victim.alive = false;
  victim.hull = 0;
}

function playerBanned(state) {
  return new Set(['player', String(state.playerId), `entity:${state.playerId}`]);
}

function directReasons(events) {
  return events.filter((e) => e && (
    e.reason === 'kill_faction_ship' || e.reason === 'kill_faction_ship_collision'
  ));
}

function repSnapshot(state) {
  const out = {};
  const table = state.factions || {};
  for (const id of Object.keys(table).sort()) {
    const rec = table[id];
    if (rec && typeof rec.rep === 'number') out[id] = rec.rep;
  }
  return out;
}

function plantWreck(run, victim) {
  const markerId = `aft_nxb041_${victim.id}`;
  const tick = run.state.tick | 0;
  const sector = run.state.world.currentSectorId;
  if (!run.state.aftermathWrecks) run.state.aftermathWrecks = { bySector: {} };
  if (!Array.isArray(run.state.aftermathWrecks.bySector[sector])) {
    run.state.aftermathWrecks.bySector[sector] = [];
  }
  run.state.aftermathWrecks.bySector[sector].push({
    markerId,
    sectorId: sector,
    victimId: victim.id,
    victimClass: 'hauler',
    victimFactionId: victim.factionId,
    killerId: run.state.playerId,
    pos: { x: victim.pos.x, z: victim.pos.z },
    tick,
  });
  run.sim.spawn({
    type: 'wreck', team: 2, pos: { x: victim.pos.x, z: victim.pos.z }, radius: 10,
    data: { markerId, aftermath: { victimId: victim.id, markerId, tick } },
  });
  return markerId;
}

test('an eyeless lawful kill and an in-ring collision accuse nobody', () => {
  const far = boot({ withStation: false });
  const patrol = shipAt(far, { x: 4000, z: 4000 }, { factionId: 'faction_scn', lawful: true });
  destroy(patrol);
  const heatBefore = far.state.player.heat;
  far.bus.emit('entity:killed', killOf(far, patrol, { factionLawful: true }));

  assert.equal(far.receipts.length, 0, 'no crime receipt without an eye');
  assert.equal(far.state.player.heat, heatBefore, 'heat does not move for an unseen patrol');
  assert.equal(directReasons(far.repEvents).length, 0, 'standing does not move as a direct kill');
  const farTruth = far.truths.at(-1);
  assert.equal(farTruth.evidenceClass, 'unwitnessed');
  assert.equal(farTruth.witnessed, false);
  assert.equal(farTruth.kind, null);
  assert.deepEqual(farTruth.witnessStableIds, []);
  const pending = far.state.lawSecurity.unreportedKills;
  const pendingCase = pending && pending[`entity:${patrol.id}`];
  assert.ok(pendingCase, 'the unseen patrol death stays a case');
  assert.equal(pendingCase.kind, 'lawful_kill');
  assert.equal(patrol.alive, false);
  assert.equal(patrol.hull, 0);
  far.sim.dispose();

  const ring = boot({ withStation: true });
  const dist = LAW_INCIDENT_WITNESS_RADIUS + 50;
  const victim = shipAt(ring, { x: ring.station.pos.x + dist, z: ring.station.pos.z });
  destroy(victim);
  const reached = Math.hypot(victim.pos.x - ring.station.pos.x, victim.pos.z - ring.station.pos.z);
  const jurisdiction = protectedStationAt(ring.state, victim);
  assert.ok(jurisdiction, 'the body is inside a real protection ring');
  assert.ok(reached > LAW_INCIDENT_WITNESS_RADIUS, 'the body is outside witness range');
  assert.ok(reached < jurisdiction.radius, 'the body is still inside the ring');
  const heatAtRing = ring.state.player.heat;
  ring.bus.emit('entity:killed', killOf(ring, victim, {
    presentation: {
      cause: KillCause.SHIP_COLLISION,
      surface: 'craft',
      playerCaused: true,
    },
  }));
  assert.equal(ring.receipts.length, 0, 'the ring is not a witness');
  assert.equal(ring.state.player.heat, heatAtRing);
  assert.equal(directReasons(ring.repEvents).length, 0);
  const ringCase = ring.state.lawSecurity.unreportedKills[`entity:${victim.id}`];
  assert.ok(ringCase, 'the collision stays a pending case');
  assert.equal(ringCase.kind, 'reckless_kill');
  assert.equal(ringCase.killCause, KillCause.SHIP_COLLISION);
  assert.equal(victim.alive, false);
  assert.equal(victim.hull, 0);
  const banned = playerBanned(ring.state);
  const named = ring.truths.at(-1).witnessStableIds || [];
  assert.equal(named.some((id) => banned.has(id)), false);
  ring.sim.dispose();
});

test('a person inside witness range is a direct observation and is not the player', () => {
  const run = boot({ withStation: false });
  const victim = shipAt(run, { x: 80, z: 0 }, { factionId: 'faction_scn', lawful: true });
  const eye = lawfulEye(run, { x: 100, z: 0 });
  destroy(victim);
  const heatBefore = run.state.player.heat;
  run.bus.emit('entity:killed', killOf(run, victim, { factionLawful: true }));

  assert.equal(run.receipts.length, 1);
  const receipt = run.receipts[0];
  assert.equal(receipt.evidenceClass, 'direct');
  assert.equal(receipt.validatedCrime, true);
  assert.ok(receipt.witnessCount > 0);
  const banned = playerBanned(run.state);
  assert.equal(receipt.witnessStableIds.some((id) => banned.has(id)), false,
    'the missing-name case must not be filled with the player');
  assert.ok(receipt.witnessStableIds.includes(`entity:${eye.id}`));
  assert.ok(run.state.player.heat > heatBefore);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD);
  assert.ok(directReasons(run.repEvents).some((e) => e.factionId === victim.factionId
    && e.reason === 'kill_faction_ship'));
  run.sim.dispose();
});

test('a wreck report stays discovered through scan, salvage, and a relay that names the player', () => {
  const run = boot({ withStation: false });
  const victim = shipAt(run, { x: 5000, z: 0 }, { factionId: 'faction_scn', lawful: true });
  destroy(victim);
  run.bus.emit('entity:killed', killOf(run, victim, { factionLawful: true }));
  assert.equal(run.receipts.length, 0);
  assert.equal(directReasons(run.repEvents).length, 0);

  const markerId = plantWreck(run, victim);
  run.bus.emit('scan:wreckResolved', {
    wreckId: victim.id, markerId, pos: { x: victim.pos.x, z: victim.pos.z },
  });
  assert.equal(run.receipts.length, 1);
  const receipt = run.receipts[0];
  assert.equal(receipt.discovery, true);
  assert.equal(receipt.evidence, 'wreck_provenance');
  assert.equal(receipt.evidenceClass, 'discovered');
  assert.equal(receipt.witnessCount, 0);
  assert.deepEqual([...receipt.witnessStableIds], []);
  assert.equal(receipt.kind, 'lawful_kill');
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD, 'the wreck still convicts');
  assert.ok(run.repEvents.some((e) => e.reason === 'kill_discovered'));
  assert.equal(directReasons(run.repEvents).length, 0, 'the report is not a direct accusation');

  const stored = run.state.lawSecurity.reportedIncidents[receipt.reportId];
  const heatAfter = run.state.player.heat;
  const repAfter = run.state.factions[victim.factionId].rep;
  const repCount = run.repEvents.length;
  run.bus.emit('salvage:completed', { wreckId: null, markerId, pos: { x: victim.pos.x, z: victim.pos.z } });
  assert.equal(run.state.player.heat, heatAfter, 'salvage of the same wreck does not reheat');
  assert.equal(run.state.factions[victim.factionId].rep, repAfter);
  assert.equal(run.state.lawSecurity.reportedIncidents[receipt.reportId], stored);

  const relay = {
    ...stored,
    incidentReceiptId: `${stored.incidentReceiptId}:relay`,
    witnessed: true,
    witnessCount: 1,
    witnessStableIds: ['player'],
    evidenceClass: 'discovered',
  };
  run.bus.emit('law:reportIncidentReceipt', relay);
  assert.equal(run.state.lawSecurity.reportedIncidents[receipt.reportId], stored,
    'the relay does not replace the stored receipt');
  assert.equal(stored.evidenceClass, 'discovered');
  assert.equal(stored.discovery, true);
  assert.equal(stored.witnessCount, 0);
  assert.equal(stored.witnessStableIds.includes('player'), false);
  assert.equal(run.state.player.heat, heatAfter, 'a second receipt id for the same report adds no heat');
  assert.equal(run.state.factions[victim.factionId].rep, repAfter);
  assert.equal(run.repEvents.length, repCount, 'the relay does not move standing again');
  assert.equal(directReasons(run.repEvents).length, 0);
  assert.equal(run.state.player.heatLastIncident.evidenceClass, 'discovered');
  assert.equal(run.state.player.heatLastIncident.witnessCount, 0);

  // A later receipt for the same report drops the discovered label and claims the player saw it.
  const stripped = {
    ...stored,
    incidentReceiptId: `${stored.incidentReceiptId}:stripped`,
    witnessed: true,
    witnessCount: 1,
    witnessStableIds: ['player'],
    evidenceClass: 'direct',
    discovery: false,
    evidence: null,
  };
  const priced = run.heat.applyIncidentReceipt(stripped);
  assert.equal(priced.applied, false);
  assert.equal(priced.reason, 'already_applied');
  assert.equal(run.state.player.heat, heatAfter, 'dropping the discovered label adds no heat');
  assert.equal(run.state.player.heatLastIncident.evidenceClass, 'discovered');
  assert.equal(run.state.player.heatLastIncident.witnessCount, 0);
  assert.equal(run.state.player.heatLastIncident.incidentReceiptId, stored.incidentReceiptId);
  assert.equal(run.state.lawSecurity.reportedIncidents[receipt.reportId], stored);
  assert.equal(stored.witnessStableIds.includes('player'), false);
  assert.equal(run.state.factions[victim.factionId].rep, repAfter);
  assert.equal(run.state.player.heatReportsApplied[stored.reportId], true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(run.state.player.heatIncidentsApplied, `report:${stored.reportId}`),
    false,
    'report identity stays off the incident-id ledger',
  );
  run.sim.dispose();
});

test('a later lawful clear does not rewrite the stored witness list', () => {
  const run = boot({ withStation: false });
  const victim = shipAt(run, { x: 80, z: 0 });
  lawfulEye(run, { x: 110, z: 0 });
  destroy(victim);
  run.bus.emit('entity:killed', killOf(run, victim));
  const stored = run.state.lawSecurity.reportedIncidents[run.receipts[0].reportId];
  const names = stored.witnessStableIds.slice();
  assert.equal(stored.evidenceClass, 'direct');
  assert.ok(names.length > 0);
  const heatAfter = run.state.player.heat;
  const reps = repSnapshot(run.state);

  run.bus.emit('entity:killed', killOf(run, victim));
  assert.deepEqual(repSnapshot(run.state), reps,
    'a second report of the same body does not move standing');
  assert.equal(run.state.player.heat, heatAfter);

  run.bus.emit('entity:killed', killOf(run, victim, { targetHostileToPlayer: true }));
  assert.equal(run.state.lawSecurity.reportedIncidents[stored.reportId], stored);
  assert.deepEqual(stored.witnessStableIds.slice(), names);
  assert.equal(stored.evidenceClass, 'direct');
  const cleared = run.truths.at(-1);
  assert.equal(cleared.kind, null, 'the later clear publishes no charge');
  assert.equal(run.state.player.heat, heatAfter);
  assert.deepEqual(repSnapshot(run.state), reps,
    'a later clear does not pay the enemy bonus again');
  run.sim.dispose();
});

test('the actionable heat index expires without erasing heat or the settled receipt', () => {
  const run = boot({ withStation: false });
  const victim = shipAt(run, { x: 80, z: 0 });
  lawfulEye(run, { x: 110, z: 0 });
  destroy(victim);
  run.bus.emit('entity:killed', killOf(run, victim));
  const stored = run.state.lawSecurity.reportedIncidents[run.receipts[0].reportId];
  const incident = run.state.player.heatLastIncident;
  assert.ok(incident && incident.at === run.state.simTime);
  const heatAfter = run.state.player.heat;
  assert.ok(heatAfter >= WANTED_THRESHOLD);
  assert.equal(wantedReasonText({ incident: null }, run.state.player), '',
    'an explicit null incident is final while the player record still exists');
  assert.notEqual(wantedReasonText(null, run.state.player), '',
    'the owned record still explains until the clock passes');

  run.state.simTime = incident.at + ACTIONABLE_EVIDENCE_S;
  run.heat.update(0, run.state);
  assert.equal(run.state.player.heatLastIncident, incident, 'the exact window still explains');
  assert.equal(run.state.player.heat, heatAfter);
  assert.notEqual(wantedReasonText(null, run.state.player), '');

  run.state.simTime = incident.at + ACTIONABLE_EVIDENCE_S + SIM_DT;
  const packets = [];
  run.bus.on('heat:changed', (p) => packets.push(p));
  run.heat.update(SIM_DT, run.state);
  const expired = packets.find((p) => p && p.reason === 'evidence expired');
  assert.ok(expired, 'passing the window publishes the quiet explanation');
  assert.equal(expired.incident, null);
  assert.equal(expired.value, heatAfter, 'the quiet packet does not change heat');
  assert.equal(wantedReasonText(expired, run.state.player), '');
  assert.equal(run.state.player.heatLastIncident, null);
  assert.equal(run.state.player.heat, heatAfter, 'heat itself stays');
  assert.equal(run.state.lawSecurity.reportedIncidents[stored.reportId], stored);
  assert.equal(stored.evidenceClass, 'direct');
  const rep = run.state.factions[victim.factionId].rep;
  const reps = repSnapshot(run.state);
  run.heat.update(SIM_DT, run.state);
  assert.equal(run.state.factions[victim.factionId].rep, rep, 'reputation is not wiped on the timer');
  assert.deepEqual(repSnapshot(run.state), reps);
  assert.equal(run.state.player.heatLastIncident, null);
  run.sim.dispose();
});
