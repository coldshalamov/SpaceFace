// PL-178 slingshot hour must not out-vote a brake.
//
// The stream pushes a rider along the lane at rideDvPerS (40 wu/s of delta-v) — the same order as
// the starter hull's own brake authority. When it pushes a hull that is deliberately stopping, the
// two cancel exactly and the hull is pinned at whatever speed it entered with. Measured on the
// Helios approach in DEMO-BERTH-1: the after-throw berth run held 17.5 wu/s for eight straight
// seconds with the flight computer commanding a full brake, crossed the berth at 18 wu/s against a
// 12 wu/s gate, overshot the pocket and fell out of the lane. A pilot's brake owns the ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hullHoldsBrake, laneTOf, laneWidthAt, streamFor, SLINGSHOT_TUNING,
} from '../src/systems/plants/pl178SlingshotHour.js';

function station() {
  return { id: 'helios', type: 'station', alive: true, pos: { x: 1280, z: -420 }, rot: 0, radius: 42,
    data: { stationId: 'station_helios', dockRadius: 90, corridorBearingDeg: 161.8 } };
}

function stateWithInput(input) {
  return { playerId: 7, input };
}

test('a held brake means the hull is not riding the stream', () => {
  assert.equal(hullHoldsBrake(stateWithInput({ brake: true }), { id: 7 }), true);
  assert.equal(hullHoldsBrake(stateWithInput({ brake: false }), { id: 7 }), false);
  assert.equal(hullHoldsBrake(stateWithInput({}), { id: 7 }), false);
});

test('the sim actions block counts as a held brake too', () => {
  // The flight computer writes both the level and the action edge; either is a real stop.
  assert.equal(hullHoldsBrake(stateWithInput({ actions: { brake: true } }), { id: 7 }), true);
});

test('another ship braking does not stop the player riding', () => {
  const state = stateWithInput({ brake: true });
  assert.equal(hullHoldsBrake(state, { id: 99 }), false,
    'only the player hull in the stream is the one whose brake matters');
});

test('missing state or player is not a brake', () => {
  assert.equal(hullHoldsBrake(null, { id: 7 }), false);
  assert.equal(hullHoldsBrake(stateWithInput({ brake: true }), null), false);
});

test('the stream lane geometry still places a rider on it', () => {
  // The gate above must not be masking a broken lane: a hull at the midpoint of the stream is a
  // rider, and one well outside the lane is not.
  const st = station();
  const stream = streamFor(st, 0, 4242);
  const mid = { x: (stream.slip.x + stream.catch.x) / 2, z: (stream.slip.z + stream.catch.z) / 2 };
  const on = laneWidthAt(mid, stream);
  assert.ok(on.w <= SLINGSHOT_TUNING.laneHalfWidthWu, `midpoint is in the lane, w=${on.w.toFixed(1)}`);
  const t = laneTOf(mid, stream);
  assert.ok(t > 0.45 && t < 0.55, `midpoint sits halfway along the stream, t=${t.toFixed(2)}`);
  const perp = { x: -stream.flow.z, z: stream.flow.x };
  const off = laneWidthAt({ x: mid.x + perp.x * 200, z: mid.z + perp.z * 200 }, stream);
  assert.ok(off.w > SLINGSHOT_TUNING.laneHalfWidthWu, `a body 200 wu to the side is not a rider, w=${off.w.toFixed(1)}`);
});
