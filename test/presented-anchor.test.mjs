// Sim-anchored presentation (tether cable endpoints, socket-less trail nozzles) used to draw at
// the live entity.pos — the newest completed sim tick — while the hull renders at the fence blend
// one tick behind it. The gap is a sawtooth of alpha × speed/fixedDt (up to a full tick of travel,
// 60 times a second at speed), which reads as the anchor detaching and stabbing through the hull.
// The presented-anchor helpers must land on the hull's exact drawn moment instead, and fall back
// to the live pose whenever the prev→curr span is not continuous (spawns, teleports, statics).
import test from 'node:test';
import assert from 'node:assert/strict';

import { presentedAnchorRot, presentedAnchorXZ } from '../src/render/presentedAnchor.js';
import { writeTetherVisualEndpoints } from '../src/render/vfx.js';

const DT = 1 / 60;

function movingEntity({ x0 = 0, z0 = 0, x1 = 0, z1 = 0, rot0 = 0, rot1 = 0, radius = 10 }) {
  return {
    pos: { x: x1, z: z1 },
    prevPos: { x: x0, z: z0 },
    rot: rot1,
    prevRot: rot0,
    radius,
  };
}

test('presentedAnchorXZ lands on the hull’s drawn moment, not the live sim tick', () => {
  // 191 WU/s of travel across one tick: the live pose is a full tick ahead of the drawn hull.
  const e = movingEntity({ x0: 0, z0: 0, x1: 191 * DT, z1: 0 });
  const out = { x: 0, z: 0 };
  presentedAnchorXZ(e, 0.5, out); // the tick-span midpoint
  assert.ok(Math.abs(out.x - (191 * DT) * 0.5) < 1e-12);
  // alpha 1 (and beyond) presents the live pose: nothing to blend against.
  presentedAnchorXZ(e, 1, out);
  assert.equal(out.x, 191 * DT);
  presentedAnchorXZ(e, 1e-12, out);
  assert.ok(Math.abs(out.x) < 1e-9, 'alpha≈0 presents the previous pose');
});

test('presentedAnchorXZ falls back to the live pose without a continuous span', () => {
  const out = { x: 0, z: 0 };
  // Static rock: prevPos is never snapshotted (the sentinel stays invalid).
  const rock = { pos: { x: 12, z: -8 }, prevPos: { x: -999, z: -999 } };
  presentedAnchorXZ(rock, 0.5, out);
  assert.deepEqual(out, { x: 12, z: -8 });
  // Teleport: a sector jump must present the arriving pose, not a blend across the void.
  const jumper = movingEntity({ x0: 0, z0: 0, x1: 5000, z1: 3000 });
  presentedAnchorXZ(jumper, 0.5, out);
  assert.deepEqual(out, { x: 5000, z: 3000 });
  // Invalid or missing alpha presents the live pose too.
  presentedAnchorXZ(movingEntity({ x1: 3, z1: 4 }), NaN, out);
  assert.deepEqual(out, { x: 3, z: 4 });
  presentedAnchorXZ(null, 0.5, out);
  assert.deepEqual(out, { x: 0, z: 0 });
});

test('presentedAnchorRot blends shortest-path across the tick and falls back cleanly', () => {
  const wrapping = movingEntity({ rot0: 3.1, rot1: -3.1 });
  assert.ok(
    Math.abs(presentedAnchorRot(wrapping, 0.5) - Math.PI) < 1e-9,
    'a heading crossing ±π blends through the wrap, not the long way around',
  );
  const live = movingEntity({ rot1: 0.7 });
  assert.equal(presentedAnchorRot(live, 1), 0.7);
  // Sentinel prevRot (spawn frame) presents the live heading.
  assert.equal(presentedAnchorRot({ rot: 0.4, prevRot: -999 }, 0.5), 0.4);
});

test('tether endpoints present at the drawn hulls’ moment with the render alpha', () => {
  // Player steaming bow-first at half a tick of blend: the cable must leave the NOSE AS DRAWN,
  // not a full tick ahead of it (which stabbed the line through the hull every tick).
  const player = movingEntity({ x0: 0, z0: 0, x1: 3, z1: 0, rot0: 0, rot1: 0, radius: 6 });
  const rock = { pos: { x: 200, z: 0 }, prevPos: { x: -999, z: -999 }, radius: 20 };
  const out = {};
  assert.equal(writeTetherVisualEndpoints(player, rock, false, out, 0.5), true);
  assert.ok(Math.abs(out.ax - (1.5 + 6)) < 1e-9,
    `ship end at the drawn nose (${out.ax}), not the live one`);
  assert.ok(Math.abs(out.az) < 1e-9);
  // Static rock end stays at its live surface (nothing to blend).
  assert.ok(Math.abs(out.bx - (200 - 20 * 0.88)) < 1e-9);
  assert.ok(out.chord > 0);
});

test('a moving remote-tether source and target both blend; degenerates fail closed', () => {
  const tug = movingEntity({ x0: 0, z0: 0, x1: 2, z1: 0, radius: 10 });
  const drone = movingEntity({ x0: 100, z0: 0, x1: 98, z1: 0, radius: 10 });
  const out = {};
  assert.equal(writeTetherVisualEndpoints(tug, drone, true, out, 0.5), true);
  assert.ok(Math.abs(out.ax - (1 + 10 * 0.88)) < 1e-9, 'source surface at the drawn moment');
  assert.ok(Math.abs(out.bx - (99 - 10 * 0.88)) < 1e-9, 'target surface at the drawn moment');
  // Overlapping radii reverse the surface chord: fail closed exactly as before.
  const stacked = writeTetherVisualEndpoints(tug, movingEntity({ x1: 3, z1: 0, radius: 10 }), true, out, 1);
  assert.equal(stacked, false);
  // Missing geometry keeps the historic false contract.
  assert.equal(writeTetherVisualEndpoints(null, drone, true, out, 0.5), false);
});
