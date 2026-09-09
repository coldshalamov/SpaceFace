// Shared input sweep for the Travel Burn regression pin (test/travel-drive.test.mjs).
//
// This is a plain helper module, not a test file: it is imported both by the test and by the
// one-shot generator that froze test/fixtures/travel-drive-kernel-baseline.json from the
// PRE-Travel-Burn kernel. Keeping the sweep in one place is what makes the fixture meaningful —
// if the sweep and the generator drifted, the pin would prove nothing.
//
// The cases deliberately concentrate on the governed families (REACTION, TORCH) and on the
// overspeed corner RC-4 lives in, because that is the code Travel Burn edits. The ungoverned
// families are included so a shape change in makeResult cannot hide in a family nobody swept.

import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 20,
    inertia: 40,
    ...overrides,
  };
}

/** Forward velocity at yaw 0 is +X, so a scalar forward speed is a bare {x, z:0}. */
function forwardVel(speed) {
  return { x: speed, z: 0 };
}

export const SWEEP = Object.freeze([
  // --- REACTION: the family the player starts in -----------------------------------------
  { name: 'reaction/idle', driveId: 'drive_reaction_m', input: {} },
  { name: 'reaction/full-throttle-from-rest', driveId: 'drive_reaction_m', input: { throttle: 1 } },
  { name: 'reaction/half-throttle-cruising', driveId: 'drive_reaction_m', input: { throttle: 0.5 }, body: { vel: forwardVel(80) } },
  // Below cap: the servo must still saturate at full thruster authority.
  { name: 'reaction/throttle-below-cap', driveId: 'drive_reaction_m', input: { throttle: 1 }, body: { vel: forwardVel(120) } },
  // RC-4's exact corner. combatSpeed 195 × boostSpeedMult 1.55 = 302.25; 420 is well above it,
  // so the pre-change kernel commands real reverse thrust here.
  { name: 'reaction/boost-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1, boost: true }, body: { vel: forwardVel(420) } },
  { name: 'reaction/unboosted-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1 }, body: { vel: forwardVel(420) } },
  { name: 'reaction/boost-just-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1, boost: true }, body: { vel: forwardVel(310) } },
  { name: 'reaction/earned-momentum-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1, physicsEarnedMomentum: true }, body: { vel: forwardVel(420) } },
  { name: 'reaction/brake-from-speed', driveId: 'drive_reaction_m', input: { throttle: 0, brake: true }, body: { vel: forwardVel(220) } },
  { name: 'reaction/drift-mode-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1, boost: true, assistMode: 'drift' }, body: { vel: forwardVel(420) } },
  { name: 'reaction/newtonian-above-cap', driveId: 'drive_reaction_m', input: { throttle: 1, boost: true, assistMode: 'newtonian' }, body: { vel: forwardVel(420) } },
  { name: 'reaction/turn-and-strafe', driveId: 'drive_reaction_m', input: { throttle: 0.7, strafe: -0.6, turn: 0.9 }, body: { vel: { x: 60, z: -12 }, angVel: 0.4, rot: 0.6 } },
  { name: 'reaction/large-hull-above-cap', driveId: 'drive_reaction_l', input: { throttle: 1, boost: true }, body: { vel: forwardVel(330), mass: 90, inertia: 260 } },
  { name: 'reaction/small-hull-boost', driveId: 'drive_reaction_s', input: { throttle: 1, boost: true }, body: { vel: forwardVel(360), mass: 12, inertia: 20 } },

  // --- TORCH: the other governed family, and the one with a spool runtime ------------------
  { name: 'torch/spool-up', driveId: 'drive_torch_l', input: { throttle: 1 }, ticks: 40 },
  // combatSpeed 320 × boostSpeedMult 1.4 = 448.
  { name: 'torch/boost-above-cap', driveId: 'drive_torch_l', input: { throttle: 1, boost: true }, body: { vel: forwardVel(600) }, ticks: 40 },
  { name: 'torch/unboosted-above-cap', driveId: 'drive_torch_l', input: { throttle: 1 }, body: { vel: forwardVel(600) }, ticks: 40 },

  // --- Ungoverned families: shape guards --------------------------------------------------
  { name: 'gravimetric/throttle', driveId: 'drive_gravimetric_m', input: { throttle: 1, boost: true }, body: { vel: forwardVel(140) } },
  { name: 'pulse-plate/charging', driveId: 'drive_pulse_plate_m', input: { boost: true }, ticks: 30 },
  { name: 'pulse-plate/release', driveId: 'drive_pulse_plate_m', input: { boost: false, boostReleased: true }, runtime: { chargeS: 1.4 } },
  { name: 'sail/deployed', driveId: 'drive_field_sail_m', input: { throttle: 1 }, environment: { fieldStrength: 1.4 }, ticks: 20 },
  { name: 'environmental-drag', driveId: 'drive_reaction_m', input: { throttle: 1 }, body: { vel: forwardVel(180) }, environment: { particulateDensity: 8 } },
  { name: 'zero-dt', driveId: 'drive_reaction_m', input: { throttle: 1 }, dt: 0 },
]);

/**
 * Run one sweep case and return the raw kernel result. The body is NOT integrated between ticks:
 * every tick sees the same physical situation and only the drive's own runtime advances, so the
 * fixture stays sensitive to the governor while remaining immune to integrator drift.
 */
export function runCase(testCase) {
  const profile = PROPULSION_PROFILES[testCase.driveId];
  if (!profile) throw new Error(`unknown driveId ${testCase.driveId}`);
  let runtime = { ...createPropulsionRuntime(profile), ...(testCase.runtime || {}) };
  const dt = testCase.dt === undefined ? DT : testCase.dt;
  const ticks = Math.max(1, testCase.ticks || 1);
  let result = null;
  for (let i = 0; i < ticks; i += 1) {
    result = stepPropulsion({
      dt,
      body: body(testCase.body || {}),
      input: { assistMode: 'assisted', ...(testCase.input || {}) },
      profile,
      runtime,
      environment: testCase.environment || {},
    });
    runtime = result.runtime;
  }
  return result;
}

/** JSON round-trip with non-finite numbers made comparable (profiles carry Infinity speed limits). */
export function normalizeResult(result) {
  return JSON.parse(JSON.stringify(result, (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return value;
  }));
}
