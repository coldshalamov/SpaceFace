// Row 462 / RC-CHASE — the physical chase. A kill seen ONLY by protected civilians is
// testimony in transit, not a conviction: it files when a surviving carrier crosses a lawful
// berth's 60-WU docking chord, and it dies with the carrier. A bounty-tier search posts two
// visible lawful sweep ships; once both have seen the suspect, breaking their observation is
// the escape. Every bounty warrant names a lawful station sponsor; paying it settles the hunt.
//
// These tests exercise the real lawSecurity + heat owners on a hand-rolled state — the same
// bus contract the live registry hands them — so every receipt below is the production shape.
import assert from 'node:assert/strict';
import test from 'node:test';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat, WANTED_TIER, wantedTierFor, heatLevelFor } from '../src/systems/heat.js';

function makeBus() {
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    events(name) { return emitted.filter((e) => e.name === name).map((e) => e.payload); },
  };
}

let nextId = 1000;
function makeWorld() {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const add = (e) => { entities.set(e.id, e); entityList.push(e); return e; };
  const state = {
    entities,
    entityList,
    playerId: 1,
    player: { heat: 0, credits: 20000 },
    tick: 0,
    simTime: 0,
    mode: 'flight',
    ui: {},
    world: { currentSectorId: 'sector_test', sectors: { sector_test: { security: 0.8 } } },
    meta: { seed: 7 },
  };
  const player = add({ id: 1, type: 'ship', pos: { x: 0, z: 0 }, team: 0, data: {} });
  // A lawful berth 900 WU out — outside the 450-WU kill-witness radius, inside the world.
  const station = add({
    id: 20, type: 'station', factionId: 'faction_scn', team: 1,
    pos: { x: 1000, z: 0 }, data: { stationId: 'station_test_law', name: 'Test Law Yard' },
  });
  const spawnEntity = (hull) => {
    const e = { id: ++nextId, alive: true, ...hull, pos: { ...hull.pos }, data: hull.data || {} };
    entities.set(e.id, e);
    entityList.push(e);
    return e;
  };
  const ctx = { state, bus, helpers: { spawnEntity }, registry: null };
  lawSecurity.init(ctx);
  heat.init(ctx);
  return { state, bus, add, player, station, entities };
}

const civilian = (id, pos, recordId) => ({
  id, type: 'ship', team: 2, alive: true, pos: { ...pos },
  data: { trafficRole: 'hauler', worldRecordId: recordId, ai: { passive: true } },
});

const deadVictim = (id, pos, recordId) => ({
  id, type: 'ship', team: 2, alive: false, factionId: 'faction_free',
  pos: { ...pos }, data: { worldRecordId: recordId },
});

function kill(h, victimId, pos) {
  h.bus.emit('entity:killed', {
    id: victimId, killerId: h.state.playerId, type: 'ship',
    pos: { ...pos }, victimClass: 'hauler', targetHostileToPlayer: false,
  });
}

test('a kill seen only by civilians queues testimony and posts no heat yet', () => {
  const h = makeWorld();
  h.add(civilian(10, { x: 100, z: 0 }, 'rec_carrier_a'));
  const victim = h.add(deadVictim(30, { x: 50, z: 0 }, 'rec_victim_a'));
  kill(h, victim.id, victim.pos);
  const truths = h.bus.events('law:killedAdjudicated');
  assert.equal(truths.length, 1);
  assert.equal(truths[0].outcome, 'pending_delivery');
  assert.ok(truths[0].reportId, 'a real reportId rides the pending truth');
  // No receipt is minted — the heat owner never hears of it until a courier docks.
  assert.equal(h.bus.events('law:reportIncidentReceipt').length, 0);
  const reports = h.state.lawSecurity.witnessReports;
  assert.ok(reports && reports[truths[0].reportId], 'the pending report is durable');
  assert.equal(reports[truths[0].reportId].carrierStableId, 'rec_carrier_a');
});

test('testimony files when the carrier crosses a lawful berth chord', () => {
  const h = makeWorld();
  const carrier = h.add(civilian(10, { x: 100, z: 0 }, 'rec_carrier_b'));
  const victim = h.add(deadVictim(30, { x: 50, z: 0 }, 'rec_victim_b'));
  kill(h, victim.id, victim.pos);
  const reportId = h.bus.events('law:killedAdjudicated')[0].reportId;
  // The courier physically reaches the berth (ordinary traffic's 60-WU docking chord).
  carrier.pos = { x: h.station.pos.x + 40, z: h.station.pos.z };
  lawSecurity._updateWitnessReports(h.state);
  const receipts = h.bus.events('law:reportIncidentReceipt');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].reportId, reportId, 'same reportId the witnessed path would mint');
  assert.equal(receipts[0].validatedCrime, true);
  assert.equal(receipts[0].evidenceClass, 'courier');
  assert.equal(receipts[0].stationId, 'station_test_law');
  const charge = h.bus.events('law:killedAdjudicated').at(-1);
  assert.equal(charge.outcome, 'charged');
  assert.ok(h.state.lawSecurity.witnessReports[reportId] == null, 'report closed on filing');
});

test('a dead carrier takes the testimony with it — the kill never convicts', () => {
  const h = makeWorld();
  h.add(civilian(10, { x: 100, z: 0 }, 'rec_carrier_c'));
  const victim = h.add(deadVictim(30, { x: 50, z: 0 }, 'rec_victim_c'));
  kill(h, victim.id, victim.pos);
  const reportId = h.bus.events('law:killedAdjudicated')[0].reportId;
  h.bus.emit('entity:killed', { id: 10, killerId: 1, type: 'ship', pos: { x: 100, z: 0 } });
  assert.ok(h.state.lawSecurity.witnessReports[reportId] == null, 'report dropped on carrier death');
  const lost = h.bus.events('law:witnessReportLost');
  assert.equal(lost.length, 1);
  assert.equal(lost[0].reason, 'carrier_killed');
  lawSecurity._updateWitnessReports(h.state);
  assert.equal(h.bus.events('law:reportIncidentReceipt').length, 0, 'no conviction ever files');
});

test('pending testimony survives a save/load boundary and still files', () => {
  const h = makeWorld();
  const carrier = h.add(civilian(10, { x: 100, z: 0 }, 'rec_carrier_d'));
  const victim = h.add(deadVictim(30, { x: 50, z: 0 }, 'rec_victim_d'));
  kill(h, victim.id, victim.pos);
  const reportId = h.bus.events('law:killedAdjudicated')[0].reportId;
  const snapshot = JSON.parse(JSON.stringify(lawSecurity.serialize()));
  assert.ok(snapshot.witnessReports && snapshot.witnessReports[reportId], 'durable in the save slice');
  lawSecurity.deserialize(snapshot);
  assert.ok(h.state.lawSecurity.witnessReports[reportId], 'report reopened after restore');
  carrier.pos = { x: h.station.pos.x - 30, z: h.station.pos.z };
  lawSecurity._updateWitnessReports(h.state);
  assert.equal(h.bus.events('law:reportIncidentReceipt').length, 1, 'testimony still convicts');
});

test('a malformed saved report fails closed instead of smuggling a conviction', () => {
  const h = makeWorld();
  lawSecurity.deserialize({
    witnessReports: {
      'report:good': {
        reportId: 'report:good', kind: 'unlawful_kill', victimStableId: 'rec_v',
        carrierStableId: 'rec_c', causalTick: 5, queuedTick: 5,
      },
      'report:bad-key': { reportId: 'report:other', kind: 'unlawful_kill', victimStableId: 'v', carrierStableId: 'c', causalTick: 1 },
      'report:no-carrier': { reportId: 'report:no-carrier', kind: 'unlawful_kill', victimStableId: 'v', causalTick: 1 },
      'report:no-tick': { reportId: 'report:no-tick', kind: 'unlawful_kill', victimStableId: 'v', carrierStableId: 'c' },
    },
  });
  const reports = h.state.lawSecurity.witnessReports;
  assert.deepEqual(Object.keys(reports), ['report:good']);
});

test('the report queue is capped — a full ledger defers to the unreported case', () => {
  const h = makeWorld();
  h.add(civilian(10, { x: 100, z: 0 }, 'rec_carrier_e'));
  const spec = (i) => ({
    reportId: `report:${i}`, kind: 'unlawful_kill', victimStableId: `rec_victim_${i}`,
    victim: null, victimFactionId: 'faction_free', jurisdiction: null,
    civilians: [{ stableId: 'rec_carrier_e', entityId: 10, distanceSq: 1 }],
    witnessStableIds: ['rec_carrier_e'], causality: { cause: 'weapon' },
    pos: { x: 50, z: 0 }, causalTick: i,
  });
  for (let i = 0; i < 16; i++) assert.equal(lawSecurity._queueWitnessReport(h.state, spec(i)), 'queued');
  assert.equal(lawSecurity._queueWitnessReport(h.state, spec(16)), 'full');
  assert.equal(lawSecurity._queueWitnessReport(h.state, spec(0)), 'duplicate');
});

test('a bounty-tier search posts two visible lawful sweep ships', () => {
  const h = makeWorld();
  h.state.player.heat = 0.3; // level 2 → WANTED_TIER.BOUNTY
  h.state.player.heatZone = { active: true, center: { x: 0, z: 0 }, radius: 1700 };
  assert.equal(wantedTierFor(h.state.player.heat), WANTED_TIER.BOUNTY);
  lawSecurity._syncWantedSweep(h.state);
  lawSecurity._syncWantedSweep(h.state);
  const sweep = h.state.lawSecurity.wantedSweep;
  assert.ok(sweep, 'sweep record exists');
  assert.equal(sweep.ships.length, 2, 'two ships posted');
  for (const id of sweep.ships) {
    const ship = h.entities.get(id);
    assert.ok(ship && ship.alive !== false, 'a real live hull, not a marker');
    assert.equal(ship.data.ai.lawful, true, 'lawful — the sweep is the law searching');
    assert.equal(ship.data.missionTag, 'wanted_sweep');
  }
});

test('seen by both then gone: breaking sweep observation drops the bounty tier', () => {
  const h = makeWorld();
  h.state.player.heat = 0.3;
  h.state.player.heatZone = { active: true, center: { x: 0, z: 0 }, radius: 1700 };
  lawSecurity._syncWantedSweep(h.state);
  lawSecurity._syncWantedSweep(h.state);
  const sweep = h.state.lawSecurity.wantedSweep;
  assert.equal(sweep.ships.length, 2);
  // Both sweepers get real eyes on the suspect.
  for (const id of sweep.ships) h.entities.get(id).pos = { x: 300, z: 0 };
  lawSecurity._updateWantedSweep(1 / 60, h.state);
  assert.deepEqual(Object.keys(sweep.observed).map(Number).sort((a, b) => a - b), sweep.ships.slice().sort((a, b) => a - b));
  // Then the contact breaks — nobody has eyes for the full 2 s window.
  for (const id of sweep.ships) h.entities.get(id).pos = { x: 60000, z: 0 };
  for (let i = 0; i < 60; i++) lawSecurity._updateWantedSweep(1 / 30, h.state);
  const escaped = h.bus.events('law:wantedSweepEscaped');
  assert.equal(escaped.length, 1);
  assert.equal(escaped[0].method, 'sweep_break');
  assert.equal(h.state.lawSecurity.wantedSweep, null, 'sweep dissolved');
  assert.equal(heatLevelFor(h.state.player.heat), 1, 'bounty tier fell to scan');
  assert.equal(wantedTierFor(h.state.player.heat), WANTED_TIER.SCAN);
});

test('contact that never breaks cannot escape — the clock stays the only way out', () => {
  const h = makeWorld();
  h.state.player.heat = 0.3;
  h.state.player.heatZone = { active: true, center: { x: 0, z: 0 }, radius: 1700 };
  lawSecurity._syncWantedSweep(h.state);
  lawSecurity._syncWantedSweep(h.state);
  const sweep = h.state.lawSecurity.wantedSweep;
  for (const id of sweep.ships) h.entities.get(id).pos = { x: 300, z: 0 };
  for (let i = 0; i < 120; i++) lawSecurity._updateWantedSweep(1 / 30, h.state);
  assert.equal(h.bus.events('law:wantedSweepEscaped').length, 0, 'eyes held — no escape');
  assert.equal(wantedTierFor(h.state.player.heat), WANTED_TIER.BOUNTY);
});

test('a bounty warrant names a station sponsor; paying it settles the hunt', () => {
  const h = makeWorld();
  h.state.player.heat = 0.3;
  h.state.player.heatZone = { active: true, center: { x: 0, z: 0 }, radius: 1700 };
  lawSecurity._postWantedWarrant(h.state);
  const warrant = h.state.lawSecurity.wantedWarrant;
  assert.ok(warrant, 'warrant posted');
  assert.ok(warrant.sponsor, 'a named sponsor rides the warrant');
  assert.equal(warrant.sponsor.stationId, 'station_test_law');
  assert.ok(warrant.sponsor.feeCr > 0);
  // Docked at the sponsor, the player pays it off.
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = 'station_test_law';
  lawSecurity._payWantedSponsor(h.state, {});
  const settled = h.bus.events('law:sponsorSettled');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].method, 'sponsor_pay');
  const charged = h.bus.events('economy:chargeCredits');
  assert.equal(charged.length, 1);
  assert.equal(charged[0].amount, warrant.sponsor.feeCr);
  assert.equal(h.state.lawSecurity.wantedWarrant, null, 'warrant released — the hunter cast stops');
  assert.equal(wantedTierFor(h.state.player.heat), WANTED_TIER.SCAN, 'bounty tier settled');
});

test('sponsor pay refuses off-station or broke', () => {
  const h = makeWorld();
  h.state.player.heat = 0.3;
  h.state.player.heatZone = { active: true, center: { x: 0, z: 0 }, radius: 1700 };
  lawSecurity._postWantedWarrant(h.state);
  const warrant = h.state.lawSecurity.wantedWarrant;
  assert.ok(warrant.sponsor);
  lawSecurity._payWantedSponsor(h.state, {});
  let refused = h.bus.events('law:sponsorPayRefused').at(-1);
  assert.equal(refused.reason, 'not_docked_at_sponsor');
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = 'station_test_law';
  h.state.player.credits = 0;
  lawSecurity._payWantedSponsor(h.state, {});
  refused = h.bus.events('law:sponsorPayRefused').at(-1);
  assert.equal(refused.reason, 'short');
  assert.ok(h.state.lawSecurity.wantedWarrant, 'warrant still live');
});
