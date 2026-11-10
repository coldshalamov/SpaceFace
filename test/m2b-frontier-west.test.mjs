// Focused M2b WEST frontier cluster gate.
// Pure unit checks over the self-contained pack — no golden edits, no shared wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  WEST_FRONTIER_CLUSTER,
  WEST_REGION_IDS,
  WEST_ORIGIN_CELLS,
  FROZEN_STORY_SECTOR_IDS,
  SECTOR_ORIGIN_LATTICE_WU,
  STATION_TYPES,
  HAZARD_TYPES,
  POI_TYPES,
  ZONE_TYPES,
  FACTION_IDS,
  PALETTE_KEYS,
  listWestRegionIds,
  getWestRegion,
  westSectorCards,
  westGlobalOrigins,
  westAnchors,
  westZones,
  dangerTier,
  wealthIndex,
  dangerIndex,
  WEST_PENDING_STORY_GATE_PATCHES,
} from '../src/data/frontierRegions/west.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEST_SRC = join(__dirname, '..', 'src', 'data', 'frontierRegions', 'west.js');

const ASSIGNED = Object.freeze({
  sector_nyx_march: { x: -9, y: 4 },
  sector_hyperion_cut: { x: -7, y: 0 },
  sector_kepler_scar: { x: -11, y: 7 },
  sector_orcus_shadow: { x: -10, y: 11 },
});

function finiteXZ(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function hasPos(obj) {
  return finiteXZ(obj && obj.pos);
}

function hasCenter(obj) {
  return finiteXZ(obj && obj.center)
    && Number.isFinite(obj.clusterRadius)
    && obj.clusterRadius > 0;
}

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures += 1;
  }
}

// ── Schema envelope ──────────────────────────────────────────────────────────
check(WEST_FRONTIER_CLUSTER.schema === 'spaceface.frontierCluster.v1', 'schema id');
check(WEST_FRONTIER_CLUSTER.id === 'frontier_cluster_west', 'cluster id');
check(WEST_FRONTIER_CLUSTER.cardinal === 'west', 'cardinal');
check(WEST_FRONTIER_CLUSTER.latticeWu === 4096, 'latticeWu === 4096');
check(SECTOR_ORIGIN_LATTICE_WU === 4096, 'exported lattice constant');

// ── Freeze original 10 ───────────────────────────────────────────────────────
check(FROZEN_STORY_SECTOR_IDS.length === 10, 'freezes exactly 10 story sectors');
check(WEST_FRONTIER_CLUSTER.freezesStorySectorIds === FROZEN_STORY_SECTOR_IDS, 'cluster freezes same array');
const frozenSet = new Set(FROZEN_STORY_SECTOR_IDS);
check(frozenSet.size === 10, 'story ids unique');
for (const id of WEST_REGION_IDS) {
  check(!frozenSet.has(id), `west region must not collide with story: ${id}`);
}

// ── Assigned region / origin cells ───────────────────────────────────────────
check(WEST_REGION_IDS.length === 4, 'exactly 4 west regions');
check(listWestRegionIds().length === 4, 'listWestRegionIds length');
for (const id of Object.keys(ASSIGNED)) {
  check(WEST_REGION_IDS.includes(id), `assigned id present: ${id}`);
  const cell = WEST_ORIGIN_CELLS[id];
  check(cell && cell.x === ASSIGNED[id].x && cell.y === ASSIGNED[id].y, `origin cell ${id}`);
  const region = getWestRegion(id);
  check(!!region, `getWestRegion(${id})`);
  check(region.originCell.x === ASSIGNED[id].x && region.originCell.y === ASSIGNED[id].y, `region.originCell ${id}`);
  check(
    region.globalOrigin.x === ASSIGNED[id].x * 4096
      && region.globalOrigin.z === ASSIGNED[id].y * 4096,
    `globalOrigin lattice for ${id}`,
  );
  check(
    region.sector.position.x === ASSIGNED[id].x
      && region.sector.position.y === ASSIGNED[id].y,
    `sector.position matches origin cell ${id}`,
  );
}

// ── Unique IDs across the pack ───────────────────────────────────────────────
const allIds = new Set();
function claimId(id, kind) {
  check(typeof id === 'string' && id.length > 0, `${kind} id non-empty`);
  check(!allIds.has(id), `unique id: ${id}`);
  allIds.add(id);
}

for (const id of WEST_REGION_IDS) claimId(id, 'sector');
for (const region of WEST_FRONTIER_CLUSTER.regions) {
  for (const st of region.sector.stations || []) claimId(st.id, 'station');
  for (const f of region.sector.fields || []) claimId(f.id, 'field');
  for (const p of region.sector.pois || []) claimId(p.id, 'poi');
  for (const z of region.zones || []) claimId(z.id, 'zone');
}

// ── Per-region geography + vocab ─────────────────────────────────────────────
const paletteKeysUsed = new Set();
const factionKeysUsed = new Set();
const dangerTiersUsed = new Set();

for (const region of WEST_FRONTIER_CLUSTER.regions) {
  const s = region.sector;
  const a = region.anchors;
  check(s.id === region.id, `sector.id matches region ${region.id}`);
  check(Number.isFinite(s.tier) && s.tier >= 0, `tier ${region.id}`);
  check(Number.isFinite(s.security) && s.security >= 0 && s.security <= 1, `security ${region.id}`);
  check(Number.isFinite(s.worldRadius) && s.worldRadius > 0, `worldRadius ${region.id}`);
  check(FACTION_IDS.includes(s.factionId), `faction vocab ${region.id}`);
  check(PALETTE_KEYS.includes(s.paletteKey), `paletteKey vocab ${region.id}`);
  check(s.palette && Number.isFinite(s.palette.key), `palette block ${region.id}`);
  check(Array.isArray(s.neighbors) && s.neighbors.length > 0, `neighbors ${region.id}`);
  check(Array.isArray(s.stations) && s.stations.length >= 1, `>=1 station card ${region.id}`);
  check(Array.isArray(s.fields) && s.fields.length >= 1, `>=1 field card ${region.id}`);
  check(Array.isArray(s.pois) && s.pois.length >= 1, `>=1 poi card ${region.id}`);
  check(Array.isArray(region.zones) && region.zones.length >= 1, `>=1 named zone ${region.id}`);
  check(Array.isArray(a.gates) && a.gates.length >= 1, `>=1 gate anchor ${region.id}`);

  paletteKeysUsed.add(s.paletteKey);
  factionKeysUsed.add(s.factionId);
  dangerTiersUsed.add(dangerTier(s));

  // Station card ↔ anchor join
  for (const st of s.stations) {
    check(STATION_TYPES.includes(st.type), `station type ${st.id}`);
    check(FACTION_IDS.includes(st.factionId), `station faction ${st.id}`);
    const anchor = a.stations.find((x) => x.id === st.id);
    check(!!anchor && hasPos(anchor), `station anchor pos ${st.id}`);
  }

  // Field card ↔ anchor join
  for (const f of s.fields) {
    const anchor = a.fields.find((x) => x.id === f.id);
    check(!!anchor && hasCenter(anchor), `field anchor center ${f.id}`);
  }

  // POI card ↔ anchor join
  for (const p of s.pois) {
    check(POI_TYPES.includes(p.type), `poi type ${p.id}`);
    const anchor = a.pois.find((x) => x.id === p.id);
    check(!!anchor && hasPos(anchor), `poi anchor pos ${p.id}`);
  }

  // Hazards use vocab + finite centers
  for (const h of s.hazards || []) {
    check(HAZARD_TYPES.includes(h.type), `hazard type ${region.id}/${h.type}`);
    check(finiteXZ(h.center) && Number.isFinite(h.radius) && h.radius > 0, `hazard geom ${region.id}`);
  }

  // Gates: every neighbor has a gate; every gate targets a neighbor
  const neighborSet = new Set(s.neighbors);
  for (const n of s.neighbors) {
    const g = a.gates.find((x) => x.to === n);
    check(!!g && hasPos(g), `gate for neighbor ${region.id}→${n}`);
  }
  for (const g of a.gates) {
    check(neighborSet.has(g.to), `gate target is neighbor ${region.id}→${g.to}`);
    check(hasPos(g), `gate pos finite ${region.id}→${g.to}`);
  }

  // Zones
  for (const z of region.zones) {
    check(ZONE_TYPES.includes(z.type), `zone type ${z.id}`);
    check(FACTION_IDS.includes(z.factionId), `zone faction ${z.id}`);
    check(typeof z.name === 'string' && z.name.length > 0, `zone name ${z.id}`);
    check(typeof z.reason === 'string' && z.reason.length > 0, `zone reason ${z.id}`);
    check(finiteXZ(z.center) && Number.isFinite(z.radius) && z.radius > 0, `zone geom ${z.id}`);
  }

  // Danger helpers finite and in range
  const dt = dangerTier(s);
  const wi = wealthIndex(s);
  const di = dangerIndex(s);
  check(Number.isInteger(dt) && dt >= 0 && dt <= 5, `dangerTier ${region.id}`);
  check(Number.isFinite(wi) && wi >= 0.3 && wi <= 1.6, `wealthIndex ${region.id}`);
  check(Number.isFinite(di) && di >= 0 && di <= 1, `dangerIndex ${region.id}`);
}

// Distinct identities via existing vocab only
check(factionKeysUsed.size >= 3, `distinct factions across west (got ${factionKeysUsed.size})`);
check(paletteKeysUsed.size >= 2, `distinct palettes across west (got ${paletteKeysUsed.size})`);
check(dangerTiersUsed.size >= 2, `distinct danger tiers across west (got ${dangerTiersUsed.size})`);

// ── Reciprocal internal gates ────────────────────────────────────────────────
const westSet = new Set(WEST_REGION_IDS);
for (const region of WEST_FRONTIER_CLUSTER.regions) {
  for (const g of region.anchors.gates) {
    if (!westSet.has(g.to)) {
      check(g.bridge === true, `external gate marked bridge ${region.id}→${g.to}`);
      continue;
    }
    const other = getWestRegion(g.to);
    check(!!other, `internal gate target exists ${g.to}`);
    const back = other.anchors.gates.find((x) => x.to === region.id);
    check(!!back && hasPos(back), `reciprocal gate ${g.to}→${region.id}`);
    check(other.sector.neighbors.includes(region.id), `reciprocal neighbor list ${g.to} includes ${region.id}`);
  }
}

// ── Pending story reverse patches (for later integration) ────────────────────
check(WEST_PENDING_STORY_GATE_PATCHES.length >= 1, 'pending story gate patches present');
for (const patch of WEST_PENDING_STORY_GATE_PATCHES) {
  check(frozenSet.has(patch.sectorId), `patch targets frozen story sector ${patch.sectorId}`);
  check(westSet.has(patch.neighborId), `patch neighbor is west region ${patch.neighborId}`);
  check(patch.gate && patch.gate.to === patch.neighborId && hasPos(patch.gate), `patch gate geom ${patch.sectorId}`);
  const frontier = getWestRegion(patch.neighborId);
  const bridge = frontier.anchors.gates.find((g) => g.to === patch.sectorId && g.bridge);
  check(!!bridge, `matching bridge gate on frontier ${patch.neighborId}→${patch.sectorId}`);
}

// ── Projection helpers ───────────────────────────────────────────────────────
const cards = westSectorCards();
const origins = westGlobalOrigins();
const anchors = westAnchors();
const zones = westZones();
check(cards.length === 4, 'westSectorCards length');
check(Object.keys(origins).length === 4, 'westGlobalOrigins keys');
check(Object.keys(anchors).length === 4, 'westAnchors keys');
check(Object.keys(zones).length === 4, 'westZones keys');
for (const id of WEST_REGION_IDS) {
  check(origins[id].x === ASSIGNED[id].x * 4096, `origins map ${id}`);
  check(Array.isArray(zones[id]) && zones[id].length >= 1, `zones map ${id}`);
  check(Array.isArray(anchors[id].gates) && anchors[id].gates.length >= 1, `anchors map gates ${id}`);
}

// ── Source hygiene: no Math.random, no imports ───────────────────────────────
const src = readFileSync(WEST_SRC, 'utf8');
check(!/\bMath\.random\b/.test(src), 'no Math.random in west.js');
check(!/^import\s/m.test(src), 'no import statements in west.js (self-contained)');
check(!/\brequire\s*\(/.test(src), 'no require() in west.js');

// ── Assert node:assert deep structural smoke ─────────────────────────────────
assert.equal(WEST_FRONTIER_CLUSTER.regions.length, 4);
assert.deepEqual(
  Object.fromEntries(WEST_REGION_IDS.map((id) => [id, WEST_ORIGIN_CELLS[id]])),
  ASSIGNED,
);

if (failures) {
  console.error(`m2b-frontier-west.test: ${failures} failure(s)`);
  process.exit(1);
}
console.log('m2b-frontier-west.test: PASS');
console.log(JSON.stringify({
  schema: WEST_FRONTIER_CLUSTER.schema,
  id: WEST_FRONTIER_CLUSTER.id,
  cardinal: WEST_FRONTIER_CLUSTER.cardinal,
  latticeWu: WEST_FRONTIER_CLUSTER.latticeWu,
  regionIds: WEST_REGION_IDS,
  originCells: WEST_ORIGIN_CELLS,
  freezesStorySectorIds: FROZEN_STORY_SECTOR_IDS.length,
  pendingStoryGatePatches: WEST_PENDING_STORY_GATE_PATCHES.length,
  factions: [...factionKeysUsed].sort(),
  palettes: [...paletteKeysUsed].sort(),
  dangerTiers: [...dangerTiersUsed].sort((a, b) => a - b),
}, null, 2));
process.exit(0);
