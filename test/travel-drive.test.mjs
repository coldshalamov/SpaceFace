// Travel Burn — the travel-drive axis and governor shaping (atlas W1-A, ADR D5).
//
// These tests pin five things, in the order they matter:
//   1. With the flags off, the kernel is BYTE-IDENTICAL to its pre-Travel-Burn self. This is the
//      determinism contract, not a nicety: `stepPropulsion` runs inside both `check:sim:compare`
//      (legacy `flight`) and `check:sim:v3:compare` (`flightV3`), so any unconditional change —
//      including merely ADDING a result key — moves a frozen golden hash.
//   2. RC-4: held boost above the cap must never command reverse thrust. Since 2026-09-03 the
//      coast floor is unconditional (design/VISION.md earned-speed rule; design/FEEL_CONTRACT.md
//      A1): NO held throttle above the cap commands reverse thrust, boosted or not, flag or no flag.
//      The frozen fixture below was re-frozen for exactly the eight above-cap cases on that date
//      (reaction/{boost,unboosted,boost-just,earned-momentum}-above-cap, large-hull-above-cap,
//      small-hull-boost, torch/{boost,unboosted}-above-cap); every other case is byte-identical.
//   3. Engaged ramps the cap monotonically toward the per-family ceiling and never past it.
//   4. Disengaging spends earned momentum through the existing decay path instead of confiscating it.
//   5. The ceiling is drive identity: a TORCH out-travels a REACTION.
//
// The flags are read at CALL TIME by the kernel, so every test that flips one restores it in a
// `finally` — the module object is shared across the whole `node --test` process and a leaked
// `true` would silently invalidate the byte-identity test above.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  resolveTravelCeiling,
  stepPropulsion,
  createPropulsionRuntime,
  TRAVEL_DRIVE_STATES,
} from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { SWEEP, runCase, normalizeResult } from './travel-drive.sweep.mjs';

const DT = 1 / 60;
const BASELINE = JSON.parse(
  readFileSync(new URL('./fixtures/travel-drive-kernel-baseline.json', import.meta.url), 'utf8')
);

/** Run `fn` with the named travel flags forced, restoring whatever was there before. */
function withFlags(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) previous[key] = TRAVEL_FLAGS[key];
  Object.assign(TRAVEL_FLAGS, overrides);
  try {
    return fn();
  } finally {
    Object.assign(TRAVEL_FLAGS, previous);
  }
}

function body(overrides = {}) {
  return { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 20, inertia: 40, ...overrides };
}

function step(driveId, input, bodyOverrides = {}, runtimeOverrides = null) {
  const profile = PROPULSION_PROFILES[driveId];
  return stepPropulsion({
    dt: DT,
    body: body(bodyOverrides),
    input: { assistMode: 'assisted', ...input },
    profile,
    runtime: { ...createPropulsionRuntime(profile), ...(runtimeOverrides || {}) },
    environment: {},
  });
}

// --- 1. The regression pin -----------------------------------------------------------------

test('flags off: every swept case is byte-identical to the pre-Travel-Burn kernel', () => {
  // The fixture was frozen from the kernel as it stood before this packet, across 23 cases
  // covering all five drive families, both governed overspeed corners, drift/newtonian, braking,
  // environmental drag and dt=0. It cannot be regenerated from the current tree, which is the
  // entire point of committing it.
  assert.equal(BASELINE.length, SWEEP.length, 'fixture and sweep must describe the same cases');

  withFlags({ travelBurn: false, boostNeverBrakes: false, dashMomentum: false }, () => {
    for (const testCase of SWEEP) {
      const expected = BASELINE.find((entry) => entry.name === testCase.name);
      assert.ok(expected, `fixture is missing case ${testCase.name}`);
      assert.deepEqual(
        normalizeResult(runCase(testCase)),
        expected.result,
        `${testCase.name}: kernel output drifted with the travel flags off`
      );
    }
  });
});

test('flags off: an engaged travel drive on the input is ignored completely', () => {
  // Proves the gate is the FLAG and not merely the absence of travel input — a caller that always
  // populates `input.travelDrive` (which the latch owner will) must not perturb the kernel.
  // Compared against the live no-drive result (not the frozen golden) so a combat-speed rescale
  // cannot masquerade as a travel-drive leak.
  withFlags({ travelBurn: false, boostNeverBrakes: false }, () => {
    const bodyBelowCap = { vel: { x: 80, z: 0 } };
    const plain = step('drive_reaction_m', { throttle: 1 }, bodyBelowCap);
    const withDrive = step(
      'drive_reaction_m',
      { throttle: 1, travelDrive: { state: 'engaged', cap: 900, ceiling: 1200 } },
      bodyBelowCap
    );
    assert.deepEqual(
      normalizeResult(withDrive),
      normalizeResult(plain),
      'travelDrive input leaked into the result while travelBurn was off'
    );
  });
});

// --- 2. RC-4: boost must never brake -------------------------------------------------------

test('RC-4: boost above the cap commands forward >= 0 with the flag on', () => {
  withFlags({ boostNeverBrakes: true }, () => {
    // combatSpeed 95 x boostSpeedMult 1.55 = 147.25 WU/s; 420 is well above it.
    const result = step('drive_reaction_m', { throttle: 1, boost: true }, { vel: { x: 420, z: 0 } });
    const forward = result.telemetry.manualLocal.forward;
    assert.ok(
      forward >= 0,
      `held boost above the cap still commanded reverse thrust (forward = ${forward})`
    );
  });
});

test('the coast floor is unconditional: with the flag off, held boost above the cap still coasts', () => {
  // 2026-09-03 earned-speed rule (design/VISION.md): the governor never brakes above the cap, so
  // RC-4's flag no longer selects behaviour. The old negative command (-6.24 = reverseAccel 26 x
  // overspeedBrakeFraction 0.24) must not come back under either flag state.
  withFlags({ boostNeverBrakes: false }, () => {
    const result = step('drive_reaction_m', { throttle: 1, boost: true }, { vel: { x: 420, z: 0 } });
    assert.equal(result.telemetry.manualLocal.forward, 0, 'no reverse thrust above the cap, flag off');
  });
});

test('the UNBOOSTED overspeed also coasts — the governor bounds thrust, never spends earned speed', () => {
  // Below the cap the assisted regime is unchanged (test/flightV3.spec.mjs §12 still settles at
  // combatSpeed); above it, the ship keeps what it earned until the pilot brakes.
  withFlags({ boostNeverBrakes: true }, () => {
    const result = step('drive_reaction_m', { throttle: 1 }, { vel: { x: 420, z: 0 } });
    assert.equal(result.telemetry.manualLocal.forward, 0,
      'unboosted overspeed must coast, not converge on the cap with reverse authority');
    assert.equal(result.telemetry.governor.engaged, true, 'the governor is still the one holding thrust at zero');
  });
});

// --- 3. The drive axis ----------------------------------------------------------------------

test('travel drive states are the four D5 states and nothing else', () => {
  assert.deepEqual([...TRAVEL_DRIVE_STATES], ['off', 'spooling', 'engaged', 'cooldown']);
});

test('Engaged ramps the cap monotonically toward the ceiling and never exceeds it', () => {
  withFlags({ travelBurn: true, boostNeverBrakes: true }, () => {
    const profile = PROPULSION_PROFILES.drive_torch_l;
    const ceiling = resolveTravelCeiling(profile);
    let drive = { state: 'engaged', cap: 0 };
    let previous = -Infinity;
    let runtime = createPropulsionRuntime(profile);

    // 30 simulated seconds: long enough to saturate the ramp for any sane rate.
    for (let i = 0; i < 1800; i += 1) {
      const result = stepPropulsion({
        dt: DT,
        // Hold the ship at a fixed speed: the cap ramp must be driven by the drive, not by the
        // ship happening to accelerate.
        body: body({ vel: { x: 300, z: 0 } }),
        input: { assistMode: 'assisted', throttle: 1, travelDrive: drive },
        profile,
        runtime,
        environment: {},
      });
      runtime = result.runtime;
      const cap = result.telemetry.travelCap;

      assert.ok(Number.isFinite(cap), `tick ${i}: travelCap must be published as a finite number`);
      assert.ok(cap >= previous - 1e-9, `tick ${i}: cap went backwards while Engaged (${previous} -> ${cap})`);
      assert.ok(cap <= ceiling + 1e-9, `tick ${i}: cap ${cap} exceeded the ceiling ${ceiling}`);
      assert.equal(result.telemetry.travelDrive, 'engaged', 'drive state must be published on the result');
      assert.equal(result.telemetry.travelCeiling, ceiling, 'resolved ceiling must be published on the result');

      previous = cap;
      drive = { ...drive, cap };
    }

    assert.ok(
      previous > ceiling * 0.9,
      `a sustained burn should approach the ceiling (reached ${previous} of ${ceiling})`
    );
    assert.ok(previous <= ceiling, 'the ceiling is a ceiling');
  });
});

test('the ramp approaches the ceiling asymptotically rather than hitting a wall', () => {
  // D5: "approached asymptotically through the ramp so it never reads as a wall." Concretely, the
  // last stretch of the climb must be slower than the first — a linear ramp would fail this.
  withFlags({ travelBurn: true }, () => {
    const profile = PROPULSION_PROFILES.drive_torch_l;
    const ceiling = resolveTravelCeiling(profile);
    const advance = (startCap) => {
      const result = stepPropulsion({
        dt: DT,
        body: body({ vel: { x: 300, z: 0 } }),
        input: { assistMode: 'assisted', throttle: 1, travelDrive: { state: 'engaged', cap: startCap } },
        profile,
        runtime: createPropulsionRuntime(profile),
        environment: {},
      });
      return result.telemetry.travelCap - startCap;
    };
    const early = advance(ceiling * 0.2);
    const late = advance(ceiling * 0.97);
    assert.ok(early > 0 && late >= 0, 'the ramp must always move forward while engaged');
    assert.ok(late < early, `ramp did not taper (early ${early} vs late ${late})`);
  });
});

// --- 4. Disengage spends momentum, never confiscates it ------------------------------------

test('disengaging sets physicsEarnedMomentum instead of snapping the velocity down', () => {
  withFlags({ travelBurn: true, boostNeverBrakes: true }, () => {
    // A ship that earned 700 WU/s under burn, the tick the pilot drops the latch.
    const result = step(
      'drive_torch_l',
      { throttle: 1, travelDrive: { state: 'cooldown', cap: 700 } },
      { vel: { x: 700, z: 0 } }
    );
    assert.equal(
      result.telemetry.governor.physicsEarned,
      true,
      'a disengaging burn must tag its overspeed as earned momentum'
    );

    // The confiscation check: without the tag the governor would command the full overspeed brake.
    const confiscated = step('drive_torch_l', { throttle: 1 }, { vel: { x: 700, z: 0 } });
    assert.ok(
      result.telemetry.governor.cap > confiscated.telemetry.governor.cap,
      'the disengage cap should decay from the earned speed, not snap to the ordinary governed cap'
    );
  });
});

// --- 5. The ceiling is ship identity --------------------------------------------------------

test('a TORCH ship reaches a higher travel ceiling than a REACTION ship', () => {
  const torch = resolveTravelCeiling(PROPULSION_PROFILES.drive_torch_l);
  const reaction = resolveTravelCeiling(PROPULSION_PROFILES.drive_reaction_m);
  assert.ok(torch > reaction, `TORCH ${torch} should out-travel REACTION ${reaction}`);
  for (const id of ['drive_reaction_s', 'drive_reaction_m', 'drive_reaction_l']) {
    assert.ok(
      torch > resolveTravelCeiling(PROPULSION_PROFILES[id]),
      `TORCH should out-travel ${id}`
    );
  }
});

test('authored travelCeiling keeps cross-map travel unchanged after the nimble-regime combat rescale', () => {
  // Combat got tighter; travel is UNCHANGED. "If I swing well, slingshot well, fly well, I EARN
  // speed and I KEEP it. Thrusters have a cap; physics-earned speed does not get eaten by the brakes."
  const beforeRescale = {
    drive_reaction_s: 472.5,
    drive_reaction_m: 438.75,
    drive_reaction_l: 382.5,
    drive_gravimetric_s: 252,
    drive_gravimetric_m: 225,
    drive_pulse_plate_m: 715,
    drive_torch_l: 1120,
    drive_field_sail_m: 190,
  };
  for (const [id, ceiling] of Object.entries(beforeRescale)) {
    assert.equal(
      resolveTravelCeiling(PROPULSION_PROFILES[id]),
      ceiling,
      `${id}: travelCeiling must stay ${ceiling} so cross-map travel is unchanged`,
    );
  }
});

test('every resolved ceiling stays inside the engineering bound', () => {
  // The bound is why a ceiling exists at all: per-tick displacement must stay well under
  // collision-geometry scale, and FRAME_REBASE_THRESHOLD_WU (8192) must stay sane.
  for (const [id, profile] of Object.entries(PROPULSION_PROFILES)) {
    const ceiling = resolveTravelCeiling(profile);
    assert.ok(Number.isFinite(ceiling) && ceiling > 0, `${id}: ceiling must be a positive finite number`);
    assert.ok(ceiling / 60 < 8192, `${id}: per-tick displacement ${ceiling / 60} WU must stay far under the rebase threshold`);
    if (Number.isFinite(profile.solverSpeedLimit)) {
      assert.ok(ceiling <= profile.solverSpeedLimit, `${id}: ceiling must respect the drive's own solver speed limit`);
    }
  }
});
