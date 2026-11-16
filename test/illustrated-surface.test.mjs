import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  canonicalizeObjectSurfaceProgramKeys,
  ILLUSTRATED_SURFACE_GLSL,
  installIllustratedSurface,
  ILLUSTRATED_SURFACE_KEY,
} from '../src/render/illustratedSurface.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';
import { installSingleSamplePackedOrmShader } from '../src/render/packedOrmShader.js';
import * as illustratedSurfaceModule from '../src/render/illustratedSurface.js';

test('a late-attached packed-ORM clone still collapses after a second canonicalize', () => {
  const hull = new THREE.MeshStandardMaterial({ color: 0x334455 });
  hull.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${hull.uuid}`;
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), hull));
  canonicalizeObjectSurfaceProgramKeys(root);
  const extra = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  extra.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${extra.uuid}`;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), extra));
  assert.notEqual(extra.customProgramCacheKey(), hull.customProgramCacheKey());
  canonicalizeObjectSurfaceProgramKeys(root);
  assert.equal(extra.customProgramCacheKey(), hull.customProgramCacheKey());
  assert.equal(extra.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
});

test('compose leftover unique keys collapse on first presentation bind', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  a.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${a.uuid}`;
  b.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${b.uuid}`;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), a));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(a.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
  assert.equal(a.customProgramCacheKey().includes(a.uuid), false);
});

test('packed-ORM compose that concatenated onBeforeCompile source still collapses', () => {
  const hull = new THREE.MeshStandardMaterial({ color: 0x334455 });
  hull.userData = { spacefacePackedOrmSingleSample: true };
  hull.onBeforeCompile = function packedOrmSingleSampleShader(shader) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '// packed | orm');
  };
  hull.customProgramCacheKey = () => `${hull.onBeforeCompile.toString()}|spaceface-packed-orm-single-sample-v1|${hull.uuid}`;
  const extra = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  extra.userData = { spacefacePackedOrmSingleSample: true };
  extra.onBeforeCompile = hull.onBeforeCompile;
  extra.customProgramCacheKey = () => `${extra.onBeforeCompile.toString()}|spaceface-packed-orm-single-sample-v1|${extra.uuid}`;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), hull));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), extra));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(hull.customProgramCacheKey(), extra.customProgramCacheKey());
  assert.equal(hull.customProgramCacheKey(), 'spaceface-packed-orm-single-sample-v1');
});

test('unpatched standard materials replace Three default compile-source keys', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), a));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 2);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(a.customProgramCacheKey(), '');
  assert.notEqual(a.customProgramCacheKey(), a.onBeforeCompile.toString());
});

test('shader materials keep leftover uniqueness through object canonicalize', () => {
  const shader = new THREE.ShaderMaterial();
  shader.customProgramCacheKey = () => `fx:${shader.uuid}`;
  assert.equal(canonicalizeObjectSurfaceProgramKeys(shader), 0);
  assert.equal(shader.customProgramCacheKey(), `fx:${shader.uuid}`);
});

test('two hulls with unique leftover cache keys share one illustrated program family', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const b = new THREE.MeshStandardMaterial({ color: 0xaa7744 });
  a.customProgramCacheKey = () => `MeshStandardMaterial|packed-orm|${a.uuid}`;
  b.customProgramCacheKey = () => `MeshStandardMaterial|packed-orm|${b.uuid}`;
  assert.equal(installIllustratedSurface(a), true);
  assert.equal(installIllustratedSurface(b), true);
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.match(a.customProgramCacheKey(), /packed-orm/);
  assert.ok(a.customProgramCacheKey().includes(ILLUSTRATED_SURFACE_KEY));
  assert.equal(a.customProgramCacheKey().includes(a.uuid), false);
});

test('illustration preserves authored inputs and chains the live physical shader once', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x665544, metalness: 0.3, roughness: 0.7 });
  const color = material.color.getHex();
  const map = new THREE.Texture();
  material.map = map;
  let calls = 0;
  material.onBeforeCompile = () => { calls++; };
  material.customProgramCacheKey = () => 'packed-orm';
  installIllustratedSurface(material);
  const key = material.customProgramCacheKey();
  installIllustratedSurface(material);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal(calls, 1);
  assert.equal(material.customProgramCacheKey(), key);
  assert.match(key, /packed-orm/);
  assert.ok(key.includes(ILLUSTRATED_SURFACE_KEY));
  assert.equal(material.color.getHex(), color);
  assert.equal(material.map, map);
  assert.equal(material.metalness, 0.3);
  assert.equal((shader.fragmentShader.match(/float sfPaintLuma/g) || []).length, 1);
  assert.ok(shader.fragmentShader.indexOf('float sfPaintLuma') < shader.fragmentShader.indexOf('#include <aomap_fragment>'));
});

test('reapplying authored profiles does not recursively wrap the shader', () => {
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 3; i++) applyAuthoredMaterialProfile(material, 'hull', { allowTextures: false });
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal((shader.fragmentShader.match(/float sfPaintLuma/g) || []).length, 1);
  assert.equal((shader.fragmentShader.match(/float sfBreakNoise/g) || []).length, 1);
});

test('rough rock reflection is role scoped and preserves its scanned material inputs', () => {
  const map = new THREE.Texture();
  const rock = new THREE.MeshStandardMaterial({ color: 0x635d52, roughness: 1, map });
  rock.userData.spacefaceSharedMaterialRole = 'rock';
  const hull = rock.clone();
  hull.userData.spacefaceSharedMaterialRole = 'hull';
  for (const [material, roleWeight] of [[rock, 1], [hull, 0]]) {
    const inputs = { map: material.map, color: material.color.getHex(),
      roughness: material.roughness, emissive: material.emissive.getHex() };
    installIllustratedSurface(material);
    const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.sfRockSurface.value, roleWeight,
      'only the terrain role receives the shadow reflection, regardless of roughness');
    assert.equal(material.map, inputs.map);
    assert.equal(material.color.getHex(), inputs.color);
    assert.equal(material.roughness, inputs.roughness);
    assert.equal(material.emissive.getHex(), inputs.emissive, 'rock paint gains no emissive input');
  }
  assert.equal(rock.customProgramCacheKey(), hull.customProgramCacheKey(),
    'role weight shares the existing shader family without per-role compilation');
});

test('glass and shader effects retain their optical response', () => {
  for (const material of [new THREE.MeshPhysicalMaterial({ transmission: 0.8 }),
    new THREE.MeshStandardMaterial({ transparent: true }), new THREE.ShaderMaterial()]) {
    const hook = material.onBeforeCompile;
    assert.equal(installIllustratedSurface(material), false);
    assert.equal(material.onBeforeCompile, hook);
  }
});

test('packed ORM can own the AO include before the illustration hook is installed', () => {
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', '// packed AO');
  };
  installIllustratedSurface(material);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.fragmentShader.indexOf('float sfPaintLuma') < shader.fragmentShader.indexOf('// packed AO'));
});

test('clearcoat sun lobe skips zero-facing lights before half-vector work', () => {
  const loopStart = ILLUSTRATED_SURFACE_GLSL.indexOf('vec3 sfToLight = directionalLights[sfJ].direction;');
  const loopEnd = ILLUSTRATED_SURFACE_GLSL.indexOf('\n    }', loopStart);
  assert.ok(loopStart >= 0);
  assert.ok(loopEnd > loopStart);
  const loop = ILLUSTRATED_SURFACE_GLSL.slice(loopStart, loopEnd);
  const guard = loop.indexOf('if (sfNoL > 0.0) {');
  assert.ok(guard > 0);
  assert.ok(loop.indexOf('float sfNoH', guard) > guard,
    'half-vector normalization stays inside the positive-light branch');
  assert.ok(loop.indexOf('sfCoatLight +=', guard) > guard,
    'the guarded branch still emits the original positive-light lobe');
});


// PERF-HOT-04: the installed-key walk memoizes its settled result per material. Two properties
// make that memo safe, and both are pinned here against the material shapes the renderer really
// composes: a memo hit serves a key byte-identical to an uncached derivation, and every input
// that decides the key invalidates the memo instead of serving a stale one.
//
// The reference is a fresh module instance (empty memo), which is the pre-change code path.
async function uncachedInstalledKey(material) {
  const fresh = await import(`../src/render/illustratedSurface.js?perf-hot-04=${uncachedInstalledKey.seq++}`);
  fresh.canonicalizeInstalledSurfaceProgramKey(material);
  return String(material.customProgramCacheKey());
}
uncachedInstalledKey.seq = 0;

// Twin factories, because Material.clone() drops instance-assigned onBeforeCompile and
// customProgramCacheKey — a cloned "reference" would compare default keys, not these variants.
const MATERIAL_TWIN_BUILDERS = {
  plain: () => new THREE.MeshStandardMaterial({ color: 0x334455 }),
  uniqueKeyNoise: () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x445566 });
    material.customProgramCacheKey = () => `MeshStandardMaterial|${material.uuid}|standard`;
    return material;
  },
  packedOrm: () => {
    const orm = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      color: 0x8a96a4, roughnessMap: orm, metalnessMap: orm, aoMap: orm,
    });
    installSingleSamplePackedOrmShader(material);
    return material;
  },
  packedOrmBreakup: () => {
    const material = MATERIAL_TWIN_BUILDERS.packedOrm();
    applyAuthoredMaterialProfile(material, 'hull', { allowTextures: false });
    return material;
  },
  illustratedHull: () => {
    const material = MATERIAL_TWIN_BUILDERS.packedOrmBreakup();
    installIllustratedSurface(material);
    material.userData.spacefaceHullLayout = { kind: 2, strength: 0.5, accent: '#cfd8e6' };
    return material;
  },
  illustratedPhysical: () => {
    const material = new THREE.MeshPhysicalMaterial({ color: 0x778899, clearcoat: 0.6 });
    installIllustratedSurface(material);
    return material;
  },
  compileSourceKeyed: () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x99aabb });
    material.onBeforeCompile = function compileSourceHook(shader) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '// patched');
    };
    material.customProgramCacheKey = () => material.onBeforeCompile.toString();
    return material;
  },
};

test('the memoized installed key equals an uncached derivation for every material shape', async () => {
  const cache = await import('../src/render/illustratedSurface.js');
  for (const [label, build] of Object.entries(MATERIAL_TWIN_BUILDERS)) {
    const memoized = build();
    // Some shapes already answer a canonical key (packed-ORM installs its own), so the first
    // walk legitimately reports "no change" — the key it serves is the contract, not the bool.
    cache.canonicalizeInstalledSurfaceProgramKey(memoized);
    const key = String(memoized.customProgramCacheKey());
    assert.equal(key, await uncachedInstalledKey(build()), `${label}: memoized key must be byte-identical`);
    // The second walk is the memo hit this packet exists for: nothing to change, key never moves.
    assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(memoized), false, `${label}: settled walk reports no change`);
    assert.equal(String(memoized.customProgramCacheKey()), key, `${label}: settled key is stable`);
    // And the memoized material and a fresh twin still collapse onto one family key.
    assert.equal(memoized.customProgramCacheKey(), await uncachedInstalledKey(build()),
      `${label}: two twins of one shape share one family key`);
  }
});

test('each key input invalidates the memo instead of serving the stale key', async () => {
  const cache = await import('../src/render/illustratedSurface.js');
  const material = new THREE.MeshStandardMaterial({ color: 0x445566 });
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), true);
  const settled = String(material.customProgramCacheKey());
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), false);

  // A different illustration family version is an input to the key.
  material.userData = { ...material.userData, spacefaceIllustratedSurface: 'spaceface-illustrated-surface-next' };
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), true);
  const next = String(material.customProgramCacheKey());
  assert.notEqual(next, settled);
  assert.ok(next.includes('spaceface-illustrated-surface-next'));
  material.userData = { ...material.userData, spacefaceIllustratedSurface: 'spaceface-illustrated-surface-next' };
  assert.equal(String(material.customProgramCacheKey()), next, 'same inputs keep the same key');

  // A re-wrapped key function (what a compose clone carries) is an input too.
  material.customProgramCacheKey = () => `MeshStandardMaterial|${material.uuid}|${next}`;
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), true);
  const rewrapped = String(material.customProgramCacheKey());
  assert.equal(rewrapped, next, 'the unique uuid noise is stripped again');
  assert.equal(rewrapped, await uncachedInstalledKey(Object.assign(
    new THREE.MeshStandardMaterial({ color: 0x445566 }),
    { userData: { spacefaceIllustratedSurface: 'spaceface-illustrated-surface-next' } },
  )));

  // A new compile hook of the same shape is still re-canonicalized from scratch.
  material.onBeforeCompile = function replacementHook(shader) { shader.fragmentShader += '// one'; };
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), false,
    'a hook change alone cannot alter a key with no compile-source token');
  material.customProgramCacheKey = () => `${material.onBeforeCompile.toString()}|${material.uuid}`;
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), true);
  assert.equal(String(material.customProgramCacheKey()).includes(material.uuid), false);
});

test('a stable key function whose answer changes is still re-canonicalized', () => {
  const cache = illustratedSurfaceModule;
  // The already-canonical shape: the first walk finds nothing to install, so no closure replaces
  // this function and the memo has to compare the string it returns, not just its identity.
  let answer = 'spaceface-packed-orm-single-sample-v1';
  const material = new THREE.MeshStandardMaterial({ color: 0x223344 });
  material.customProgramCacheKey = () => answer;
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), false, 'canonical already');
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), false, 'memo hit');

  // Same function object, a new answer carrying compose uuid noise: must re-derive, not hit.
  answer = `spaceface-packed-orm-single-sample-v1|${material.uuid}|vec3 sf = normalize(vNormal);`;
  assert.equal(cache.canonicalizeInstalledSurfaceProgramKey(material), true, 'changed answer re-derives');
  assert.equal(String(material.customProgramCacheKey()), 'spaceface-packed-orm-single-sample-v1');
});

test('a repeated subtree walk stops re-deriving settled keys', () => {
  const group = new THREE.Group();
  const materials = [];
  const geometry = new THREE.BoxGeometry();
  for (let i = 0; i < 8; i += 1) {
    const material = new THREE.MeshStandardMaterial({ color: 0x335577 });
    material.customProgramCacheKey = () => `MeshStandardMaterial|spaceface-packed-orm-single-sample-v1|${material.uuid}`;
    materials.push(material);
    group.add(new THREE.Mesh(geometry, material));
  }
  assert.ok(canonicalizeObjectSurfaceProgramKeys(group) >= 8, 'first walk canonicalizes every material');
  const settledKeys = materials.map((material) => material.customProgramCacheKey());
  assert.equal(canonicalizeObjectSurfaceProgramKeys(group), 0, 'a settled subtree reports no changes');
  assert.deepEqual(materials.map((material) => material.customProgramCacheKey()), settledKeys,
    'the settled family keys are untouched by the extra walks');
});
