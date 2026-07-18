import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ROCK_SURFACE_ASSETS,
  ROCK_SURFACE_TEXTURE_REPEAT,
  getReadyRockSurfaceTextures,
  preloadRockSurfaceLibrary,
} from '../src/render/rockSurfaceLibrary.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { entityVisualCullRadius, separateOpeningVisualPreloads } from '../src/render/renderer.js';
import { COMMON_ROCK_UV_TRANSFORMS } from '../src/render/objectSpaceGeology.js';

function attributeFingerprint(attribute) {
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(attribute.count / 257));
  for (let index = 0; index < attribute.count; index += step) {
    for (let channel = 0; channel < attribute.itemSize; channel++) {
      const value = attribute.array[index * attribute.itemSize + channel];
      const quantized = Math.round(value * 1e5) | 0;
      hash ^= quantized; hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

test('common-rock PBR maps are decoded and GPU-warmed before publication', async () => {
  const loaded = [];
  const initialized = [];
  const textures = await preloadRockSurfaceLibrary({ initTexture: (texture) => initialized.push(texture) }, {
    loadTexture: async (url) => {
      loaded.push(url);
      return new THREE.Texture();
    },
  });

  assert.deepEqual(loaded, [
    ROCK_SURFACE_ASSETS.baseColor,
    ROCK_SURFACE_ASSETS.normal,
    ROCK_SURFACE_ASSETS.orm,
  ]);
  assert.equal(textures.baseColor.colorSpace, THREE.SRGBColorSpace);
  assert.equal(textures.normal.colorSpace, THREE.NoColorSpace);
  assert.equal(textures.orm.colorSpace, THREE.NoColorSpace);
  assert.equal(textures.orm.channel, 0);
  assert.equal(textures.baseColor.wrapS, THREE.RepeatWrapping);
  assert.equal(textures.baseColor.wrapT, THREE.RepeatWrapping);
  assert.equal(textures.baseColor.anisotropy, 8);
  assert.deepEqual(textures.baseColor.repeat.toArray(), [
    ROCK_SURFACE_TEXTURE_REPEAT,
    ROCK_SURFACE_TEXTURE_REPEAT,
  ]);
  assert.equal(textures.baseColor.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(textures.baseColor.magFilter, THREE.LinearFilter);
  assert.equal(textures.baseColor.generateMipmaps, true);
  assert.equal(textures.baseColor.userData.spacefaceSurfaceRole, 'micro-base-color');
  assert.equal(textures.normal.userData.spacefaceSurfaceRole, 'micro-regolith-normal');
  assert.equal(textures.orm.userData.spacefaceSurfaceRole, 'micro-packed-orm');
  assert.deepEqual(initialized, [textures.baseColor, textures.normal, textures.orm]);
  assert.equal(getReadyRockSurfaceTextures(), textures);

  const asteroid = createVisualFactory().build({
    id: 17,
    type: 'asteroid',
    radius: 12,
    data: { typeId: 'ast_common_rock' },
  });
  const body = asteroid.userData.asteroidInstanceBody;
  assert(body && body.isMesh, 'common-rock body remains eligible for the batched live path');
  assert.equal(body.material.map, textures.baseColor);
  assert.equal(body.material.normalMap, textures.normal);
  assert.equal(body.material.roughnessMap, textures.orm);
  assert.equal(body.material.metalnessMap, textures.orm);
  assert.equal(body.material.flatShading, false);
  assert.equal(body.material.vertexColors, true);
  assert.equal(body.material.emissive.getHex(), 0, 'common rock must not use a molten emissive blanket');
  assert.equal(body.material.emissiveIntensity, 0);
  assert.equal(body.material.userData.spacefacePbrAttribute, 'sfGeologyPbr');
  assert.deepEqual(body.material.userData.spacefaceMaterialRoles, [
    'matrix',
    'fracture',
    'regolith',
    'ferrite',
  ]);
  assert(body.geometry.getAttribute('color'), 'macro geology is carried per deterministic variant');
  const pbr = body.geometry.getAttribute('sfGeologyPbr');
  assert(pbr && pbr.itemSize === 4 && pbr.count === body.geometry.getAttribute('position').count,
    'each shared vertex carries AO, roughness, metalness, and normal strength');
  assert.equal(body.geometry.userData.spacefaceGeology.schema, 'spaceface.commonRockGeology.v4');
  assert.deepEqual(body.geometry.userData.spacefaceGeology.pbrAttributeChannels,
    ['ao', 'roughness', 'metalness', 'normalStrength']);
  assert.deepEqual(body.geometry.userData.spacefaceGeology.materialRoles, [
    'matrix',
    'fracture',
    'regolith',
    'ferrite',
  ]);
  assert(body.geometry.getAttribute('position').count > 500,
    'macro silhouette no longer exposes the old low-poly faceted shell');
  const positions = body.geometry.getAttribute('position');
  const normals = body.geometry.getAttribute('normal');
  let normalDeviation = 0;
  for (let i = 0; i < positions.count; i++) {
    const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
    const length = Math.hypot(px, py, pz) || 1;
    const dot = Math.max(-1, Math.min(1,
      normals.getX(i) * px / length + normals.getY(i) * py / length + normals.getZ(i) * pz / length));
    normalDeviation += Math.acos(dot);
  }
  normalDeviation /= positions.count;
  assert(normalDeviation > 0.015,
    `macro strata and fractures must affect grazing light instead of retaining sphere normals: ${normalDeviation}`);

  const shader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: [
      '#include <common>',
      '#include <normal_fragment_maps>',
      '#include <roughnessmap_fragment>',
      '#include <metalnessmap_fragment>',
      '#include <aomap_fragment>',
    ].join('\n'),
  };
  body.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec4 sfGeologyPbr/);
  assert.match(shader.fragmentShader, /mapN\.xy \*= normalScale \* vSfGeologyPbr\.a/);
  assert.match(shader.fragmentShader, /roughnessFactor = clamp\(mix/);
  assert.match(shader.fragmentShader, /metalnessFactor = clamp\(mix/);
  assert.match(shader.fragmentShader, /reflectedLight\.indirectDiffuse \*= vSfGeologyPbr\.r/);
  assert.throws(() => body.material.onBeforeCompile({
    vertexShader: '#include <common>',
    fragmentShader: shader.fragmentShader,
  }), /common-rock PBR shader contract changed: missing vertex position hook/,
  'Three.js shader-chunk drift must fail visibly instead of silently dropping geology PBR');
});

test('five common-rock buckets reuse stable geometry/material identities and preserve gameplay scale', () => {
  const factory = createVisualFactory();
  const geometriesByVariant = new Map();
  let sharedMaterial = null;
  for (let id = 1; id <= 128; id++) {
    const radius = 6 + id % 9;
    const asteroid = factory.build({ id, type: 'asteroid', radius, data: { typeId: 'ast_common_rock' } });
    const body = asteroid.userData.asteroidInstanceBody;
    const variant = body.userData.asteroidInstanceVariant;
    sharedMaterial ||= body.material;
    assert.equal(body.material, sharedMaterial, 'common rocks share one instancing-compatible material');
    assert.deepEqual(body.scale.toArray(), [radius, radius, radius], 'visual work does not rewrite gameplay radius');
    if (geometriesByVariant.has(variant)) {
      assert.equal(body.geometry, geometriesByVariant.get(variant), `variant ${variant} reuses cached geometry`);
    } else {
      geometriesByVariant.set(variant, body.geometry);
    }
  }
  assert.equal(geometriesByVariant.size, 5);
  assert.deepEqual([...geometriesByVariant.keys()].sort(), [0, 1, 2, 3, 4]);
  const geometries = [...geometriesByVariant.entries()].sort(([a], [b]) => a - b);
  assert.equal(new Set(geometries.map(([, geometry]) => (
    attributeFingerprint(geometry.getAttribute('position'))
  ))).size, 5, 'the five buckets must not collapse to the same rounded-potato geometry');
  assert.equal(new Set(geometries.map(([, geometry]) => (
    attributeFingerprint(geometry.getAttribute('uv'))
  ))).size, 5, 'the shared texture must not retain the same whorl orientation in every bucket');
  for (const [variant, geometry] of geometries) {
    assert.deepEqual(geometry.userData.spacefaceGeology.uvTransform, COMMON_ROCK_UV_TRANSFORMS[variant]);
  }
});

test('authored world bounds expand render culling without changing gameplay radius', () => {
  const mesh = new THREE.Group();
  const hull = new THREE.Group();
  hull.userData.visualBounds = { size: [776, 211, 674] };
  mesh.userData.hull = hull;
  const radius = entityVisualCullRadius({ radius: 72 }, mesh);
  assert(radius > 500);
  assert.equal(entityVisualCullRadius({ radius: 72 }, new THREE.Group()), 72);
});

test('optional rock-surface failure cannot reject exact opening-asset readiness', async () => {
  const failures = [];
  const authoredLibrary = { player: 'Hitch', hub: 'Helios' };
  const preloads = separateOpeningVisualPreloads(
    Promise.resolve(authoredLibrary),
    Promise.reject(new Error('synthetic missing regolith map')),
    (error) => failures.push(error.message),
  );

  assert.equal(await preloads.authoredRequest, authoredLibrary);
  assert.equal(await preloads.optionalSurfaceRequest, null);
  assert.deepEqual(failures, ['synthetic missing regolith map']);
});
