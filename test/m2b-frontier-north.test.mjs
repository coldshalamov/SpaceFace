// Focused M2b NORTH frontier cluster acceptance (self-contained pack; not yet wired live).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  FROZEN_CORE_SECTOR_IDS,
  LATTICE_WU,
  NORTH_ANCHORS,
  NORTH_CLUSTER,
  NORTH_GATE_EDGES,
  NORTH_ORIGIN_CELLS,
  NORTH_ORIGINS,
  NORTH_PALETTE,
  NORTH_SECTOR_IDS,
  NORTH_SECTORS,
  NORTH_ZONES,
} from '../src/data/frontierRegions/north.js';
import { FACTION_META } from '../src/data/factions.js';
import {
  HAZARD_TYPES,
  POI_TYPES,
  SECTOR_PALETTE_CLASSES,
  SECTORS,
  STATION_TYPES,
} from '../src/data/sectors.js';
import { SECTOR_GLOBAL_ORIGINS, SECTOR_ORIGIN_LATTICE_WU } from '../src/data/sectorCoordinates.js';
import { ZONE_TYPES } from '../src/data/sectorZones.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NORTH_SRC = join(__dirname, '../src/data/frontierRegions/north.js');

const ASSIGNED_CELLS = Object.freeze({
  sector_rhea_cinder: Object.freeze({ x: -6, y: 12 }),
  sector_haumea_rift: Object.freeze({ x: -3, y: 14 }),
  sector_eris_margin: Object.freeze({ x: 1, y: 14 }),
  sector_phoebe_echo: Object.freeze({ x: 2, y: 18 }),
});

const FIELD_TYPES = new Set([
  'ast_common_rock',
  'ast_metallic',
  'ast_icy',
  'ast_crystalline',
  'ast_gas_cloud',
  'ast_rare_exotic',
]);

const FACTION_IDS = new Set(FACTION_META.map((f) => f.id));
const STATION_TYPE_SET = new Set(STATION_TYPES);
const HAZARD_TYPE_SET = new Set(HAZARD_TYPES);
const POI_TYPE_SET = new Set(POI_TYPES);
const ZONE_TYPE_SET = new Set(Object.keys(ZONE_TYPES));
const PALETTE_KEYS = new Set(Object.keys(SECTOR_PALETTE_CLASSES));

function hasXZ(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function sectorById(id) {
  return NORTH_SECTORS.find((s) => s.id === id);
}

test('north cluster export is self-contained and lattice-aligned', () => {
  assert.equal(NORTH_CLUSTER.id, 'north');
  assert.equal(LATTICE_WU, 4096);
  assert.equal(LATTICE_WU, SECTOR_ORIGIN_LATTICE_WU);
  assert.equal(NORTH_CLUSTER.latticeWu, LATTICE_WU);
  assert.deepEqual([...NORTH_SECTOR_IDS], Object.keys(ASSIGNED_CELLS));
  assert.equal(NORTH_SECTORS.length, 4);
  assert.deepEqual(
    NORTH_SECTORS.map((s) => s.id),
    [...NORTH_SECTOR_IDS],
  );
});

test('freezes the original 10 story regions without collision', () => {
  assert.equal(FROZEN_CORE_SECTOR_IDS.length, 10);
  const liveIds = SECTORS.map((s) => s.id).filter((id) => FROZEN_CORE_SECTOR_IDS.includes(id)).sort();
  const frozenSorted = [...FROZEN_CORE_SECTOR_IDS].sort();
  assert.deepEqual(frozenSorted, liveIds, 'frozen core IDs must match live SECTORS');
  for (const id of NORTH_SECTOR_IDS) {
    assert.ok(!FROZEN_CORE_SECTOR_IDS.includes(id), `frontier id collides with core: ${id}`);
    assert.deepEqual(SECTOR_GLOBAL_ORIGINS[id], NORTH_ORIGINS[id]);
  }
  // Live core origins stay on the same lattice and are untouched by this pack.
  for (const id of FROZEN_CORE_SECTOR_IDS) {
    const o = SECTOR_GLOBAL_ORIGINS[id];
    assert.ok(hasXZ(o), `missing live origin: ${id}`);
    // Use === so lattice remainder -0 (from negative origins) still passes.
    assert.ok((o.x % LATTICE_WU) === 0, `${id} origin.x not on lattice`);
    assert.ok((o.z % LATTICE_WU) === 0, `${id} origin.z not on lattice`);
  }
});

test('assigned origin cells map to unique 4096-lattice global origins', () => {
  const seen = new Set();
  for (const id of NORTH_SECTOR_IDS) {
    const cell = NORTH_ORIGIN_CELLS[id];
    const expected = ASSIGNED_CELLS[id];
    assert.deepEqual(cell, expected, id);
    const origin = NORTH_ORIGINS[id];
    assert.deepEqual(origin, {
      x: expected.x * LATTICE_WU,
      z: expected.y * LATTICE_WU,
    });
    const key = `${origin.x},${origin.z}`;
    assert.ok(!seen.has(key), `duplicate origin ${key}`);
    seen.add(key);
    // No collision with frozen core galactic origins.
    for (const coreId of FROZEN_CORE_SECTOR_IDS) {
      const co = SECTOR_GLOBAL_ORIGINS[coreId];
      assert.notEqual(`${co.x},${co.z}`, key, `${id} collides with ${coreId}`);
    }
  }
});

test('sector cards use existing faction/palette/danger vocabularies', () => {
  for (const sector of NORTH_SECTORS) {
    assert.ok(FACTION_IDS.has(sector.factionId), `${sector.id} faction`);
    assert.ok(PALETTE_KEYS.has(sector.paletteKey), `${sector.id} paletteKey`);
    assert.deepEqual(
      { ...sector.palette },
      { ...SECTOR_PALETTE_CLASSES[sector.paletteKey] },
      `${sector.id} palette must match live SECTOR_PALETTE_CLASSES`,
    );
    assert.ok(Number.isFinite(sector.security) && sector.security >= 0 && sector.security <= 1);
    assert.ok(Number.isInteger(sector.tier) && sector.tier >= 0);
    assert.equal(sector.charted, false, 'frontier remains uncharted');
    assert.ok(Array.isArray(sector.enemyLevel) && sector.enemyLevel.length === 2);
    assert.ok(sector.stations.length >= 1);
    assert.ok(sector.fields.length >= 1);
    assert.ok(sector.pois.length >= 1);
    for (const st of sector.stations) {
      assert.ok(STATION_TYPE_SET.has(st.type), `${st.id} station type`);
      assert.ok(FACTION_IDS.has(st.factionId), `${st.id} station faction`);
    }
    for (const f of sector.fields) {
      assert.ok(FIELD_TYPES.has(f.type), `${f.id} field type`);
    }
    for (const h of sector.hazards || []) {
      assert.ok(HAZARD_TYPE_SET.has(h.type), `hazard ${h.type}`);
    }
    for (const p of sector.pois) {
      assert.ok(POI_TYPE_SET.has(p.type), `${p.id} poi type`);
    }
    assert.deepEqual(sector.position, NORTH_ORIGIN_CELLS[sector.id]);
  }
  // Inline palette vocabulary is a subset of live keys.
  for (const key of Object.keys(NORTH_PALETTE)) {
    assert.ok(PALETTE_KEYS.has(key));
  }
});

test('local anchors cover stations, reciprocal gates, fields, and POIs', () => {
  const allIds = new Set();
  for (const id of NORTH_SECTOR_IDS) {
    const sector = sectorById(id);
    const anchors = NORTH_ANCHORS[id];
    assert.ok(anchors, `missing anchors: ${id}`);

    assert.ok(anchors.stations.length >= 1);
    for (const st of sector.stations) {
      const a = anchors.stations.find((x) => x.id === st.id);
      assert.ok(a && hasXZ(a.pos), `station anchor ${id}/${st.id}`);
      assert.ok(!allIds.has(st.id), `duplicate station id ${st.id}`);
      allIds.add(st.id);
    }

    assert.ok(anchors.fields.length >= 1);
    for (const f of sector.fields) {
      const a = anchors.fields.find((x) => x.id === f.id);
      assert.ok(a && hasXZ(a.center) && a.clusterRadius > 0, `field anchor ${id}/${f.id}`);
      assert.ok(!allIds.has(f.id), `duplicate field id ${f.id}`);
      allIds.add(f.id);
    }

    assert.ok(anchors.pois.length >= 1);
    for (const p of sector.pois) {
      const a = anchors.pois.find((x) => x.id === p.id);
      assert.ok(a && hasXZ(a.pos), `poi anchor ${id}/${p.id}`);
      assert.ok(!allIds.has(p.id), `duplicate poi id ${p.id}`);
      allIds.add(p.id);
    }

    assert.ok(Array.isArray(anchors.gates) && anchors.gates.length >= 1);
    const gateTos = new Set(anchors.gates.map((g) => g.to));
    for (const n of sector.neighbors) {
      assert.ok(gateTos.has(n), `${id} missing gate to neighbor ${n}`);
    }
    for (const g of anchors.gates) {
      assert.ok(hasXZ(g.pos), `gate pos ${id}->${g.to}`);
      assert.ok(sector.neighbors.includes(g.to), `gate ${g.to} not in neighbors of ${id}`);
    }
  }
});

test('intra-cluster gate edges are reciprocal; integration stubs are one-sided', () => {
  const internal = NORTH_GATE_EDGES.filter((e) => !e.integration);
  const integration = NORTH_GATE_EDGES.filter((e) => e.integration);
  assert.ok(internal.length >= 3);
  assert.ok(integration.length >= 1);

  for (const edge of internal) {
    assert.ok(NORTH_SECTOR_IDS.includes(edge.a));
    assert.ok(NORTH_SECTOR_IDS.includes(edge.b));
    assert.ok(hasXZ(edge.aLocal) && hasXZ(edge.bLocal));
    const aSec = sectorById(edge.a);
    const bSec = sectorById(edge.b);
    assert.ok(aSec.neighbors.includes(edge.b));
    assert.ok(bSec.neighbors.includes(edge.a));
    const aGate = NORTH_ANCHORS[edge.a].gates.find((g) => g.to === edge.b);
    const bGate = NORTH_ANCHORS[edge.b].gates.find((g) => g.to === edge.a);
    assert.ok(aGate && bGate, `missing reciprocal anchors ${edge.a}<->${edge.b}`);
    assert.deepEqual(aGate.pos, edge.aLocal);
    assert.deepEqual(bGate.pos, edge.bLocal);
  }

  for (const edge of integration) {
    assert.ok(NORTH_SECTOR_IDS.includes(edge.a));
    assert.ok(FROZEN_CORE_SECTOR_IDS.includes(edge.b), `integration target not core: ${edge.b}`);
    assert.equal(edge.bLocal, null);
    assert.ok(hasXZ(edge.aLocal));
    const aGate = NORTH_ANCHORS[edge.a].gates.find((g) => g.to === edge.b);
    assert.ok(aGate && aGate.integration === true);
    assert.deepEqual(aGate.pos, edge.aLocal);
  }

  // Full neighbor symmetry inside the north set.
  for (const id of NORTH_SECTOR_IDS) {
    const sector = sectorById(id);
    for (const n of sector.neighbors) {
      if (!NORTH_SECTOR_IDS.includes(n)) continue;
      const other = sectorById(n);
      assert.ok(other.neighbors.includes(id), `asymmetric neighbors ${id}<->${n}`);
    }
  }
});

test('each north sector has >=1 named zone with live zone/faction vocabulary', () => {
  const zoneIds = new Set();
  for (const id of NORTH_SECTOR_IDS) {
    const zones = NORTH_ZONES[id];
    assert.ok(Array.isArray(zones) && zones.length >= 1, `zones missing: ${id}`);
    for (const z of zones) {
      assert.ok(z.id && z.name && z.reason);
      assert.ok(ZONE_TYPE_SET.has(z.type), `${z.id} zone type`);
      assert.ok(FACTION_IDS.has(z.factionId), `${z.id} faction`);
      assert.ok(hasXZ(z.center) && Number.isFinite(z.radius) && z.radius > 0);
      assert.ok(!zoneIds.has(z.id), `duplicate zone id ${z.id}`);
      zoneIds.add(z.id);
    }
  }
});

test('source is deterministic pure data (no non-deterministic RNG calls)', () => {
  // Strip line + block comments so docstrings do not false-positive the ban list.
  const src = readFileSync(NORTH_SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bMath\.random\s*\(/.test(src), 'Math.random() forbidden');
  assert.ok(!/\bDate\.now\s*\(/.test(src), 'Date.now() forbidden');
  assert.ok(!/\bperformance\.now\s*\(/.test(src), 'performance.now() forbidden');
  assert.ok(!/\bcrypto\.getRandomValues\s*\(/.test(src), 'crypto randomness forbidden');
});

test('cluster package wires all parallel maps', () => {
  assert.equal(NORTH_CLUSTER.sectors, NORTH_SECTORS);
  assert.equal(NORTH_CLUSTER.anchors, NORTH_ANCHORS);
  assert.equal(NORTH_CLUSTER.zones, NORTH_ZONES);
  assert.equal(NORTH_CLUSTER.origins, NORTH_ORIGINS);
  assert.equal(NORTH_CLUSTER.gateEdges, NORTH_GATE_EDGES);
  assert.equal(NORTH_CLUSTER.frozenCoreSectorIds, FROZEN_CORE_SECTOR_IDS);
});
