import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShipAuxPool, shouldPresentShieldBubble, syncShipAuxPools } from '../src/render/renderer.js';

assert.equal(shouldPresentShieldBubble(100, 0), false, 'an idle charged shield is not a permanent sphere');
assert.equal(shouldPresentShieldBubble(100, 0.25), true, 'shield impact flash is visible');
assert.equal(shouldPresentShieldBubble(0, 0.25), false, 'a broken shield cannot retain its bubble');

const scene = new THREE.Scene();
const pool = createShipAuxPool(scene);
const initialShieldMesh = pool.shield.mesh;
const initialNavMesh = pool.nav.mesh;
let retiredShieldMeshes = 0;
let retiredNavMeshes = 0;
initialShieldMesh.addEventListener('dispose', () => { retiredShieldMeshes += 1; });
initialNavMesh.addEventListener('dispose', () => { retiredNavMeshes += 1; });

const bubbleGeometry = new THREE.SphereGeometry(1, 8, 6);
const bubbleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color('#5fd0ff') },
    uFlash: { value: 0.25 },
    uBase: { value: 0.22 },
  },
});
const navGeometry = new THREE.SphereGeometry(0.025, 4, 3);
const navMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#88eeff',
  emissiveIntensity: 1.5,
  opacity: 0.8,
});

const entities = [];
const meshes = new Map();
for (let i = 0; i < 40; i++) {
  const root = new THREE.Group();
  root.position.set(i * 3, 0, i * -2);
  const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
  bubble.position.set(0.5, 0, 0.25);
  root.add(bubble);
  root.userData.shieldBubble = bubble;

  const nav = new THREE.InstancedMesh(navGeometry, navMaterial, 2);
  nav.name = 'GLTFKit_Nav_Lights';
  nav.userData.damageRole = 'navLight';
  const transform = new THREE.Object3D();
  transform.position.set(1, 0.2, 0.5);
  transform.updateMatrix();
  nav.setMatrixAt(0, transform.matrix);
  transform.position.z = -0.5;
  transform.updateMatrix();
  nav.setMatrixAt(1, transform.matrix);
  root.add(nav);
  root.updateMatrixWorld(true);

  const entity = { id: i + 1, alive: true, type: 'ship', shield: 100 };
  entities.push(entity);
  meshes.set(entity.id, root);
}
entities.push({ id: 999, alive: true, type: 'asteroid' });

syncShipAuxPools(pool, entities.slice(0, 20), meshes);
assert.equal(pool.shield.mesh.count, 20);
assert.equal(pool.nav.mesh.count, 40);

syncShipAuxPools(pool, entities, meshes);

assert.equal(pool.entityPasses, 1, 'shield and nav submissions share one entity-list pass');
assert.equal(pool.entitiesVisited, entities.length);
assert.equal(pool.shield.mesh.count, 40);
assert.equal(pool.nav.mesh.count, 80);
assert(pool.shield.capacity >= 40);
assert(pool.nav.capacity >= 80);
assert.equal(retiredShieldMeshes, 1, 'shield capacity growth retires its old InstancedMesh');
assert.equal(retiredNavMeshes, 1, 'nav capacity growth retires its old InstancedMesh');
assert.equal(scene.children.includes(initialShieldMesh), false);
assert.equal(scene.children.includes(initialNavMesh), false);

const shieldMatrix = new THREE.Matrix4();
const shieldPosition = new THREE.Vector3();
pool.shield.mesh.getMatrixAt(0, shieldMatrix);
shieldPosition.setFromMatrixPosition(shieldMatrix);
assert.deepEqual(shieldPosition.toArray().map((value) => Number(value.toFixed(3))), [0.5, 0, 0.25],
  'pooled shield keeps the source bubble world transform');
pool.shield.mesh.getMatrixAt(31, shieldMatrix);
shieldPosition.setFromMatrixPosition(shieldMatrix);
assert.deepEqual(shieldPosition.toArray().map((value) => Number(value.toFixed(3))), [93.5, 0, -61.75],
  'mid-pass growth preserves instances written beyond the prior frame count');
assert.equal(meshes.get(1).userData.shieldBubble.visible, false);
assert.equal(meshes.get(1).getObjectByName('GLTFKit_Nav_Lights').visible, false);

const staticVersions = {
  shieldMatrix: pool.shield.mesh.instanceMatrix.version,
  shieldColor: pool.shield.mesh.instanceColor.version,
  shieldFlash: pool.shield.mesh.geometry.getAttribute('instanceFlash').version,
  shieldBase: pool.shield.mesh.geometry.getAttribute('instanceBase').version,
  navMatrix: pool.nav.mesh.instanceMatrix.version,
  navColor: pool.nav.mesh.instanceColor.version,
};
syncShipAuxPools(pool, entities, meshes);
assert.deepEqual({
  shieldMatrix: pool.shield.mesh.instanceMatrix.version,
  shieldColor: pool.shield.mesh.instanceColor.version,
  shieldFlash: pool.shield.mesh.geometry.getAttribute('instanceFlash').version,
  shieldBase: pool.shield.mesh.geometry.getAttribute('instanceBase').version,
  navMatrix: pool.nav.mesh.instanceMatrix.version,
  navColor: pool.nav.mesh.instanceColor.version,
}, staticVersions, 'unchanged auxiliary instances must not re-upload GPU buffers');

bubbleMaterial.uniforms.uFlash.value = 0;
syncShipAuxPools(pool, entities.slice(0, 2), meshes);
assert.equal(pool.shield.mesh.count, 0, 'idle shields do not enter the auxiliary draw pool');
assert.equal(pool.nav.mesh.count, 4);
assert.equal(pool.entityPasses, 1);

syncShipAuxPools(pool, [], meshes);
assert.equal(pool.shield.mesh.count, 0);
assert.equal(pool.nav.mesh.count, 0);
assert.equal(pool.shield.mesh.visible, false);
assert.equal(pool.nav.mesh.visible, false);

pool.shield.mesh.geometry.dispose();
pool.shield.mesh.material.dispose();
pool.shield.mesh.dispose();
pool.nav.mesh.material.dispose();
pool.nav.mesh.dispose();
bubbleGeometry.dispose();
bubbleMaterial.dispose();
navGeometry.dispose();
navMaterial.dispose();

console.log('ship-aux-single-pass-sync: PASS');
