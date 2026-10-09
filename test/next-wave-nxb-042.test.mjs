// NXB-042 — a rescued worker is the same person at work and on the wire.
//
// The pb-cons-b pair already proved the return leg (one durable person record, one hull, the
// REAL job through the kernel). This file pins the identity leg the packet adds on top:
//   1. the victim's own public identity (name / callsign / named-contact stamp) rides the
//      person record and is re-stamped on the returned hull — the same person on later contact;
//   2. a later hail is answered in the person's own voice, referencing the actual rescue fact
//      and their current occupation — exactly once, then the ordinary traffic voice returns;
//   3. a dead returned worker cannot answer (the record closed 'lost'), and a foreign hull
//      stamped with a stale person key never earns the line;
//   4. NXI-165: a durable rebind heals the named-contact stamp from the captured ai record, so
//      the label follows the stable worker record and no second hull is picked for the identity.
//
// Fixed seed throughout; sim time only (the return jitter rides state.rng).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  rescuedWorkerMemoryFor,
} from '../src/data/contactHail.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';

const SEED = 42042;
const DT = 1 / 60;
const SECTOR = 'sector_a';
const ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 30, loadS: 1, unloadS: 1, dwellS: 1 };
const MIRA = NAMED_LANE_CONTACTS.find((c) => c.id === 'lane_mira_bluepack');

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [uniqueWrecks, npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = SECTOR;
  // A real player hull so hail range/identity checks read the live table, not a stub.
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, radius: 6 });
  sim.state.playerId = player.id;
  return sim;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }
function hull(sim, worldRecordId, pos = { x: 0, z: 0 }, extraData = {}) {
  const e = sim.spawn({ type: 'ship', team: 2, pos, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = SECTOR;
  Object.assign(e.data, extraData);
  return e;
}
function hullsByRecord(sim, recordId) {
  const out = [];
  for (const e of sim.state.entities.values()) {
    if (e && e.data && e.data.worldRecordId === recordId && e.alive !== false) out.push(e);
  }
  return out;
}
function killWorker(sim, worker) {
  sim.bus.emit('entity:killed', { id: worker.id });
  sim.bus.emit('survivorPod:ejected', {
    entityId: 999001, victimId: worker.id, sectorId: SECTOR,
    factionId: 'faction_free', expireAt: sim.state.simTime + 180,
    phase: 'adrift', source: 'causal_eject',
  });
}
function rescue(sim, worker, receiptId) {
  sim.bus.emit('survivorPod:resolved', {
    id: receiptId, outcome: 'rescued', victimId: worker.id,
    sectorId: SECTOR, t: sim.state.simTime,
  });
}
function hailOffer(sim, target) {
  sim.state.player.targetId = target.id;
  const availability = contactHailAvailability(sim.state);
  return { availability, offer: createContactHailOffer(sim.state, availability, 'req:test', sim.state.simTime + 8) };
}
function returnTheWorker(sim, worker, receiptId) {
  killWorker(sim, worker);
  rescue(sim, worker, receiptId);
  stepSeconds(sim, 90);
  sim.bus.emit('economy:tick');
  steps(sim, 5);
}

test('NXB-042: the rescued worker keeps her name, works her real job, and thanks the pilot once', () => {
  const sim = boot();
  const seen = { returned: [] };
  sim.bus.on('rescuedWorker:returned', (p) => seen.returned.push(p));

  // Mira Bluepack hauled before the accident — the person record must keep that identity.
  const worker = hull(sim, 'wr-mira-042', { x: 0, z: 0 }, {
    defId: 'ship_wasp',
    name: MIRA.name,
    callsign: MIRA.callsign,
    namedLaneContactId: MIRA.id,
    trafficRole: 'hauler',
    trafficLabel: MIRA.callsign,
    ai: { archetype: 'passive', passive: true, name: MIRA.name, namedLaneContactId: MIRA.id },
  });
  const jobId = sim.helpers.npcJobs.assign(worker, { kind: 'hauler', route: ROUTE, sectorId: SECTOR, ...SHORT });
  assert.ok(jobId, 'the victim holds a real job');
  stepSeconds(sim, 10);

  returnTheWorker(sim, worker, 'survivor:nxb42:1');
  assert.equal(seen.returned.length, 1, 'the return fired once');
  const back = hullsByRecord(sim, 'wr-mira-042');
  assert.equal(back.length, 1, 'exactly one hull carries the person');
  const person = back[0].data;
  assert.equal(person.name, MIRA.name, 'the returned hull is still Mira');
  assert.equal(person.callsign, MIRA.callsign, 'the same callsign answers scans');
  assert.equal(person.namedLaneContactId, MIRA.id, 'the contact stamp came back with her');
  assert.equal(person.ai && person.ai.namedLaneContactId, MIRA.id, 'the stamp rides the durable ai record');
  assert.match(person.scanLabel, /BLUEPACK-7/, 'the scan names the same person');
  const status = sim.registry.get('uniqueWrecks')._rescuedWorkers.status();
  assert.equal(status[0].outcome, 'returned');
  assert.deepEqual(status[0].persona, {
    name: MIRA.name, callsign: MIRA.callsign, namedLaneContactId: MIRA.id,
  }, 'the person record carries her identity');
  assert.equal(sim.helpers.npcJobs.get(person.jobId).job.kind, 'hauler', 'she is back hauling, not idling');

  // Later contact: the person answers the hail in her own voice, naming the rescue once.
  const { availability, offer } = hailOffer(sim, back[0]);
  assert.equal(availability.enabled, true, 'a live working hull is hailable');
  assert.match(availability.label, /BLUEPACK-7/, 'the hail names the same person');
  assert.equal(offer.lines[1], 'YOU PULLED MY POD OUT OF THE DARK. BACK ON THE LANE — WHAT DO YOU NEED?',
    'the voice references the actual rescue and her current occupation');

  // The offer the player receives latches the one-time receipt on the durable record.
  sim.bus.emit('contactHail:offer', {
    requestId: 'req:test', targetId: back[0].id, kind: 'trader', expiresAt: sim.state.simTime + 8,
    lines: offer.lines, actions: [],
  });
  const latched = sim.registry.get('uniqueWrecks')._rescuedWorkers.status()[0];
  assert.ok(latched.hailAcknowledgedAtS != null, 'the acknowledgment is on the durable record');
  const again = hailOffer(sim, back[0]).offer;
  assert.ok(!again.lines[1].includes('POD OUT OF THE DARK'),
    'the second hail is her ordinary working voice, not another thank-you');
  assert.equal(rescuedWorkerMemoryFor(sim.state, back[0]), null, 'the memory is consumed once');
  sim.dispose();
});

test('NXB-042: a dead or foreign stamp never earns the remembered voice', () => {
  const sim = boot();

  // A returned worker who then dies: the record closes lost — no voice from the grave.
  const worker = hull(sim, 'wr-gone-042', { x: 0, z: 0 }, { defId: 'ship_wasp' });
  sim.helpers.npcJobs.assign(worker, { kind: 'miner', route: ROUTE, sectorId: SECTOR, ...SHORT });
  stepSeconds(sim, 10);
  returnTheWorker(sim, worker, 'survivor:nxb42:2');
  const back = hullsByRecord(sim, 'wr-gone-042')[0];
  const personKey = back.data.rescuedWorkerPerson;
  sim.bus.emit('entity:killed', { id: back.id });
  sim.state.entities.delete(back.id);
  const status = sim.registry.get('uniqueWrecks')._rescuedWorkers.status();
  assert.equal(status[0].outcome, 'lost', 'the returned death closed the record');

  // Counterexample one: a different hull wearing the lost person's stamps is not the person.
  const imposter = hull(sim, 'wr-gone-042', { x: 50, z: 0 }, {
    defId: 'ship_wasp', rescuedWorkerPerson: personKey,
    trafficRole: 'hauler', ai: { passive: true },
  });
  assert.equal(rescuedWorkerMemoryFor(sim.state, imposter), null,
    'a lost person never answers, whatever hull wears the key');

  // Counterexample two: a foreign hull stamped with a person key that has no record.
  const stranger = hull(sim, 'wr-stranger-042', { x: 60, z: 0 }, {
    rescuedWorkerPerson: 'rescued-worker:no-such-record',
  });
  assert.equal(rescuedWorkerMemoryFor(sim.state, stranger), null, 'no record, no memory');

  // And a live imposter still hails with the ordinary traffic voice.
  const { offer } = hailOffer(sim, imposter);
  assert.ok(!offer.lines[1].includes('POD OUT OF THE DARK'),
    'the remembered voice is reserved for the verified live person');
  sim.dispose();
});

test('NXI-165: a durable rebind heals the named-contact stamp on the same hull', () => {
  // The rematerialized hull arrives with record.ai (which carries the contact id) but without
  // the live data.* stamps — the world rebind only restores record fields. Traffic adoption
  // must heal the stamp so the same worker keeps her identity instead of a re-pick.
  const state = {
    mode: 'flight',
    simTime: 5,
    tick: 30,
    meta: { seed: SEED },
    rng() { return 0.5; },
    world: { currentSectorId: 'sector_helios_prime', records: { byId: {} } },
    entities: new Map(),
    entityList: [],
    entityIndex: null,
    traffic: { freighters: [] },
  };
  const station = {
    id: 9, type: 'station', alive: true, pos: { x: 0, z: 0 }, radius: 60,
    data: { stationId: 'station_helios', sectorId: 'sector_helios_prime' },
  };
  const rebound = {
    id: 42, type: 'ship', alive: true, team: 2,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, homeSectorId: 'sector_helios_prime',
    data: {
      trafficRole: 'hauler', worldRecordId: 'wr-mira-rebind', durable: true,
      homeSectorId: 'sector_helios_prime', sectorId: 'sector_helios_prime',
      ai: { archetype: 'passive', passive: true, name: MIRA.name, namedLaneContactId: MIRA.id },
      cargoManifest: { lines: [{ commodityId: 'cmdty_ore', qty: 4 }], totalQty: 4 },
    },
  };
  const stale = {
    id: 43, type: 'ship', alive: true, team: 2,
    pos: { x: -100, z: 0 }, vel: { x: 0, z: 0 }, homeSectorId: 'sector_helios_prime',
    data: {
      trafficRole: 'hauler', worldRecordId: 'wr-stale-rebind', durable: true,
      homeSectorId: 'sector_helios_prime', sectorId: 'sector_helios_prime',
      ai: { archetype: 'passive', passive: true, namedLaneContactId: 'lane_no_such_contact' },
      cargoManifest: { lines: [{ commodityId: 'cmdty_ore', qty: 2 }], totalQty: 2 },
    },
  };
  for (const e of [station, rebound, stale]) { state.entities.set(e.id, e); state.entityList.push(e); }

  const bus = createBus();
  const system = Object.create(trafficBase);
  system.init({ state, bus, helpers: { npcJobs: { assign() { return null; }, get() { return null; }, release() { return false; }, list() { return []; } } }, registry: { get() { return null; } } });
  system._rng = () => 0.25;

  system._adoptRematerializedTraffic('sector_helios_prime', [station]);

  assert.equal(rebound.data.namedLaneContactId, MIRA.id, 'the live stamp is healed on the same hull');
  assert.equal(rebound.data.name, MIRA.name, 'her name is back');
  assert.equal(rebound.data.callsign, MIRA.callsign, 'her callsign is back');
  assert.equal(rebound.data.trafficLabel, MIRA.callsign, 'the lane label never reverts to a role name');
  assert.equal(state.traffic.freighters.filter((r) => r.id === rebound.id).length, 1,
    'the rebound hull is adopted as one freighter');

  // Counterexample: a stale contact id in a rebound record earns no stamp at all.
  assert.equal(stale.data.namedLaneContactId, undefined, 'a dead contact id stays dead');
  assert.equal(stale.data.ai.namedLaneContactId, undefined, 'the stale record field is dropped');
  assert.notEqual(stale.data.trafficLabel, MIRA.callsign, 'no name is fabricated');

  // A second adopt pass is idempotent — the healed stamp is not re-applied or duplicated.
  system._adoptRematerializedTraffic('sector_helios_prime', [station]);
  assert.equal(rebound.data.namedLaneContactId, MIRA.id);
  assert.equal(state.traffic.freighters.filter((r) => r.id === rebound.id).length, 1);
});
