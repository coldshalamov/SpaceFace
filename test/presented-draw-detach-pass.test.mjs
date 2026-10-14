import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createUnreadyDrawableGuard } from '../src/render/bloom.js';
import {
  claimSharedImageTexture,
  resetImageSourceDedupeForTests,
  sharedImageTextureFor,
} from '../src/render/imageSourceDedupe.js';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  detachPackageTexture,
  noteOrientationDetachedHold,
  preparePresentedDraw,
  presentedDetachRehydrateInFlight,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

const textureSlots = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'lightMap', 'bumpMap', 'displacementMap', 'alphaMap',
];

test('ordinary presented draws inspect each bound texture slot once', () => {
  let slotReads = 0;
  const material = { userData: {} };
  for (const slot of textureSlots) {
    Object.defineProperty(material, slot, {
      get() { slotReads += 1; return null; },
    });
  }
  let draws = 0;
  const renderer = {
    properties: new Map(),
    info: { programs: [] },
    renderBufferDirect() { draws += 1; return 'drawn'; },
  };
  createUnreadyDrawableGuard(renderer);
  assert.equal(renderer.renderBufferDirect(null, null, null, material, null, null), 'drawn');
  assert.equal(draws, 1);
  assert.equal(slotReads, textureSlots.length, 'one safety pass per presented draw');
});

function compressedTexture() {
  const texture = new THREE.CompressedTexture(
    [{ data: new Uint8Array(16), width: 4, height: 4 }], 4, 4,
  );
  texture.needsUpdate = true;
  return texture;
}

function markResources(resources, freshResources = () => resources) {
  resetPackageDetachManifestsForTests();
  return createPackageDetachManifest({
    contentHash: 'fixture-presented-pass', assetId: 'fixture-presented-pass', resources,
  }, {
    redecode: async () => ({ resources: freshResources() }),
    collectResources: template => template.resources,
  });
}

test('material arrays retain every slot check, including donors after a blocked slot', () => {
  resetImageSourceDedupeForTests();
  const owner = compressedTexture();
  claimSharedImageTexture('fixture-presented-donor', owner);
  const sibling = sharedImageTextureFor('fixture-presented-donor');
  owner.mipmaps = [];
  const missing = compressedTexture();
  missing.mipmaps = [];
  const materials = [null, { map: missing }, { normalMap: owner }];
  assert.equal(preparePresentedDraw({ properties: new Map() }, null, materials), true);
  assert.equal(owner.mipmaps[0].width, 4, 'a later donor recovery still runs when the draw is blocked');
  sibling.dispose();
  owner.dispose();
  missing.dispose();
});

test('detached texture checks observe version, properties disposal, and slot replacements each draw', () => {
  resetImageSourceDedupeForTests();
  const texture = compressedTexture();
  markResources([texture]);
  assert.equal(detachPackageTexture(texture), true);
  let propertyReads = 0;
  const stamps = new Map([[texture, { __version: texture.version }]]);
  const renderer = { properties: { get(value) { propertyReads += 1; return stamps.get(value); } } };
  const material = { map: texture };
  assert.equal(preparePresentedDraw(renderer, null, material), false);
  assert.equal(propertyReads, 1, 'detached and missing-chain checks share one properties lookup');
  texture.needsUpdate = true;
  assert.equal(preparePresentedDraw(renderer, null, material), true, 'a moved version must refill');
  stamps.set(texture, { __version: texture.version });
  assert.equal(preparePresentedDraw(renderer, null, material), false);
  stamps.delete(texture);
  assert.equal(preparePresentedDraw(renderer, null, material), true, 'disposed records must refill');
  const intact = compressedTexture();
  material.map = intact;
  assert.equal(preparePresentedDraw(renderer, null, material), false, 'a new intact slot is immediately drawable');
  material.map = texture;
  assert.equal(preparePresentedDraw(renderer, null, material), true, 'replacing a slot does not bypass safety');
});

test('a copied manifest mark recovers donor levels before an otherwise unsafe upload', () => {
  resetImageSourceDedupeForTests();
  const donor = compressedTexture();
  markResources([donor]);
  const clone = donor.clone();
  clone.mipmaps = [];
  clone.needsUpdate = true;
  assert.equal(preparePresentedDraw({ properties: new Map() }, null, { map: clone }), false);
  assert.notEqual(clone.mipmaps, donor.mipmaps, 'the array remains owned by this user');
  assert.equal(clone.mipmaps[0], donor.mipmaps[0], 'real mip records remain shared');
});

test('untracked missing compressed chains wait only when the next bind would upload', () => {
  resetPackageDetachManifestsForTests();
  const texture = compressedTexture();
  texture.mipmaps = [];
  const renderer = { properties: new Map([[texture, { __version: texture.version }]]) };
  assert.equal(preparePresentedDraw(renderer, null, { alphaMap: texture }), false);
  renderer.properties.delete(texture);
  assert.equal(preparePresentedDraw(renderer, null, { alphaMap: texture }), true);
  texture.version = 0;
  assert.equal(preparePresentedDraw(renderer, null, { alphaMap: texture }), false,
    'three does not upload a texture that has never requested an update');
});

test('released geometry detects live attribute versions, disposal, and foreign renderers', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  markResources([geometry]);
  const renderer = { properties: new Map() };
  assert.equal(detachPackageGeometry(geometry, renderer), true);
  assert.equal(preparePresentedDraw(renderer, geometry, null), false);
  assert.equal(preparePresentedDraw({ properties: new Map() }, geometry, null), true);
  assert.equal(preparePresentedDraw(renderer, geometry.clone(), null), false,
    'a copied geometry mark does not claim the manifest entry');
  const normal = geometry.getAttribute('normal');
  normal.needsUpdate = true;
  assert.equal(preparePresentedDraw(renderer, geometry, null), true);
  normal.version -= 1;
  assert.equal(preparePresentedDraw(renderer, geometry, null), false);
  geometry.dispose();
  assert.equal(preparePresentedDraw(renderer, geometry, null), true);
});

test('an orientation hold overrides a matching texture stamp until real levels return', async () => {
  resetImageSourceDedupeForTests();
  const texture = compressedTexture();
  markResources([texture], () => [compressedTexture()]);
  detachPackageTexture(texture);
  const renderer = { properties: new Map([[texture, { __version: texture.version }]]) };
  assert.equal(preparePresentedDraw(renderer, null, { map: texture }), false);
  noteOrientationDetachedHold(renderer);
  assert.equal(preparePresentedDraw(renderer, null, { map: texture }), true);
  await presentedDetachRehydrateInFlight();
  assert.ok(texture.mipmaps[0].data.byteLength > 0);
  assert.equal(preparePresentedDraw(renderer, null, { map: texture }), false);
});
