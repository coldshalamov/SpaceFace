import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildAlienGrowthProp, buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { buildMachineMesh, buildMachineProp } from '../src/render/machineVisuals.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { disposeObjectNode } from '../src/render/renderer.js';

function materials(root) {
  const found = new Set();
  root.traverse((node) => {
    if (node.material) for (const mat of (Array.isArray(node.material) ? node.material : [node.material])) found.add(mat);
  });
  return [...found];
}

test('views built before skin decode bind once; disposed materials stay retired', async () => {
  const growth = materials(buildAlienGrowthProp('alien_growth_memory_knot'));
  const cyst = materials(buildFaunaMesh({ data: { strainId: 'veil_glass', ecology: { speciesId: 'lantern_cyst' } } }));
  const machine = materials(buildMachineMesh('custodian'));
  const prop = materials(buildMachineProp('machine_pylon'));
  const retiredRoot = buildAlienGrowthProp('alien_growth_silt_root');
  const retired = materials(retiredRoot);
  const sac = cyst.find((mat) => mat.transparent && mat.opacity === 0.55);
  assert.ok(sac);
  assert.ok([...growth, ...cyst, ...machine, ...prop, ...retired].every((mat) => mat.map === null));
  retiredRoot.traverse((node) => disposeObjectNode(node));
  const retiredColors = retired.map((mat) => mat.color.clone());
  const resolvers = [];
  const pending = preloadCreatureSkinLibrary(null, { loadTexture: () => new Promise((resolve) => resolvers.push(resolve)) });
  assert.equal(resolvers.length, 4);
  const textures = resolvers.map(() => new THREE.Texture());
  let textureDisposals = 0;
  for (const texture of textures) texture.addEventListener('dispose', () => textureDisposals++);
  resolvers.forEach((resolve, i) => resolve(textures[i]));
  const skins = await pending;
  assert.ok(growth.some((mat) => mat.map === skins.tissue.baseColor && mat.normalMap === skins.tissue.normal));
  assert.equal(sac.map, skins.tissue.baseColor);
  assert.equal(sac.normalMap, null, 'translucent sac intentionally omits the normal map');
  assert.ok(machine.some((mat) => mat.map === skins.nacre.baseColor && mat.normalMap === skins.nacre.normal));
  assert.ok(prop.some((mat) => mat.map === skins.nacre.baseColor && mat.normalMap === skins.nacre.normal));
  retired.forEach((mat, i) => { assert.equal(mat.map, null); assert.ok(mat.color.equals(retiredColors[i])); });
  for (const mat of [...growth, ...cyst, ...machine, ...prop]) mat.dispose();
  assert.equal(textureDisposals, 0, 'views do not own shared library textures');
  const after = materials(buildMachineProp('machine_pylon'));
  assert.ok(after.some((mat) => mat.map === skins.nacre.baseColor));
  for (const mat of after) mat.dispose();
});
