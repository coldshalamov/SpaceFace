// Row 495 review pin — the rock-family place GLB contract.
//
// The runtime mints place_rock_<substance>_<pebble|boulder|monolith> ids in two lanes
// (swarmArena debris via pickDebrisSubstance, world.js field heroes via authoredRockPlaceId).
// Every emittable id must exist in the model-truth census, and the substance pickers must
// never emit one of the two real ROCK_SUBSTANCES that have no authored body
// (vethari_bone, bloom_husk) — those ride authored encounters only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ROCK_PLACE_SUBSTANCES, ROCK_SIZE_CLASSES, ROCK_SUBSTANCES } from '../src/data/rockSubstances.js';
import { DEBRIS_SUBSTANCE_BY_MATERIAL, pickDebrisSubstance, rockSizeClassForRadius } from '../src/systems/swarmArena.js';
import { authoredRockPlaceId } from '../src/systems/world.js';

const census = JSON.parse(readFileSync(
  fileURLToPath(new URL('../src/data/modelTruthCensus.json', import.meta.url)), 'utf8'));
const censusText = JSON.stringify(census);

function censusHasPlaceId(placeId) {
  return censusText.includes(placeId);
}

test('every family substance x size class has its place GLB in the census', () => {
  assert.equal(ROCK_PLACE_SUBSTANCES.length, 8, 'the family is exactly the eight everyday substances');
  for (const sub of ROCK_PLACE_SUBSTANCES) {
    for (const sizeClass of Object.keys(ROCK_SIZE_CLASSES)) {
      const placeId = `place_rock_${sub}_${sizeClass}`;
      assert.ok(censusHasPlaceId(placeId), `${placeId} missing from the census`);
    }
  }
});

test('substances without a family body exist in ROCK_SUBSTANCES but not the place set', () => {
  // The distinction the guards rely on: these are legitimate physics substances that must
  // never mint a place_rock_ id — pinning it keeps the fallback honest if a future row adds
  // them to a spawn table.
  for (const sub of ['vethari_bone', 'bloom_husk']) {
    assert.ok(ROCK_SUBSTANCES[sub], `${sub} should still be a real substance`);
    assert.equal(ROCK_PLACE_SUBSTANCES.includes(sub), false, `${sub} must not be place-gated`);
    for (const sizeClass of Object.keys(ROCK_SIZE_CLASSES)) {
      assert.equal(censusHasPlaceId(`place_rock_${sub}_${sizeClass}`), false,
        `place_rock_${sub}_${sizeClass} unexpectedly exists — this pin needs a rewrite`);
    }
  }
});

test('the debris env-material table only lists family-built substances', () => {
  for (const [material, table] of Object.entries(DEBRIS_SUBSTANCE_BY_MATERIAL)) {
    for (const sub of table) {
      assert.ok(ROCK_PLACE_SUBSTANCES.includes(sub),
        `${material} maps to ${sub}, which has no place GLB`);
    }
  }
});

test('pickDebrisSubstance only emits family-built substances for every material', () => {
  const materials = [...Object.keys(DEBRIS_SUBSTANCE_BY_MATERIAL), 'debris', 'unknown_future', ''];
  // Drive every table slot deterministically: rng sweeps 0..1 in fine steps so each entry
  // in each table is visited.
  for (const material of materials) {
    for (let i = 0; i < 64; i++) {
      const sub = pickDebrisSubstance(material, () => i / 64);
      assert.ok(ROCK_PLACE_SUBSTANCES.includes(sub),
        `material ${material} emitted ${sub}, which has no place GLB`);
    }
  }
});

test('authoredRockPlaceId bands follow the rolled radius and refuse non-built substances', () => {
  assert.equal(authoredRockPlaceId('silicate', 6), 'place_rock_silicate_pebble');
  assert.equal(authoredRockPlaceId('silicate', 13.99), 'place_rock_silicate_pebble');
  assert.equal(authoredRockPlaceId('silicate', 14), 'place_rock_silicate_boulder');
  assert.equal(authoredRockPlaceId('silicate', 23.99), 'place_rock_silicate_boulder');
  assert.equal(authoredRockPlaceId('silicate', 24), 'place_rock_silicate_monolith');
  assert.equal(authoredRockPlaceId('silicate', 44), 'place_rock_silicate_monolith');
  for (const sub of ['vethari_bone', 'bloom_husk', 'not_a_substance', null, undefined]) {
    assert.equal(authoredRockPlaceId(sub, 20), null,
      `${sub} must not mint a place id — no family body exists`);
  }
  // The world.js and swarmArena band helpers agree edge-for-edge.
  for (const r of [0, 6, 13.99, 14, 23.99, 24, 44]) {
    const worldClass = authoredRockPlaceId('ice', r).replace('place_rock_ice_', '');
    assert.equal(rockSizeClassForRadius(r), worldClass, `radius ${r} bands disagree`);
  }
});

test('every emitted place id resolves inside the census', () => {
  for (const material of Object.keys(DEBRIS_SUBSTANCE_BY_MATERIAL)) {
    for (const r of [4, 10, 16, 20, 30, 44]) {
      const sub = pickDebrisSubstance(material, () => 0.37);
      assert.ok(censusHasPlaceId(`place_rock_${sub}_${rockSizeClassForRadius(r)}`),
        `material ${material} radius ${r} resolves a missing place id`);
    }
  }
});
