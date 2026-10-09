#!/usr/bin/env node
// BP-07.1 MASS-FEEL backend proof.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, getDerivedStats } from '../src/systems/ships.js';
import {
  MASS_DELTA_METRICS,
  buildMassDelta,
  formatMassDelta,
  liveStopDistance,
  spliceCandidateFitting,
  stopDistanceEstimate,
  summarizeStats,
} from '../src/ui/panels/massDelta.js';
import { estimateBrakingSolution } from '../src/core/flight/flightTelemetry.js';
import { governedFightSpeedFor } from '../src/systems/shipCapabilities.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/ui/panels/massDelta.js', import.meta.url)),
  'src/ui/panels/massDelta.js exists');

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in mass-delta path'); };
  Date.now = () => { throw new Error('Date.now in mass-delta path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testCandidateSplice);
guarded(testDeltaMetrics);
guarded(testStopEstimateAndSummary);
testPackageAndNoTouchGuards();

console.log(`[check-mass-delta] PASS - ${sections} sections green`);

function metric(delta, id) {
  const found = delta.metrics.find((entry) => entry.id === id);
  assert.ok(found, `${id} metric exists`);
  return found;
}

function testCandidateSplice() {
  const muleSlots = buildSlotList(SHIPS.find((ship) => ship.id === 'ship_mule'));
  const firstCargoIndex = muleSlots.findIndex((slot) => slot.type === 'cargo');
  const result = spliceCandidateFitting('ship_mule', [], { moduleId: 'mod_cargo_pod_m' });
  assert.equal(result.ok, true, 'cargo pod auto-splices into a compatible Mule cargo slot');
  assert.equal(result.slotIndex, firstCargoIndex, 'auto-splice chooses the first empty compatible slot');
  assert.equal(result.fittings[firstCargoIndex], 'mod_cargo_pod_m', 'candidate fitting is written at the chosen slot');

  const impossible = spliceCandidateFitting('ship_kestrel', [], { moduleId: 'mod_cargo_pod_m' });
  assert.equal(impossible.ok, false, 'M cargo pod does not fit the starter S cargo slot');
  assert.equal(impossible.reason, 'does_not_fit', 'impossible candidate reports the fitting-rule reason');
  assert.equal(impossible.fittings.every((id) => id == null), true, 'failed splice leaves fittings empty');
  ok('candidate fittings use the shipped slot/fits helpers');
}

function testDeltaMetrics() {
  const delta = buildMassDelta('ship_mule', { candidateModuleId: 'mod_cargo_pod_m' });
  assert.equal(delta.ok, true, 'Mule cargo-pod mass delta builds successfully');
  assert.deepEqual(MASS_DELTA_METRICS.map((row) => row.id), [
    'turn',
    'topSpeed',
    'stopDistance',
    'bank',
    'massRatio',
  ], 'metric roster/order stays stable');

  const shipDef = SHIPS.find((ship) => ship.id === 'ship_mule');
  const beforeLive = getDerivedStats('ship_mule', [], null);
  const afterLive = getDerivedStats('ship_mule', delta.afterFittings, null);
  // NXB-030: the chips quote the live propulsion channels — yaw response and the travel ceiling —
  // not the legacy spec fields that kept mass-scaling after the kernel stopped applying it.
  assert.equal(metric(delta, 'turn').before, round3(beforeLive.propulsion.yawAccel), 'turn before reads the live yaw response');
  assert.equal(metric(delta, 'turn').after, round3(afterLive.propulsion.yawAccel), 'turn after reads the live yaw response');
  assert.equal(metric(delta, 'topSpeed').before, round3(beforeLive.propulsion.travelCeiling), 'topSpeed before reads the drive travel ceiling');
  assert.equal(metric(delta, 'topSpeed').after, round3(afterLive.propulsion.travelCeiling), 'topSpeed after reads the drive travel ceiling');
  assert.equal(metric(delta, 'bank').after, round3(afterLive.bankFactor), 'bank after reads getDerivedStats bankFactor');
  assert.equal(metric(delta, 'massRatio').after, round3(afterLive.mass / shipDef.mass), 'mass ratio after reads derived mass/base mass');

  // The pod's own mass is rated into the hull's design envelope, so the honest deltas are the
  // bank sag and the mass ratio — never a phantom turn/speed tax the kernel does not command.
  assert.ok(Math.abs(metric(delta, 'turn').delta) < 0.05, 'the empty pod alone barely moves yaw response');
  assert.equal(metric(delta, 'topSpeed').delta, 0, 'the governed ceiling is not for sale — a pod cannot buy or sell it');
  assert.ok(metric(delta, 'bank').delta < 0, 'adding cargo mass lowers bank factor');
  assert.ok(metric(delta, 'massRatio').delta > 0, 'adding cargo mass raises mass ratio');
  // And the channel the chips now read DOES move when the hold fills with real cargo.
  const emptyHold = summarizeStats('ship_mule', delta.afterFittings, null);
  const loadedHold = summarizeStats('ship_mule', delta.afterFittings, { cargo: { usedMass: 300 } });
  assert.ok(loadedHold.turn < emptyHold.turn, 'a loaded hold slows turn response for real');
  assert.equal(loadedHold.topSpeed, emptyHold.topSpeed, 'and never the governed ceiling');
  ok('mass-delta metrics are live before/after getDerivedStats deltas');
}

function testStopEstimateAndSummary() {
  const delta = buildMassDelta('ship_mule', { candidateModuleId: 'mod_cargo_pod_m' });
  const beforeModel = getDerivedStats('ship_mule', [], null).flightModel;
  assert.equal(stopDistanceEstimate(beforeModel), beforeModel.maxSpeed * beforeModel.maxSpeed / (2 * beforeModel.reverseAccel),
    'stopDistanceEstimate keeps the compatibility flight-model formula it documents');
  // The row itself is the live braking solution probed at the governed fight speed — the same
  // estimator routeFollower and the HUD arrival cue run — not the retired spec-field formula.
  const beforeLive = getDerivedStats('ship_mule', [], null);
  const fightSpeed = governedFightSpeedFor(beforeLive);
  const solution = estimateBrakingSolution(
    { pos: { x: 0, z: 0 }, vel: { x: fightSpeed, z: 0 }, rot: 0, angVel: 0 },
    beforeLive.propulsion,
  );
  const expectedStop = Math.min(solution.directDistance, solution.flipBurnDistance);
  assert.equal(metric(delta, 'stopDistance').before, round3(liveStopDistance(beforeLive)),
    'stop-distance before is the module live readout');
  assert.ok(Math.abs(metric(delta, 'stopDistance').before - round3(expectedStop)) < 0.01,
    'and it is the live braking solution at the governed fight cap, not the retired formula');
  assert.ok(liveStopDistance(beforeLive) > stopDistanceEstimate(beforeModel) * 1.5,
    'the governed-speed stop dwarfs the quote the retired spec field would have printed');
  assert.match(delta.summary, /Turn [+-]?\d+(\.\d+)?% · Top speed [+-]?\d+(\.\d+)?% · Stop distance [+-]?\d+m · Bank -/,
    'summary is a compact outfit-hover delta row');
  assert.doesNotMatch(delta.summary, /Top speed -/, 'a cargo pod must not claim to slow the ship');
  assert.doesNotMatch(delta.summary, /Turn -/, 'a cargo pod must not claim to dull the yaw ceiling');
  assert.equal(formatMassDelta(delta.metrics), delta.summary, 'summary uses the shared formatter');
  ok('stop-distance estimate and summary are explicit and deterministic');
}

function testPackageAndNoTouchGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:mass-delta'], 'node scripts/check-mass-delta.mjs',
    'package exposes check:mass-delta');

  const source = readFileSync(new URL('../src/ui/panels/massDelta.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'mass delta path does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /document\.|window\.|innerHTML|addEventListener/,
    'mass delta helper is pure data, not DOM/render wiring');
  assert.doesNotMatch(source, /state\.player|economy:|cargo:|faction:repDelta|flightV3|input\.js|hud\.js/,
    'mass delta helper does not write gameplay state or reach into no-touch lanes');
  ok('package and no-touch guards are present');
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
