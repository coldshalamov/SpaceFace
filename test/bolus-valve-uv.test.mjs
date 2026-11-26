import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bolusSilhouette } from '../src/render/bolusSilhouettes.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

test('valve tissue UVs cover every triangle cleanly without collapsed or out-of-range coordinates', () => {
  const [lip] = bolusSilhouette('bolus_valve').parts;
  assert.ok(lip.positions.length > 18);
  assert.equal(lip.uvs.length, (lip.positions.length / 3) * 2);
  assert.ok(Array.isArray(lip.indices) && lip.indices.length > 6);
  const uv = i => lip.uvs.slice(i * 2, i * 2 + 2);
  const area = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < lip.indices.length; i += 3) {
    const [ia, ib, ic] = lip.indices.slice(i, i + 3);
    assert.ok(area(uv(ia), uv(ib), uv(ic)) > 1e-8, `valve UV triangle ${i / 3} is nondegenerate`);
  }
  assert.ok(lip.uvs.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('textured valves share geometry while keeping material lifetimes independent', async () => {
  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  const entity = () => ({ data: { ecology: { speciesId: 'bolus_valve', driveState: 'drift' } } });
  const first = buildFaunaMesh(entity()), second = buildFaunaMesh(entity());
  const a = first.children[0], b = second.children[0];
  assert.equal(a.geometry, b.geometry);
  assert.notEqual(a.material, b.material);
  assert.equal(a.geometry.attributes.uv.count, a.geometry.attributes.position.count);
  assert.equal(a.material.map, skins.tissue.baseColor);
  assert.equal(a.material.normalMap, skins.tissue.normal);
  let geometryDisposals = 0, skinDisposals = 0, otherDisposals = 0;
  const onGeometry = () => geometryDisposals++;
  const onSkin = () => skinDisposals++;
  a.geometry.addEventListener('dispose', onGeometry);
  skins.tissue.baseColor.addEventListener('dispose', onSkin);
  skins.tissue.normal.addEventListener('dispose', onSkin);
  b.material.addEventListener('dispose', () => otherDisposals++);
  try {
    first.traverse(node => disposeObjectNode(node));
    assert.equal(geometryDisposals, 0);
    assert.equal(skinDisposals, 0);
    assert.equal(otherDisposals, 0);
    assert.equal(b.material.map, skins.tissue.baseColor);
    second.traverse(node => disposeObjectNode(node));
    assert.equal(otherDisposals, 1);
    assert.equal(geometryDisposals, 0);
    assert.equal(skinDisposals, 0);
  } finally {
    a.geometry.removeEventListener('dispose', onGeometry);
    skins.tissue.baseColor.removeEventListener('dispose', onSkin);
    skins.tissue.normal.removeEventListener('dispose', onSkin);
  }
});
