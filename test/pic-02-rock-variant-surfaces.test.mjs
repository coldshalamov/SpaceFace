// PIC-02 catalog line proof: the five common-rock instance variants do not share one
// material response — at least two (here: all five) differ in tint or ORM terms.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  preloadRockSurfaceLibrary,
  getReadyRockSurfaceTextures,
  rockSurfaceVariantSpec,
  ROCK_SURFACE_VARIANTS,
} from '../src/render/rockSurfaceLibrary.js';
import { asteroidLeafResources } from '../src/render/visualFactory.js';

function stubTexture() {
  return { userData: {}, repeat: { set() {} }, wrapS: 0, wrapT: 0 };
}

await preloadRockSurfaceLibrary(null, { loadTexture: async () => stubTexture() });

test('PIC-02: the surface library publishes and the variant table is per-variant', () => {
  assert.ok(getReadyRockSurfaceTextures(), 'library must be ready for the variant path');
  assert.equal(ROCK_SURFACE_VARIANTS.length, 5);
  const tints = new Set(ROCK_SURFACE_VARIANTS.map((v) => v.tint.join(',')));
  assert.ok(tints.size >= 2, 'at least two variant tints');
});

test('PIC-02: common-rock leaf materials differ per variant in tint and ORM terms', () => {
  const leaves = [0, 1, 2, 3, 4].map((v) => asteroidLeafResources('ast_common_rock', v));
  const materials = new Set(leaves.map((l) => l.material));
  assert.equal(materials.size, 5, 'each variant must bind its own cached material');

  const distinct = leaves.filter((l, i) => {
    const other = leaves[(i + 1) % leaves.length].material;
    const m = l.material;
    return !(m.color.equals(other.color)
      && m.roughness === other.roughness
      && m.aoMapIntensity === other.aoMapIntensity);
  });
  assert.ok(distinct.length >= 2, 'at least two instance variants differ in tint or ORM');

  // Every variant still shares the same decoded maps — no texture clones, no pool edits.
  for (const l of leaves) {
    assert.equal(l.material.map, leaves[0].material.map, 'variants share the baseColor map');
    assert.equal(l.material.roughnessMap, leaves[0].material.roughnessMap, 'variants share the ORM map');
  }
});

test('PIC-02: leaf material matches the spec for its own variant slot', () => {
  const leaf = asteroidLeafResources('ast_common_rock', 3);
  const spec = rockSurfaceVariantSpec(3);
  assert.ok(Math.abs(leaf.material.roughness - spec.roughness) < 1e-6);
  assert.ok(Math.abs(leaf.material.aoMapIntensity - spec.aoIntensity) < 1e-6);
});
