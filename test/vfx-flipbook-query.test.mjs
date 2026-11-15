import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInstancedSpriteBuckets } from '../src/render/combat/instancedSpritePool.js';

test('flipbook fallback switch requires an exact query parameter', () => {
  const previous = { document: globalThis.document, Image: globalThis.Image, location: globalThis.location };
  const oldLoad = THREE.TextureLoader.prototype.load;
  try {
    globalThis.document = {};
    globalThis.Image = class {};
    THREE.TextureLoader.prototype.load = () => new THREE.Texture();
    for (const [search, disabled] of [
      ['?vfxFlip=0', true], ['?other=1&vfxFlip=0&x=1', true],
      ['?vfxFlip=1', false], ['?vfxFlip=00', false],
      ['?notvfxFlip=0', false], ['?vfxFlip=0extra', false], ['?other=vfxFlip=0', false],
    ]) {
      globalThis.location = { search };
      const buckets = createInstancedSpriteBuckets(new THREE.Scene(), 1);
      assert.equal(!buckets.flip, disabled, search);
    }
  } finally {
    THREE.TextureLoader.prototype.load = oldLoad;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
