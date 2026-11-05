// inf-gate-emergence — the far gate answers the crossing.
//
// The player story: the departure gate plays its swell/collapse (inf-gate-departure), but
// jump:arrive only killed that pulse — the gate you emerged FROM played nothing, so the
// crossing's far stage was silent set dressing. Now the arrival gate rebounds: a discharge
// ring beat snapping off the throat (0.5 s), then slower settle rings shedding outward
// (1.2 s) while the swirl eases home — the door you just used says so. The geometric law is
// the sim's own: gates sit at 0.82·worldRadius on the neighbor bearing and the entry point
// lands at 0.78·wr on the same bearing (~140 wu apart), while a drive jump lands at the
// sector origin, far past the emergence radius — no gate, no read, no pretend door.
//
// These tests pin the pure decision layer (resolveGateEmergenceGate / gateEmergenceArm /
// gateEmergenceTickPlan in src/render/gateEmergenceRead.js); the VFX consumer draws exactly
// what they name. infrastructureMotion.js (the gate mesh transform owner) stays untouched.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveGateEmergenceGate,
  gateEmergenceArm,
  gateEmergenceTickPlan,
  GATE_EMERGENCE_RADIUS_WU,
  GATE_EMERGENCE_BATCHES,
  GATE_EMERGENCE_HUE,
  GATE_EMERGENCE_WORMHOLE_HUE,
} from '../src/render/gateEmergenceRead.js';

const ARRIVE = { sectorId: 'sector_b', toPos: { x: 5000, z: 200 } };
const FAR_GATE = { id: 'gate-1', pos: { x: 5140, z: 200 }, wormhole: false }; // 140 wu away
const OTHER_GATE = { id: 'gate-2', pos: { x: 5000, z: -2600 }, wormhole: false };
const WORMHOLE = { id: 'wh-9', pos: { x: 4950, z: 300 }, wormhole: true };

test('the gate you emerged from is the nearest gate inside the emergence radius', () => {
  const hit = resolveGateEmergenceGate(ARRIVE, [OTHER_GATE, FAR_GATE]);
  assert.ok(hit, 'the far gate answers');
  assert.equal(hit.gateId, 'gate-1');
  assert.equal(hit.wormhole, false);
  assert.equal(hit.x, FAR_GATE.pos.x);
  // Beyond the radius, no door: a drive jump emerges in open space.
  assert.equal(resolveGateEmergenceGate(
    { sectorId: 's', toPos: { x: 0, z: 0 } }, [OTHER_GATE]), null,
    'a gate 2600 wu away is not a door you used');
  assert.equal(resolveGateEmergenceGate(ARRIVE, []), null, 'no gates, no read');
  assert.equal(resolveGateEmergenceGate(null, [FAR_GATE]), null, 'no payload, no read');
  assert.equal(resolveGateEmergenceGate(
    { sectorId: 's', toPos: { x: Number.NaN, z: 0 } }, [FAR_GATE]), null,
    'a broken position stays silent');
});

test('the emergence radius really covers the authored spacing and rejects drive emergence', () => {
  // Generated gates sit at 0.82·wr on the bearing; the entry point at 0.78·wr on the same
  // bearing: ~0.04·wr apart. A 3500 wu sector lands 140 wu out — inside 480.
  assert.ok(140 <= GATE_EMERGENCE_RADIUS_WU, 'the authored gate spacing is covered');
  // Drive jumps land at the sector origin; gates at 0.82·wr of even the smallest sector
  // (worldRadius 1200 → 984 wu) sit well past the radius.
  assert.ok(0.82 * 1200 > GATE_EMERGENCE_RADIUS_WU, 'a drive emergence is never a gate read');
});

test('the arm carries the door\'s own voice — ion blue for a gate, violet for a wormhole', () => {
  const arm = gateEmergenceArm(ARRIVE, [FAR_GATE], 88.4);
  assert.ok(arm, 'the arm answers');
  assert.equal(arm.hue, GATE_EMERGENCE_HUE);
  assert.equal(arm.t0, 88.4);
  const wh = gateEmergenceArm(
    { sectorId: 's', toPos: { x: 4900, z: 280 } }, [WORMHOLE], 88.4);
  assert.ok(wh, 'a wormhole mouth within radius is the same kind of door');
  assert.equal(wh.hue, GATE_EMERGENCE_WORMHOLE_HUE, 'the stranger throat shifts violet');
  assert.equal(wh.wormhole, true);
  assert.notEqual(wh.hue, arm.hue, 'the two doors never share a discharge hue');
});

test('the rebound leads and the settle eases — batches thin out over the window', () => {
  const arm = gateEmergenceArm(ARRIVE, [FAR_GATE], 10);
  const early = gateEmergenceTickPlan(arm, 10.0, false, null);
  assert.ok(early, 'the first batch fires at the arm stamp');
  assert.ok(early.radialSpeed > 0, 'rings shed outward');
  // Just inside the next step: the exact boundary is a floor-tie the latch owns.
  const mid = gateEmergenceTickPlan(
    arm, 10 + (early.step + 1) * (arm.windowS / GATE_EMERGENCE_BATCHES) + 1e-4, false, early.step);
  assert.ok(mid, 'the next batch fires on its own step');
  assert.ok(mid.radialSpeed < early.radialSpeed, 'the settle sheds slower than the rebound');
  assert.ok(mid.lifeS > early.lifeS, 'the settle rings linger longer');
  assert.ok(mid.radiusU > early.radiusU, 'the rings run outward across the window');
});

test('the tick latch cannot stack batches, and the window closes honestly', () => {
  const arm = gateEmergenceArm(ARRIVE, [FAR_GATE], 10);
  const first = gateEmergenceTickPlan(arm, 10.05, false, null);
  assert.ok(first);
  assert.equal(gateEmergenceTickPlan(arm, 10.2, false, first.step), null,
    'the same batch step is quiet');
  assert.equal(gateEmergenceTickPlan(arm, 10 + arm.windowS + 0.2, false, null), null,
    'past the window the door is done talking');
  assert.equal(gateEmergenceTickPlan(arm, 10 - 0.5, false, null), null,
    'the read never plays before the arrival');
});

test('reduced motion thins each ring, never silences the rebound', () => {
  const arm = gateEmergenceArm(ARRIVE, [FAR_GATE], 30);
  const full = gateEmergenceTickPlan(arm, 30.01, false, null);
  const thin = gateEmergenceTickPlan(arm, 30.01, true, null);
  assert.ok(full && thin);
  assert.ok(thin.count < full.count, 'reduced motion thins the ring');
  assert.ok(thin.count >= 3, 'the rebound keeps a floor');
  assert.equal(thin.hue, full.hue, 'the hue never changes');
});

test('the read is deterministic per arm — no rng, no wall clock', () => {
  const a = gateEmergenceArm(ARRIVE, [FAR_GATE], 55.5);
  const p1 = gateEmergenceTickPlan(a, 55.52, false, null);
  const p2 = gateEmergenceTickPlan(a, 55.52, false, null);
  assert.deepEqual(p1.angles, p2.angles);
  assert.equal(p1.seed, p2.seed);
  assert.equal(p1.radialSpeed, p2.radialSpeed);
  // A different crossing stamps its own read.
  const later = gateEmergenceArm(ARRIVE, [FAR_GATE], 77.7);
  const p3 = gateEmergenceTickPlan(later, 77.72, false, null);
  assert.notEqual(p1.seed, p3.seed, 'a different crossing builds its own rebound');
});

test('a broken clock degrades deterministically, not to a crash', () => {
  const arm = gateEmergenceArm(ARRIVE, [FAR_GATE], Number.NaN);
  assert.ok(arm, 'the arm still answers with a finite stamp');
  const plan = gateEmergenceTickPlan(arm, 'not-a-clock', false, null);
  assert.equal(plan, null, 'a broken tick clock stays quiet');
});
