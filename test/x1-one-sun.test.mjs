// X1 — the one-sun rule (STYLE_BIBLE.md §2). A painted sky body's terminator must agree with
// the play key: the sky is one sun, and it is the same sun the ships fly under.
//
// The play key is mounted in renderer.js as a DirectionalLight at (60, 140, 40). The chase
// camera sits behind the ship on -Z (offset (0, D·sin60, -D·cos60)), so on screen the key's
// in-plane direction is screen-right = -X and screen-up = +Z: the key reads upper-left.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveBackgroundComposition,
  resolveSectorVisualProfile,
} from '../src/data/sectorVisualProfiles.js';

const PLAY_KEY = { x: 60, z: 40 }; // renderer.js key light, XZ in-plane projection

function screenKeyDirection() {
  const length = Math.hypot(PLAY_KEY.x, PLAY_KEY.z);
  return { x: -PLAY_KEY.x / length, y: PLAY_KEY.z / length };
}

test('Helios signature giant is lit from the same side as the play key', () => {
  const composition = resolveBackgroundComposition(resolveSectorVisualProfile({
    id: 'sector_helios_prime',
    palette: null,
  }));
  const hero = composition.signatureHero;
  assert.ok(hero && hero.kind === 'planet', 'Helios keeps exactly one signature body');
  const key = screenKeyDirection();
  const sky = { x: Math.cos(hero.lightAngle), y: Math.sin(hero.lightAngle) };
  const agreement = sky.x * key.x + sky.y * key.y;
  assert.ok(agreement > 0.98,
    `sky terminator ${sky.x.toFixed(2)},${sky.y.toFixed(2)} must follow the key `
    + `${key.x.toFixed(2)},${key.y.toFixed(2)} (dot ${agreement.toFixed(3)})`);
  assert.ok(sky.x < 0 && sky.y > 0, 'the lit limb reads upper-left, not from the right');
});

test('the old right-hand terminator would fail the one-sun rule', () => {
  const key = screenKeyDirection();
  const old = { x: Math.cos(-0.72), y: Math.sin(-0.72) };
  const agreement = old.x * key.x + old.y * key.y;
  assert.ok(agreement < 0,
    `lightAngle -0.72 lit the giant from the right (dot ${agreement.toFixed(3)})`);
});
