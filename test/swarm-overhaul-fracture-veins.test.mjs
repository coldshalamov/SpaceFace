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

// Measured on this branch after the unit-space fix. One strip. Master bar is 29% screen
// and 6% player-hidden; these disks are the local proof, not a player-truth pass.
const FOOTPRINT = [
  { R: 8, worldR: 1.23, frac: 0.0034 },
  { R: 16, worldR: 2.47, frac: 0.0137 },
  { R: 24, worldR: 3.70, frac: 0.0215 },
  { R: 40, worldR: 6.17, frac: 0.0215 },
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
