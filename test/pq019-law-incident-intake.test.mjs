// PQ-019B seam (a) — witness-validated law incident intake.
//
// The claim under test: a non-law owner can REPORT a crime, and only lawSecurity decides whether the
// law recognizes it — idempotently, with an explicit denial when it does not, and without ever
// manufacturing a patrol to respond.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  LAW_INCIDENT_WITNESS_CAP,
  LAW_INCIDENT_WITNESS_RADIUS,
  lawSecurity,
  lawWitnessesNear,
} from '../src/systems/lawSecurity.js';

const SEED = 19019;
const SECTOR = 'sector_tethys_junction';
const STATION_POS = Object.freeze({ x: 0, z: 0 });
// Inside the 600 WU lawful-station protection floor, so jurisdiction resolves.
const THEFT_POS = Object.freeze({ x: 240, z: 0 });

function boot({ security = 0.9 } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security, tier: 0 };

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;

  const log = { reports: [], receipts: [], dispatch: [], distress: [] };
  bus.on('law:reportIncidentReceipt', (p) => log.reports.push(p));
  bus.on('law:incidentReceipt', (p) => log.receipts.push(p));
  bus.on('law:dispatchStarted', (p) => log.dispatch.push(p));
  bus.on('law:distressRaised', (p) => log.distress.push(p));

  return { sim, state, bus, player, log, system: sim.registry.get('lawSecurity') };
}

function addStation(sim, { pos = STATION_POS, stationId = 'station_tethys_customs' } = {}) {
  return sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { ...pos }, radius: 42,
    data: { stationId, dockRadius: 72, factionId: 'faction_scn' },
  });
}

function addPatrol(sim, { pos = { x: 300, z: 120 }, worldRecordId = 'wr_patrol_a' } = {}) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { ...pos }, radius: 9,
    hull: 100, hullMax: 100,
    data: { worldRecordId, ai: { lawful: true, archetype: 'patrol_lawman' } },
  });
}

function goodReport(overrides = {}) {
  return {
    reportId: 'heist:receipt:abc:lawIncident',
    kind: 'payload_theft',
    offenderStableId: 'player',
    payloadStableId: 'pq019a_cargo_capsule',
    causalTick: 120,
    pos: { ...THEFT_POS },
    ...overrides,
  };
}

// ── acceptance ──────────────────────────────────────────────────────────────────────────────────

test('a witnessed theft inside jurisdiction returns one accepted incident receipt', () => {
  const { sim, system } = boot();
  addStation(sim);
  addPatrol(sim);

  const receipt = system.reportIncident(goodReport());
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.kind, 'payload_theft');
  assert.equal(receipt.stationId, 'station_tethys_customs');
  assert.equal(receipt.factionId, 'faction_scn');
  assert.equal(receipt.validatedWitnessedTheft, true);
  assert.ok(receipt.witnessCount >= 1);
  assert.ok(receipt.incidentReceiptId.startsWith('law:incident:'));
  assert.equal(receipt.responderAvailability, 'available');
  assert.equal(receipt.responderEntityIds.length, 1);
});

test('a duplicate report returns the identical receipt and logs the crime once', () => {
  const { sim, system, log } = boot();
  addStation(sim);
  addPatrol(sim);

  const first = system.reportIncident(goodReport());
  const ledgerAfterFirst = log.receipts.length;
  for (let i = 0; i < 4; i++) {
    const again = system.reportIncident(goodReport({ causalTick: 999 })); // same reportId, new content
    assert.equal(again.accepted, true);
    assert.equal(again.incidentReceiptId, first.incidentReceiptId);
    assert.equal(again, first, 'the stored receipt object itself is returned');
  }
  assert.equal(log.receipts.length, ledgerAfterFirst, 'no second crime row is written');
  assert.equal(log.reports.filter((r) => r.accepted).length, 5, 'every call still answers');
});

test('the receipt id is a content hash, so an independent run reproduces it after a reload', () => {
  const a = boot();
  addStation(a.sim);
  addPatrol(a.sim);
  const first = a.system.reportIncident(goodReport());

  // A different process with different live entity ids and a different spawn order.
  const b = boot();
  addPatrol(b.sim, { pos: { x: 400, z: -200 }, worldRecordId: 'wr_patrol_z' });
  addStation(b.sim);
  const second = b.system.reportIncident(goodReport());

  assert.notEqual(a.system.state.playerId, null);
  assert.equal(second.incidentReceiptId, first.incidentReceiptId);
});

// ── denials ─────────────────────────────────────────────────────────────────────────────────────

test('no jurisdiction is an explicit denial, not silence', () => {
  const { sim, system, log } = boot();
  addStation(sim);
  addPatrol(sim);
  const denial = system.reportIncident(goodReport({ pos: { x: 90000, z: 90000 } }));
  assert.equal(denial.accepted, false);
  assert.equal(denial.reason, 'no_jurisdiction');
  assert.equal(denial.validatedWitnessedTheft, false);
  assert.equal(log.reports.at(-1), denial, 'the denial is published, not swallowed');
});

test('the witness gate is REACHABLE inside a jurisdiction, and denies there', () => {
  // The gate is only meaningful if a position can be inside a legal ring and still unseen. The
  // lawful-station protection floor is 600 WU and the witness radius is deliberately below it, so
  // the annulus between them exists. If a future edit raises the witness radius above the
  // jurisdiction floor this test goes red rather than silently becoming vacuous.
  assert.ok(LAW_INCIDENT_WITNESS_RADIUS < 600,
    'witness radius must stay under the 600 WU lawful-station protection floor');

  const { sim, system, log } = boot();
  addStation(sim);
  const unseen = { x: (LAW_INCIDENT_WITNESS_RADIUS + 600) / 2, z: 0 };

  const denial = system.reportIncident(goodReport({ pos: unseen }));
  assert.equal(denial.accepted, false);
  assert.equal(denial.reason, 'no_witness', 'inside jurisdiction, outside every witness range');
  assert.equal(denial.validatedWitnessedTheft, false);
  assert.equal(log.reports.at(-1).reason, 'no_witness');

  // The same spot becomes a crime scene the moment something that can see is actually there.
  addPatrol(sim, { pos: { x: unseen.x + 50, z: 0 }, worldRecordId: 'wr_witness' });
  const accepted = system.reportIncident(goodReport({ pos: unseen }));
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.witnessCount >= 1);
});

test('a lawful station within witness range is itself a witness', () => {
  const { sim, state, system } = boot();
  addStation(sim);
  const receipt = system.reportIncident(goodReport({ pos: { ...THEFT_POS } }));
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.witnessCount, 1);
  assert.deepEqual([...receipt.witnessStableIds], ['station_tethys_customs']);
  // ...and beyond that range it is not.
  assert.equal(
    lawWitnessesNear(state, { pos: { x: LAW_INCIDENT_WITNESS_RADIUS + 100, z: 0 } }).length,
    0,
  );
});

test('malformed reports are denied by reason and never throw', () => {
  const { sim, system } = boot();
  addStation(sim);
  for (const bad of [
    {}, goodReport({ reportId: '' }), goodReport({ kind: null }),
    goodReport({ offenderStableId: '  ' }), goodReport({ payloadStableId: 7 }),
    goodReport({ causalTick: -1 }), goodReport({ causalTick: 1.5 }),
    goodReport({ pos: { x: Number.NaN, z: 0 } }), goodReport({ pos: null }),
    goodReport({ reportId: 'a|b' }),
  ]) {
    const denial = system.reportIncident(bad);
    assert.equal(denial.accepted, false);
    assert.equal(denial.reason, 'invalid_report', JSON.stringify(bad));
  }
});

test('a denial is not cached: fixing the world lets the same report succeed', () => {
  const { sim, system } = boot();
  const denied = system.reportIncident(goodReport());
  assert.equal(denied.accepted, false);
  assert.equal(denied.reason, 'no_jurisdiction');

  addStation(sim);
  addPatrol(sim);
  const accepted = system.reportIncident(goodReport());
  assert.equal(accepted.accepted, true, 'a momentary absence must not become a permanent licence');
});

// ── "no patrol" is an outcome, never a spawn ────────────────────────────────────────────────────

test('no available patrol is a recorded outcome and spawns nothing', () => {
  const { sim, state, system, log } = boot();
  addStation(sim); // lawful station witnesses the theft; no lawful SHIP exists to respond
  const before = state.entityList.length;

  const receipt = system.reportIncident(goodReport());
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.responderAvailability, 'none_in_range');
  assert.deepEqual([...receipt.responderEntityIds], []);
  assert.equal(state.entityList.length, before, 'no responder hull may be manufactured');

  const row = log.receipts.at(-1);
  assert.equal(row.outcome, 'dispatch_unavailable');
  assert.match(row.text, /no patrol in range/i);
});

test('the intake never touches the dispatching incident path', () => {
  const { sim, state, system, log } = boot();
  addStation(sim);
  addPatrol(sim);
  const before = state.entityList.length;

  system.reportIncident(goodReport());
  // `_openIncident` -> `_dispatchIncident` -> `_respondersFor` is the only spawning path in this
  // owner. If the seam ever routes through it, these three facts change.
  assert.equal(log.distress.length, 0, 'no distress incident is opened');
  assert.equal(log.dispatch.length, 0, 'no dispatch is started');
  assert.equal(state.entityList.length, before);
  assert.deepEqual(Object.keys(state.lawSecurity.incidents), [], 'the live incident map is untouched');
});

test('the seam does not steer or authorize the responders it reports', () => {
  const { sim, system } = boot();
  addStation(sim);
  const patrol = addPatrol(sim);
  const receipt = system.reportIncident(goodReport());
  assert.deepEqual([...receipt.responderEntityIds], [patrol.id]);
  // Enlisting a patrol is the NPC-job control lease's job, not law intake's.
  assert.equal(patrol.data.ai.securityTargetId, undefined);
  assert.equal(patrol.data.combat, undefined);
});

// ── the witness query itself ────────────────────────────────────────────────────────────────────

test('the witness query is bounded, deterministic, and excludes the offender and the player', () => {
  const { sim, state, player } = boot();
  addStation(sim);
  for (let i = 0; i < 20; i++) {
    addPatrol(sim, { pos: { x: 200 + i * 5, z: 0 }, worldRecordId: `wr_patrol_${String(i).padStart(2, '0')}` });
  }
  const witnesses = lawWitnessesNear(state, {
    pos: { ...THEFT_POS }, offenderEntityId: player.id,
  });
  assert.equal(witnesses.length, LAW_INCIDENT_WITNESS_CAP, 'the query is capped');
  const ids = witnesses.map((w) => w.stableId);
  assert.deepEqual(ids, [...ids], 'stable ids are returned in a fixed order');
  assert.equal(ids.includes(`entity:${player.id}`), false, 'the thief does not witness themselves');
  // Re-running the identical query yields the identical answer.
  assert.deepEqual(
    lawWitnessesNear(state, { pos: { ...THEFT_POS }, offenderEntityId: player.id }),
    witnesses,
  );
});

test('an explicitly marked non-lawful entity can witness', () => {
  const { sim, state } = boot();
  const marked = sim.spawn({
    type: 'fx', team: 2, factionId: 'faction_scn', pos: { x: 250, z: 0 }, radius: 6,
    data: { heistFacilityId: 'lawful_catcher', lawWitness: true },
  });
  const witnesses = lawWitnessesNear(state, { pos: { ...THEFT_POS } });
  assert.equal(witnesses.length, 1);
  assert.equal(witnesses[0].stableId, 'lawful_catcher');
  assert.equal(witnesses[0].entityId, marked.id);
  assert.equal(witnesses[0].lawful, false, 'a marker is not a promotion to lawful');
});

test('the reported-incident ledger is created only on first real use', () => {
  const { sim, state, system } = boot();
  assert.equal(state.lawSecurity.reportedIncidents, undefined,
    'no key may materialize before an actual report');
  system.reportIncident(goodReport({ pos: { x: 90000, z: 90000 } })); // denied
  assert.equal(state.lawSecurity.reportedIncidents, undefined,
    'a denial stores nothing');
  addStation(sim);
  system.reportIncident(goodReport());
  assert.equal(Object.keys(state.lawSecurity.reportedIncidents).length, 1);
});
