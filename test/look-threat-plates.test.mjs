import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as visualFactory from '../src/render/visualFactory.js';

// Owner 2026-11-23: no rings around ships. Hostile hulls in Swarm wear no 2D threat plate at all
// (the crimson rim, under-plate, heading wedge, in-hull glyph and nose lamp are gone): an ordinary
// hostile reads by its silhouette and paint, a boss by its size and the boss bar, and the player's
// current target by the HUD lock bracket and target card. Supersedes design/overhaul/07 section 6.

test('the visual factory no longer builds a Swarm threat plate', () => {
  assert.equal(visualFactory.syncSwarmThreatPlate, undefined);
  assert.equal(visualFactory.swarmThreatPlateWanted, undefined);
  const src = readFileSync(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /sf-swarm-threat-(plate|under|line|chevron|glyph|lamp)\b/,
    'no rim, wedge, glyph or lamp is built for a hostile hull');
});

test('the renderer does not mark hostile hulls each frame', () => {
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /syncSwarmThreatPlate|threatCameraQuat/,
    'no per-hull threat mark pass in the Swarm frame');
});
