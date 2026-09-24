// §22 C6 — six skies. Plate luminance stays under the starter muzzle and the engine core.
// Exactly one profile is the galaxy.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECTOR_VISUAL_PROFILES,
  resolveSectorVisualProfile,
  skyPlateLuminance,
} from '../src/data/sectorVisualProfiles.js';
import { STARTER_PULSE_MUZZLE_LIGHT_PEAK } from '../src/render/weapons/recipes.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';

function engineCoreIntensity(recipe) {
  const core = recipe.layers.find((layer) => layer.role === 'core');
  return core.intensity;
}

test('six skies sit under the muzzle and the engine, and only Tethys is the galaxy', () => {
  const profiles = Object.values(SECTOR_VISUAL_PROFILES);
  const muzzle = STARTER_PULSE_MUZZLE_LIGHT_PEAK;
  const engine = engineCoreIntensity(KESTREL_MAIN_PLUME_RECIPE);
  assert.equal(profiles.length, 6, 'Helios, core, belt, fringe, anomaly, Tethys');
  assert.ok(muzzle > 1 && engine > muzzle, 'the engine core outshines the starter muzzle');
  const galaxies = profiles.filter((profile) => profile.galaxyPlate === true);
  assert.deepEqual(galaxies.map((profile) => profile.id), ['tethys']);
  for (const profile of profiles) {
    const luminance = skyPlateLuminance(profile);
    assert.ok(luminance < muzzle, `${profile.id} sky ${luminance} is under the muzzle ${muzzle}`);
    assert.ok(luminance < engine, `${profile.id} sky ${luminance} is under the engine ${engine}`);
  }
  const tethys = resolveSectorVisualProfile({ id: 'sector_tethys_junction' });
  assert.equal(tethys.id, 'tethys');
  assert.equal(tethys.background.structure.structureKind, 'galactic_band');
  assert.equal(tethys.background.composition.signatureHero, null, 'the galaxy is the one hero');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_helios_prime' }).galaxyPlate, undefined);
});
