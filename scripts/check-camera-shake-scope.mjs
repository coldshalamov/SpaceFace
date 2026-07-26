// Camera-shake audience probe for the `camera:shake` seam.
//
// THE DEFECT THIS PINS. `camera:shake` has 13 emitters and the renderer's consumer read only
// `{ amount }`, so a shake was a bare scalar with no notion of where it came from. Two of those
// emitters describe WORLD events — src/render/vfx.js's ship-destruction burst (0.16 for a small hull,
// up to 0.62 for a capital) and src/systems/combat.js's `entity:killed` kick (0.5, fired for EVERY
// entity killed) — so a ship dying anywhere in the sector kicked the player's camera exactly as hard
// as one dying on their nose. Measured on the default tutorial route: six unearned kicks in ~30 s of
// flight, from destructions ~920 WU away, at full 0.16 trauma each.
//
// The fix attenuates at the CONSUMER rather than at 13 call sites: a payload carrying `position` is a
// world event and gets a distance falloff; a payload without one is already player-scoped by
// construction (player hit / death / respawn, drill, tether, presentation cues) and passes through
// untouched. That covers the emitters nobody has audited.
//
// This probe asserts, in order of how likely each is to rot:
//   1. THE CURVE IS SANE — full strength close in, monotonically decreasing, exactly zero at cutoff.
//   2. THE CONSUMER HONORS IT — renderer.js reads `position` and applies the attenuation, and passes
//      un-positioned payloads through unchanged (source pattern; the handler needs a live WebGL
//      renderer to construct, so behavior is pinned at the curve and the emitters instead).
//   3. THE WORLD EMITTERS TAG THEIR POSITION — the two world-event sites send `position`, and the
//      player-scoped sites in combat.js deliberately do not.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SHAKE_CUTOFF_RADIUS_WU,
  SHAKE_FULL_RADIUS_WU,
  shakeDistanceAttenuation,
} from '../src/render/camera.js';

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failures.push(name); console.error(`FAIL ${name}\n     ${err.message}`); }
}

// ---- 1. the curve -----------------------------------------------------------------------------
check('attenuation is full strength inside the full-strength radius', () => {
  for (const d of [0, 1, SHAKE_FULL_RADIUS_WU * 0.5, SHAKE_FULL_RADIUS_WU]) {
    assert.equal(shakeDistanceAttenuation(d), 1, `distance ${d} should be unattenuated`);
  }
});

check('attenuation is exactly zero at and beyond the cutoff radius', () => {
  assert.equal(shakeDistanceAttenuation(SHAKE_CUTOFF_RADIUS_WU), 0, 'cutoff must reach exactly zero, not merely small');
  assert.equal(shakeDistanceAttenuation(SHAKE_CUTOFF_RADIUS_WU * 4), 0, 'beyond cutoff stays zero');
});

check('attenuation decreases monotonically across the falloff band', () => {
  let prev = Infinity;
  for (let d = SHAKE_FULL_RADIUS_WU; d <= SHAKE_CUTOFF_RADIUS_WU; d += 10) {
    const a = shakeDistanceAttenuation(d);
    assert(a <= prev + 1e-12, `attenuation rose between ${d - 10} and ${d} WU (${prev} -> ${a})`);
    assert(a >= 0 && a <= 1, `attenuation out of range at ${d} WU: ${a}`);
    prev = a;
  }
});

check('a mid-range destruction is strongly damped, not merely nudged', () => {
  // The measured regression case: a small hull popping ~920 WU away used to land its full 0.16.
  const att = shakeDistanceAttenuation(920);
  assert(0.16 * att < 0.01, `0.16 trauma at 920 WU should fall under 0.01 (got ${(0.16 * att).toFixed(4)})`);
  // And a kill right beside the player must still be felt at close to full force.
  assert(shakeDistanceAttenuation(60) === 1, 'a kill inside the full-strength radius must not be damped');
});

check('non-finite and negative distances degrade to full strength rather than NaN', () => {
  for (const bad of [NaN, undefined, null, -50, Infinity]) {
    const a = shakeDistanceAttenuation(bad);
    assert(Number.isFinite(a) && a >= 0 && a <= 1, `attenuation for ${String(bad)} must stay in [0,1], got ${a}`);
  }
});

// ---- 2. the consumer --------------------------------------------------------------------------
const rendererSrc = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

check('renderer imports and applies the shared attenuation instead of re-deriving one', () => {
  assert.match(rendererSrc, /import \{[^}]*shakeDistanceAttenuation[^}]*\} from '\.\/camera\.js'/,
    'renderer must import shakeDistanceAttenuation from camera.js (a second local curve would drift)');
  const handler = rendererSrc.slice(rendererSrc.indexOf("bus.on('camera:shake'"));
  assert(handler.includes('shakeDistanceAttenuation'), 'the camera:shake handler must apply the attenuation');
  assert(handler.includes('position'), 'the camera:shake handler must read payload.position');
});

check('un-positioned shakes pass through the consumer unattenuated', () => {
  const handler = rendererSrc.slice(rendererSrc.indexOf("bus.on('camera:shake'"), rendererSrc.indexOf("bus.on('camera:kill'"));
  // Two early-outs: no usable position, and no player to measure against. Both must add full trauma,
  // otherwise the 11 player-scoped emitters would be silently weakened.
  const passThrough = handler.match(/cam\.addTrauma\(amount\)/g) || [];
  assert(passThrough.length >= 2,
    `expected the handler to add unattenuated trauma on both early-outs (found ${passThrough.length})`);
});

// ---- 3. the emitters --------------------------------------------------------------------------
check('the ship-destruction burst tags its world position', () => {
  const vfxSrc = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const emits = [...vfxSrc.matchAll(/emit\('camera:shake',\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map((m) => m[1]);
  assert(emits.length > 0, 'expected camera:shake emitters in vfx.js');
  const destruction = emits.find((body) => body.includes('shake'));
  assert(destruction, 'expected the destruction-burst emitter (amount derived from `shake`)');
  assert(destruction.includes('position'), 'the destruction burst must send position so it can be attenuated');
});

check('the entity-killed kick tags its world position, and player-scoped kicks do not', () => {
  const combatSrc = readFileSync(new URL('../src/systems/combat.js', import.meta.url), 'utf8');
  const emits = [...combatSrc.matchAll(/emit\('camera:shake',\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map((m) => m[1]);
  assert(emits.length >= 6, `expected the known camera:shake emitters in combat.js (found ${emits.length})`);
  const positioned = emits.filter((body) => body.includes('position'));
  assert.equal(positioned.length, 1,
    'exactly one combat.js shake is a world event (entity:killed); the rest are player-scoped and must stay un-positioned');
  assert(positioned[0].includes('0.5'), 'the positioned combat.js shake should be the 0.5 entity:killed kick');
});

if (failures.length) {
  console.error(`\nFAIL check:camera-shake-scope — ${failures.length} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:camera-shake-scope');
