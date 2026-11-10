// Row 394 — the contactRecovery path carries real bounds: a set-piece hit costs the
// rival ≥2 s of capped-pace rejoin and the window can never run past 6 s. Pure-driver
// fixtures (no physics) pin both edges deterministically; the end-to-end shove leg is
// al-race-1-contested-line-4242's real-collision test.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RACING_PERSONALITIES, createRacingDriver, racingDriverIntent,
  beginRacingContactRecovery } from '../src/ai/racingDriver.js';

const DT = 1 / 60;
const GATES = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 400, z: 0 }),
  Object.freeze({ x: 800, z: 0 }),
]);

function shipAt(x, z, vx = 40, vz = 0) {
  return {
    id: 'racer', type: 'ship', alive: true, radius: 18, mass: 20, rot: 0, angVel: 0,
    pos: { x, z }, vel: { x: vx, z: vz }, data: { shipDefId: 'ship_kestrel' },
  };
}

function miraDriver() {
  return createRacingDriver(RACING_PERSONALITIES.find((row) => row.id === 'mira'), 'expert');
}

function driveTick(driver, entity, tick) {
  return racingDriverIntent(driver, {
    entity, params: { nextGate: 1, lap: 0, gateRadiusWU: 80 }, gates: GATES,
    nearby: [], dt: DT, now: tick * DT,
  });
}

test('floor: a clean rejoin still pays at least 2 s of recovery before closing', () => {
  const driver = miraDriver();
  const body = shipAt(300, 0); // on the gates[0]→gates[1] leg, velocity aligned down-leg
  beginRacingContactRecovery(driver, { gateIndex: 1, now: 0, tick: 0 });
  // Twelve straight aligned ticks would have closed the run at 0.2 s — the floor holds
  // the rejoin discipline (and its capped pace) open until the hit has cost ≥2 s.
  for (let t = 0; t < 120; t++) {
    driveTick(driver, body, t);
    assert.ok(driver.contactRecovery, `recovery still open at t=${(t * DT).toFixed(3)}s`);
  }
  driveTick(driver, body, 120);
  assert.equal(driver.contactRecovery, null, 'recovery closes at the 2 s floor once settled');
  const done = driver.lastContactRecovery;
  assert.ok(done, 'the closed run is filed');
  assert.equal(done.recoveredAtS - done.enteredAtS, 2, 'the hit cost exactly the 2 s floor');
  assert.ok(done.alignedTicks >= 12, 'the settle condition still held at close');
  assert.ok(!done.expired, 'a settled close is not an expiry');
});

test('ceiling: a bounce that never re-settles expires at 6 s and the rival races on', () => {
  const driver = miraDriver();
  const body = shipAt(300, 400, 0, 0); // parked far off the leg — never aligned
  beginRacingContactRecovery(driver, { gateIndex: 1, now: 0, tick: 0 });
  for (let t = 0; t < 360; t++) {
    driveTick(driver, body, t);
    assert.ok(driver.contactRecovery, `recovery still open at t=${(t * DT).toFixed(3)}s`);
  }
  driveTick(driver, body, 360);
  assert.equal(driver.contactRecovery, null, 'the window expires at 6 s');
  const done = driver.lastContactRecovery;
  assert.ok(done, 'the expired run is filed');
  assert.equal(done.recoveredAtS - done.enteredAtS, 6, 'the rejoin is bounded at 6 s');
  assert.equal(done.expired, true, 'an unsettled close is marked expired');
  // The expiry releases the craft to ordinary racing intent the very next tick —
  // it steers at the next gate under its own power, never teleported back.
  const intent = driveTick(driver, body, 361);
  assert.ok(intent && intent.brake === false, 'normal race intent resumes after expiry');
});

test('bounds hold on accumulated dt when no sim clock is passed', () => {
  const driver = miraDriver();
  const body = shipAt(300, 0);
  beginRacingContactRecovery(driver, { gateIndex: 1, now: 0, tick: 0 });
  const tick = () => racingDriverIntent(driver, {
    entity: body, params: { nextGate: 1, lap: 0, gateRadiusWU: 80 }, gates: GATES,
    nearby: [], dt: DT,
  });
  for (let t = 0; t < 120; t++) { tick(); assert.ok(driver.contactRecovery); }
  tick();
  assert.equal(driver.contactRecovery, null, 'dt accumulation still enforces the 2 s floor');
  // And the ceiling: a second run that never aligns expires by the same measure.
  const driver2 = miraDriver();
  const off = shipAt(300, 400, 0, 0);
  beginRacingContactRecovery(driver2, { gateIndex: 1, now: 0, tick: 0 });
  const tick2 = () => racingDriverIntent(driver2, {
    entity: off, params: { nextGate: 1, lap: 0, gateRadiusWU: 80 }, gates: GATES,
    nearby: [], dt: DT,
  });
  for (let t = 0; t < 360; t++) { tick2(); assert.ok(driver2.contactRecovery); }
  tick2();
  assert.equal(driver2.contactRecovery, null, 'dt accumulation still enforces the 6 s ceiling');
});

test('drifting off the line resets the settle — the floor is total cost, not first touch', () => {
  const driver = miraDriver();
  const on = shipAt(300, 0), off = shipAt(300, 400, 0, 0);
  beginRacingContactRecovery(driver, { gateIndex: 1, now: 0, tick: 0 });
  // Aligned for 30 ticks, then knocked off the leg until the 2 s floor has already
  // passed: the settle count restarts, and the run cannot close until twelve straight
  // aligned ticks land even though the floor is behind it.
  for (let t = 0; t < 30; t++) driveTick(driver, on, t);
  for (let t = 30; t < 125; t++) {
    driveTick(driver, off, t);
    assert.equal(driver.contactRecovery.alignedTicks, 0, 'off-line ticks reset the settle');
  }
  for (let t = 125; t < 136; t++) {
    driveTick(driver, on, t);
    assert.ok(driver.contactRecovery, `past the floor but settle still accumulating at t=${t}`);
  }
  driveTick(driver, on, 136); // twelfth straight aligned tick, past the floor
  assert.equal(driver.contactRecovery, null, 'the run closes once re-settled past the floor');
  const done = driver.lastContactRecovery;
  const dur = done.recoveredAtS - done.enteredAtS;
  assert.ok(dur >= 2, `total cost still ≥2 s (got ${dur})`);
  assert.ok(dur <= 6, `and bounded at ≤6 s (got ${dur})`);
});
