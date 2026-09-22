// Wave G10 — zero throttle is silence and a dark engine within a quarter second.
// Full throttle is the loud cue and a grown plume within 120 ms.

import test from 'node:test';
import assert from 'node:assert/strict';

import { stepCueGain, THROTTLE_WINDOWS } from '../src/presentation/throttleAnswer.js';
import {
  createDriveEnvelope,
  integrateDriveEnvelope,
  resolveDriveTarget,
  resolvePlumeShape,
} from '../src/render/thruster/ribbon/driveEnvelope.js';

const DT = 1 / 120;

function stepUntil(run, done, limitS) {
  let t = 0;
  const steps = Math.ceil(limitS / DT) + 2;
  for (let i = 0; i < steps; i++) {
    run(DT);
    t += DT;
    if (done()) return t;
  }
  return t;
}

test('G10 cue gain and plume cross the throttle windows', () => {
  let gain = 0;
  const up = stepUntil(
    (dt) => { gain = stepCueGain(gain, 1, dt).gain; },
    () => gain >= THROTTLE_WINDOWS.loudGain * 0.8,
    THROTTLE_WINDOWS.grownS,
  );
  assert.ok(up <= THROTTLE_WINDOWS.grownS, `loud cue at ${up.toFixed(3)}s`);

  const down = stepUntil(
    (dt) => { gain = stepCueGain(gain, 0, dt).gain; },
    () => gain <= 0.02,
    THROTTLE_WINDOWS.darkS,
  );
  assert.ok(down <= THROTTLE_WINDOWS.darkS, `silence at ${down.toFixed(3)}s`);

  const env = createDriveEnvelope();
  const input = { throttle: 1, speedNorm: 0, boosting: false, dashFired: false, alive: true };
  const full = resolveDriveTarget(1, 0);
  const grown = stepUntil(
    (dt) => { integrateDriveEnvelope(env, input, dt); },
    () => env.spool >= full * THROTTLE_WINDOWS.plumeGrown,
    THROTTLE_WINDOWS.grownS,
  );
  assert.ok(grown <= THROTTLE_WINDOWS.grownS, `grown plume at ${grown.toFixed(3)}s`);

  const shape = {};
  resolvePlumeShape(env, { jetLength: 17, throatRadius: 1.32, spread: 2.6, radiance: 0.85, opacity: 0.055 }, shape);
  assert.ok(shape.jetLength > 8, 'full throttle lengthens the plume');

  input.throttle = 0;
  const dark = stepUntil(
    (dt) => { integrateDriveEnvelope(env, input, dt); },
    () => env.spool <= THROTTLE_WINDOWS.plumeDark,
    THROTTLE_WINDOWS.darkS,
  );
  assert.ok(dark <= THROTTLE_WINDOWS.darkS, `dark engine at ${dark.toFixed(3)}s`);
  resolvePlumeShape(env, { jetLength: 17, throatRadius: 1.32, spread: 2.6, radiance: 0.85, opacity: 0.055 }, shape);
  assert.equal(shape.radiance, 0);
  assert.equal(shape.emitting, false);
  assert.equal(shape.jetLength, 0);
});
