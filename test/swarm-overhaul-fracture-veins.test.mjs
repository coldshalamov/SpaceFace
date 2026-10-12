// Fracture veins are additive. The harness grades each strip by its world bounding sphere.
// A ribbon authored in world units and then scaled by the body (also entity.radius) covered
// most of the frame: swarm p95 83%, player hidden 14%, versus master 29% / 6%.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAsteroidMotionTracker } from '../src/render/asteroidMotionPresentation.js';

function mount(rockRadius, oreLeft) {
  const tracker = createAsteroidMotionTracker();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4));
  body.scale.setScalar(rockRadius);
  root.add(body);
  root.userData.asteroidInstanceBody = body;
  const entity = {
    id: 601,
    radius: rockRadius,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    hull: oreLeft,
    hullMax: 100,
    data: { oreHP: oreLeft, oreHPMax: 100 },
  };
  tracker.updateAsteroidMotion(entity, root, 2, 1 / 60);
  root.updateMatrixWorld(true);
  return root.getObjectByName('sf-fracture-veins') || null;
}

function maxWorldRadius(rig) {
  const sphere = new THREE.Sphere();
  let maxWorld = 0;
  rig.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    if (sphere.radius > maxWorld) maxWorld = sphere.radius;
  });
  return maxWorld;
}

// Harness camera the footprint table uses: 960×540, fov 50°, standoff max(30, 1.5 R).
// The pre-fix ribbon was authored at ~0.92 R and then scaled by the body again (0.92 R²).
const VW = 960;
const VH = 540;
const FOV = 50 * Math.PI / 180;
const DIAG = Math.hypot(VW, VH);
const UNBOUNDED_PR = DIAG * 0.6;

function frameDisk(worldR, rockR) {
  const dist = Math.max(30, rockR * 1.5);
  const pr = worldR * (VH / 2) / (dist * Math.tan(FOV / 2));
  return { pr, frac: (Math.PI * pr * pr) / (VW * VH) };
}

// The reader stamps each additive sphere's screen AABB onto a 48×27 grid, then
// scores the union. A disk-area estimate understates that stamp.
function harnessUnionFrac(rig, rockR) {
  const dist = Math.max(30, rockR * 1.5);
  const GW = 48;
  const GH = 27;
  const grid = new Uint8Array(GW * GH);
  const sphere = new THREE.Sphere();
  const aspect = VW / VH;
  const tan = Math.tan(FOV / 2);
  rig.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.boundingSphere) return;
    if (!o.material || o.material.opacity < 0.02) return;
    sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    const zCam = dist - sphere.center.z;
    if (zCam <= 0.05) return;
    const viewDist = Math.hypot(sphere.center.x, sphere.center.y, zCam);
    const pr = sphere.radius * (VH / 2) / (Math.max(1e-3, viewDist) * tan);
    if (pr > UNBOUNDED_PR) return;
    const ndcX = sphere.center.x / (zCam * tan * aspect);
    const ndcY = sphere.center.y / (zCam * tan);
    const sx = (ndcX * 0.5 + 0.5) * VW;
    const sy = (-ndcY * 0.5 + 0.5) * VH;
    const x0 = Math.max(0, Math.floor((sx - pr) / VW * GW));
    const x1 = Math.min(GW - 1, Math.floor((sx + pr) / VW * GW));
    const y0 = Math.max(0, Math.floor((sy - pr) / VH * GH));
    const y1 = Math.min(GH - 1, Math.floor((sy + pr) / VH * GH));
    if (x1 < x0 || y1 < y0) return;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) grid[gy * GW + gx] = 1;
    }
  });
  let covered = 0;
  for (let i = 0; i < grid.length; i++) covered += grid[i];
  return covered / grid.length;
}

// Measured after the unit-space crack was shortened to span 0.08. `frac` is one strip's
// disk. `union` is the three strips stamped the way the reader does (48×27 AABB union).
// Master bar is 29% screen and 6% player-hidden. This table is not a player-truth pass.
const FOOTPRINT = [
  { R: 8, worldR: 0.63, frac: 0.0009, union: 0.0108 },
  { R: 16, worldR: 1.26, frac: 0.0036, union: 0.0255 },
  { R: 24, worldR: 1.89, frac: 0.0056, union: 0.0247 },
  { R: 40, worldR: 3.15, frac: 0.0056, union: 0.0247 },
];

test('a worked-rock crack matches the measured footprint table', () => {
  for (const row of FOOTPRINT) {
    const rig = mount(row.R, 20);
    assert.ok(rig, `worked rock R=${row.R} mounts sf-fracture-veins`);
    const strips = [];
    rig.traverse((o) => { if (o.isMesh) strips.push(o); });
    assert.equal(strips.length, 3);
    for (const strip of strips) {
      assert.equal(strip.frustumCulled, true);
      assert.ok(strip.geometry.boundingSphere, 'the harness grades a real sphere');
      assert.equal(strip.material.blending, THREE.AdditiveBlending);
      assert.ok(strip.material.opacity > 0.02, 'opacity must stay visible to the harness');
      assert.ok(strip.material.opacity <= 0.25);
    }
    const worldR = maxWorldRadius(rig);
    assert.ok(Math.abs(worldR - row.worldR) < 0.08, `R=${row.R} world radius ${worldR.toFixed(2)} != ${row.worldR}`);
    assert.ok(worldR < row.R * 0.2, `R=${row.R} vein is no longer a skin patch`);
    const disk = frameDisk(worldR, row.R);
    assert.ok(Math.abs(disk.frac - row.frac) < 0.002, `R=${row.R} frame disk ${(disk.frac * 100).toFixed(2)}% != ${(row.frac * 100).toFixed(2)}%`);
    assert.ok(disk.frac < 0.06, 'one crack stays under the 6% player-hidden bar');
    assert.ok(disk.pr < UNBOUNDED_PR);
    const union = harnessUnionFrac(rig, row.R);
    assert.ok(Math.abs(union - row.union) < 0.004, `R=${row.R} harness union ${(union * 100).toFixed(2)}% != ${(row.union * 100).toFixed(2)}%`);
    assert.ok(union < 0.06, `R=${row.R} three-strip harness union ${(union * 100).toFixed(2)}% of the frame`);
    assert.ok(union < 0.29, `R=${row.R} three-strip harness union exceeds the 29% screen bar`);
    // The double-scaled sphere the #287 run graded (max 188% of the screen).
    const oldWorld = 0.92 * row.R * row.R;
    const oldDisk = frameDisk(oldWorld, row.R);
    assert.ok(oldDisk.pr > UNBOUNDED_PR, `R=${row.R} old sphere should have sheeted the frame`);
    assert.ok(oldDisk.frac > 0.29, `R=${row.R} old disk should exceed the master 29% bar`);
  }
});

test('a fresh rock does not wear fracture veins', () => {
  assert.equal(mount(16, 90), null);
  // fracture = 1 - ore/max. The rig opens only above 0.4, so a 40% chip stays dark.
  assert.equal(mount(16, 60), null);
  assert.ok(mount(16, 59), 'just past the worked threshold the crack mounts');
});
