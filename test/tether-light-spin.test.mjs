import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORBIT_LINE_YAW_LOCK,
  orbitSwingThrottleScale,
  stepAnchorRelativeOrbitAssist,
} from '../src/core/flight/orbitAssist.js';

test('light-target swing governor uses the actual ship arm instead of a minimum mass share', () => {
  const radius = 90;
  const ceiling = ORBIT_LINE_YAW_LOCK.absoluteYawCap;
  const trackableRate = ceiling * ORBIT_LINE_YAW_LOCK.governorMargin;
  for (const armShare of [0.001, 0.01, 0.04, 0.5, 1]) {
    const commandedSpeed = 200;
    const scale = orbitSwingThrottleScale({
      yawCeiling: ceiling, radius, armShare, tangentialSpeed: 80,
    }, commandedSpeed);
    assert.ok(commandedSpeed * scale / (radius * armShare) <= trackableRate + 1e-9,
      `ship arm ${armShare}: forward command must remain trackable by yaw`);
  }
});

test('countersteering without forward thrust retains manual yaw even on a fast light-target swing', () => {
  for (const direction of [-1, 1]) {
    const input = { throttle: 0, strafe: 0.4, turn: -direction, boost: false, brake: false };
    const result = stepAnchorRelativeOrbitAssist({
      dt: 1 / 60,
      host: { pos: { x: 90, z: 0 }, vel: { x: 0, z: direction * 30 }, rot: direction * Math.PI / 2, mass: 40 },
      anchor: { pos: { x: 0, z: 0 }, vel: { x: 0, z: -direction * 420 }, mass: 0.5 },
      tether: { active: true, targetId: 'anchor', restLength: 90, phase: 'loaded' },
      flightIntent: { forward: 0, lateral: -direction },
      input,
      profile: { maxYawRate: 2.646 },
    });
    assert.equal(result.active, false, 'manual yaw takes ownership when the spin chord is released');
    assert.deepEqual(result.input, input);
  }
});

test('a sustained keyboard spin around a very light body stays on the tangent in real tether physics', async () => {
  const { runScenario } = await import('../scripts/lib/masslineControlLab.mjs');
  for (const direction of [-1, 1]) {
    const run = await runScenario({
      seed: 47, ticks: 1800, lineLength: 90, entrySpeed: 80,
      anchorMass: 0.5, productionOrbitAssist: true, productionOrbitDirection: direction,
      initialOrbitHeadingOffsetRad: 0,
    });
    assert.equal(run.live.sg02Ready, true);
    assert.equal(run.live.attachmentActiveAtEnd, true);
    const settled = run.trace.slice(600);
    const worstHeading = Math.max(...settled.map((sample) => Math.abs(sample.orbitHeadingError)));
    assert.ok(worstHeading < Math.PI / 12,
      `${direction}: modest tangent trim must hold the light-body swing within 15 degrees`);
    assert.ok(settled.every((sample) => !sample.orbitSaturated), 'the swing must fit inside yaw authority');
    assert.ok(Math.abs(settled.at(-1).tangentialSpeed) > 80, 'the repaired assist still builds a physical spin');
  }
});
