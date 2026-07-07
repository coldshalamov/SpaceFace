#!/usr/bin/env node
// BP-13/B14 Ambush Signatures contract.
//
// Pending ambushes place deterministic passive tells before ships spawn. The tells are scannable
// into a warning hint, and non-ambush schedules cannot create fake warning props.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  AMBUSH_SIGNATURE_SCAN_RADIUS,
  ambushSignatureForShape,
  ambushSignatures,
  ambushSignaturesMissingTells,
  activeAmbushSignatureTells,
} from '../src/systems/ambushSignatures.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(AMBUSH_SIGNATURE_SCAN_RADIUS <= 1400, 'ambush tell scan radius stays local');
assert.ok(ambushSignatureForShape('ambush_snare'), 'ambush_snare has a signature tell');
assert.equal(ambushSignatureForShape('convoy_departure'), null, 'convoys do not masquerade as ambush tells');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in ambush signature path'); };
  Date.now = () => { throw new Error('Date.now in ambush signature path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPendingAmbushPlacesTell);
guarded(testScanningTellEmitsWarning);
guarded(testNoTellNoAmbushShape);

console.log(`[check-ambush-signatures] PASS - ${sections} sections green`);

function boot() {
  const sim = createSimulation({ seed: 1414, systems: [ambushSignatures] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const log = { scans: [] };
  bus.on('ambushSignature:scanned', (p) => log.scans.push(p));
  return { sim, state, bus, log, sys: sim.registry.get('ambushSignatures') };
}

function ambushPlan() {
  return {
    encounterId: 'ambush-B14',
    shapeId: 'ambush_snare',
    kind: 'ambush_snare',
    script: 'ambush',
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_ambush',
    zoneName: 'Sker-Run Ambush',
    zoneCenter: { x: -950, z: 520 },
    zoneRadius: 420,
    dueAt: 120,
  };
}

function testPendingAmbushPlacesTell() {
  const t = boot();
  t.state.encounterDirector = { pending: [ambushPlan()] };
  t.sys.update(0.1, t.state);
  const tells = activeAmbushSignatureTells(t.state);
  assert.equal(tells.length, 1, 'one pending ambush creates one passive tell');
  assert.equal(tells[0].shapeId, 'ambush_snare', 'tell keeps the ambush shape provenance');
  assert.equal(tells[0].zoneName, 'Sker-Run Ambush', 'tell keeps the named zone provenance');
  assert.match(tells[0].hint, /ambush|trap|raider/i, 'tell exposes an ambush warning hint');
  assert.deepEqual(ambushSignaturesMissingTells(t.state), [], 'every pending ambush has a tell');

  t.sys.update(0.1, t.state);
  assert.equal(activeAmbushSignatureTells(t.state).length, 1, 'tell placement is idempotent');
  ok('pending ambushes place deterministic passive tells before ships spawn');
}

function testScanningTellEmitsWarning() {
  const t = boot();
  t.state.encounterDirector = { pending: [ambushPlan()] };
  t.sys.update(0.1, t.state);
  const tell = activeAmbushSignatureTells(t.state)[0];
  t.bus.emit('scan:pulse', { pos: { x: tell.pos.x + 20, z: tell.pos.z + 10 } });
  assert.equal(t.log.scans.length, 1, 'scan pulse reveals the tell once');
  assert.equal(t.log.scans[0].tellId, tell.id, 'scan event identifies the tell');
  assert.match(t.log.scans[0].hint, /ambush|trap|raider/i, 'scan event carries counterplay hint');
  assert.equal(activeAmbushSignatureTells(t.state)[0].scanned, true, 'tell records scanned state');

  t.bus.emit('scan:pulse', { pos: { x: tell.pos.x + 25, z: tell.pos.z + 10 } });
  assert.equal(t.log.scans.length, 1, 'same tell does not spam scan warnings');
  ok('scanning an ambush tell emits exactly one warning hint');
}

function testNoTellNoAmbushShape() {
  const t = boot();
  t.state.encounterDirector = {
    pending: [{
      encounterId: 'convoy-B14',
      shapeId: 'convoy_departure',
      script: 'convoy',
      sectorId: 'sector_pallas_drift',
      zoneId: 'zone_pallas_ambush',
      zoneName: 'Sker-Run Ambush',
      zoneCenter: { x: -950, z: 520 },
      zoneRadius: 420,
      dueAt: 120,
    }],
  };
  t.sys.update(0.1, t.state);
  assert.equal(activeAmbushSignatureTells(t.state).length, 0, 'non-ambush plan creates no tell');
  assert.deepEqual(ambushSignaturesMissingTells(t.state), [], 'non-ambush plan is not reported missing a tell');
  ok('non-ambush schedules cannot create fake ambush tells');
}
