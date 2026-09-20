// INF-055 — map zoom keeps the inspected object under the cursor. The local view used to pin the
// SHIP to screen center, so every wheel step scaled around the player and the station under the
// cursor slid away. anchoredZoomFocus is the pure view-focus contract; these tests verify the
// anchor round-trip across scale changes, the center-anchored (no cursor) path, and the
// player-visibility clamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { anchoredZoomFocus } from '../src/ui/screens/localmap.js';

// Same projection _draw uses: screen = center - (world - focus) * scale.
const project = (world, focus, center, scale) => ({
  x: center.x - (world.x - focus.x) * scale,
  y: center.y - (world.z - focus.z) * scale,
});

test('a station under the cursor stays under the cursor through a zoom step', () => {
  const center = { x: 640, y: 360 };
  const ship = { x: 0, z: 0 };
  const cursor = { x: 820, y: 240 };
  // Ship-centered view at zoom 1: scale 0.1 px/wu. The cursor sits on a station at world:
  const scale1 = 0.1;
  let focus = anchoredZoomFocus(null, ship, center, scale1);
  const station = {
    x: focus.x - (cursor.x - center.x) / scale1,
    z: focus.z - (cursor.y - center.y) / scale1,
  };
  assert.equal(project(station, focus, center, scale1).x, cursor.x);

  // Wheel: the anchor captures (station world, cursor pixel); the ease lands at scale 0.2.
  const anchor = { world: station, screen: cursor };
  const scale2 = 0.2;
  focus = anchoredZoomFocus(anchor, ship, center, scale2);
  const projected = project(station, focus, center, scale2);
  assert.ok(Math.abs(projected.x - cursor.x) < 1e-9, 'x anchor pixel preserved across the scale change');
  assert.ok(Math.abs(projected.y - cursor.y) < 1e-9, 'y anchor pixel preserved across the scale change');

  // ...and at every intermediate eased scale the anchor still holds.
  for (const s of [0.12, 0.14, 0.17, 0.19]) {
    const f = anchoredZoomFocus(anchor, ship, center, s);
    const p = project(station, f, center, s);
    assert.ok(Math.abs(p.x - cursor.x) < 1e-9 && Math.abs(p.y - cursor.y) < 1e-9, `anchor holds mid-ease at ${s}`);
  }
});

test('a viewport resize keeps the anchor at the same pixel; no anchor means the ship', () => {
  const ship = { x: 500, z: -500 };
  const cursor = { x: 700, y: 500 };
  const anchor = { world: { x: 460, z: -540 }, screen: cursor };
  const scale = 0.15;

  const before = project(anchor.world, anchoredZoomFocus(anchor, ship, { x: 640, y: 360 }, scale), { x: 640, y: 360 }, scale);
  const resized = anchoredZoomFocus(anchor, ship, { x: 900, y: 500 }, scale);
  const after = project(anchor.world, resized, { x: 900, y: 500 }, scale);
  assert.ok(Math.abs(after.x - cursor.x) < 1e-9 && Math.abs(after.y - cursor.y) < 1e-9,
    'the inspected point keeps its pixel when the plate resizes under it');
  assert.equal(before.x, cursor.x);

  const idle = anchoredZoomFocus(null, ship, { x: 640, y: 360 }, scale);
  assert.equal(idle.x, ship.x, 'without an anchor the view rests on the ship (center-anchored zoom)');
  assert.equal(idle.z, ship.z);
});

test('the clamp keeps the ship marker on the plate so the view is always recoverable', () => {
  const ship = { x: 0, z: 0 };
  const center = { x: 640, y: 360 };
  const scale = 1; // 1 px per wu: a distant anchor would otherwise shove the ship off-screen
  const anchor = { world: { x: 5000, z: -4000 }, screen: { x: 200, y: 150 } };
  const focus = anchoredZoomFocus(anchor, ship, center, scale, 24);
  const shipScreen = project(ship, focus, center, scale);
  assert.ok(shipScreen.x >= 24 - 1e-9 && shipScreen.x <= center.x * 2 - 24 + 1e-9, 'ship x inside the margin');
  assert.ok(shipScreen.y >= 24 - 1e-9 && shipScreen.y <= center.y * 2 - 24 + 1e-9, 'ship y inside the margin');
});
