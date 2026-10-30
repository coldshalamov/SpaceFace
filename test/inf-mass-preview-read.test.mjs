// Mass you can read before you swing (Lane 2 seed). The latch ring already said CAN; now the
// caption under the ring answers the swing question — the target's share of the coupled pair
// (the bridle's own fraction) bands the verdict, and the mass prints in the target panel's own
// bare-number convention. Seeds keep their VERB-25 word; the read never fights the bracket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { massPreviewRead, massPreviewWord, massSeedPreviewWord } from '../src/ui/masslineHud.js';

const PLAYER = 6000;

test('the band follows the bridle share: heavy bodies will not budge', () => {
  // target 30x player -> share .968 -> WON'T BUDGE
  assert.equal(massPreviewRead({ mass: 180000 }, PLAYER).word, "MASS 180000 · WON'T BUDGE");
  // target ~2x player -> share .667 -> HEAVY HAUL
  assert.equal(massPreviewRead({ mass: 12000 }, PLAYER).word, 'MASS 12000 · HEAVY HAUL');
  // target ~player -> share .5 -> EVEN PULL
  assert.equal(massPreviewRead({ mass: 6000 }, PLAYER).word, 'MASS 6000 · EVEN PULL');
  // target ~1/10 player -> share .09 -> SWINGS LOOSE
  assert.equal(massPreviewRead({ mass: 600 }, PLAYER).word, 'MASS 600 · SWINGS LOOSE');
});

test('the physics-body mass wins when present, and junk reads nothing', () => {
  assert.equal(massPreviewRead({ mass: 1, physicsBody: { mass: 18000 } }, PLAYER).word,
    'MASS 18000 · HEAVY HAUL', 'the physics body carries the real mass');
  assert.equal(massPreviewRead({ mass: 1, physicsBody: { mass: 24000 } }, PLAYER).word,
    "MASS 24000 · WON'T BUDGE", 'the 0.8 share boundary reads as immovable');
  assert.equal(massPreviewRead(null, PLAYER), null);
  assert.equal(massPreviewRead({ mass: 0 }, PLAYER), null);
  assert.equal(massPreviewRead({ mass: 400 }, 0), null, 'no self mass, no claim');
  assert.equal(massPreviewWord(undefined, PLAYER), '');
});

test('fractional masses keep the target panel convention', () => {
  const read = massPreviewRead({ mass: 33.3333 }, PLAYER);
  assert.equal(read.word, 'MASS 33.33 · SWINGS LOOSE');
});

test('the read coexists with the seed word — seeds keep their own voice', () => {
  const seedEntity = { data: { massSeed: true, massSeedState: { phase: 'armed' } } };
  assert.match(massSeedPreviewWord(seedEntity), /SEED/);
  // a seed body with mass would read both; the HUD gives the seed the line (render order)
  assert.ok(massPreviewRead({ mass: 600 }, PLAYER).word.includes('SWINGS LOOSE'));
});
