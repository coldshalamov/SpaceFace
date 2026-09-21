// INF-077 — explain WANTED with the incident that caused it. Heat used to flip the
// WANTED alert with no trace of why: a heat increase could not be connected to the
// accepted law receipt behind it. Now the heat owner records the convicting incident
// (kind, affected party, witness/jurisdiction basis) on the player record, carries it
// on heat:changed, and the alert renders it — while suspicion without a receipt, a
// denial, or an unwitnessed act never produces a witness claim.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat } from '../src/systems/heat.js';
import { wantedReasonText } from '../src/ui/wantedReason.js';

function boot() {
  const sim = createSimulation({ seed: 77, systems: [heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const changes = [];
  bus.on('heat:changed', (p) => changes.push(p));
  return { sim, state, bus, changes, heat: sim.registry.get('heat') };
}

function theftReceipt(overrides = {}) {
  return {
    accepted: true,
    incidentReceiptId: 'law:incident:test077theft',
    reportId: 'test077:theft',
    kind: 'payload_theft',
    offenderStableId: 'player',
    payloadStableId: 'pq077_capsule',
    causalTick: 5,
    stationId: 'station_tethys_customs',
    factionId: 'faction_scn',
    witnessCount: 2,
    witnessStableIds: ['wit_a', 'wit_b'],
    validatedWitnessedTheft: true,
    source: 'lawSecurity',
    ...overrides,
  };
}

test('an accepted theft receipt convicts with a traceable record', () => {
  const harness = boot();
  harness.bus.emit('law:reportIncidentReceipt', theftReceipt());
  assert.ok(harness.state.player.heat > 0, 'heat rose on the validated receipt');
  const inc = harness.state.player.heatLastIncident;
  assert.equal(inc.kind, 'payload_theft', 'kind kept');
  assert.equal(inc.affected, 'pq077_capsule', 'affected party kept');
  assert.equal(inc.witnessCount, 2, 'witness count kept');
  assert.equal(inc.jurisdiction, 'station_tethys_customs', 'jurisdiction kept');
  assert.equal(inc.incidentReceiptId, 'law:incident:test077theft', 'receipt id kept');
  const packet = harness.changes[harness.changes.length - 1];
  assert.deepEqual(packet.incident, inc, 'heat:changed carries the same incident');
  assert.equal(
    wantedReasonText(packet, harness.state.player),
    ' · CARGO THEFT · pq077_capsule · 2 WITNESSES · station_tethys_customs',
    'the alert traces incident, party, witnesses, jurisdiction',
  );
});

test('an accepted kill receipt names the victim with a singular witness', () => {
  const harness = boot();
  harness.bus.emit('law:reportIncidentReceipt', {
    accepted: true,
    incidentReceiptId: 'law:kill:test077kill',
    reportId: 'kill:hauler_7',
    kind: 'unlawful_kill',
    offenderStableId: 'player',
    victimStableId: 'hauler_7',
    victimClass: 'hauler',
    causalTick: 9,
    stationId: null,
    witnessCount: 1,
    witnessStableIds: ['wit_c'],
    validatedWitnessedTheft: false,
    validatedCrime: true,
    source: 'lawSecurity',
  });
  const inc = harness.state.player.heatLastIncident;
  assert.equal(inc.affected, 'hauler_7', 'victim preferred over class');
  assert.equal(
    wantedReasonText(harness.changes.at(-1), harness.state.player),
    ' · KILL · hauler_7 · 1 WITNESS',
    'singular witness, no jurisdiction invented',
  );
});

test('a denial leaves no record and no reason', () => {
  const harness = boot();
  harness.bus.emit('law:reportIncidentReceipt', {
    accepted: false,
    reason: 'no_witness',
    reportId: 'test077:denied',
    kind: 'payload_theft',
    validatedWitnessedTheft: false,
    source: 'lawSecurity',
  });
  assert.equal(harness.state.player.heat, 0, 'denied report raises nothing');
  assert.equal(harness.state.player.heatLastIncident, undefined, 'no incident recorded');
  assert.equal(wantedReasonText(null, harness.state.player), '', 'no reason without a receipt');
});

test('an unvalidated acceptance never mints a witness claim', () => {
  const harness = boot();
  const result = harness.heat.applyIncidentReceipt(theftReceipt({ validatedWitnessedTheft: false }));
  assert.equal(result.applied, false, 'rejected without a validated flag');
  assert.equal(result.reason, 'not_witnessed', 'rejection names the missing validation');
  assert.ok(!harness.state.player.heatLastIncident, 'nothing recorded');
});

test('suspicion heat without a receipt carries no incident and no witness text', () => {
  const harness = boot();
  harness.bus.emit('contraband:scanned', { found: true });
  assert.ok(harness.state.player.heat > 0, 'suspicion heat rose');
  assert.ok(!harness.state.player.heatLastIncident, 'no convicting incident');
  const packet = harness.changes.at(-1);
  assert.equal(packet.incident, null, 'packet carries no incident');
  assert.equal(wantedReasonText(packet, harness.state.player), '', 'alert shows no reason');
});

test('a cleared record convicts nobody afterwards', () => {
  const harness = boot();
  harness.bus.emit('law:reportIncidentReceipt', theftReceipt());
  assert.ok(harness.state.player.heatLastIncident, 'conviction recorded');
  harness.heat._setHeat(0, 'test clear');
  assert.equal(harness.state.player.heatLastIncident, null, 'stale conviction dropped');
  assert.equal(wantedReasonText(harness.changes.at(-1), harness.state.player), '', 'no stale reason');
});

test('a baseless record renders the kind alone, never an invented witness', () => {
  assert.equal(
    wantedReasonText({ incident: { kind: 'payload_theft', incidentReceiptId: 'x', witnessCount: 0 } }, null),
    ' · CARGO THEFT',
    'no witnesses and no jurisdiction means no basis claim',
  );
  assert.equal(
    wantedReasonText({ incident: { kind: 'payload_theft', incidentReceiptId: 'x', witnessCount: 0, jurisdiction: 'station_y' } }, null),
    ' · CARGO THEFT · station_y',
    'jurisdiction alone is a jurisdiction claim, not a witness claim',
  );
});
