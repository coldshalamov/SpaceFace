import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  dockTransformForShipBounds,
  visiblePreviewBoundsAtNeutralYaw,
} from '../src/ui/shipPreviewMount.js';

const DOCK_METADATA = {
  previewMount: {
    floorLocalY: -3.44,
    referenceShipSpan: 24.08,
    minimumScale: 0.8,
    maximumScale: 12.5,
    minimumFloorClearance: 0.45,
    maximumFloorClearance: 2,
    floorClearanceHeightRatio: 0.12,
  },
};

test('dock alignment keeps the authored floor below a Kestrel-sized preview', () => {
  const transform = dockTransformForShipBounds({
    min: { x: -12.0556, y: -2.3959, z: -6.072 },
    max: { x: 12.0244, y: 3.6086, z: 6.072 },
  }, DOCK_METADATA, { min: [-26, -4.425, -18] });

  assert.ok(transform);
  assert.equal(transform.scale, 1);
  assert.ok(transform.floorWorldY < -2.3959);
  assert.ok(transform.floorClearance >= 0.45);
  assert.equal(transform.intersectsFloor, false);
});

test('dock alignment scales and lowers the bay for tall medium ships', () => {
  const transform = dockTransformForShipBounds({
    min: { x: -18, y: -6.4, z: -10 },
    max: { x: 18, y: 6.2, z: 10 },
  }, DOCK_METADATA, { min: [-26, -4.425, -18] });

  assert.ok(transform.scale > 1);
  assert.ok(transform.floorWorldY < -6.4);
  assert.equal(transform.intersectsFloor, false);
});

test('dock alignment grows a capital bay while preserving floor separation', () => {
  const transform = dockTransformForShipBounds({
    min: { x: -70, y: -18, z: -30 },
    max: { x: 70, y: 22, z: 30 },
  }, DOCK_METADATA, { min: [-26, -4.425, -18] });

  assert.ok(transform.scale > 5);
  assert.ok(transform.floorWorldY < -18);
  assert.equal(transform.intersectsFloor, false);
});

test('dock alignment falls back to blueprint bounds and rejects malformed ship bounds', () => {
  const fallback = dockTransformForShipBounds({
    min: { x: -8, y: -2, z: -4 },
    max: { x: 8, y: 2, z: 4 },
  }, {}, { min: [-26, -4.425, -18] });
  assert.ok(fallback);
  assert.ok(fallback.floorWorldY < -2);

  assert.equal(dockTransformForShipBounds(null, DOCK_METADATA, null), null);
  assert.equal(dockTransformForShipBounds({
    min: { x: Number.NaN, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
  }, DOCK_METADATA, null), null);
});

test('dock alignment is invariant to preserved turntable yaw', () => {
  const ship = new THREE.Group();
  ship.add(new THREE.Mesh(new THREE.BoxGeometry(30, 6, 10)));
  ship.rotation.y = Math.PI / 2;

  const rotatedBounds = visiblePreviewBoundsAtNeutralYaw(ship);
  assert.equal(ship.rotation.y, Math.PI / 2, 'displayed yaw must be restored after measurement');
  const rotatedTransform = dockTransformForShipBounds(rotatedBounds, DOCK_METADATA);

  ship.rotation.y = 0;
  const neutralBounds = visiblePreviewBoundsAtNeutralYaw(ship);
  const neutralTransform = dockTransformForShipBounds(neutralBounds, DOCK_METADATA);

  assert.deepEqual(rotatedBounds.min.toArray(), neutralBounds.min.toArray());
  assert.deepEqual(rotatedBounds.max.toArray(), neutralBounds.max.toArray());
  assert.deepEqual(rotatedTransform, neutralTransform);
});
