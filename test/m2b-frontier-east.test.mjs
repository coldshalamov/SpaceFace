// Focused contract for M2b EAST frontier cluster (additive, self-contained).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EAST_CLUSTER,
  EAST_SECTOR_IDS,
  EAST_ORIGINS,
  EAST_ORIGIN_CELLS,
  EAST_SECTORS,
  EAST_ANCHORS,
  EAST_ZONES,
  EAST_GATE_DESCRIPTORS,
  FROZEN_ORIGINAL_SECTOR_IDS,
  LATTICE_WU,
} from '../src/data/frontierRegions/east.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EAST_SRC = join(__dirname, '..', 'src', 'data', 'frontierRegions', 'east.js');

const STATION_TYPES = new Set([
  'trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research',
]);
const HAZARD_TYPES = new Set(['dense_asteroid', 'nebula', 'radiation', 'debris']);
const POI_TYPES = new Set([
  'beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck',
]);
const FIELD_TYPES = new Set([
  'ast_common_rock', 'ast_metallic', 'ast_icy', 'ast_crystalline',
  'ast_gas_cloud', 'ast_rare_exotic',
]);
const ZONE_TYPES = new Set([
  'civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint',
  'refinery_approach', 'mining_belt', 'colony', 'derelict_field', 'outlaw_zone',
  'radiation_field', 'nebula_fog', 'ambush_lane', 'anomaly_deep',
]);
const FACTION_IDS = new Set([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
  'faction_quiet', 'faction_vael', 'faction_free', 'faction_choir', 'faction_helix',
]);
const PALETTE_CLASSES = new Set(['core', 'belt', 'fringe', 'anomaly']);
const ASSIGNED = Object.freeze({
  sector_nereid_shoal: { x: 9, y: 3 },
  sector_proteus_well: { x: 11, y: 6 },
  sector_triton_wake: { x: 12, y: 10 },
});

function hasXZ(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function sectorById(id) {
  return EAST_SECTORS.find((s) => s.id === id);
}

test('cluster exports the assigned EAST ids only', () => {
  assert.equal(EAST_CLUSTER.id, 'frontier_cluster_east');
  assert.equal(LATTICE_WU, 4096);
  assert.equal(EAST_CLUSTER.latticeWu, 4096);
  assert.deepEqual([...EAST_SECTOR_IDS], Object.keys(ASSIGNED));
  assert.equal(EAST_SECTORS.length, 3);
  for (const id of EAST_SECTOR_IDS) {
    assert.ok(sectorById(id), `missing sector card ${id}`);
    assert.ok(EAST_ORIGINS[id], `missing origin ${id}`);
    assert.ok(EAST_ANCHORS[id], `missing anchors ${id}`);
    assert.ok(EAST_ZONES[id], `missing zones ${id}`);
  }
});

test('frozen original 10 are preserved and non-overlapping', () => {
  assert.equal(FROZEN_ORIGINAL_SECTOR_IDS.length, 10);
  assert.deepEqual([...FROZEN_ORIGINAL_SECTOR_IDS], [
    'sector_helios_prime',
    'sector_ceres_belt',
    'sector_tethys_junction',
    'sector_vesta_forge',
    'sector_pallas_drift',
    'sector_io_reach',
    'sector_charon_expanse',
    'sector_sker_haven',
    'sector_veil_nebula',
    'sector_ashfall_reach',
  ]);
  const frozen = new Set(FROZEN_ORIGINAL_SECTOR_IDS);
  for (const id of EAST_SECTOR_IDS) {
    assert.equal(frozen.has(id), false, `EAST id collides with original 10: ${id}`);
  }
  assert.deepEqual(EAST_CLUSTER.frozenOriginalSectorIds, FROZEN_ORIGINAL_SECTOR_IDS);
});

test('4096-lattice origins match assigned origin cells', () => {
  for (const [id, cell] of Object.entries(ASSIGNED)) {
    assert.deepEqual(EAST_ORIGIN_CELLS[id], cell);
    assert.deepEqual(EAST_ORIGINS[id], {
      x: cell.x * LATTICE_WU,
      z: cell.y * LATTICE_WU,
    });
    const card = sectorById(id);
    assert.deepEqual(card.position, { x: cell.x, y: cell.y });
  }
});

test('sector cards use existing vocabularies and stable ids', () => {
  const seenStation = new Set();
  const seenField = new Set();
  const seenPoi = new Set();
  const seenZone = new Set();

  for (const sector of EAST_SECTORS) {
    assert.match(sector.id, /^sector_[a-z0-9_]+$/);
    assert.ok(Number.isFinite(sector.tier) && sector.tier >= 0);
    assert.ok(sector.security >= 0 && sector.security <= 1);
    assert.equal(typeof sector.charted, 'boolean');
    assert.ok(FACTION_IDS.has(sector.factionId), `bad faction ${sector.factionId}`);
    assert.ok(PALETTE_CLASSES.has(sector.paletteClass), `bad paletteClass ${sector.paletteClass}`);
    assert.ok(sector.palette && Number.isFinite(sector.palette.key));
    assert.ok(Number.isFinite(sector.worldRadius) && sector.worldRadius > 0);
    assert.ok(Array.isArray(sector.neighbors) && sector.neighbors.length >= 1);
    assert.ok(Array.isArray(sector.stations) && sector.stations.length >= 1);
    assert.ok(Array.isArray(sector.fields) && sector.fields.length >= 1);
    assert.ok(Array.isArray(sector.pois) && sector.pois.length >= 1);

    for (const st of sector.stations) {
      assert.match(st.id, /^station_[a-z0-9_]+$/);
      assert.equal(seenStation.has(st.id), false, `duplicate station id ${st.id}`);
      seenStation.add(st.id);
      assert.ok(STATION_TYPES.has(st.type), `bad station type ${st.type}`);
      assert.ok(FACTION_IDS.has(st.factionId));
      assert.ok(Array.isArray(st.services) && st.services.length >= 1);
    }
    for (const f of sector.fields) {
      assert.match(f.id, /^f_[a-z0-9_]+$/);
      assert.equal(seenField.has(f.id), false, `duplicate field id ${f.id}`);
      seenField.add(f.id);
      assert.ok(FIELD_TYPES.has(f.type), `bad field type ${f.type}`);
    }
    for (const p of sector.pois) {
      assert.match(p.id, /^poi_[a-z0-9_]+$/);
      assert.equal(seenPoi.has(p.id), false, `duplicate poi id ${p.id}`);
      seenPoi.add(p.id);
      assert.ok(POI_TYPES.has(p.type), `bad poi type ${p.type}`);
    }
    for (const h of sector.hazards || []) {
      assert.ok(HAZARD_TYPES.has(h.type), `bad hazard type ${h.type}`);
      assert.ok(hasXZ(h.center));
    }
  }

  for (const id of EAST_SECTOR_IDS) {
    for (const z of EAST_ZONES[id]) {
      assert.match(z.id, /^zone_[a-z0-9_]+$/);
      assert.equal(seenZone.has(z.id), false, `duplicate zone id ${z.id}`);
      seenZone.add(z.id);
      assert.ok(ZONE_TYPES.has(z.type), `bad zone type ${z.type}`);
      assert.ok(FACTION_IDS.has(z.factionId));
      assert.ok(hasXZ(z.center));
      assert.ok(Number.isFinite(z.radius) && z.radius > 0);
      assert.equal(typeof z.reason, 'string');
      assert.ok(z.reason.length > 0);
    }
    assert.ok(EAST_ZONES[id].length >= 1, `${id} needs >=1 named zone`);
  }
});

test('anchors cover stations, gates, fields, POIs with finite local XZ', () => {
  for (const id of EAST_SECTOR_IDS) {
    const sector = sectorById(id);
    const anchors = EAST_ANCHORS[id];
    assert.ok(Array.isArray(anchors.stations) && anchors.stations.length >= 1);
    assert.ok(Array.isArray(anchors.gates) && anchors.gates.length >= 1);
    assert.ok(Array.isArray(anchors.fields) && anchors.fields.length >= 1);
    assert.ok(Array.isArray(anchors.pois) && anchors.pois.length >= 1);

    for (const st of sector.stations) {
      const a = anchors.stations.find((x) => x.id === st.id);
      assert.ok(a, `missing station anchor ${id}/${st.id}`);
      assert.ok(hasXZ(a.pos), `bad station pos ${id}/${st.id}`);
      assert.equal(typeof a.archetypeGlb, 'string');
    }
    for (const f of sector.fields) {
      const a = anchors.fields.find((x) => x.id === f.id);
      assert.ok(a, `missing field anchor ${id}/${f.id}`);
      assert.ok(hasXZ(a.center));
      assert.ok(Number.isFinite(a.clusterRadius) && a.clusterRadius > 0);
    }
    for (const p of sector.pois) {
      const a = anchors.pois.find((x) => x.id === p.id);
      assert.ok(a, `missing poi anchor ${id}/${p.id}`);
      assert.ok(hasXZ(a.pos));
      assert.equal(typeof a.landmarkGlb, 'string');
    }
    for (const g of anchors.gates) {
      assert.match(g.to, /^sector_[a-z0-9_]+$/);
      assert.ok(hasXZ(g.pos), `bad gate pos ${id}->${g.to}`);
      assert.ok(
        sector.neighbors.includes(g.to),
        `gate ${id}->${g.to} not listed in neighbors`,
      );
    }
    for (const n of sector.neighbors) {
      assert.ok(
        anchors.gates.some((g) => g.to === n),
        `neighbor ${n} missing gate on ${id}`,
      );
    }
  }
});

test('internal gate descriptors are reciprocal; externals flagged for integration', () => {
  const internalPairs = new Set();
  for (const id of EAST_SECTOR_IDS) {
    for (const g of EAST_ANCHORS[id].gates) {
      if (EAST_SECTOR_IDS.includes(g.to)) {
        internalPairs.add(`${id}->${g.to}`);
        assert.notEqual(g.external, true, `internal gate marked external: ${id}->${g.to}`);
        const back = EAST_ANCHORS[g.to].gates.find((x) => x.to === id);
        assert.ok(back, `missing reciprocal gate ${g.to}->${id}`);
      } else {
        assert.equal(g.external, true, `external gate needs external:true ${id}->${g.to}`);
        assert.ok(
          FROZEN_ORIGINAL_SECTOR_IDS.includes(g.to),
          `external gate target must be original-10 or known: ${g.to}`,
        );
      }
    }
  }

  const descInternal = EAST_GATE_DESCRIPTORS.filter((d) => d.internal);
  for (const d of descInternal) {
    assert.ok(internalPairs.has(`${d.from}->${d.to}`), `descriptor missing anchor ${d.from}->${d.to}`);
  }
  // every internal pair appears both ways in descriptors
  for (const key of internalPairs) {
    const [from, to] = key.split('->');
    assert.ok(
      EAST_GATE_DESCRIPTORS.some((d) => d.from === from && d.to === to && d.internal === true),
      `missing internal descriptor ${key}`,
    );
  }
});

test('source is deterministic pure data (no Math.random, no imports)', () => {
  const src = readFileSync(EAST_SRC, 'utf8');
  assert.equal(/Math\.random\s*\(/.test(src), false, 'Math.random forbidden');
  assert.equal(/Date\.now\s*\(/.test(src), false, 'Date.now forbidden');
  assert.equal(/performance\.now\s*\(/.test(src), false, 'performance.now forbidden');
  assert.equal(/^import\s/m.test(src), false, 'no runtime imports allowed in cluster data');
  assert.equal(/require\s*\(/.test(src), false, 'no require() allowed');
});

test('cluster record is self-contained and frozen at the export surface', () => {
  assert.equal(EAST_CLUSTER.sectors, EAST_SECTORS);
  assert.equal(EAST_CLUSTER.anchors, EAST_ANCHORS);
  assert.equal(EAST_CLUSTER.zones, EAST_ZONES);
  assert.equal(EAST_CLUSTER.origins, EAST_ORIGINS);
  assert.equal(EAST_CLUSTER.gateDescriptors, EAST_GATE_DESCRIPTORS);
  assert.ok(Object.isFrozen(EAST_CLUSTER));
  assert.ok(Object.isFrozen(EAST_SECTOR_IDS));
  assert.ok(Object.isFrozen(FROZEN_ORIGINAL_SECTOR_IDS));
  assert.ok(Object.isFrozen(EAST_ORIGINS));
  assert.ok(Object.isFrozen(EAST_ANCHORS));
  assert.ok(Object.isFrozen(EAST_ZONES));
});
