import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

test('Lantern Cyst rootlets share only within one creature and retire once', async () => {
  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  const makeEntity = () => ({ data: { strainId: 'veil_glass',
    ecology: { speciesId: 'lantern_cyst', driveState: 'drift' } } });
  const a = makeEntity(), b = makeEntity();
  const first = buildFaunaMesh(a), other = buildFaunaMesh(b);
  const firstMaterials = new Set(first.children.map(child => child.material));
  const otherMaterials = new Set(other.children.map(child => child.material));
  assert.equal(firstMaterials.size, 3);
  assert.equal(otherMaterials.size, 3);
  assert.ok([...firstMaterials].every(material => !otherMaterials.has(material)));
  assert.equal(first.children[0].material.transparent, true, 'the sac stays translucent');
  assert.equal(first.children[0].material.opacity, 0.55);
  const rootlets = first.children.slice(2);
  assert.equal(rootlets.length, 5);
  assert.ok(rootlets.every(mesh => mesh.material === rootlets[0].material));
  assert.equal(rootlets[0].material.map, skins.tissue.baseColor);
  assert.equal(rootlets[0].material.normalMap, skins.tissue.normal);

  const otherBefore = other.children.map(child => child.material.emissiveIntensity);
  for (const [drive, time, options] of [
    ['charge', 0.7, {}], ['flee', 1.1, {}], ['drift', 1.6, {}],
    ['charge', 2.2, { reducedMotion: true, reducedFlash: true }],
  ]) {
    a.data.ecology.driveState = drive;
    first.userData.updateAuthoredMotion(a, time, options);
    assert.deepEqual(other.children.map(child => child.material.emissiveIntensity), otherBefore);
  }

  const disposed = new Map([...firstMaterials].map(material => [material, 0]));
  for (const material of firstMaterials) material.addEventListener('dispose', () => disposed.set(material, disposed.get(material) + 1));
  let otherDisposals = 0, geometryDisposals = 0, textureDisposals = 0;
  for (const material of otherMaterials) material.addEventListener('dispose', () => otherDisposals++);
  const sharedGeometry = rootlets[0].geometry;
  assert.equal(sharedGeometry, other.children[2].geometry);
  const geometryListener = () => geometryDisposals++;
  const textureListener = () => textureDisposals++;
  sharedGeometry.addEventListener('dispose', geometryListener);
  skins.tissue.baseColor.addEventListener('dispose', textureListener);
  skins.tissue.normal.addEventListener('dispose', textureListener);
  try {
    first.traverse(node => disposeObjectNode(node));
    assert.deepEqual([...disposed.values()], [1, 1, 1]);
    assert.equal(otherDisposals, 0);
    assert.equal(geometryDisposals, 0);
    assert.equal(textureDisposals, 0);
    other.userData.updateAuthoredMotion(b, 3, {});
    assert.ok(other.children.every(child => Number.isFinite(child.material.emissiveIntensity)));
    other.traverse(node => disposeObjectNode(node));
    assert.equal(otherDisposals, 3);
    assert.equal(geometryDisposals, 0);
    assert.equal(textureDisposals, 0);
  } finally {
    sharedGeometry.removeEventListener('dispose', geometryListener);
    skins.tissue.baseColor.removeEventListener('dispose', textureListener);
    skins.tissue.normal.removeEventListener('dispose', textureListener);
  }
});
