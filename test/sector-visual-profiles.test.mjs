import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveBackgroundComposition,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
} from '../src/data/sectorVisualProfiles.js';
import { resolveDeepFieldStructureRecipe } from '../src/render/deepFieldStructureRecipes.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';

test('Helios receives a bespoke high-readability environment profile', () => {
  const profile = resolveSectorVisualProfile({
    id: 'sector_helios_prime',
    palette: SECTOR_PALETTE_CLASSES.core,
  });

  assert.equal(profile.id, 'helios_core');
  assert.equal(profile.skyPalette, 'AZURE');
  assert.equal(profile.background.nebulaOpacity, 0,
    'clear civilized space should not be covered by a full-screen nebula');
  assert.ok(profile.lighting.ambient <= 0.25,
    'space lighting needs directional form instead of flat ambient fill');
  assert.ok(profile.lighting.key >= profile.lighting.ambient * 6);
  assert.ok(profile.post.bloomStrengthScale <= 1);
});

test('sector profiles own a stable background composition instead of only a color grade', () => {
  const helios = resolveBackgroundComposition(resolveSectorVisualProfile({
    id: 'sector_helios_prime',
    palette: SECTOR_PALETTE_CLASSES.core,
  }));
  const anomaly = resolveBackgroundComposition(resolveSectorVisualProfile({
    id: 'unknown-anomaly',
    palette: { ...SECTOR_PALETTE_CLASSES.anomaly },
  }));

  assert.equal(helios.signatureHero.kind, 'planet');
  assert.equal(helios.signatureHero.type, 'gas');
  assert.equal(helios.signatureHero.ring, true);
  assert.ok(helios.signatureHero.screenNdc[0] >= 0.5,
    'the Helios landmark stays in the right-side background rather than covering the player ship');
  assert.ok(helios.planetChance > anomaly.planetChance,
    'civilized core space favors celestial landmarks over anomalies');
  assert.ok(anomaly.wormholeChance > helios.wormholeChance,
    'anomaly space has its own recognizable hero-object grammar');
  assert.equal(Object.isFrozen(helios), true);
  assert.equal(Object.isFrozen(helios.signatureHero), true);
});

test('background composition resolution clamps malformed optional profile data', () => {
  const composition = resolveBackgroundComposition({
    background: {
      composition: {
        planetChance: 8,
        wormholeChance: -4,
        ringChance: Number.NaN,
        cometInterval: [90, 10],
      },
    },
  });

  assert.equal(composition.planetChance, 1);
  assert.equal(composition.wormholeChance, 0);
  assert.equal(composition.ringChance, 0.45);
  assert.deepEqual(composition.cometInterval, [10, 90]);
});

test('palette classes resolve stable visual families after save round-trips', () => {
  const copiedAnomalyPalette = { ...SECTOR_PALETTE_CLASSES.anomaly };
  const profile = resolveSectorVisualProfile({ id: 'sector_unknown', palette: copiedAnomalyPalette });

  assert.equal(profile.id, 'anomaly');
  assert.equal(profile.skyPalette, 'ION');
  assert.equal(profile.background.nebulaOpacity, 0,
    'anomaly identity must stay localized rather than lifting the full frame');
  const coreRecipe = resolveDeepFieldStructureRecipe(resolveBackgroundStructure(resolveSectorVisualProfile(null)));
  const anomalyRecipe = resolveDeepFieldStructureRecipe(resolveBackgroundStructure(profile));
  assert.notEqual(anomalyRecipe.id, coreRecipe.id,
    'anomaly identity comes from an authored spatial composition, not a color wash');
  assert.deepEqual(anomalyRecipe.ribbons, [],
    'the anomaly composition must not replace fullscreen gas with visible procedural wires');
  assert.ok(anomalyRecipe.starAssociations.length >= 2,
    'the anomaly composition retains deterministic localized stellar structure');
  assert.ok(profile.post.bloomStrengthScale <= 1,
    'sector identity must not be created by globally increasing bloom');
});

test('visual profiles are immutable shared data and unknown sectors fall back safely', () => {
  const profile = resolveSectorVisualProfile(null);

  assert.equal(profile.id, 'core');
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.lighting), true);
  assert.throws(() => { profile.lighting.key = 99; }, TypeError);
});
