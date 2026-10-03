// Continue-route sector recipe manifest. The save system's speculative prepare resolves the
// newest envelope during menu dwell and names the saved sector — and that sector's authored
// recipe is fully enumerable before a single spawnEntity fires its decode kick: catalog
// stations/gates/POI landmarks/field geology heads, the palette dressing set, the salted
// kit+wreck dressing streams, durable world records for the sector, and owed mission rosters.
// Each entry is a stub entity carrying exactly the data fields the packaged/authored file
// resolvers read, so the renderer can post the same decodes the spawned bodies will request
// — overlapping menu dwell instead of the restore's authored-visuals gate.

import { SECTORS, SECTOR_PALETTE_CLASSES, dangerIndex } from '../data/sectors.js';
import { isPlayerWanted } from '../systems/heat.js';
import { ASTEROIDS } from '../data/mining.js';
import {
  EVERYDAY_SPACE_KIT_SALT,
  everydaySpaceKitDressingForSector,
} from '../data/everydaySpaceKitDressing.js';
import {
  WRECK_AFTERMATH_SALT,
  wreckAftermathDressingForSector,
} from '../data/wreckAftermathDressing.js';
import { RECORD_KIND, recordShouldRematerialize, recordsForSector, stableRecordId } from '../world/worldRecords.js';
import { embodimentRecordIntents, recordFromEmbodimentIntent } from '../world/embodimentRecipes.js';
import { getDressingRow } from '../world/dressingTable.js';
import { machineSitesForSector } from '../data/precursorMachines.js';
import { alienSitesForSector, planInfestationModules } from '../data/alienEcology.js';
import { markArchetypePoolFor } from '../data/bountyMarks.js';
import { HELIOS_ROPE_CACHE, WORLD_ONE_OFFS } from '../data/worldOneOffs.js';
import { KETTLE_LINE } from '../data/kettleLine.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { authoredSetPieceById, megaHeistById } from '../data/missions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../data/encounters/set-piece-authored.js';
import { MEGA_HEIST_ENCOUNTERS } from '../data/encounters/mega-heist.js';
import { CAPITAL_BOSS_ENCOUNTERS, capitalBossEncounter } from '../data/encounters/capital-boss.js';
import { worldSiteManifestById } from '../data/worldSiteManifests.js';
import {
  aceById,
  escalatedStyleFromMemory,
  returnCrewForAce,
  stanceForRecord,
} from '../data/namedAces.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { zonesForSector } from '../data/sectorZones.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { sectorEnterTrafficShipStubs } from '../systems/traffic.js';
import { planFactionPresence } from '../data/factionPresence.js';
import { lossesFor } from '../systems/lossLedger.js';
import { currentStoryInputs } from '../systems/factionPresence.js';
import { UNIQUE_WRECKS, UNIQUE_WRECK_MATERIALIZE_PHASES } from '../data/uniqueWrecks.js';
import { MORROW } from '../data/morrow.js';

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

// The scripted onboarding cohort (raid raider + claims patrol) resolves its faction exactly
// like makeEnemySpawnSpec: def faction, else the lawful/hostile fallback. Export for the
// embark-speculation arm, which warms the same roster hulls during newGame dwell.
export function scriptedOnboardingRosterRows() {
  return ['reaver_pirate', 'patrol_lawman'].map((archetype) => ({
    archetype,
    factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null),
  }));
}

// A capital score's wing members mint their own spawn specs inside enterAct
// (wingRequested → spawnCapitalBossWing runs synchronously in the same tick), so their
// archetypes never appear in actor or entity records until the screen lands. Enumerate
// the score's static roster with the same faction pick every other warm row uses. An
// unknown encounter id yields no rows — capitalBossEncounter's IRON_MAW fallback would
// warm a different score's hulls. `record` (a live fight row) optionally skips wings
// already requested: their members are real entities the spawn kick owns.
export function capitalBossWingRosterRows(encounterId, record = null) {
  const encounter = Object.hasOwn(CAPITAL_BOSS_ENCOUNTERS, encounterId)
    ? CAPITAL_BOSS_ENCOUNTERS[encounterId] : null;
  const wings = encounter && encounter.score && encounter.score.wings;
  if (!Array.isArray(wings)) return [];
  const bound = record && record.wings;
  const rows = [];
  for (const wing of wings) {
    if (!wing || !Array.isArray(wing.members)) continue;
    if (bound && bound[wing.id]) continue;
    for (const member of wing.members) {
      const archetype = member && member.archetype;
      if (archetype) {
        rows.push({ archetype, factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null) });
      }
    }
  }
  return rows;
}

// Promoted-pilot records carry every ace-shaped field returnCrewForAce reads — rebuild the
// minimal ace object from the saved row rather than importing the aceMemory system module.
export function promotedAceShapeForRecord(id, rec) {
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

// Bare mission wreck coverage pushes the same six aftermath-residue classes once per
// enumeration. One boxed flag lets every cohort collector share that dedupe so the
// warm emits the same stub multiset whether one ledger or six asked for it.
function makeBareWreckCover(out) {
  let covered = false;
  return () => {
    if (covered) return;
    covered = true;
    pushBareWreckResidues(out.placeStubs);
  };
}

// Mirror of automation.js OUTPOST_VISUAL_BY_DEF — unknown defs mount the base outpost
// body. Hoisted module scope: both the envelope lane and the live lane read it.
const OUTPOST_STUB_VISUAL = {
  outpost_refinery: { placeId: 'place_claim_outpost_refinery', claimSpecId: 'spec_refinery' },
  outpost_fuelsynth: { placeId: 'place_claim_outpost_refinery', claimSpecId: 'spec_refinery' },
  outpost_habhub: { placeId: 'place_claim_outpost_relay', claimSpecId: 'spec_relay' },
};

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
  // A caller without a committed seed (the embark arm before Launch picks one) must not
  // enumerate seed-hashed rows — warming seed-1's salted files is wasted decode for a run
  // that will roll a different seed. Unseeded rows still enumerate.
  const seeded = !!(data.meta && Number.isFinite(data.meta.seed));
  const seed = seeded ? data.meta.seed : 1;

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

  // Band-landmark fleets (world.js ~2776): each member mounts one of three authored freighter
  // files — neither a landmarkGlb POI nor a palette/record lane covers them, so a restore into
  // a band-fleet sector would decode the hulls inside the first flight window otherwise.
  for (const poi of sector.pois || []) {
    if (!poi || poi.runtimeOwner) continue;
    const fleetCount = Math.max(0, Math.min(24, Math.trunc(Number(poi.bandLandmarkFleet) || 0)));
    if (fleetCount <= 0 || !poi.flavorTargetRef) continue;
    for (const variant of 'abc') {
      out.placeStubs.push({
        type: 'fx',
        data: {
          poi: true,
          placeId: `place_quiessence_freighter_${variant}`,
          placeTargetRadius: 21,
        },
      });
    }
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
  if (seeded) {
    for (const row of kitRows) {
      out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, everydaySpaceKit: true } });
    }
    for (const row of wreckRows) {
      out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, wreckAftermath: true } });
    }
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
  const coverBareMissionWrecks = makeBareWreckCover(out);

  // sector:enter mounts this whole cohort on EVERY entry — the shared prop collector reads
  // the same ledgers the live lane enumerates (src.X ↔ state.X carry identical shapes), so
  // both warms walk one enumeration instead of drifting copies.
  collectEnterSpawnerPropStubs(data, sector, out, coverBareMissionWrecks);

  // sector_ceres_belt re-points three ambient drone props onto the throughline activity bodies
  // (world.js CERES_ACTIVITY_DRONE_SLOT_PRESENTATION); the palette literal set covers dead_hulk
  // and conveyor_barge but never these two.
  if (sector.id === 'sector_ceres_belt') {
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_dead_hulk', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_bait_wreck', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_grave_shard', worldDressing: true } });
  }
  // Live payload pods (helios rope cache + kettle payoff) mount place_cargo_pod_standard —
  // absent from the one-off table. A restored bag always lacks the prior pod.
  pushRopeCachePodStub(out.placeStubs, sector.id,
    data.world && data.world.discovery && data.world.discovery[sector.id], false);

  for (const rec of sectorRecords) {
    if (rec.kind === RECORD_KIND.WRECK || rec.kind === RECORD_KIND.AFTERMATH) {
      // Rematerialized wrecks resolve through the six-file aftermath residue table — the
      // roster exemplar prewarm only covers survival arenas, so arm the same class cover.
      coverBareMissionWrecks();
      continue;
    }
    // Convoy/npc/mission_target records rematerialize through the ship spec — the resolver
    // reads lootTableId then silhouette/defId, and the kit lane reads entity.factionId,
    // exactly as the spawned spec stamps them (spawnSpecFromRecord shell / makeEnemySpawnSpec).
    out.shipStubs.push(shipStubForRecord(rec));
  }

  // Owed mission targets + restore-scheduled hostile rosters — the shared roster collector
  // walks the same mission/ace ledgers the live lane enumerates.
  collectEnterSpawnerRosterStubs(data, sector,
    (data.entities && Number.isFinite(data.entities.simTime)) ? data.entities.simTime : 0,
    out, coverBareMissionWrecks);
  // A serialized nemesis.pending never deploys post-restore: nemesis.js's save:loaded
  // reconcile unconditionally _cancelPending's it ('save load invalidated in-flight
  // deployment'), and the encounter host requires pending.dispatched for the request id,
  // so hulls warmed here could never mount. The real re-planned deployment warms its
  // roster via warmNemesisSquadDecode on the ~6 s announce window — no stub needed.

  return out;
}

// aceMemory's serialized top level mixes pilot records with these metadata keys — only the
// record rows are crew-bearing (normalizeMemory skips the same set, plus 'aces').
export const ACE_MEMORY_META_KEYS = new Set([
  'schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle',
  'aces',
]);

// ── Enter-spawner cohorts (shared envelope/live enumeration) ─────────────────────────────
// A sector:enter mounts every cohort below on EVERY entry — restore or revisit, REDUCED or
// FULL bag — from ledgers whose live and serialized views carry identical shapes
// (state.X ↔ data.X). One enumerator feeds both warms so the live lane can never drift
// from the restore lane's coverage as the owning systems evolve. `src` is the save packet
// (envelope lane) or the live state (jump/charge warm); `coverBareMissionWrecks` is the
// boxed residue-cover flag shared across a single enumeration.

function collectEnterSpawnerPropStubs(src, sector, out, coverBareMissionWrecks) {
  // Aftermath wreck markers serialize the victim's full visual identity (defId + the same
  // visual fields its own admission read, faction kit, fracture piece) and _spawnForSector
  // rematerializes them at save:loaded — the stub resolves through the same wreckPackagedFile
  // pick the spawned body takes, so defId hulls and fragment files warm with everything else.
  const aftermathMarkers = src.aftermathWrecks && src.aftermathWrecks.bySector
    && src.aftermathWrecks.bySector[sector.id];
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
  const claimBodies = (src.claims && Array.isArray(src.claims.bodies)) ? src.claims.bodies : [];
  for (const body of claimBodies) {
    if (!body || body.sectorId !== sector.id || body.owned !== true) continue;
    out.placeStubs.push({
      type: 'fx',
      data: { claimOwned: true, claimSpecId: (body.spec && body.spec.id) || null },
    });
  }
  const outposts = (src.automation && Array.isArray(src.automation.outposts))
    ? src.automation.outposts
    : [];
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
  const fleet = (src.automation && Array.isArray(src.automation.fleet)) ? src.automation.fleet : [];
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
  const droneGroups = (src.automation && Array.isArray(src.automation.drones)) ? src.automation.drones : [];
  for (const g of droneGroups) {
    if (g && g.sectorId === sector.id) { out.placeStubs.push({ type: 'drone' }); break; }
  }
  // The tethys heist set rematerializes its facilities + berth worker on every entry of its
  // home sector (heistFacilities.materializeForSector) — none of the dressing passes above
  // reach these place ids, and none of the record lanes cover the worker hull.
  if (sector.id === 'sector_tethys_junction') {
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_claim_outpost_relay', worldDressing: true } });
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
  const siteRecords = src.sites && src.sites.worldById;
  if (siteRecords) {
    const warmedSiteFiles = new Set();
    let sectorSites = 0;
    for (const id of Object.keys(siteRecords)) {
      const record = siteRecords[id];
      if (!record || record.sectorId !== sector.id) continue;
      sectorSites++;
      const manifest = worldSiteManifestById(record.manifestId);
      const placeId = manifest ? siteStagePlaceId(manifest, record) : null;
      if (placeId && !warmedSiteFiles.has(placeId)) {
        warmedSiteFiles.add(placeId);
        out.placeStubs.push({ type: 'fx', data: { placeId, worldDressing: true } });
      }
    }
    // planWorldSiteMaterialization also emits bare 'wreck' proxy rows for every manifest
    // component/collisionProxy — they hash-pick from the same residue table mission wrecks
    // use, so any in-sector site record needs the bare-wreck cover.
    if (sectorSites > 0) coverBareMissionWrecks();
  }
  // Anchored claim sites re-ensure their massline relay on entry (asteroidSites
  // _syncClaims/_ensureBeacon): anchored + in-sector + survey lifecycle 'producing'.
  // Same relay file the tethys facility mounts — one stub covers every eligible site.
  const claimSites = src.sites && src.sites.byId;
  if (claimSites) {
    for (const id of Object.keys(claimSites)) {
      const site = claimSites[id];
      if (!site || site.anchored !== true || site.sectorId !== sector.id) continue;
      if (!site.survey || site.survey.lifecycle !== 'producing') continue;
      out.placeStubs.push({ type: 'fx', data: { placeId: 'place_claim_outpost_relay', worldDressing: true } });
      break;
    }
  }
  // A recovery record in the restored sector respawns a bare 'wreck' derelict on entry:
  // recoveryEncounter._rebindSector rematerializes every in-sector record, open or
  // closed (closed records still mount the recovered/burned derelict body), and its
  // parentType picks from the same residue table mission wrecks use.
  const recState = src.recoveryEncounters;
  if (recState && recState.records && typeof recState.records === 'object') {
    for (const id of Object.keys(recState.records)) {
      const rec = recState.records[id];
      if (!rec || rec.sectorId !== sector.id) continue;
      coverBareMissionWrecks();
      break;
    }
  }

  // Derelict-field zones spawn 0-3 bare 'wreck' salvage points on every sector:enter and
  // every restore re-plans them (save:restoring wipes points/plannedSectorId in salvage.js)
  // — the wrecks pick from the same residue classes the mission bare-wreck cover already
  // warms, so a zone in this sector must arm the same cover.
  if ((zonesForSector(sector.id) || []).some((z) => z && z.type === 'derelict_field' && z.center)) {
    coverBareMissionWrecks();
  }

  // Authored unique wrecks whose bearing already minted mount their authored body on entry
  // (uniqueWrecks.js _materialize gates on bearings + the same phase set). The bearing ledger
  // serializes under player.uniqueWrecks, so the packet enumerates it identically. A bare
  // id-less wreck stub would hash 'undefined' onto one residue class (~5/6 wrong); cover the
  // table — military keeps the explicit stub (index 3 is its deterministic file both sides).
  const bearings = src.player && src.player.uniqueWrecks
    && src.player.uniqueWrecks.bearings;
  if (bearings && typeof bearings === 'object') {
    for (const def of UNIQUE_WRECKS) {
      if (!def || def.sectorId !== sector.id) continue;
      const bearing = bearings[def.id];
      if (!bearing || !UNIQUE_WRECK_MATERIALIZE_PHASES.has(bearing.phase)) continue;
      if (def.wreckClass === 'military') {
        out.placeStubs.push({
          type: 'wreck',
          data: {
            parentType: 'military',
            wreckClass: def.wreckClass,
            aftermathMarkerId: `authored:${def.id}`,
          },
        });
      } else {
        coverBareMissionWrecks();
      }
    }
  }
  // The morrow companion mounts the packaged drone body on entry into its home sector —
  // ledger-free, so the packet lane enumerates it identically (Helios' core palette literals
  // never name place_mining_drone).
  if (sector.id === MORROW.sectorId) out.placeStubs.push({ type: 'drone' });
  // A player-wreck marker anywhere rematerializes the survivor pod (generic tow body) on
  // entry — the persistent-entity warm only covers a pod already spawned at save time; a
  // marker minted without a pod mount (saved before the next enter) decodes cold on restore.
  const markerSectors = src.aftermathWrecks && src.aftermathWrecks.bySector;
  if (markerSectors && typeof markerSectors === 'object') {
    for (const list of Object.values(markerSectors)) {
      if (!Array.isArray(list)) continue;
      if (list.some((m) => m && (m.playerWreck === true || m.kind === 'player_wreck'))) {
        out.placeStubs.push({
          type: 'payload',
          data: { payloadType: 'survivor_pod', tetherRole: 'survivor_pod' },
        });
        break;
      }
    }
  }
}

function collectEnterSpawnerRosterStubs(src, sector, simTime, out, coverBareMissionWrecks) {
  // Owed mission targets in the entered sector (_spawnTargetsFor): named marks carry their
  // hull on the row; ghost packs are a fixed anchor+cutter cast; anonymous bounties draw
  // from the shared risk pool. Adopted hosts are already covered by the sector-records
  // pass. The non-bounty needsTargets families (escort convoys, claim sites, salvage
  // pockets, signal derelicts, physical set pieces, authored casts) respawn through the
  // same pass — bare wreck props warm the aftermath table by residue class, ship actors
  // warm their archetype hulls.
  const missions = (src.missions && Array.isArray(src.missions.active)) ? src.missions.active : [];
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
      // The score's wing roster mints its own spawn specs mid-fight (wingRequested →
      // spawnCapitalBossWing): hull-fraction act transitions fire it with zero lead, so the
      // members' archetypes ride the same restore warm as the actors or each screen lands cold.
      if (m.type === 'capital_boss') {
        out.roster.push(...capitalBossWingRosterRows(params.encounterId));
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

  // Enter-scheduled hostile rosters — due ace returns spawn through makeEnemySpawnSpec inside
  // the entered sector's first seconds but never enter any record or mission pass above.
  // Mirror each builder's archetype/faction pick; gated variants simply leave speculative
  // decodes in the runway, which cost nothing.
  const aceNow = Number.isFinite(simTime) ? simTime : 0;
  const aceMemory = src.aceMemory;
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
      // _spawnReturn gates a promoted record whose spared-debt already revealed through the
      // authored moral-return encounter — the ledger counts it settled, no crew fields.
      const debts = src.story && src.story.moralMemory && src.story.moralMemory.debts;
      if (rec.promoted === true && debts && debts[rec.id] && debts[rec.id].status === 'revealed') continue;
      // offers_work routes to _spawnWorkOffer with an UNSTYLED crew (style=null); warming
      // the escalated style's counter hulls there decodes the wrong files. Other stances
      // take the styled hostile crew exactly as the live path builds it.
      const style = stanceForRecord(rec).stance === 'offers_work'
        ? null : escalatedStyleFromMemory(aceMemory, ace);
      const crew = returnCrewForAce(ace, rec.returnTier || 1, style);
      for (const ship of crew) {
        out.roster.push({ archetype: ship.archetype, factionId: ace.factionId || 'faction_reach' });
      }
    }
  }
}

// Live-only enter cohorts — the serialized packet cannot enumerate these, but a live
// sector:enter mounts them all: ambient/authored traffic hulls, faction-presence plans,
// and intervention sites. Unique-wreck bearings, the morrow companion, and the survivor
// pod mount on entry too but ride collectEnterSpawnerPropStubs — their ledgers serialize.
function liveEnterSpawnerStubs(state, sector, out, coverBareMissionWrecks) {
  // Ambient role-mix + pocket/cast/lane-contact hulls — the spawn path's own enumeration
  // (traffic.js) so the warm can't drift from the mount set as roles evolve.
  for (const row of sectorEnterTrafficShipStubs(sector, state)) {
    out.shipStubs.push({
      type: 'ship',
      factionId: row.factionId,
      data: { defId: row.defId, trafficRole: row.trafficRole || null, lootTableId: null },
    });
  }
  // Faction-presence plans — the same pure planner with the same inputs the system's
  // sector:enter listener feeds it (hasLedger gate included, so this observer can never
  // initialize another system's state).
  const hasLedger = !!(state.lossLedger
    && state.lossLedger.bySector
    && typeof state.lossLedger.bySector === 'object'
    && Array.isArray(state.lossLedger.entries));
  const presencePlans = planFactionPresence({
    sectorId: sector.id,
    seed: ((state.meta && state.meta.seed) || 1) >>> 0,
    losses: hasLedger ? lossesFor(state, sector.id) : [],
    ...currentStoryInputs(state),
    conflicts: state.conflicts || null,
    ownerFactionId: sector.owner || null,
  });
  for (const plan of presencePlans || []) {
    if (!plan || !plan.shipDefId) continue;
    out.shipStubs.push({
      type: 'ship',
      factionId: plan.factionId || null,
      data: { defId: plan.shipDefId, lootTableId: null },
    });
  }
  // Pending interventions materialize a wreck + guard/jumper pair on entry
  // (intervention.js _materializePendings → _spawnSite/_spawnGuard/_spawnJumper). Every
  // job.kind is non-military, so the mount's residue file is the spawn's allocated-id hash
  // — an id-less stub hashes 'undefined' onto one fixed class (~5/6 wrong); cover the table.
  // The guard/jumper specs carry no defId/lootTableId/silhouette, so both hulls mount the
  // procedural buildShipMesh path — no authored file to warm, no roster stubs to push.
  const pendings = Array.isArray(state.pendingInterventions) ? state.pendingInterventions : [];
  if (pendings.some((job) => job && job.sectorId === sector.id)) coverBareMissionWrecks();
  // Unique-wreck bearings, the morrow companion, and the survivor pod moved into
  // collectEnterSpawnerPropStubs — their ledgers (player.uniqueWrecks, aftermathWrecks)
  // serialize identically, so the shared collector serves the envelope lane too.
}

// ── Live-sector FULL-extras stubs ───────────────────────────────────────────────────────────
// Twin of saveEnvelopeSectorStubs for a sector being charged into: a bag materialized REDUCED
// carries none of the FULL extras — world._promoteSectorToFull only spawns dressing, ambient
// enemies, the boss, and the live POI actors at/after sector:enter, so none of their files
// appear in the live-entity census the charge warm walks, and every one would decode inside
// the first flight window otherwise. Each branch mirrors the promote's own gate against the
// live bag, so the stub set is the exact set the promote can mount — files for cohorts the
// bag already built are never warmed. Optic lattices, fauna, and machine entities build
// procedural meshes and have no file surface; records follow the envelope's own stub shapes.

// Mirror of world.js poiMustStayLiveActor — promote re-arms a dressing row as a live actor
// under the row's own data, so passing that data through as the stub resolves the same file.
function poiPromotesToLiveActor(poi, activityObjectSlotId) {
  if (activityObjectSlotId) return true;
  if (!poi || typeof poi !== 'object') return false;
  return poi.collides === true || !!poi.scannerSignalKind || !!poi.flavorTargetRef
    || poi.requiresActiveScan === true || poi.landmark === true || !!poi.discoveryPlate
    || poi.survivorPod === true || poi.recoveryEncounter === true || poi.claimable === true
    || poi.hidden === true;
}

// Mirror of sectorSim.js effectiveSectorFor's density projection (the real _enemyPool call
// site reads catalog security — only enemyDensity drifts live): a sector drifted 0→positive
// after the stub's catalog read would skip the ambient roster warm entirely while
// _spawnEnemies sizes off the drifted value.
function effectiveSectorDensityFor(simState, sectorId, base) {
  const node = simState && simState.sectorSim && simState.sectorSim.field
    && simState.sectorSim.field.nodes && simState.sectorSim.field.nodes[sectorId];
  if (node) {
    const desiredDanger = Math.min(1, Math.max(0, Number(node.danger) || dangerIndex(base)));
    const delta = desiredDanger - dangerIndex(base);
    return Math.min(0.80, Math.max(0,
      (base.enemyDensity || 0) + delta * 0.82 + Math.max(0, node.pricePressure || 0) * 0.05));
  }
  const rec = simState && simState.sectorSim && simState.sectorSim.sectors
    && simState.sectorSim.sectors[sectorId];
  return rec && rec.drift && Number.isFinite(rec.drift.enemyDensity)
    ? rec.drift.enemyDensity
    : (base.enemyDensity || 0);
}

// Live payload pods mount place_cargo_pod_standard on their home sectors: the helios rope
// cache respawns whenever the bag lacks a live prior pod; the kettle payoff needs the stern
// scan tell investigated (discovery ledger in both lanes).
function pushRopeCachePodStub(placeStubs, sectorId, discovery, hasLivePrior) {
  if (sectorId === HELIOS_ROPE_CACHE.sectorId && !hasLivePrior) {
    placeStubs.push({ type: 'fx', data: { placeId: HELIOS_ROPE_CACHE.placeId, worldOneOff: true } });
  }
  if (sectorId === KETTLE_LINE.sectorId) {
    const stern = discovery && discovery.pois && discovery.pois[KETTLE_LINE.terminalPoiId];
    if (stern && stern.investigated) {
      placeStubs.push({ type: 'fx', data: { placeId: KETTLE_LINE.payoff.placeId, worldOneOff: true } });
    }
  }
}

// Mirror of world.js _enemyPool — ambient rolls draw one of three static pools on the
// sector's own security/tier axes.
const LIVE_LAWFUL_ENEMIES = ['patrol_lawman'];
const LIVE_PIRATE_ENEMIES = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
const LIVE_FRONTIER_ENEMIES = ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'];
function liveEnemyPoolFor(sector) {
  if (sector.security >= 0.6) return LIVE_LAWFUL_ENEMIES;
  if (sector.tier >= 3) return LIVE_FRONTIER_ENEMIES;
  return LIVE_PIRATE_ENEMIES;
}

// WANTED bounty hunters: inside the same ambient leg (world.js _spawnEnemiesChunks — after
// the density<=0 early-out), a hot player in a lawless sector also spawns patrol_lawman
// hunters. That spec resolves to a hull outside the ambient pool's catalog, so the hunter
// arm must ride the roster beside the pool rows or ambush hunters mount decode-cold.
function pushWantedHunterRosterRows(roster, state, sector) {
  if (!sector || sector.security >= 0.6 || !isPlayerWanted(state)) return;
  const archetype = 'patrol_lawman';
  roster.push({
    archetype,
    factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null),
  });
}

/**
 * Queued world:spawnRequest cohorts for a sector (world.pendingSpawns rows flush inside the
 * enter sequence). Their forced enemyTypeId hulls get no roster arm from any other warm
 * lane; a non-forced request still draws from the sector's ambient pool whether or not the
 * ambient gate is open — under byte pressure the pool warm is the whole-window decode.
 * @returns {Array<{archetype: string, factionId: string|null}>}
 */
export function queuedSpawnRequestRoster(world, sectorId) {
  const queue = world && world.pendingSpawns ? world.pendingSpawns[sectorId] : null;
  if (!Array.isArray(queue) || !queue.length) return [];
  const sector = (world.sectors && world.sectors[sectorId]) || SECTOR_BY_ID.get(sectorId);
  const out = [];
  for (const req of queue) {
    if (req && typeof req.enemyTypeId === 'string' && req.enemyTypeId) {
      out.push({
        archetype: req.enemyTypeId,
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get(req.enemyTypeId), null),
      });
    } else if (sector) {
      for (const archetype of liveEnemyPoolFor(sector)) {
        out.push({ archetype, factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null) });
      }
    }
  }
  return out;
}

// Bare wreck bodies (mission wrecks, aftermath residue, durable wreck records) pick their
// packaged file by allocated-id hash across the six-class residue table — covering means
// one stub per class so whatever the mount hashes to is already decoded. Callers keep a
// once-flag; file-level dedupe makes repeats harmless anyway.
function pushBareWreckResidues(placeStubs) {
  const covered = new Set();
  for (let i = 0; covered.size < 6 && i < 64; i += 1) {
    const id = `envelope-warm:mission-wreck:${i}`;
    const variant = hashId(id) % 6;
    if (covered.has(variant)) continue;
    covered.add(variant);
    placeStubs.push({
      id,
      type: 'wreck',
      data: { wreckClass: 'battlefield', parentType: 'ship' },
    });
  }
}

// Shared ship-stub shape for a rematerializing durable record — the resolver reads
// lootTableId/silhouette/defId exactly as spawnSpecFromRecord stamps them; enemy-spec
// records resolve through the def table (unknown ids fall back to [0]).
function shipStubForRecord(rec) {
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
  return { id: rec.recordId, type: 'ship', factionId: stubFactionId, data: stubData };
}

// Promote's _reconcileEmbodimentRecordsChunks inserts current embodiment intents as durable
// records BEFORE the record walk — enumerate the same insertions so callers union them
// into both the combat-history gate and the ship-stub pass. Pure: only reads the cache.
function embodimentStubsRecords(embodiment, sectorId, seed, sector) {
  const records = [];
  for (const intent of embodimentRecordIntents(embodiment, sectorId)) {
    const rec = recordFromEmbodimentIntent(intent, {
      seed,
      tick: 0,
      fallbackFactionId: (sector && (sector.owner || sector.factionId)) || 'faction_free',
    });
    if (rec) records.push(rec);
  }
  return records;
}

// Mirror of world.js liveRecordEntityIndex/farActorRecordIdSet — entities (or shelved far-actor
// rows) already carrying a record id make its rematerialize an exactly-once skip. The entities
// map is the full holder domain (every type lane plus unindexed carriers); dead members are
// skipped so an uncompacted corpse never suppresses a warm the live gate would have run.
function liveSectorRecordHolderIds(state) {
  const held = new Set();
  const source = state && state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : (state && state.entityList) || [];
  for (const e of source) {
    if (e && e.alive && e.data && e.data.worldRecordId != null) held.add(e.data.worldRecordId);
  }
  const farRows = state && state.world && state.world.farActors && state.world.farActors.rows;
  for (const row of farRows || []) {
    if (row && row.alive !== false && row.data && row.data.worldRecordId != null) {
      held.add(row.data.worldRecordId);
    }
  }
  return held;
}

// Mirror of world.js aftermathOwnsMarker — read-only: an AFTERMATH record owned by a marker
// respawns as the marker's hulk, never as a thin record shell.
function liveAftermathOwnsMarker(state, markerId) {
  const bySector = state && state.aftermathWrecks && state.aftermathWrecks.bySector;
  if (!markerId || !bySector) return false;
  for (const markers of Object.values(bySector)) {
    if (Array.isArray(markers) && markers.some((m) => m && m.markerId === markerId)) return true;
  }
  return false;
}

/**
 * Enumerate the authored visual files a resident sector's FULL-extras promote can mount.
 * Pure reads only — never touches world rng, records, or the dressing table.
 * @returns {{ sectorId: string|null, placeStubs: object[], roster: object[] }}
 */
export function liveSectorFullExtrasStubs(state, sectorId, activeOverride) {
  const out = { sectorId: null, placeStubs: [], shipStubs: [], roster: [] };
  const world = state && state.world;
  const sector = sectorId && (world.sectors && world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId));
  if (!sector) return out;
  out.sectorId = sector.id;
  // sector:enter mounts a second cohort independent of the bag's tier — every system's own
  // enter listener fires on every entry, and nothing on the promote path covers hulls the
  // jump ships into the census (W42-popin: enter-spawned hulls decoded cold at mount).
  // Same enumeration the envelope lane runs, reading the live ledgers, plus the cohorts
  // only live state can enumerate (traffic plans, faction presence, interventions,
  // authored unique wrecks, the morrow companion, the survivor pod).
  const coverBareMissionWrecks = makeBareWreckCover(out);
  collectEnterSpawnerPropStubs(state, sector, out, coverBareMissionWrecks);
  collectEnterSpawnerRosterStubs(state, sector, state && state.simTime, out, coverBareMissionWrecks);
  liveEnterSpawnerStubs(state, sector, out, coverBareMissionWrecks);
  // The materialize lane arms the warm with its in-flight bag — it is populated but not yet
  // published to sectorContents when the decode runway needs the cohort.
  const active = activeOverride || (world && world.sectorContents && world.sectorContents[sectorId]);
  // A bag already built at FULL (or absent — the charge path only reaches resident sectors,
  // which all carry bags) has no promote cohort to warm.
  if (!active || active.fullExtrasBuilt === true) return out;
  const seed = (state.meta && Number.isFinite(state.meta.seed)) ? state.meta.seed : 1;
  const sectorRecords = recordsForSector(world.records, sector.id);
  const heldRecordIds = liveSectorRecordHolderIds(state);
  // Promote inserts current embodiment intents as durable records BEFORE the record walk —
  // union them into the combat-history gate and stub pass so their hulls warm too.
  const intentRecords = embodimentStubsRecords(world.embodiment, sector.id, seed, sector);

  // Promote's first step rematerializes the sector's FULL-tier durable records — same stub
  // shape the envelope lane builds (enemy-spec records resolve through the def table).
  let bossRecordRematerializes = false;
  let hasRematerializingWrecks = false;
  // _promoteSectorToFull reads active.enemies AFTER rematerialize pushes every spawned ship
  // into it (world.js:1376) — a REDUCED bag whose records rematerialize to ships suppresses
  // the ambient re-roll and the boss spawn outright, so warming either roster would decode
  // bodies the promote never mounts. Only the spawn leg is counted: a live-held record's
  // carrier-type check isn't reproduced here, and missing it just keeps the ambient warm.
  let rematerializePushesEnemies = false;
  for (const rec of sectorRecords.concat(intentRecords)) {
    if (!rec || rec.alive === false) continue;
    // world.js:1743 — a marker-owned AFTERMATH respawns as the marker's hulk, never the
    // thin record shell; it rematerializes nothing and must not count for wreck stubs.
    if (rec.kind === RECORD_KIND.AFTERMATH && liveAftermathOwnsMarker(state, rec.markerId)) continue;
    if (rec.kind === RECORD_KIND.WRECK || rec.kind === RECORD_KIND.AFTERMATH) {
      if (recordShouldRematerialize(rec, 'FULL') && !heldRecordIds.has(rec.recordId)) {
        hasRematerializingWrecks = true;
      }
      continue;
    }
    if (!recordShouldRematerialize(rec, 'FULL')) continue;
    if (heldRecordIds.has(rec.recordId)) continue;
    if (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.CONVOY
      || rec.kind === RECORD_KIND.MISSION_TARGET || rec.isBoss === true) {
      rematerializePushesEnemies = true;
    }
    if (rec.isBoss === true) bossRecordRematerializes = true;
    if (rec.recordSource === 'sector_embodiment' && world.records
        && world.records.byId && world.records.byId[rec.recordId]) continue; // record pass covers it
    out.shipStubs.push(shipStubForRecord(rec));
  }
  // Rematerialized wreck/aftermath records mount a bare 'wreck' body whose packaged file is
  // an allocated-id hash pick across the residue table — cover all six classes like the
  // envelope lane does for mission wrecks.
  if (hasRematerializingWrecks) coverBareMissionWrecks();

  // POI dressing rows that promote to live actors — always runs (the promote re-arms them
  // even when dressing already exists), mirroring _promotePoiRowsToLive's own predicate.
  const sourceById = new Map((sector.pois || []).map((poi) => [poi.id, poi]));
  for (const entry of active.pois || []) {
    const row = entry && entry.id != null ? getDressingRow(state, entry.id) : null;
    if (!row || !row.data || row.data.poi !== true) continue;
    const data = row.data;
    const bandHull = Number.isFinite(Number(data.quiessenceShipIndex));
    const source = sourceById.get(data.poiId) || null;
    const slot = typeof data.activityObjectSlotId === 'string' ? data.activityObjectSlotId : null;
    if (!bandHull && !(source && poiPromotesToLiveActor(source, slot))) continue;
    out.placeStubs.push({ type: 'fx', factionId: (source && source.factionId) || null, data });
  }

  // Dressing cohort — skipped entirely when the bag already carries dressing rows (promote's
  // own gate), otherwise: palette literals, salted kit/wreck streams on the LIVE resident
  // epoch, world one-offs, alien-ecology growth modules, and machine-layer ring props.
  if (!(active.dressing && active.dressing.length)) {
    const palette = paletteClassForSector(sector);
    const literalIds = PALETTE_DRESSING_IDS[palette] || PALETTE_DRESSING_IDS.core;
    for (const placeId of literalIds({
      stations: (active.stations || []).length > 0,
      gates: (active.gates || []).length > 0 || (sector.neighbors || []).length > 0 || !!sector.wormholeTo,
      fields: (active.fields || []).length > 0,
      wrecks: (active.pois || []).some((row) => row && (row.type === 'wreck' || row.type === 'derelict')),
    })) {
      if (placeId) out.placeStubs.push({ type: 'fx', data: { placeId, worldDressing: true } });
    }
    const rec = world.residentSectors && world.residentSectors[sectorId];
    const epoch = rec && Number.isFinite(rec.epoch) ? rec.epoch : 0;
    const anchors = {
      stations: active.stations || [],
      gates: active.gates || [],
      fields: active.fields || [],
      wrecks: (active.pois || []).filter((row) => row && (row.type === 'wreck' || row.type === 'derelict')),
      origin: sectorGlobalOrigin(sector.id),
      worldRadius: sector.worldRadius,
      enemyDensity: sector.enemyDensity,
    };
    for (const row of everydaySpaceKitDressingForSector(
      sector.id, palette, mulberry32(hash32(seed, sector.id, epoch, EVERYDAY_SPACE_KIT_SALT)), anchors,
    )) {
      out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, everydaySpaceKit: true } });
    }
    for (const row of wreckAftermathDressingForSector(
      sector.id, palette, mulberry32(hash32(seed, sector.id, epoch, WRECK_AFTERMATH_SALT)), anchors,
    )) {
      out.placeStubs.push({ type: 'fx', data: { placeId: row.placeId, wreckAftermath: true } });
    }
    for (const oneOff of WORLD_ONE_OFFS) {
      if (!oneOff || oneOff.sectorId !== sector.id || !oneOff.placeId) continue;
      if (oneOff.physicalBody) {
        const recordId = stableRecordId(seed, sector.id, RECORD_KIND.WRECK, `worldOneOff:${oneOff.id}`);
        const durable = (world.records && world.records.byId || {})[recordId];
        if (durable && (durable.outcome === 'destroyed' || durable.alive === false)) continue;
      }
      out.placeStubs.push({ type: 'fx', data: { placeId: oneOff.placeId, worldOneOff: true } });
      for (const part of (oneOff.cluster && oneOff.cluster.props) || []) {
        if (part && part.placeId) {
          out.placeStubs.push({ type: 'fx', data: { placeId: part.placeId, worldOneOff: true } });
        }
      }
    }
    // Ecology growth dressing is seeded per-site on (seed, sectorId, epoch=0, siteId) inside
    // materializeAlienEcology; the ambient pass adds the filament-sheet body to non-sterile
    // sites. Site state reads read-only — a warm must never write the ecology ledger.
    const aeSites = world.alienEcology && world.alienEcology.sites;
    for (const site of alienSitesForSector(sector.id)) {
      if (!site || site.sterile) continue;
      const siteState = (aeSites && aeSites[site.siteId] && aeSites[site.siteId].state) || 'dormant';
      const siteRng = mulberry32(hash32(seed, sector.id, 0, 'alien-ecology', site.siteId));
      for (const g of planInfestationModules(site, siteRng, siteState) || []) {
        if (g && g.moduleId) {
          out.placeStubs.push({
            type: 'fx',
            data: { placeId: `alien_growth_${g.moduleId}`, alienEcology: true },
          });
        }
      }
      out.placeStubs.push({ type: 'fx', data: { placeId: 'alien_growth_filament_sheet', alienEcology: true } });
    }
    for (const site of machineSitesForSector(sector.id)) {
      const ring = site && site.propRing;
      if (ring && ring.propId) {
        out.placeStubs.push({ type: 'fx', data: { placeId: ring.propId, machineSite: site.siteId } });
      }
    }
  }

  // Mirror _ensureSectorMaterializedChunks exactly: ambient combatants re-roll only with no
  // durable combat history (a NON-combat record like MISSION_TARGET still rematerializes into
  // active.enemies, so a bag-content test would starve both rosters), and the boss spawn is
  // not conditioned on combat history at all — only on an unclaimed, undefeated claim.
  const hadCombatHistory = sectorRecords.concat(intentRecords).some((rec) => rec
    && (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.CONVOY || rec.isBoss === true));
  // The promote's :1376 gate — enemies-or-dressing populated post-rematerialize suppresses
  // ambient and boss wholesale (only dressing still mounts when the bag lacks it).
  const promoteKeepsAnchors = rematerializePushesEnemies
    || (active.enemies && active.enemies.length > 0)
    || (active.dressing && active.dressing.length > 0);
  // _spawnEnemies sizes off the DRIFTED density — the gate must read the same effective
  // value or a 0→positive drift skips the ambient warm while ambient rolls still spawn.
  if (!promoteKeepsAnchors && !hadCombatHistory && effectiveSectorDensityFor(state, sector.id, sector) > 0) {
    for (const zone of zonesForSector(sector.id)) {
      const presence = zone && zone.presence;
      if (!presence || presence.hostile === undefined || !Array.isArray(presence.archetypes)) continue;
      const factionId = presence.factionId || zone.factionId || null;
      for (const archetype of presence.archetypes) {
        out.roster.push({
          archetype,
          factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), factionId),
        });
      }
    }
    for (const archetype of liveEnemyPoolFor(sector)) {
      out.roster.push({
        archetype,
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null),
      });
    }
    pushWantedHunterRosterRows(out.roster, state, sector);
  }
  const bossPoi = (sector.pois || []).find((p) => p && p.type === 'anomaly' && p.id === 'poi_boss');
  if (bossPoi) {
    const disc = world.discovery && world.discovery[sector.id];
    const bossDefeated = !!(disc && disc.pois && disc.pois[bossPoi.id] && disc.pois[bossPoi.id].bossDefeated);
    const liveBoss = active.boss && state.entities && state.entities.get(active.boss.entityId);
    // Suppress only for a record that will actually mount the boss — the rematerialize
    // enumeration already covers it with a shipStub. A merely-held record (live carrier
    // elsewhere or a farActor row) is no coverage at all: _spawnBossIfDue ignores records,
    // so gating on it starved the fresh spawn's decode.
    if (!promoteKeepsAnchors && !bossDefeated && !(liveBoss && liveBoss.alive !== false)
      && !bossRecordRematerializes) {
      out.roster.push({ archetype: 'dreadnought_boss' });
    }
  }

  // Ceres dressing mounts place_dead_hulk off any wreck anchor plus the throughline slot
  // presentations — the palette literals only reach dead_hulk through the kit stream.
  if (sector.id === 'sector_ceres_belt') {
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_dead_hulk', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_bait_wreck', worldDressing: true } });
    out.placeStubs.push({ type: 'fx', data: { placeId: 'place_ceres_grave_shard', worldDressing: true } });
  }
  const ropePrior = active.heliosRopeCacheId != null && state.entities
    && typeof state.entities.get === 'function' && state.entities.get(active.heliosRopeCacheId);
  pushRopeCachePodStub(out.placeStubs, sector.id,
    world.discovery && world.discovery[sector.id], !!ropePrior);

  // Queued spawnRequests flush inside the enter sequence independent of the ambient gate —
  // cover their cohorts unconditionally.
  out.roster.push(...queuedSpawnRequestRoster(world, sector.id));

  return out;
}

/**
 * Envelope twin of liveSectorFullExtrasStubs for the menu-dwell warm: a save packet carries
 * no residentSectors/sectorContents (migrations strips both — a restore always re-derives
 * the bag at epoch 0), so the live bag gates collapse onto what the saved sector's FIRST
 * materialize will mount. Everything the envelope already enumerates (stations, gates,
 * fields, POI landmarks, palette literals, salted kit/wreck streams, world one-offs, durable
 * records, mission targets) stays in saveEnvelopeSectorStubs — this adds only the cohorts
 * the envelope lacked: ambient enemy pool + boss roster (fresh-materialize gates mirror
 * _ensureSectorMaterializedChunks: ambient combatants re-roll only with no durable combat
 * history, the boss needs an undefeated, unrecorded claim), ecology growth modules (same
 * epoch-0 site stream; site state restores from the serialized alienEcology ledger), and
 * machine-layer ring props. POI dressing rows promoted to live actors stay a live-only
 * cohort — their place data lives on the generated bag row, unreachable from the packet.
 */
export function saveEnvelopeFullExtrasStubs(data) {
  const out = { sectorId: null, placeStubs: [], shipStubs: [], roster: [] };
  const sectorId = data && data.world && data.world.currentSectorId;
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  if (!sector) return out;
  out.sectorId = sector.id;
  const seeded = !!(data.meta && Number.isFinite(data.meta.seed));
  const seed = seeded ? data.meta.seed : 1;
  const recordsById = (data.world && data.world.records && data.world.records.byId) || {};
  const sectorRecords = Object.keys(recordsById)
    .map((id) => recordsById[id])
    .filter((rec) => rec
      && rec.alive !== false
      && (rec.sectorId === sector.id || rec.homeSectorId === sector.id));
  // Embodiment intents insert as durable records at the restore's promote — union them into
  // the combat-history gate and emit a ship stub for any the record pass doesn't already own.
  const intentRecords = embodimentStubsRecords(
    data.world.embodiment, sector.id, seed, sector,
  );
  const hadCombatHistory = sectorRecords.concat(intentRecords).some((rec) => rec
    && (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.CONVOY || rec.isBoss === true));
  const heldRecordIdsForStubs = new Set(
    ((data.entities && Array.isArray(data.entities.persistent)) ? data.entities.persistent : [])
      .map((e) => e && e.data && e.data.worldRecordId)
      .filter((id) => id != null),
  );
  let hasRematerializingWrecks = false;
  for (const rec of sectorRecords.concat(intentRecords)) {
    if (rec.kind === RECORD_KIND.WRECK || rec.kind === RECORD_KIND.AFTERMATH) {
      if (recordShouldRematerialize(rec, 'FULL') && !heldRecordIdsForStubs.has(rec.recordId)) {
        hasRematerializingWrecks = true;
      }
      continue;
    }
    if (rec.recordSource !== 'sector_embodiment') continue; // durable records already covered
    if (recordsById[rec.recordId]) continue; // record pass in saveEnvelopeSectorStubs covers it
    if (!recordShouldRematerialize(rec, 'FULL')) continue;
    if (heldRecordIdsForStubs.has(rec.recordId)) continue;
    out.shipStubs.push(shipStubForRecord(rec));
  }
  if (hasRematerializingWrecks) pushBareWreckResidues(out.placeStubs);

  if (!hadCombatHistory && effectiveSectorDensityFor(data, sector.id, sector) > 0) {
    for (const zone of zonesForSector(sector.id)) {
      const presence = zone && zone.presence;
      if (!presence || presence.hostile === undefined || !Array.isArray(presence.archetypes)) continue;
      const factionId = presence.factionId || zone.factionId || null;
      for (const archetype of presence.archetypes) {
        out.roster.push({
          archetype,
          factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), factionId),
        });
      }
    }
    for (const archetype of liveEnemyPoolFor(sector)) {
      out.roster.push({
        archetype,
        factionId: enemyFactionIdFor(ENEMY_BY_ID.get(archetype), null),
      });
    }
    pushWantedHunterRosterRows(out.roster, data, sector);
  }

  const bossPoi = (sector.pois || []).find((p) => p && p.type === 'anomaly' && p.id === 'poi_boss');
  if (bossPoi) {
    const disc = data.world.discovery && data.world.discovery[sector.id];
    const bossDefeated = !!(disc && disc.pois && disc.pois[bossPoi.id] && disc.pois[bossPoi.id].bossDefeated);
    // Same rule as the live enumerator: only a record that actually rematerializes claims
    // the boss slot — it is already enumerated into shipStubs, so suppressing the roster
    // stub for a merely-held record left the restored boss's GLB with no warm.
    const recordClaims = sectorRecords.concat(intentRecords).some((rec) => rec && rec.isBoss === true
      && recordShouldRematerialize(rec, 'FULL'));
    if (!bossDefeated && !recordClaims) {
      out.roster.push({ archetype: 'dreadnought_boss' });
    }
  }

  // Fresh materialize is epoch 0 (residentSectors restore empty) — identical stream to the
  // live enumerator's 'alien-ecology' draw. The module plan is seed-hashed: an unseeded
  // caller still warms the always-mounted filament sheet but skips guessed module ids.
  const aeSites = data.world.alienEcology && data.world.alienEcology.sites;
  for (const site of alienSitesForSector(sector.id)) {
    if (!site || site.sterile) continue;
    if (seeded) {
      const siteState = (aeSites && aeSites[site.siteId] && aeSites[site.siteId].state) || 'dormant';
      const siteRng = mulberry32(hash32(seed, sector.id, 0, 'alien-ecology', site.siteId));
      for (const g of planInfestationModules(site, siteRng, siteState) || []) {
        if (g && g.moduleId) {
          out.placeStubs.push({
            type: 'fx',
            data: { placeId: `alien_growth_${g.moduleId}`, alienEcology: true },
          });
        }
      }
    }
    out.placeStubs.push({ type: 'fx', data: { placeId: 'alien_growth_filament_sheet', alienEcology: true } });
  }
  for (const site of machineSitesForSector(sector.id)) {
    const ring = site && site.propRing;
    if (ring && ring.propId) {
      out.placeStubs.push({ type: 'fx', data: { placeId: ring.propId, machineSite: site.siteId } });
    }
  }
  // Queued spawnRequests ride the save packet and flush on the restored sector's enter —
  // same coverage duty as the live enumerator.
  out.roster.push(...queuedSpawnRequestRoster(data.world, sector.id));
  return out;
}
