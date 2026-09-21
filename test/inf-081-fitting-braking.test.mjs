// INF-081 — compare upgrades in terms of how the ship will move. The fitting
// comparison quoted stop distance from a parallel formula (v^2/2·reverseAccel only),
// ignoring the flip-and-burn the HUD arrival cue and the route follower assume —
// roughly twice the stop the ship actually flies. Now the readout feeds the fit's own
// derived propulsion profile (the shape the undocked ship flies with) into the live
// braking solution, and marks the forecast as situational with its stated assumption
// while fit stats stay unconditional.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMassDelta,
  liveStopDistance,
  summarizeStats,
} from '../src/ui/panels/massDelta.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { estimateBrakingSolution } from '../src/core/flight/flightTelemetry.js';

const SHIP = 'ship_kestrel';

function independentLiveStop(shipId, fittings) {
  const derived = getDerivedStats(shipId, fittings, null);
  const speed = derived.maxSpeed;
  const solution = estimateBrakingSolution(
    { pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 }, rot: 0, angVel: 0 },
    derived.propulsion || {},
  );
  return Math.min(solution.directDistance, solution.flipBurnDistance);
}

function stopMetric(delta) {
  return delta.metrics.find((m) => m.id === 'stopDistance');
}

test('the panel stop matches the live braking solution for the same fit', () => {
  const delta = buildMassDelta(SHIP, { beforeFittings: [], candidateModuleId: 'mod_engine_ion_m' });
  assert.ok(delta.ok, 'comparison builds');
  const panel = stopMetric(delta);
  const expected = independentLiveStop(SHIP, delta.afterFittings);
  assert.ok(Number.isFinite(panel.after), 'a finite forecast, not a fantasy number');
  assert.ok(Math.abs(panel.after - expected) < 1e-3, 'panel reads the live path, not a parallel formula');
});

test('the panel no longer quotes the retired reverse-only formula', () => {
  const derived = getDerivedStats(SHIP, [], null);
  // The retired readout: top speed squared over twice the LEGACY flight-model reverse
  // number. It promised roughly half the stop the ship actually flies.
  const retired = (derived.maxSpeed ** 2)
    / (2 * Math.max(1e-9, derived.flightModel.reverseAccel));
  const live = liveStopDistance(derived);
  assert.ok(live > retired * 1.5, 'the live stop materially differs from the retired quote');
  const delta = buildMassDelta(SHIP, { beforeFittings: [], candidateModuleId: 'mod_engine_ion_m' });
  assert.ok(Math.abs(stopMetric(delta).before - live) < 1e-3, 'the panel quotes live, not retired');
});

test('better brakes shorten the quoted stop at the same top speed', () => {
  const base = [null, null, 'mod_engine_ion_m', null, null, null, null, null];
  const stock = buildMassDelta(SHIP, { beforeFittings: base, candidateModuleId: 'mod_thruster_stock_s' });
  const stripped = buildMassDelta(SHIP, { beforeFittings: base, candidateModuleId: 'mod_thruster_stripped_s' });
  assert.ok(stock.ok && stripped.ok, 'both thrusters splice');
  assert.ok(stopMetric(stock).after < stopMetric(stripped).after, 'working RCS out-brakes stripped RCS');
});

test('fit stats stay unconditional while braking states its assumption', () => {
  const delta = buildMassDelta(SHIP, { beforeFittings: [], candidateModuleId: 'mod_engine_ion_m' });
  for (const id of ['turn', 'topSpeed', 'bank', 'massRatio']) {
    const metric = delta.metrics.find((m) => m.id === id);
    assert.equal(metric.basis, 'fit', `${id} follows the fit unconditionally`);
    assert.equal(metric.assumption, null, `${id} needs no caveat`);
  }
  const stop = stopMetric(delta);
  assert.equal(stop.basis, 'situational', 'braking is a forecast');
  assert.match(stop.assumption, /top speed/i, 'the assumption is stated');
  assert.equal(stop.source, 'flight.brakingSolution', 'the source names the live path');
});

test('an unbrakeable fit renders unknown, never a confident zero', () => {
  assert.equal(liveStopDistance(null), null, 'no derived stats, no forecast');
  assert.equal(liveStopDistance({ maxSpeed: 0, propulsion: {} }), null, 'no speed, no forecast');
  assert.equal(summarizeStats('no_such_ship', [], null), null, 'unknown hull stays null');
});
