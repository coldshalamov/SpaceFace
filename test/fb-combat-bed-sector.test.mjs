// FB-122 — the combat bed knows the sector. Every SECTOR_BEDS row carries a stem-weight
// register; `resolveThemeMatrix` multiplies the state's authored stem weights by the sector
// register into `audibleStemWeights`, so the same fight in a core sector and a fringe sector
// does not sound like the same room. Sector weighting changes only on `sector:enter`; state
// weights and encounter hysteresis stay exactly where the theme law put them. No new stems.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';
import {
  mixAudibleStemWeights,
  resolveThemeMatrix,
  SECTOR_BEDS,
  THEME_STEM_WEIGHTS,
} from '../src/audio/themeMatrix.js';

const SEED = 4242;
const STEM_KEYS = ['A', 'B', 'C', 'D'];

function themeHost() {
  const host = Object.create(audio);
  host.rt = {};
  host.state = { playerId: 'p', entities: new Map() };
  host._syncEnvironmentMix = () => {};
  return host;
}

test('every sector bed carries a stem register over the same four stems — no new stems', () => {
  assert.equal(SEED, 4242);
  for (const [sectorId, row] of Object.entries(SECTOR_BEDS)) {
    assert.ok(row.stemWeights, `${sectorId} must carry a stem register`);
    for (const key of STEM_KEYS) {
      assert.ok(Number.isFinite(row.stemWeights[key]),
        `${sectorId}.stemWeights.${key} must be a finite weight`);
      assert.ok(row.stemWeights[key] >= 0 && row.stemWeights[key] <= 1.5,
        `${sectorId}.${key}=${row.stemWeights[key]} stays inside the register`);
    }
  }
  // The register rides the existing stems — the alphabet does not grow.
  for (const row of Object.values(SECTOR_BEDS)) {
    assert.deepEqual(Object.keys(row.stemWeights).sort(), STEM_KEYS);
  }
});

test('core and fringe sectors register audibly different combat mixes', () => {
  const core = resolveThemeMatrix({ state: 'combat', sectorId: 'sector_helios_prime' });
  const fringe = resolveThemeMatrix({ state: 'combat', sectorId: 'sector_sker_haven' });
  const belt = resolveThemeMatrix({ state: 'combat', sectorId: 'sector_ceres_belt' });
  // Same fight, three rooms: the AUDIBLE mix differs, the STATE row does not.
  assert.notDeepEqual(core.audibleStemWeights, fringe.audibleStemWeights,
    'helios and sker must not put the same fight mix on the stems');
  assert.notDeepEqual(core.audibleStemWeights, belt.audibleStemWeights);
  assert.notDeepEqual(fringe.audibleStemWeights, belt.audibleStemWeights);
  // State identity is untouched: the combat row is THE row in every sector.
  for (const theme of [core, fringe, belt]) {
    assert.equal(theme.stemWeights, THEME_STEM_WEIGHTS.combat,
      'the sector register never rewrites the state row');
    assert.equal(theme.state, 'combat');
  }
  // Sker is a pirate haven — the fight reads full-combat (C stays 1), the calm lead is muted.
  assert.ok(fringe.audibleStemWeights.C > core.audibleStemWeights.C,
    'the fringe register must not soften the combat stem under helios');
  assert.ok(fringe.audibleStemWeights.A < core.audibleStemWeights.A,
    'the calm travel lead is muted harder in the fringe');
  // The sector register is exposed, so the mixer can see what it is mixing against.
  assert.deepEqual(fringe.sectorStemWeights, SECTOR_BEDS.sector_sker_haven.stemWeights);
  assert.deepEqual(core.audibleStemWeights,
    mixAudibleStemWeights(THEME_STEM_WEIGHTS.combat, SECTOR_BEDS.sector_helios_prime.stemWeights));
});

test('sector weighting changes only on sector:enter — never mid-fight', () => {
  const host = themeHost();
  // Entering a sector registers its stem vector.
  host._applyThemeMatrix('sector_helios_prime');
  assert.equal(host.rt._themeSectorId, 'sector_helios_prime');
  assert.deepEqual(host.rt._themeMatrix.sectorStemWeights,
    SECTOR_BEDS.sector_helios_prime.stemWeights);
  // A theme re-resolve with no sector argument keeps the room — the fight does not
  // retune the sector on its own frame.
  host._applyThemeMatrix();
  assert.equal(host.rt._themeSectorId, 'sector_helios_prime',
    'a mid-fight resolve must not drift the sector');
  assert.deepEqual(host.rt._themeMatrix.sectorStemWeights,
    SECTOR_BEDS.sector_helios_prime.stemWeights);
  // The next sector:enter is the only door.
  host._applyThemeMatrix('sector_io_reach');
  assert.equal(host.rt._themeSectorId, 'sector_io_reach');
  assert.deepEqual(host.rt._themeMatrix.sectorStemWeights,
    SECTOR_BEDS.sector_io_reach.stemWeights);
  // The fight's own frame resolves against the RETAINED sector — threat never picks a room.
  const underFire = resolveThemeMatrix({ state: 'combat', threat: 0.9, sectorId: 'sector_io_reach' });
  assert.deepEqual(underFire.sectorStemWeights, SECTOR_BEDS.sector_io_reach.stemWeights,
    'threat does not retune the sector register');
});

test('state weights and hysteresis are untouched by the sector register', () => {
  // Every state's authored row survives resolution — the register mixes, it does not rewrite.
  for (const state of Object.keys(THEME_STEM_WEIGHTS)) {
    for (const sectorId of Object.keys(SECTOR_BEDS)) {
      const theme = resolveThemeMatrix({ state, sectorId });
      assert.equal(theme.stemWeights, THEME_STEM_WEIGHTS[state],
        `${state}@${sectorId} must keep its authored row`);
      assert.deepEqual(theme.sectorStemWeights, SECTOR_BEDS[sectorId].stemWeights);
    }
  }
  // A missing/unknown register is neutral — the state row passes through unchanged.
  const neutral = mixAudibleStemWeights(THEME_STEM_WEIGHTS.combat, null);
  assert.deepEqual(neutral, { A: 0.25, B: 0.35, C: 1, D: 0 });
  const unregistered = resolveThemeMatrix({ state: 'combat', sectorId: 'sector_no_such_place' });
  assert.ok(unregistered.bed, 'an unknown sector still resolves a bed');
});
