// Contract + property tests for the deterministic massline physics-control laboratory (PQ-002).
//
// Property tests (per the corrected SF-02 plan): rotational symmetry, fail-closed on NaN, and
// determinism of repeated runs. Plus the acceptance-matrix shape contract and a detuned-controller
// failure case that proves the matrix discriminates good tuning from bad.
//
// Determinism note: a REPEATED run is bit-exact (identical float ops), so it is hash-compared. A
// ROTATED run is a different sequence of float ops — rapier is not rotationally invariant in IEEE754
// and a swinging tether amplifies low-bit drift — so rotational symmetry is asserted at the
// observeMasslineOrbit layer (which IS exactly rotation-invariant), driving the lab's real metric
// pipeline with a synthetic swing and no rapier. That is the crisp discriminator the plan wants.

import test from 'node:test';
import assert from 'node:assert/strict';

import { observeMasslineOrbit } from '../src/combat/masslineOrbitTelemetry.js';
import {
  SIM_DT,
  LAB_DEFAULTS,
  runScenario,
  acceptanceMatrix,
  computeMetrics,
  makeTraceSample,
  sanitizeCommand,
  makePdRadialController,
  makeDetunedController,
  BASELINE_CONTROLLER,
} from '../scripts/lib/masslineControlLab.mjs';

const METRIC_KEYS = [
  'ticks', 'settleTick', 'oscillations', 'maxRadiusError', 'finalRadiusError',
  'maxTension', 'maxDistance', 'meanTangentFraction', 'diverged', 'broke',
  'commandRejected', 'commandClamped', 'pass',
];

// -------------------------------------------------------------------------------------------------
// sanitizeCommand: the fail-closed + clamp contract at the seam.
// -------------------------------------------------------------------------------------------------

test('sanitizeCommand: finite command passes, NaN/Infinity fails closed, oversize clamps', () => {
  assert.equal(sanitizeCommand(null), null, 'no command stays null');

  const ok = sanitizeCommand({ x: 5, z: -7 });
  assert.deepEqual({ x: ok.x, z: ok.z, rejected: ok.rejected, clamped: ok.clamped }, { x: 5, z: -7, rejected: false, clamped: false });

  const missingAxis = sanitizeCommand({ x: 5 });
  assert.equal(missingAxis.rejected, false, 'a missing axis is a legitimate 0, not a rejection');
  assert.equal(missingAxis.z, 0);

  for (const bad of [NaN, Infinity, -Infinity]) {
    for (const key of ['x', 'z', 'torque']) {
      const cmd = sanitizeCommand({ x: 1, z: 1, torque: 0, [key]: bad });
      assert.equal(cmd.rejected, true, `${key}=${bad} must fail closed`);
      assert.equal(cmd.x, 0);
      assert.equal(cmd.z, 0);
      assert.equal(cmd.torque, 0);
    }
  }

  const huge = sanitizeCommand({ x: 1e9, z: 0 });
  assert.equal(huge.clamped, true, 'oversize impulse clamps');
  assert.ok(Math.abs(Math.hypot(huge.x, huge.z) - LAB_DEFAULTS.maxImpulse) < 1e-6, 'clamped to maxImpulse magnitude');

  const hugeTorque = sanitizeCommand({ x: 0, z: 0, torque: 1e9 });
  assert.equal(hugeTorque.clamped, true);
  assert.equal(hugeTorque.torque, LAB_DEFAULTS.maxTorqueImpulse);
});

// -------------------------------------------------------------------------------------------------
// Rotational symmetry — at the observeMasslineOrbit layer, driving the lab's real metric pipeline.
// -------------------------------------------------------------------------------------------------

/** Rotate an {x,z} pair by `a` radians in the XZ plane. */
function rot(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - z * s, z: x * s + z * c };
}

/**
 * A deterministic synthetic swing: host orbits an anchor with a decaying radial oscillation. Radial
 * rate follows a clean decaying sinusoid so oscillation-count and settle-tick are robust (they never
 * hinge on a sample landing exactly on the settle band). Everything is rotated rigidly by `angle`.
 */
function syntheticSwingTrace(angle, restLength = 90) {
  const anchorX = 150, anchorZ = 0;
  const R = 100, A = 34, wr = 0.35, decay = 0.02, tangential = 40;
  const trace = [];
  for (let i = 0; i < 200; i++) {
    const orbit = 0.6 + i * 0.03;
    const radius = R + A * Math.exp(-decay * i) * Math.cos(i * wr);
    const dir = { x: Math.cos(orbit), z: Math.sin(orbit) };           // anchor -> host
    const tan = { x: -Math.sin(orbit), z: Math.cos(orbit) };          // tangential
    const radialRate = -A * wr * Math.exp(-decay * i) * Math.sin(i * wr);
    // Canonical (unrotated) states.
    const hostPos = { x: anchorX + radius * dir.x, z: anchorZ + radius * dir.z };
    const hostVel = { x: tangential * tan.x + radialRate * dir.x, z: tangential * tan.z + radialRate * dir.z };
    const anchorPos = { x: anchorX, z: anchorZ };
    // Rigid rotation of the whole system.
    const hp = rot(hostPos.x, hostPos.z, angle);
    const hv = rot(hostVel.x, hostVel.z, angle);
    const ap = rot(anchorPos.x, anchorPos.z, angle);
    const host = { pos: hp, vel: hv, mass: 16 };
    const anchor = { pos: ap, vel: { x: 0, z: 0 }, mass: 400 };
    const obs = observeMasslineOrbit(host, anchor, {
      restLength, hostMass: host.mass, targetMass: anchor.mass,
      lineStiffness: LAB_DEFAULTS.observeStiffness, breakTension: LAB_DEFAULTS.observeBreakTension,
    });
    trace.push(makeTraceSample(i, obs, restLength, { command: null, tetherActive: true, mt: { active: true, phase: 'loaded' } }));
  }
  return trace;
}

test('rotational symmetry: lab metrics are invariant under a rigid rotation of the whole scenario', () => {
  const base = computeMetrics(syntheticSwingTrace(0), { restLength0: 90 });

  // A non-trivially oscillating, settling swing — otherwise invariance would be vacuous.
  assert.ok(base.oscillations >= 4, `synthetic swing must actually oscillate (got ${base.oscillations})`);
  assert.notEqual(base.settleTick, null, 'synthetic swing must actually settle');

  for (const angle of [0.37, 1.0, Math.PI / 2, 2.5, Math.PI, -2.0, 4.9]) {
    const m = computeMetrics(syntheticSwingTrace(angle), { restLength0: 90 });
    const at = ` (angle ${angle})`;
    // Discrete metrics must be EXACTLY rotation-invariant — never drift a count.
    assert.equal(m.oscillations, base.oscillations, 'oscillations' + at);
    assert.equal(m.settleTick, base.settleTick, 'settleTick' + at);
    assert.equal(m.diverged, base.diverged, 'diverged' + at);
    assert.equal(m.broke, base.broke, 'broke' + at);
    assert.equal(m.pass, base.pass, 'pass' + at);
    assert.equal(m.commandRejected, base.commandRejected, 'commandRejected' + at);
    // Continuous metrics invariant within a tight tolerance (observeMasslineOrbit scalars match to
    // ~1e-9; round6 + the dot-product reassociation leave only sub-1e-3 drift).
    for (const key of ['maxRadiusError', 'finalRadiusError', 'maxTension', 'maxDistance', 'meanTangentFraction']) {
      assert.ok(Math.abs(m[key] - base[key]) <= 1e-3, `${key}${at}: ${m[key]} vs ${base[key]}`);
    }
  }
});

// -------------------------------------------------------------------------------------------------
// Determinism of repeated runs (full rapier sim, bit-exact → hash-compared).
// -------------------------------------------------------------------------------------------------

test('determinism: the same scenario run twice is byte-identical', async () => {
  const opts = { seed: 47, ticks: 150, lineLength: 120, anchorMass: 400, entrySpeed: 30, controller: BASELINE_CONTROLLER };
  const a = await runScenario(opts);
  const b = await runScenario(opts);
  assert.equal(a.traceHash, b.traceHash, 'repeated baseline run must be hash-equal');

  // And with a live controller injecting impulse each tick.
  const cOpts = { ...opts, controller: makePdRadialController({ Kr: 0, Kd: 0.6 }) };
  const c1 = await runScenario(cOpts);
  const c2 = await runScenario(cOpts);
  assert.equal(c1.traceHash, c2.traceHash, 'repeated controlled run must be hash-equal');

  // The lab actually drove the real registered systems, not a kinematic fake.
  assert.equal(a.live.sg02Ready, true, 'SG-02 dynamic authority was ready');
  assert.equal(a.live.tetherAttachedCount, 1, 'a real tether:attached fired from the attachment authority');
  for (const name of ['flight', 'physics', 'tetherGameplay', 'masslineTelemetry', 'masslineLabController']) {
    assert.ok(a.live.systems.includes(name), `registered systems include ${name}`);
  }
  assert.ok(a.trace.some((s) => s.tetherActive && s.mtActive), 'tetherGameplay + masslineTelemetry were live');
});

// -------------------------------------------------------------------------------------------------
// Fail-closed on NaN (full sim): a NaN command has ZERO physical effect and never poisons the trace.
// -------------------------------------------------------------------------------------------------

function physicsProjection(trace) {
  return trace.map((s) => ({ tick: s.tick, d: s.distance, r: s.radialSpeed, t: s.tension, e: s.radiusError }));
}

test('fail-closed: a NaN controller is rejected — identical physics to baseline, no NaN in the trace', async () => {
  const opts = { seed: 47, ticks: 150, lineLength: 120, anchorMass: 400, entrySpeed: 30 };
  const baseline = await runScenario({ ...opts, controller: BASELINE_CONTROLLER });
  const nan = await runScenario({ ...opts, controller: () => ({ x: NaN, z: NaN }) });

  // Same physics: the rejected command changed nothing the physics authority saw.
  assert.deepEqual(physicsProjection(nan.trace), physicsProjection(baseline.trace),
    'a NaN command must produce byte-identical physics to injecting nothing');

  // The controller genuinely ran and was rejected (not silently absent).
  assert.ok(nan.trace.some((s) => s.cmdRejected === true), 'the NaN command was observed and rejected');
  assert.equal(nan.metrics.commandRejected, true);

  // No NaN/Infinity anywhere in the trace.
  for (const sample of nan.trace) {
    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} must be finite, got ${value}`);
    }
  }

  // A finite in-bounds controller, by contrast, DOES change the physics (proves the seam has teeth).
  const damped = await runScenario({ ...opts, controller: makePdRadialController({ Kr: 0, Kd: 0.7 }) });
  assert.notDeepEqual(physicsProjection(damped.trace), physicsProjection(baseline.trace),
    'a live damping controller must actually move the physics');
});

// -------------------------------------------------------------------------------------------------
// Acceptance-matrix shape contract + detuned-controller failure case.
// -------------------------------------------------------------------------------------------------

test('acceptance matrix: documented shape, stable digest, baseline passes; detuned tuning fails', async () => {
  const baseline = await acceptanceMatrix({ seed: 47, ticks: 220 });

  // Shape contract.
  assert.equal(baseline.schema, 'spaceface.masslineControlLab.acceptanceMatrix.v1');
  assert.equal(baseline.controller, 'baseline');
  assert.ok(Array.isArray(baseline.rows) && baseline.rows.length === 3, 'three canonical scenarios');
  assert.match(baseline.digest, /^[0-9a-f]{64}$/, 'digest is a sha256 hex string');
  assert.deepEqual(baseline.summary, { total: 3, pass: 3, fail: 0 }, 'current tether behavior passes the acceptance gate');

  // Rows are stable-ordered by id and carry the full metric surface.
  const ids = baseline.rows.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort(), 'rows are stable-ordered by id');
  for (const row of baseline.rows) {
    assert.ok(row.id && row.params && row.metrics, 'row has id/params/metrics');
    for (const key of METRIC_KEYS) assert.ok(key in row.metrics, `metric ${key} present`);
    assert.equal(typeof row.pass, 'boolean');
    assert.equal(row.live.sg02Ready, true, 'each row drove the real SG-02 authority');
  }

  // Determinism of the matrix digest (wall-clock-free).
  const baselineAgain = await acceptanceMatrix({ seed: 47, ticks: 220 });
  assert.equal(baselineAgain.digest, baseline.digest, 'matrix digest is deterministic across runs');

  // Detuned (positive-feedback) tuning must genuinely FAIL the same acceptance gate.
  const detuned = await acceptanceMatrix({
    seed: 47, ticks: 220,
    controllerFactory: () => makeDetunedController({ Kd: 3 }),
    controllerLabel: 'detuned',
  });
  assert.ok(detuned.summary.fail >= 1, 'a detuned controller must fail at least one acceptance cell');
  const failing = detuned.rows.filter((r) => !r.pass);
  assert.ok(failing.length >= 1);
  assert.ok(failing.every((r) => r.metrics.broke || r.metrics.diverged),
    'detuned failures are real instabilities (broke / diverged), not bookkeeping');

  // A tuning change moves the matrix digest — the property the receipt relies on.
  assert.notEqual(detuned.digest, baseline.digest, 'a tuning change shows up as a matrix delta');
});
