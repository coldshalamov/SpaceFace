import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { SECTORS, SECTOR_PALETTE_CLASSES, dangerTier } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES, ZONE_TYPES } from '../src/data/sectorZones.js';
import { SECTOR_GLOBAL_ORIGINS, SECTOR_ORIGIN_LATTICE_WU } from '../src/data/sectorCoordinates.js';
import { FRONTIER_SECTOR_IDS } from '../src/data/frontierRegions/index.js';
import { FACTION_META } from '../src/data/factions.js';

const STORY_IDS = Object.freeze([
  'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge',
  'sector_pallas_drift', 'sector_io_reach', 'sector_charon_expanse', 'sector_sker_haven',
  'sector_veil_nebula', 'sector_ashfall_reach',
]);
// 2766ef05…: ashfall's anchor pois gained the authored landmark poi_vault_maw (INFERENCE 10/10,
// 752da2f6) — the first story-anchor pois change since the guard was introduced in f4ba6a91.
const EXPECTED_STORY_ANCHOR_HASH = '2766ef056fab48722e98549df4e0245b74971b1e5616b758d16cd8934295e248';
const REQUIRED_FRONTIER_IDS = new Set(FRONTIER_SECTOR_IDS);
const FACTIONS = new Set(FACTION_META.map((entry) => entry.id));
const ZONES = new Set(Object.keys(ZONE_TYPES));
const paletteValues = Object.values(SECTOR_PALETTE_CLASSES);

function hasXZ(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function storyAnchorFingerprint() {
  const snapshot = Object.fromEntries(STORY_IDS.map((id) => {
    const anchor = SECTOR_ANCHORS[id];
    return [id, {
      stations: anchor.stations,
      fields: anchor.fields,
      pois: anchor.pois.filter((poi) => poi.id !== 'poi_helios_yard'),
    }];
  }));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function main() {
  assert.equal(SECTOR_ORIGIN_LATTICE_WU, 4096);
  assert.equal(SECTORS.length, 24);
  assert.equal(new Set(SECTORS.map((sector) => sector.id)).size, 24);
  assert.equal(STORY_IDS.length, 10);
  assert.equal(REQUIRED_FRONTIER_IDS.size, 14);
  assert.equal(storyAnchorFingerprint(), EXPECTED_STORY_ANCHOR_HASH, 'original story anchor XZ drift');

  const byId = new Map(SECTORS.map((sector) => [sector.id, sector]));
  const originKeys = new Set();
  for (const sector of SECTORS) {
    assert.ok(FACTIONS.has(sector.factionId), `${sector.id}: faction ${sector.factionId}`);
    assert.ok(Number.isFinite(sector.position?.x) && Number.isFinite(sector.position?.y), `${sector.id}: map position`);
    assert.ok(paletteValues.some((palette) => palette.nebulaTint === sector.palette?.nebulaTint && palette.fog === sector.palette?.fog), `${sector.id}: palette`);
    assert.ok(Number.isInteger(dangerTier(sector)) && dangerTier(sector) >= 0 && dangerTier(sector) <= 5);

    const origin = SECTOR_GLOBAL_ORIGINS[sector.id];
    assert.ok(hasXZ(origin), `${sector.id}: origin`);
    assert.equal(origin.x, sector.position.x * 4096, `${sector.id}: origin x/map mismatch`);
    assert.equal(origin.z, sector.position.y * 4096, `${sector.id}: origin z/map mismatch`);
    assert.equal(origin.x / 4096, Math.trunc(origin.x / 4096), `${sector.id}: lattice x`);
    assert.equal(origin.z / 4096, Math.trunc(origin.z / 4096), `${sector.id}: lattice z`);
    const originKey = `${origin.x},${origin.z}`;
    assert.equal(originKeys.has(originKey), false, `${sector.id}: duplicate origin ${originKey}`);
    originKeys.add(originKey);

    assert.ok(sector.stations?.length >= 1 && sector.stations.every((station) => hasXZ(station.pos)), `${sector.id}: stations`);
    assert.ok(sector.fields?.length >= 1 && sector.fields.every((field) => hasXZ(field.center)), `${sector.id}: fields`);
    assert.ok(sector.pois?.length >= 1 && sector.pois.every((poi) => hasXZ(poi.pos)), `${sector.id}: POIs`);
    assert.ok(sector.gates?.length >= 1 && sector.gates.every((gate) => hasXZ(gate.pos)), `${sector.id}: gates`);
    const zones = SECTOR_ZONES[sector.id];
    assert.ok(zones?.length >= 1, `${sector.id}: zones`);
    for (const zone of zones) {
      assert.ok(zone.id && zone.name && hasXZ(zone.center) && Number.isFinite(zone.radius), `${sector.id}: zone shape`);
      assert.ok(ZONES.has(zone.type), `${sector.id}: zone type ${zone.type}`);
      assert.ok(FACTIONS.has(zone.factionId), `${sector.id}: zone faction ${zone.factionId}`);
    }

    for (const neighborId of sector.neighbors || []) {
      const neighbor = byId.get(neighborId);
      assert.ok(neighbor, `${sector.id}: unknown neighbor ${neighborId}`);
      assert.ok(neighbor.neighbors.includes(sector.id), `${sector.id}<->${neighborId}: reciprocal neighbor`);
      assert.ok(sector.gates.some((gate) => gate.to === neighborId), `${sector.id}->${neighborId}: gate`);
    }
  }

  const frontierSource = ['west', 'north', 'east', 'south', 'index']
    .map((name) => readFileSync(new URL(`../src/data/frontierRegions/${name}.js`, import.meta.url), 'utf8'))
    .join('\n')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(frontierSource, /Math\.random\s*\(/);
  assert.doesNotMatch(frontierSource, /Date\.now\s*\(/);

  console.log(`M2b region data PASS: ${SECTORS.length} sectors, ${originKeys.size} unique origins, ${STORY_IDS.length}+${REQUIRED_FRONTIER_IDS.size}`);
}

main();
