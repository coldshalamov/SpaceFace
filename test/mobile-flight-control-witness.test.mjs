import assert from 'node:assert/strict';
import test from 'node:test';
import { assessMobileFlightControl } from '../scripts/lib/mobileFlightControlWitness.mjs';

const frame = { mode: 'flight', tick: 10, hasPos: true, posX: 0, posZ: 0, speed: 0,
  worldSubmittedFrames: 2, contextLost: false, lastFrameError: null };
test('touch acceptance requires both simulation progress and ship response', () => {
  assert.equal(assessMobileFlightControl(frame, { ...frame, tick: 30 }).passed, false);
  assert.equal(assessMobileFlightControl(frame, { ...frame, posX: 20, speed: 40 }).passed, false);
  const moved = { ...frame, tick: 30, posX: 20, speed: 40 };
  assert.equal(assessMobileFlightControl(frame, moved).passed, false);
  assert.equal(assessMobileFlightControl(frame, { ...moved, worldSubmittedFrames: 4 }).passed, true);
  assert.equal(assessMobileFlightControl({ ...frame, speed: 25 }, { ...moved, worldSubmittedFrames: 4 }).reason,
    'ship-was-already-coasting');
});
test('missing or menu-only pose evidence cannot pass touch acceptance', () => {
  assert.equal(assessMobileFlightControl(null, frame).reason, 'flight-pose-unavailable');
  assert.equal(assessMobileFlightControl(frame, { ...frame, mode: 'menu' }).passed, false);
});
