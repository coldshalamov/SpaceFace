// §22 C6 — six skies. Plate luminance stays under the starter muzzle and the engine core.
// Exactly one profile is the galaxy. The authored set is the six palette-family skies plus
// the per-sector rigs that inherit a family's sky (they share the plate, not a seventh sky).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECTOR_VISUAL_PROFILES,
  resolveBackgroundPaintedSky,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
  skyPlateLuminance,
} from '../src/data/sectorVisualProfiles.js';
import { STARTER_PULSE_MUZZLE_LIGHT_PEAK } from '../src/render/weapons/recipes.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import { resolveDeepFieldStructureRecipe } from '../src/render/deepFieldStructureRecipes.js';

function engineCoreIntensity(recipe) {
  const core = recipe.layers.find((layer) => layer.role === 'core');
  return core.intensity;
}

test('the authored skies sit under the muzzle and the engine, and only Tethys is the galaxy', () => {
  const profiles = Object.values(SECTOR_VISUAL_PROFILES);
  const muzzle = STARTER_PULSE_MUZZLE_LIGHT_PEAK;
  const engine = engineCoreIntensity(KESTREL_MAIN_PLUME_RECIPE);
  // The row's "six skies" is six distinct resolved skies, not six profiles — a sector rig
  // shares its family's plate/structure by frozen reference. A new rig grows the profile
  // count; only a real seventh sky fails this.
  const skyIdentities = new Set(profiles.map((profile) => {
    const paint = resolveBackgroundPaintedSky(profile);
    if (paint && paint.plate) return `plate:${paint.plate}`;
    const structure = resolveBackgroundStructure(profile);
    return `structure:${resolveDeepFieldStructureRecipe(structure).id}`;
  }));
  assert.equal(skyIdentities.size, 6,
    'six distinct skies — the palette families; sector rigs inherit, they do not add a sky');
  assert.ok(muzzle > 1 && engine > muzzle, 'the engine core outshines the starter muzzle');
  const galaxies = profiles.filter((profile) => profile.galaxyPlate === true);
  assert.deepEqual(galaxies.map((profile) => profile.id), ['tethys']);
  const bands = profiles.filter(
    (profile) => resolveBackgroundStructure(profile).structureKind === 'galactic_band',
  );
  assert.deepEqual(bands.map((profile) => profile.id), ['tethys'], 'the galactic band is Tethys alone');
  // The renderer resolves the recipe by recipeId FIRST, structureKind only as fallback —
  // pin the resolved recipe kind too, or a profile could draw the band via a spur recipeId
  // while passing both assertions above.
  const resolvedBands = profiles.filter(
    (profile) => resolveDeepFieldStructureRecipe(resolveBackgroundStructure(profile)).kind === 'galactic_band',
  );
  assert.deepEqual(resolvedBands.map((profile) => profile.id), ['tethys'],
    'the band resolves for Tethys alone on the axis the renderer actually uses');
  for (const profile of profiles) {
    const luminance = skyPlateLuminance(profile);
    assert.ok(luminance < muzzle, `${profile.id} sky ${luminance} is under the muzzle ${muzzle}`);
    assert.ok(luminance < engine, `${profile.id} sky ${luminance} is under the engine ${engine}`);
    // A declared plate must actually pay luminance — a typo'd plate silently resolves to 0
    // and would pass the ceiling while the sky loses its plate.
    const paint = resolveBackgroundPaintedSky(profile);
    if (profile.background && profile.background.paintedSky) {
      assert.ok(paint && luminance > 0,
        `${profile.id} declares a painted plate but resolves to zero luminance`);
    }
  }
  const tethys = resolveSectorVisualProfile({ id: 'sector_tethys_junction' });
  assert.equal(tethys.id, 'tethys');
  assert.equal(tethys.background.structure.structureKind, 'galactic_band');
  assert.equal(tethys.background.composition.signatureHero, null, 'the galaxy is the one hero');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_helios_prime' }).galaxyPlate, undefined);
});
