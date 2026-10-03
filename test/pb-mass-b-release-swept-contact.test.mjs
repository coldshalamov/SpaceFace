// PB-MASS-B — SF-027 release-space swept-contact delta.
//
// The shipped release read already sweeps the AIM contact (sweptDiskContact) and names one
// protected body inside the predicted corridor (INF-078). The packet's chosen outcome names a
// second victim class first — the PILOT'S OWN ROUTE — and names the failure mode to avoid: a
// point-sampled read that a fast or thin contact slips between. These pins hold the delta:
// the own-route victim is named, the swept segment catches what the endpoint sample misses,
// clear space and uncertain predictions stay silent, and the read never touches release
// authority. Seed 4242 (no rng on these pure paths; pinned for the suite's convention).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveThrowCollateral,
  resolveThrowOwnRouteRisk,
  sweptDiskContact,
} from '../src/combat/masslineReleaseGeometry.js';

const PAYLOAD_POS = { x: 0, z: 0 };
const PAYLOAD_RADIUS = 6;
const PILOT_RADIUS = 12;
// halfWidth = 6 + 12 = 18 — the corridor both tests measure against.

// Constant-velocity tangent: a fast flat run from (0,0) to the predicted contact (600,0).
// The pilot cuts ACROSS the tangent's middle at slow crosser speed, so the closest approach
// happens BETWEEN the endpoints — the exact shape a point-sampled endpoint read flies past.
const CROSSING_SOLUTION = Object.freeze({
  valid: true,
  degraded: false,
  decisionStale: false,
  predicted: { x: 600, z: 0 },
  projectedPath: null,
  timeOfFlight: 6,
  predictionHorizon: 6,
});

test('a release tangent crossing the pilot route names YOUR ROUTE, not a body spot', () => {
  // Pilot route: (300,30) -> (330,0) over the horizon; the payload segment (0,0)->(600,0)
  // passes 14.2 wu off the route line — inside the 18 wu combined skin, outside any single spot.
  const own = resolveThrowOwnRouteRisk(
    CROSSING_SOLUTION, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  );
  assert.ok(own, 'the own-route crossing must be named');
  assert.equal(own.label, 'YOUR ROUTE');
  assert.ok(own.clearance < 0, 'clearance is negative when the corridors overlap');
  assert.ok(Number.isFinite(own.closestTime) && own.closestTime >= 0);

  // The same geometry from the body corridor (the shipped read) names NOTHING: the pilot hull
  // is not a law-protected spot, and no body sits on the path. The own-route class is the delta.
  const spots = [
    { x: -500, z: 500, r: 20, label: 'STATION FAR' },
  ];
  const body = resolveThrowCollateral(CROSSING_SOLUTION, PAYLOAD_POS, PAYLOAD_RADIUS, spots);
  assert.equal(body, null, 'the protected-body corridor must stay silent for an own-route crossing');
});

test('the swept segment catches a contact the old point-sampled endpoint read misses', () => {
  const playerPos = { x: 300, z: 30 };
  const playerVel = { x: 0, z: -10 };
  // What a point-sampled read (endpoints only) computes: the payload vertex nearest the route
  // is the predicted contact (600,0) — hundreds of wu off the pilot. It stays silent.
  const endpointDistance = Math.hypot(
    CROSSING_SOLUTION.predicted.x - (playerPos.x + playerVel.x * CROSSING_SOLUTION.timeOfFlight),
    CROSSING_SOLUTION.predicted.z - (playerPos.z + playerVel.z * CROSSING_SOLUTION.timeOfFlight),
  );
  assert.ok(endpointDistance > 18, 'precondition: the sampled vertex is far outside the corridor');
  // The swept read interpolates the segment and finds the mid-course approach.
  const own = resolveThrowOwnRouteRisk(
    CROSSING_SOLUTION, PAYLOAD_POS, PAYLOAD_RADIUS, playerPos, playerVel, PILOT_RADIUS,
  );
  assert.ok(own, 'the swept read must catch the between-samples contact');
});

test('a thin fast crossing between path samples is caught on the field-aware path too', () => {
  // Sampled path with a coarse step: vertices sit far from the pilot; the interpolated segment
  // passes right over them. Vertex-only classification on every sample stays silent here —
  // that is the tunnel the sweep exists to close.
  const solution = {
    ...CROSSING_SOLUTION,
    projectedPath: [PAYLOAD_POS, { x: 300, z: 0 }, { x: 600, z: 0 }],
    predictionHorizon: 2,
  };
  const playerPos = { x: 150, z: -8 };
  const vertexMin = Math.min(
    ...solution.projectedPath.map((p) => Math.hypot(p.x - playerPos.x, p.z - playerPos.z)),
  );
  assert.ok(vertexMin > 18, 'precondition: every sampled vertex sits outside the corridor');
  const own = resolveThrowOwnRouteRisk(
    solution, PAYLOAD_POS, PAYLOAD_RADIUS, playerPos, { x: 0, z: 0 }, PILOT_RADIUS,
  );
  assert.ok(own, 'the between-samples crossing must be named');
  assert.equal(own.label, 'YOUR ROUTE');
});

test('clear space, uncertain predictions, and missing geometry all stay silent', () => {
  // Clear space: the tangent runs far from the pilot route.
  assert.equal(resolveThrowOwnRouteRisk(
    CROSSING_SOLUTION, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 0, z: 400 }, { x: 0, z: 0 }, PILOT_RADIUS,
  ), null, 'an own route the tangent never approaches is not a risk');

  // Uncertainty: a degraded or stale prediction promises nothing (same law as the body corridor).
  assert.equal(resolveThrowOwnRouteRisk(
    { ...CROSSING_SOLUTION, degraded: true }, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null, 'degraded confidence is silence, not a warning');
  assert.equal(resolveThrowOwnRouteRisk(
    { ...CROSSING_SOLUTION, decisionStale: true }, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null, 'a stale decision is silence, not a warning');
  assert.equal(resolveThrowOwnRouteRisk(
    { ...CROSSING_SOLUTION, valid: false }, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null, 'an invalid solution is silence, not a warning');

  // Missing geometry: no pilot position or no predicted contact — null, never a guess.
  assert.equal(resolveThrowOwnRouteRisk(
    CROSSING_SOLUTION, null, PAYLOAD_RADIUS, { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null);
  assert.equal(resolveThrowOwnRouteRisk(
    CROSSING_SOLUTION, PAYLOAD_POS, PAYLOAD_RADIUS, null, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null);
  assert.equal(resolveThrowOwnRouteRisk(
    { ...CROSSING_SOLUTION, predicted: null }, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  ), null);
});

test('the read is advisory only: the solution is never mutated and release stays available', () => {
  const solution = {
    valid: true, degraded: false, decisionStale: false,
    predicted: { x: 600, z: 0 }, projectedPath: null,
    timeOfFlight: 6, predictionHorizon: 6,
    onSolution: true,
  };
  const snapshot = JSON.parse(JSON.stringify(solution));
  const own = resolveThrowOwnRouteRisk(
    solution, PAYLOAD_POS, PAYLOAD_RADIUS,
    { x: 300, z: 30 }, { x: 0, z: -10 }, PILOT_RADIUS,
  );
  assert.ok(own, 'the crossing still reads');
  assert.deepEqual(solution, snapshot, 'the advisory must not mutate the solution it reads');
  // Release authority is untouched: the same solution still carries a live intercept.
  assert.equal(solution.onSolution, true, 'no auto-safety: the throw stays available');
});

test('the shipped swept aim-contact still discriminates grazing from tunneling', () => {
  // Guard the foundation the delta composes with: a ray that misses by half a skin stays a miss
  // (no false close approach) even though the sampled endpoints straddle the target line.
  const miss = sweptDiskContact(0, 40, 100, 0, 18, 6);
  assert.equal(miss.hit, false, 'a 40 wu offset pass is not a contact');
  assert.equal(miss.valid, true);
  const hit = sweptDiskContact(120, 10, -100, 0, 18, 6);
  assert.equal(hit.hit, true, 'a closing pass through the 18 wu skin contacts');
  assert.ok(hit.impactTime > 0 && hit.impactTime <= 6, 'the entry time is bounded by the horizon');
});
