// X1 — the one-sun rule (STYLE_BIBLE.md §2). A painted sky body's terminator must agree with
// the play key: the sky is one sun, and it is the same sun the ships fly under.
//
// The renderer re-aims the key per sector (renderer.js `_aimKeyLightAtSignatureHero`): a hero at
// screenNdc (nx, ny) gets its DirectionalLight at world (nx·D, H, -ny·D). The 60° chase camera's
// real screen basis is right = -X, up = +Z (camera.js: offset (0, D·sin60, -D·cos60)), so that
// light lands on screen toward (-nx, +ny). The painted terminator must follow the AIMED key for
// EVERY signature hero, not only Helios's construction-time (60,140,40) key.
//
// The pre-X1 profiles were authored one body at a time: Vesta -0.6 (dot -0.999 vs its aimed key)
// and Veil -1.4 (-0.257) lit their worlds from the opposite/lower limb. This test derives the
// expected angle from the same screenNdc data the renderer consumes, so a new hero cannot ship
// with a second sun.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROFILE_BY_ID,
  resolveBackgroundComposition,
} from '../src/data/sectorVisualProfiles.js';

/** The renderer's aimed key, in the sky impostor's screen plane. */
function aimedSkyDirection(screenNdc) {
  const length = Math.hypot(screenNdc[0], screenNdc[1]) || 1;
  return { x: -screenNdc[0] / length, y: screenNdc[1] / length };
}

test('every PROFILE_BY_ID sky hero follows its aimed key (one sun)', () => {
  let heroes = 0;
  for (const [sectorId, profile] of PROFILE_BY_ID) {
    const hero = resolveBackgroundComposition(profile).signatureHero;
    if (!hero) continue; // a plateless/hero-less sky keeps the construction rig
    heroes++;
    assert.ok(Array.isArray(hero.screenNdc) && hero.screenNdc.length >= 2,
      `${sectorId} hero needs an authored screenNdc for the renderer to aim at`);
    const key = aimedSkyDirection(hero.screenNdc);
    const sky = { x: Math.cos(hero.lightAngle), y: Math.sin(hero.lightAngle) };
    const agreement = sky.x * key.x + sky.y * key.y;
    assert.ok(agreement > 0.99,
      `${sectorId} sky terminator ${sky.x.toFixed(2)},${sky.y.toFixed(2)} must follow its aimed `
      + `key ${key.x.toFixed(2)},${key.y.toFixed(2)} (dot ${agreement.toFixed(3)}, `
      + `lightAngle ${hero.lightAngle})`);
    // Every authored hero sits above the flight line, so its lit limb must too.
    assert.ok(sky.y > 0, `${sectorId} is lit from below the horizon`);
  }
  assert.equal(heroes, 6, 'the six authored sky heroes are covered');
});

test('the old Helios, Vesta and Veil terminators would fail the aimed-key rule', () => {
  const compositionFor = (id) => resolveBackgroundComposition(PROFILE_BY_ID.get(id));
  for (const [id, oldAngle] of [
    ['sector_helios_prime', -0.72],
    ['sector_vesta_forge', -0.6],
    ['sector_veil_nebula', -1.4],
  ]) {
    const hero = compositionFor(id).signatureHero;
    const key = aimedSkyDirection(hero.screenNdc);
    const old = { x: Math.cos(oldAngle), y: Math.sin(oldAngle) };
    const agreement = old.x * key.x + old.y * key.y;
    assert.ok(agreement < 0.5,
      `${id} lightAngle ${oldAngle} must fail its aimed key (dot ${agreement.toFixed(3)})`);
  }
});
