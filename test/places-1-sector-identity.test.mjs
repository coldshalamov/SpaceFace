// PLACES-1 — items 1 and 2 of INV-25 §4 (.devshots/director/inv/INV-25-places-and-vibes/RECEIPT.md):
// no story sector shares a family look (Io Reach / Charon Expanse / Ashfall Reach get their own
// rigs), and the two big family lookalike groups split (the icy fringe trio gets the pale-ice
// sky + mood; Ashfall gets its burn-scoured plate). This file pins the identity claims:
// resolution, adjacent-sector distinction, plate registration + luminance band, mood wiring,
// and the composition grammar of every new row.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROFILE_BY_ID,
  SECTOR_VISUAL_PROFILES,
  resolveBackgroundComposition,
  resolveBackgroundPaintedSky,
  resolveBackgroundSky,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
} from '../src/data/sectorVisualProfiles.js';
import {
  LOOK_MOODS,
  LOOK_MOOD_BY_PROFILE,
  resolveLookLighting,
  resolveLookMood,
  resolveLookMoodId,
} from '../src/data/lookMoods.js';
import { DEEP_SKY_PLATES } from '../src/render/deepSkyPlates.js';
import { decodePng, measurePlate } from '../tools/art/bake_deep_sky_plates.mjs';
import { SECTORS } from '../src/data/sectors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/background/deep-sky/manifest.json'), 'utf8'));

// ── Item 1 — the three story sectors resolve their own rig, not a family look ─────────────────

test('PLACES-1.1: the three profile-less story sectors resolve their own authored rigs', () => {
  const cases = [
    ['sector_io_reach', 'io_reach', 'fringe'],
    ['sector_charon_expanse', 'charon_expanse', 'belt'],
    ['sector_ashfall_reach', 'ashfall_reach', 'anomaly'],
  ];
  for (const [sectorId, rigId, familyId] of cases) {
    const profile = resolveSectorVisualProfile({ id: sectorId });
    assert.equal(profile.id, rigId, `${sectorId} resolves its own rig`);
    assert.notEqual(profile.id, familyId, `${sectorId} no longer wears the plain ${familyId} family look`);
    assert.notEqual(profile, SECTOR_VISUAL_PROFILES[familyId]);
    // The receipt's row spec: key/fill colour, hero body, planetTypes — all authored.
    assert.ok(Number.isFinite(profile.lighting.keyColor) && Number.isFinite(profile.lighting.fillColor),
      `${sectorId} rig carries authored key/fill tints`);
    const composition = resolveBackgroundComposition(profile);
    assert.ok(composition.signatureHero, `${sectorId} authors its own hero body`);
    assert.ok(Array.isArray(composition.planetTypes) && composition.planetTypes.length > 0,
      `${sectorId} authors its own planetTypes`);
  }
  // The rest of the story sectors keep their authored rows (nothing else moved).
  assert.equal(resolveSectorVisualProfile({ id: 'sector_helios_prime' }).id, 'helios_core');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_tethys_junction' }).id, 'tethys');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_ceres_belt' }).id, 'ceres_belt');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_vesta_forge' }).id, 'vesta_forge');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_pallas_drift' }).id, 'pallas_drift');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_sker_haven' }).id, 'sker_haven');
  assert.equal(resolveSectorVisualProfile({ id: 'sector_veil_nebula' }).id, 'anomaly');
});

test('PLACES-1.1: adjacent sectors no longer match — the receipt\'s stranger test, as data', () => {
  // Io -> Nyx: same palette class, but the frame reads differently on every authored axis.
  const io = resolveSectorVisualProfile({ id: 'sector_io_reach' });
  const nyx = resolveSectorVisualProfile({
    id: 'sector_nyx_march', palette: SECTOR_VISUAL_PROFILES.fringe && { nebulaTint: 0x8a1e1e },
  });
  assert.equal(nyx.id, 'fringe', 'Nyx still falls back to the plain fringe family');
  assert.notEqual(resolveLookMoodId(io), resolveLookMoodId(nyx), 'Io and Nyx wear different moods');
  assert.notEqual(
    resolveLookLighting(io).keyColor, resolveLookLighting(nyx).keyColor, 'Io and Nyx keys differ');
  const ioHero = resolveBackgroundComposition(io).signatureHero;
  const nyxHero = resolveBackgroundComposition(nyx).signatureHero;
  assert.notDeepEqual(ioHero.screenNdc, nyxHero.screenNdc, 'Io and Nyx hang different hero bodies');

  // Veil -> Ashfall: the endgame no longer shows the Veil's sky.
  const ashfall = resolveSectorVisualProfile({ id: 'sector_ashfall_reach' });
  const veil = resolveSectorVisualProfile({ id: 'sector_veil_nebula' });
  assert.notEqual(resolveBackgroundSky(ashfall).plate, resolveBackgroundSky(veil).plate,
    'Ashfall no longer binds the electromagnetic scar');
  assert.notEqual(resolveLookMoodId(ashfall), resolveLookMoodId(veil), 'Ashfall and the Veil wear different moods');
  assert.equal(resolveBackgroundSky(ashfall).plate, 'sky-ashfall-burn-front');
  // The anomaly's violet accent halo belongs to the Veil's scar; Ashfall drops it.
  assert.equal(resolveBackgroundPaintedSky(ashfall), null, 'Ashfall carries no accent plate over the burn');
  assert.ok(resolveBackgroundPaintedSky(veil), 'the Veil keeps its cold-halo accent');
  // A raider hellhole does not roll research-space wormholes at the anomaly family rate.
  const ashfallComposition = resolveBackgroundComposition(ashfall);
  assert.ok(ashfallComposition.wormholeChance <= 0.1,
    `Ashfall wormholeChance ${ashfallComposition.wormholeChance} stays rare`);
});

test('PLACES-1.1: every PROFILE_BY_ID row still names a real authored sector', () => {
  const sectorIds = new Set(SECTORS.map((s) => s.id));
  for (const key of PROFILE_BY_ID.keys()) {
    assert.ok(sectorIds.has(key), `profile key ${key} has no authored sector`);
  }
});

// ── Item 2 — the family splits: pale ice for the icy fringe, the burn for Ashfall ─────────────

test('PLACES-1.2: the icy fringe trio resolves the pale-ice family, the plain fringe keeps its filament', () => {
  for (const sectorId of ['sector_haumea_rift', 'sector_eris_margin', 'sector_nereid_shoal']) {
    const profile = resolveSectorVisualProfile({ id: sectorId });
    assert.equal(profile.id, 'pale_ice', `${sectorId} resolves the pale-ice family`);
    assert.equal(resolveBackgroundSky(profile).plate, 'sky-fringe-pale-ice-shelf');
    assert.equal(resolveLookMoodId(profile), 'pale_ice');
    // The fringe's own grammar: the accent layer stays deliberately plateless — the baked
    // backdrop IS the region's sky.
    assert.equal(resolveBackgroundPaintedSky(profile), null);
  }
  // The other five fringe-class sectors still share the CRIMSON tidal filament.
  for (const sectorId of ['sector_kepler_scar', 'sector_nyx_march', 'sector_proteus_well', 'sector_eunomia_gulf']) {
    const profile = resolveSectorVisualProfile({
      id: sectorId, palette: { nebulaTint: SECTOR_VISUAL_PROFILES.fringe && 0x8a1e1e },
    });
    assert.equal(profile.id, 'fringe', `${sectorId} keeps the plain fringe family`);
    assert.equal(resolveBackgroundSky(profile).plate, 'sky-fringe-tidal-filament');
    assert.notEqual(resolveBackgroundSky(profile).plate, 'sky-fringe-pale-ice-shelf');
  }
  // An icy-fringe frame and a plain-fringe frame disagree on mood, palette and hero.
  const haumea = resolveSectorVisualProfile({ id: 'sector_haumea_rift' });
  const kepler = resolveSectorVisualProfile({
    id: 'sector_kepler_scar', palette: { nebulaTint: 0x8a1e1e },
  });
  assert.notEqual(resolveLookMoodId(haumea), resolveLookMoodId(kepler));
  assert.notEqual(haumea.skyPalette, kepler.skyPalette);
  assert.notDeepEqual(
    resolveBackgroundComposition(haumea).signatureHero.screenNdc,
    resolveBackgroundComposition(kepler).signatureHero.screenNdc);
});

test('PLACES-1.2: the two new backdrops are registered, shipped, and in the action-over-sky band', () => {
  const expected = {
    'sky-fringe-pale-ice-shelf': { url: '/assets/background/deep-sky/sky-fringe-pale-ice-shelf.png' },
    'sky-ashfall-burn-front': { url: '/assets/background/deep-sky/sky-ashfall-burn-front.png' },
  };
  for (const [id, want] of Object.entries(expected)) {
    const plate = DEEP_SKY_PLATES[id];
    assert.ok(plate, `${id} is registered in src/render/deepSkyPlates.js`);
    assert.equal(plate.url, want.url);
    assert.equal(plate.width, 2048);
    assert.equal(plate.height, 1024);
    assert.equal(plate.residentBytes, 11184812, `${id} budgets from the exact RGBA8 chain including mips`);
    // The manifest and the shipped bytes agree with the registry (the pipeline test covers every
    // manifest plate; this pins the two new ids end to end at the same bar).
    const entry = manifest.plates.find((p) => p.id === id);
    assert.ok(entry, `${id} is listed in the bake manifest`);
    assert.equal(entry.width, plate.width);
    assert.equal(entry.height, plate.height);
    assert.equal(entry.residentBytes, plate.residentBytes);
    assert.equal(`/${entry.file}`, plate.url);
    // The six vm-drop skies obey "action reads brighter than the sky" (mean ~0.013-0.017);
    // the two new backdrops answer the same budget, measured on the shipped pixels.
    const image = decodePng(readFileSync(resolve(ROOT, entry.file)));
    const stats = measurePlate(image.rgb8, image.width, image.height);
    assert.ok(stats.mean < 0.05, `${id} mean ${stats.mean} is not a backdrop`);
    assert.ok(stats.mean > 0.002, `${id} mean ${stats.mean} is effectively void`);
    assert.ok(stats.mean <= 0.018, `${id} mean ${stats.mean} sits in the sector-skies band`);
    assert.ok(stats.corridorCoverage05 <= 0.02, `${id} keeps the play corridor quiet`);
    assert.ok(stats.edgeMean <= 0.05, `${id} shows no plate boundary`);
    const quads = Object.values(stats.quadrantMean);
    assert.ok(Math.max(...quads) >= Math.min(...quads) * 2.0, `${id} has a subject, not a flat field`);
  }
  // Neither new plate leaks onto another region: only the pale-ice family and Ashfall bind them.
  const paleIceBinders = [...PROFILE_BY_ID.entries()]
    .filter(([, profile]) => resolveBackgroundSky(profile)?.plate === 'sky-fringe-pale-ice-shelf')
    .map(([sectorId]) => sectorId);
  assert.deepEqual(paleIceBinders, ['sector_haumea_rift', 'sector_eris_margin', 'sector_nereid_shoal']);
  const ashfallBinders = [...PROFILE_BY_ID.entries()]
    .filter(([, profile]) => resolveBackgroundSky(profile)?.plate === 'sky-ashfall-burn-front')
    .map(([sectorId]) => sectorId);
  assert.deepEqual(ashfallBinders, ['sector_ashfall_reach']);
});

test('PLACES-1.2: the two new moods exist, resolve fully, and are wired to their profiles', () => {
  for (const id of ['pale_ice', 'ember_ash']) {
    assert.ok(Object.hasOwn(LOOK_MOODS, id), `${id} is an authored mood`);
    const mood = resolveLookMood(id);
    assert.equal(mood.id, id);
    // The authoring rule: a mood is LOOK_BASE overlaid — every field present, frozen.
    for (const section of ['surface', 'post', 'rig']) {
      assert.ok(mood[section] && typeof mood[section] === 'object', `${id}.${section} resolves`);
      assert.equal(Object.isFrozen(mood[section]), true);
    }
    assert.equal(typeof mood.rig.keyHex, 'number', `${id} authors a key colour`);
  }
  assert.equal(LOOK_MOOD_BY_PROFILE.pale_ice, 'pale_ice');
  assert.equal(LOOK_MOOD_BY_PROFILE.ashfall_reach, 'ember_ash');
  assert.equal(LOOK_MOOD_BY_PROFILE.io_reach, 'dust_gold');
  assert.equal(LOOK_MOOD_BY_PROFILE.charon_expanse, 'cold_drift');
  // And the resolution actually lands on each live profile.
  assert.equal(resolveLookMoodId(SECTOR_VISUAL_PROFILES.pale_ice), 'pale_ice');
  assert.equal(resolveLookMoodId(SECTOR_VISUAL_PROFILES.ashfall_reach), 'ember_ash');
  assert.equal(resolveLookMoodId(SECTOR_VISUAL_PROFILES.io_reach), 'dust_gold');
  assert.equal(resolveLookMoodId(SECTOR_VISUAL_PROFILES.charon_expanse), 'cold_drift');
});

test('PLACES-1.2: the pale-ice family authors its own structure, not the fringe\'s scar grammar', () => {
  const paleIce = SECTOR_VISUAL_PROFILES.pale_ice;
  const structure = resolveBackgroundStructure(paleIce);
  assert.equal(structure.recipeId, 'fringe_pale_ice_shelf');
  assert.equal(structure.structureKind, 'sparse_wisps');
  assert.equal(paleIce.skyPalette, 'AZURE');
  // The family hero is one white ice world with a thin ring — every plain fringe sector
  // shares its family hero the same way.
  const hero = resolveBackgroundComposition(paleIce).signatureHero;
  assert.equal(hero.type, 'ice');
  assert.equal(hero.ring, true);
  assert.ok(Number.isFinite(hero.lightAngle));
  assert.deepEqual(resolveBackgroundComposition(paleIce).planetTypes, ['ice', 'rocky']);
});
