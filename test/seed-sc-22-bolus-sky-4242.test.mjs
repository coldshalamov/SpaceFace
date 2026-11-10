// SEED-SC-22 — the Bolus throat does not wear the core trade-constellation sky.
// The resolver is pure data. Seed 4242 is the sitting seed; the sector card does not roll.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { BOLUS_PALETTE } from '../src/data/theBolus.js';
import {
  SECTOR_VISUAL_PROFILES,
  resolveBackgroundSky,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
} from '../src/data/sectorVisualProfiles.js';
import { resolveDeepFieldStructureRecipe } from '../src/render/deepFieldStructureRecipes.js';
import { STELLAR_FORMATIONS, stellarFormationIndex } from '../src/render/deepFieldStars.js';

test('sector_the_bolus resolves a viscera throat, not the core trade constellation (seed 4242)', () => {
  const sector = SECTORS.find((row) => row.id === 'sector_the_bolus');
  assert.ok(sector, 'the live sector list includes the Bolus');
  assert.equal(sector.palette.nebulaTint, BOLUS_PALETTE.nebulaTint);
  assert.equal(sector.palette.nebulaTint, 0x2a0810);

  const profile = resolveSectorVisualProfile(sector);
  assert.equal(profile.id, 'viscera');
  assert.equal(profile, SECTOR_VISUAL_PROFILES.viscera);
  for (const family of ['core', 'helios_core', 'belt', 'fringe', 'anomaly', 'tethys']) {
    assert.notEqual(profile, SECTOR_VISUAL_PROFILES[family], `viscera must not be the ${family} plate`);
  }

  assert.equal(resolveBackgroundSky(profile), null, 'the throat does not bind a family sky plate');

  const structure = resolveBackgroundStructure(profile);
  assert.equal(structure.recipeId, 'viscera_wet_throat');
  assert.notEqual(structure.recipeId, 'core_trade_constellation');
  const recipe = resolveDeepFieldStructureRecipe(structure);
  assert.equal(recipe.id, 'viscera_wet_throat');
  assert.notDeepEqual(recipe.starAssociations, resolveDeepFieldStructureRecipe({
    recipeId: 'core_trade_constellation',
  }).starAssociations);

  const formation = STELLAR_FORMATIONS[stellarFormationIndex(recipe.id)];
  assert.ok(formation, 'the throat has its own stars');
  assert.equal(formation.name, 'close-wet-throat');
  assert.notEqual(formation.name, 'populous-core-spiral');
  assert.notEqual(formation.shape, 'spiral');

  const byTint = resolveSectorVisualProfile({ id: 'sector_unknown_viscera', palette: BOLUS_PALETTE });
  assert.equal(byTint.id, 'viscera', 'the viscera tint no longer falls through to core');
});
