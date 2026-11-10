import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseCeresPocketApproachAction,
  drivePublicToCeresPoint,
  planCeresThroughlineToolkitReposition,
} from '../scripts/lib/ceresFiveMinuteAcceptance.mjs';

// Recorded in pocket-approach-failure.json, not an invented flight trajectory.
const trace = [
  { tick: 10650, distanceWU: 58.13745857565293, speed: 0.21625410577546755, headingError: -0.12378698674745858 },
  { tick: 10658, distanceWU: 58.12493716000678, speed: 0.04567544688121827, headingError: 0.36251388541051244 },
  { tick: 10696, distanceWU: 58.12259988969595, speed: 0.000028320131924522925, headingError: 0.13763836804999685 },
  { tick: 10816, distanceWU: 43.49410168300295, speed: 0.17511128961135114, headingError: 0.12022916812374174 },
  { tick: 10828, distanceWU: 43.48951055920863, speed: 0.01699774381021033, headingError: 0.1204357966563574 },
];
// Terminal snapshot has position, yaw, velocity and angular velocity; unlike the
// compact tail it permits checking the stopped-yaw guard without inventing data.
const terminal = {
  tick: 10840,
  pos: { x: -9214.7021484375, z: 7379.070983886719 },
  rot: 1.105503697016386,
  vel: { x: 0.0016241823323071003, z: 0.00029039871878921986 },
  speed: 0.0016499392911416325,
  angularVelocity: 0,
};

test('impact-settle actor responds to the recorded nearly stationary headings', async () => {
  const target = planCeresThroughlineToolkitReposition().waypoints[0];
  assert.deepEqual(target.targetPos, { x: -9200, z: 7420 });
  assert.equal(target.arrivalRadiusWU, 23);
  assert.equal(target.minRemainingTicks, 7200);
  const keys = [];
  const player = { id: 1, alive: true, hull: 260, pos: terminal.pos, vel: terminal.vel,
    rot: terminal.rot, angVel: terminal.angularVelocity };
  const state = { tick: 10000, playerId: player.id, entities: new Map([[player.id, player]]) };
  const page = {
    isClosed: () => false,
    locator: () => ({ async waitFor() {}, async focus() {} }),
    // The terminal pose with a synthetic pre-deadline tick tests observer and
    // driver wiring; it does not claim the pose occurred before the deadline.
    async evaluate(callback, argument) {
      const hadWindow = Object.hasOwn(globalThis, 'window');
      const previousWindow = globalThis.window;
      globalThis.window = { SF: { state } };
      try { return callback(argument); }
      finally {
        if (hadWindow) globalThis.window = previousWindow;
        else delete globalThis.window;
      }
    },
    keyboard: {
      async press(key) { keys.push(key); throw new Error('recorded sample observed'); },
      async up() {},
      async down() {},
    },
    mouse: { async up() {} },
  };
  await assert.rejects(drivePublicToCeresPoint(page, target, 18033), /recorded sample observed/);
  assert.deepEqual(keys, ['KeyW'], 'the driver should thrust at the synthetic pre-deadline sample');
  keys.length = 0;
  state.tick = terminal.tick;
  await assert.rejects(drivePublicToCeresPoint(page, target, 18033), /exhausted the exact route horizon/);
  assert.deepEqual(keys, [], 'the actual terminal tick is beyond the unchanged reserve and cannot issue input');

  for (const row of trace.filter((item) => item.tick !== 10658)) {
    assert.ok(row.distanceWU * Math.abs(Math.sin(row.headingError)) < target.arrivalRadiusWU / 2);
    assert.equal(chooseCeresPocketApproachAction(row, { arrivalRadiusWU: 23, allowArrivalCone: true }).kind,
      'turn', `tick ${row.tick} lacks recorded angular velocity and must remain fail-closed`);
  }
  const dx = target.targetPos.x - terminal.pos.x;
  const dz = target.targetPos.z - terminal.pos.z;
  const observed = { distanceWU: Math.hypot(dx, dz), headingError: Math.atan2(dz, dx) - terminal.rot,
    speed: terminal.speed, angularVelocity: terminal.angularVelocity };
  assert.equal(chooseCeresPocketApproachAction(observed, {
    arrivalRadiusWU: 23, allowArrivalCone: true,
  }).kind, 'thrust', 'the actual stopped terminal pose is safe to approach rather than turn');
  assert.equal(chooseCeresPocketApproachAction({ ...trace[1], angularVelocity: 0 }, {
    arrivalRadiusWU: 23, allowArrivalCone: true,
  }).kind, 'turn', 'the later larger overshoot still requires correction');
});

test('impact-settle keeps existing safety and stop behavior', () => {
  const opts = { arrivalRadiusWU: 23, allowArrivalCone: true };
  const row = trace[0];
  assert.equal(chooseCeresPocketApproachAction(row, { arrivalRadiusWU: 23 }).kind, 'turn',
    'other waypoints keep their established policy');
  assert.equal(chooseCeresPocketApproachAction({ ...row, speed: 2, angularVelocity: 0 }, opts).kind, 'turn',
    'moving ships do not receive the stationary allowance');
  assert.equal(chooseCeresPocketApproachAction({ ...row, angularVelocity: 0.2 }, opts).kind, 'turn',
    'a rotating hull cannot use the stopped-heading allowance');
  assert.equal(chooseCeresPocketApproachAction({ distanceWU: 24, speed: 55, headingError: 0 }, opts).kind, 'decelerate');
  assert.equal(chooseCeresPocketApproachAction({ distanceWU: 22, speed: 55, headingError: 0.8 }, opts).kind, 'settle');
  assert.equal(chooseCeresPocketApproachAction({ distanceWU: 22, speed: 0.5, headingError: 0.8 }, opts).kind, 'complete');
  assert.equal(chooseCeresPocketApproachAction({ distanceWU: 24, speed: 0, headingError: NaN }, opts).kind, 'invalid');
});
