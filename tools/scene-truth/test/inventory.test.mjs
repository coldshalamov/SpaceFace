import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN } from '../../../src/render/camera.js';
import { VFX_QUALITY_BURST } from '../lib/constants.mjs';
import { frameHalfExtents, SHIPPING_CHASE_ZOOM } from '../lib/frame.mjs';
import { GATE_COLLIDER, PLACE_COLLIDER, STATION_SIZE } from '../lib/geography.mjs';
import { buildInventory } from '../lib/inventory.mjs';
import { repoPath } from '../lib/root.mjs';

test('shipping camera, burst, and collider numbers match production source', () => {
  const camera = fs.readFileSync(repoPath('src/render/camera.js'), 'utf8');
  assert.match(camera, /const DEFAULT_ZOOM = 144;/);
  assert.match(camera, /Math\.tan\(\(fov \* Math\.PI \/ 180\) \* 0\.5\) \* zoom \* 0\.72/);
  assert.equal(SHIPPING_CHASE_ZOOM, 144);
  assert.ok(CAMERA_ZOOM_MIN <= SHIPPING_CHASE_ZOOM && SHIPPING_CHASE_ZOOM <= CAMERA_ZOOM_MAX);
  const close = frameHalfExtents(CAMERA_ZOOM_MIN);
  const wide = frameHalfExtents(CAMERA_ZOOM_MAX);
  assert.equal(close.legal, true);
  assert.equal(wide.legal, true);
  assert.ok(wide.halfH > close.halfH);

  const vfx = fs.readFileSync(repoPath('src/render/vfx.js'), 'utf8');
  assert.match(vfx, /const QUALITY_BURST = \{ low: 0\.55, med: 0\.8, medium: 0\.8, high: 1\.0 \}/);
  assert.equal(VFX_QUALITY_BURST.low, 0.55);
  assert.equal(VFX_QUALITY_BURST.high, 1);

  const world = fs.readFileSync(repoPath('src/systems/world.js'), 'utf8');
  assert.match(world, /const dockRadius = size === 'L' \? 90 : size === 'S' \? 60 : 72;/);
  assert.match(world, /const collisionRadius = size === 'L' \? 42 : size === 'S' \? 26 : 34;/);
  assert.match(world, /const dockRadius = opts\.wormhole \? 80 : 70;/);
  assert.match(world, /const collisionRadius = opts\.wormhole \? 38 : 32;/);
  assert.match(world, /place_dead_hulk: 42,/);
  assert.match(world, /place_asteroid_rock_a: 15,/);
  assert.equal(STATION_SIZE.L.dockRadius, 90);
  assert.equal(STATION_SIZE.L.collisionRadius, 42);
  assert.equal(GATE_COLLIDER.collisionRadius, 32);
  assert.equal(PLACE_COLLIDER.place_dead_hulk, 42);
  assert.equal(PLACE_COLLIDER.place_asteroid_rock_a, 15);
});

test('required starter package is on disk and GPU fps is not claimed', () => {
  const inventory = buildInventory();
  const kestrel = inventory.requiredShips.find((row) => row.defId === 'ship_kestrel');
  assert.ok(kestrel);
  assert.equal(kestrel.sourceExists, true);
  assert.equal(kestrel.metadataExists, true);
  assert.equal(kestrel.lodLevel, 'lod0');
  assert.equal(kestrel.placeholder, false);
  assert.ok(kestrel.packageKey);
  assert.equal(inventory.gpu.fpsMeasured, false);
  assert.equal(inventory.gpu.webglContextCreated, false);
  assert.ok(inventory.packages.pilotCount > 100);
});
