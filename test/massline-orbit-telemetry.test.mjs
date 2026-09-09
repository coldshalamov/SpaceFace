// Contract tests for the pure massline orbit/load/release telemetry kernel (packet T01).
//
// These characterize INVARIANTS (sign conventions, rotational symmetry, time-step independence,
// band ordering, monotonicity, fail-closed behaviour, shape parity) rather than asserting that any
// particular tuning magnitude "feels good". Every threshold in the module is a named parameter with
// a documented default; where a test needs a specific band it passes the parameter explicitly.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MASSLINE_ORBIT_DEFAULTS,
  MASSLINE_ORBIT_REASONS,
  observeMasslineOrbit,
  safeObservation,
} from '../src/combat/masslineOrbitTelemetry.js';

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const HOST_MASS = 100;
const TARGET_MASS = 1000;
const REDUCED_MASS = (HOST_MASS * TARGET_MASS) / (HOST_MASS + TARGET_MASS);

/** Rotate an {x,z} pair by `a` radians in the XZ plane. */
function rot(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
}

function body(pos, vel, mass) {
  return { pos: { x: pos.x, z: pos.z }, vel: { x: vel.x, z: vel.z }, mass };
}

/**
 * Canonical circular-orbit fixture: target parked at the origin, host at (+d, 0) moving purely
 * tangentially at `speed`. restLength is solved so the spring tension exactly equals the
 * centripetal demand -- i.e. a genuinely balanced orbit, tensionBalance == 0.
 *
 * `speed` sign selects the orbit direction: +z motion gives orbitSign +1, -z gives -1.
 */
function circularFixture(speed, overrides = {}) {
  const distance = 100;
  const stiffness = MASSLINE_ORBIT_DEFAULTS.lineStiffness;
  const demand = (REDUCED_MASS * speed * speed) / distance;
  const restLength = distance - demand / stiffness;
  return {
    host: body({ x: distance, z: 0 }, { x: 0, z: speed }, HOST_MASS),
    target: body({ x: 0, z: 0 }, { x: 0, z: 0 }, TARGET_MASS),
    opts: { restLength, breakTension: 4000, ...overrides },
    distance,
    demand,
  };
}

/** Host at (+100,0), target at origin, both static except the host's given velocity. */
function linearFixture(hostVel, opts = {}) {
  return {
    host: body({ x: 100, z: 0 }, hostVel, HOST_MASS),
    target: body({ x: 0, z: 0 }, { x: 0, z: 0 }, TARGET_MASS),
    opts: { restLength: 80, ...opts },
  };
}

/** Sorted dotted leaf-key paths, for shape-parity assertions. */
function keyPaths(obj, prefix = '') {
  const out = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object') out.push(...keyPaths(value, path));
    else out.push(path);
  }
  return out.sort();
}

/** Assert no NaN/Infinity anywhere in the result tree. */
function assertAllFinite(obj, prefix = '') {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object') assertAllFinite(value, path);
    else if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${path} must be finite, got ${value}`);
    }
  }
}

function close(actual, expected, eps, message) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${message || 'value'}: expected ${expected} +/- ${eps}, got ${actual}`,
  );
}

/**
 * Build opts producing an exact loadRatio at distance 100. Pins lineStiffness and breakTension
 * explicitly so the computed restLength stays correct even when merged over a fixture that
 * overrides either of them.
 */
function optsForLoadRatio(ratio, extra = {}) {
  const { lineStiffness, breakTension } = MASSLINE_ORBIT_DEFAULTS;
  const stretch = (ratio * breakTension) / lineStiffness;
  return { restLength: 100 - stretch, lineStiffness, breakTension, ...extra };
}

// ---------------------------------------------------------------------------------------------
// fixture: circular orbit, positive orbit sign
// ---------------------------------------------------------------------------------------------

test('circular orbit (positive orbit sign) reads as a balanced, stable swing', () => {
  const f = circularFixture(40);
  const obs = observeMasslineOrbit(f.host, f.target, f.opts);

  assert.equal(obs.ok, true);
  assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NOMINAL);
  assertAllFinite(obs);

  close(obs.distance, 100, 1e-9, 'distance');
  close(obs.radialSpeed, 0, 1e-9, 'radialSpeed');
  close(obs.tangentialSpeed, 40, 1e-9, 'tangentialSpeed');
  assert.equal(obs.orbitSign, 1);
  close(obs.angularRate, 0.4, 1e-9, 'angularRate');
  close(obs.angularSpeed, 0.4, 1e-9, 'angularSpeed');
  close(obs.tangentQuality, 1, 1e-9, 'tangentQuality');

  // The line pulls exactly as hard as the orbit needs.
  close(obs.reducedMass, REDUCED_MASS, 1e-9, 'reducedMass');
  close(obs.centripetalDemand, f.demand, 1e-9, 'centripetalDemand');
  close(obs.tension, f.demand, 1e-9, 'tension');
  close(obs.tensionBalance, 0, 1e-9, 'tensionBalance');
  assert.equal(obs.massKnown, true);
  assert.equal(obs.stableOrbit.inWindow, true);
  close(obs.stableOrbit.score, 1, 1e-9, 'stableOrbit.score');

  // tangentDirection points along the actual travel; it is a unit vector.
  close(Math.hypot(obs.tangentDirection.x, obs.tangentDirection.z), 1, 1e-9, '|tangentDirection|');
  // ...and it is orthogonal to the line.
  close(
    obs.tangentDirection.x * obs.lineUnit.x + obs.tangentDirection.z * obs.lineUnit.z,
    0, 1e-9, 'tangentDirection . lineUnit',
  );

  // Cut-now release keeps the host's current velocity.
  close(obs.release.vector.x, 0, 1e-9, 'release.vector.x');
  close(obs.release.vector.z, 40, 1e-9, 'release.vector.z');
  close(obs.release.exitSpeed, 40, 1e-9, 'release.exitSpeed');
  assert.ok(obs.release.peakSpeed >= obs.release.exitSpeed - 1e-9, 'peakSpeed >= exitSpeed');
});

// ---------------------------------------------------------------------------------------------
// fixture: circular orbit, negative orbit sign
// ---------------------------------------------------------------------------------------------

test('circular orbit (negative orbit sign) mirrors the positive case exactly', () => {
  const pos = observeMasslineOrbit(...Object.values(pick(circularFixture(40))));
  const neg = observeMasslineOrbit(...Object.values(pick(circularFixture(-40))));

  assert.equal(pos.orbitSign, 1);
  assert.equal(neg.orbitSign, -1);

  // Reversing the orbit direction flips the signed reads and leaves every magnitude untouched.
  close(neg.tangentialSpeed, -pos.tangentialSpeed, 1e-9, 'tangentialSpeed mirrors');
  close(neg.angularRate, -pos.angularRate, 1e-9, 'angularRate mirrors');
  close(neg.angularSpeed, pos.angularSpeed, 1e-9, 'angularSpeed is unsigned');
  close(neg.distance, pos.distance, 1e-9, 'distance unchanged');
  close(neg.tension, pos.tension, 1e-9, 'tension unchanged');
  close(neg.loadRatio, pos.loadRatio, 1e-9, 'loadRatio unchanged');
  close(neg.tensionBalance, pos.tensionBalance, 1e-9, 'tensionBalance unchanged');
  close(neg.tangentQuality, pos.tangentQuality, 1e-9, 'tangentQuality unchanged');
  assert.equal(neg.loadBand, pos.loadBand);
  assert.equal(neg.stableOrbit.inWindow, pos.stableOrbit.inWindow);

  // tangentDirection points the opposite way around the anchor.
  close(neg.tangentDirection.x, -pos.tangentDirection.x, 1e-9, 'tangentDirection.x mirrors');
  close(neg.tangentDirection.z, -pos.tangentDirection.z, 1e-9, 'tangentDirection.z mirrors');
});

function pick(f) {
  return { host: f.host, target: f.target, opts: f.opts };
}

// ---------------------------------------------------------------------------------------------
// fixtures: radial approach / radial departure (pins the sign convention)
// ---------------------------------------------------------------------------------------------

test('radial approach reports POSITIVE radialSpeed and no orbit', () => {
  const f = linearFixture({ x: -40, z: 0 });
  const obs = observeMasslineOrbit(f.host, f.target, f.opts);

  assert.equal(obs.ok, true);
  assertAllFinite(obs);
  // Host at +x moving toward the origin-anchored target: closing.
  assert.ok(obs.radialSpeed > 0, `closing must be positive, got ${obs.radialSpeed}`);
  close(obs.radialSpeed, 40, 1e-9, 'radialSpeed');

  close(obs.tangentialSpeed, 0, 1e-12, 'tangentialSpeed');
  assert.equal(obs.orbitSign, 0);
  assert.deepEqual(obs.tangentDirection, { x: 0, z: 0 });
  close(obs.angularRate, 0, 1e-12, 'angularRate');
  close(obs.tangentQuality, 0, 1e-12, 'tangentQuality');

  // No tangential motion => no centripetal demand => the 0/0 guard must hold.
  close(obs.centripetalDemand, 0, 1e-12, 'centripetalDemand');
  assert.equal(obs.tensionBalance, 0, 'tensionBalance is defined 0, not NaN/Infinity');
  assert.equal(obs.stableOrbit.inWindow, false, 'a radial pass is never a stable orbit');
  assert.equal(obs.stableOrbit.score, 0);

  // A purely radial release converts nothing.
  assert.equal(obs.release.score, 0);
  assert.equal(obs.release.classification, 'messy');
  assert.equal(obs.release.advised, false);
});

test('radial departure reports NEGATIVE radialSpeed, exactly negating the approach', () => {
  const approach = linearFixture({ x: -40, z: 0 });
  const departure = linearFixture({ x: 40, z: 0 });
  const a = observeMasslineOrbit(approach.host, approach.target, approach.opts);
  const d = observeMasslineOrbit(departure.host, departure.target, departure.opts);

  assertAllFinite(d);
  assert.ok(d.radialSpeed < 0, `opening must be negative, got ${d.radialSpeed}`);
  close(d.radialSpeed, -a.radialSpeed, 1e-9, 'departure negates approach');

  // Everything non-radial is identical between the two.
  close(d.tangentialSpeed, a.tangentialSpeed, 1e-12, 'tangentialSpeed');
  close(d.distance, a.distance, 1e-12, 'distance');
  close(d.loadRatio, a.loadRatio, 1e-12, 'loadRatio');
  assert.equal(d.loadBand, a.loadBand);
  assert.equal(d.orbitSign, 0);
  assert.equal(d.tensionBalance, 0);
  assert.equal(d.stableOrbit.inWindow, false);
});

// ---------------------------------------------------------------------------------------------
// fixture: zero distance
// ---------------------------------------------------------------------------------------------

test('zero distance fails closed with a defined reason and full shape parity', () => {
  const host = body({ x: 25, z: -12 }, { x: 5, z: 9 }, HOST_MASS);
  const target = body({ x: 25, z: -12 }, { x: 0, z: 0 }, TARGET_MASS);
  const obs = observeMasslineOrbit(host, target, { restLength: 50 });

  assert.equal(obs.ok, false);
  assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.DEGENERATE_DISTANCE);
  assertAllFinite(obs);
  assert.deepEqual(keyPaths(obs), keyPaths(safeObservation()));
  assert.equal(obs.distance, 0);
  assert.equal(obs.loadBand, 'slack');
  assert.equal(obs.stableOrbit.inWindow, false);
});

test('near-zero distance below the degenerate guard also fails closed', () => {
  const host = body({ x: 0, z: 0 }, { x: 1, z: 1 }, HOST_MASS);
  const target = body({ x: MASSLINE_ORBIT_DEFAULTS.degenerateDistance / 2, z: 0 }, { x: 0, z: 0 }, TARGET_MASS);
  const obs = observeMasslineOrbit(host, target, { restLength: 10 });
  assert.equal(obs.ok, false);
  assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.DEGENERATE_DISTANCE);
});

// ---------------------------------------------------------------------------------------------
// fixture: zero mass
// ---------------------------------------------------------------------------------------------

test('zero mass on BOTH bodies degrades gracefully (the reduced-mass 0/0 guard)', () => {
  const f = circularFixture(40);
  const host = body(f.host.pos, f.host.vel, 0);
  const target = body(f.target.pos, f.target.vel, 0);
  const obs = observeMasslineOrbit(host, target, f.opts);

  assert.equal(obs.ok, true, 'zero mass is finite input: still a usable observation');
  assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.ZERO_MASS);
  assertAllFinite(obs);

  assert.equal(obs.massKnown, false);
  assert.equal(obs.reducedMass, 0);
  assert.equal(obs.centripetalDemand, 0);
  assert.equal(obs.tensionBalance, 0, 'no orbit to balance against => defined 0');
  assert.equal(obs.stableOrbit.inWindow, false);
  assert.equal(obs.stableOrbit.score, 0);

  // Kinematics are unaffected by missing mass data.
  close(obs.distance, 100, 1e-9, 'distance');
  close(obs.tangentialSpeed, 40, 1e-9, 'tangentialSpeed');
  assert.equal(obs.orbitSign, 1);
});

test('zero mass on EITHER body alone still zeroes the reduced mass', () => {
  const f = circularFixture(40);
  for (const [hm, tm] of [[0, TARGET_MASS], [HOST_MASS, 0]]) {
    const obs = observeMasslineOrbit(
      body(f.host.pos, f.host.vel, hm),
      body(f.target.pos, f.target.vel, tm),
      f.opts,
    );
    assert.equal(obs.ok, true);
    assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.ZERO_MASS);
    assert.equal(obs.reducedMass, 0);
    assert.equal(obs.tensionBalance, 0);
    assertAllFinite(obs);
  }
});

test('absent and negative mass follow the same graceful zero-mass path', () => {
  const f = circularFixture(40);
  for (const mass of [undefined, -5]) {
    const obs = observeMasslineOrbit(
      body(f.host.pos, f.host.vel, mass),
      body(f.target.pos, f.target.vel, mass),
      f.opts,
    );
    assert.equal(obs.ok, true, `mass ${mass} must not fail closed`);
    assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.ZERO_MASS);
    assert.equal(obs.massKnown, false);
    assertAllFinite(obs);
  }
});

// ---------------------------------------------------------------------------------------------
// fixture: slack line
// ---------------------------------------------------------------------------------------------

test('slack line carries no tension and can never be a stable orbit', () => {
  const f = circularFixture(40, { restLength: 150 });
  const obs = observeMasslineOrbit(f.host, f.target, f.opts);

  assert.equal(obs.ok, true);
  assertAllFinite(obs);
  assert.equal(obs.loadBand, 'slack');
  assert.equal(obs.stretch, 0);
  close(obs.slackLength, 50, 1e-9, 'slackLength');
  assert.equal(obs.tension, 0, 'a slack line carries no tension');
  assert.equal(obs.loadRatio, 0);
  assert.equal(obs.stableOrbit.inWindow, false, 'slack cannot hold a radius');

  // Kinematics are still observed while slack.
  close(obs.tangentialSpeed, 40, 1e-9, 'tangentialSpeed');
  assert.equal(obs.orbitSign, 1);

  // Releasing a slack line converts nothing (no useful load).
  assert.equal(obs.release.score, 0);
  assert.equal(obs.release.classification, 'messy');
  assert.equal(obs.release.advised, false);
});

test('a line exactly at rest length is slack until it clears slackEpsilon', () => {
  const target = body({ x: 0, z: 0 }, { x: 0, z: 0 }, TARGET_MASS);
  const eps = MASSLINE_ORBIT_DEFAULTS.slackEpsilon;

  const atRest = observeMasslineOrbit(body({ x: 100, z: 0 }, { x: 0, z: 40 }, HOST_MASS), target, { restLength: 100 });
  assert.equal(atRest.loadBand, 'slack');
  assert.equal(atRest.tension, 0);

  const justPast = observeMasslineOrbit(
    body({ x: 100, z: 0 }, { x: 0, z: 40 }, HOST_MASS), target, { restLength: 100 - eps * 2 },
  );
  assert.notEqual(justPast.loadBand, 'slack');
  assert.ok(justPast.tension > 0);
});

// ---------------------------------------------------------------------------------------------
// fixture: overloaded line
// ---------------------------------------------------------------------------------------------

test('overloaded line clamps loadRatio, bands as overload, and closes the stable window', () => {
  // distance 100, restLength 10 => stretch 90 => tension 10800 >> breakTension 6000.
  const f = circularFixture(40, { restLength: 10, breakTension: MASSLINE_ORBIT_DEFAULTS.breakTension });
  const obs = observeMasslineOrbit(f.host, f.target, f.opts);

  assert.equal(obs.ok, true);
  assertAllFinite(obs);
  close(obs.stretch, 90, 1e-9, 'stretch');
  assert.equal(obs.loadRatio, 1, 'loadRatio is clamped to 1');
  assert.equal(obs.loadBand, 'overload');
  assert.ok(obs.tensionBalance > 0, 'an overloaded line over-pulls the orbit');
  assert.equal(obs.stableOrbit.inWindow, false, 'overload is never inside the stable window');

  // Even with perfect tangent quality, overload penalizes the release relative to ideal load.
  const ideal = observeMasslineOrbit(
    f.host, f.target, optsForLoadRatio(MASSLINE_ORBIT_DEFAULTS.releaseUsefulLoad),
  );
  close(ideal.release.score, 1, 1e-9, 'ideal release score');
  assert.equal(ideal.release.classification, 'razor');
  assert.ok(
    obs.release.score < ideal.release.score,
    `overload must score below ideal load: ${obs.release.score} vs ${ideal.release.score}`,
  );
});

// ---------------------------------------------------------------------------------------------
// fixture: NaN input
// ---------------------------------------------------------------------------------------------

const NON_FINITE_MUTATIONS = [
  ['host.pos.x', (h) => { h.pos.x = NaN; }],
  ['host.pos.z', (h) => { h.pos.z = NaN; }],
  ['host.vel.x', (h) => { h.vel.x = NaN; }],
  ['host.vel.z', (h) => { h.vel.z = NaN; }],
  ['host.mass', (h) => { h.mass = NaN; }],
];

const NON_FINITE_TARGET_MUTATIONS = [
  ['target.pos.x', (t) => { t.pos.x = NaN; }],
  ['target.pos.z', (t) => { t.pos.z = NaN; }],
  ['target.vel.x', (t) => { t.vel.x = NaN; }],
  ['target.vel.z', (t) => { t.vel.z = NaN; }],
  ['target.mass', (t) => { t.mass = NaN; }],
];

test('NaN in any host or target field fails closed without propagating', () => {
  for (const [label, mutate] of NON_FINITE_MUTATIONS) {
    const f = circularFixture(40);
    mutate(f.host);
    const obs = observeMasslineOrbit(f.host, f.target, f.opts);
    assert.equal(obs.ok, false, `${label} must fail closed`);
    assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT, label);
    assertAllFinite(obs);
    assert.deepEqual(keyPaths(obs), keyPaths(safeObservation()), label);
  }
  for (const [label, mutate] of NON_FINITE_TARGET_MUTATIONS) {
    const f = circularFixture(40);
    mutate(f.target);
    const obs = observeMasslineOrbit(f.host, f.target, f.opts);
    assert.equal(obs.ok, false, `${label} must fail closed`);
    assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT, label);
    assertAllFinite(obs);
  }
});

test('NaN in restLength, reelIntent, mass overrides, or any tuning parameter fails closed', () => {
  const optionKeys = ['restLength', 'reelIntent', 'hostMass', 'targetMass', ...Object.keys(MASSLINE_ORBIT_DEFAULTS)];
  for (const key of optionKeys) {
    const f = circularFixture(40);
    const obs = observeMasslineOrbit(f.host, f.target, { ...f.opts, [key]: NaN });
    assert.equal(obs.ok, false, `opts.${key} = NaN must fail closed`);
    assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT, `opts.${key}`);
    assertAllFinite(obs);
  }
});

// ---------------------------------------------------------------------------------------------
// fixture: Infinity input
// ---------------------------------------------------------------------------------------------

test('Infinity and -Infinity in any consumed field fail closed', () => {
  for (const bad of [Infinity, -Infinity]) {
    const positions = [
      ['host.pos.x', (f) => { f.host.pos.x = bad; }],
      ['host.vel.z', (f) => { f.host.vel.z = bad; }],
      ['host.mass', (f) => { f.host.mass = bad; }],
      ['target.pos.z', (f) => { f.target.pos.z = bad; }],
      ['target.vel.x', (f) => { f.target.vel.x = bad; }],
      ['target.mass', (f) => { f.target.mass = bad; }],
    ];
    for (const [label, mutate] of positions) {
      const f = circularFixture(40);
      mutate(f);
      const obs = observeMasslineOrbit(f.host, f.target, f.opts);
      assert.equal(obs.ok, false, `${label} = ${bad} must fail closed`);
      assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT, `${label} = ${bad}`);
      assertAllFinite(obs);
    }

    const optionKeys = ['restLength', 'reelIntent', 'hostMass', 'targetMass', 'lineStiffness', 'breakTension'];
    for (const key of optionKeys) {
      const f = circularFixture(40);
      const obs = observeMasslineOrbit(f.host, f.target, { ...f.opts, [key]: bad });
      assert.equal(obs.ok, false, `opts.${key} = ${bad} must fail closed`);
      assert.equal(obs.reason, MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT, `opts.${key} = ${bad}`);
      assertAllFinite(obs);
    }
  }
});

test('missing host / missing target / missing or negative restLength each have a defined reason', () => {
  const f = circularFixture(40);
  assert.equal(observeMasslineOrbit(null, f.target, f.opts).reason, MASSLINE_ORBIT_REASONS.MISSING_HOST);
  assert.equal(observeMasslineOrbit({}, f.target, f.opts).reason, MASSLINE_ORBIT_REASONS.MISSING_HOST);
  assert.equal(observeMasslineOrbit(f.host, null, f.opts).reason, MASSLINE_ORBIT_REASONS.MISSING_TARGET);
  assert.equal(observeMasslineOrbit(f.host, { pos: { x: 0, z: 0 } }, f.opts).reason, MASSLINE_ORBIT_REASONS.MISSING_TARGET);
  assert.equal(observeMasslineOrbit(f.host, f.target, {}).reason, MASSLINE_ORBIT_REASONS.INVALID_REST_LENGTH);
  assert.equal(observeMasslineOrbit(f.host, f.target).reason, MASSLINE_ORBIT_REASONS.INVALID_REST_LENGTH);
  assert.equal(
    observeMasslineOrbit(f.host, f.target, { restLength: -1 }).reason,
    MASSLINE_ORBIT_REASONS.INVALID_REST_LENGTH,
  );
  for (const bad of [null, {}, undefined]) {
    assertAllFinite(observeMasslineOrbit(bad === undefined ? undefined : bad, f.target, f.opts));
  }
});

// ---------------------------------------------------------------------------------------------
// fixture: rotational symmetry
// ---------------------------------------------------------------------------------------------

test('rotating the whole system rotates the vectors and leaves scalars and bands untouched', () => {
  const f = circularFixture(40);
  const base = observeMasslineOrbit(f.host, f.target, f.opts);

  // Angles chosen to cross the atan2 branch cut, which is exactly why the vector comparison below
  // is componentwise rather than on release.exitAngle.
  for (const angle of [0.37, 1.0, Math.PI / 2, 2.5, Math.PI, -2.0, 4.9]) {
    const host = body(rot(f.host.pos, angle), rot(f.host.vel, angle), HOST_MASS);
    const target = body(rot(f.target.pos, angle), rot(f.target.vel, angle), TARGET_MASS);
    const obs = observeMasslineOrbit(host, target, f.opts);
    const at = ` (angle ${angle})`;

    // Rotation-INVARIANT scalars.
    close(obs.distance, base.distance, 1e-9, 'distance' + at);
    close(obs.radialSpeed, base.radialSpeed, 1e-9, 'radialSpeed' + at);
    close(obs.tangentialSpeed, base.tangentialSpeed, 1e-9, 'tangentialSpeed' + at);
    close(obs.angularRate, base.angularRate, 1e-9, 'angularRate' + at);
    close(obs.angularSpeed, base.angularSpeed, 1e-9, 'angularSpeed' + at);
    close(obs.tangentQuality, base.tangentQuality, 1e-9, 'tangentQuality' + at);
    close(obs.tension, base.tension, 1e-9, 'tension' + at);
    close(obs.loadRatio, base.loadRatio, 1e-9, 'loadRatio' + at);
    close(obs.centripetalDemand, base.centripetalDemand, 1e-9, 'centripetalDemand' + at);
    close(obs.tensionBalance, base.tensionBalance, 1e-9, 'tensionBalance' + at);
    close(obs.hostSpeed, base.hostSpeed, 1e-9, 'hostSpeed' + at);
    close(obs.release.exitSpeed, base.release.exitSpeed, 1e-9, 'exitSpeed' + at);
    close(obs.release.peakSpeed, base.release.peakSpeed, 1e-9, 'peakSpeed' + at);
    close(obs.release.score, base.release.score, 1e-9, 'release.score' + at);
    close(obs.stableOrbit.score, base.stableOrbit.score, 1e-9, 'stableOrbit.score' + at);

    // Bands and discrete reads must be EXACTLY rotation-invariant, never drift a tier.
    assert.equal(obs.loadBand, base.loadBand, 'loadBand' + at);
    assert.equal(obs.orbitSign, base.orbitSign, 'orbitSign' + at);
    assert.equal(obs.reelRisk, base.reelRisk, 'reelRisk' + at);
    assert.equal(obs.reelDirection, base.reelDirection, 'reelDirection' + at);
    assert.equal(obs.release.classification, base.release.classification, 'classification' + at);
    assert.equal(obs.release.advised, base.release.advised, 'release.advised' + at);
    assert.equal(obs.stableOrbit.inWindow, base.stableOrbit.inWindow, 'stableOrbit.inWindow' + at);
    assert.equal(obs.massKnown, base.massKnown, 'massKnown' + at);
    assert.equal(obs.reason, base.reason, 'reason' + at);

    // Rotation-COVARIANT vectors: compared componentwise so the atan2 wrap cannot cause a false
    // failure the way `exitAngle + angle` would.
    for (const key of ['lineUnit', 'tangentUnit', 'tangentDirection']) {
      const expected = rot(base[key], angle);
      close(obs[key].x, expected.x, 1e-9, `${key}.x` + at);
      close(obs[key].z, expected.z, 1e-9, `${key}.z` + at);
    }
    const expectedRelease = rot(base.release.vector, angle);
    close(obs.release.vector.x, expectedRelease.x, 1e-9, 'release.vector.x' + at);
    close(obs.release.vector.z, expectedRelease.z, 1e-9, 'release.vector.z' + at);
  }
});

// ---------------------------------------------------------------------------------------------
// fixture: time-step independence
// ---------------------------------------------------------------------------------------------

test('the observation is instantaneous: no dt parameter exists and none can influence it', () => {
  assert.ok(
    !Object.prototype.hasOwnProperty.call(MASSLINE_ORBIT_DEFAULTS, 'dt'),
    'dt must not be a tuning parameter',
  );

  const f = circularFixture(40);
  const reference = observeMasslineOrbit(f.host, f.target, f.opts);

  // Every plausible frame budget, plus a pathological one, plus keys a caller might smuggle in.
  for (const dt of [1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.25, 1, 0]) {
    const obs = observeMasslineOrbit(f.host, f.target, { ...f.opts, dt, deltaTime: dt, elapsed: dt * 100 });
    assert.deepEqual(obs, reference, `dt ${dt} must not change the observation`);
  }
});

test('the same state observed twice is byte-identical (deterministic and pure)', () => {
  const f = circularFixture(40, { reelIntent: -0.8, releaseIntent: true });
  const before = JSON.stringify({ host: f.host, target: f.target, opts: f.opts });

  const a = observeMasslineOrbit(f.host, f.target, f.opts);
  const b = observeMasslineOrbit(f.host, f.target, f.opts);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'repeat calls must be byte-identical');

  assert.equal(
    JSON.stringify({ host: f.host, target: f.target, opts: f.opts }), before,
    'observeMasslineOrbit must not mutate its inputs',
  );
});

// ---------------------------------------------------------------------------------------------
// band ordering, monotonicity, and parameterization
// ---------------------------------------------------------------------------------------------

test('loadRatio rises monotonically with distance and the bands appear in order', () => {
  const target = body({ x: 0, z: 0 }, { x: 0, z: 0 }, TARGET_MASS);
  const opts = { restLength: 50 };
  const seen = [];
  let previous = -1;

  for (let distance = 50; distance <= 130; distance += 1) {
    const obs = observeMasslineOrbit(body({ x: distance, z: 0 }, { x: 0, z: 40 }, HOST_MASS), target, opts);
    assert.equal(obs.ok, true);
    assert.ok(obs.loadRatio >= previous - 1e-12, `loadRatio must not decrease at d=${distance}`);
    previous = obs.loadRatio;
    if (seen[seen.length - 1] !== obs.loadBand) seen.push(obs.loadBand);
  }

  assert.deepEqual(seen, ['slack', 'taut', 'loaded', 'overload'], 'bands must appear in rising order');
});

test('band thresholds are parameters, not baked-in constants', () => {
  const f = circularFixture(40, optsForLoadRatio(0.5));
  const withDefaults = observeMasslineOrbit(f.host, f.target, f.opts);
  assert.equal(withDefaults.loadBand, 'loaded');
  close(withDefaults.loadRatio, 0.5, 1e-9, 'loadRatio');

  const tightened = observeMasslineOrbit(f.host, f.target, { ...f.opts, overloadLoadRatio: 0.4 });
  assert.equal(tightened.loadBand, 'overload', 'lowering overloadLoadRatio must move the band');

  const loosened = observeMasslineOrbit(f.host, f.target, { ...f.opts, loadedLoadRatio: 0.9, overloadLoadRatio: 0.95 });
  assert.equal(loosened.loadBand, 'taut', 'raising loadedLoadRatio must move the band');
});

test('the module reuses the existing 0.75 overload threshold and 0.45/0.75 reel-risk bands', () => {
  // These defaults intentionally mirror tetherGameplay._phaseFor and masslineTelemetry
  // REEL_PUMP_RISK_*. If they ever drift apart, downstream vocabulary alignment silently breaks.
  assert.equal(MASSLINE_ORBIT_DEFAULTS.overloadLoadRatio, 0.75);
  assert.equal(MASSLINE_ORBIT_DEFAULTS.reelRiskMediumLoad, 0.45);
  assert.equal(MASSLINE_ORBIT_DEFAULTS.reelRiskHighLoad, 0.75);
  assert.equal(MASSLINE_ORBIT_DEFAULTS.releaseRazorScore, 0.85);
  assert.equal(MASSLINE_ORBIT_DEFAULTS.releaseCleanScore, 0.65);
  assert.equal(MASSLINE_ORBIT_DEFAULTS.releaseGoodScore, 0.35);
  assert.ok(Object.isFrozen(MASSLINE_ORBIT_DEFAULTS), 'defaults must be frozen');
});

// ---------------------------------------------------------------------------------------------
// reel intent
// ---------------------------------------------------------------------------------------------

test('reel intent sign follows the input contract (negative = reel in) and risk tracks load', () => {
  const f = circularFixture(40);

  const hold = observeMasslineOrbit(f.host, f.target, { ...f.opts, reelIntent: 0 });
  assert.equal(hold.reelDirection, 'hold');
  assert.equal(hold.reelRisk, 'low');

  const out = observeMasslineOrbit(f.host, f.target, { ...f.opts, restLength: 10, reelIntent: 1 });
  assert.equal(out.reelDirection, 'out');
  assert.equal(out.loadBand, 'overload');
  assert.equal(out.reelRisk, 'low', 'paying out never risks a snap');

  const cases = [[0.1, 'low'], [0.5, 'medium'], [0.8, 'high']];
  for (const [ratio, expected] of cases) {
    const obs = observeMasslineOrbit(f.host, f.target, { ...optsForLoadRatio(ratio), reelIntent: -1 });
    assert.equal(obs.reelDirection, 'in');
    assert.equal(obs.reelRisk, expected, `loadRatio ${ratio} reeling in`);
  }

  // Absent reelIntent behaves exactly like an explicit zero.
  const absent = observeMasslineOrbit(f.host, f.target, f.opts);
  assert.deepEqual(absent.reelDirection, hold.reelDirection);
  assert.deepEqual(absent.reelRisk, hold.reelRisk);
});

// ---------------------------------------------------------------------------------------------
// release
// ---------------------------------------------------------------------------------------------

test('releaseIntent is echoed, never measured, and release reads match the arc-preview vocabulary', () => {
  const f = circularFixture(40);
  const quiet = observeMasslineOrbit(f.host, f.target, f.opts);
  const asked = observeMasslineOrbit(f.host, f.target, { ...f.opts, releaseIntent: true });

  assert.equal(quiet.release.requested, false);
  assert.equal(asked.release.requested, true);

  // Intent must not perturb a single measurement.
  const strip = (o) => ({ ...o, release: { ...o.release, requested: null } });
  assert.deepEqual(strip(asked), strip(quiet), 'releaseIntent must not change any measurement');

  // peakSpeed >= exitSpeed by the triangle inequality, on every fixture.
  for (const speed of [0, 5, 40, 250]) {
    const g = circularFixture(speed);
    const obs = observeMasslineOrbit(g.host, g.target, g.opts);
    assert.ok(
      obs.release.peakSpeed >= obs.release.exitSpeed - 1e-9,
      `peakSpeed ${obs.release.peakSpeed} >= exitSpeed ${obs.release.exitSpeed}`,
    );
  }
});

test('release classification bands are ordered and driven by tangent quality and load', () => {
  const target = body({ x: 0, z: 0 }, { x: 0, z: 0 }, TARGET_MASS);
  const opts = optsForLoadRatio(MASSLINE_ORBIT_DEFAULTS.releaseUsefulLoad);

  // Purely tangential at ideal load: the best possible release.
  const razor = observeMasslineOrbit(body({ x: 100, z: 0 }, { x: 0, z: 40 }, HOST_MASS), target, opts);
  assert.equal(razor.release.classification, 'razor');
  assert.equal(razor.release.advised, true);

  // Same load, mostly radial: the swing has nothing to convert.
  const messy = observeMasslineOrbit(body({ x: 100, z: 0 }, { x: -40, z: 2 }, HOST_MASS), target, opts);
  assert.equal(messy.release.classification, 'messy');
  assert.equal(messy.release.advised, false);
  assert.ok(messy.release.score < razor.release.score);

  // Same geometry, no load: nothing to release against.
  const unloaded = observeMasslineOrbit(body({ x: 100, z: 0 }, { x: 0, z: 40 }, HOST_MASS), target, { restLength: 200 });
  assert.equal(unloaded.release.score, 0);
  assert.ok(unloaded.release.score < razor.release.score);
});

// ---------------------------------------------------------------------------------------------
// shape parity
// ---------------------------------------------------------------------------------------------

test('every result path returns the identical key set', () => {
  const f = circularFixture(40);
  const reference = keyPaths(safeObservation());

  const results = [
    observeMasslineOrbit(f.host, f.target, f.opts),
    observeMasslineOrbit(null, f.target, f.opts),
    observeMasslineOrbit(f.host, null, f.opts),
    observeMasslineOrbit(f.host, f.target, {}),
    observeMasslineOrbit(f.host, f.target, { restLength: NaN }),
    observeMasslineOrbit(body(f.host.pos, f.host.vel, 0), body(f.target.pos, f.target.vel, 0), f.opts),
    observeMasslineOrbit(body({ x: 0, z: 0 }, { x: 1, z: 1 }, 10), body({ x: 0, z: 0 }, { x: 0, z: 0 }, 10), { restLength: 5 }),
    observeMasslineOrbit(f.host, f.target, { ...f.opts, restLength: 500 }),
    observeMasslineOrbit(f.host, f.target, { ...f.opts, restLength: 1 }),
  ];

  for (const [index, obs] of results.entries()) {
    assert.deepEqual(keyPaths(obs), reference, `result ${index} shape parity`);
    assertAllFinite(obs);
    assert.equal(typeof obs.ok, 'boolean');
    assert.ok(obs.reason === null || typeof obs.reason === 'string');
  }
});
