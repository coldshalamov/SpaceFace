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
import { authoredSetPieceById, megaHeistById } from '../data/missions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../data/encounters/set-piece-authored.js';
import { MEGA_HEIST_ENCOUNTERS } from '../data/encounters/mega-heist.js';
import { capitalBossEncounter } from '../data/encounters/capital-boss.js';
import { worldSiteManifestById } from '../data/worldSiteManifests.js';
import {
  aceById,
  escalatedStyleFromMemory,
  returnCrewForAce,
} from '../data/namedAces.js';
import { NEMESIS_KITS, NEMESIS_RIVAL } from '../data/nemesisRival.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../core/rng.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const PALETTE_CLASS_BY_REF = new Map(
  Object.entries(SECTOR_PALETTE_CLASSES).map(([key, value]) => [value, key]),
);

// Mirror of combat.js makeEnemySpawnSpec's faction pick: caller override > archetype's own
// faction > lawful/hostile fallback. A record that left factionId unset would otherwise warm
// the un-kitted file while the respawn loads the faction kit.
function enemyFactionIdFor(def, explicit) {
  return explicit || (def && def.factionId)
    || (def && def.factionLawful ? 'faction_scn' : 'faction_reach');
}

// Promoted-pilot records carry every ace-shaped field returnCrewForAce reads — rebuild the
// minimal ace object from the saved row rather than importing the aceMemory system module.
function promotedAceShapeForRecord(id, rec) {
  return {
    id,
    name: rec.name || null,
    crew: rec.crew || null,
    signatureBark: rec.signatureBark || null,
    factionId: rec.factionId || null,
    gimmickTag: rec.gimmickTag || null,
    returnArchetype: rec.returnArchetype || null,
    escortArchetype: rec.escortArchetype || null,
    baseReturnLevel: rec.baseReturnLevel || null,
  };
}

// Mirror of worldSiteKernel.evaluateStage + the materialization plan's placeId pick: the
// last satisfied stage wins, a stage missing `requires` is always satisfied, and a stage
// with no placeId falls through to the manifest's visual root.
function siteStagePlaceId(manifest, record) {
  const stages = Array.isArray(manifest && manifest.stages) ? manifest.stages : [];
  let stage = stages.length ? stages[0] : null;
  for (const candidate of stages) {
    const requires = Array.isArray(candidate && candidate.requires) ? candidate.requires : [];
    if (requires.every((op) => record.completedOperations && record.completedOperations[op])) {
      stage = candidate;
    }
  }
  return (stage && stage.placeId) || (manifest.visualRoot && manifest.visualRoot.placeId) || null;
}

// Mirror of visualFactory's hashId (stable fnv-1a over the entity id) — bare mission wrecks
// pick their packaged body by id hash across the aftermath table, so covering residue classes
// needs the same hash the mount reads.
function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// missions.js contractClaimSiteMission — the filed-wreck-with-crew contract shape. Mirrored
// locally so the render lane never imports the world/missions system modules.
function contractClaimSiteMissionStub(m) {
  if (!m || m.type !== 'salvage_retrieval') return false;
  if (m.storyTag || m.storyContractId || m.wreckId) return false;
  const tag = m.mutationTag;
  if (tag === 'salvage' || tag === 'recovery' || tag === 'cooked') return false;
  const p = m.params;
  if (!p || !p.cmdtyId) return false;
  if (p.setPieceObjective || p.salvagePointId || p.survivorPodId || p.wreckMissionId
    || p.wreckPos || p.poiSignalFollowup) return false;
  return true;
}

function mutationRecoveryStub(m) {
  const tag = m && m.mutationTag;
  return tag === 'salvage' || tag === 'recovery' || tag === 'cooked';
}

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

  // Bare mission wrecks pick their packaged body by id hash across the aftermath table —
  // covering the residue classes needs the same hash the mount reads (machinery shared with
  // the identity-less aftermath-marker case below).
  let bareMissionWrecksCovered = false;
  const coverBareMissionWrecks = () => {
    if (bareMissionWrecksCovered) return;
    bareMissionWrecksCovered = true;
    const covered = new Set();
    for (let i = 0; covered.size < 6 && i < 64; i += 1) {
      const id = `envelope-warm:mission-wreck:${i}`;
      const variant = hashId(id) % 6;
      if (covered.has(variant)) continue;
      covered.add(variant);
      out.placeStubs.push({
        id,
        type: 'wreck',
        data: { wreckClass: 'battlefield', parentType: 'ship' },
      });
    }
  };

  // Aftermath wreck markers serialize the victim's full visual identity (defId + the same
  // visual fields its own admission read, faction kit, fracture piece) and _spawnForSector
  // rematerializes them at save:loaded — the stub resolves through the same wreckPackagedFile
  // pick the spawned body takes, so defId hulls and fragment files warm with everything else.
  const aftermathMarkers = data.aftermathWrecks && data.aftermathWrecks.bySector
    && data.aftermathWrecks.bySector[sector.id];
  if (Array.isArray(aftermathMarkers)) {
    for (const marker of aftermathMarkers) {
      if (!marker) continue;
      // A generic marker carries no victim identity: the hash pick then lands on the spawn's
      // allocated entity id — cover the residue table instead of one doomed residue.
      if (!marker.fracturePiece && !marker.victimDefId && !marker.victimVisual
          && marker.wreckClass !== 'military') {
        coverBareMissionWrecks();
        continue;
      }
      const stubData = {
        wreckClass: marker.wreckClass || 'battlefield',
        parentType: marker.wreckClass === 'military' ? 'military' : 'ship',
        hulkOfDefId: marker.victimDefId || null,
        hulkVisual: marker.victimVisual || null,
        hulkFactionId: marker.victimFactionId || null,
      };
      if (marker.fracturePiece) {
        stubData.fracturePiece = marker.fracturePiece;
        stubData.fractureSeamId = marker.fractureSeamId || null;
        stubData.fractureVisual = marker.fractureVisual || null;
      }
      out.placeStubs.push({ type: 'wreck', data: stubData });
    }
  }

  // Claim-owned bodies, automation outposts, and asteroid-site beacons materialize as runtime
  // dressing rows (never envelope sector dressing): their place ids resolve through
  // placeFileForEntity exactly as the spawned rows do.
  const claimBodies = (data.claims && Array.isArray(data.claims.bodies)) ? data.claims.bodies : [];
  for (const body of claimBodies) {
    if (!body || body.sectorId !== sector.id || body.owned !== true) continue;
    out.placeStubs.push({
      type: 'fx',
      data: { claimOwned: true, claimSpecId: (body.spec && body.spec.id) || null },
    });
  }
  const outposts = (data.automation && Array.isArray(data.automation.outposts))
    ? data.automation.outposts
    : [];
  // automation.js OUTPOST_VISUAL_BY_DEF — unknown defs mount the base outpost body.
  const OUTPOST_STUB_VISUAL = {
    outpost_refinery: { placeId: 'place_claim_outpost_refinery', claimSpecId: 'spec_refinery' },
    outpost_fuelsynth: { placeId: 'place_claim_outpost_refinery', claimSpecId: 'spec_refinery' },
    outpost_habhub: { placeId: 'place_claim_outpost_relay', claimSpecId: 'spec_relay' },
  };
  for (const o of outposts) {
    if (!o || o.sectorId !== sector.id) continue;
    const visual = OUTPOST_STUB_VISUAL[o.defId] || { placeId: 'place_claim_outpost_base', claimSpecId: null };
    out.placeStubs.push({
      type: 'fx',
      data: { placeId: visual.placeId, claimSpecId: visual.claimSpecId, claimOwned: true },
    });
  }

  // Fleet wingmen live in automation.fleet, not sector records — wingmen.js _spawnWingmen
  // rematerializes every ledger row on sector:enter through makeShipEntitySpec with the
  // Concord faction, so mirror the same defId route into the ship-warm lane.
  const fleet = (data.automation && Array.isArray(data.automation.fleet)) ? data.automation.fleet : [];
  for (const fs of fleet) {
    const defId = fs && (fs.shipDefId || fs.defId);
    if (!defId) continue;
    out.shipStubs.push({
      type: 'ship',
      factionId: 'faction_scn',
      data: { defId, lootTableId: null },
    });
  }
  // Mining-drone groups repopulate live hulls on the first in-sector tick (_updateDrones →
  // _spawnDroneEntities → type 'drone' → the census packaged body). One stub covers the file
  // no matter how many groups the sector owes.
  const droneGroups = (data.automation && Array.isArray(data.automation.drones)) ? data.automation.drones : [];
  for (const g of droneGroups) {
    if (g && g.sectorId === sector.id) { out.placeStubs.push({ type: 'drone' }); break; }
  }
  // The tethys heist set rematerializes its facilities + berth worker on every entry of its
  // home sector (heistFacilities.materializeForSector) — none of the dressing passes above
  // reach these place ids, and none of the record lanes cover the worker hull.
  if (sector.id === 'sector_tethys_junction') {
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_claim_outpost_catcher', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_claim_outpost_fence', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_breakaway_fork', worldDressing: true } });
    out.shipStubs.push({
      type: 'ship',
      factionId: 'faction_mts',
      data: { defId: 'ship_mule', lootTableId: null },
    });
  }

  // World-site roots mount the place id of their EVALUATED stage (stage.placeId falling back
  // to the manifest's visual root) — warm the file the progressed record will actually mount.
  const siteRecords = data.sites && data.sites.worldById;
  if (siteRecords) {
    const warmedSiteFiles = new Set();
    for (const id of Object.keys(siteRecords)) {
      const record = siteRecords[id];
      if (!record || record.sectorId !== sector.id) continue;
      const manifest = worldSiteManifestById(record.manifestId);
      const placeId = manifest ? siteStagePlaceId(manifest, record) : null;
      if (placeId && !warmedSiteFiles.has(placeId)) {
        warmedSiteFiles.add(placeId);
        out.placeStubs.push({ type: 'fx', data: { placeId, worldDressing: true } });
      }
    }
  }

  // sector_ceres_belt re-points three ambient drone props onto the throughline activity bodies
  // (world.js CERES_ACTIVITY_DRONE_SLOT_PRESENTATION); the palette literal set covers dead_hulk
  // and conveyor_barge but never these two.
  if (sector.id === 'sector_ceres_belt') {
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_bait_wreck', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_grave_shard', worldDressing: true } });
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
    let stubFactionId = rec.factionId || null;
    if (isEnemySpec) {
      const def = ENEMY_BY_ID.get(rec.enemyTypeId) || ENEMY_TYPES[0];
      stubData.lootTableId = def.id;
      stubData.defId = def.shipId;
      stubData.enemyTypeId = rec.enemyTypeId;
      if (def.silhouette) stubData.silhouette = def.silhouette;
      if (rec.trafficRole) stubData.trafficRole = rec.trafficRole;
      stubFactionId = enemyFactionIdFor(def, rec.factionId);
    } else {
      stubData.lootTableId = rec.enemyTypeId || null;
      stubData.defId = rec.shipDefId || 'ship_kestrel';
      stubData.enemyTypeId = rec.enemyTypeId || null;
      stubData.trafficRole = rec.trafficRole || null;
    }
    out.shipStubs.push({
      id: rec.recordId,
      type: 'ship',
      factionId: stubFactionId,
      data: stubData,
    });
  }

  // Owed mission targets in the saved sector (_spawnTargetsFor): named marks carry their hull
  // on the row; ghost packs are a fixed anchor+cutter cast; anonymous bounties draw from the
  // shared risk pool. Adopted hosts are already covered by the sector-records pass above.
  // The non-bounty needsTargets families (escort convoys, claim sites, salvage pockets, signal
  // derelicts, physical set pieces, authored casts) respawn through the same pass — bare wreck
  // props warm the aftermath table by residue class, ship actors warm their archetype hulls.
  const missions = (data.missions && Array.isArray(data.missions.active)) ? data.missions.active : [];
  for (const m of missions) {
    if (!m || !m.needsTargets || m.status !== 'active') continue;
    if (m.destSectorId !== sector.id) continue;
    const params = m.params || {};
    const follow = params.poiSignalFollowup;
    if (follow) {
      // recon_scan follow-ups materialize a wreck or anomaly at the signal — the anomaly is
      // procedural; the derelict resolves a bare aftermath pick.
      if (follow.targetType === 'wreck') coverBareMissionWrecks();
      continue;
    }
    if (m.type === 'escort') {
      out.roster.push({
        archetype: 'mule_trader',
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get('mule_trader'), m.factionId),
      });
      // The ambush wing spawns only after the convoy lands — a still-owed escort may owe it too.
      if ((params.ambushSize || 0) > 0) {
        for (const archetype of new Set(markArchetypePoolFor(m.riskTier))) {
          out.roster.push({ archetype, factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null) });
        }
      }
      continue;
    }
    if (m.type === 'salvage_retrieval') {
      if (mutationRecoveryStub(m)) {
        coverBareMissionWrecks(); // the convoy-wreck pocket's drifting hulk
      } else if (contractClaimSiteMissionStub(m)) {
        coverBareMissionWrecks(); // the filed wreck itself
        out.roster.push(
          { archetype: 'mule_trader', factionId: enemyFactionIdFor(ENEMY_BY_ID.get('mule_trader'), null) },
          { archetype: 'wasp_swarmer', factionId: enemyFactionIdFor(ENEMY_BY_ID.get('wasp_swarmer'), null) },
        );
      }
      continue;
    }
    if (m.type === 'demolition') {
      coverBareMissionWrecks(); // the dead tower
      continue;
    }
    if (m.type === 'rescue_under_fire') {
      coverBareMissionWrecks(); // life pods are bare wreck props
      out.roster.push({
        archetype: 'wasp_swarmer',
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get('wasp_swarmer'), null),
      });
      continue;
    }
    if (m.type === 'tow_recovery') continue; // slag core is a plain asteroid — procedural
    if (m.type === 'authored_set_piece' || m.type === 'capital_boss') {
      // capital_boss offers stamp encounterId/capitalBossId, never authoredSetPieceId —
      // resolving the set-piece tables for them yields nothing; the real spawn reads
      // capitalBossEncounter(params.encounterId).
      const encounter = m.type === 'capital_boss'
        ? capitalBossEncounter(params.encounterId)
        : (() => {
          const definition = authoredSetPieceById(params.authoredSetPieceId)
            || megaHeistById(params.authoredSetPieceId);
          return definition
            && (AUTHORED_SET_PIECE_ENCOUNTERS[definition.id] || MEGA_HEIST_ENCOUNTERS[definition.id]);
        })();
      const fallback = m.type === 'capital_boss' ? 'bruiser_brawler' : 'wasp_swarmer';
      for (const actor of (encounter && encounter.actors) || []) {
        if (!actor) continue;
        if (actor.kind === 'ship') {
          const archetype = actor.archetype || fallback;
          out.roster.push({
            archetype,
            factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null),
          });
        } else if (actor.kind !== 'asteroid') {
          coverBareMissionWrecks(); // wreck-kind set pieces (towers, pods, hulks)
        }
      }
      continue;
    }
    if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
    const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
    const adopted = (m.targetEntityIds || []).length;
    const ghostPack = !!params.ghostConvoy;
    const want = (m.type === 'patrol_clear' || ghostPack) ? remaining : Math.min(1, remaining);
    if (want - adopted <= 0) continue;
    const storyTarget = m.storyTarget && m.storyTarget.archetype ? m.storyTarget : null;
    if (storyTarget) {
      out.roster.push({
        archetype: storyTarget.archetype,
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get(storyTarget.archetype), storyTarget.factionId),
      });
      continue;
    }
    if (ghostPack) {
      out.roster.push(
        { archetype: 'reaver_pirate', factionId: enemyFactionIdFor(ENEMY_BY_ID.get('reaver_pirate'), null) },
        { archetype: 'wasp_swarmer', factionId: enemyFactionIdFor(ENEMY_BY_ID.get('wasp_swarmer'), null) },
      );
      continue;
    }
    for (const archetype of new Set(markArchetypePoolFor(m.riskTier))) {
      out.roster.push({ archetype, factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null) });
    }
  }

  // Restore-scheduled hostile rosters — due ace returns and a pending nemesis deployment —
  // spawn through makeEnemySpawnSpec inside the restored sector's first seconds but never
  // enter any record or mission pass above. Mirror each builder's archetype/faction pick;
  // gated variants simply leave speculative decodes in the runway, which cost nothing.
  const aceNow = (data.entities && Number.isFinite(data.entities.simTime))
    ? data.entities.simTime : 0;
  const aceMemory = data.aceMemory;
  if (aceMemory && typeof aceMemory === 'object') {
    for (const id of Object.keys(aceMemory)) {
      if (ACE_MEMORY_META_KEYS.has(id)) continue;
      const rec = aceMemory[id];
      if (!rec || typeof rec !== 'object') continue;
      if (rec.defeated === true || rec.returnScheduled !== true) continue;
      if (Number.isFinite(rec.nextReturnAttemptAt) && rec.nextReturnAttemptAt > aceNow) continue;
      if (!Number.isFinite(rec.returnAt) || rec.returnAt > aceNow) continue;
      if (rec.promoted === true && rec.expired === true) continue;
      const ace = aceById(id) || (rec.promoted === true ? promotedAceShapeForRecord(id, rec) : null);
      if (!ace || ace.lifecycleOwner === 'nemesis') continue;
      const crew = returnCrewForAce(ace, rec.returnTier || 1, escalatedStyleFromMemory(aceMemory, ace));
      for (const ship of crew) {
        out.roster.push({ archetype: ship.archetype, factionId: ace.factionId || 'faction_reach' });
      }
    }
  }
  // nemesis.js serializes {pending:{sectorId, plan, notBefore, dispatched}} — the encounter
  // host's slot math picks the primary kit's boss + escort hulls and one secondary escort.
  const nemesisPending = data.nemesis && data.nemesis.pending;
  if (nemesisPending && nemesisPending.sectorId === sector.id && nemesisPending.plan) {
    const plan = nemesisPending.plan;
    const primary = NEMESIS_KITS[plan.primary];
    if (primary) {
      out.roster.push({ archetype: primary.bossArchetype, factionId: NEMESIS_RIVAL.factionId });
      const escortCount = Number.isFinite(plan.escortCount) ? plan.escortCount : 0;
      for (let slot = 1; slot <= escortCount; slot++) {
        const kit = (slot === 2 && plan.secondary && NEMESIS_KITS[plan.secondary])
          ? NEMESIS_KITS[plan.secondary] : primary;
        out.roster.push({ archetype: kit.escortArchetype, factionId: NEMESIS_RIVAL.factionId });
      }
    }
  }

  return out;
}

// aceMemory's serialized top level mixes pilot records with these metadata keys — only the
// record rows are crew-bearing (normalizeMemory skips the same set, plus 'aces').
const ACE_MEMORY_META_KEYS = new Set([
  'schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle',
  'aces',
]);
