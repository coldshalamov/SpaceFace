// PQ-153.02 — Landmarks fielded. Fixed seed 15302.
//
// Headless default-route census: each of the six PQ-153 sectors must hold a reachable
// depth-program hero landmark in the LIVE place table (world.enterSector materializes the
// sector; the census counts what actually spawned, not what a data file promises).
// Surface before invent: four of the six were already fielded (Candle Fleet, Wreck Cathedral,
// The Anvil, The Quiessence); this leaf fields the two canon gaps (Resonant Cathedral C13e in
// Vesta Forge, Skerris Throne C13d in Sker Haven) and counts all six.
// No vision claim is made here — still review belongs to a vision reviewer.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import landmarkLorePack from '../src/data/flavor/080-landmark-lore.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { world } from '../src/systems/world.js';

const SEED = 15302;
const LONG = { timeout: 240_000 };
const RELEASE_PLACES = 'assets/ships/release/parts/places';

// Canon mapping: the .00 way-of-life table names each sector's landmark; the depth program
// (design/depth-program/BUILD_PLAN.md) owns which hero landmark anchors each sector.
const LANDMARK_ROWS = Object.freeze([
  Object.freeze({
    sector: 'sector_helios_prime', kind: 'poi', id: 'poi_memorial',
    name: 'The Candle Fleet', targetRef: 'landmark_c3_candle_fleet',
  }),
  Object.freeze({
    sector: 'sector_ceres_belt', kind: 'worldSite', id: 'world_site_wreck_cathedral',
    name: 'Wreck Cathedral', targetRef: 'landmark_c1_wreck_cathedral_concord_vigilant',
    glb: 'place_landmark_wreck_cathedral',
  }),
  Object.freeze({
    sector: 'sector_tethys_junction', kind: 'planet', id: 'zone_tethys_anvil',
    name: 'The Anvil', targetRef: null,
  }),
  Object.freeze({
    sector: 'sector_vesta_forge', kind: 'poi', id: 'poi_vesta_resonant_cathedral',
    name: 'The Resonant Cathedral', targetRef: 'landmark_c13e_resonant_cathedral',
    glb: 'place_maintenance_gantry',
  }),
  Object.freeze({
    sector: 'sector_pallas_drift', kind: 'poi', id: 'poi_quiessence',
    name: 'The Quiessence', targetRef: 'landmark_c14_quiessence',
  }),
  Object.freeze({
    sector: 'sector_sker_haven', kind: 'poi', id: 'poi_sker_throne',
    name: 'The Skerris Throne', targetRef: 'landmark_c13d_skerris_throne',
    glb: 'place_dead_hulk',
  }),
]);

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function sectorOf(row) {
  const sector = SECTOR_BY_ID.get(row.sector);
  assert.ok(sector, `sector must exist (no invented sectors): ${row.sector}`);
  return sector;
}

function poiRecord(row) {
  const sector = sectorOf(row);
  const poi = (sector.pois || []).find((candidate) => candidate.id === row.id);
  assert.ok(poi, `${row.sector} must author landmark ${row.id}`);
  return poi;
}

test('PQ-153.02 the six sectors each author their canon depth hero landmark', () => {
  assert.equal(LANDMARK_ROWS.length, 6);
  assert.equal(new Set(LANDMARK_ROWS.map((row) => row.sector)).size, 6, 'one landmark per sector');

  const loreRefs = new Set(landmarkLorePack.entries.map((entry) => entry.targetRef));

  for (const row of LANDMARK_ROWS) {
    if (row.kind === 'planet') {
      const zone = zonesForSector(row.sector).find((candidate) => candidate.id === row.id);
      assert.ok(zone, `${row.sector} must author landmark zone ${row.id}`);
      assert.equal(zone.type, 'planetary_mass');
      assert.equal(PLANET_SITE.zoneId, 'zone_tethys_anvil');
      assert.equal(PLANET_SITE.sectorId, row.sector);
      continue;
    }
    const poi = poiRecord(row);
    assert.ok(poi.landmark === true, `${row.id} must carry landmark: true`);
    assert.ok(Number.isFinite(poi.pos?.x) && Number.isFinite(poi.pos?.z), `${row.id} needs a finite authored pos`);
    const localRadius = Math.hypot(poi.pos.x, poi.pos.z);
    const wr = sectorOf(row).worldRadius;
    assert.ok(localRadius <= wr, `${row.id} at ${localRadius.toFixed(0)} WU must sit inside its ${wr} WU sector disc`);
    if (row.kind === 'worldSite') {
      assert.equal(poi.runtimeOwner, 'asteroidSites', `${row.id} delegates its body to its runtime owner`);
      assert.ok(worldSiteManifestById(row.id), `${row.id} must resolve a world-site manifest`);
    }
    if (row.targetRef) {
      assert.ok(loreRefs.has(row.targetRef), `${row.id} targetRef ${row.targetRef} must exist in landmark lore`);
    }
    if (row.glb) {
      assert.ok(
        existsSync(`${RELEASE_PLACES}/${row.glb}.glb`),
        `${row.id} landmarkGlb ${row.glb} must exist in the release places`,
      );
    }
  }
});

test('PQ-153.02 seed 15302 headless census: six landmark reachable=yes on the live route', LONG, async () => {
  const previousPlanet = PLANET_FLAGS.enabled;
  PLANET_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: SEED,
    systems: [world, asteroidSites, fields, planetRuntime],
  });
  try {
    const worldSys = host.runtime.getSystem('world');
    assert.ok(worldSys, 'world system must be registered');
    const census = [];
    for (const row of LANDMARK_ROWS) {
      worldSys.enterSector(row.sector, { placePlayer: false, noTeleport: true });
      host.step(2, {
        before({ state }) { state.world.currentSectorId = row.sector; },
      });
      let reachable = false;
      if (row.kind === 'poi') {
        const bag = host.state.world.sectorContents[row.sector];
        reachable = !!bag && (bag.pois || []).some((entry) => entry.poiId === row.id)
          && !!host.state.world.discovery[row.sector]?.pois?.[row.id];
      } else if (row.kind === 'worldSite') {
        reachable = (host.state.entityList || []).some((entity) => entity
          && entity.alive !== false && entity.data && entity.data.worldSiteId === row.id);
      } else if (row.kind === 'planet') {
        reachable = !!host.state.planet && host.state.planet.active === true
          && host.state.planet.zoneId === row.id;
      }
      census.push({ sector: row.sector, landmark: row.name, reachable });
      console.log(`${row.sector} landmark reachable=${reachable ? 'yes' : 'no'} (${row.name})`);
    }
    const yesCount = census.filter((row) => row.reachable).length;
    for (const row of census) {
      assert.equal(row.reachable, true, `${row.sector} landmark must be reachable`);
    }
    console.log(`PQ-153.02 seed=${SEED} reachable=${yesCount}/6 (bar 6/6) backend=${host.proof().backend}`);
    assert.equal(yesCount, 6, 'six of six sector landmarks reachable');
  } finally {
    host.dispose();
    PLANET_FLAGS.enabled = previousPlanet;
  }
});
