import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { alienStrainById } from '../src/data/alienEcology.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';

function entity(strainId) {
  return { data: { strainId, ecology: { speciesId: 'lantern_cyst', driveState: 'drift' } } };
}

function assertUsableSurface(geometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  assert.ok(geometry.index && positions && normals && uv);
  assert.ok([...positions.array, ...normals.array, ...uv.array].every(Number.isFinite));
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ids = [geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2)];
    const [a, b, c] = ids.map(index => new THREE.Vector3().fromBufferAttribute(positions, index));
    const face = b.sub(a).cross(c.sub(a));
    assert.ok(face.length() > 1e-12, 'a rendered face must not collapse');
    const normal = ids.reduce((sum, index) => sum.add(new THREE.Vector3().fromBufferAttribute(normals, index)), new THREE.Vector3());
    assert.ok(face.dot(normal) > 0, 'surface normals must face the same direction as the winding');
  }
}

test('Lantern geometry and shared skin preserve both strain and fallback contracts', async () => {
  const fallbackEntity = entity('charon_grave');
  const fallback = buildFaunaMesh(fallbackEntity);
  const fallbackSac = fallback.children[0].material;
  assert.equal(fallbackSac.map, null);
  assert.equal(fallbackSac.color.getHex(), alienStrainById('charon_grave').tissueColor);
  assert.equal(fallbackSac.opacity, 0.55);

  const skins = await preloadCreatureSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  const roots = ['charon_grave', 'veil_glass'].map(strain => buildFaunaMesh(entity(strain)));
  for (let i = 0; i < roots.length; i += 1) {
    const root = roots[i], strain = alienStrainById(i ? 'veil_glass' : 'charon_grave');
    assert.equal(root.children.length, 7);
    assert.equal(new Set(root.children.map(child => child.material)).size, 3);
    const sac = root.children[0].material;
    assert.equal(sac.map, skins.tissue.baseColor);
    assert.equal(sac.normalMap, null);
    assert.equal(sac.transparent, true);
    assert.equal(sac.opacity, 0.55);
    assert.deepEqual(sac.color.toArray(), new THREE.Color(0xffffff).lerp(new THREE.Color(strain.tissueColor), 0.78).toArray());
    assert.equal(sac.emissive.getHex(), strain.glowColor);
    assert.ok(root.children.slice(2).every(child => child.geometry === root.children[2].geometry));
    for (const part of [root.children[0], root.children[1], root.children[2]]) {
      assert.equal(part.geometry.userData.spacefaceSharedAsset, true);
      assertUsableSurface(part.geometry);
    }
  }
  for (let i = 0; i < 7; i += 1) {
    assert.equal(roots[0].children[i].geometry, roots[1].children[i].geometry);
  }
  assert.notEqual(roots[0].children[0].material, roots[1].children[0].material);
  assert.notDeepEqual(roots[0].children[0].material.color.toArray(), roots[1].children[0].material.color.toArray());
});
