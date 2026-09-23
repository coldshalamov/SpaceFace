import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';

// "The ship is a body, and it is yours … the picture never lies about where you are."
//   — design/program/DEMO_READINESS_2026-09-20.md §1
//
// Regression for the drawn-hull collapse: the authored flight root arrives at
// hull.scale = entity.radius (shipKit.finalizeShip, designRadius 1). The boundary root
// survives the authored swap while mesh.userData.hull is repointed, so a scale-channel
// base captured from the pre-swap substrate (scale 1) must not be written onto the new
// hull — the drawn hull stays at the body's size.
const NORMALIZED_HULL_LENGTH = 1.72; // partsLibrary Hull targetLength, normalized units

function makeHull(scale) {
  return {
    name: '',
    children: [],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: scale, y: scale, z: scale,
      set(a, b, c) { this.x = a; this.y = b; this.z = c; },
      setScalar(s) { this.x = s; this.y = s; this.z = s; },
    },
    userData: {},
  };
}

function makeEntity(id, radius) {
  return {
    id,
    type: 'ship',
    pos: { x: 0, z: 0 },
    rot: 0,
    vel: { x: 0, z: 0 },
    radius,
    mass: 32,
    hull: 140,
    hullMax: 140,
    shield: 100,
  };
}

function makeBoundary(hull) {
  return {
    name: 'boundary',
    position: { x: 0, z: 0 },
    rotation: { y: 0 },
    userData: { hull },
  };
}

function driveMaterialize(tracker, entity, mesh, startSim, frames = 80) {
  for (let i = 1; i <= frames; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, startSim + i * 0.016, 0.016,
      { playerId: entity.id, entities: new Map([[entity.id, entity]]) });
  }
}

test('authored swap mid-materialize keeps the radius fit (kestrel r14, wasp r14)', () => {
  for (const [label, radius] of [['kestrel', 14], ['wasp', 14]]) {
    const tracker = createShipMicroMotionTracker();
    const entity = makeEntity(1, radius);
    // Pre-swap: the boundary holds the admission substrate — a plain hull stub at scale 1.
    const substrateHull = makeHull(1);
    const mesh = makeBoundary(substrateHull);
    const options = { playerId: 1, entities: new Map([[1, entity]]) };

    tracker.updateCraftMicroMotion(entity, mesh, 0.5, 0.016, options); // scan captures base 1
    tracker.onSpawned({ id: 1, type: 'ship', entity });               // materialize armed at 0.5
    tracker.updateCraftMicroMotion(entity, mesh, 0.516, 0.016, options); // ramp writes onto substrate

    // Authored admission commits: finalizeShip's fit lives on the new hull group.
    const authoredHull = makeHull(radius);
    mesh.userData.hull = authoredHull;

    driveMaterialize(tracker, entity, mesh, 0.516);
    const drawnWu = authoredHull.scale.x * NORMALIZED_HULL_LENGTH;
    const ratio = drawnWu / (2 * radius);
    assert.ok(
      ratio >= 0.7 && ratio <= 1.3,
      `${label}: drawn hull ${drawnWu.toFixed(2)} WU vs body ${2 * radius} WU (ratio ${ratio.toFixed(2)}; scale ${authoredHull.scale.x})`,
    );
  }
});

test('a post-swap scale channel (shield breath) cannot flatten the authored hull', () => {
  const tracker = createShipMicroMotionTracker();
  const entity = makeEntity(7, 16); // hornet-class body
  const substrateHull = makeHull(1);
  const mesh = makeBoundary(substrateHull);
  const options = { playerId: 7, entities: new Map([[7, entity]]) };

  // Substrate scanned at base 1, materialize ramp completes before the swap.
  tracker.updateCraftMicroMotion(entity, mesh, 0.5, 0.016, options);
  tracker.onSpawned({ id: 7, type: 'ship', entity });
  driveMaterialize(tracker, entity, mesh, 0.5);

  const authoredHull = makeHull(16);
  mesh.userData.hull = authoredHull;
  tracker.updateCraftMicroMotion(entity, mesh, 2.4, 0.016, options);

  // Shield edge fires the breath channel — the classic post-swap clobber.
  entity.shield = 0;
  for (let i = 1; i <= 80; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 2.4 + i * 0.016, 0.016, options);
  }
  assert.equal(authoredHull.scale.x, 16, `hull scale stays at radius fit, got ${authoredHull.scale.x}`);
});
