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

test('a worked-rock crack stays a patch on the skin, not a screen sheet', () => {
  const vh = 540;
  const vw = 960;
  const fov = 50 * Math.PI / 180;
  const diag = Math.hypot(vw, vh);
  for (const R of [4, 16, 24, 80]) {
    const rig = mount(R, 20);
    assert.ok(rig, `worked rock R=${R} mounts sf-fracture-veins`);
    const worldR = maxWorldRadius(rig);
    // The old ribbon was ~0.92 R in the geometry and then scaled by R again.
    assert.ok(worldR < R * 0.35, `R=${R} vein world radius ${worldR.toFixed(2)} is a sheet, not a crack`);
    assert.ok(worldR > R * 0.02, `R=${R} vein world radius ${worldR.toFixed(2)} collapsed`);
    const dist = Math.max(30, R * 1.5);
    const pr = worldR * (vh / 2) / (dist * Math.tan(fov / 2));
    assert.ok(pr < diag * 0.6, `R=${R} projects as an unbounded batch (${pr.toFixed(0)} px)`);
    const frac = (Math.PI * pr * pr) / (vw * vh);
    assert.ok(frac < 0.06, `R=${R} one crack covers ${(frac * 100).toFixed(1)}% of the frame`);
  }
});

test('a fresh rock does not wear fracture veins', () => {
  assert.equal(mount(16, 90), null);
});
