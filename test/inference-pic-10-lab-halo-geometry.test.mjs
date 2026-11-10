// PIC-10 — the graphics lab must not teach a camera-facing halo (soft card) as the method.
//
// The lab is the tool agents read before authoring VFX, so its demo objects and its prose are the
// contract. This asserts the two glow demos named in the line (`layerHalo` on the demo ship,
// `boltHalo` on the projectile) are additive geometry coaxial with the drive/bolt rather than a
// `THREE.Sprite` card, and that the lab's teaching text names the ban.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/render/graphicsLab.js', import.meta.url), 'utf8');

function haloDeclaration(name) {
  const at = SRC.indexOf(`halo.name = '${name}'`);
  assert.notEqual(at, -1, `graphicsLab.js no longer declares ${name}`);
  // The declaration and its constructed object sit immediately above the name assignment.
  return SRC.slice(Math.max(0, at - 900), at);
}

for (const name of ['layerHalo', 'boltHalo']) {
  test(`${name} is additive geometry, not a camera-facing Sprite card`, () => {
    const block = haloDeclaration(name);
    assert.match(block, /new THREE\.Mesh\(/, `${name} must be built from geometry`);
    assert.doesNotMatch(block, /new THREE\.Sprite\(/, `${name} must not be a camera-facing sprite card`);
    assert.doesNotMatch(block, /SpriteMaterial/, `${name} must not use a sprite material`);
    assert.match(block, /AdditiveBlending/, `${name} must stay additive geometry glow`);
    assert.match(block, /toneMapped: false/, `${name} must carry HDR headroom for bloom`);
  });
}

test('the lab prose names the camera-facing card as banned, not as the method', () => {
  assert.match(SRC, /camera-facing (sprite|halo) card/i, 'the lab must name the banned construction');
  assert.match(SRC, /not the method/i, 'the lab must say the card is not the method');
});

test('the lab stops prescribing a halo sprite in its author prompts', () => {
  assert.doesNotMatch(SRC, /Halo sprite: makeStarTexture/, 'the texture prompt still teaches a halo sprite');
  assert.doesNotMatch(SRC, /Halo: child Sprite with makeStarTexture/, 'the projectile prompt still teaches a sprite halo');
  assert.doesNotMatch(SRC, /additive Sprite halo \(makeStarTexture\)/, 'the compare prompt still teaches a sprite halo');
});
