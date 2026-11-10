// Phase 2.3 — common rock reads as painted industrial stone.
// Clay-warm highlights and cyan crystal sheen are the defect the stranger pass named.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMON_ROCK_MATERIAL_ROLES,
  COMMON_ROCK_MINERAL_SHEEN,
} from '../src/render/objectSpaceGeology.js';
import { ROCK_SURFACE_VARIANTS } from '../src/render/rockSurfaceLibrary.js';

function channels(color) {
  assert.equal(color.length, 3);
  for (const n of color) assert.equal(Number.isFinite(n), true);
  return color;
}

test('common-rock roles stay under a clay highlight and ferrite is iron', () => {
  const matrix = channels(COMMON_ROCK_MATERIAL_ROLES.matrix.color);
  const regolith = channels(COMMON_ROCK_MATERIAL_ROLES.regolith.color);
  const ferrite = channels(COMMON_ROCK_MATERIAL_ROLES.ferrite.color);
  const sheen = channels(COMMON_ROCK_MINERAL_SHEEN);
  for (const [name, color] of [['matrix', matrix], ['regolith', regolith]]) {
    assert.ok(Math.max(...color) <= 1, `${name} is not a blown clay highlight`);
    assert.ok(Math.max(...color) - Math.min(...color) < 0.2, `${name} stays a stone, not a tinted crystal`);
  }
  assert.ok(ferrite[2] <= ferrite[0] && ferrite[2] <= ferrite[1], 'ferrite blue is not the crystal channel');
  assert.ok(sheen[2] < sheen[0] && sheen[2] <= sheen[1], 'mineral sheen is iron, not cyan');
  assert.ok(COMMON_ROCK_MATERIAL_ROLES.ferrite.metalness > 0.5);
  assert.ok(COMMON_ROCK_MATERIAL_ROLES.ferrite.roughness < COMMON_ROCK_MATERIAL_ROLES.matrix.roughness);
});

test('the five surface tints are cut stone, not clay-warm or icy crystal', () => {
  assert.equal(ROCK_SURFACE_VARIANTS.length, 5);
  const seen = new Set();
  for (const variant of ROCK_SURFACE_VARIANTS) {
    const [r, g, b] = channels(variant.tint);
    seen.add(variant.tint.join(','));
    assert.ok(!(r > 1.02 && b < 0.92), `clay-warm tint ${variant.tint}`);
    assert.ok(!(b > r + 0.06), `icy crystal tint ${variant.tint}`);
    assert.ok(Math.max(r, g, b) <= 1, `tint stays a paint, not a lamp ${variant.tint}`);
  }
  assert.equal(seen.size, 5);
});
