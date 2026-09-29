import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

const scene = new THREE.Scene();
const pool = createAsteroidInstancePool(scene);
const geometry = new THREE.IcosahedronGeometry(1, 2);
const material = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.98 });

function makeRock(id, x, z) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const leaf = new THREE.Mesh(geometry, material);
  leaf.scale.setScalar(10);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = 0;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  scene.add(root);
  assert.equal(registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root), true);
  return root;
}

// View covers ±400 in x at depth; the shadow ortho only covers ±60 around the origin, so
// the east rock is a live view submission that can never write a shadow-map texel.
const viewCamera = new THREE.PerspectiveCamera(90, 4, 0.1, 2000);
viewCamera.position.set(0, 0, 800);
viewCamera.lookAt(0, 0, 0);
const shadowCamera = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 1000);
shadowCamera.position.set(0, 0, 400);
shadowCamera.lookAt(0, 0, 0);

const inner = makeRock(1, 0, 0);      // inside the shadow ortho
const outer = makeRock(2, 350, 0);    // inside the view frustum only

const sync = () => syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera });

const first = sync();
assert.equal(first.submitted, 2, 'union submission keeps both rocks');
assert.ok(first.matrixUploads > 0);
assert.ok(first.shadowMatrixUploads > 0, 'the ortho-covered rock marks the shadow dirty');

const stable = sync();
assert.equal(stable.matrixUploads, 0);
assert.equal(stable.shadowMatrixUploads, 0);

outer.position.x += 8;
const viewOnly = sync();
assert.ok(viewOnly.matrixUploads > 0, 'a moving view-scoped rock still uploads');
assert.equal(viewOnly.shadowMatrixUploads, 0,
  'out-of-ortho uploads must not mark the realtime shadow map dirty');

inner.position.z += 4;
const shadowScoped = sync();
assert.ok(shadowScoped.matrixUploads > 0);
assert.ok(shadowScoped.shadowMatrixUploads > 0,
  'in-ortho uploads still mark the realtime shadow map dirty');

outer.position.x += 8;
const noShadowCamera = syncAsteroidInstancePool(pool, { camera: viewCamera });
assert.ok(noShadowCamera.matrixUploads > 0);
assert.ok(noShadowCamera.shadowMatrixUploads > 0,
  'without a shadow frustum every upload stays shadow-relevant');

const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
assert.match(rendererSource, /result\?\.shadowMatrixUploads \|\| 0\) > 0\) this\._shadowMapDirty = true/,
  'renderer keys realtime shadow refresh on ortho-scoped uploads only');

disposeAsteroidInstancePool(pool);
console.log('asteroid-pool-shadow-scope: ok');
