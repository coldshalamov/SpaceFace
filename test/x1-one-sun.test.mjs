// X1 — the one-sun rule (STYLE_BIBLE.md §2). A painted sky body's terminator must agree with
// the play key: the sky is one sun, and it is the same sun the ships fly under.
//
// The renderer re-aims the key per sector (renderer.js `_aimKeyLightAtSignatureHero`): the key's
// POSITION is world (nx·KEY_DIST, KEY_HEIGHT, -ny·KEY_DIST). The 60° chase camera's real screen
// basis is right = -X, up = (0, cos60, sin60), so the light's screen direction is the projection
// of that 3D offset — not the old 2D (-nx, +ny) proxy. The proxy ignored the fixed 96 WU key
// height and reported agreement > 0.99 while the projected key actually sits at dot 0.873–0.979.
//
// This test measures the projected direction and sets an honest same-side bar. The residual is the
// key's out-of-plane component (it is above the sky plane), not a second sun. Only Helios has a
// reviewed capture; Vesta/Veil are data-proven here, not visually proven.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROFILE_BY_ID,
  resolveBackgroundComposition,
} from '../src/data/sectorVisualProfiles.js';

// renderer.js `_aimKeyLightAtSignatureHero` owns these. Kept here as named constants so a change
// to the rig has to be reflected in the test that claims agreement with it.
const KEY_DIST = 160;
const KEY_HEIGHT = 96;
const CAM_TILT = Math.PI / 3; // the 60° chase camera
const SCREEN_RIGHT = { x: -1, y: 0, z: 0 };
const SCREEN_UP = { x: 0, y: Math.cos(CAM_TILT), z: Math.sin(CAM_TILT) };

/** The renderer's aimed key, projected through the 60° chase camera into the sky body's plane. */
function projectedKeyDirection(screenNdc) {
  const [nx, ny] = screenNdc;
  const offset = { x: nx * KEY_DIST, y: KEY_HEIGHT, z: -ny * KEY_DIST };
  const x = offset.x * SCREEN_RIGHT.x + offset.y * SCREEN_RIGHT.y + offset.z * SCREEN_RIGHT.z;
  const y = offset.x * SCREEN_UP.x + offset.y * SCREEN_UP.y + offset.z * SCREEN_UP.z;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** The 2D proxy the first version used: ignores the key's height above the play plane. */
function flatProxyDirection(screenNdc) {
  const length = Math.hypot(screenNdc[0], screenNdc[1]) || 1;
  return { x: -screenNdc[0] / length, y: screenNdc[1] / length };
}

test('every PROFILE_BY_ID sky hero follows its projected key (one sun)', (t) => {
  let heroes = 0;
  let minDot = 1;
  let maxDot = -1;
  for (const [sectorId, profile] of PROFILE_BY_ID) {
    const hero = resolveBackgroundComposition(profile).signatureHero;
    if (!hero) continue; // a plateless/hero-less sky keeps the construction rig
    heroes++;
    assert.ok(Array.isArray(hero.screenNdc) && hero.screenNdc.length >= 2,
      `${sectorId} hero needs an authored screenNdc for the renderer to aim at`);
    const key = projectedKeyDirection(hero.screenNdc);
    const sky = { x: Math.cos(hero.lightAngle), y: Math.sin(hero.lightAngle) };
    const agreement = sky.x * key.x + sky.y * key.y;
    minDot = Math.min(minDot, agreement);
    maxDot = Math.max(maxDot, agreement);
    // Same side, above the horizon. 0.85 is the honest bar for the projected key: the height term
    // lowers the old 2D proxy's 1.000 to 0.873–0.979, and that remainder is out-of-plane light.
    assert.ok(agreement > 0.85,
      `${sectorId} sky terminator ${sky.x.toFixed(2)},${sky.y.toFixed(2)} must follow its projected `
      + `key ${key.x.toFixed(2)},${key.y.toFixed(2)} (dot ${agreement.toFixed(3)}, `
      + `lightAngle ${hero.lightAngle})`);
    // A projected key that collapses back onto the flat proxy would mean KEY_HEIGHT stopped
    // contributing — the exact 2D-proxy defect this test replaced.
    const proxy = flatProxyDirection(hero.screenNdc);
    const proxyDot = proxy.x * key.x + proxy.y * key.y;
    assert.ok(proxyDot < 0.995,
      `${sectorId} projected key collapsed onto the 2D proxy (dot ${proxyDot.toFixed(3)})`);
    // Every authored hero sits above the flight line, so its lit limb must too.
    assert.ok(sky.y > 0, `${sectorId} is lit from below the horizon`);
  }
  assert.equal(heroes, 6, 'the six authored sky heroes are covered');
  t.diagnostic(`projected-key agreement ${minDot.toFixed(3)}..${maxDot.toFixed(3)} (bar 0.85)`);
});

test('the old Helios, Vesta and Veil terminators would fail the projected-key rule', () => {
  const compositionFor = (id) => resolveBackgroundComposition(PROFILE_BY_ID.get(id));
  for (const [id, oldAngle] of [
    ['sector_helios_prime', -0.72],
    ['sector_vesta_forge', -0.6],
    ['sector_veil_nebula', -1.4],
  ]) {
    const hero = compositionFor(id).signatureHero;
    const key = projectedKeyDirection(hero.screenNdc);
    const old = { x: Math.cos(oldAngle), y: Math.sin(oldAngle) };
    const agreement = old.x * key.x + old.y * key.y;
    assert.ok(agreement < 0.5,
      `${id} lightAngle ${oldAngle} must fail its projected key (dot ${agreement.toFixed(3)})`);
  }
});
