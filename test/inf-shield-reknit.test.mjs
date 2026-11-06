// inf-shield-reknit — a broken shield coming back online is something you can SEE.
//
// The shell's break and its hits were a deep picture, but the DOWN -> UP moment was deliberately
// silent: after a break you learned your shield was back only by taking the next hit on the
// hull. Now the recharge completing through zero runs one soft re-knit sweep through the existing
// lattice — below a hit's punch, below the rupture band — on your ship and on every enemy shell.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SHIELD_BUBBLE_PRESENTATION_EPSILON,
  SHIELD_REKNIT_FLASH,
  shieldReknitFlashForTransition,
  shouldPresentShieldBubble,
} from '../src/render/weapons/shieldBubblePresentation.js';

test('a shield completing its recharge through zero earns the re-knit sweep', () => {
  assert.equal(shieldReknitFlashForTransition(0, 0.4), SHIELD_REKNIT_FLASH);
  assert.equal(shieldReknitFlashForTransition(0, 12), SHIELD_REKNIT_FLASH);
  // Even a partial first tick back (regen just crossed zero) reads.
  assert.equal(shieldReknitFlashForTransition(0, 0.001), SHIELD_REKNIT_FLASH);
});

test('mid-regeneration charging stays silent — no ghost sphere while the shield is healthy', () => {
  assert.equal(shieldReknitFlashForTransition(0.1, 0.2), 0);
  assert.equal(shieldReknitFlashForTransition(0.5, 0.9), 0);
  assert.equal(shieldReknitFlashForTransition(3, 3), 0);
});

test('hits and breaks are the existing reads — the re-knit never fires for them', () => {
  // A hit dropping the shield (still up) is the bite, not the re-knit.
  assert.equal(shieldReknitFlashForTransition(1.0, 0.2), 0);
  // The break (up -> zero) is the collapse read, not the re-knit.
  assert.equal(shieldReknitFlashForTransition(1.5, 0), 0);
  // Broken and still broken: nothing.
  assert.equal(shieldReknitFlashForTransition(0, 0), 0);
});

test('a shell built cold with its shield already up (first sync) never pulses', () => {
  // The caller falls back to the current value when no previous sample exists, so a fresh mesh
  // presents prev === current and must not read as a re-online.
  const current = 4;
  assert.equal(shieldReknitFlashForTransition(current, current), 0);
  assert.equal(shieldReknitFlashForTransition(null, 4), 0, 'non-finite input fails closed');
});

test('the re-knit sweep is its own read: softer than a hit, under the rupture band, visible', () => {
  // A hit punch adds 0.8; the rupture band starts at 1.0 (collapse sets 2.4).
  assert.ok(SHIELD_REKNIT_FLASH < 0.8, 'softer than a hit bite');
  assert.ok(SHIELD_REKNIT_FLASH < 1.0, 'charges the lattice, never the failure sequence');
  // And it actually presents: the shell becomes visible for the sweep.
  assert.equal(shouldPresentShieldBubble(4, SHIELD_REKNIT_FLASH, false, 0), true);
  assert.ok(SHIELD_REKNIT_FLASH > SHIELD_BUBBLE_PRESENTATION_EPSILON);
});

test('the live owner is wired: the up path consults the transition and the shell owns the recovery', () => {
  const bubble = readFileSync(
    new URL('../src/render/weapons/shieldBubblePresentation.js', import.meta.url), 'utf8');
  assert.match(
    bubble,
    /const reknit = shieldReknitFlashForTransition\(previousShield, entity\.shield\);/,
    'the per-entity presentation consults the DOWN -> UP transition',
  );
  assert.match(
    bubble,
    /if \(reknit > 0 && uniforms\.uFlash\.value < reknit\) \{/,
    'the sweep never overrides a hotter in-flight read',
  );
  const shell = readFileSync(
    new URL('../src/render/weapons/shieldShell.js', import.meta.url), 'utf8');
  assert.match(shell, /FAILURE AND RE-KNIT/, 'the sweep rides the shell lattice, no new shader');
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(
    renderer,
    /updateEntityShieldBubblePresentation/,
    'the pooled and fallback lanes share the per-entity presentation owner',
  );
});
