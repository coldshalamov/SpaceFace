// NXI-039 — the combined force readout preserves the sign of the resolved contribution.
//
// ALREADY TRUE at the owner: `computeActuatorDemand` (src/core/flight/flightTelemetry.js)
// projects the caller-published applied-acceleration vector — the resolved contribution the
// step owns — into SIGNED ship-local forward/lateral, then splits the sign into the
// non-negative nozzle channels (main/reverse, starboard/port). Nothing in the module reads
// field presence or rendered positions, so a well sitting on the hull cannot flip the
// displayed net: a net push +x is projected forward, never shown as a pull.
//
// The exact opposed-field case: a well drags aft (−x) while a repulsor shoves bow (+x) and
// the parent's summed contribution is a NET PUSH. The readout must display that net — it
// must not grab the well's direction just because a well is present.
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';

const PROFILE = { family: 'reaction', mainAccel: 40, reverseAccel: 22, strafeAccel: 18, maxBrakeAccel: 40 };

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0, // nose points +x
    angVel: 0,
    mass: 20,
    inertia: 40,
    radius: 6,
    ...overrides,
  };
}

function readout(telemetry, overrides = {}) {
  return computeFlightTelemetry({
    body: body(overrides),
    profile: PROFILE,
    control: { telemetry },
  });
}

test('a resolved net push forward displays as forward demand while an opposing field is present', () => {
  // Opposed contributors the way the parent resolves them: well −12x + repulsor +20x = net +8x.
  // The readout consumes the resolved +8, not either contributor's sign.
  const wellAx = -12, repulsorAx = 20;
  const resolved = { x: wellAx + repulsorAx, z: 0 };
  const telemetry = readout({ acceleration: resolved });
  const a = telemetry.actuators;
  assert.ok(resolved.x > 0, 'the resolved contribution is a net push');
  assert.ok(a.forward > 0, `net push must read forward, got ${a.forward}`);
  assert.ok(a.main > 0, 'the bow push lights the main-demand channel');
  assert.equal(a.reverse, 0, 'a net push must never display as a pull');
  assert.equal(a.port, 0);
  assert.equal(a.starboard, 0);
  // The published vector itself passes through signed — no magnitude collapse.
  assert.equal(telemetry.acceleration.x, 8);
  assert.equal(telemetry.acceleration.z, 0);
});

test('a resolved net pull displays as a pull — the sign survives in both directions', () => {
  const telemetry = readout({ acceleration: { x: -8, z: 0 } });
  const a = telemetry.actuators;
  assert.ok(a.forward < 0, `net pull must read aft, got ${a.forward}`);
  assert.ok(a.reverse > 0, 'the aft push lights the retro channel');
  assert.equal(a.main, 0, 'a net pull must never display as a push');
});

test('a resolved lateral net keeps its side — starboard push is never shown as port', () => {
  const telemetry = readout({ acceleration: { x: 0, z: 6 } }); // rot 0: +z is starboard
  const a = telemetry.actuators;
  assert.ok(a.lateral > 0);
  assert.ok(a.starboard > 0);
  assert.equal(a.port, 0);
});

test('contributor identity survives where the publication already carries it', () => {
  // The kernel publishes manual/assist provenance beside the resolved acceleration. The
  // readout keeps those rows — an assist counter-thrust reads as assist, not mystery force.
  const telemetry = readout({
    acceleration: { x: 8, z: 0 },
    manualLocal: { forward: 40, lateral: 0 },
    assistLocal: { forward: -4, lateral: 0 },
    assistReason: 'neutral-counterthrust',
  });
  const a = telemetry.actuators;
  assert.equal(a.manual.forward, 40, 'the pilot contribution keeps its own row');
  assert.equal(a.assist.forward, -4, 'the assist contribution keeps its signed row');
  assert.equal(a.assist.reason, 'neutral-counterthrust', 'the contributor name is preserved');
  assert.ok(a.forward > 0, 'the resolved net still reads forward');
});

test('a neighboring truth: opposed fields that cancel display a quiet zero', () => {
  // Equal opposing fields may cancel to zero — the readout shows the accepted net (0),
  // not a pull guessed from field presence.
  const telemetry = readout({ acceleration: { x: 12 - 12, z: 0 } });
  const a = telemetry.actuators;
  assert.equal(a.forward, 0);
  assert.equal(a.main, 0);
  assert.equal(a.reverse, 0);
});
