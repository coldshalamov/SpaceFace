import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  ROCK_FAMILY_ASSETS,
  ROCK_FAMILY_REPEAT,
  getReadyRockFamilies,
  preloadRockFamilyLibrary,
  rockFamilyFor,
} from '../src/render/rockFamilyLibrary.js';
import { createVisualFactory, upgradeFamilylessRockMaterials } from '../src/render/visualFactory.js';
import { preloadRockSurfaceLibrary } from '../src/render/rockSurfaceLibrary.js';

// An asteroid only builds once the common-rock library is ready (the same precondition the other rock tests meet).
await preloadRockSurfaceLibrary(null, { loadTexture: async () => new THREE.Texture() });

// Metal and exotic rocks draw a canvas roughness-noise texture, which plain node has no canvas for; this stand-in
// supports exactly what makeNoiseTexture calls (getContext('2d').createImageData / putImageData).
function withCanvasStub(fn) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    }),
  };
  try { return fn(); } finally { globalThis.document = previous; }
}

const bodyMaterial = (typeId) => withCanvasStub(() => {
  const root = createVisualFactory().build({ id: 31, type: 'asteroid', radius: 12, data: { typeId } });
  assert.notEqual(root.userData.visualBuildFailed, true, `${typeId} must build`);
  return root.userData.asteroidInstanceBody.material;
});

test('every family map ships in the packaged release tree', () => {
  for (const [family, files] of Object.entries(ROCK_FAMILY_ASSETS)) {
    for (const [slot, url] of Object.entries(files)) {
      assert.match(url, /^\/assets\/ships\/release\//, `${family}.${slot} must load from the packaged release tree`);
      const path = fileURLToPath(new URL(`..${url}`, import.meta.url));
      assert.equal(existsSync(path), true, `${family}.${slot} is missing: ${path}`);
    }
  }
  assert.deepEqual(Object.keys(ROCK_FAMILY_ASSETS), ['metal', 'crystal', 'exotic']);
  assert.ok(ROCK_FAMILY_ASSETS.crystal.emissive && ROCK_FAMILY_ASSETS.exotic.emissive, 'luminous families carry a glow map');
  assert.equal(ROCK_FAMILY_ASSETS.metal.emissive, undefined, 'the metal family does not glow');
});

test('before the library decodes, family types keep the flat tinted material', () => {
  assert.equal(getReadyRockFamilies(), null);
  for (const typeId of ['ast_metallic', 'ast_crystalline', 'ast_rare_exotic']) {
    const material = bodyMaterial(typeId);
    assert.equal(material.map, null, `${typeId} must not publish a half-loaded family`);
    assert.equal(material.emissiveMap, null);
  }
});

let preDecodeMetallicRoot = null;

test('family-less rocks are tagged for a later re-skin before the family maps decode', () => {
  assert.equal(getReadyRockFamilies(), null);
  preDecodeMetallicRoot = withCanvasStub(() => createVisualFactory().build({
    id: 41, type: 'asteroid', radius: 12, data: { typeId: 'ast_metallic' },
  }));
  assert.notEqual(preDecodeMetallicRoot.userData.visualBuildFailed, true);
  const material = preDecodeMetallicRoot.userData.asteroidInstanceBody.material;
  assert.equal(material.map, null, 'no half-loaded family map');
  assert.ok(material.roughnessMap, 'the procedural metal surface uses the noise roughness map');
  assert.equal(material.userData.spacefaceFamilylessRock?.typeId, 'ast_metallic',
    'the pre-decode material is tagged so the family-ready continuation can re-skin it');
});

test('a failed decode publishes nothing and resolves null instead of throwing', async () => {
  const isolated = await import('../src/render/rockFamilyLibrary.js?family-failure-contract');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await isolated.preloadRockFamilyLibrary(null, { loadTexture: async () => { throw new Error('decode failed'); } });
    assert.equal(result, null);
    assert.equal(isolated.getReadyRockFamilies(), null);
  } finally {
    console.warn = warn;
  }
});

test('decoded families are configured, GPU-warmed once each, and worn by their asteroid types only', async () => {
  const loaded = [];
  const initialized = [];
  const families = await preloadRockFamilyLibrary({ initTexture: (texture) => initialized.push(texture) }, {
    loadTexture: async (url) => { loaded.push(url); return new THREE.Texture(); },
  });
  assert.equal(getReadyRockFamilies(), families);
  assert.equal(loaded.length, 8, 'metal 2 maps + crystal 3 + exotic 3');
  assert.equal(initialized.length, 8, 'each decoded map is warmed on the GPU exactly once');

  const { metal, crystal, exotic } = families;
  assert.equal(metal.baseColor.colorSpace, THREE.SRGBColorSpace);
  assert.equal(metal.normal.colorSpace, THREE.NoColorSpace, 'normal data is never colour-managed');
  assert.equal(crystal.emissive.colorSpace, THREE.SRGBColorSpace);
  assert.equal(metal.baseColor.wrapS, THREE.RepeatWrapping);
  assert.deepEqual(metal.baseColor.repeat.toArray(), ROCK_FAMILY_REPEAT);
  assert.equal(ROCK_FAMILY_REPEAT[0], 2 * ROCK_FAMILY_REPEAT[1], 'u wraps once per turn and v once pole to pole, so u repeats twice');
  assert.equal(Number.isInteger(ROCK_FAMILY_REPEAT[0]), true, 'an integer u repeat keeps the wrap seam invisible');
  assert.equal(rockFamilyFor('metal'), metal);
  assert.equal(rockFamilyFor('rock'), null, 'common rock has its own library');
  assert.equal(rockFamilyFor('ice'), null, 'ice stays transmissive glass');
  assert.equal(rockFamilyFor('gas'), null, 'the gas cloud stays a translucent hull');

  const metallic = bodyMaterial('ast_metallic');
  assert.equal(metallic.map, metal.baseColor);
  assert.equal(metallic.normalMap, metal.normal);
  assert.equal(metallic.emissiveMap, null, 'a metal rock does not glow');

  const crystalline = bodyMaterial('ast_crystalline');
  assert.equal(crystalline.map, crystal.baseColor);
  assert.equal(crystalline.emissiveMap, crystal.emissive);
  assert.ok(crystalline.emissiveIntensity > 0.9, 'a glow map confines the glow, so the intensity is lifted above the flat value');

  const rare = bodyMaterial('ast_rare_exotic');
  assert.equal(rare.map, exotic.baseColor);
  assert.equal(rare.emissiveMap, exotic.emissive);

  // The type colour only tints the texture now: white-dominant, not the old dark multiply.
  for (const material of [metallic, crystalline, rare]) {
    assert.ok(material.color.r > 0.6 && material.color.g > 0.6 && material.color.b > 0.6, 'family materials tint, they do not darken');
  }

  assert.equal(bodyMaterial('ast_icy').map, null, 'ice keeps its glass material');
});

test('decoded family maps re-skin a rock that was built before the decode', () => {
  assert.ok(preDecodeMetallicRoot, 'the pre-decode fixture exists');
  const before = preDecodeMetallicRoot.userData.asteroidInstanceBody.material;
  const changed = upgradeFamilylessRockMaterials(preDecodeMetallicRoot);
  const after = preDecodeMetallicRoot.userData.asteroidInstanceBody.material;
  assert.equal(changed, 1, 'the live rock is re-skinned once');
  assert.notEqual(after, before, 'the procedural material is replaced');
  assert.equal(after.map, rockFamilyFor('metal').baseColor, 'the decoded family map is worn');
  assert.equal(after.userData.spacefaceFamilylessRock, undefined, 'the stale tag leaves with the material');
  assert.equal(upgradeFamilylessRockMaterials(preDecodeMetallicRoot), 0, 'a second pass is a no-op');
});

test('the family-ready re-warm re-skins live rocks before compiling the family group', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /async _runRockFamilyDecodeRewarm\(liveScene\)[\s\S]{0,2500}?upgradeFamilylessRockMaterials\(mesh\)/,
    'a family that lands after a rock was built must re-skin the live mesh, not only warm a new group');
});
