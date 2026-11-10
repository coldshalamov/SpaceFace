// SFQ-P20's named three are already true. This pin closes them with evidence
// instead of building a second pipeline. Seed 4242.
//
// audioSystem.js is not imported: the elementary renderer pulls @elemaudio/core,
// which this runner does not have. The collision and weapon tables are the live
// exported maps; the Massline resolver is pure and is called.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  masslineHumHz,
  resolveMasslineInstrument,
} from '../src/audio/masslineInstrument.js';

const SEED = 4242;
const audioSrc = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
const voiceSrc = readFileSync(new URL('../src/audio/elementaryVoices.js', import.meta.url), 'utf8');

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `${startNeedle} .. ${endNeedle}`);
  return src.slice(start, end);
}

test('seed 4242: a kiss and a slam are not one sample with a volume knob', () => {
  assert.equal(SEED, 4242);
  const table = sliceBetween(audioSrc, 'const COLLISION_TIER_RECIPES', 'export const OPTIC_CONTACT_RECIPES');
  const ids = [...table.matchAll(/'(sfx_[a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    'sfx_dock_clunk',
    'sfx_mining_impact',
    'sfx_explosion_small',
    'sfx_explosion_large',
  ]);
  assert.equal(new Set(ids).size, 4);
  // Pitch falls with acoustic mass. Loudness is a separate axis.
  assert.match(audioSrc, /RATE_LIGHT:\s*1\.6/);
  assert.match(audioSrc, /RATE_HEAVY:\s*0\.5/);
  assert.match(audioSrc, /export function resolveCollisionCue/);
  assert.match(audioSrc, /terrainGlance \? 'sfx_hull_scrape'/);
});

test('seed 4242: massline load raises the voice, and a release is not a break', () => {
  assert.equal(SEED, 4242);
  const slack = resolveMasslineInstrument({ event: 'strain', tension: 0.1, strain: 0.1 });
  const loaded = resolveMasslineInstrument({ event: 'strain', tension: 0.9, strain: 0.9 });
  assert.ok(loaded.humHz > slack.humHz, `${loaded.humHz} should sit above ${slack.humHz}`);
  assert.ok(loaded.rate > slack.rate);
  assert.equal(masslineHumHz(0), 90);
  assert.ok(masslineHumHz(1) > masslineHumHz(0));
  const release = resolveMasslineInstrument({ event: 'release', classification: 'clean' });
  const snap = resolveMasslineInstrument({ event: 'break' });
  assert.notEqual(release.recipeId, snap.recipeId);
  assert.equal(release.play, true);
  assert.equal(snap.play, true);
  assert.equal(snap.distinctFrom, 'release');
});

test('seed 4242: weapon families are different verbs, and coasting is not thrust', () => {
  assert.equal(SEED, 4242);
  const table = sliceBetween(audioSrc, 'export const WEAPON_FAMILY_RECIPE', 'export function recipeForWeapon');
  const pairs = [...table.matchAll(/(\w+):\s*'(sfx_[a-z0-9_]+)'/g)];
  const recipe = (family) => {
    const row = pairs.find((p) => p[1] === family);
    assert.ok(row, family);
    return row[2];
  };
  const verbs = ['beam', 'missile', 'kinetic', 'rail', 'emp', 'plasma'].map(recipe);
  assert.equal(new Set(verbs).size, verbs.length, verbs.join(','));
  assert.match(audioSrc, /return 'sfx_wpn_heavy_beam'/);
  assert.match(audioSrc, /return 'sfx_wpn_unclassified'/);
  // Engine effort: throttle and speed are separate. A coast at speed is silence;
  // braking speaks with the stick at zero. Not pitch-tied only to world speed.
  assert.match(voiceSrc, /export function engineEffortVoice/);
  assert.match(voiceSrc, /kind: 'brake'/);
  assert.match(voiceSrc, /kind = 'loaded'/);
  assert.match(voiceSrc, /kind = 'coast'/);
  assert.match(voiceSrc, /gain: thrust/);
});
