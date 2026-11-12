#!/usr/bin/env node
// BP-13/B15 Ambush Wreck Fields / Pirate-Base Discovery provenance contract.
//
// This packet does not spawn a base. It plants a causal candidate record for POI/salvage consumers
// only after repeated real pirate ambush/toll events in one named zone.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  PIRATE_BASE_CANDIDATE_EVENTS,
  pirateBaseCandidateForZone,
  pirateBaseCandidates,
  pirateRumor,
  rumorKey,
} from '../src/systems/pirateRumor.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.equal(PIRATE_BASE_CANDIDATE_EVENTS, 6, 'pirate-base candidate waits for six proven events');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate-base provenance path'); };
  Date.now = () => { throw new Error('Date.now in pirate-base provenance path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testRepeatedAmbushesPlantCandidate);
guarded(testHeatWithoutProvenanceDoesNotPlantCandidate);
guarded(testCandidateSeedIsDeterministic);

console.log(`[check-pirate-base-provenance] PASS - ${sections} sections green`);

function boot(seed = 1515) {
  const sim = createSimulation({ seed, systems: [pirateRumor] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const log = { base: [], poi: [] };
  bus.on('pirateRumor:baseCandidate', (p) => log.base.push(p));
  bus.on('poi:candidate', (p) => log.poi.push(p));
  return { state, bus, log };
}

function emitAmbush(t, i, kind = 'ambush_snare') {
  t.state.simTime = i * 14;
  t.bus.emit('encounter:spawned', {
    encounterId: `${kind}-${i}`,
    kind,
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_ambush',
    count: 3,
  });
}

function testRepeatedAmbushesPlantCandidate() {
  const t = boot();
  for (let i = 0; i < PIRATE_BASE_CANDIDATE_EVENTS - 1; i++) emitAmbush(t, i);
  assert.equal(pirateBaseCandidateForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush'), null,
    'below threshold does not plant a candidate');

  emitAmbush(t, PIRATE_BASE_CANDIDATE_EVENTS - 1);
  const candidate = pirateBaseCandidateForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush');
  assert.ok(candidate, 'threshold ambushes plant a candidate');
  assert.equal(candidate.poiType, 'pirate_base_candidate', 'candidate is explicitly POI-shaped');
  assert.equal(candidate.zoneName, 'Sker-Run Ambush', 'candidate keeps named-zone provenance');
  assert.equal(candidate.provenance.eventCount, PIRATE_BASE_CANDIDATE_EVENTS, 'candidate records the event count');
  assert.equal(candidate.provenance.eventIds.length, PIRATE_BASE_CANDIDATE_EVENTS, 'candidate keeps the real event ids');
  assert.ok(candidate.payoff.bounty && candidate.payoff.salvage, 'candidate declares future payoff contract');
  assert.equal(t.log.base.length, 1, 'pirateRumor candidate event fires once');
  assert.equal(t.log.poi.length, 1, 'generic POI candidate event fires once');

  emitAmbush(t, PIRATE_BASE_CANDIDATE_EVENTS);
  assert.equal(t.log.base.length, 1, 'same zone does not spam candidate events');
  assert.equal(pirateBaseCandidates(t.state, 'sector_pallas_drift').length, 1, 'candidate is exposed to POI consumers');
  ok('repeated real ambushes plant one provenance-linked pirate-base candidate');
}

function testHeatWithoutProvenanceDoesNotPlantCandidate() {
  const t = boot(1516);
  const key = rumorKey('sector_pallas_drift', 'zone_pallas_ambush');
  t.state.pirateRumor = {
    schemaVersion: 1,
    zones: {
      [key]: {
        sectorId: 'sector_pallas_drift',
        zoneId: 'zone_pallas_ambush',
        zoneName: 'Sker-Run Ambush',
        heat: 99,
        eventCount: 99,
      },
    },
  };
  assert.equal(pirateBaseCandidateForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush'), null,
    'naked heat/event counts without ambush provenance do not create candidates');
  ok('heat without actual ambush provenance cannot plant a pirate base');
}

function testCandidateSeedIsDeterministic() {
  const a = boot(1517);
  const b = boot(1517);
  for (let i = 0; i < PIRATE_BASE_CANDIDATE_EVENTS; i++) {
    emitAmbush(a, i, i % 2 ? 'pirate_toll' : 'ambush_snare');
    emitAmbush(b, i, i % 2 ? 'pirate_toll' : 'ambush_snare');
  }
  const ca = pirateBaseCandidateForZone(a.state, 'sector_pallas_drift', 'zone_pallas_ambush');
  const cb = pirateBaseCandidateForZone(b.state, 'sector_pallas_drift', 'zone_pallas_ambush');
  assert.deepEqual(ca, cb, 'same seed and same real event stream produces identical candidate');
  ok('pirate-base candidate provenance is deterministic');
}
