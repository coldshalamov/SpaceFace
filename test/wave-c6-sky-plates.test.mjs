// §22 C6 — the art half of "six skies". The six baked sector skies landed from
// design/program/vm-drop/sector-skies/ (IMPORT.md is the contract). This pins the import chain:
// outbox file -> shipped asset -> plate registry -> profile background.sky -> sector resolution.
//
// The skies are the region's BASE backdrop, a different layer from the paintedSky accent plates:
// they answer the "action reads brighter than the sky" budget (mean luminance ~0.013-0.017,
// pinned from the drop's own build-report.json), so they do not belong to the accent-plate bake
// manifest or its composition budgets. The single galaxy allowance is sky-galactic-spur (tethys).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECTOR_VISUAL_PROFILES,
  resolveBackgroundSky,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
} from '../src/data/sectorVisualProfiles.js';
import { DEEP_SKY_PLATES } from '../src/render/deepSkyPlates.js';
import { decodePng, measurePlate } from '../tools/art/bake_deep_sky_plates.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SET_DIR = 'assets/background/deep-sky/sector-skies';
const SET_MANIFEST = JSON.parse(readFileSync(resolve(ROOT, `${SET_DIR}/manifest.json`), 'utf8'));

// The drop's contract verbatim (design/program/vm-drop/sector-skies/IMPORT.md): profile family ->
// the mood's outbox file -> registered plate id -> shipped sha256.
const SKIES = [
  { family: 'helios_core', mood: 'helios_orbital_void', plate: 'sky-helios-orbital-void', file: 'sky_helios_orbital_void.png', sha256: 'a23209ad8608b2ea37add0789abe1453e60774155068b9c45355db653ff64d92', galaxy: false },
  { family: 'core', mood: 'core_trade_constellation', plate: 'sky-core-trade-constellation', file: 'sky_core_trade_constellation.png', sha256: 'f358767e1569446debad96cce5c2361e17681991e653b5070f4e7918e462aa1e', galaxy: false },
  { family: 'belt', mood: 'belt_broken_dust_lane', plate: 'sky-belt-broken-dust-lane', file: 'sky_belt_broken_dust_lane.png', sha256: '880358f9de086447090c0b69bac220ead8c93b6354cbdb9bbf5164a82644adff', galaxy: false },
  { family: 'fringe', mood: 'fringe_tidal_filament', plate: 'sky-fringe-tidal-filament', file: 'sky_fringe_tidal_filament.png', sha256: '34a5771ab230c59b84bd315b80b52377c92c277a2cbb8e7c53740501b5a7ccc0', galaxy: false },
  { family: 'anomaly', mood: 'anomaly_electromagnetic_scar', plate: 'sky-anomaly-electromagnetic-scar', file: 'sky_anomaly_electromagnetic_scar.png', sha256: '5c493d45214977b1e1ef534648dc65a6de0dacf6ea4314ec8dc319165668a8a6', galaxy: false },
  { family: 'tethys', mood: 'galactic_spur', plate: 'sky-galactic-spur', file: 'sky_galactic_spur.png', sha256: '4a0da05e51a23ac5b6db29185ed2ae9948210dea23605663dbdac80edfb2a8ab', galaxy: true },
];

test('each dropped sky shipped at its recorded bytes under assets/', () => {
  assert.equal(SET_MANIFEST.schema, 'spaceface.sectorSkySet.v1');
  assert.equal(SET_MANIFEST.plates.length, SKIES.length, 'the set manifest lists every dropped sky');
  for (const sky of SKIES) {
    const bytes = readFileSync(resolve(ROOT, SET_DIR, sky.file));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'), sky.sha256,
      `${sky.plate}: shipped bytes differ from the drop's hash — re-import from vm-drop`,
    );
    const entry = SET_MANIFEST.plates.find((p) => p.id === sky.plate);
    assert.ok(entry, `${sky.plate} is missing from the set manifest`);
    assert.equal(entry.moodId, sky.mood);
    assert.equal(entry.file, `${SET_DIR}/${sky.file}`);
    assert.equal(entry.sha256, sky.sha256, 'set manifest must carry the drop hash');
    assert.equal(entry.allowGalaxy, sky.galaxy);
  }
});

test('each family profile resolves its dropped sky through the registered plate', () => {
  for (const sky of SKIES) {
    const profile = SECTOR_VISUAL_PROFILES[sky.family];
    const art = resolveBackgroundSky(profile);
    assert.ok(art, `${sky.family} does not resolve a sky backdrop`);
    assert.equal(art.plate, sky.plate, `${sky.family} sky plate`);
    assert.ok(art.strength > 0 && art.strength <= 1, `${sky.family} sky strength ${art.strength}`);
    // The sky plate id and the deep-field recipe carry the same mood name — a profile whose sky
    // drifts from its structure recipe would show another region's backdrop over its own stars.
    assert.equal(
      resolveBackgroundStructure(profile).recipeId, sky.mood,
      `${sky.family}: sky mood drifts from the structure recipe`,
    );
    const plate = DEEP_SKY_PLATES[sky.plate];
    assert.ok(plate, `${sky.plate} is not registered in src/render/deepSkyPlates.js`);
    assert.equal(plate.url, `/${SET_DIR}/${sky.file}`, `${sky.plate} runtime url`);
    assert.equal(plate.width, 2048);
    assert.equal(plate.height, 1024);
    assert.ok(plate.residentBytes > 0, `${sky.plate} residentBytes`);
  }
});

test('live sectors resolve a baked sky, and the rigs inherit their family sky', () => {
  // The six family skies cover every authored sector: way-of-life rigs share the family's sky
  // exactly as they share its accent plate.
  for (const sectorId of [
    'sector_helios_prime', 'sector_tethys_junction', 'sector_frontier_east_ridge',
    'sector_ceres_belt', 'sector_vesta_forge', 'sector_pallas_drift',
    'sector_sker_haven', 'sector_anomaly_well',
  ]) {
    const art = resolveBackgroundSky(resolveSectorVisualProfile({ id: sectorId }));
    assert.ok(art && DEEP_SKY_PLATES[art.plate], `${sectorId} resolves no registered sky`);
  }
  assert.equal(
    resolveBackgroundSky(SECTOR_VISUAL_PROFILES.vesta_forge).plate,
    'sky-belt-broken-dust-lane',
    'vesta_forge inherits the belt sky',
  );
  assert.equal(
    resolveBackgroundSky(SECTOR_VISUAL_PROFILES.ceres_belt).plate,
    'sky-belt-broken-dust-lane',
    'ceres_belt inherits the belt sky',
  );
  assert.equal(
    resolveBackgroundSky(SECTOR_VISUAL_PROFILES.pallas_drift).plate,
    'sky-fringe-tidal-filament',
    'pallas_drift inherits the fringe sky',
  );
});

test('the single galaxy allowance lands on tethys alone', () => {
  const galaxies = Object.values(SECTOR_VISUAL_PROFILES)
    .filter((profile) => resolveBackgroundSky(profile)?.plate === 'sky-galactic-spur');
  assert.deepEqual(
    galaxies.map((profile) => profile.id), ['tethys'],
    'sky-galactic-spur is the one galaxy-allowed image and only the galaxy profile binds it',
  );
  assert.equal(
    resolveSectorVisualProfile({ id: 'sector_tethys_junction' }).galaxyPlate, true,
    'the galaxy profile keeps its marker so the sky reads as the galaxy, not an accent plate',
  );
});

test('the baked skies stay under the action-over-sky luminance bound', () => {
  // The drop was baked so in-flight action reads brighter than the backdrop: mean luminance
  // ~0.013-0.017. Re-measure the shipped pixels rather than trusting the outbox's numbers —
  // this is the art half of the row's "below the muzzle and the engine" law.
  for (const sky of SKIES) {
    const image = decodePng(readFileSync(resolve(ROOT, SET_DIR, sky.file)));
    const stats = measurePlate(image.rgb8, image.width, image.height);
    assert.ok(
      stats.mean < 0.05,
      `${sky.plate} mean luminance ${stats.mean.toFixed(4)} is not a backdrop — the sky must sit under play`,
    );
    // And not a black frame either: a sky that shipped empty would pass any darkness cap.
    assert.ok(stats.mean > 0.002, `${sky.plate} mean ${stats.mean.toFixed(4)} is effectively void`);
  }
});
