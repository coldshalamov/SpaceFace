// Continue-route sector recipe manifest. The save system's speculative prepare resolves the
// newest envelope during menu dwell and names the saved sector — and that sector's authored
// recipe is fully enumerable before a single spawnEntity fires its decode kick: catalog
// stations/gates/POI landmarks/field geology heads, the palette dressing set, the salted
// kit+wreck dressing streams, durable world records for the sector, and owed mission rosters.
// Each entry is a stub entity carrying exactly the data fields the packaged/authored file
// resolvers read, so the renderer can post the same decodes the spawned bodies will request
// — overlapping menu dwell instead of the restore's authored-visuals gate.

import { SECTORS, SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { ASTEROIDS } from '../data/mining.js';
import {
  EVERYDAY_SPACE_KIT_SALT,
  everydaySpaceKitDressingForSector,
} from '../data/everydaySpaceKitDressing.js';
import {
  WRECK_AFTERMATH_SALT,
  wreckAftermathDressingForSector,
} from '../data/wreckAftermathDressing.js';
import { RECORD_KIND, recordShouldRematerialize, stableRecordId } from '../world/worldRecords.js';
import { markArchetypePoolFor } from '../data/bountyMarks.js';
import { WORLD_ONE_OFFS } from '../data/worldOneOffs.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../core/rng.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const PALETTE_CLASS_BY_REF = new Map(
  Object.entries(SECTOR_PALETTE_CLASSES).map(([key, value]) => [value, key]),
);

// Mirror of world.js paletteClassForSector — the sector recipe's dressing palette. Duplicated
// here so the render lane never imports the world system module.
function paletteClassForSector(sector) {
  if (!sector) return 'core';
  if (PALETTE_CLASS_BY_REF.has(sector.palette)) return PALETTE_CLASS_BY_REF.get(sector.palette);
  const p = sector.palette || {};
  for (const [key, value] of Object.entries(SECTOR_PALETTE_CLASSES)) {
    if (p.nebulaTint === value.nebulaTint && p.fog === value.fog) return key;
  }
  return 'core';
}

// The literal place ids each palette's dressing pass can spawn. Conditions mirror
// world.js _spawn{Core,Belt,Fringe,Anomaly}Dressing: presence-gated on the catalog's
// stations/gates/fields/wreck-type POIs — never on positions, which are all rng consumes.
const PALETTE_DRESSING_IDS = Object.freeze({
  core: (ctx) => [
    ctx.gates ? 'place_lane_beacon' : null,
    ctx.stations ? 'place_station_billboard' : null,
  ],
  belt: (ctx) => [
    ctx.fields ? 'place_nav_buoy' : null,
    ctx.fields ? 'place_mining_drone' : null,
    ctx.stations && ctx.fields ? 'place_conveyor_barge' : null,
  ],
  fringe: (ctx) => [
    ctx.gates ? 'place_nav_buoy' : null,
    ctx.wrecks || ctx.fields ? 'place_dead_hulk' : null,
    ctx.wrecks || ctx.fields ? 'place_debris_chunk' : null,
    ctx.fields ? 'place_mining_drone' : null,
  ],
  anomaly: () => ['place_nav_buoy', 'place_debris_chunk', 'place_mining_drone'],
});

// Anchor arrays for the salted dressing generators. Model identity is resolved from rng +
// anchor presence/counts — the field-center shuffle consumes one rng draw per candidate,
// so counts must mirror active.stations/fields/pois exactly; positions only steer offsets
// (authored ones are carried where the catalog has them).
function sectorDressingRows(sector, palette, seed) {
  const wreckPoiRows = (sector.pois || [])
    .filter((poi) => poi && (poi.type === 'wreck' || poi.type === 'derelict'))
    .map((poi) => ({
      id: poi.id,
      poiId: poi.id,
      name: poi.name || null,
      pos: poi.pos || poi.anchor || { x: 0, z: 0 },
    }));
  const stations = (sector.stations || []).map((st) => (st && st.pos) || { x: 0, z: 0 });
  const hasGates = !!(sector.wormholeTo)
    || (Array.isArray(sector.gates) && sector.gates.length > 0)
    || (sector.neighbors || []).length > 0;
  const fields = (sector.fields || []).map((f) => (f && (f.center || f.pos)) || { x: 0, z: 0 });
  const anchors = {
    stations,
    gates: hasGates ? [{ x: 0, z: 0 }] : [],
    fields,
    wrecks: wreckPoiRows,
    origin: sectorGlobalOrigin(sector.id) || { x: 0, z: 0 },
    worldRadius: sector.worldRadius,
    enemyDensity: sector.enemyDensity,
  };
  // Restore re-materializes residentSectors from scratch — the first materialization epoch
  // is always 0, so the salted streams are enumerable from (seed, sectorId) alone.
  const kitRows = everydaySpaceKitDressingForSector(
    sector.id, palette, mulberry32(hash32(seed, sector.id, 0, EVERYDAY_SPACE_KIT_SALT)), anchors,
  );
  const wreckRows = wreckAftermathDressingForSector(
    sector.id, palette, mulberry32(hash32(seed, sector.id, 0, WRECK_AFTERMATH_SALT)), anchors,
  );
  return {
    kitRows,
    wreckRows,
    hasStations: stations.length > 0,
    hasGates,
    hasFields: fields.length > 0,
  };
}

/**
 * Enumerate the authored visual files the saved sector will need.
 * @returns {{
 *   sectorId: string|null,
 *   placeStubs: object[],   // entities for the packaged/place decode lane
 *   shipStubs: object[],    // entities for the authored-ship preload lane
 *   roster: object[]        // {archetype, factionId?, trafficRole?} for warmEnemyRosterDecode
 * }}
 */
export function saveEnvelopeSectorStubs(data) {
  const out = { sectorId: null, placeStubs: [], shipStubs: [], roster: [] };
  const sectorId = data && data.world && data.world.currentSectorId;
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  if (!sector) return out;
  out.sectorId = sector.id;
  const seed = (data.meta && Number.isFinite(data.meta.seed)) ? data.meta.seed : 1;

  for (const st of sector.stations || []) {
    if (!st) continue;
    out.placeStubs.push({
      type: 'station',
      factionId: st.factionId || null,
      data: {
        stationTypeId: st.type || null,
        archetypeGlb: st.archetypeGlb || null,
        landmarkGlb: st.landmarkGlb || null,
        landmark: !!st.landmark,
      },
    });
  }
  if (Array.isArray(sector.gates) && sector.gates.length) {
    for (const g of sector.gates) {
      if (!g) continue;
      out.placeStubs.push({
        type: 'station',
        data: {
          isGate: true,
          isWormhole: !!g.wormhole,
          archetypeGlb: g.archetypeGlb || 'place_gate_jump_ring',
        },
      });
    }
  } else if ((sector.neighbors || []).length || sector.wormholeTo) {
    out.placeStubs.push({
      type: 'station',
      data: { isGate: true, archetypeGlb: 'place_gate_jump_ring' },
    });
  }

  for (const poi of sector.pois || []) {
    if (!poi || poi.runtimeOwner || !poi.landmarkGlb) continue;
    const placeId = String(poi.landmarkGlb).replace(/^places\//, '').replace(/\.glb$/, '');
    out.placeStubs.push({
      type: 'fx',
      data: {
        poi: true,
        landmark: !!poi.landmark,
        landmarkGlb: poi.landmarkGlb,
        placeId,
      },
    });
  }

  // Each field's head rock is the authored geology variant when the type declares one.
  for (const fdef of sector.fields || []) {
    const authoredPlaceId = fdef && AST_BY_ID.get(fdef.type) && AST_BY_ID.get(fdef.type).authoredPlaceId;
    if (!authoredPlaceId) continue;
    out.placeStubs.push({
      type: 'asteroid',
      radius: 1,
      data: { authoredGeologySkin: true, placeId: authoredPlaceId, placeTargetRadius: 1 },
    });
  }

  const palette = paletteClassForSector(sector);
  const { kitRows, wreckRows, hasStations, hasGates, hasFields } = sectorDressingRows(sector, palette, seed);
  const literalIds = PALETTE_DRESSING_IDS[palette] || PALETTE_DRESSING_IDS.core;
  for (const placeId of literalIds({
    stations: hasStations, gates: hasGates, fields: hasFields,
    wrecks: (sector.pois || []).some((p) => p && (p.type === 'wreck' || p.type === 'derelict')),
  })) {
    if (placeId) out.placeStubs.push({ type: 'fx', data: { placeId, worldDressing: true } });
  }
  for (const row of kitRows) {
    out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, everydaySpaceKit: true } });
  }
  for (const row of wreckRows) {
    out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, wreckAftermath: true } });
  }

  const recordsById = (data.world && data.world.records && data.world.records.byId) || {};
  const sectorRecords = Object.keys(recordsById)
    .map((id) => recordsById[id])
    .filter((rec) => rec
      && rec.alive !== false
      && (rec.sectorId === sector.id || rec.homeSectorId === sector.id)
      && recordShouldRematerialize(rec, 'FULL'));

  // Physical one-offs stamp a stable durable id; a destroyed tombstone never re-materializes.
  for (const oneOff of WORLD_ONE_OFFS) {
    if (!oneOff || oneOff.sectorId !== sector.id || !oneOff.placeId) continue;
    if (oneOff.physicalBody) {
      const recordId = stableRecordId(seed, sector.id, RECORD_KIND.WRECK, `worldOneOff:${oneOff.id}`);
      const durable = recordsById[recordId];
      if (durable && (durable.outcome === 'destroyed' || durable.alive === false)) continue;
    }
    out.placeStubs.push({ type: 'fx', data: { placeId: oneOff.placeId, worldOneOff: true } });
    for (const part of (oneOff.cluster && oneOff.cluster.props) || []) {
      if (part && part.placeId) {
        out.placeStubs.push({ type: 'fx', data: { placeId: part.placeId, worldOneOff: true } });
      }
    }
  }

  for (const rec of sectorRecords) {
    if (rec.kind === RECORD_KIND.WRECK || rec.kind === RECORD_KIND.AFTERMATH) {
      // spawnSpecFromRecord stamps no hulk identity on rematerialized wrecks — every one
      // resolves through the six-file aftermath table (military → corvette turret inside
      // it), which the roster exemplar prewarm already decodes. Nothing to warm.
      continue;
    }
    // Convoy/npc/mission_target records rematerialize through the ship spec — the resolver
    // reads lootTableId then silhouette/defId, and the kit lane reads entity.factionId,
    // exactly as the spawned spec stamps them (spawnSpecFromRecord shell / makeEnemySpawnSpec).
    // _spawnFromDurableRecord routes enemyTypeId+hostile-kind records through the enemy spec,
    // whose lootTableId/defId come from the resolved def (unknown ids fall back to [0]).
    const isEnemySpec = rec.enemyTypeId
      && (rec.kind === RECORD_KIND.NPC
        || rec.kind === RECORD_KIND.MISSION_TARGET
        || rec.isBoss === true);
    const stubData = { durable: true };
    if (isEnemySpec) {
      const def = ENEMY_BY_ID.get(rec.enemyTypeId) || ENEMY_TYPES[0];
      stubData.lootTableId = def.id;
      stubData.defId = def.shipId;
      stubData.enemyTypeId = rec.enemyTypeId;
      if (def.silhouette) stubData.silhouette = def.silhouette;
      if (rec.trafficRole) stubData.trafficRole = rec.trafficRole;
    } else {
      stubData.lootTableId = rec.enemyTypeId || null;
      stubData.defId = rec.shipDefId || 'ship_kestrel';
      stubData.enemyTypeId = rec.enemyTypeId || null;
      stubData.trafficRole = rec.trafficRole || null;
    }
    out.shipStubs.push({
      id: rec.recordId,
      type: 'ship',
      factionId: rec.factionId || null,
      data: stubData,
    });
  }

  // Owed mission targets in the saved sector (_spawnTargetsFor): named marks carry their hull
  // on the row; ghost packs are a fixed anchor+cutter cast; anonymous bounties draw from the
  // shared risk pool. Adopted hosts are already covered by the sector-records pass above.
  const missions = (data.missions && Array.isArray(data.missions.active)) ? data.missions.active : [];
  for (const m of missions) {
    if (!m || !m.needsTargets) continue;
    if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
    if (m.destSectorId !== sector.id) continue;
    const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
    const adopted = (m.targetEntityIds || []).length;
    const ghostPack = !!(m.params && m.params.ghostConvoy);
    const want = (m.type === 'patrol_clear' || ghostPack) ? remaining : Math.min(1, remaining);
    if (want - adopted <= 0) continue;
    const storyTarget = m.storyTarget && m.storyTarget.archetype ? m.storyTarget : null;
    if (storyTarget) {
      out.roster.push({
        archetype: storyTarget.archetype,
        factionId: storyTarget.factionId || null,
      });
      continue;
    }
    if (ghostPack) {
      out.roster.push({ archetype: 'reaver_pirate' }, { archetype: 'wasp_swarmer' });
      continue;
    }
    for (const archetype of new Set(markArchetypePoolFor(m.riskTier))) {
      out.roster.push({ archetype });
    }
  }

  return out;
}
