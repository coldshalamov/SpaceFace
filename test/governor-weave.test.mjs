// PQ-137.03b — close the assisted-flight weave / lateral manufacture hole.
import assert from 'node:assert/strict';
import test from 'node:test';

import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import {
  createPropulsionRuntime,
  resolveTravelCeiling,
  stepPropulsion,
} from '../src/core/flight/propulsionKernel.js';
import {
  AUTHORED_TRAVEL_CEILINGS,
  scenario as governorIntegrity,
} from '../scripts/lib/bench/scenarios/feel.governor_integrity.mjs';

const DT = 1 / 60;
const VISION = 'Thrusters have a cap; physics-earned speed does not get eaten by the brakes.';
const LONG = { timeout: 180_000 };

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 32,
    inertia: 27,
    radius: 14,
    ...overrides,
  };
}

function advance(b, result, dt = DT) {
  const ax = result.force.x / b.mass;
  const az = result.force.z / b.mass;
  b.vel.x += ax * dt;
  b.vel.z += az * dt;
  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;
  b.angVel += result.torque.y / b.inertia * dt;
  b.rot += b.angVel * dt;
}

function simulate(profile, b, input, ticks) {
  let runtime = createPropulsionRuntime(profile);
  let last = null;
  for (let i = 0; i < ticks; i++) {
    last = stepPropulsion({
      dt: DT,
      body: b,
      input: typeof input === 'function' ? input(i) : input,
      profile,
      runtime,
    });
    runtime = last.runtime;
    advance(b, last);
  }
  return last;
}

function speedOf(b) {
  return Math.hypot(b.vel.x, b.vel.z);
}

test(`kernel weave cannot manufacture planar speed — "${VISION}"`, () => {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const cruise = profile.combatSpeed;
  const b = body();
  simulate(profile, b, (i) => ({
    throttle: 1,
    turn: Math.sin(i / 600) * 0.06,
    assistMode: 'assisted',
  }), 2400);
  assert.ok(
    speedOf(b) <= cruise * 1.02,
    `"${VISION}" — 40 s gentle weave must stay <= 1.02x cruise (got ${speedOf(b).toFixed(2)} vs ${cruise})`,
  );
});

test(`assisted translation publishes one finite control-made bound — "${VISION}"`, () => {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const cruise = profile.combatSpeed;
  const step = (input) => stepPropulsion({
    dt: DT, body: body(), input, profile, runtime: createPropulsionRuntime(profile),
  });

  const forward = step({ throttle: 1, assistMode: 'assisted' });
  const diagonal = step({ throttle: 1, strafe: 1, assistMode: 'assisted' });
  const lateral = step({ strafe: 1, assistMode: 'assisted' });
  const boost = step({ throttle: 1, boost: true, assistMode: 'assisted' });

  assert.equal(diagonal.telemetry.governor.cap, forward.telemetry.governor.cap,
    `"${VISION}" — W+A must request one full-cap vector, not two independent caps`);
  assert.ok(Number.isFinite(forward.maxSpeed) && Math.abs(forward.maxSpeed - cruise) < 1e-9);
  assert.ok(Number.isFinite(lateral.maxSpeed) && Math.abs(lateral.maxSpeed - cruise) < 1e-9);
  assert.ok(Number.isFinite(boost.maxSpeed));
  assert.ok(boost.maxSpeed > cruise, 'boost cap must be the authored raised cap');
  assert.ok(boost.maxSpeed <= cruise * profile.boostSpeedMult + 1e-9);

  const drift = step({ throttle: 1, strafe: 1, assistMode: 'drift' });
  const newtonian = step({ throttle: 1, strafe: 1, assistMode: 'newtonian' });
  const handsOff = step({ assistMode: 'assisted' });
  assert.equal(drift.telemetry.governor, null);
  assert.equal(drift.maxSpeed, Infinity, `"${VISION}" — Drift remains ungoverned`);
  assert.equal(newtonian.telemetry.governor, null);
  assert.equal(newtonian.maxSpeed, Infinity, `"${VISION}" — Newtonian remains ungoverned`);
  assert.equal(handsOff.telemetry.governor, null);
  assert.equal(handsOff.maxSpeed, Infinity, `"${VISION}" — hands-off remains ungoverned`);
});

test('authored travel ceilings are byte-for-byte unchanged', () => {
  for (const [id, authored] of Object.entries(AUTHORED_TRAVEL_CEILINGS)) {
    const profile = PROPULSION_PROFILES[id];
    assert.equal(profile.travelCeiling, authored, `${id} authored travelCeiling moved`);
    assert.equal(resolveTravelCeiling(profile), authored, `${id} resolved travel ceiling moved`);
  }
});

test('feel.governor_integrity is deterministic on seed 4242 and meets every clause', LONG, async () => {
  const a = await governorIntegrity.run(4242);
  const b = await governorIntegrity.run(4242);
  assert.equal(
    JSON.stringify(a.metrics),
    JSON.stringify(b.metrics),
    'fixed seeds or it did not happen — the same seed must produce the same number',
  );
  assert.equal(JSON.stringify(a.eventTrace), JSON.stringify(b.eventTrace));
  assert.equal(a.metrics.realPathProof.backend, 'rapier-dynamic');
  assert.equal(a.metrics.realPathProof.sg02Ready, true);
  assert.equal(a.metrics.realPathProof.flightBackend, 'v3');
  const bars = Array.isArray(a.metrics.bars) ? a.metrics.bars : [];
  assert.ok(bars.length >= 9, 'every acceptance clause must print as a bar');
  for (const row of bars) {
    assert.equal(
      row.met,
      true,
      `"${VISION}" — ${row.label} must meet (got ${row.value} ${row.unit})`,
    );
  }
});

test('feel.governor_integrity meets every clause on seed 8008', LONG, async () => {
  const result = await governorIntegrity.run(8008);
  const bars = Array.isArray(result.metrics.bars) ? result.metrics.bars : [];
  for (const row of bars) {
    assert.equal(
      row.met,
      true,
      `"${VISION}" — ${row.label} must meet on seed 8008 (got ${row.value} ${row.unit})`,
    );
  }
});
