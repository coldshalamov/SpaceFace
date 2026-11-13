import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMachineMesh } from '../src/render/machineVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

const cases = [
  { kind: 'auditor', indices: [0, 1, 2, 3], flag: 'interrogating' },
  { kind: 'mason', indices: [0, 1], flag: 'working' },
  { kind: 'measure', indices: [0, 1], flag: null },
  { kind: 'sleeping_jury', indices: [0, 1, 2], flag: 'awake' },
];
function materials(root) {
  const result = new Set();
  root.traverse(object => { if (object.material) result.add(object.material); });
  return result;
}

for (const { kind, indices, flag } of cases) {
  test(`${kind} repeated metal parts share only inside their own machine`, async () => {
    const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
    const makeEntity = () => ({ data: { machine: { kind, ...(flag ? { [flag]: false } : {}) } } });
    const a = makeEntity(), b = makeEntity();
    const first = buildMachineMesh(a), other = buildMachineMesh(b);
    const firstMaterials = materials(first), otherMaterials = materials(other);
    const frame = first.children[indices[0]].material;
    assert.ok(indices.every(index => first.children[index].material === frame));
    assert.ok([...firstMaterials].every(material => !otherMaterials.has(material)));
    assert.equal(frame.map, skins.nacre.baseColor);
    assert.equal(frame.normalMap, skins.nacre.normal);
    const before = [...otherMaterials].map(material => material.emissiveIntensity);
    if (flag) {
      a.data.machine[flag] = true;
      for (let i = 0; i < 8; i++) first.userData.updateAuthoredMotion(0.1, a);
      assert.deepEqual([...otherMaterials].map(material => material.emissiveIntensity), before);
    }

    const disposed = new Map([...firstMaterials].map(material => [material, 0]));
    for (const material of firstMaterials) material.addEventListener('dispose', () => disposed.set(material, disposed.get(material) + 1));
    let otherDisposals = 0, geometryDisposals = 0, textureDisposals = 0;
    for (const material of otherMaterials) material.addEventListener('dispose', () => otherDisposals++);
    const geometry = first.children[indices[1]].geometry;
    assert.equal(geometry, other.children[indices[1]].geometry);
    const geometryListener = () => geometryDisposals++;
    const textureListener = () => textureDisposals++;
    geometry.addEventListener('dispose', geometryListener);
    skins.nacre.baseColor.addEventListener('dispose', textureListener);
    skins.nacre.normal.addEventListener('dispose', textureListener);
    try {
      first.traverse(node => disposeObjectNode(node));
      assert.ok([...disposed.values()].every(count => count === 1));
      assert.equal(otherDisposals, 0);
      assert.equal(geometryDisposals, 0);
      assert.equal(textureDisposals, 0);
      if (flag) other.userData.updateAuthoredMotion(0.1, b);
      other.traverse(node => disposeObjectNode(node));
      assert.equal(otherDisposals, otherMaterials.size);
      assert.equal(geometryDisposals, 0);
      assert.equal(textureDisposals, 0);
    } finally {
      geometry.removeEventListener('dispose', geometryListener);
      skins.nacre.baseColor.removeEventListener('dispose', textureListener);
      skins.nacre.normal.removeEventListener('dispose', textureListener);
    }
  });
}
