import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convexHullXZ,
  radialContour,
  triangleSurfaceRadialContour,
  transformProjectedPoint,
} from '../scripts/lib/assetCollisionOverlay.mjs';

test('projected GLB vertices honor column-major node transforms before fitting', () => {
  // glTF column-major matrix: quarter-turn about Y, then translate by (4, 2, 7).
  const quarterTurnY = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 4, 2, 7, 1];
  const transformed = transformProjectedPoint({ x: 3, y: 5, z: 2 }, quarterTurnY, 2, [-1, 0, 3]);
  assert.deepEqual(transformed, { x: 11, y: 14, z: 11 });
});

test('render envelope is the deterministic convex hull of projected vertices', () => {
  const hull = convexHullXZ([
    { x: 0, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 2, z: 0 }, { x: 0, z: -2 },
  ]);
  assert.deepEqual(hull, [
    { x: -2, z: 0 }, { x: 0, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 2 },
  ]);
});

test('triangle-surface slice fills radial bins missed by sparse LOD vertices', () => {
  const outline = [{ x: -2, z: 0 }, { x: 0, z: -1 }, { x: 2, z: 0 }, { x: 0, z: 1 }];
  const lower = outline.map(point => ({ ...point, y: -1 }));
  const upper = outline.map(point => ({ ...point, y: 1 }));
  const triangles = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    triangles.push([lower[index], lower[next], upper[next]], [lower[index], upper[next], upper[index]]);
  }
  const sparseVertexRadii = radialContour([...lower, ...upper]).radii;
  const surface = triangleSurfaceRadialContour([...lower, ...upper], triangles);

  assert.ok(sparseVertexRadii.filter(radius => radius > 0).length < 8,
    'vertex-only sampling should expose the sparse-bin failure this fixture represents');
  assert.equal(surface.sliceY, 0);
  assert.equal(surface.segmentCount, 8);
  assert.ok(surface.radii.every(radius => radius > 0), 'every ray should intersect the continuous diamond slice');
  assert.ok(Math.max(...surface.radii) <= 2 + 1e-8);
});
