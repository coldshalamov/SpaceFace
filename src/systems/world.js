// World / Sectors / Navigation system (ARCHITECTURE §2.3 step 13, §3.8, design 05).
//
// Owns: the sector graph (loaded copy of SECTORS), the active sector's live contents
// (stations / asteroid fields / enemies / POIs / gates), the fog-of-war discovery overlay,
// the jump state machine (IDLE→CHARGING→JUMPING→COOLDOWN), fuel, hazard membership, POI scan
// reveal, and the Dijkstra route helper.
//
// M2a continuous corridor (Helios↔Ceres↔Tethys):
//   - entity.pos is galactic-global; free-flight membership never teleports the player.
//   - world-owned residentSectors track FULL / REDUCED / RECORD_ONLY with a hard cap.
//   - enterSector still serves boot + intentional gate/drive jumps (may place at target).
//   - Continuous membership changes never call the legacy global-wipe helper.
//
// enterSector(sectorId, {fromJump}) is the entry point main.js calls at boot
//   (registry.get('world').enterSector(startSectorId)). It materializes the target + bounded
//   corridor prefetch, sets state.world.currentSectorId / activeSector / corridor bounds,
//   places the player only on non-continuous enters, and emits sector:enter.
//
// Determinism (§0.5): sector content uses mulberry32(hash32(meta.seed, sectorId, epoch));
//   epoch is first materialization and does not change on membership jitter. Never Math.random().
// Single-writer (§0.6): world owns world.*/jump/fuel/nav; it emits economy:chargeCredits for
//   gate tolls and never writes credits/cargo/rep directly. (Radiation hull drain is an
//   environmental effect applied to the entity hull, which has no separate combat owner.)
import { SECTORS, SECTOR_PALETTE_CLASSES, dangerIndex, surveyDataPrice } from '../data/sectors.js';
import { stationSloganFor } from '../data/stationSlogans.js';
import {
  FRONTIER_RUMOR_RECEIPT_LIMIT,
  frontierRumorPurchaseOffer,
  normalizeFrontierRumorState,
  sensorPostRumorOffer,
  TETHYS_BLACK_MARKET_DISCOVERY,
} from '../data/frontierRumors.js';
import {
  VESTA_ORE_CACHE,
  VESTA_ORE_CACHE_CHOICES,
  freshVestaOreCacheState,
  normalizeVestaOreCacheState,
  vestaOreCacheChoice,
} from '../data/vestaOreCache.js';
import {
  PALLAS_HIDDEN_CACHE,
  PALLAS_HIDDEN_CACHE_CHOICES,
  PALLAS_HIDDEN_CACHE_RESOLUTION_ID,
  freshPallasHiddenCacheState,
  normalizePallasHiddenCacheState,
  pallasHiddenCacheChoice,
  pallasHiddenCacheLot,
} from '../data/pallasHiddenCache.js';
import {
  ORRIN_WITNESS_MARKER_ID,
  ORRIN_WITNESS_PERSISTENCE_OWNER,
  isOrrinWitnessRecorder,
  orrinWitnessRecordId,
  orrinWitnessSource,
} from '../data/orrinWitnessCase.js';
import { collisionProxyIdForStation } from '../data/collisionProxyManifests.js';
import { effectiveSectorFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for spawn sizing
import { regionalEcologyReadout, regionalResourceYieldMultiplier } from './regionalEcology.js';
import { ASTEROIDS, FIELDS, deriveAsteroidSeams } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import {
  SMUGGLING_DROP_CACHE,
  normalizeSmugglingDropCacheState,
  sellableSmugglingDropCaches,
} from '../data/smugglingStealth.js';
import { FIXER_CONTACT, fixerMemoryFor } from '../data/stationContacts.js';
import {
  LISTENING_POST,
  listeningPostPuzzleState,
  validateListeningPostAttempt,
} from '../data/listeningPost.js';
import { DEAD_GATE, normalizeDeadGateState } from '../data/deadGate.js';
import {
  UNREGISTERED_CACHE_BY_POI,
  normalizeUnregisteredCachesState,
} from '../data/unregisteredCaches.js';
import { STAR_SIGNATURE_BY_POI, normalizeStarSignatureState } from '../data/starSignatures.js';
import { CREDIT_CHIP_KIND } from '../data/killRewards.js';
import { THE_FACE, faceApproachSolution, normalizeTheFaceState } from '../data/theFace.js';
import {
  THE_DEVELOPER,
  normalizeTheDeveloperState,
  theDeveloperShouldExist,
} from '../data/theDeveloper.js';
import { isUnsellableCargo } from './cargo.js';
import {
  COMET_ICE,
  cometLocalPosition,
  cometPassAt,
  createCometIceState,
  normalizeCometIceState,
} from '../data/miningDepth.js';
import { makeEnemySpawnSpec } from './combat.js';
import { planZoneSpawns, zoneAt, zoneThreat } from '../data/sectorZones.js'; // named-zone purposeful spawning (WORLD_OVERHAUL_2_1)
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../data/sectorActivityPockets.js';
import { applyFrameOrigin, deriveFrameOrigin } from '../core/coordinates.js';
import { hazardCenterAt } from '../core/hazardMotion.js';
import {
  CORRIDOR_SECTOR_IDS,
  HELIOS_STARTER_PROTECTION_RADIUS_WU,
  RESIDENCY_MATERIALIZED_CAP,
  RESIDENCY_TIER,
  corridorPlayableBounds,
  isCorridorSector,
  planMaterializedResidents,
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
  sectorMembershipAtGlobal,
} from '../data/sectorCoordinates.js';
import {
  RECORD_KIND,
  applyRecordVitals,
  bindEntityToRecord,
  captureEntityRecord,
  createEmptyRecordsBag,
  deserializeRecordsBag,
  ensureWorldRecords,
  entityHasDurableMarkers,
  entityIsDurableCandidate,
  findLiveEntityForRecord,
  markRecordDestroyed,
  missionIdentityOf,
  recordShouldRematerialize,
  recordsForSector,
  serializeRecordsBag,
  spawnSpecFromRecord,
  stableRecordId,
  upsertRecord,
} from '../world/worldRecords.js';
import {
  consumeEmbodimentPayload,
  createEmptyEmbodimentCache,
  embodimentRecordIntents,
  normalizeEmbodimentCache,
  recordFromEmbodimentIntent,
  serializeEmbodimentCache,
} from '../world/embodimentRecipes.js';

export const LOCAL_WAYPOINT_QUEUE_LIMIT = 8;

function applySameSectorPlayerRelocation(state, entryPoint) {
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos || !entryPoint) return false;
  const x = Number(entryPoint.x);
  const z = Number(entryPoint.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  player.pos.x = x;
  player.pos.z = z;
  player.pos.y = 0;
  if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
  else player.prevPos = { x, y: 0, z };
  if (!player.vel) player.vel = { x: 0, y: 0, z: 0 };
  player.vel.x = 0;
  player.vel.y = 0;
  player.vel.z = 0;
  player.angVel = 0;
  const heading = Number.isFinite(entryPoint.heading) ? entryPoint.heading : (Number(player.rot) || 0);
  player.rot = heading;
  player.prevRot = heading;
  player.flags = player.flags || {};
  player.flags.noInterp = true;
  return true;
}

// ---- global tuning constants (design 05 "GLOBAL TUNING CONSTANTS" + "Formulas") -------------
const DEFAULT_WORLD_RADIUS = 4000;
const BASE_FUEL = 4;            // fuel units per lightyear
const BASE_INTERDICT = 0.35;
const GATE_CHARGE = 3.0;        // s align time for a gate jump
const GATE_COOLDOWN = 0;
const DRIVE_COOLDOWN = 6.0;     // s
const JUMPING_DURATION = 1.2;   // s tunnel/blackout
const UNFILED_JUMP_ORIGIN = 'sector_ashfall_reach';
const UNFILED_JUMP_RETURN = 'sector_helios_prime';
const SCAN_RANGE = 400;         // wu POI auto-detect radius
const SECTOR_SCAN_TIME = 2.0;   // s to complete a sector scan
const FUEL_REFUND_FRAC = 0.5;   // refunded on aborted charge

// Jump-drive tiers (design 05). Resolved from the equipped module; defaults to T1.
const DRIVE_TIERS = {
  jump_t1: { baseCharge: 8.0, tierFuelMult: 1.0,  driveStealth: 0.0,  hotJump: false },
  jump_t2: { baseCharge: 5.5, tierFuelMult: 0.85, driveStealth: 0.15, hotJump: false },
  jump_t3: { baseCharge: 3.5, tierFuelMult: 0.70, driveStealth: 0.35, hotJump: true  },
};
const DEFAULT_DRIVE = DRIVE_TIERS.jump_t1;

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));
const STATION_SECTOR_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_SECTOR_ID.set(station.id, sector.id);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function driveCooldownMultiplier(player) {
  const mods = player && player.efficiencyMods;
  const multiplier = mods && mods.jumpCooldownMult;
  return Number.isFinite(multiplier) && multiplier > 0 && multiplier <= 1 ? multiplier : 1;
}

// Per-sector enemy archetype pools (real ids from src/data/enemies.js), picked by lawfulness/tier.
const LAWFUL_ENEMIES = ['patrol_lawman'];
const PIRATE_ENEMIES = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
const FRONTIER_ENEMIES = ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'];
const STARTER_SAFE_RADIUS = HELIOS_STARTER_PROTECTION_RADIUS_WU;
const STATION_SAFE_RADIUS = 1100;
const GATE_SAFE_RADIUS = 900;
const AMBIENT_SPAWN_ATTEMPTS = 24;
const DIRECT_HOSTILE_SPAWN_ATTEMPTS = 36;
const HUNTER_SPAWN_MIN_RADIUS = 1900;
const HUNTER_SPAWN_MAX_RADIUS = 2700;
const AMBUSH_SPAWN_MIN_RADIUS = 1500;
const AMBUSH_SPAWN_MAX_RADIUS = 2300;
const ZONE_HOSTILE_PLAYER_CLEARANCE = 1200; // zone-anchored hostiles never spawn this close to the player
const AMBIENT_HEADROOM = 8; // REVAMP 2.1 — max live-ship slots ambient may reserve; the rest (MAX-8) stays for encounters
const CRITICAL_SPAWN_RETRY_TICKS = 15;
const PALETTE_CLASS_BY_REF = new Map(Object.entries(SECTOR_PALETTE_CLASSES).map(([key, value]) => [value, key]));
const DRESSING_RADIUS = Object.freeze({
  place_lane_beacon: 18,
  place_nav_buoy: 12,
  place_mining_drone: 8,
  place_station_billboard: 28,
  place_conveyor_barge: 48,
  place_dead_hulk: 42,
  place_debris_chunk: 26,
  place_ceres_bait_wreck: 48,
  place_ceres_grave_shard: 28,
  place_asteroid_seamed: 18,
  place_asteroid_rock_a: 15,
  place_asteroid_rock_b: 18,
  place_asteroid_rock_c: 10,
  place_asteroid_graffiti: 16,
});
function authoredGeologyPlaceForField(fieldDef) {
  if (!fieldDef) return null;
  const asteroidDef = AST_BY_ID.get(fieldDef.type);
  return asteroidDef && asteroidDef.authoredPlaceId || null;
}

const CERES_ACTIVITY_OBJECT_SLOTS = new Map(CERES_ACTIVITY_POCKETS.flatMap((pocket) => (
  pocket.objectSlots.map((slot) => [slot.id, Object.freeze({ pocket, slot })])
)));
const CERES_ACTIVITY_COLLISION_ANCHORS = new Map(CERES_ACTIVITY_POCKETS.flatMap((pocket) => (
  pocket.collisionAnchorSlots.map((slot) => [
    `${slot.sourceFieldId}:${slot.sourceIndex}`,
    Object.freeze({ pocket, slot }),
  ])
)));

// How each activity slot that claims the belt-dressing drone prop presents itself. A slot absent from
// this table keeps the ordinary ambient prospecting drone.
const CERES_ACTIVITY_DRONE_SLOT_PRESENTATION = Object.freeze({
  ceres_refinery_disabled_hull: Object.freeze({
    placeId: 'place_dead_hulk', name: 'Disabled Refinery Client',
  }),
  ceres_ambush_bait_wreck: Object.freeze({
    placeId: 'place_ceres_bait_wreck', name: 'Throughline Bait Wreck',
  }),
  ceres_cathedral_grave_shard: Object.freeze({
    placeId: 'place_ceres_grave_shard', name: 'Cathedral Grave Shard',
  }),
});

function ceresActivityObjectBinding(id, toGlobal) {
  const binding = CERES_ACTIVITY_OBJECT_SLOTS.get(id);
  if (!binding) throw new Error(`Missing Ceres activity object slot: ${id}`);
  return {
    id: binding.slot.id,
    pos: toGlobal({
      x: binding.pocket.activityAnchor.localPos.x + binding.slot.offset.x,
      z: binding.pocket.activityAnchor.localPos.z + binding.slot.offset.z,
    }),
  };
}

function ceresActivityCollisionAnchorBinding(fieldId, sourceIndex, toGlobal) {
  const binding = CERES_ACTIVITY_COLLISION_ANCHORS.get(`${fieldId}:${sourceIndex}`);
  if (!binding) return null;
  return {
    id: binding.slot.id,
    pos: toGlobal({
      x: binding.pocket.activityAnchor.localPos.x + binding.slot.offset.x,
      z: binding.pocket.activityAnchor.localPos.z + binding.slot.offset.z,
    }),
  };
}

export const world = {
  name: 'world',
  // records/embodiment serializers already return owned trees; the remaining live overlays are
  // copied below so saveSystem does not duplicate the full world payload during autosave capture.
  saveSnapshotOwned: true,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;

    const state = this.state;
    const bus = this.bus;

    // Load a mutable copy of the static graph into world.sectors (owner field stays mutable).
    if (!state.world.sectors || Object.keys(state.world.sectors).length === 0) {
      state.world.sectors = {};
      for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
    }
    if (!state.world.discovery) state.world.discovery = {};
    if (Object.keys(state.world.discovery).length === 0) this._seedChartedDiscovery();
    if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
    if (!state.world.pendingSpawns || typeof state.world.pendingSpawns !== 'object') state.world.pendingSpawns = {};
    state.world.frontierRumors = normalizeFrontierRumorState(state.world.frontierRumors);
    state.world.vestaOreCache = normalizeVestaOreCacheState(state.world.vestaOreCache);
    state.world.pallasHiddenCache = normalizePallasHiddenCacheState(state.world.pallasHiddenCache);
    // Plan 30 secrets. Each is a durable record with its own fail-closed normalization; none of
    // them is keyed into `saveVersion`, so an untouched profile carries empty rows and the 47-A
    // golden never sees a schema move.
    state.world.unregisteredCaches = normalizeUnregisteredCachesState(state.world.unregisteredCaches);
    state.world.starSignatures = normalizeStarSignatureState(state.world.starSignatures);
    state.world.theFace = normalizeTheFaceState(state.world.theFace);
    state.world.theDeveloper = normalizeTheDeveloperState(
      state.world.theDeveloper, state.meta && state.meta.seed,
    );
    const cometCycle = cometPassAt(state.meta && state.meta.seed || 1, state.simTime).cycle;
    state.world.cometIce = normalizeCometIceState(state.world.cometIce, cometCycle);
    // M2-C2 durable world-entity records (global-space). Runtime residency bags stay separate.
    ensureWorldRecords(state.world);
    // M2-C2/C3 latest-epoch recipe cache. It is bounded data, not a live-entity authority.
    state.world.embodiment = normalizeEmbodimentCache(state.world.embodiment);

    // Runtime-only flags (not serialized).
    this._combatLock = false;     // last combat:lockChanged value
    this._scanT = 0;              // active sector-scan elapsed
    this._scanning = false;
    this._driveTierId = null;     // resolved from equipped jump-drive module (null → T1 default)
    this._sectorSeq = 0;          // legacy counter (kept for compat; residency epoch owns content RNG)
    this._nextCriticalSpawnTick = 0;
    this._vestaDecisionSignature = null;
    this._vestaDecisionNeedsRebind = false;
    this._pallasDecisionSignature = null;
    this._pallasDecisionNeedsRebind = false;
    this._pendingDropCacheStash = null;
    this._cometIceEntityId = null;
    this._cometIcePassId = null;
    this._hazardSet = new Set();      // hazard zone indices the player is currently inside
    this._hazardNextSet = new Set();  // scratch set reused while computing the next frame
    // Floating-origin scratch (allocation-free no-shift path).
    this._frameOriginScratch = { x: 0, z: 0 };
    // Ensure coordinate membrane defaults exist even if state was hand-built.
    if (!state.world.coordinateSchema) state.world.coordinateSchema = 'global_v1';
    if (!state.world.frameOrigin || typeof state.world.frameOrigin !== 'object') {
      state.world.frameOrigin = { x: 0, z: 0 };
    }
    if (!Number.isSafeInteger(state.world.frameOriginSeq) || state.world.frameOriginSeq < 0) {
      state.world.frameOriginSeq = 0;
    }
    this._ensureResidencyState();

    // --- event wiring (§4.4) ---
    bus.on('world:requestJump', (p) => this._onRequestJump(p || {}));
    bus.on('world:requestUnfiledJump', () => this._onRequestUnfiledJump());
    bus.on('world:confirmUnfiledJump', () => this._confirmUnfiledJump());
    bus.on('world:abortJumpCharge', (p) => this._abortCharge((p && p.reason) || 'requested'));
    bus.on('world:requestRoute', (p) => this._onRequestRoute(p || {}));
    bus.on('world:requestSectorScan', () => this._beginScan());
    bus.on('ui:setCourse', (p) => this._onSetCourse(p || {}));
    bus.on('nav:autopilotStopped', (p) => this._onAutopilotStopped(p || {}));
    bus.on('combat:lockChanged', (p) => this._onLockChanged(p || {}));
    bus.on('module:equipped', () => this._resolveShipModules());
    bus.on('module:unequipped', () => this._resolveShipModules());
    bus.on('ship:statsChanged', () => this._resolveShipModules());
    bus.on('field:depletedChanged', (p) => this._onFieldDepleted(p || {}));
    bus.on('asteroid:destroyed', (p) => this._onCometIceDestroyed(p || {}));
    bus.on('anomaly:triangulated', (p) => this._onAnomalyTriangulated(p || {}));
    bus.on('signal:investigated', (p) => this._onSignalInvestigated(p || {}));
    bus.on('signal:investigated', (p) => this._onTheDeveloperScanned(p || {}));
    bus.on('entity:killed', (p) => this._onTheDeveloperKilled(p || {}));
    bus.on('secret:listeningPostDecodeRequested', (p) => this._onListeningPostDecodeRequested(p || {}));
    bus.on('orrinWitness:ensureEvidence', (p) => this._ensureOrrinWitnessEvidence(p || {}));
    bus.on('vestaOreCache:choose', (p) => this._onVestaOreCacheChoice(p || {}));
    bus.on('pallasHiddenCache:choose', (p) => this._onPallasHiddenCacheChoice(p || {}));
    bus.on('pickup:collected', (p) => this._onVestaOreCachePickupCollected(p || {}));
    bus.on('pickup:collected', (p) => this._onPallasHiddenCachePickupCollected(p || {}));
    bus.on('pickup:collected', (p) => this._onDeadGatePickupCollected(p || {}));
    bus.on('cargo:jettisoned', (p) => this._onSmugglingDropCacheJettisoned(p || {}));
    bus.on('cargo:podRecovered', (p) => this._onSmugglingDropCacheRecovered(p || {}));
    bus.on('save:restoring', () => {
      this._vestaDecisionSignature = null;
      this._pallasDecisionSignature = null;
    });
    bus.on('save:loaded', () => {
      if (this._vestaDecisionNeedsRebind) this._vestaDecisionSignature = null;
      this._vestaDecisionNeedsRebind = false;
      if (this._pallasDecisionNeedsRebind) this._pallasDecisionSignature = null;
      this._pallasDecisionNeedsRebind = false;
      this._spawnVestaOreCachePickup(this.state.world.currentSectorId);
      this._presentVestaOreCacheDecision('save-loaded');
      this._spawnPallasHiddenCachePickup(this.state.world.currentSectorId);
      this._presentPallasHiddenCacheDecision('save-loaded');
      this._spawnDeadGateRewards(this.state.world.currentSectorId);
      this._spawnSmugglingDropCaches(this.state.world.currentSectorId);
    });
    bus.on('dock:docked', (p) => this._presentPallasHiddenCacheDecision('dock:docked', p && p.stationId));
    bus.on('dock:undocked', () => { this._pallasDecisionSignature = null; });
    bus.on('landmark:artifactRecovered', (p) => this._onLandmarkArtifactRecovered(p || {}));
    bus.on('spawn:request', (p) => this._onSpawnRequest(p || {}));
    bus.on('ui:purchaseSurveyData', (p) => this._onPurchaseSurveyData(p || {}));
    bus.on('ui:purchaseFrontierRumor', (p) => this._onPurchaseFrontierRumor(p || {}));
    bus.on('claim:sensorPostRumor', (p) => this._onSensorPostRumor(p || {}));
    bus.on('poi:discovered', (p) => this._onFrontierRumorPoi(p || {}));
    bus.on('poi:identified', (p) => this._onFrontierRumorPoi(p || {}));
    bus.on('frontierRumor:planned', (p) => this._onFrontierRumorPlanned(p || {}));
    bus.on('encounter:telegraph', (p) => this._onFrontierRumorEncounter(p || {}));
    bus.on('mission:bountyTargetContacted', (p) => this._onBountyRumorContact(p || {}));
    // Mark the boss POI defeated when the dreadnought dies, so it does not respawn on sector
    // re-entry or save reload. (The entity carries data.isBoss + data.bossSectorId/bossPoiId.)
    bus.on('entity:killed', (p) => {
      this._onBossKilled(p || {});
      this._onDurableEntityKilled(p || {});
    });
    bus.on('boss:resolved', (p) => this._onBossResolved(p || {}));
    bus.on('sectorsim:embodiment', (p) => this._onSectorEmbodiment(p || {}));
  },

  /** Cache sectorSim recipes only. Live entities remain forbidden on this event boundary. */
  _onSectorEmbodiment(payload) {
    const worldState = this.state && this.state.world;
    if (!worldState) return 0;
    const current = normalizeEmbodimentCache(worldState.embodiment);
    const result = consumeEmbodimentPayload(current, payload);
    worldState.embodiment = result.cache;
    return result.accepted;
  },

  /**
   * Preserve destroyed outcomes on durable records so rematerialize never re-rolls kills.
   * Kill may happen while FULL (before demote ever wrote the bag) — derive/stamp identity
   * and upsert a snapshot first so markRecordDestroyed cannot no-op on a missing byId entry.
   * Traffic/mission targets stamped only with markers (missionTag/trafficRole) get an id here.
   */
  _onDurableEntityKilled(p) {
    if (!p || p.id == null) return;
    const e = this.state.entities.get(p.id);
    if (!e) return;
    const d = e.data || (e.data = {});
    // Boss path already recorded outcome:defeated — do not clobber with destroyed.
    if (d.isBoss) return;
    const state = this.state;
    // Derive durable identity even when bag empty and no prior demote stamp.
    if (!d.worldRecordId) {
      if (!entityHasDurableMarkers(e, state.playerId)) return;
      const sectorId = e.homeSectorId || d.homeSectorId || d.sectorId || state.world.currentSectorId;
      if (!sectorId) return;
      if (!e.homeSectorId && !d.homeSectorId) {
        e.homeSectorId = sectorId;
        d.homeSectorId = sectorId;
      }
      if (d.sectorId == null) d.sectorId = sectorId;
      const kind = d.trafficRole || d.convoyId || d.itinerary
        ? RECORD_KIND.CONVOY
        : (missionIdentityOf(d) || d.missionPinned || (e.flags && e.flags.missionPinned)
          ? RECORD_KIND.MISSION_TARGET
          : RECORD_KIND.NPC);
      const keyHint = missionIdentityOf(d)
        || d.trafficRole
        || d.lootTableId
        || d.enemyTypeId
        || d.defId
        || e.type
        || 'killed';
      this._assignDurableRecordId(e, sectorId, kind, `kill:${keyHint}`, state.world.sectorContents && state.world.sectorContents[sectorId]);
    }
    if (!d.worldRecordId) return;
    const bag = ensureWorldRecords(state.world);
    if (!bag.byId[d.worldRecordId]) {
      // Entity may already be alive=false; capture still needs a durable stub.
      const sectorId = e.homeSectorId || d.homeSectorId || d.sectorId || state.world.currentSectorId;
      const snap = captureEntityRecord(
        Object.assign({}, e, { alive: true, data: d, homeSectorId: sectorId }),
        {
          sectorId,
          seed: (state.meta && state.meta.seed) || 1,
          tick: state.tick | 0,
          recordId: d.worldRecordId,
          identityKey: d.identityKey,
          durableReason: 'kill',
        },
      );
      if (snap) {
        snap.alive = false;
        snap.outcome = 'destroyed';
        upsertRecord(bag, snap);
      }
    }
    this.markWorldRecordDestroyed(d.worldRecordId, {
      outcome: 'destroyed',
      pos: e.pos ? { x: e.pos.x, z: e.pos.z } : undefined,
    });
  },

  _onBossKilled(p) {
    if (!p || p.id == null) return;
    return this._settleBossOutcome({ ...p, entityId: p.id }, 'destroyed');
  },

  _onBossResolved(p) {
    if (!p || p.entityId == null) return;
    return this._settleBossOutcome(p, p.outcome || 'defeated');
  },

  _settleBossOutcome(p, outcome) {
    const e = this.state.entities.get(p.entityId);
    const d = e && e.data;
    if (!d || !d.isBoss) return;
    const sectorId = d.bossSectorId || this.state.world.currentSectorId;
    const poiId = d.bossPoiId;
    if (!sectorId || !poiId) return;
    const disc = this._discoveryFor(sectorId);
    if (!disc.pois) disc.pois = {};
    const rec = disc.pois[poiId] || (disc.pois[poiId] = { discovered: true, identified: true });
    const sector = this.state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    const poi = sector && (sector.pois || []).find((row) => row && row.id === poiId);
    const newlyDefeated = rec.defeated !== true;
    rec.bossDefeated = true;
    rec.discovered = true;
    rec.identified = true;
    rec.defeated = true;
    rec.resolutionOutcome = String(outcome || 'defeated');
    rec.type = poi && poi.type || rec.type || 'anomaly';
    rec.name = poi && poi.name || rec.name || poiId;
    if (newlyDefeated) {
      rec.defeatedAt = Math.max(0, Number(this.state.simTime) || 0);
    }
    // Durable outcome: boss identity stays defeated across demote/promote/Continue.
    if (d.worldRecordId) {
      this.markWorldRecordDestroyed(d.worldRecordId, {
        outcome: 'defeated',
        pos: e.pos ? { x: e.pos.x, z: e.pos.z } : undefined,
      });
    }
    // Clear the live boss handle so the active sector knows it's gone.
    if (this.state.world.activeSector && this.state.world.activeSector.boss) {
      delete this.state.world.activeSector.boss;
    }
    if (newlyDefeated) {
      for (const change of this._applyBossHazardAftermath(sector, poiId)) {
        this.bus.emit('hazard:changed', {
          sectorId,
          poiId,
          reason: 'boss_defeated',
          ...change,
        });
      }
      this.bus.emit('discovery:plateUnlocked', { sectorId, poiId, type: rec.type });
      const outcomeNews = outcome === 'boarded'
        ? 'ASHFALL RELAY: boarders breached the silent Iron Maw. Salvagers are racing for the vault coordinates released from its arena signal.'
        : (outcome === 'towed'
          ? 'ASHFALL RELAY: the disabled Iron Maw is moving under tow. Salvagers are racing for the vault coordinates released from its arena signal.'
          : null);
      if (outcomeNews || (poi && poi.defeatNews && typeof poi.defeatNews.text === 'string')) {
        this.bus.emit('news:publish', {
          id: `boss-defeated:${sectorId}:${poiId}`,
          text: outcomeNews || poi.defeatNews.text,
          kind: poi && poi.defeatNews && poi.defeatNews.kind || 'combat-aftermath',
          sectorId,
          poiId,
          source: 'boss-defeated',
        });
      }
      for (const unlock of (sector && sector.pois || [])) {
        if (!unlock || unlock.unlockAfterBossId !== poiId) continue;
        const unlockRec = disc.pois[unlock.id]
          || (disc.pois[unlock.id] = { discovered: false, identified: false });
        if (unlockRec.discovered) continue;
        unlockRec.discovered = true;
        unlockRec.revealedByBossDefeat = true;
        unlockRec.revealedAt = rec.defeatedAt;
        unlockRec.type = unlock.type || unlockRec.type || null;
        unlockRec.name = unlock.name || unlockRec.name || unlock.id;

        const active = this.state.world.activeSector;
        if (active && active.id === sectorId) {
          const activePoi = (active.pois || []).find((row) => row && row.poiId === unlock.id);
          if (activePoi) {
            activePoi.hidden = false;
            const entity = this.state.entities.get(activePoi.id);
            if (entity && entity.data) entity.data.hidden = false;
          }
        }
        this.bus.emit('poi:discovered', {
          sectorId,
          poiId: unlock.id,
          type: unlockRec.type,
          sourcePoiId: poiId,
          reason: 'boss_defeated',
        });
        this.bus.emit('toast', {
          text: `${unlockRec.name} coordinates recovered`,
          kind: 'success',
          ttl: 5,
        });
      }
    }
    this.bus.emit('boss:defeated', {
      sectorId,
      poiId,
      killerId: p.killerId || null,
      outcome: rec.resolutionOutcome,
    });
  },

  // =========================================================================================
  // enterSector — load / switch membership (boot, gate/drive jump, or continuous)
  // =========================================================================================
  /**
   * Materialize the target sector (+ corridor prefetch), update residency tiers, optionally
   * place the player at an entry point (boot / intentional jump only), emit sector:enter.
   * Free-flight continuous transitions use { continuous:true, noTeleport:true } and never
   * place the player or global-wipe entities.
   * @param {string} sectorId
   * @param {{fromJump?:boolean, via?:string, fromSectorId?:string, continuous?:boolean, noTeleport?:boolean, placePlayer?:boolean, restoreDurableRecords?:boolean}} [opts]
   */
  enterSector(sectorId, opts = {}) {
    const state = this.state;
    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    if (!sector) { console.warn('[world] enterSector: unknown sector', sectorId); return null; }

    this._ensureResidencyState();
    const fromSectorId = opts.fromSectorId != null ? opts.fromSectorId : (state.world.currentSectorId || null);
    const continuous = !!opts.continuous;
    const noTeleport = continuous || !!opts.noTeleport;
    // Place on boot and intentional jumps only — never on free-flight membership.
    const placePlayer = !noTeleport && opts.placePlayer !== false;

    const prevSectorId = state.world.currentSectorId || null;
    if (prevSectorId && prevSectorId !== sectorId) {
      this.bus.emit('sector:exit', { sectorId: prevSectorId, continuous, noTeleport });
    }

    // Discovery overlay bookkeeping (§3.8) — entering reveals the sector + one hop.
    // Free-flight membership jitter must not inflate visitedCount.
    const disc = this._discoveryFor(sectorId);
    const firstVisit = !disc.discovered;
    disc.discovered = true;
    if (!continuous) disc.visitedCount = (disc.visitedCount || 0) + 1;

    // Corridor-global outer fence (not a per-sector disk trap). Non-corridor intentional
    // enters still get a sector-local soft fence so legacy far systems stay bounded.
    this._applyPlayableBounds(sectorId);

    // Entry point for jump/boot placement (galactic-global). Continuous path leaves pose alone.
    // Computed before residency so placePlayer/gate tight-cap neighbor ranking uses the
    // destination entry pose — not the pre-teleport player position.
    const rec = state.world.residentSectors && state.world.residentSectors[sectorId];
    const epoch = rec && Number.isFinite(rec.epoch) ? rec.epoch : 0;
    const entryRng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, epoch, 'entry'));
    const entryPoint = this._entryPointFor(sector, fromSectorId, entryRng);
    state.world.entryPoint = entryPoint;

    // Membership + residency plan (materialize FULL current + REDUCED neighbors, evict over cap).
    const reason = continuous
      ? 'free_flight'
      : (opts.fromJump ? (opts.via || 'jump') : 'enter');
    // placePlayer: rank from destination entry. Free-flight / noTeleport: rank from live player pose.
    const focusGlobal = placePlayer
      ? { x: entryPoint.x, z: entryPoint.z }
      : (this._playerGlobalPos() || sectorGlobalOrigin(sectorId));
    this._applyResidencyPlan(sectorId, {
      reason,
      noTeleport,
      focusGlobal,
      restoreDurableRecords: opts.restoreDurableRecords === true,
    });

    const active = state.world.sectorContents[sectorId]
      || (state.world.sectorContents[sectorId] = this._emptySectorBag());
    state.world.activeSector = active;
    state.world.currentSectorId = sectorId;
    this._spawnVestaOreCachePickup(sectorId);
    this._presentVestaOreCacheDecision('sector-enter');
    this._spawnPallasHiddenCachePickup(sectorId);
    this._presentPallasHiddenCacheDecision('sector-enter');
    this._spawnDeadGateRewards(sectorId);
    this._spawnTheDeveloper(sectorId);
    this._spawnSmugglingDropCaches(sectorId);
    if (!this._hazardSet) this._hazardSet = new Set();
    if (!this._hazardNextSet) this._hazardNextSet = new Set();
    this._hazardSet.clear();
    this._hazardNextSet.clear();

    if (placePlayer) this._placePlayer(entryPoint);
    this._resolveShipModules();
    this._flushPendingSpawns(sectorId, sector);

    if (firstVisit) {
      this.bus.emit('sector:discovered', { sectorId });
      this.bus.emit('toast', { text: `New sector discovered: ${sector.name}`, kind: 'info', ttl: 4 });
    }
    // Reveal direct neighbors on the map ("see one hop ahead") without marking them visited.
    for (const nb of (sector.neighbors || [])) this._discoveryFor(nb);

    this.bus.emit('world:membership', {
      sectorId,
      previousSectorId: prevSectorId,
      reason,
      tick: state.tick | 0,
      noTeleport,
    });
    this.bus.emit('sector:enter', { sectorId, sector, entryPoint, firstVisit, continuous, noTeleport });
    return active;
  },

  // --- residency foundation (M2a) -----------------------------------------------------------
  _ensureResidencyState() {
    const state = this.state;
    if (!state.world.residentSectors || typeof state.world.residentSectors !== 'object') {
      state.world.residentSectors = {};
    }
    if (!state.world.sectorContents || typeof state.world.sectorContents !== 'object') {
      state.world.sectorContents = {};
    }
    if (!state.world.activeSector || typeof state.world.activeSector !== 'object') {
      state.world.activeSector = this._emptySectorBag();
    }
    ensureWorldRecords(state.world);
  },

  _emptySectorBag() {
    return { stations: [], fields: [], hazards: [], pois: [], gates: [], enemies: [], dressing: [] };
  },

  _playerGlobalPos() {
    const player = this.state.entities.get(this.state.playerId);
    if (!player || !player.pos) return null;
    return player.pos;
  },

  _neighborLookup(sectorId) {
    const s = this.state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    return s ? (s.neighbors || []) : [];
  },

  _applyPlayableBounds(membershipSectorId) {
    const state = this.state;
    if (isCorridorSector(membershipSectorId) || CORRIDOR_SECTOR_IDS.some((id) => {
      const t = state.world.residentSectors && state.world.residentSectors[id];
      return t && t.tier && t.tier !== RESIDENCY_TIER.RECORD_ONLY;
    })) {
      const b = corridorPlayableBounds(SECTORS, DEFAULT_WORLD_RADIUS);
      state.bounds = {
        radius: b.radius,
        hardRadius: b.hardRadius,
        center: { x: b.center.x, z: b.center.z },
      };
      return;
    }
    // Non-corridor intentional enter: keep a sector-centered soft fence (legacy far systems).
    const sector = state.world.sectors[membershipSectorId] || SECTOR_BY_ID.get(membershipSectorId);
    const worldRadius = (sector && sector.worldRadius) || DEFAULT_WORLD_RADIUS;
    const sectorOrigin = sectorGlobalOrigin(membershipSectorId);
    state.bounds = {
      radius: worldRadius,
      hardRadius: worldRadius + 500,
      center: { x: sectorOrigin.x, z: sectorOrigin.z },
    };
  },

  /**
   * Apply FULL/REDUCED/RECORD_ONLY plan for membership. Materializes missing residents,
   * demotes extras, never global-wipes, never touches the player.
   */
  _applyResidencyPlan(membershipSectorId, opts = {}) {
    const state = this.state;
    this._ensureResidencyState();
    const focus = opts.focusGlobal
      || this._playerGlobalPos()
      || sectorGlobalOrigin(membershipSectorId);
    const previousTiers = new Map();
    for (const id of Object.keys(state.world.residentSectors)) {
      previousTiers.set(id, state.world.residentSectors[id].tier);
    }
    const plan = planMaterializedResidents(
      membershipSectorId,
      focus,
      previousTiers,
      RESIDENCY_MATERIALIZED_CAP,
      (id) => this._neighborLookup(id),
    );

    // Retire only FULL combat/dressing from sectors that are losing FULL before the new FULL bag
    // requests capacity. Structural residents stay materialized, so there is no empty-world frame,
    // while the shared ship cap remains true even inside this synchronous handoff.
    for (const [id, previousTier] of previousTiers) {
      const nextTier = plan.tiers.get(id) || RESIDENCY_TIER.RECORD_ONLY;
      if (previousTier === RESIDENCY_TIER.FULL && nextTier !== RESIDENCY_TIER.FULL) {
        this._stripSectorFullExtras(id);
      }
    }

    // Materialize / promote first so demotion never leaves the player with zero content mid-plan.
    for (const id of plan.materialize) {
      const tier = plan.tiers.get(id);
      const restoreDurableRecords = opts.restoreDurableRecords === true
        && id === membershipSectorId
        && tier === RESIDENCY_TIER.FULL;
      this._ensureSectorMaterialized(id, tier, { restoreDurableRecords });
      this._setResidentMeta(id, tier, opts.reason || 'residency');
    }
    // Demote everyone marked RECORD_ONLY (scoped despawn only).
    for (const id of plan.demote) {
      const prev = state.world.residentSectors[id];
      if (prev && prev.tier !== RESIDENCY_TIER.RECORD_ONLY) {
        this._demoteSectorToRecordOnly(id);
      } else {
        this._setResidentMeta(id, RESIDENCY_TIER.RECORD_ONLY, opts.reason || 'residency');
      }
    }
    // Sync FULL/REDUCED transitions for already-materialized bags (enemies/dressing LOD).
    for (const id of plan.materialize) {
      const tier = plan.tiers.get(id);
      const restoreDurableRecords = opts.restoreDurableRecords === true
        && id === membershipSectorId
        && tier === RESIDENCY_TIER.FULL;
      this._syncSectorTierContent(id, tier, { restoreDurableRecords });
    }

    this.bus.emit('world:residency', {
      sectors: Object.keys(state.world.residentSectors).sort().map((sectorId) => ({
        sectorId,
        tier: state.world.residentSectors[sectorId].tier,
        epoch: state.world.residentSectors[sectorId].epoch,
      })),
      membershipSectorId,
      reason: opts.reason || 'residency',
      tick: state.tick | 0,
      noTeleport: !!opts.noTeleport,
    });
  },

  _setResidentMeta(sectorId, tier, reason) {
    const state = this.state;
    const prev = state.world.residentSectors[sectorId];
    const epoch = prev && Number.isFinite(prev.epoch) ? prev.epoch : 0;
    state.world.residentSectors[sectorId] = {
      tier,
      epoch,
      reason: reason || (prev && prev.reason) || 'residency',
      lastTouchTick: state.tick | 0,
    };
  },

  /**
   * First materialization creates the sector bag with epoch-stable RNG.
   * FULL includes combat/dressing; REDUCED is structural only.
   */
  _ensureSectorMaterialized(sectorId, tier, opts = {}) {
    const state = this.state;
    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    if (!sector) return;
    let rec = state.world.residentSectors[sectorId];
    if (!rec) {
      rec = { tier: RESIDENCY_TIER.RECORD_ONLY, epoch: 0, reason: 'init', lastTouchTick: state.tick | 0 };
      state.world.residentSectors[sectorId] = rec;
    }
    const existing = state.world.sectorContents[sectorId];
    if (existing && (rec.tier === RESIDENCY_TIER.FULL || rec.tier === RESIDENCY_TIER.REDUCED)
        && (existing.stations.length || existing.gates.length || existing.fields.length)) {
      return; // already live — do not re-roll content on membership jitter
    }

    const epoch = Number.isFinite(rec.epoch) ? rec.epoch : 0;
    // Epoch-stable content stream: (meta.seed, sectorId, epoch). Does not use state.rng.
    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, epoch));
    const rng = state.world.rng;
    const disc = this._discoveryFor(sectorId);
    const active = this._emptySectorBag();

    this._spawnStations(sector, active, rng);
    this._spawnFields(sector, active, disc, rng);
    this._spawnCometIce(sector, active);
    this._spawnGates(sector, active, rng);
    this._spawnPOIs(sector, active, disc, rng);
    this._spawnHazards(sector, active);
    // Durable records rematerialize before ambient re-roll so identity/outcomes never reroll.
    const rematerialized = this._rematerializeSectorRecords(sectorId, active, tier, opts);
    if (tier === RESIDENCY_TIER.FULL) {
      this._spawnDressing(sector, active, rng);
      // Only re-roll ambient combatants when this sector has no prior durable NPC/convoy history.
      if (!rematerialized.hadCombatHistory) {
        this._spawnEnemies(sector, active, rng);
        this._spawnBossIfDue(sector, active, rng);
      } else {
        // Boss still respects discovery.bossDefeated when no boss record was rematerialized.
        if (!rematerialized.spawnedBoss) this._spawnBossIfDue(sector, active, rng);
      }
    }

    state.world.sectorContents[sectorId] = active;
    rec.tier = tier;
    rec.epoch = epoch;
    rec.materializedAtTick = state.tick | 0;
  },

  /** Promote/demote live content between FULL and REDUCED without rematerializing anchors. */
  _syncSectorTierContent(sectorId, tier, opts = {}) {
    const state = this.state;
    const rec = state.world.residentSectors[sectorId];
    if (!rec || rec.tier === tier) {
      // Still may need FULL extras if bag was created as REDUCED.
      if (tier === RESIDENCY_TIER.FULL) this._promoteSectorToFull(sectorId, opts);
      if (tier === RESIDENCY_TIER.REDUCED) this._stripSectorFullExtras(sectorId);
      this._setResidentMeta(sectorId, tier, rec && rec.reason);
      return;
    }
    if (tier === RESIDENCY_TIER.FULL) this._promoteSectorToFull(sectorId, opts);
    if (tier === RESIDENCY_TIER.REDUCED) this._stripSectorFullExtras(sectorId);
    this._setResidentMeta(sectorId, tier, rec.reason);
  },

  _promoteSectorToFull(sectorId, opts = {}) {
    const state = this.state;
    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    const active = state.world.sectorContents[sectorId];
    if (!sector || !active) return;
    // Rematerialize durable combat/convoy/mission records first (idempotent).
    const rematerialized = this._rematerializeSectorRecords(
      sectorId,
      active,
      RESIDENCY_TIER.FULL,
      opts,
    );
    // Already has combat presence → keep anchors; still may need dressing.
    if ((active.enemies && active.enemies.length) || (active.dressing && active.dressing.length)) {
      if (!(active.dressing && active.dressing.length)) {
        const rec = state.world.residentSectors[sectorId] || { epoch: 0 };
        const epoch = Number.isFinite(rec.epoch) ? rec.epoch : 0;
        state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, epoch, 'full_extra'));
        this._spawnDressing(sector, active, state.world.rng);
      }
      return;
    }
    const rec = state.world.residentSectors[sectorId] || { epoch: 0 };
    const epoch = Number.isFinite(rec.epoch) ? rec.epoch : 0;
    // Separate stream so structural epoch RNG is not re-consumed.
    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, epoch, 'full_extra'));
    const rng = state.world.rng;
    this._spawnDressing(sector, active, rng);
    if (!rematerialized.hadCombatHistory) {
      this._spawnEnemies(sector, active, rng);
      this._spawnBossIfDue(sector, active, rng);
    } else if (!rematerialized.spawnedBoss) {
      this._spawnBossIfDue(sector, active, rng);
    }
  },

  _stripSectorFullExtras(sectorId) {
    const state = this.state;
    const active = state.world.sectorContents[sectorId];
    if (!active) return;
    // Capture durable combat/convoy outcomes before stripping live extras.
    this._captureSectorDurableRecords(sectorId, { reason: 'strip_full' });
    // Remove enemies + dressing only; keep stations/gates/fields/pois/hazards.
    const kill = new Set();
    for (const id of (active.enemies || [])) kill.add(id);
    for (const d of (active.dressing || [])) if (d && d.id != null) kill.add(d.id);
    this._despawnEntityIds(kill, sectorId);
    active.enemies = [];
    active.dressing = [];
    if (active.boss) delete active.boss;
  },

  _demoteSectorToRecordOnly(sectorId) {
    // Write epoch-stable durable records before scoped despawn (identity must not reroll).
    this._captureSectorDurableRecords(sectorId, { reason: 'evict' });
    this._captureCometIce(sectorId);
    this._despawnEntitiesForSector(sectorId);
    if (this.state.world.sectorContents) {
      this.state.world.sectorContents[sectorId] = this._emptySectorBag();
    }
    this._setResidentMeta(sectorId, RESIDENCY_TIER.RECORD_ONLY, 'evict');
  },

  // =========================================================================================
  // M2-C2 durable records — capture on demote, rematerialize on promote (exactly once)
  // =========================================================================================

  /**
   * Snapshot durable ships/wrecks/mission targets for a sector into world.records.
   * Does not touch structural stations/gates/asteroids (authored rematerialize).
   */
  _captureSectorDurableRecords(sectorId, opts = {}) {
    const state = this.state;
    const bag = ensureWorldRecords(state.world);
    const recMeta = state.world.residentSectors && state.world.residentSectors[sectorId];
    const epoch = recMeta && Number.isFinite(recMeta.epoch) ? recMeta.epoch : 0;
    const tick = state.tick | 0;
    const seed = (state.meta && state.meta.seed) || 1;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      const home = e.homeSectorId || (e.data && e.data.homeSectorId);
      const dataSector = e.data && e.data.sectorId;
      // Require explicit sector ownership — never attach homeless traffic to the wrong bag.
      const ownedHere = home === sectorId || dataSector === sectorId;
      if (!ownedHere) continue;
      if (!entityIsDurableCandidate(e, state.playerId)) continue;
      // Protected mission-pinned still get a durable record for Continue rematerialize,
      // even though live despawn skips them.
      const captured = captureEntityRecord(e, {
        sectorId,
        seed,
        epoch,
        tick,
        createdTick: (e.data && e.data.recordCreatedTick) || tick,
        durableReason: opts.reason || 'evict',
      });
      if (!captured) continue;
      upsertRecord(bag, captured);
      if (e.data) e.data.worldRecordId = captured.recordId;
    }
  },

  /**
   * Rematerialize durable records into a live sector bag. Idempotent: skips when a live
   * entity already carries the record id. Does not advance state.rng.
   * @returns {{ spawned:number, hadCombatHistory:boolean, spawnedBoss:boolean }}
   */
  _rematerializeSectorRecords(sectorId, active, tier, opts = {}) {
    const state = this.state;
    const bag = ensureWorldRecords(state.world);
    // sectorSim remains recipe-only; world adopts current recipes only at FULL promotion.
    if (tier === RESIDENCY_TIER.FULL && opts.restoreDurableRecords !== true) {
      this._reconcileEmbodimentRecords(sectorId, bag);
    }
    const list = recordsForSector(bag, sectorId);
    let spawned = 0;
    let hadCombatHistory = false;
    let spawnedBoss = false;
    for (const rec of list) {
      if (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.CONVOY || rec.isBoss) {
        hadCombatHistory = true;
      }
      if (!recordShouldRematerialize(rec, tier)) continue;
      // Exactly-once: never double-spawn a live entity for the same record.
      const existing = findLiveEntityForRecord(state.entityList, rec.recordId);
      if (existing) {
        if (active && (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.CONVOY || rec.kind === RECORD_KIND.MISSION_TARGET)) {
          if (active.enemies && !active.enemies.includes(existing.id) && existing.type === 'ship') {
            active.enemies.push(existing.id);
          }
        }
        continue;
      }
      const ent = this._spawnFromDurableRecord(rec, sectorId);
      if (!ent) continue;
      spawned++;
      if (ent.data && ent.data.isBoss) {
        spawnedBoss = true;
        if (active) active.boss = { entityId: ent.id, poiId: ent.data.bossPoiId || rec.bossPoiId };
      }
      if (active && ent.type === 'ship') {
        if (!active.enemies) active.enemies = [];
        if (!active.enemies.includes(ent.id)) active.enemies.push(ent.id);
      }
    }
    return { spawned, hadCombatHistory, spawnedBoss };
  },

  /**
   * Reconcile the latest bounded sector recipe snapshot into durable records.
   * Existing records are never overwritten (preserves damage/destroyed outcomes). Stale active
   * generated recipes retire once their live body is gone; destroyed tombstones stay under the
   * existing MAX_RECORDS_PER_SECTOR bound so an old outcome cannot be re-rolled.
   */
  _reconcileEmbodimentRecords(sectorId, bag = ensureWorldRecords(this.state.world)) {
    const intents = embodimentRecordIntents(this.state.world.embodiment, sectorId);
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const sector = this.state.world.sectors && this.state.world.sectors[sectorId];
    const current = [];
    for (const intent of intents) {
      const rec = recordFromEmbodimentIntent(intent, {
        seed,
        tick: this.state.tick | 0,
        fallbackFactionId: (sector && (sector.owner || sector.factionId)) || 'faction_free',
      });
      if (rec) current.push(rec);
    }
    const currentIds = new Set(current.map((rec) => rec.recordId));

    // Delete only stale, still-active generated recipes with no live body. Player-authored
    // outcomes (destroyed/defeated) are history and remain as bounded tombstones.
    for (const rec of recordsForSector(bag, sectorId)) {
      if (rec.recordSource !== 'sector_embodiment' || currentIds.has(rec.recordId)) continue;
      if (rec.outcome === 'destroyed' || rec.outcome === 'defeated') continue;
      if (findLiveEntityForRecord(this.state.entityList, rec.recordId)) continue;
      delete bag.byId[rec.recordId];
    }

    let inserted = 0;
    for (const rec of current) {
      // Never overwrite an existing active/damaged/destroyed record for this identity.
      if (bag.byId[rec.recordId]) continue;
      if (upsertRecord(bag, rec)) inserted++;
    }
    return { inserted, retained: current.length - inserted, current: current.length };
  },

  /**
   * Spawn one live entity from a durable record. Prefers makeEnemySpawnSpec for NPC archetypes.
   */
  _spawnFromDurableRecord(rec, sectorId) {
    if (!rec || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const state = this.state;
    let spec = null;
    if (rec.enemyTypeId && (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.MISSION_TARGET || rec.isBoss)) {
      const pos = { x: rec.pos.x, z: rec.pos.z };
      const level = Number.isFinite(rec.level) ? rec.level : 1;
      spec = makeEnemySpawnSpec(rec.enemyTypeId, level, pos, {
        factionId: rec.factionId || undefined,
        startedTick: state.tick,
      });
      if (rec.ai && spec.data) {
        spec.data.ai = Object.assign({}, spec.data.ai || {}, rec.ai);
      }
      if (rec.isBoss && spec.data) {
        spec.data.isBoss = true;
        spec.data.bossPoiId = rec.bossPoiId;
        spec.data.bossSectorId = rec.bossSectorId || sectorId;
      }
      if (rec.missionId && spec.data) {
        spec.data.missionId = rec.missionId;
        spec.data.missionTag = rec.missionId;
        spec.data.missionPinned = true;
        spec.flags = Object.assign({}, spec.flags, { missionPinned: true });
      }
    } else {
      spec = spawnSpecFromRecord(rec);
      if (!spec) return null;
      // Convoy / freighter shell via ship def when present.
      if (rec.kind === RECORD_KIND.CONVOY && rec.shipDefId) {
        // Keep spawnSpecFromRecord shell; shipDefId already stamped on data.defId.
      }
    }
    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `world:record:${rec.recordId || `${sectorId}:${rec.kind || 'ship'}`}`;
    const budgeted = spec.type === 'ship' && budget && typeof budget.request === 'function';
    if (budgeted && budget.request(1, requester) <= 0) {
      if (rec.kind === RECORD_KIND.MISSION_TARGET || rec.isBoss) {
        this.bus.emit('world:criticalSpawnDeferred', {
          kind: rec.isBoss ? 'boss_record' : 'mission_record',
          recordId: rec.recordId || null,
          sectorId,
          reason: 'spawn_cap',
        });
      }
      return null;
    }
    let ent = null;
    try {
      ent = this.helpers.spawnEntity(spec);
    } catch (error) {
      if (budgeted && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!ent) {
      if (budgeted && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return null;
    }
    if (budgeted && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
    applyRecordVitals(ent, rec);
    bindEntityToRecord(ent, rec);
    this._decorateOrrinWitnessRecorder(ent, rec);
    this._stampHomeSector(ent, rec.homeSectorId || sectorId);
    // Restore pose after stamp (global — never re-add sector origin).
    if (ent.pos) {
      ent.pos.x = rec.pos.x;
      ent.pos.z = rec.pos.z;
    }
    return ent;
  },

  /**
   * Public/test hook: upsert a durable record for an entity (or plain record object).
   */
  upsertWorldRecord(input) {
    const state = this.state;
    const bag = ensureWorldRecords(state.world);
    if (input && input.recordId && input.kind && input.pos) {
      return upsertRecord(bag, input);
    }
    if (input && input.id != null) {
      const e = state.entities.get(input.id) || input;
      const sectorId = e.homeSectorId || (e.data && e.data.homeSectorId) || state.world.currentSectorId;
      const captured = captureEntityRecord(e, {
        sectorId,
        seed: (state.meta && state.meta.seed) || 1,
        tick: state.tick | 0,
      });
      return captured ? upsertRecord(bag, captured) : null;
    }
    return null;
  },

  /**
   * Materialize the one physical original that survives the published Corridor Massacre. Story
   * owns case progress; world owns the body and the durable record that makes Continue/re-entry
   * conservative. This deliberately grants neither cargo nor any economic/law outcome.
   */
  _ensureOrrinWitnessEvidence(payload) {
    const source = orrinWitnessSource(this.state);
    if (!source || payload.sourceId !== source.id) return null;

    const sourceId = source.id;
    const { sectorId, anchor } = source;
    const recordId = orrinWitnessRecordId(sourceId);
    if (!recordId) return null;
    const identityKey = `${ORRIN_WITNESS_MARKER_ID}:${sourceId}`;
    const bag = ensureWorldRecords(this.state.world);
    let record = bag.byId[recordId] || null;
    if (record) {
      if (record.kind !== RECORD_KIND.AFTERMATH
        || record.sectorId !== sectorId
        || record.markerId !== ORRIN_WITNESS_MARKER_ID
        || record.identityKey !== identityKey) return null;
      if (record.alive === false || record.outcome === 'destroyed' || record.outcome === 'defeated') {
        const staleLive = findLiveEntityForRecord(this.state.entityList, recordId);
        if (staleLive) staleLive.alive = false;
        return record;
      }
    } else {
      record = this.upsertWorldRecord({
        recordId,
        kind: RECORD_KIND.AFTERMATH,
        sectorId,
        homeSectorId: sectorId,
        pos: { x: Number(anchor.x), z: Number(anchor.z) },
        vel: { x: 0, z: 0 },
        rot: 0,
        type: 'wreck',
        team: 2,
        alive: true,
        outcome: 'active',
        wreckClass: 'evidence_recorder',
        markerId: ORRIN_WITNESS_MARKER_ID,
        victimClass: 'corridor-original',
        durableReason: 'orrin_witness_corridor_original',
        identityKey,
      });
    }
    if (!record) return null;

    // worldRecords only retains schema-owned fields. Stamp the live shell after rematerialization
    // too, so the scanner receipt can prove the exact source instead of accepting a look-alike.
    const candidate = findLiveEntityForRecord(this.state.entityList, record.recordId);
    const existing = isOrrinWitnessRecorder(candidate, sourceId) ? candidate : null;
    const entity = existing || (this.state.world.currentSectorId === sectorId
      ? this._spawnFromDurableRecord(record, sectorId) : null);
    this._decorateOrrinWitnessRecorder(entity, record);
    if (entity) this._stampHomeSector(entity, sectorId);
    this.bus.emit('orrinWitness:evidenceEnsured', {
      sourceId,
      recordId: record.recordId,
      sectorId,
      entityId: entity && entity.id || null,
    });
    return record;
  },

  _decorateOrrinWitnessRecorder(entity, record) {
    const prefix = `${ORRIN_WITNESS_MARKER_ID}:`;
    const sourceId = record && record.markerId === ORRIN_WITNESS_MARKER_ID
      && typeof record.identityKey === 'string'
      && record.identityKey.startsWith(prefix)
      ? record.identityKey.slice(prefix.length)
      : null;
    if (!entity || !sourceId) return false;
    if (!entity.data) entity.data = {};
    entity.data.markerId = ORRIN_WITNESS_MARKER_ID;
    entity.data.orrinWitnessSourceId = sourceId;
    entity.data.persistenceOwner = ORRIN_WITNESS_PERSISTENCE_OWNER;
    entity.data.scannerSignalKind = 'archive';
    entity.data.scanLabel = 'Corridor original recorder';
    entity.data.name = 'Corridor Original Recorder';
    entity.data.durable = true;
    return true;
  },

  /** Mark durable record destroyed (player kill / outcome). Keeps identity for no-reroll. */
  markWorldRecordDestroyed(recordId, opts = {}) {
    const bag = ensureWorldRecords(this.state.world);
    return markRecordDestroyed(bag, recordId, {
      tick: this.state.tick | 0,
      ...opts,
    });
  },

  /**
   * Test/harness hook: force a tier transition (used by residency tests for eviction).
   * @param {string} sectorId
   * @param {string} tier
   * @param {{reason?:string}} [opts]
   */
  _setSectorTier(sectorId, tier, opts = {}) {
    this._ensureResidencyState();
    if (tier === RESIDENCY_TIER.RECORD_ONLY) {
      this._demoteSectorToRecordOnly(sectorId);
    } else if (tier === RESIDENCY_TIER.REDUCED || tier === RESIDENCY_TIER.FULL) {
      this._ensureSectorMaterialized(sectorId, tier);
      this._syncSectorTierContent(sectorId, tier);
      this._setResidentMeta(sectorId, tier, opts.reason || 'test');
    }
    this.bus.emit('world:residency', {
      sectors: Object.keys(this.state.world.residentSectors).sort().map((id) => ({
        sectorId: id,
        tier: this.state.world.residentSectors[id].tier,
        epoch: this.state.world.residentSectors[id].epoch,
      })),
      membershipSectorId: this.state.world.currentSectorId,
      reason: opts.reason || 'test',
      tick: this.state.tick | 0,
      noTeleport: true,
    });
  },

  /** Scoped despawn: only entities owned by homeSectorId. Never player / persistent / mission-pinned. */
  _despawnEntitiesForSector(sectorId) {
    const state = this.state;
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e) continue;
      if (this._isProtectedFromResidency(e)) continue;
      const home = e.homeSectorId || (e.data && e.data.homeSectorId);
      if (home !== sectorId) continue;
      this._destroyEntityAtIndex(i);
    }
  },

  _despawnEntityIds(idSet, sectorId) {
    if (!idSet || idSet.size === 0) return;
    const state = this.state;
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e || !idSet.has(e.id)) continue;
      if (this._isProtectedFromResidency(e)) continue;
      if (sectorId) {
        const home = e.homeSectorId || (e.data && e.data.homeSectorId);
        if (home && home !== sectorId) continue;
      }
      this._destroyEntityAtIndex(i);
    }
  },

  _isProtectedFromResidency(e) {
    const state = this.state;
    if (!e) return true;
    if (e.id === state.playerId) return true;
    if (e.isPlayer) return true;
    if (e.flags && (e.flags.persistent || e.flags.missionPinned)) return true;
    // missionTag is the live mission spawn marker (missions.js); treat as pinned identity.
    if (e.data && (e.data.persistent || e.data.missionPinned || e.data.missionId || e.data.missionTag)) return true;
    return false;
  },

  _destroyEntityAtIndex(i) {
    const state = this.state;
    const list = state.entityList;
    const e = list[i];
    if (!e) return;
    e.alive = false;
    this.bus.emit('entity:destroyed', {
      id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId,
    });
    state.entities.delete(e.id);
    state.freeIds.push(e.id);
    const last = list.pop();
    if (i < list.length) list[i] = last;
  },

  /**
   * LEGACY global wipe — retained only for emergency tooling. Continuous residency and
   * enterSector MUST NOT call this (M2a: no global wipe on continuous or bounded jump).
   * @deprecated use _despawnEntitiesForSector
   */
  _despawnSectorEntities() {
    const state = this.state;
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (this._isProtectedFromResidency(e)) continue;
      this._destroyEntityAtIndex(i);
    }
  },

  _stampHomeSector(ent, sectorId) {
    if (!ent || !sectorId) return ent;
    ent.homeSectorId = sectorId;
    if (!ent.data) ent.data = {};
    ent.data.homeSectorId = sectorId;
    if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
    return ent;
  },

  // Free-flight membership: nearest corridor origin; no teleport / vel zero / noInterp.
  _tickResidency(state) {
    if (state.mode !== 'flight') return;
    // Skip membership auto-switch while gate/drive tunnel is in progress.
    if (state.jump && (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING')) return;
    const player = state.entities.get(state.playerId);
    if (!player || !player.pos) return;
    const next = sectorMembershipAtGlobal(player.pos, CORRIDOR_SECTOR_IDS);
    if (!next || next === state.world.currentSectorId) return;
    // Only auto-switch when both current and next are corridor (or current is unset/corridor).
    if (state.world.currentSectorId && !isCorridorSector(state.world.currentSectorId)) return;
    this.enterSector(next, {
      continuous: true,
      noTeleport: true,
      fromSectorId: state.world.currentSectorId,
    });
  },

  // --- coordinate helpers (sector-local authored → galactic-global, once at spawn) ----------
  /** Compose sector-local XZ into galactic-global for the given sector id. */
  _toGlobal(local, sectorId, out) {
    return sectorLocalToGlobalForSector(local, sectorId, out);
  },

  /** Sector galactic origin as a plain {x,z} (may share frozen table entries — treat read-only). */
  _sectorOrigin(sectorId) {
    return sectorGlobalOrigin(sectorId);
  },

  // --- spawn helpers ------------------------------------------------------------------------
  _spawnStations(sector, active, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const stations = sector.stations || [];
    const layoutCount = stations.reduce((count, station) => (
      count + (station.pos && station.rngNeutralAuthoredAddition === true ? 0 : 1)
    ), 0);
    let layoutIndex = 0;
    stations.forEach((st) => {
      // Authored anchors win; procedural ring is fallback for dev sectors missing pos.
      // Ordinary authored anchors retain their historical unused draws. An explicit RNG-neutral
      // embedded addition consumes none, so adding a berth inside an existing world site cannot
      // re-lay the sector's fields, hazards, POIs, or encounter dressing.
      const rngNeutral = st.pos && st.rngNeutralAuthoredAddition === true;
      const ringIndex = rngNeutral ? 0 : layoutIndex++;
      const ang = (Math.PI * 2 * ringIndex) / Math.max(1, layoutCount)
        + (rngNeutral ? 0 : rng()) * 0.6;
      const ringR = wr * (0.28 + (rngNeutral ? 0 : rng()) * 0.22);
      const local = st.pos
        ? { x: st.pos.x, z: st.pos.z }
        : { x: Math.cos(ang) * ringR, z: Math.sin(ang) * ringR };
      const pos = this._toGlobal(local, sector.id);
      const size = st.size || 'M';
      const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
      const collisionRadius = size === 'L' ? 42 : size === 'S' ? 26 : 34;
      // PQ-008 compound collision proxies: stations with an authored manifest declare it here.
      // The corridor bearing faces the sector origin (the natural traffic approach), stamped in
      // station-local degrees (station rot is 0); the manifest snaps it to an inter-spar lane.
      const collisionProxyId = collisionProxyIdForStation(st.id);
      const sectorOrigin = collisionProxyId ? this._sectorOrigin(sector.id) : null;
      const corridorBearingDeg = sectorOrigin && Number.isFinite(sectorOrigin.x)
        ? Math.atan2(sectorOrigin.z - pos.z, sectorOrigin.x - pos.x) * (180 / Math.PI)
        : null;
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: st.factionId || sector.factionId, pos,
        radius: collisionRadius, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: st.id, stationTypeId: st.type, dockRadius,
          placeScale: dockRadius / 14,
          collisionRadius,
          ...(collisionProxyId ? { collisionProxy: collisionProxyId, corridorBearingDeg } : {}),
          services: st.services || [], factionId: st.factionId || sector.factionId,
          name: st.name, size,
          // Chart note travels onto the live entity: the star chart's station lookup prefers live
          // entity data over the static catalog, so a catalog-only note would vanish once the
          // sector spawns. See src/ui/galaxyMap.js `findStationRecord`.
          chartNote: st.chartNote || null,
          stationSlogan: stationSloganFor(st.id),
          contested: !!st.contested, repGated: !!st.repGated,
          hidden: !!st.hidden,
          // The authored repGated flag means positive standing, not merely "not attack-on-sight".
          // An explicit minRep remains available for stations with a stricter local contract.
          ...(Number.isFinite(st.minRep)
            ? { minRep: st.minRep }
            : (st.repGated ? { minRep: 1 } : {})),
          sectorId: sector.id,
          homeSectorId: sector.id,
          archetypeGlb: st.archetypeGlb || null,
          landmark: !!st.landmark,
          landmarkGlb: st.landmarkGlb || null,
          ...(st.ambientTraffic === false ? { ambientTraffic: false } : {}),
          ...(st.embeddedWorldSiteId
            ? { embeddedWorldSiteId: String(st.embeddedWorldSiteId) }
            : {}),
        },
      });
      this._stampHomeSector(ent, sector.id);
      active.stations.push({ id: ent.id, stationId: st.id, pos: { x: pos.x, z: pos.z } });
    });
  },

  // Asteroid FIELDS: clusters of real ASTEROIDS-type rocks so mining oreTables resolve.
  _spawnFields(sector, active, disc, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const baseParams = FIELDS[sector.tier] || FIELDS[3] || FIELDS[1];
    // Shallow copy so we can attach homeSectorId without mutating the shared FIELDS catalog.
    const ecology = regionalEcologyReadout(this.state, sector.id);
    const params = {
      ...baseParams,
      _homeSectorId: sector.id,
      _ecologyYieldMultiplier: regionalResourceYieldMultiplier(this.state, sector.id),
      _ecologyFingerprint: ecology && ecology.fingerprint || null,
    };
    const fieldDefs = sector.fields || [];
    if (!fieldDefs.length) return;

    // Split the sector's asteroid budget across its declared fields, weighted by countWeight.
    const totalWeight = fieldDefs.reduce((s, f) => s + (f.countWeight || 1), 0) || 1;
    const budget = params.astCount || 80;

    for (const fdef of fieldDefs) {
      const depleted = (disc.fieldsDepleted && disc.fieldsDepleted[fdef.id]) || 0;
      const share = (fdef.countWeight || 1) / totalWeight;
      const count = fdef.count != null
        ? Math.max(1, Math.round(fdef.count * (1 - 0.6 * depleted)))
        : Math.max(4, Math.round(budget * share * (1 - 0.6 * depleted)));
      // Authored fields may pin their center/radius for onboarding or landmark readability.
      // Math stays sector-local for layout/RNG; convert the center once for live records + rocks.
      const cang = rng() * Math.PI * 2;
      const cR = wr * (0.35 + rng() * 0.4);
      const centerLocal = fdef.center
        ? { x: fdef.center.x, z: fdef.center.z }
        : { x: Math.cos(cang) * cR, z: Math.sin(cang) * cR };
      const center = this._toGlobal(centerLocal, sector.id);
      const clusterR = fdef.clusterRadius || params.clusterRadius || 450;
      const astIds = [];
      const authoredGeologyPlaceId = authoredGeologyPlaceForField(fdef);
      for (let i = 0; i < count; i++) {
        const activityBinding = sector.id === CERES_ACTIVITY_SECTOR_ID
          && fdef.id === 'f_ceres_1'
          && i === 1
          ? ceresActivityObjectBinding(
            'ceres_seam_ore_clast',
            (localPos) => this._toGlobal(localPos, sector.id),
          )
          : null;
        const collisionAnchorBinding = sector.id === CERES_ACTIVITY_SECTOR_ID
          ? ceresActivityCollisionAnchorBinding(
            fdef.id,
            i,
            (localPos) => this._toGlobal(localPos, sector.id),
          )
          : null;
        if (activityBinding && collisionAnchorBinding) {
          throw new Error(`Ceres activity bindings overlap at ${fdef.id}:${i}`);
        }
        const a = this._spawnAsteroid(
          fdef,
          params,
          center,
          clusterR,
          rng,
          i === 0 ? authoredGeologyPlaceId : null,
          activityBinding,
          collisionAnchorBinding,
        );
        if (a) {
          this._stampHomeSector(a, sector.id);
          astIds.push(a.id);
        }
      }
      active.fields.push({ id: fdef.id, type: fdef.type, center: { x: center.x, z: center.z }, asteroidIds: astIds });
    }
  },

  _spawnAsteroid(
    fdef,
    params,
    center,
    clusterR,
    rng,
    authoredGeologyPlaceId = null,
    activityBinding = null,
    collisionAnchorBinding = null,
  ) {
    const def = AST_BY_ID.get(fdef.type) || AST_BY_ID.get('ast_common_rock');
    // disc-uniform scatter inside the cluster (center is already galactic-global)
    const ang = rng() * Math.PI * 2;
    const r = clusterR * Math.sqrt(rng());
    const scatteredPos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };

    const [hpLo, hpHi] = def.hp || [120, 520];
    const oreHP = Math.round(hpLo + (hpHi - hpLo) * rng());
    const [szLo, szHi] = def.sizeRange || [6, 14];
    const size = szLo + (szHi - szLo) * rng();
    const [yLo, yHi] = def.yieldU || [8, 22];
    // interpolate yield in lockstep with hp (matches mining's _defaultYield)
    const t = hpHi === hpLo ? 1 : (oreHP - hpLo) / (hpHi - hpLo);
    const baseYieldU = Math.max(1, Math.round(yLo + (yHi - yLo) * t));
    const ecologyYield = Number(params && params._ecologyYieldMultiplier)
      || regionalResourceYieldMultiplier(this.state, params && params._homeSectorId)
      || 1;
    const yieldU = Math.max(1, Math.round(baseYieldU * ecologyYield));
    const tierCap = Math.min(def.tierCap, params.tierCap != null ? params.tierCap : def.tierCap);
    const angVel = (rng() - 0.5) * 0.35;
    // Activity bindings substitute existing-budget slots only after consuming every original
    // asteroid draw. They must not alter count, spawn order, geology index 0, or the later stream.
    const positionBinding = activityBinding || collisionAnchorBinding;
    const pos = positionBinding && positionBinding.pos
      ? { x: positionBinding.pos.x, z: positionBinding.pos.z }
      : scatteredPos;

    const ent = this.helpers.spawnEntity({
      type: 'asteroid', pos,
      radius: size, mass: 200 + size * 40, angVel,
      hull: oreHP, hullMax: oreHP, collides: true,
      data: {
        typeId: def.id, tier: def.tierCap, tierCap,
        oreHP, oreHPMax: oreHP, yieldU,
        ecologyFingerprint: params && params._ecologyFingerprint
          || regionalEcologyReadout(this.state, params && params._homeSectorId)?.fingerprint
          || null,
        size, pctEjected: 0, respawnSec: params.respawnSec || 120,
        fieldId: fdef.id,
        ...(authoredGeologyPlaceId ? {
          authoredGeologySkin: true,
          placeId: authoredGeologyPlaceId,
          placeTargetRadius: size,
        } : {}),
        ...(activityBinding && activityBinding.id
          ? { activityObjectSlotId: activityBinding.id }
          : {}),
        ...(collisionAnchorBinding && collisionAnchorBinding.id
          ? { activityCollisionAnchorSlotId: collisionAnchorBinding.id }
          : {}),
      },
    });
    // Asteroid fields are always spawned for a concrete sector bag — recover id from field center bag via caller.
    // homeSectorId is stamped by _spawnAsteroidInSector when available; fallback leaves data open.
    if (params && params._homeSectorId) this._stampHomeSector(ent, params._homeSectorId);
    ent.data.seams = deriveAsteroidSeams(this.state.meta.seed, ent.id, ent.radius, {
      hash32: this.helpers.hash32,
      mulberry32: this.helpers.mulberry32,
    });
    return ent;
  },

  // Plan 42: one real, moving Ceres ice body. The schedule is pure data; world owns the durable
  // event overlay/body recipe, Rapier owns its motion, and mining owns every unit removed from it.
  _spawnCometIce(sector, active) {
    if (!sector || sector.id !== COMET_ICE.sectorId || !active) return null;
    const state = this.state;
    const pass = cometPassAt(state.meta && state.meta.seed || 1, state.simTime);
    if (!pass.active) return null;
    const own = state.world.cometIce || (state.world.cometIce = createCometIceState());
    let rec = own.byPassId[pass.passId];
    if (!rec) {
      rec = own.byPassId[pass.passId] = {
        oreHP: COMET_ICE.oreHP,
        oreCarry: 0,
        dustCarry: 0,
        pctEjected: 0,
        depleted: false,
        pos: null,
        vel: null,
      };
    }
    if (rec.depleted || !(rec.oreHP > 0)) return null;
    const already = this._liveCometIce(pass.passId);
    if (already) return already;

    const origin = sectorGlobalOrigin(pass.sectorId);
    const local = cometLocalPosition(pass, state.simTime);
    const pos = rec.pos
      ? { x: rec.pos.x, z: rec.pos.z }
      : { x: origin.x + local.x, z: origin.z + local.z };
    const vel = rec.vel
      ? { x: rec.vel.x, z: rec.vel.z }
      : { x: pass.velocity.x, z: pass.velocity.z };
    const ent = this.helpers.spawnEntity({
      type: 'asteroid',
      pos,
      vel,
      radius: COMET_ICE.radius,
      mass: COMET_ICE.mass,
      angVel: 0.08,
      hull: rec.oreHP,
      hullMax: COMET_ICE.oreHP,
      collides: true,
      physicsBody: {
        schemaVersion: 1,
        radius: COMET_ICE.radius,
        mass: COMET_ICE.mass,
        inertiaY: 0.5 * COMET_ICE.mass * COMET_ICE.radius * COMET_ICE.radius,
        dynamic: true,
        ccd: true,
        material: 'ice',
        revision: 0,
      },
      data: {
        typeId: 'ast_icy',
        tier: 1,
        tierCap: 1,
        oreHP: rec.oreHP,
        oreHPMax: COMET_ICE.oreHP,
        yieldU: COMET_ICE.yieldU,
        pctEjected: rec.pctEjected || 0,
        _oreCarry: rec.oreCarry || 0,
        _resonanceDustCarry: rec.dustCarry || 0,
        size: COMET_ICE.radius,
        fieldId: pass.fieldId,
        sectorId: pass.sectorId,
        homeSectorId: pass.sectorId,
        cometIce: true,
        cometPassId: pass.passId,
        cometWindowEndsAtS: pass.endsAtS,
        name: 'Drift Comet Ice',
        interactionPrompt: 'Match its drift and mine the ice before the pass closes',
      },
    });
    this._stampHomeSector(ent, pass.sectorId);
    ent.data.seams = deriveAsteroidSeams(state.meta.seed, `comet:${pass.passId}`, ent.radius, {
      hash32: this.helpers.hash32,
      mulberry32: this.helpers.mulberry32,
    });
    this._cometIceEntityId = ent.id;
    this._cometIcePassId = pass.passId;
    active.fields.push({
      id: pass.fieldId,
      type: 'ast_icy',
      center: { x: ent.pos.x, z: ent.pos.z },
      asteroidIds: [ent.id],
      eventType: 'comet_ice',
      passId: pass.passId,
    });
    this.bus.emit('world:cometIceMaterialized', {
      passId: pass.passId,
      sectorId: pass.sectorId,
      asteroidId: ent.id,
      endsAtS: pass.endsAtS,
      velocity: { x: ent.vel.x, z: ent.vel.z },
    });
    if (own.announcedPassId !== pass.passId) {
      own.announcedPassId = pass.passId;
      this.bus.emit('news:publish', {
        id: `comet-window:${pass.passId}`,
        text: 'CERES TRAFFIC: a comet-ice body is crossing the refinery belt. Match its drift to cut water and volatiles before the two-day window closes.',
        kind: 'resource-window',
        sectorId: pass.sectorId,
        source: 'physical-comet-ice',
        passId: pass.passId,
        asteroidId: ent.id,
      });
    }
    return ent;
  },

  _liveCometIce(passId = null) {
    const state = this.state;
    const direct = this._cometIceEntityId != null ? state.entities.get(this._cometIceEntityId) : null;
    if (direct && direct.alive !== false && direct.data && direct.data.cometIce
      && (passId == null || direct.data.cometPassId === passId)) return direct;
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || !entity.data || !entity.data.cometIce) continue;
      if (passId != null && entity.data.cometPassId !== passId) continue;
      this._cometIceEntityId = entity.id;
      this._cometIcePassId = entity.data.cometPassId;
      return entity;
    }
    return null;
  },

  _captureCometIce(sectorId = null) {
    const entity = this._liveCometIce();
    if (!entity || (sectorId && entity.data.homeSectorId !== sectorId)) return null;
    const own = this.state.world.cometIce || (this.state.world.cometIce = createCometIceState());
    const passId = entity.data.cometPassId;
    const rec = own.byPassId[passId] || (own.byPassId[passId] = {});
    rec.oreHP = Math.max(0, Math.min(COMET_ICE.oreHP, Number(entity.data.oreHP) || 0));
    rec.oreCarry = Math.max(0, Number(entity.data._oreCarry) || 0);
    rec.dustCarry = Math.max(0, Number(entity.data._resonanceDustCarry) || 0);
    rec.pctEjected = Math.max(0, Math.min(1, Number(entity.data.pctEjected) || 0));
    rec.depleted = rec.depleted === true || entity.alive === false || rec.oreHP <= 0;
    rec.pos = { x: entity.pos.x, z: entity.pos.z };
    rec.vel = { x: entity.vel.x, z: entity.vel.z };
    return rec;
  },

  _onCometIceDestroyed(payload) {
    const entity = payload && payload.id != null ? this.state.entities.get(payload.id) : null;
    if (!entity || !entity.data || !entity.data.cometIce) return false;
    const rec = this._captureCometIce(entity.data.homeSectorId);
    if (rec) {
      rec.oreHP = 0;
      rec.depleted = true;
    }
    this.bus.emit('world:cometIceDepleted', {
      passId: entity.data.cometPassId,
      sectorId: entity.data.homeSectorId,
      asteroidId: entity.id,
      pos: { x: entity.pos.x, z: entity.pos.z },
    });
    return true;
  },

  _retireCometIce(entity, reason) {
    if (!entity) return false;
    this._captureCometIce(entity.data && entity.data.homeSectorId);
    entity.alive = false;
    for (const bag of Object.values(this.state.world.sectorContents || {})) {
      for (const field of bag && bag.fields || []) {
        if (Array.isArray(field.asteroidIds)) {
          field.asteroidIds = field.asteroidIds.filter((id) => id !== entity.id);
        }
      }
    }
    this.bus.emit('world:cometIceRetired', {
      passId: entity.data && entity.data.cometPassId,
      sectorId: entity.data && entity.data.homeSectorId,
      asteroidId: entity.id,
      reason,
    });
    this._cometIceEntityId = null;
    this._cometIcePassId = null;
    return true;
  },

  _tickCometIce(state) {
    const pass = cometPassAt(state.meta && state.meta.seed || 1, state.simTime);
    const live = this._liveCometIce();
    if (live && (!pass.active || live.data.cometPassId !== pass.passId)) {
      this._retireCometIce(live, pass.active ? 'next-pass' : 'window-closed');
    }
    if (!pass.active || this._liveCometIce(pass.passId)) return;
    state.world.cometIce = normalizeCometIceState(state.world.cometIce, pass.cycle);
    const resident = state.world.residentSectors && state.world.residentSectors[pass.sectorId];
    if (!resident || (resident.tier !== RESIDENCY_TIER.FULL && resident.tier !== RESIDENCY_TIER.REDUCED)) return;
    const active = state.world.sectorContents && state.world.sectorContents[pass.sectorId];
    if (!active) return;
    this._spawnCometIce(state.world.sectors[pass.sectorId] || SECTOR_BY_ID.get(pass.sectorId), active);
  },

  // Jump GATES: one per outbound edge, placed on the disc rim toward the neighbor's map position.
  _spawnGates(sector, active, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const authored = Array.isArray(sector.gates) && sector.gates.length > 0 ? sector.gates : null;
    const spawnGate = (nbId, pos, opts = {}) => {
      const nb = safeSector(this.state, nbId);
      const dockRadius = opts.wormhole ? 80 : 70;
      const collisionRadius = opts.wormhole ? 38 : 32;
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: sector.factionId, pos,
        radius: collisionRadius, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: null, isGate: true, gateTo: nbId, dockRadius,
          placeScale: dockRadius / 14,
          homeSectorId: sector.id,
          collisionRadius,
          services: [], factionId: sector.factionId,
          name: opts.wormhole ? 'Wormhole' : `Gate → ${nb ? nb.name : nbId}`,
          sectorId: sector.id,
          isWormhole: !!opts.wormhole,
          gatedBy: opts.gatedBy || null,
          archetypeGlb: opts.archetypeGlb || 'place_gate_jump_ring',
        },
      });
      this._stampHomeSector(ent, sector.id);
      active.gates.push({ id: ent.id, to: nbId, pos, wormhole: !!opts.wormhole });
    };
    if (authored) {
      for (const g of authored) {
        if (!g.to || !g.pos) continue;
        const isWh = !!g.wormhole;
        spawnGate(g.to, this._toGlobal(g.pos, sector.id), {
          wormhole: isWh,
          gatedBy: isWh && sector.wormholeTo ? sector.wormholeTo.gatedBy : null,
          archetypeGlb: g.archetypeGlb,
        });
      }
      return;
    }
    for (const nbId of (sector.neighbors || [])) {
      const nb = safeSector(this.state, nbId);
      const ang = this._bearingTo(sector, nb, rng);
      const gateR = wr * 0.82;
      spawnGate(nbId, this._toGlobal({ x: Math.cos(ang) * gateR, z: Math.sin(ang) * gateR }, sector.id));
    }
    if (sector.wormholeTo) {
      const ang = rng() * Math.PI * 2;
      spawnGate(sector.wormholeTo.sectorId, this._toGlobal({
        x: Math.cos(ang) * wr * 0.6, z: Math.sin(ang) * wr * 0.6,
      }, sector.id), {
        wormhole: true, gatedBy: sector.wormholeTo.gatedBy,
      });
    }
  },

  // POIs: tracked in the discovery overlay; spawn a lightweight marker entity for in-range scan.
  _spawnPOIs(sector, active, disc, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    if (!disc.pois) disc.pois = {};
    for (const poi of (sector.pois || [])) {
      const ang = rng() * Math.PI * 2;
      const r = wr * (0.2 + rng() * 0.6);
      const local = poi.pos
        ? { x: poi.pos.x, z: poi.pos.z }
        : { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
      const pos = this._toGlobal(local, sector.id);
      if (!disc.pois[poi.id]) disc.pois[poi.id] = { discovered: false, identified: false };
      // Static Atlas rows may delegate their physical representation to a durable runtime owner.
      // Keep the discovery identity here, but never create a second marker entity beside that owner.
      if (typeof poi.runtimeOwner === 'string' && poi.runtimeOwner.length > 0) continue;
      const placeId = poi.landmarkGlb
        ? String(poi.landmarkGlb).replace(/^places\//, '').replace(/\.glb$/, '')
        : null;
      const visualRadius = finitePositive(poi.visualRadius)
        ? Number(poi.visualRadius)
        : (placeId && DRESSING_RADIUS[placeId]) || (poi.landmark ? 24 : 10);
      const triangulation = poi.triangulation && typeof poi.triangulation === 'object'
        ? { ...poi.triangulation }
        : null;
      const anomalyTriangulated = disc.pois[poi.id] && disc.pois[poi.id].triangulated === true;
      const hidden = !!poi.hidden && disc.pois[poi.id].discovered !== true;
      const ent = this.helpers.spawnEntity({
        type: 'fx', factionId: poi.factionId || null, pos,
        radius: visualRadius, mass: 0, collides: false, ttl: Infinity,
        data: {
          poi: true, poiId: poi.id, poiType: poi.type, name: poi.name,
          hidden, gatedBy: poi.gatedBy || null,
          requiresTriangulation: !!triangulation,
          triangulation,
          anomalyTriangulated,
          scanRange: poi.scanRange || SCAN_RANGE, sectorId: sector.id,
          // V2 §6 / M3: claimable bodies carry their claim flag + size so the player can claim them.
          claimable: !!poi.claimable, size: poi.size || 'M',
          landmark: !!poi.landmark,
          landmarkGlb: poi.landmarkGlb || null,
          placeId,
          visualRadius,
          placeRadius: visualRadius,
          homeSectorId: sector.id,
          ...(poi.flavorTargetRef ? { flavorTargetRef: String(poi.flavorTargetRef) } : {}),
          ...(poi.flavorSourceId ? { flavorSourceId: String(poi.flavorSourceId) } : {}),
          ...(poi.scannerSignalKind ? { scannerSignalKind: String(poi.scannerSignalKind) } : {}),
          ...(finitePositive(poi.scannerSignalPriority)
            ? { scannerSignalPriority: Number(poi.scannerSignalPriority) }
            : {}),
          ...(poi.repeatableScannerSignal === true ? { repeatableScannerSignal: true } : {}),
          ...(poi.manualInvestigation === true ? { manualInvestigation: true } : {}),
          ...(poi.requiresActiveScan === true ? { requiresActiveScan: true } : {}),
          ...(poi.resonanceScanResponse === true ? { resonanceScanResponse: true } : {}),
          ...(poi.recoveryEncounter === true ? { salvagePointId: String(poi.id) } : {}),
          ...(poi.survivorPod === true ? { survivorPod: true } : {}),
          ...(finitePositive(poi.bandProximityRadius)
            ? { bandProximityRadius: Number(poi.bandProximityRadius) }
            : {}),
          ...(finitePositive(poi.dressingExclusionRadius)
            ? { dressingExclusionRadius: Number(poi.dressingExclusionRadius) }
            : {}),
        },
      });
      this._stampHomeSector(ent, sector.id);
      active.pois.push({
        id: ent.id, poiId: poi.id, type: poi.type, pos: { x: pos.x, z: pos.z },
        hidden, claimable: !!poi.claimable,
        ...(poi.scannerSignalKind ? { scannerSignalKind: String(poi.scannerSignalKind) } : {}),
        ...(finitePositive(poi.scannerSignalPriority)
          ? { scannerSignalPriority: Number(poi.scannerSignalPriority) }
          : {}),
        manualInvestigation: poi.manualInvestigation === true,
        requiresActiveScan: poi.requiresActiveScan === true,
        requiresTriangulation: !!triangulation,
        triangulation,
        anomalyTriangulated,
      });

      // A1/V2 physical Quiessence carriers. H1c still owns the eventual dark-freighter art;
      // these sector-owned, non-colliding actors give the existing scanner and Band routes real
      // identities today without introducing combatants, physics bodies, or a parallel signal path.
      const fleetCount = Math.max(0, Math.min(24, Math.trunc(Number(poi.bandLandmarkFleet) || 0)));
      if (fleetCount > 0 && poi.flavorTargetRef) {
        for (let shipIndex = 1; shipIndex <= fleetCount; shipIndex += 1) {
          const angle = (shipIndex / fleetCount) * Math.PI * 2;
          const ring = 120 + (shipIndex % 5) * 28;
          const hull = this.helpers.spawnEntity({
            type: 'fx',
            factionId: poi.factionId || null,
            pos: {
              x: pos.x + Math.cos(angle) * ring,
              z: pos.z + Math.sin(angle) * ring,
            },
            radius: 14,
            mass: 0,
            collides: false,
            physicsBody: false,
            ttl: Infinity,
            flags: { noInterp: true },
            data: {
              poi: true,
              poiId: `${poi.id}_hull_${shipIndex}`,
              poiType: 'anomaly',
              hidden: true,
              name: `Quiessence Hull ${shipIndex}`,
              sectorId: sector.id,
              homeSectorId: sector.id,
              flavorTargetRef: String(poi.flavorTargetRef),
              quiessenceShipIndex: shipIndex,
              bandProximityRadius: finitePositive(poi.bandProximityRadius)
                ? Number(poi.bandProximityRadius)
                : 1600,
              memorialHull: true,
              scanRange: finitePositive(poi.scanRange) ? Number(poi.scanRange) : SCAN_RANGE,
              visualRadius: 14,
            },
          });
          this._stampHomeSector(hull, sector.id);
          active.pois.push({
            id: hull.id,
            poiId: `${poi.id}_hull_${shipIndex}`,
            type: 'anomaly',
            pos: { x: hull.pos.x, z: hull.pos.z },
            hidden: true,
            claimable: false,
          });
        }
      }
    }
  },

  _spawnDressing(sector, active, rng) {
    const paletteClass = paletteClassForSector(sector);
    if (paletteClass === 'core') {
      this._spawnCoreDressing(sector, active, rng, paletteClass);
    } else if (paletteClass === 'belt') {
      this._spawnBeltDressing(sector, active, rng, paletteClass);
    } else if (paletteClass === 'fringe') {
      this._spawnFringeDressing(sector, active, rng, paletteClass);
    } else if (paletteClass === 'anomaly') {
      this._spawnAnomalyDressing(sector, active, rng, paletteClass);
    }
  },

  _spawnCoreDressing(sector, active, rng, paletteClass) {
    const gates = active.gates || [];
    const stations = active.stations || [];
    const origin = this._sectorOrigin(sector.id);
    for (let i = 0; i < Math.min(4, gates.length * 2); i++) {
      const gate = gates[i % Math.max(1, gates.length)];
      if (!gate || !gate.pos) continue;
      const t = i % 2 === 0 ? 0.46 : 0.62;
      const side = i % 2 === 0 ? 1 : -1;
      const pos = offsetAlongRadial(gate.pos, t, side * (95 + rng() * 35), origin);
      this._spawnPlaceProp(active, sector, 'place_lane_beacon', pos, {
        paletteClass,
        rot: bearingFromOrigin(pos, origin),
        name: 'Lane Beacon',
        placeScale: 1,
      });
    }
    for (let i = 0; i < Math.min(2, stations.length); i++) {
      const station = stations[i];
      if (!station || !station.pos) continue;
      const pos = offsetAlongRadial(station.pos, 1.0, 150 + rng() * 70, origin);
      this._spawnPlaceProp(active, sector, 'place_station_billboard', pos, {
        paletteClass,
        rot: bearingToward(station.pos, pos),
        name: `${station.stationId || 'Station'} Billboard`,
        placeScale: 1,
      });
    }
  },

  _spawnBeltDressing(sector, active, rng, paletteClass) {
    const fields = active.fields || [];
    const stations = active.stations || [];
    const ceresActivity = sector.id === CERES_ACTIVITY_SECTOR_ID;
    const activityBinding = (id) => ceresActivity
      ? ceresActivityObjectBinding(id, (localPos) => this._toGlobal(localPos, sector.id))
      : null;
    for (let i = 0; i < Math.min(3, fields.length); i++) {
      const field = fields[i];
      if (!field || !field.center) continue;
      const ang = rng() * Math.PI * 2;
      const dist = 210 + rng() * 170;
      const originalNavPos = polarOffset(field.center, ang, dist);
      const navBinding = i === 0 ? activityBinding('ceres_ambush_distress_beacon') : null;
      // Each Ceres activity object RE-POINTS an ambient prop this loop was going to spawn anyway
      // rather than adding one. That is what keeps the authored cast free of entity, collider and
      // draw cost, and it is why the pinned PQ-020 structural-cost digest still holds with a sixth
      // logical object. The RNG position is still computed either way, so the draw cadence is
      // untouched whether or not a slot claims the prop.
      const droneBinding = i === 0
        ? activityBinding('ceres_refinery_disabled_hull')
        : (i === 1
          ? activityBinding('ceres_ambush_bait_wreck')
          : (i === 2 ? activityBinding('ceres_cathedral_grave_shard') : null));
      this._spawnPlaceProp(
        active,
        sector,
        'place_nav_buoy',
        navBinding ? navBinding.pos : originalNavPos,
        {
          paletteClass,
          rot: ang + Math.PI * 0.5,
          name: navBinding ? 'Throughline Distress Beacon' : 'Belt Survey Buoy',
          placeScale: 1,
          activityObjectSlotId: navBinding && navBinding.id,
        },
      );
      const originalDronePos = polarOffset(field.center, ang + 1.9, 120 + rng() * 130);
      const dronePresentation = droneBinding
        ? CERES_ACTIVITY_DRONE_SLOT_PRESENTATION[droneBinding.id]
        : null;
      this._spawnPlaceProp(
        active,
        sector,
        dronePresentation ? dronePresentation.placeId : 'place_mining_drone',
        droneBinding ? droneBinding.pos : originalDronePos,
        {
          paletteClass,
          rot: ang,
          name: dronePresentation ? dronePresentation.name : 'Prospecting Drone',
          placeScale: 1,
          activityObjectSlotId: droneBinding && droneBinding.id,
        },
      );
    }
    if (stations[0] && fields[0] && fields[0].center) {
      const originalPos = midpoint(stations[0].pos, fields[0].center, 0.58);
      const cargoBinding = activityBinding('ceres_refinery_cargo_pod');
      this._spawnPlaceProp(active, sector, 'place_conveyor_barge', cargoBinding ? cargoBinding.pos : originalPos, {
        paletteClass,
        rot: bearingToward(fields[0].center, stations[0].pos),
        name: cargoBinding ? 'Refinery Cargo Staging Pod' : 'Ore Conveyor',
        placeScale: 1,
        activityObjectSlotId: cargoBinding && cargoBinding.id,
      });
    }
  },

  _spawnFringeDressing(sector, active, rng, paletteClass) {
    const fields = active.fields || [];
    const gates = active.gates || [];
    const pois = active.pois || [];
    const origin = this._sectorOrigin(sector.id);
    if (gates[0] && gates[0].pos) {
      const pos = offsetAlongRadial(gates[0].pos, 0.76, 120 + rng() * 60, origin);
      this._spawnPlaceProp(active, sector, 'place_nav_buoy', pos, {
        paletteClass,
        rot: bearingFromOrigin(pos, origin),
        name: 'Flickering Nav Buoy',
      });
    }
    const hulkAnchor = pois.find((poi) => poi.type === 'wreck' || poi.type === 'derelict') || fields[0] || null;
    if (hulkAnchor) {
      const anchor = hulkAnchor.pos || hulkAnchor.center;
      const ang = rng() * Math.PI * 2;
      this._spawnPlaceProp(active, sector, 'place_dead_hulk', polarOffset(anchor, ang, 140 + rng() * 120), {
        paletteClass,
        rot: ang,
        name: 'Dead Hulk',
      });
      this._spawnPlaceProp(active, sector, 'place_debris_chunk', polarOffset(anchor, ang + 0.8, 220 + rng() * 90), {
        paletteClass,
        rot: ang + Math.PI * 0.35,
        name: 'Debris Chunk',
      });
    }
    if (fields[0] && fields[0].center) {
      const ang = rng() * Math.PI * 2;
      this._spawnPlaceProp(active, sector, 'place_mining_drone', polarOffset(fields[0].center, ang, 250 + rng() * 120), {
        paletteClass,
        rot: ang,
        name: 'Fringe Prospecting Drone',
      });
    }
  },

  _spawnAnomalyDressing(sector, active, rng, paletteClass) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const pois = active.pois || [];
    const anchor = pois[0] && pois[0].pos
      ? pois[0].pos
      : this._toGlobal({ x: wr * 0.24, z: -wr * 0.18 }, sector.id);
    const base = rng() * Math.PI * 2;
    this._spawnPlaceProp(active, sector, 'place_nav_buoy', polarOffset(anchor, base, 180 + rng() * 80), {
      paletteClass,
      rot: base,
      name: 'Quiet Nav Buoy',
    });
    this._spawnPlaceProp(active, sector, 'place_debris_chunk', polarOffset(anchor, base + 1.7, 260 + rng() * 110), {
      paletteClass,
      rot: base + 0.5,
      name: 'Drifting Debris',
    });
    this._spawnPlaceProp(active, sector, 'place_mining_drone', polarOffset(anchor, base + 3.0, 330 + rng() * 140), {
      paletteClass,
      rot: base + Math.PI,
      name: 'Anomaly Survey Drone',
    });
  },

  _spawnPlaceProp(active, sector, placeId, pos, options = {}) {
    if (!placeId || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    for (const poi of active.pois || []) {
      const carrier = this.state.entities && this.state.entities.get(poi && poi.id);
      const exclusionRadius = Number(carrier && carrier.data && carrier.data.dressingExclusionRadius);
      if (Number.isFinite(exclusionRadius) && exclusionRadius > 0 && carrier.pos
          && dist2(pos, carrier.pos) < exclusionRadius * exclusionRadius) return null;
    }
    const paletteClass = options.paletteClass || paletteClassForSector(sector);
    const radius = DRESSING_RADIUS[placeId] || 12;
    const ent = this.helpers.spawnEntity({
      type: 'fx',
      factionId: sector.factionId || null,
      pos,
      rot: Number.isFinite(options.rot) ? options.rot : 0,
      radius,
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      data: {
        placeId,
        placeScale: finitePositive(options.placeScale) ? Number(options.placeScale) : 1,
        worldDressing: true,
        paletteClass,
        sectorId: sector.id,
        homeSectorId: sector.id,
        name: options.name || placeId,
        visualRadius: radius,
        placeRadius: radius,
        ...(typeof options.activityObjectSlotId === 'string' && options.activityObjectSlotId.length > 0
          ? { activityObjectSlotId: options.activityObjectSlotId }
          : {}),
      },
    });
    this._stampHomeSector(ent, sector.id);
    active.dressing.push({ id: ent.id, placeId, pos: { x: pos.x, z: pos.z }, paletteClass });
    return ent;
  },

  // Hazard zones are world-owned spatial data (flight/combat/ai read these); no entity needed.
  // Authored centers become immutable global origins. Moving zones derive their live center from
  // sim time, so re-entry and Continue resume the same physical sweep without serializing a timer.
  _spawnHazards(sector, active) {
    const discovery = this._discoveryFor(sector.id);
    for (const hz of (sector.hazards || [])) {
      const center = this._toGlobal(hz.center, sector.id);
      const aftermath = hz.afterBossDefeat;
      const bossRecord = aftermath && discovery.pois && discovery.pois[aftermath.poiId];
      const intensity = bossRecord && bossRecord.bossDefeated === true
        ? aftermath.intensity
        : hz.intensity;
      const live = {
        id: hz.id || null,
        type: hz.type,
        originCenter: { x: center.x, z: center.z },
        center: { x: center.x, z: center.z },
        radius: hz.radius, intensity, moving: !!hz.moving,
        motion: hz.motion && typeof hz.motion === 'object' ? { ...hz.motion } : null,
      };
      hazardCenterAt(live, this.state.simTime, live.center);
      active.hazards.push(live);
    }
  },

  _applyBossHazardAftermath(sector, poiId) {
    const active = this.state.world.activeSector;
    if (!sector || !active || active.id !== sector.id) return [];
    const changed = [];
    for (const authored of (sector.hazards || [])) {
      const aftermath = authored.afterBossDefeat;
      if (!aftermath || aftermath.poiId !== poiId || !Number.isFinite(aftermath.intensity)) continue;
      const live = (active.hazards || []).find((hazard) => hazard && hazard.id === authored.id);
      if (!live || live.intensity === aftermath.intensity) continue;
      const previousIntensity = live.intensity;
      live.intensity = aftermath.intensity;
      changed.push({
        hazardId: authored.id,
        type: authored.type,
        previousIntensity,
        intensity: live.intensity,
      });
    }
    return changed;
  },

  // Enemy spawns sized by enemyDensity / enemyLevel via makeEnemySpawnSpec (combat).
  _spawnEnemies(sector, active, rng) {
    // If sectorSim has drifted this sector while the player was away, use the drifted density/
    // security so re-entering a sector reflects its current state (V2 §33/§35.3). Falls back to the
    // passed-in sector (no drift → first visit or pre-sectorSim) so behavior is unchanged otherwise.
    const sec = effectiveSectorFor(this.state, sector.id) || sector;
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const density = sec.enemyDensity || 0;
    if (density <= 0) return;
    const di = dangerIndex(sec);
    const count = Math.min(10, Math.round(density * 8 + di * 2 + rng() * 1.5));
    const [lvLo, lvHi] = sector.enemyLevel || [1, 2];

    // REVAMP 2.1 — ambient is a spawnBudget CLIENT with static headroom: reserve at most AMBIENT_HEADROOM
    // of the shared live-ship cap so the encounterDirector always retains slots (no eviction — we simply
    // spawn fewer ambient when the world is tight). Each live slot is bound to its entity and the
    // reservation is sector-scoped, so continuous residency handoffs release only the ships actually
    // demoted. Any unspent slots are released below. No budget → unchanged.
    const budget = this.helpers && this.helpers.spawnBudget;
    const ambientRequester = `world:ambient:${sector.id}`;
    let grant = Math.min(count, AMBIENT_HEADROOM);
    if (budget && typeof budget.request === 'function') grant = budget.request(grant, ambientRequester);
    const enemiesBefore = active.enemies.length;

    // Purposeful presence (WORLD_OVERHAUL_2_1): place ambient hostiles/patrols onto NAMED zones —
    // ambush lanes, patrol corridors, outlaw dens — as cohesive faction squads with a shared squadId
    // (so the SG-06 roster forms them up on the zone) instead of scattering singletons on random rings.
    // The ships are relocated onto believable zones, not multiplied. Sectors with no authored zones
    // keep the legacy ring path. `grant` (not `count`) caps how many we place, per the budget above.
    const zonePlan = grant > 0 ? planZoneSpawns(sector.id, grant, sector.enemyLevel || [lvLo, lvHi], rng) : [];
    if (zonePlan.length) {
      const player = this.state.entities.get(this.state.playerId);
      const starterSafe = starterSafeRadius(sector);
      const sectorOrigin = this._sectorOrigin(sector.id);
      for (const intent of zonePlan) {
        // Zone plans are sector-local; convert once at the spawn boundary.
        const pos = this._toGlobal(intent.pos, sector.id);
        if (intent.context === 'zone_hostile') {
          // Never drop authored danger inside tutorial/port/arrival protection or on the player.
          if (starterSafe > 0 && dist2(pos, sectorOrigin) < starterSafe * starterSafe) continue;
          if (!this._ambientSpawnIsSafe(pos, sector, active)) continue;
          if (player && player.pos && dist2(pos, player.pos) < ZONE_HOSTILE_PLAYER_CLEARANCE * ZONE_HOSTILE_PLAYER_CLEARANCE) continue;
        }
        const spec = makeEnemySpawnSpec(intent.archetypeId, clamp(intent.level, lvLo, lvHi + 2), pos, {
          factionId: intent.factionId,
          startedTick: this.state.tick,
        });
        spec.data = spec.data || {};
        spec.data.ai = spec.data.ai || {};
        spec.data.ai.squadId = intent.squadId;   // one squad per zone → coherent formation on the zone
        spec.data.ai.doctrine = intent.doctrine;
        spec.data.ai.formation = intent.formation;
        spec.data.ai.zoneId = intent.zoneId;
        spec.data.ai.zoneName = intent.zoneName;
        if (Number.isFinite(intent.standingHostileBelow)) {
          spec.data.ai.standingHostileBelow = intent.standingHostileBelow;
        }
        tagAiSpawnContext(spec, sector, sec, intent.context);
        const ent = this.helpers.spawnEntity(spec);
        if (!ent) continue;
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, ambientRequester);
        this._stampHomeSector(ent, sector.id);
        this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, intent.archetypeId || 'npc', active);
        active.enemies.push(ent.id);
      }
    } else if (grant > 0) {
      const pool = this._enemyPool(sector);
      for (let i = 0; i < grant; i++) {
        const typeId = pool[Math.floor(rng() * pool.length)];
        const level = Math.round(lvLo + (lvHi - lvLo) * (rng() * 0.6 + 0.4 * (1 - sec.security)));
        const pos = this._ambientEnemySpawnPos(sector, active, rng, wr);
        if (!pos) continue;
        const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos, { startedTick: this.state.tick });
        tagAiSpawnContext(spec, sector, sec, 'ambient');
        const ent = this.helpers.spawnEntity(spec);
        if (!ent) continue;
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, ambientRequester);
        this._stampHomeSector(ent, sector.id);
        this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, typeId || 'npc', active);
        active.enemies.push(ent.id);
      }
    }
    // Return any reserved-but-unspent ambient slots (safe-zone skips / no valid pos) so the
    // encounterDirector can use them. Reserve/release keeps the shared cap honest (REVAMP 2.1 risk #1).
    if (budget && typeof budget.releaseSome === 'function') {
      const spawned = active.enemies.length - enemiesBefore;
      if (spawned < grant) budget.releaseSome(ambientRequester, grant - spawned);
    }
    // WANTED hunters (V2 §20b / cut-list #15): if the player is hot, bounty-hunter lawful patrols
    // spawn specifically to hunt them — real consequence for piracy. Count scales with heat; they
    // drop near the player so the threat is immediate, not ambient. High-sec already has patrols,
    // so hunters matter most in the lawless fringe where a criminal hides.
    const heatVal = this.state.player && this.state.player.heat;
    if (typeof heatVal === 'number' && heatVal >= 0.15 && sector.security < 0.6) {
      const hunters = Math.min(4, Math.round(heatVal * 4 + 0.5));
      const player = this.state.entities.get(this.state.playerId);
      if (this._playerInNoHostileSpawnZone(sector, active, player)) return;
      const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
      const hunterRequester = `world:bounty:${sector.id}`;
      const hunterGrant = budget && typeof budget.request === 'function'
        ? budget.request(hunters, hunterRequester)
        : hunters;
      if (hunterGrant < hunters) {
        this.bus.emit('world:spawnLimited', {
          kind: 'bounty_hunter', sectorId: sector.id, requested: hunters, granted: hunterGrant,
          reason: 'spawn_cap',
        });
      }
      let huntersSpawned = 0;
      for (let i = 0; i < hunterGrant; i++) {
        const pos = this._directHostileSpawnPos(sector, active, rng, { x: px, z: pz }, HUNTER_SPAWN_MIN_RADIUS, HUNTER_SPAWN_MAX_RADIUS);
        if (!pos) continue;
        const level = Math.round(lvHi + (lvHi - lvLo) * 0.5 * rng()); // tough: top of band or above
        const spec = makeEnemySpawnSpec('patrol_lawman', clamp(level, lvLo, lvHi + 2), pos, { startedTick: this.state.tick });
        tagAiSpawnContext(spec, sector, sec, 'bounty_hunter');
        const ent = this.helpers.spawnEntity(spec);
        if (!ent) continue;
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, hunterRequester);
        this._stampHomeSector(ent, sector.id);
        this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, 'patrol_lawman:hunter', active);
        active.enemies.push(ent.id);
        huntersSpawned++;
      }
      if (budget && typeof budget.releaseSome === 'function' && huntersSpawned < hunterGrant) {
        budget.releaseSome(hunterRequester, hunterGrant - huntersSpawned);
      }
    }
  },

  /**
   * Stamp a stable worldRecordId at first spawn so demote/promote never re-keys identity.
   * Does not write the bag yet — capture happens on demote/strip.
   */
  _assignDurableRecordId(ent, sectorId, kind, keyHint, active) {
    if (!ent || !ent.data) return null;
    if (ent.data.worldRecordId) return ent.data.worldRecordId;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const seq = (active && (active._durableSeq = (active._durableSeq || 0) + 1)) || 0;
    const qx = ent.pos ? Math.round(ent.pos.x / 4) * 4 : 0;
    const qz = ent.pos ? Math.round(ent.pos.z / 4) * 4 : 0;
    const key = `${keyHint || ent.type || 'e'}:${seq}:${qx}:${qz}`;
    const recordId = stableRecordId(seed, sectorId, kind || RECORD_KIND.NPC, key);
    ent.data.worldRecordId = recordId;
    ent.data.identityKey = key;
    ent.data.recordCreatedTick = this.state.tick | 0;
    return recordId;
  },

  // Boss encounter (V2 § frontier capstone): a sector authored with a `poi_boss` POI hosts the
  // dreadnought 'Iron Maw' (dreadnought_boss). The marquee T4 fight was previously authored in
  // data + render but had NO spawn call site — invisible to players. It spawns once per sector
  // entry and stays defeated (tracked in the deterministic discovery overlay) once killed, so
  // re-entering the sector or reloading a save does not respawn it. Position is offset from the
  // boss POI marker so the fight reads as "at the arena signal", not on top of the entry point.
  _spawnBossIfDue(sector, active, rng) {
    const bossPoi = (sector.pois || []).find((p) => p.type === 'anomaly' && p.id === 'poi_boss');
    if (!bossPoi) return;
    const disc = this._discoveryFor(sector.id);
    if (!disc.pois) disc.pois = {};
    const rec = disc.pois[bossPoi.id] || (disc.pois[bossPoi.id] = { discovered: false, identified: false });
    if (rec.bossDefeated) return; // already beaten this save — don't respawn
    const liveBoss = active && active.boss && this.state.entities.get(active.boss.entityId);
    if (liveBoss && liveBoss.alive !== false) return liveBoss;
    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = `world:boss:${sector.id}:${bossPoi.id}`;
    if (budget && typeof budget.request === 'function' && budget.request(1, requester) <= 0) {
      if (!rec.bossSpawnDeferred) {
        this.bus.emit('world:criticalSpawnDeferred', {
          kind: 'boss', sectorId: sector.id, poiId: bossPoi.id, reason: 'spawn_cap',
        });
      }
      rec.bossSpawnDeferred = true;
      return null;
    }
    // Place the boss near the POI marker (or a deterministic ring position if the POI is unplaced).
    // Convert sector-local authorship once into galactic-global.
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const local = bossPoi.pos
      ? { x: bossPoi.pos.x, z: bossPoi.pos.z }
      : (() => { const ang = rng() * Math.PI * 2, r = wr * 0.45; return { x: Math.cos(ang) * r, z: Math.sin(ang) * r }; })();
    const pos = this._toGlobal(local, sector.id);
    const [lvLo, lvHi] = sector.enemyLevel || [10, 15];
    const level = clamp(lvHi, lvLo, 15);
    const spec = makeEnemySpawnSpec('dreadnought_boss', level, pos, { startedTick: this.state.tick });
    spec.data = spec.data || {};
    spec.data.isBoss = true;          // flag so the kill handler can find this entity cheaply
    spec.data.bossPoiId = bossPoi.id; // links back to the discovery record to mark defeated
    spec.data.bossSectorId = sector.id;
    let ent = null;
    try {
      ent = this.helpers.spawnEntity(spec);
    } catch (error) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      throw error;
    }
    if (!ent) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return null;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
    delete rec.bossSpawnDeferred;
    this._stampHomeSector(ent, sector.id);
    this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, `boss:${bossPoi.id}`, active);
    active.enemies.push(ent.id);
    active.boss = { entityId: ent.id, poiId: bossPoi.id };
    return ent;
  },

  _enemyPool(sector) {
    if (sector.security >= 0.6) return LAWFUL_ENEMIES;
    if (sector.tier >= 3) return FRONTIER_ENEMIES;
    return PIRATE_ENEMIES;
  },

  _ambientEnemySpawnPos(sector, active, rng, wr) {
    for (let attempt = 0; attempt < AMBIENT_SPAWN_ATTEMPTS; attempt++) {
      const ang = rng() * Math.PI * 2;
      const r = wr * (0.3 + rng() * 0.5);
      // Ring math is sector-local; convert once around the sector's global origin.
      const pos = this._toGlobal({ x: Math.cos(ang) * r, z: Math.sin(ang) * r }, sector.id);
      if (this._ambientSpawnIsSafe(pos, sector, active)) return pos;
    }
    return null;
  },

  _ambientSpawnIsSafe(pos, sector, active) {
    const starterSafe = starterSafeRadius(sector);
    if (starterSafe > 0 && dist2(pos, this._sectorOrigin(sector.id)) < starterSafe * starterSafe) return false;
    for (const st of (active && active.stations) || []) {
      const radius = stationSafeRadius(st);
      if (st && st.pos && dist2(pos, st.pos) < radius * radius) return false;
    }
    for (const gate of (active && active.gates) || []) {
      if (gate && gate.pos && dist2(pos, gate.pos) < GATE_SAFE_RADIUS * GATE_SAFE_RADIUS) return false;
    }
    return true;
  },

  _directHostileSpawnPos(sector, active, rng, origin, minRadius, maxRadius) {
    const o = origin || { x: 0, z: 0 };
    const lo = Math.max(1, minRadius || AMBUSH_SPAWN_MIN_RADIUS);
    const hi = Math.max(lo + 1, maxRadius || AMBUSH_SPAWN_MAX_RADIUS);
    for (let attempt = 0; attempt < DIRECT_HOSTILE_SPAWN_ATTEMPTS; attempt++) {
      const ang = rng() * Math.PI * 2;
      const r = lo + rng() * (hi - lo);
      const pos = { x: o.x + Math.cos(ang) * r, z: o.z + Math.sin(ang) * r };
      if (this._directHostileSpawnIsSafe(pos, sector, active, lo)) return pos;
    }
    return null;
  },

  _directHostileSpawnIsSafe(pos, sector, active, minPlayerRadius) {
    if (!this._ambientSpawnIsSafe(pos, sector, active)) return false;
    const player = this.state.entities.get(this.state.playerId);
    if (player && player.pos) {
      const safe = Math.max(1, minPlayerRadius || AMBUSH_SPAWN_MIN_RADIUS);
      if (dist2(pos, player.pos) < safe * safe) return false;
    }
    return true;
  },

  _playerInNoHostileSpawnZone(sector, active, player) {
    if (!player || !player.pos) return false;
    if (this._playerInPortNoHostileSpawnZone(active, player)) return true;
    const starterSafe = starterSafeRadius(sector);
    if (starterSafe > 0 && dist2(player.pos, this._sectorOrigin(sector.id)) < starterSafe * starterSafe) return true;
    return false;
  },

  _playerInPortNoHostileSpawnZone(active, player) {
    if (!player || !player.pos) return false;
    if (this._playerDockedNoHostileSpawnZone(player)) return true;
    for (const st of (active && active.stations) || []) {
      const radius = stationSafeRadius(st);
      if (st && st.pos && dist2(player.pos, st.pos) < radius * radius) return true;
    }
    for (const gate of (active && active.gates) || []) {
      if (gate && gate.pos && dist2(player.pos, gate.pos) < GATE_SAFE_RADIUS * GATE_SAFE_RADIUS) return true;
    }
    return false;
  },

  _playerDockedNoHostileSpawnZone(player) {
    if (player && player.flags && player.flags.docked) return true;
    return !!(this.state.ui && this.state.ui.docked === true);
  },

  // --- entry point + player placement -------------------------------------------------------
  // Returns galactic-global entry coordinates for the target sector (heading is sector-local-facing).
  _entryPointFor(sector, fromSectorId, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    if (fromSectorId && (sector.neighbors || []).includes(fromSectorId)) {
      // arrive near the gate back to where we came from, facing inward
      const ang = this._bearingTo(sector, safeSector(this.state, fromSectorId), rng);
      const r = wr * 0.78;
      const lx = Math.cos(ang) * r, lz = Math.sin(ang) * r;
      const heading = Math.atan2(-lz, -lx); // face sector origin
      const global = this._toGlobal({ x: lx, z: lz }, sector.id);
      return { x: global.x, z: global.z, heading };
    }
    // first/home spawn: near the sector's galactic origin
    const origin = this._sectorOrigin(sector.id);
    return { x: origin.x, z: origin.z, heading: 0 };
  },

  _placePlayer(entryPoint) {
    return applySameSectorPlayerRelocation(this.state, entryPoint);
  },

  /** Public same-sector relocation seam for authored incidents; never changes sector membership. */
  relocatePlayerInSector(entryPoint, { reason = 'system' } = {}) {
    const moved = applySameSectorPlayerRelocation(this.state, entryPoint);
    if (moved && this.bus) {
      this.bus.emit('world:playerRelocated', {
        sectorId: this.state.world && this.state.world.currentSectorId || null,
        pos: { x: entryPoint.x, z: entryPoint.z },
        reason,
        tick: this.state.tick | 0,
      });
    }
    return moved;
  },

  // Map-space bearing from one sector node to another (their static map positions), + jitter.
  _bearingTo(from, to, rng) {
    if (from && to && from.position && to.position) {
      const dx = (to.position.x - from.position.x);
      const dz = (to.position.y - from.position.y); // map 'y' is the planar z axis
      const a = Math.atan2(dz, dx);
      return a + (rng ? (rng() - 0.5) * 0.3 : 0);
    }
    return (rng ? rng() : 0.5) * Math.PI * 2;
  },

  _discoveryFor(sectorId) {
    const d = this.state.world.discovery;
    if (!d[sectorId]) d[sectorId] = { discovered: false, visitedCount: 0, pois: {}, fieldsDepleted: {} };
    if (!d[sectorId].pois) d[sectorId].pois = {};
    if (!d[sectorId].fieldsDepleted) d[sectorId].fieldsDepleted = {};
    return d[sectorId];
  },

  _seedChartedDiscovery() {
    for (const sector of SECTORS) {
      const rec = this._discoveryFor(sector.id);
      if (sector.charted === true) {
        rec.discovered = true;
        if (!rec.source) rec.source = 'charted';
      }
    }
  },

  _onPurchaseSurveyData({ sectorId, stationId }) {
    const sector = SECTOR_BY_ID.get(sectorId);
    if (!sector || sector.charted === true) return false;
    const stationSectorId = STATION_SECTOR_ID.get(stationId) || this.state.world.currentSectorId;
    const stationSector = stationSectorId && (this.state.world.sectors[stationSectorId] || SECTOR_BY_ID.get(stationSectorId));
    if (!stationSector || !(stationSector.neighbors || []).includes(sectorId)) return false;

    const disc = this._discoveryFor(sectorId);
    if (disc.discovered) {
      this.bus.emit('toast', { text: `${sector.name} is already charted`, kind: 'info', ttl: 3 });
      return true;
    }

    const price = surveyDataPrice(sector);
    const credits = (this.state.player && this.state.player.credits) | 0;
    if (credits < price) {
      this.bus.emit('toast', { text: `Survey data costs ${price.toLocaleString('en-US')} CR`, kind: 'warn', ttl: 3 });
      return false;
    }

    this.bus.emit('economy:chargeCredits', { amount: price, reason: `survey:${sectorId}` });
    disc.discovered = true;
    disc.source = 'survey';
    disc.surveyedAt = this.state.simTime || 0;
    this.bus.emit('map:sectorCharted', { sectorId, source: 'survey' });
    this.bus.emit('toast', { text: `Survey data added: ${sector.name}`, kind: 'info', ttl: 3.5 });
    return true;
  },

  _frontierRumorState() {
    const normalized = normalizeFrontierRumorState(this.state.world.frontierRumors);
    this.state.world.frontierRumors = normalized;
    return normalized;
  },

  _onPurchaseFrontierRumor({ rumorId, stationId }) {
    const offer = frontierRumorPurchaseOffer(this.state, stationId, rumorId);
    if (!offer) {
      this.bus.emit('toast', { text: 'That rumor card is no longer available', kind: 'warn', ttl: 3 });
      return false;
    }
    return this._acquireFrontierRumor(offer, { charge: true });
  },

  _onSensorPostRumor({ bodyId }) {
    const bodies = this.state.claims && this.state.claims.bodies;
    const body = Array.isArray(bodies)
      ? bodies.find((row) => row && row.id === bodyId && row.owned !== false
        && Array.isArray(row.modules) && row.modules.includes('mod_sensor_post'))
      : null;
    if (!body) return false;
    return this._acquireFrontierRumor(sensorPostRumorOffer(this.state, body), { charge: false });
  },

  _acquireFrontierRumor(offer, { charge = false } = {}) {
    if (!offer) return false;
    const own = this._frontierRumorState();
    if (own.byId[offer.id]) return true;
    if (charge) {
      const credits = Math.max(0, Math.floor(Number(this.state.player && this.state.player.credits) || 0));
      if (credits < offer.price) {
        this.bus.emit('toast', { text: `Rumor card costs ${offer.price.toLocaleString('en-US')} CR`, kind: 'warn', ttl: 3 });
        return false;
      }
      this.bus.emit('economy:chargeCredits', { amount: offer.price, reason: `frontier-rumor:${offer.id}` });
    }

    const record = {
      ...offer,
      heardAt: Math.max(0, Number(this.state.simTime) || 0),
      phase: 'rumored',
    };
    own.byId[record.id] = record;
    const receipt = {
      type: charge ? 'purchased' : 'generated',
      rumorId: record.id,
      kind: record.kind,
      sectorId: record.sectorId,
      source: record.source,
      t: record.heardAt,
    };
    own.receipts.push(receipt);
    while (own.receipts.length > FRONTIER_RUMOR_RECEIPT_LIMIT) own.receipts.shift();
    this.bus.emit('frontierRumor:acquired', { ...record, bearingCenter: { ...record.bearingCenter } });
    const sourceLabel = record.source === 'sensor_post' ? 'Sensor Post intel' : record.kindLabel;
    this.bus.emit('toast', { text: `${sourceLabel} added · approximate search only`, kind: 'info', ttl: 4 });
    return true;
  },

  _resolveFrontierRumors(predicate, reason) {
    const own = this._frontierRumorState();
    let resolved = 0;
    for (const record of Object.values(own.byId)) {
      if (!record || record.phase !== 'rumored' || !predicate(record)) continue;
      record.phase = 'resolved';
      record.resolvedAt = Math.max(0, Number(this.state.simTime) || 0);
      record.resolution = reason;
      const receipt = { type: 'resolved', rumorId: record.id, kind: record.kind, sectorId: record.sectorId, reason, t: record.resolvedAt };
      own.receipts.push(receipt);
      while (own.receipts.length > FRONTIER_RUMOR_RECEIPT_LIMIT) own.receipts.shift();
      this.bus.emit('frontierRumor:resolved', { ...receipt });
      this.bus.emit('toast', { text: `Rumor confirmed · ${record.kindLabel}`, kind: 'good', ttl: 3.5 });
      resolved++;
    }
    return resolved;
  },

  _onFrontierRumorPoi(payload) {
    const poiId = String(payload.poiId || '').trim();
    if (!poiId) return 0;
    const sectorId = payload.sectorId || this.state.world.currentSectorId;
    return this._resolveFrontierRumors(
      (record) => (record.kind === 'anomaly' || record.kind === 'cache')
        && record.id !== TETHYS_BLACK_MARKET_DISCOVERY.rumorId
        && record.targetId === poiId
        && (!sectorId || record.sectorId === sectorId),
      'poi_found',
    );
  },

  _onFrontierRumorPlanned(payload) {
    if (payload.source !== 'encounter_whisper'
      || !payload.id || !payload.targetId || !payload.targetShapeId
      || payload.phase !== 'rumored') return false;
    return this._acquireFrontierRumor(payload, { charge: false });
  },

  _onFrontierRumorEncounter(payload) {
    const sectorId = payload.sectorId || this.state.world.currentSectorId;
    if (!sectorId) return 0;
    let resolved = 0;
    if (payload.encounterId) {
      resolved += this._resolveFrontierRumors(
        (record) => record.source === 'encounter_whisper'
          && record.targetId === payload.encounterId
          && record.targetShapeId === payload.kind
          && record.sectorId === sectorId,
        'rare_contact',
      );
    }
    if (payload.kind === 'bounty_hunter' || payload.kind === 'named_hunter') {
      resolved += this._resolveFrontierRumors(
        (record) => record.kind === 'hunter' && record.sectorId === sectorId,
        'hunter_contact',
      );
    }
    return resolved;
  },

  _onBountyRumorContact(payload) {
    const missionId = String(payload.missionId || '').trim();
    if (!missionId) return 0;
    return this._resolveFrontierRumors(
      (record) => record.kind === 'hunter'
        && String(record.targetMissionId || '') === missionId
        && (!payload.sectorId || record.sectorId === payload.sectorId),
      'warrant_target_contact',
    );
  },

  // =========================================================================================
  // per-tick update: jump state machine, fuel, hazards, POI scan, cooldown
  // =========================================================================================
  update(dt, state) {
    if (state.mode !== 'flight') return;
    const jump = state.jump;

    if (jump.cooldownT > 0) {
      jump.cooldownT = Math.max(0, jump.cooldownT - dt);
      if (jump.cooldownT === 0 && jump.state === 'COOLDOWN') jump.state = 'IDLE';
    }

    switch (jump.state) {
      case 'CHARGING': this._tickCharging(dt, state); break;
      case 'JUMPING':  this._tickJumping(dt, state); break;
      default: break;
    }

    this._tickFrameOrigin(state);
    this._tickResidency(state);
    this._tickCometIce(state);
    this._tickDeferredCriticalSpawns(state);
    this._tickScan(dt, state);
    this._tickHazards(dt, state);
    this._tickZoneLabel(state);
    this._tickPOIScan(state);
  },

  _tickDeferredCriticalSpawns(state) {
    if ((state.tick | 0) < (this._nextCriticalSpawnTick | 0)) return;
    this._nextCriticalSpawnTick = (state.tick | 0) + CRITICAL_SPAWN_RETRY_TICKS;
    const sectorId = state.world && state.world.currentSectorId;
    const active = state.world && state.world.activeSector;
    const sector = sectorId && (state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId));
    if (!sector || !active) return;
    const bossPoi = (sector.pois || []).find((p) => p.type === 'anomaly' && p.id === 'poi_boss');
    const discovery = bossPoi && this._discoveryFor(sectorId).pois;
    if (!bossPoi || !discovery || !discovery[bossPoi.id]?.bossSpawnDeferred) return;
    const resident = state.world.residentSectors && state.world.residentSectors[sectorId];
    if (!resident || resident.tier !== RESIDENCY_TIER.FULL) return;
    const epoch = Number.isFinite(resident.epoch) ? resident.epoch : 0;
    const rng = this.helpers.mulberry32(this.helpers.hash32(
      state.meta.seed, sectorId, epoch, 'deferred_boss',
    ));
    this._spawnBossIfDue(sector, active, rng);
  },

  // Floating origin owner: derive a snapped frame from the player global position.
  // On an actual change, mutate only world.frameOrigin / frameOriginSeq and emit a receipt.
  // No-shift path reuses scratch and allocates nothing per tick.
  _tickFrameOrigin(state) {
    const player = state.entities.get(state.playerId);
    if (!player || !player.pos) return;
    const world = state.world;
    if (!world.frameOrigin || typeof world.frameOrigin !== 'object') {
      world.frameOrigin = { x: 0, z: 0 };
    }
    const scratch = this._frameOriginScratch || (this._frameOriginScratch = { x: 0, z: 0 });
    const next = deriveFrameOrigin(player.pos, world.frameOrigin, scratch);
    const cur = world.frameOrigin;
    if (cur.x === next.x && cur.z === next.z) return;

    const prevX = cur.x;
    const prevZ = cur.z;
    if (!applyFrameOrigin(state, next)) return;
    // Shift path only: allocate a deterministic receipt payload.
    this.bus.emit('world:originShift', {
      previous: { x: prevX, z: prevZ },
      next: { x: cur.x, z: cur.z },
      seq: world.frameOriginSeq,
    });
  },

  // Named-zone awareness (WORLD_OVERHAUL_2_1): announce when the player crosses into a named zone so
  // the world reads as inhabited/territorial ("⟢ Belt-Shadow Ambush") instead of anonymous space.
  // Also publishes state.world.currentZone for the HUD/map to label the player's surroundings.
  _tickZoneLabel(state) {
    const player = state.entities.get(state.playerId);
    if (!player || !player.pos) return;
    const sectorId = state.world.currentSectorId;
    // Named zones are authored sector-local; convert the player global focus into local for the lookup.
    const origin = this._sectorOrigin(sectorId);
    const zone = zoneAt(sectorId, player.pos.x - origin.x, player.pos.z - origin.z);
    const prevId = state.world.currentZoneId || null;
    const nextId = zone ? zone.id : null;
    if (nextId === prevId) return;
    state.world.currentZoneId = nextId;
    state.world.currentZone = zone
      ? { id: zone.id, name: zone.name, type: zone.type, factionId: zone.factionId, threat: zoneThreat(zone) }
      : null;
    if (zone) {
      const threat = zoneThreat(zone);
      const kind = threat >= 3 ? 'danger' : (threat >= 2 ? 'warn' : 'info');
      this.bus.emit('world:zoneEntered', { zoneId: zone.id, name: zone.name, type: zone.type, factionId: zone.factionId, threat, reason: zone.reason });
      this.bus.emit('toast', { text: `⟢ ${zone.name}`, kind, ttl: 2.5 });
    } else {
      this.bus.emit('world:zoneExited', { zoneId: prevId });
    }
  },

  // --- jump: CHARGING --------------------------------------------------------
  _tickCharging(dt, state) {
    const jump = state.jump;
    const drive = this._activeDrive();
    if (jump.via === 'drive' && this._combatLock && !drive.hotJump) {
      this._abortCharge('combat_lock');
      return;
    }
    // Choice C starts at a real drive seam, but the charge cannot run underneath its Yes/No
    // prompt. Confirmation releases the ordinary charge state machine; decline aborts it.
    if (jump._unfiled === true && jump._unfiledConfirmed !== true) return;
    jump.chargeT += dt;
    const tickPayload = { progress: clamp(jump.chargeT / Math.max(0.01, jump.chargeNeeded), 0, 1) };
    if (jump._unfiled === true) tickPayload.unfiled = true;
    this.bus.emit('jump:chargeTick', tickPayload);
    if (jump.chargeT >= jump.chargeNeeded) {
      // consume fuel now (charge complete)
      this._spendFuel(jump._fuelCost || 0);
      jump.state = 'JUMPING';
      jump.chargeT = 0;
      jump._jumpT = 0;
      const player = state.entities.get(state.playerId);
      const fromPos = player ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
      const startPayload = { from: state.world.currentSectorId, to: jump.targetSectorId, via: jump.via, fromPos };
      if (jump._unfiled === true) startPayload.unfiled = true;
      this.bus.emit('jump:start', startPayload);
    }
  },

  // --- jump: JUMPING (brief tunnel) → arrive --------------------------------
  _tickJumping(dt, state) {
    const jump = state.jump;
    jump._jumpT = (jump._jumpT || 0) + dt;
    if (jump._jumpT < JUMPING_DURATION) return;

    const target = jump.targetSectorId;
    const via = jump.via;
    const unfiled = jump._unfiled === true;
    const fromSectorId = state.world.currentSectorId;
    const sector = state.world.sectors[target] || SECTOR_BY_ID.get(target);
    const drive = this._activeDrive();

    // Roll interdiction (drive only) BEFORE we re-seed in enterSector, using the core sim RNG.
    let interdicted = false, ambushCount = 0;
    if (via === 'drive') {
      const chance = this._interdictChance(sector, via, drive);
      interdicted = state.rng() < chance;
    }

    // Intentional jump: residency plan + place player at target entry. Does not global-wipe
    // other bounded residents (scoped demote/evict only when over the materialization cap).
    this.enterSector(target, { fromJump: true, via, fromSectorId });

    if (via === 'drive' && interdicted) {
      const tier = sector ? sector.tier : 0;
      const requestedAmbushCount = 1 + Math.floor(state.rng() * (1 + tier));
      ambushCount = this._spawnAmbush(sector, requestedAmbushCount).length;
    }

    const player = state.entities.get(state.playerId);
    const toPos = player ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    const arrivePayload = { sectorId: target, interdicted, ambushCount, toPos };
    if (unfiled) arrivePayload.unfiled = true;
    this.bus.emit('jump:arrive', arrivePayload);

    jump.state = via === 'gate' ? (GATE_COOLDOWN > 0 ? 'COOLDOWN' : 'IDLE') : 'COOLDOWN';
    jump.cooldownT = via === 'gate'
      ? GATE_COOLDOWN
      : DRIVE_COOLDOWN * driveCooldownMultiplier(state.player);
    jump.targetSectorId = null;
    jump.via = null;
    jump.chargeNeeded = 0;
    jump._fuelCost = 0;
    jump._unfiled = false;
    jump._unfiledConfirmed = false;
  },

  _spawnAmbush(sector, count, origin = null, enemyTypeId = null, requestMeta = null) {
    if (!sector || count <= 0) return [];
    const player = this.state.entities.get(this.state.playerId);
    const active = this.state.world.activeSector || null;
    if (this._playerDockedNoHostileSpawnZone(player)) return [];
    const px = origin ? origin.x : (player ? player.pos.x : 0);
    const pz = origin ? origin.z : (player ? player.pos.z : 0);
    const pool = this._enemyPool(sector);
    const rng = this.state.world.rng || this.state.rng;
    const [lvLo, lvHi] = sector.enemyLevel || [1, 2];
    const budget = this.helpers && this.helpers.spawnBudget;
    const source = requestMeta ? 'spawn-request' : 'interdiction';
    const requestIdentity = requestMeta && requestMeta.refId
      ? requestMeta.refId
      : `${sector.id}:${this.state.tick | 0}`;
    const requester = `world:${source}:${requestIdentity}`;
    const grant = budget && typeof budget.request === 'function'
      ? budget.request(count, requester)
      : count;
    if (grant <= 0) return [];
    const placed = [];
    try {
      for (let i = 0; i < grant; i++) {
        const typeId = enemyTypeId || pool[Math.floor(rng() * pool.length)];
        const level = Math.round(lvLo + (lvHi - lvLo) * 0.6);
        const pos = this._directHostileSpawnPos(sector, active, rng, { x: px, z: pz }, AMBUSH_SPAWN_MIN_RADIUS, AMBUSH_SPAWN_MAX_RADIUS);
        if (!pos) continue;
        const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos, { startedTick: this.state.tick });
        tagAiSpawnContext(spec, sector, sector, origin ? 'spawn_request' : 'interdiction');
        if (requestMeta && requestMeta.refId) spec.data.spawnRefId = requestMeta.refId;
        if (requestMeta && requestMeta.tags && requestMeta.tags.length) spec.data.spawnTags = [...requestMeta.tags];
        const ent = this.helpers.spawnEntity(spec);
        if (!ent || ent.id == null) continue;
        if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(ent.id, requester);
        this._stampHomeSector(ent, sector.id);
        placed.push(ent.id);
        // Commit each successful entity immediately so a later spawn failure cannot orphan it.
        if (active && Array.isArray(active.enemies)) active.enemies.push(ent.id);
      }
    } finally {
      if (budget && typeof budget.releaseSome === 'function' && placed.length < grant) {
        budget.releaseSome(requester, grant - placed.length);
      }
    }
    if (!placed.length) return [];
    this.bus.emit('interdiction:triggered', {
      sectorId: sector.id,
      ambushCount: placed.length,
      spawnPos: { x: px, z: pz },
      entityIds: placed,
      refId: requestMeta && requestMeta.refId || null,
      tags: requestMeta && requestMeta.tags ? [...requestMeta.tags] : [],
    });
    return placed;
  },

  _onSpawnRequest(p) {
    const req = this._normalizeSpawnRequest(p);
    if (!req) return false;
    const sector = this.state.world.sectors[req.sectorId] || SECTOR_BY_ID.get(req.sectorId);
    if (!sector) return false;
    if (req.sectorId !== this.state.world.currentSectorId || !this.state.world.activeSector) {
      this._queueSpawnRequest(req);
      return true;
    }
    this._spawnFromRequest(req, sector);
    return true;
  },

  _normalizeSpawnRequest(p) {
    const tags = Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string') : [];
    const entityType = p.entityType || p.type;
    if (entityType !== 'pirate') return null;
    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
    if (!sectorId) return null;
    const pos = p.position && Number.isFinite(p.position.x) && Number.isFinite(p.position.z)
      ? { x: p.position.x, z: p.position.z }
      : null;
    const rawCount = p.count != null ? p.count : (p.ambushCount != null ? p.ambushCount : 1);
    return {
      entityType: 'pirate',
      sectorId,
      position: pos,
      tags,
      refId: p.refId || null,
      enemyTypeId: typeof p.enemyTypeId === 'string' && p.enemyTypeId ? p.enemyTypeId : null,
      count: clamp(Math.floor(rawCount) || 1, 1, 6),
    };
  },

  _queueSpawnRequest(req) {
    const world = this.state.world;
    if (!world.pendingSpawns || typeof world.pendingSpawns !== 'object') world.pendingSpawns = {};
    const list = world.pendingSpawns[req.sectorId] || (world.pendingSpawns[req.sectorId] = []);
    list.push(req);
  },

  _flushPendingSpawns(sectorId, sector) {
    const pending = this.state.world.pendingSpawns;
    const list = pending && pending[sectorId];
    if (!list || !list.length) return;
    delete pending[sectorId];
    for (const raw of list) {
      const req = this._normalizeSpawnRequest(raw);
      if (req) this._spawnFromRequest(req, sector);
    }
  },

  _spawnFromRequest(req, sector) {
    if (!req || req.entityType !== 'pirate') return;
    this._spawnAmbush(sector, req.count || 1, req.position || null, req.enemyTypeId || null, req);
  },

  // =========================================================================================
  // jump request validation + start (handles world:requestJump)
  // =========================================================================================
  _onRequestJump({ targetSectorId, via }) {
    const state = this.state;
    const jump = state.jump;
    const cur = state.world.currentSectorId;
    const sector = state.world.sectors[cur] || SECTOR_BY_ID.get(cur);
    const target = state.world.sectors[targetSectorId] || SECTOR_BY_ID.get(targetSectorId);

    const reject = (reason) => this.bus.emit('jump:chargeAbort', { reason });

    if (!target) return reject('unknown_target');
    if (jump.state !== 'IDLE') return reject('busy');
    if (jump.cooldownT > 0) return reject('cooldown');

    // must be a graph neighbor (or the wormhole edge if unlocked)
    const isNeighbor = !!(sector && (sector.neighbors || []).includes(targetSectorId));
    const isWormhole = !!(sector && sector.wormholeTo && sector.wormholeTo.sectorId === targetSectorId);
    if (!isNeighbor && !isWormhole) return reject('not_a_neighbor');
    if (isWormhole && !this._wormholeUnlocked(sector)) return reject('wormhole_locked');

    via = (via === 'gate' || via === 'drive') ? via : 'gate';
    const drive = this._activeDrive();
    if (via === 'drive' && !this._hasDrive()) return reject('no_drive');

    // combat lock blocks the start unless a hot-jump drive
    if (this._combatLock && !(via === 'drive' && drive.hotJump)) return reject('combat_lock');

    const edgeDist = this._edgeDist(sector, target);
    const fuelCost = via === 'gate' ? 0 : Math.ceil(BASE_FUEL * edgeDist * drive.tierFuelMult);
    if (via === 'drive' && state.fuel.current < fuelCost) return reject('low_fuel');

    // Gate toll (high-sec customs) is validated before the departure preflight, but charged only
    // after it. Contextual story choices may defer a valid departure without consuming credits or
    // entering the jump state machine.
    let gateToll = 0;
    if (via === 'gate') {
      gateToll = this._gateToll(target);
      if (gateToll > 0 && ((state.player && state.player.credits) | 0) < gateToll) return reject('credits');
    }

    const preflight = { targetSectorId, via, deferred: false };
    this.bus.emit('jump:departurePreflight', preflight);
    if (preflight.deferred === true) return;

    if (gateToll > 0) {
      this.bus.emit('economy:chargeCredits', { amount: gateToll, reason: 'gate_toll' });
    }

    const chargeNeeded = via === 'gate' ? GATE_CHARGE : drive.baseCharge * (edgeDist / 4);
    jump.state = 'CHARGING';
    jump.targetSectorId = targetSectorId;
    jump.via = via;
    jump.chargeT = 0;
    jump.chargeNeeded = chargeNeeded;
    jump._fuelCost = fuelCost;
    jump._unfiled = false;
    jump._unfiledConfirmed = false;
    this.bus.emit('jump:chargeStart', { targetSectorId, via, chargeNeeded });
  },

  /**
   * Choice C's explicit, destinationless Ashfall drive charge. The hidden return target is only
   * world-owned transition plumbing; presentation and story receive targetSectorId:null until the
   * normal tunnel commits. The charge remains at zero until the player confirms the prompt.
   */
  _onRequestUnfiledJump() {
    const state = this.state;
    const jump = state.jump;
    const currentId = state.world.currentSectorId;
    const source = state.world.sectors[currentId] || SECTOR_BY_ID.get(currentId);
    const target = state.world.sectors[UNFILED_JUMP_RETURN] || SECTOR_BY_ID.get(UNFILED_JUMP_RETURN);
    const reject = (reason) => {
      this.bus.emit('jump:chargeAbort', { reason, unfiled: true });
      return false;
    };

    if (currentId !== UNFILED_JUMP_ORIGIN) return reject('unfiled_wrong_sector');
    if (!source || !target) return reject('unfiled_route_missing');
    if (jump.state !== 'IDLE') return reject('busy');
    if (jump.cooldownT > 0) return reject('cooldown');
    if (!this._hasDrive()) return reject('no_drive');

    const drive = this._activeDrive();
    if (this._combatLock && !drive.hotJump) return reject('combat_lock');
    const edgeDist = this._edgeDist(source, target);
    const fuelCost = Math.ceil(BASE_FUEL * edgeDist * drive.tierFuelMult);
    if (state.fuel.current < fuelCost) return reject('low_fuel');

    jump.state = 'CHARGING';
    jump.targetSectorId = UNFILED_JUMP_RETURN;
    jump.via = 'drive';
    jump.chargeT = 0;
    jump.chargeNeeded = drive.baseCharge * (edgeDist / 4);
    jump._fuelCost = fuelCost;
    jump._unfiled = true;
    jump._unfiledConfirmed = false;
    this.bus.emit('jump:chargeStart', {
      targetSectorId: null,
      via: 'drive',
      chargeNeeded: jump.chargeNeeded,
      unfiled: true,
    });
    return true;
  },

  _confirmUnfiledJump() {
    const jump = this.state && this.state.jump;
    if (!jump || jump.state !== 'CHARGING' || jump._unfiled !== true) return false;
    if (this.state.fuel.current < (jump._fuelCost || 0)) {
      this._abortCharge('low_fuel');
      return false;
    }
    jump._unfiledConfirmed = true;
    this.bus.emit('jump:unfiledConfirmed', { returnSectorId: UNFILED_JUMP_RETURN });
    return true;
  },

  _abortCharge(reason) {
    const jump = this.state.jump;
    if (jump.state !== 'CHARGING') return;
    // Fuel isn't spent until completion; refund half as goodwill to the tank (capped at max).
    if (jump.via === 'drive' && jump._fuelCost && jump._unfiled !== true) {
      this._addFuel((jump._fuelCost * FUEL_REFUND_FRAC) | 0);
    }
    jump.state = 'IDLE';
    jump.targetSectorId = null; jump.via = null;
    jump.chargeT = 0; jump.chargeNeeded = 0; jump._fuelCost = 0;
    const unfiled = jump._unfiled === true;
    jump._unfiled = false; jump._unfiledConfirmed = false;
    this.bus.emit('jump:chargeAbort', { reason, ...(unfiled ? { unfiled: true } : {}) });
  },

  // =========================================================================================
  // route planning (Dijkstra) — handles world:requestRoute / ui:setCourse
  // =========================================================================================
  _onRequestRoute({ targetSectorId, mode }) {
    const route = this.computeRoute(targetSectorId, mode || 'fuel');
    this.state.nav.route = route;
    return route;
  },

  _armLocalCourse(payload) {
    const course = payload;
    if (!course || !course.pos) return null;
    const nav = this.state.nav;
    nav.route = null;
    nav.autoTravel = false;
    nav.waypoint = {
      kind: course.kind,
      label: course.label,
      reason: course.reason,
      pos: { x: course.pos.x, z: course.pos.z },
    };
    if (course.targetEntityId != null) nav.waypoint.targetEntityId = course.targetEntityId;
    if (course.targetSectorId) nav.waypoint.targetSectorId = course.targetSectorId;
    this.state.nav.autopilot = {
      active: payload.autopilot !== false,
      target: { x: course.pos.x, z: course.pos.z },
      targetEntityId: course.targetEntityId,
      label: course.label,
      arrivalRadius: course.arrivalRadius,
      status: 'armed',
    };
    this.bus.emit('nav:waypoint', nav.waypoint);
    this.bus.emit('nav:autopilot', this.state.nav.autopilot);
    return this.state.nav.autopilot;
  },

  _onAutopilotStopped(payload = {}) {
    const nav = this.state && this.state.nav;
    if (!nav) return null;
    if (payload.reason !== 'arrived') {
      if (Array.isArray(nav.waypointQueue) && nav.waypointQueue.length) {
        delete nav.waypointQueue;
        this.bus.emit('nav:waypointQueue', { waypoints: [], reason: payload.reason || 'interrupted' });
      }
      return null;
    }
    const queue = Array.isArray(nav.waypointQueue) ? nav.waypointQueue : null;
    if (!queue || !queue.length) {
      delete nav.waypointQueue;
      return null;
    }
    const next = queue.shift();
    if (!queue.length) delete nav.waypointQueue;
    const armed = this._armLocalCourse(next);
    this.bus.emit('nav:waypointQueue', {
      waypoints: Array.isArray(nav.waypointQueue) ? nav.waypointQueue.slice() : [],
      reason: 'advanced',
    });
    if (armed) {
      this.bus.emit('toast', {
        text: `Next waypoint: ${next.label}`,
        kind: 'info',
        ttl: 2,
      });
    }
    return armed;
  },

  _onSetCourse(payload = {}) {
    const course = localCourseFromPayload(payload);
    if (course) {
      const nav = this.state.nav;
      if (payload.queue === true && nav.autopilot && nav.autopilot.active === true) {
        const queue = Array.isArray(nav.waypointQueue) ? nav.waypointQueue : [];
        if (queue.length >= LOCAL_WAYPOINT_QUEUE_LIMIT) {
          this.bus.emit('toast', { text: 'Waypoint queue full', kind: 'error', ttl: 2 });
          return { queued: false, reason: 'queue_full', limit: LOCAL_WAYPOINT_QUEUE_LIMIT };
        }
        queue.push(course);
        nav.waypointQueue = queue;
        this.bus.emit('nav:waypointQueue', { waypoints: queue.slice(), reason: 'queued' });
        return { queued: true, index: queue.length, waypoint: course };
      }
      delete nav.waypointQueue;
      return this._armLocalCourse({ ...course, autopilot: payload.autopilot !== false });
    }

    delete this.state.nav.waypointQueue;
    const sectorId = payload.sectorId;
    const route = this.computeRoute(sectorId, 'fuel');
    this.state.nav.route = route;
    this.state.nav.autoTravel = true;
    if (this.state.nav.autopilot) {
      this.state.nav.autopilot.active = false;
      this.state.nav.autopilot.status = route ? 'route-plotted' : 'idle';
    }
    return route;
  },

  /** Dijkstra over discovered edges. Weight = per-leg fuelCost ('fuel') or 1 ('hops'). */
  computeRoute(targetSectorId, mode = 'fuel') {
    const state = this.state;
    const start = state.world.currentSectorId;
    if (!start || !targetSectorId || start === targetSectorId) return null;
    const drive = this._activeDrive();

    const dist = new Map(), prev = new Map();
    const visited = new Set();
    dist.set(start, 0);
    const pq = [start];

    const sectorOf = (id) => state.world.sectors[id] || SECTOR_BY_ID.get(id);
    const isDiscovered = (id) => {
      const d = state.world.discovery[id];
      return id === start || (d && d.discovered);
    };

    while (pq.length) {
      // Pop the smallest-dist node (linear scan; the canonical graph is only 24 nodes).
      let bi = 0;
      for (let i = 1; i < pq.length; i++) {
        if ((dist.get(pq[i]) ?? Infinity) < (dist.get(pq[bi]) ?? Infinity)) bi = i;
      }
      const u = pq.splice(bi, 1)[0];
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === targetSectorId) break;
      const su = sectorOf(u);
      if (!su) continue;
      const neighbors = [...(su.neighbors || [])];
      if (su.wormholeTo && this._wormholeUnlocked(su)) neighbors.push(su.wormholeTo.sectorId);
      for (const v of neighbors) {
        if (!isDiscovered(v) && v !== targetSectorId) continue; // route only through known space
        const sv = sectorOf(v);
        if (!sv) continue;
        const edgeDist = this._edgeDist(su, sv);
        const w = mode === 'hops' ? 1 : Math.ceil(BASE_FUEL * edgeDist * drive.tierFuelMult);
        const alt = (dist.get(u) ?? Infinity) + w;
        if (alt < (dist.get(v) ?? Infinity)) {
          dist.set(v, alt); prev.set(v, u);
          if (!visited.has(v)) pq.push(v);
        }
      }
    }

    if (!prev.has(targetSectorId)) return null;
    // reconstruct
    const nodes = [];
    let cur = targetSectorId;
    while (cur && cur !== start) { nodes.unshift(cur); cur = prev.get(cur); }
    nodes.unshift(start);

    const legs = [];
    let totalFuel = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = sectorOf(nodes[i]), b = sectorOf(nodes[i + 1]);
      const edgeDist = this._edgeDist(a, b);
      const fuel = Math.ceil(BASE_FUEL * edgeDist * drive.tierFuelMult);
      const charge = drive.baseCharge * (edgeDist / 4);
      const interdict = this._interdictChance(b, 'drive', drive);
      legs.push({ from: nodes[i], to: nodes[i + 1], fuel, charge, interdict });
      totalFuel += fuel;
    }
    return { legs, totalFuel, totalHops: legs.length };
  },

  // =========================================================================================
  // sector scan + POI reveal
  // =========================================================================================
  _beginScan() {
    if (this.state.mode !== 'flight') return;
    if (this._scanning) return;
    this._scanning = true;
    this._scanT = 0;
  },

  _tickScan(dt, state) {
    if (!this._scanning) return;
    this._scanT += dt;
    if (this._scanT < SECTOR_SCAN_TIME) return;
    this._scanning = false;
    this._scanT = 0;
    // reveal all stations + fields immediately; mark non-hidden in-range POIs detected.
    const disc = this._discoveryFor(state.world.currentSectorId);
    let revealedPois = 0;
    for (const p of (state.world.activeSector.pois || [])) {
      const rec = disc.pois[p.poiId] || (disc.pois[p.poiId] = { discovered: false, identified: false });
      if (p.hidden) continue; // hidden POIs need close approach, not a sweep
      if (!rec.discovered) { rec.discovered = true; revealedPois++; this.bus.emit('poi:discovered', { poiId: p.poiId, type: p.type }); }
    }
    const stationCount = (state.world.activeSector.stations || []).length;
    const fieldCount = (state.world.activeSector.fields || []).length;
    this.bus.emit('scan:completed', { targetId: null });
    this.bus.emit('toast', {
      text: `Sector scanned: ${stationCount} stations, ${fieldCount} fields, ${revealedPois} POIs`,
      kind: 'info', ttl: 4,
    });
  },

  // continuous proximity reveal: detect/identify POIs the player flies near (design 05 scanReveal)
  _tickPOIScan(state) {
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const disc = this._discoveryFor(state.world.currentSectorId);
    const scannerTier = this._scannerTier();
    for (const p of (state.world.activeSector.pois || [])) {
      const ent = state.entities.get(p.id);
      if (!ent || !ent.alive) continue;
      const rec = disc.pois[p.poiId] || (disc.pois[p.poiId] = { discovered: false, identified: false });
      if (rec.identified) continue;
      // A concealed layer marked this way is an active-scanner verb, never a proximity freebie.
      // `signal:investigated` below is the sole path that turns the return into durable discovery.
      if ((p.requiresActiveScan || ent.data && ent.data.requiresActiveScan) && !rec.investigated) continue;
      if (ent.data && ent.data.requiresTriangulation && !rec.triangulated && !ent.data.anomalyTriangulated) continue;
      const dx = ent.pos.x - player.pos.x, dz = ent.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const sr = ((ent.data && ent.data.scanRange) || SCAN_RANGE) * (1 + 0.25 * scannerTier);
      if (dist <= sr) {
        if (!rec.discovered) { rec.discovered = true; this.bus.emit('poi:discovered', { poiId: p.poiId, type: p.type }); }
        if (dist <= sr * 0.5) {
          const newlyIdentified = !rec.identified;
          rec.identified = true;
          rec.type = p.type || rec.type || null;
          rec.name = ent.data && ent.data.name || rec.name || p.poiId;
          rec.identifiedAt = Number(state.simTime) || 0;
          this.bus.emit('poi:identified', {
            poiId: p.poiId,
            type: p.type,
            name: rec.name,
            sectorId: state.world.currentSectorId,
            reward: (ent.data && ent.data.reward) || null,
          });
          if (newlyIdentified) {
            this.bus.emit('discovery:plateUnlocked', {
              sectorId: state.world.currentSectorId,
              poiId: p.poiId,
              type: p.type,
            });
          }
          this.bus.emit('toast', { text: `POI identified: ${(ent.data && ent.data.name) || p.poiId}`, kind: 'info', ttl: 4 });
        }
      }
    }
  },

  // =========================================================================================
  // hazards + fuel + helpers
  // =========================================================================================
  _tickHazards(dt, state) {
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const zones = state.world.activeSector.hazards || [];
    const inside = this._hazardSet || (this._hazardSet = new Set());
    let nowInside = this._hazardNextSet;
    if (!nowInside || nowInside === inside) nowInside = this._hazardNextSet = new Set();
    nowInside.clear();
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      hazardCenterAt(z, state.simTime, z.center);
      const dx = player.pos.x - z.center.x, dz = player.pos.z - z.center.z;
      if (dx * dx + dz * dz <= z.radius * z.radius) {
        nowInside.add(i);
        if (!inside.has(i)) this.bus.emit('hazard:enter', { entityId: player.id, zoneType: z.type, intensity: z.intensity });
        // radiation drains hull over time (design 05 hazardHullDrain).
        if (z.type === 'radiation') {
          player.hull = Math.max(1, player.hull - z.intensity * 6 * dt);
        }
      }
    }
    for (const i of inside) {
      if (!nowInside.has(i)) {
        const z = zones[i];
        if (z) this.bus.emit('hazard:exit', { entityId: player.id, zoneType: z.type, intensity: z.intensity });
      }
    }
    inside.clear();
    this._hazardSet = nowInside;
    this._hazardNextSet = inside;
  },

  _spendFuel(amount) {
    if (!amount) return;
    const f = this.state.fuel;
    f.current = Math.max(0, f.current - amount);
    this.bus.emit('fuel:changed', { current: f.current, max: f.max });
    if (f.current <= 0) this.bus.emit('fuel:empty', { sectorId: this.state.world.currentSectorId });
  },

  _addFuel(amount) {
    if (!amount) return;
    const f = this.state.fuel;
    f.current = Math.min(f.max, f.current + amount);
    this.bus.emit('fuel:changed', { current: f.current, max: f.max });
  },

  // --- jump-drive / scanner / fuel-tank module resolution -----------------------------------
  _resolveShipModules() {
    // Best-effort: read the active ship entity's derived stats (ships writes data.derived).
    // If ships exposes fuelMax / jumpDriveTier / scannerTier, honor them. Resolve the drive on
    // every call so unfit/load/malformed derived data cannot leave a stale higher tier behind.
    const state = this.state;
    const player = state.entities.get(state.playerId);
    const derived = player && player.data && player.data.derived;
    this._driveTierId = 'jump_t1';
    if (!derived) return;
    if (derived.fuelMax != null && derived.fuelMax > 0) {
      const wasFull = state.fuel.current >= state.fuel.max;
      state.fuel.max = derived.fuelMax;
      if (wasFull || state.fuel.current > state.fuel.max) state.fuel.current = Math.min(state.fuel.current, state.fuel.max);
    }
    if (typeof derived.jumpDriveTier === 'string' && DRIVE_TIERS[derived.jumpDriveTier]) {
      this._driveTierId = derived.jumpDriveTier;
    }
  },

  _activeDrive() {
    return (this._driveTierId && DRIVE_TIERS[this._driveTierId]) || DEFAULT_DRIVE;
  },

  _hasDrive() {
    // Every ship has at least a basic (T1) drive so the early game can use both gate and drive.
    return true;
  },

  _scannerTier() {
    const player = this.state.entities.get(this.state.playerId);
    const derived = player && player.data && player.data.derived;
    return (derived && derived.scannerTier) || 0;
  },

  _wormholeUnlocked(sector) {
    if (!sector || !sector.wormholeTo) return false;
    const gate = sector.wormholeTo.gatedBy; // e.g. "tech:tech_long_range_survey"
    if (!gate) return true;
    const [kind, key] = gate.split(':');
    if (kind === 'tech') return (this.state.player.researchedNodes || []).includes(key);
    if (kind === 'flag') return !!(this.state.story.flags || {})[key];
    return false;
  },

  _onLockChanged({ locked }) {
    this._combatLock = !!locked;
    if (this._combatLock && this.state.jump.state === 'CHARGING' && this.state.jump.via === 'drive') {
      if (!this._activeDrive().hotJump) this._abortCharge('combat_lock');
    }
  },

  _onFieldDepleted({ fieldId, depleted }) {
    if (!fieldId) return;
    const disc = this._discoveryFor(this.state.world.currentSectorId);
    disc.fieldsDepleted[fieldId] = clamp(depleted == null ? 1 : depleted, 0, 1);
    if (depleted == null || Number(depleted) > 0) {
      const sectorId = this.state.world.currentSectorId;
      this._resolveFrontierRumors(
        (record) => record.kind === 'vein' && record.targetId === fieldId
          && (!sectorId || record.sectorId === sectorId),
        'vein_worked',
      );
    }
  },

  _onAnomalyTriangulated(payload) {
    const sectorId = payload.sectorId || this.state.world.currentSectorId;
    const poiId = payload.poiId;
    if (!sectorId || !poiId) return false;
    const disc = this._discoveryFor(sectorId);
    const rec = disc.pois[poiId] || (disc.pois[poiId] = { discovered: false, identified: false });
    const newlyDiscovered = !rec.discovered;
    rec.discovered = true;
    rec.triangulated = true;
    rec.triangulatedAt = Number(payload.completedAt) || Number(this.state.simTime) || 0;
    rec.triangulationSampleCount = Math.max(1, Math.floor(Number(payload.sampleCount) || 3));
    rec.type = 'anomaly';
    const active = this.state.world.activeSector;
    if (active && active.id === sectorId) {
      const row = (active.pois || []).find((poi) => poi && poi.poiId === poiId);
      if (row) {
        row.anomalyTriangulated = true;
        const entity = this.state.entities.get(row.id);
        if (entity && entity.data) entity.data.anomalyTriangulated = true;
      }
    }
    if (newlyDiscovered) this.bus.emit('poi:discovered', { poiId, type: 'anomaly', sectorId });
    return true;
  },

  _onSignalInvestigated(payload) {
    const sectorId = payload.sectorId || this.state.world.currentSectorId;
    const poiId = payload.sourceId;
    if (!sectorId || !poiId) return false;
    if (sectorId === VESTA_ORE_CACHE.sectorId && poiId === VESTA_ORE_CACHE.cachePoiId
      && this._vestaOreCacheState().phase === 'unfound') return false;
    if (sectorId === PALLAS_HIDDEN_CACHE.sectorId && poiId === PALLAS_HIDDEN_CACHE.cachePoiId
      && this._pallasHiddenCacheState().phase === 'unfound') return false;
    const sector = this.state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    const poi = sector && (sector.pois || []).find((row) => row && row.id === poiId);
    if (!poi) return false;
    const disc = this._discoveryFor(sectorId);
    const rec = disc.pois[poiId] || (disc.pois[poiId] = { discovered: false, identified: false });
    const newlyFound = !rec.investigated && !rec.identified && !rec.defeated;
    const newlyDiscovered = !rec.discovered;
    const newlyIdentified = !rec.identified;
    rec.discovered = true;
    rec.identified = true;
    rec.investigated = true;
    rec.investigatedAt = Number(payload.completedAt) || Number(this.state.simTime) || 0;
    rec.type = poi.type || payload.sourceKind || rec.type || null;
    rec.name = poi.name || rec.name || poiId;
    if (newlyDiscovered) this.bus.emit('poi:discovered', { poiId, type: rec.type, sectorId });
    if (newlyIdentified) this.bus.emit('poi:identified', { poiId, type: rec.type, sectorId });
    if (newlyFound) {
      this.bus.emit('discovery:plateUnlocked', { sectorId, poiId, type: rec.type });
    }
    this._onVestaOreCacheSignalInvestigated({ ...payload, sectorId, poiId, completedAt: rec.investigatedAt });
    this._onPallasHiddenCacheSignalInvestigated({ ...payload, sectorId, poiId, completedAt: rec.investigatedAt });
    this._contactTethysBlackMarket({ poiId, sectorId, completedAt: rec.investigatedAt });
    this._onListeningPostSignalInvestigated({ ...payload, sectorId, poiId, completedAt: rec.investigatedAt }, rec);
    this._onDeadGateSignalInvestigated({ ...payload, sectorId, poiId, completedAt: rec.investigatedAt }, rec);
    this._onStarSignaturePlateRead({ sectorId, poiId, completedAt: rec.investigatedAt });
    this._onUnregisteredCacheInvestigated({ sectorId, poiId, completedAt: rec.investigatedAt });
    this._onTheFaceInvestigated({ sectorId, poiId, completedAt: rec.investigatedAt });
    return true;
  },

  // ---- Plan 30: Names in the Stars ---------------------------------------------------------
  // A fabricator's plate on real lane hardware. Reading three of them across three regions is the
  // whole discovery; the chart's constellation labels are never touched and stay non-interactive.
  _onStarSignaturePlateRead(payload) {
    const def = STAR_SIGNATURE_BY_POI.get(payload.poiId);
    if (!def || def.sectorId !== payload.sectorId) return false;
    const own = this.state.world.starSignatures
      || (this.state.world.starSignatures = normalizeStarSignatureState(null));
    if (own.plates[def.poiId]) return true;
    own.plates[def.poiId] = {
      readAt: Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0),
      constellationId: def.constellationId,
    };
    this.bus.emit('secret:starSignatureRead', {
      sectorId: def.sectorId,
      poiId: def.poiId,
      handle: def.handle,
      read: Object.keys(own.plates).length,
      total: STAR_SIGNATURE_BY_POI.size,
    });
    this.bus.emit('toast', { text: `Builder plate filed: ${def.handle}`, kind: 'info', ttl: 4 });
    return true;
  },

  // ---- Plan 30: Unregistered Caches --------------------------------------------------------
  _unregisteredCachesState() {
    const own = normalizeUnregisteredCachesState(this.state.world.unregisteredCaches);
    this.state.world.unregisteredCaches = own;
    return own;
  },

  /**
   * Opening a cache is the terminal move. Contents leave through the owners that already exist:
   * a physical pickup for the lot (the Pallas idiom) and `ships.grantModule` for hardware — the
   * same writer unique-wreck recovery uses. Nothing here mints credits or writes cargo directly.
   */
  _onUnregisteredCacheInvestigated(payload) {
    const def = UNREGISTERED_CACHE_BY_POI.get(payload.poiId);
    if (!def || def.sectorId !== payload.sectorId) return false;
    const own = this._unregisteredCachesState();
    const row = own.caches[def.id];
    if (row && row.phase === 'opened') return true;
    const openedAt = Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0);
    own.caches[def.id] = {
      phase: 'opened',
      cluedAt: row && row.cluedAt != null ? row.cluedAt : null,
      openedAt,
      grantedModuleId: null,
      collectedQty: 0,
    };
    this._materializeUnregisteredCacheLot(def, openedAt);
    if (def.grantModuleId) {
      const ships = this.registry && this.registry.get && this.registry.get('ships');
      const granted = !!(ships && typeof ships.grantModule === 'function' && ships.grantModule({
        defId: def.grantModuleId,
        reason: `unregistered-cache:${def.id}`,
      }));
      if (granted) own.caches[def.id].grantedModuleId = def.grantModuleId;
    }
    this.bus.emit('unregisteredCache:opened', {
      cacheId: def.id,
      sectorId: def.sectorId,
      poiId: def.cachePoiId,
      name: def.name,
      grantedModuleId: own.caches[def.id].grantedModuleId,
      cosmeticMarkingId: def.cosmeticMarkingId,
      forbidden: def.forbidden,
    });
    this.bus.emit('toast', { text: `${def.name} opened`, kind: 'good', ttl: 4 });
    return true;
  },

  /** One finite physical lot at the cache, spawned once and only once per cache. */
  _materializeUnregisteredCacheLot(def, openedAt) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const existing = [...this.state.entities.values()].find((entity) => entity && entity.type === 'pickup'
      && entity.data && entity.data.unregisteredCacheLotId === def.lotId);
    if (existing) return existing;
    const anchor = this._activePoiPos(def.cachePoiId);
    if (!anchor) return null;
    return spawnEntity({
      type: 'pickup',
      pos: { x: anchor.x + 14, z: anchor.z - 10 },
      vel: { x: 0, z: 0 },
      radius: 6,
      data: {
        kind: 'cargo',
        commodityId: def.cargo.commodityId,
        amount: def.cargo.qty,
        name: def.cargo.pickupName,
        storyPickup: true,
        unregisteredCacheId: def.id,
        unregisteredCacheLotId: def.lotId,
        provenanceId: def.provenanceId,
        openedAt,
      },
    });
  },

  /** Sector-local position of a live POI, or its authored anchor when it is not embodied. */
  _activePoiPos(poiId) {
    const active = this.state.world.activeSector;
    const row = active && (active.pois || []).find((poi) => poi
      && (poi.poiId === poiId || poi.id === poiId));
    if (row) {
      const entity = this.state.entities.get(row.id);
      if (entity && entity.pos) return { x: entity.pos.x, z: entity.pos.z };
      if (row.pos) return { x: row.pos.x, z: row.pos.z };
    }
    return null;
  },

  // ---- Plan 30: The Developer --------------------------------------------------------------
  _theDeveloperState() {
    const own = normalizeTheDeveloperState(
      this.state.world.theDeveloper, this.state.meta && this.state.meta.seed,
    );
    this.state.world.theDeveloper = own;
    return own;
  },

  /**
   * One parked hull behind the Dead Gate, built from the ordinary archetype table through the
   * ordinary spawn spec. It is browser-gated at the data layer, so `sf-sim` and the 47-A tape
   * never construct it and it cannot move a golden.
   */
  _spawnTheDeveloper(sectorId) {
    if (sectorId !== THE_DEVELOPER.sectorId) return null;
    if (!theDeveloperShouldExist(this.state)) return null;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const existing = [...this.state.entities.values()].find((entity) => entity
      && entity.data && entity.data.theDeveloper === true);
    if (existing) return existing;
    const pos = { ...THE_DEVELOPER.fixedLocalPos };
    const spec = makeEnemySpawnSpec('the_developer', 1, pos, {
      factionId: 'faction_free',
      startedTick: this.state.tick,
    });
    if (!spec) return null;
    spec.team = 0;
    spec.data = spec.data || {};
    spec.data.theDeveloper = true;
    spec.data.scannerSignalKind = 'archive';
    spec.data.repeatableScannerSignal = true;
    spec.data.ai = spec.data.ai || {};
    spec.data.ai.passive = true;
    spec.data.ai.activity = 'transit';
    spec.data.ai.roe = 'never_fire';
    spec.data.ai.sectorId = sectorId;
    return spawnEntity(spec);
  },

  /**
   * Sighting is what unlocks the Codex row — scanning it, not killing it. The kill is the deeper
   * phase and pays the plan's complete chip set through the ordinary physical pickup owner.
   */
  _onTheDeveloperScanned(payload) {
    const entity = payload && payload.entityId != null
      ? this.state.entities.get(payload.entityId) : null;
    if (!entity || !entity.data || entity.data.theDeveloper !== true) return false;
    const own = this._theDeveloperState();
    if (own.phase !== 'unseen') return true;
    own.phase = 'seen';
    own.seenAt = Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0);
    this.bus.emit('secret:developerSighted', {
      sectorId: THE_DEVELOPER.sectorId,
      entityId: entity.id,
    });
    return true;
  },

  _onTheDeveloperKilled(payload) {
    const entity = payload && payload.id != null ? this.state.entities.get(payload.id) : null;
    const wasDeveloper = !!(entity && entity.data && entity.data.theDeveloper === true)
      || payload && payload.theDeveloper === true;
    if (!wasDeveloper) return false;
    const own = this._theDeveloperState();
    if (own.phase === 'killed') return true;
    const at = Math.max(0, Number(this.state.simTime) || 0);
    if (own.phase === 'unseen') own.seenAt = at;
    own.phase = 'killed';
    own.killedAt = at;
    own.killedSeed = Number(this.state.meta && this.state.meta.seed) || 0;
    const pos = payload && payload.pos ? { ...payload.pos } : { ...THE_DEVELOPER.fixedLocalPos };
    this._spawnDeveloperChipSet(pos);
    // I-4: one radio line through the shared voice arbiter. Never floating text over the hull.
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: THE_DEVELOPER.bark,
        kind: 'theDeveloper',
        ttl: 5,
        id: 'theDeveloper:dying',
      });
    }
    this.bus.emit('secret:developerDestroyed', {
      sectorId: THE_DEVELOPER.sectorId,
      chipDenominations: [...THE_DEVELOPER.chipDenominations],
      killedSeed: own.killedSeed,
    });
    return true;
  },

  /** One chip of every denomination the reward ladder mints — a complete set, not a payout roll. */
  _spawnDeveloperChipSet(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return [];
    const spawned = [];
    const count = THE_DEVELOPER.chipDenominations.length;
    for (let index = 0; index < count; index++) {
      const amount = THE_DEVELOPER.chipDenominations[index];
      const angle = (index / count) * Math.PI * 2;
      const entity = spawnEntity({
        type: 'pickup',
        pos: { x: pos.x + Math.cos(angle) * 18, z: pos.z + Math.sin(angle) * 18 },
        vel: { x: Math.cos(angle) * 12, z: Math.sin(angle) * 12 },
        radius: 4,
        data: {
          kind: CREDIT_CHIP_KIND,
          amount,
          credits: amount,
          grantReason: `secret:the_developer:chip:${amount}`,
          storyPickup: true,
          theDeveloperChip: true,
        },
      });
      if (entity) spawned.push(entity);
    }
    return spawned;
  },

  // ---- Plan 30: The Face -------------------------------------------------------------------
  /**
   * The arc is the secret. A scan from anywhere else returns an ordinary survey and writes nothing,
   * so the find can only ever be earned by flying the far side.
   */
  _onTheFaceInvestigated(payload) {
    if (payload.sectorId !== THE_FACE.sectorId || payload.poiId !== THE_FACE.poiId) return false;
    const own = this.state.world.theFace
      || (this.state.world.theFace = normalizeTheFaceState(null));
    if (own.phase === 'seen') return true;
    const bodyPos = this._activePoiPos(THE_FACE.poiId);
    const shipPos = this.state.player && this.state.player.pos;
    const solution = faceApproachSolution(shipPos, bodyPos);
    if (!solution || !solution.resolved) return false;
    own.phase = 'seen';
    own.seenAt = Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0);
    own.bearingDeg = solution.bearingDeg;
    this.bus.emit('secret:faceResolved', {
      sectorId: THE_FACE.sectorId,
      poiId: THE_FACE.poiId,
      bearingDeg: solution.bearingDeg,
      distanceWu: solution.distanceWu,
      markingId: THE_FACE.markingId,
    });
    this.bus.emit('toast', { text: THE_FACE.codexTitle, kind: 'good', ttl: 5 });
    return true;
  },

  _onListeningPostSignalInvestigated(payload, discoveryRecord = null) {
    if (payload.sectorId !== LISTENING_POST.sourceSectorId
      || payload.poiId !== LISTENING_POST.sourcePoiId) return false;
    const rec = discoveryRecord || this._discoveryFor(LISTENING_POST.sourceSectorId).pois[LISTENING_POST.sourcePoiId];
    if (!rec || rec.investigated !== true) return false;
    const current = rec.listeningPost && typeof rec.listeningPost === 'object'
      ? rec.listeningPost : null;
    if (current) return true;
    rec.listeningPost = {
      phase: 'recovered',
      recoveredAt: Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0),
      attemptCount: 0,
      decoded: false,
      lastResult: null,
    };
    this.bus.emit('secret:listeningPostLogRecovered', {
      sectorId: LISTENING_POST.sourceSectorId,
      poiId: LISTENING_POST.sourcePoiId,
      signalId: LISTENING_POST.signalId,
    });
    this.bus.emit('toast', {
      text: 'Listening Post cadence filed in Codex',
      kind: 'info',
      ttl: 4,
    });
    return true;
  },

  _deadGateState(discoveryRecord = null) {
    const rec = discoveryRecord
      || this._discoveryFor(DEAD_GATE.sectorId).pois[DEAD_GATE.poiId]
      || (this._discoveryFor(DEAD_GATE.sectorId).pois[DEAD_GATE.poiId] = {
        discovered: false, identified: false,
      });
    rec.deadGate = normalizeDeadGateState(rec.deadGate);
    return rec.deadGate;
  },

  _onDeadGateSignalInvestigated(payload, discoveryRecord = null) {
    if (payload.sectorId !== DEAD_GATE.sectorId || payload.poiId !== DEAD_GATE.poiId) return false;
    const rec = discoveryRecord
      || this._discoveryFor(DEAD_GATE.sectorId).pois[DEAD_GATE.poiId];
    if (!rec || rec.investigated !== true) return false;
    const own = this._deadGateState(rec);
    if (own.phase === 'sealed') {
      own.phase = 'recovered';
      own.recoveredAt = Math.max(0,
        Number(payload.completedAt) || Number(this.state.simTime) || 0);
      this.bus.emit('deadGate:opened', {
        sectorId: DEAD_GATE.sectorId,
        poiId: DEAD_GATE.poiId,
        signalId: DEAD_GATE.signalId,
        rewardSlotIds: own.rewards.map((reward) => reward.slotId),
      });
      this.bus.emit('toast', {
        text: 'Dead Gate diagnostics released into open space',
        kind: 'good',
        ttl: 4,
      });
    }
    this._spawnDeadGateRewards(DEAD_GATE.sectorId);
    return true;
  },

  _spawnDeadGateRewards(sectorId = this.state.world.currentSectorId) {
    if (sectorId !== DEAD_GATE.sectorId || this.state.world.currentSectorId !== sectorId) return [];
    const rec = this._discoveryFor(DEAD_GATE.sectorId).pois[DEAD_GATE.poiId];
    if (!rec || rec.investigated !== true) return [];
    const own = this._deadGateState(rec);
    if (own.phase === 'sealed' || own.phase === 'exhausted') return [];
    const gate = (this.state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.poiId === DEAD_GATE.poiId);
    const base = gate && gate.pos
      ? gate.pos
      : sectorLocalToGlobalForSector(DEAD_GATE.fixedLocalPos, DEAD_GATE.sectorId);
    const spawned = [];
    for (const slot of own.rewards) {
      if (!(slot.remainingQty > 0)) continue;
      const live = (this.state.entityList || []).find((entity) => entity && entity.alive !== false
        && entity.data && entity.data.deadGateRewardSlotId === slot.slotId);
      if (live) continue;
      const authored = DEAD_GATE.rewards.find((reward) => reward.slotId === slot.slotId);
      if (!authored) continue;
      const entity = this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: base.x + authored.offset.x, z: base.z + authored.offset.z },
        vel: { x: 0, z: 0 },
        radius: 1.7,
        mass: 0.2,
        collides: true,
        ttl: Infinity,
        data: {
          kind: 'cargo',
          commodityId: slot.commodityId,
          amount: slot.remainingQty,
          name: authored.name,
          deadGateRewardSlotId: slot.slotId,
          deadGateRewardRevision: slot.collectedQty,
          sourcePoiId: DEAD_GATE.poiId,
        },
      });
      this._stampHomeSector(entity, DEAD_GATE.sectorId);
      spawned.push(entity);
      this.bus.emit('deadGate:rewardMaterialized', {
        sectorId: DEAD_GATE.sectorId,
        poiId: DEAD_GATE.poiId,
        slotId: slot.slotId,
        pickupId: entity.id,
        commodityId: slot.commodityId,
        amount: slot.remainingQty,
        pos: { ...entity.pos },
      });
    }
    return spawned;
  },

  _onDeadGatePickupCollected(payload) {
    if (payload.collectorId !== this.state.playerId || !(Number(payload.acceptedAmount) > 0)) return false;
    const pickup = payload.pickupId != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.pickupId) : null;
    const slotId = pickup && pickup.data && pickup.data.deadGateRewardSlotId;
    if (!slotId) return false;
    const rec = this._discoveryFor(DEAD_GATE.sectorId).pois[DEAD_GATE.poiId];
    if (!rec || rec.investigated !== true) return false;
    const own = this._deadGateState(rec);
    const slot = own.rewards.find((reward) => reward.slotId === slotId);
    if (!slot || pickup.data.commodityId !== slot.commodityId || !(slot.remainingQty > 0)) return false;
    const revision = Math.max(0, Math.floor(Number(pickup.data.deadGateRewardRevision) || 0));
    if (revision !== slot.collectedQty) return false;
    const accepted = Math.max(0, Math.min(slot.remainingQty,
      Math.floor(Number(payload.acceptedAmount) || 0)));
    if (!(accepted > 0)) return false;
    slot.collectedQty += accepted;
    slot.remainingQty = slot.totalQty - slot.collectedQty;
    pickup.data.deadGateRewardRevision = slot.collectedQty;
    own.phase = own.rewards.every((reward) => reward.remainingQty === 0) ? 'exhausted' : 'recovered';
    this.bus.emit('deadGate:materialRecovered', {
      sectorId: DEAD_GATE.sectorId,
      poiId: DEAD_GATE.poiId,
      slotId,
      commodityId: slot.commodityId,
      acceptedQty: accepted,
      remainingQty: slot.remainingQty,
      phase: own.phase,
    });
    return true;
  },

  _onListeningPostDecodeRequested(payload) {
    const sourceDisc = this._discoveryFor(LISTENING_POST.sourceSectorId);
    const rec = sourceDisc.pois[LISTENING_POST.sourcePoiId];
    const current = listeningPostPuzzleState(this.state);
    if (!rec || !current.recovered) return false;
    if (current.decoded) return true;

    const result = validateListeningPostAttempt(payload.attempt);
    const secret = rec.listeningPost;
    secret.attemptCount = Math.min(99, Math.max(0, Math.floor(Number(secret.attemptCount) || 0)) + 1);
    secret.lastResult = result.ok ? null : result.reason;
    if (!result.ok) {
      this.bus.emit('secret:listeningPostDecodeFailed', {
        reason: result.reason,
        attemptCount: secret.attemptCount,
      });
      this.bus.emit('toast', {
        text: result.reason === 'format' ? 'Use chart format X,Y' : 'Cadence does not match that chart pair',
        kind: 'warn',
        ttl: 3,
      });
      return false;
    }

    const decodedAt = Math.max(0, Number(this.state.simTime) || 0);
    secret.phase = 'decoded';
    secret.decoded = true;
    secret.decodedAt = decodedAt;
    secret.targetSectorId = LISTENING_POST.targetSectorId;
    secret.targetStationId = LISTENING_POST.targetStationId;

    const targetDisc = this._discoveryFor(LISTENING_POST.targetSectorId);
    const newlyCharted = targetDisc.discovered !== true;
    targetDisc.discovered = true;
    targetDisc.source = 'listening_post';
    targetDisc.chartedAt = decodedAt;
    targetDisc.listeningPostStationId = LISTENING_POST.targetStationId;
    if (!targetDisc.stations || typeof targetDisc.stations !== 'object') targetDisc.stations = {};
    targetDisc.stations[LISTENING_POST.targetStationId] = {
      discovered: true,
      source: 'listening_post',
      discoveredAt: decodedAt,
    };
    if (newlyCharted) {
      this.bus.emit('map:sectorCharted', {
        sectorId: LISTENING_POST.targetSectorId,
        source: 'listening_post',
      });
    }
    this.bus.emit('secret:listeningPostDecoded', {
      sectorId: LISTENING_POST.targetSectorId,
      stationId: LISTENING_POST.targetStationId,
      coordinate: { ...LISTENING_POST.chartCoordinate },
      newlyCharted,
    });
    this.bus.emit('toast', {
      text: `${LISTENING_POST.targetStationName} added to the chart`,
      kind: 'info',
      ttl: 4,
    });
    return true;
  },

  _vestaOreCacheState() {
    const own = normalizeVestaOreCacheState(this.state.world.vestaOreCache);
    this.state.world.vestaOreCache = own;
    return own;
  },

  _onVestaOreCacheSignalInvestigated(payload) {
    if (payload.sectorId !== VESTA_ORE_CACHE.sectorId) return false;
    const own = this._vestaOreCacheState();
    const completedAt = Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0);
    if (payload.poiId === VESTA_ORE_CACHE.relayPoiId) {
      if (own.phase !== 'unfound') return false;
      own.phase = 'searching';
      own.evidence = {
        evidenceId: VESTA_ORE_CACHE.evidenceId,
        sourcePoiId: VESTA_ORE_CACHE.relayPoiId,
        signalId: VESTA_ORE_CACHE.relaySignalId,
        foundAt: completedAt,
        carrier: 'physical_relay_ore_residue',
      };
      own.search = {
        center: sectorLocalToGlobalForSector(VESTA_ORE_CACHE.searchCenterLocal, VESTA_ORE_CACHE.sectorId),
        radius: VESTA_ORE_CACHE.searchRadiusWu,
        sourceEvidenceId: VESTA_ORE_CACHE.evidenceId,
      };
      this.bus.emit('vestaOreCache:clueRecovered', {
        recordId: own.recordId,
        sectorId: VESTA_ORE_CACHE.sectorId,
        phase: own.phase,
        evidence: { ...own.evidence },
        search: { ...own.search, center: { ...own.search.center } },
      });
      return true;
    }
    if (payload.poiId !== VESTA_ORE_CACHE.cachePoiId || own.phase !== 'searching') return false;
    own.phase = 'choice';
    own.cache = {
      poiId: VESTA_ORE_CACHE.cachePoiId,
      fixedPos: payload.pos && Number.isFinite(Number(payload.pos.x)) && Number.isFinite(Number(payload.pos.z))
        ? { x: Number(payload.pos.x), z: Number(payload.pos.z) }
        : sectorLocalToGlobalForSector(VESTA_ORE_CACHE.cacheLocalPos, VESTA_ORE_CACHE.sectorId),
      foundAt: completedAt,
    };
    this._presentVestaOreCacheDecision('physical-investigation');
    return true;
  },

  _presentVestaOreCacheDecision(source = 'world') {
    const own = this._vestaOreCacheState();
    if (own.phase !== 'choice' || !own.cache) return false;
    // Continue re-enters the sector before save:loaded announces that presentation state is ready.
    // Hold this one transient edge so the usable post-load prompt is not consumed early.
    if (source === 'sector-enter' && this._vestaDecisionNeedsRebind) return false;
    const signature = `${own.recordId}:${own.cache.foundAt}`;
    if (this._vestaDecisionSignature === signature) return false;
    this._vestaDecisionSignature = signature;
    this.bus.emit('vestaOreCache:decisionReady', {
      recordId: own.recordId,
      sectorId: VESTA_ORE_CACHE.sectorId,
      phase: own.phase,
      headline: 'SHIFT-END ORE CACHE',
      prompt: 'The seal is intact. Choose what the ship records and what leaves this rock.',
      source,
      choices: VESTA_ORE_CACHE_CHOICES.map((choice) => ({ ...choice })),
      fixedPos: { ...own.cache.fixedPos },
    });
    return true;
  },

  _onVestaOreCacheChoice(payload) {
    const own = this._vestaOreCacheState();
    const choice = vestaOreCacheChoice(String(payload.choiceId || payload.choice || ''));
    if (own.phase !== 'choice' || !own.cache || own.receipt || !choice) return false;
    if (payload.recordId && payload.recordId !== own.recordId) return false;
    const resolvedAt = Math.max(0, Number(this.state.simTime) || 0);
    own.phase = choice.id === 'preserve' ? 'preserved' : choice.id === 'report' ? 'reported' : 'taken';
    own.choiceId = choice.id;
    own.resolvedAt = resolvedAt;
    const details = {
      preserve: 'Seal left intact. The fixed cache remains in the ship chart for a later return.',
      report: 'DMC dispatch acknowledged the sealed cache report.',
      take: 'Seal opened. Six units of legal nickel ore remain a physical recovery, limited by hold space.',
    };
    own.receipt = {
      id: 'vesta-ore-cache:resolution:v1',
      recordId: own.recordId,
      sectorId: VESTA_ORE_CACHE.sectorId,
      cachePoiId: VESTA_ORE_CACHE.cachePoiId,
      choiceId: choice.id,
      outcome: own.phase,
      title: `SHIFT-END CACHE ${choice.label}`,
      detail: details[choice.id],
      resolvedAt,
      ...(choice.id === 'report' ? {
        factionId: VESTA_ORE_CACHE.reportFactionId,
        repDelta: VESTA_ORE_CACHE.reportRepDelta,
      } : {}),
      ...(choice.id === 'take' ? {
        lotId: VESTA_ORE_CACHE.lotId,
        commodityId: VESTA_ORE_CACHE.commodityId,
        totalQty: VESTA_ORE_CACHE.totalQty,
      } : {}),
    };
    if (choice.id === 'take') {
      own.cargoLot = {
        lotId: VESTA_ORE_CACHE.lotId,
        provenanceId: VESTA_ORE_CACHE.provenanceId,
        commodityId: VESTA_ORE_CACHE.commodityId,
        totalQty: VESTA_ORE_CACHE.totalQty,
        collectedQty: 0,
        lostQty: 0,
        remainingQty: VESTA_ORE_CACHE.totalQty,
        collectionReceipts: [],
      };
    }
    // Commit the durable receipt before delegating any consequence to its single writer.
    if (choice.id === 'report') {
      this.bus.emit('faction:repDelta', {
        factionId: VESTA_ORE_CACHE.reportFactionId,
        delta: VESTA_ORE_CACHE.reportRepDelta,
        reason: 'vesta_ore_cache_report',
      });
    }
    if (choice.id === 'take') this._spawnVestaOreCachePickup(VESTA_ORE_CACHE.sectorId);
    this.bus.emit('vestaOreCache:resolved', {
      recordId: own.recordId,
      choiceId: choice.id,
      receipt: { ...own.receipt },
    });
    return true;
  },

  _spawnVestaOreCachePickup(sectorId = this.state.world.currentSectorId) {
    if (sectorId !== VESTA_ORE_CACHE.sectorId || this.state.world.currentSectorId !== sectorId) return null;
    const own = this._vestaOreCacheState();
    if (own.phase !== 'taken' || !own.cache || !own.cargoLot || !(own.cargoLot.remainingQty > 0)) return null;
    const live = (this.state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.vestaOreCacheLotId === VESTA_ORE_CACHE.lotId);
    if (live) return live;
    const revision = own.cargoLot.collectedQty + own.cargoLot.lostQty;
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: { ...own.cache.fixedPos },
      vel: { x: 0, z: 0 },
      radius: 1.5,
      mass: 0.1,
      collides: true,
      ttl: Infinity,
      data: {
        kind: 'ore',
        commodityId: VESTA_ORE_CACHE.commodityId,
        amount: own.cargoLot.remainingQty,
        name: 'Shift-End Nickel Ore',
        vestaOreCacheLotId: VESTA_ORE_CACHE.lotId,
        vestaOreCacheRevision: revision,
        richLotSource: {
          lotId: VESTA_ORE_CACHE.lotId,
          provenanceId: VESTA_ORE_CACHE.provenanceId,
          sourceKind: 'vesta_ore_cache',
          sourcePoiId: VESTA_ORE_CACHE.cachePoiId,
          recordId: VESTA_ORE_CACHE.recordId,
          choiceId: 'take',
          lotQty: own.cargoLot.remainingQty,
          sourceOwner: 'player',
        },
      },
    });
    this._stampHomeSector(entity, VESTA_ORE_CACHE.sectorId);
    this.bus.emit('vestaOreCache:pickupReady', {
      recordId: own.recordId,
      pickupId: entity.id,
      remainingQty: own.cargoLot.remainingQty,
      pos: { ...entity.pos },
    });
    return entity;
  },

  _onVestaOreCachePickupCollected(payload) {
    const own = this._vestaOreCacheState();
    if (own.phase !== 'taken' || !own.cargoLot || !(own.cargoLot.remainingQty > 0)) return false;
    const pickup = payload.pickupId != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.pickupId) : null;
    if (pickup && pickup.data && pickup.data.jettisonedCargo) return false;
    const source = payload.lotSource || payload.richLotSource
      || pickup && pickup.data && (pickup.data.lotSource || pickup.data.richLotSource);
    if (!source || source.lotId !== VESTA_ORE_CACHE.lotId
      || source.provenanceId !== VESTA_ORE_CACHE.provenanceId) return false;
    const revision = Math.max(0, Math.floor(Number(pickup && pickup.data && pickup.data.vestaOreCacheRevision)
      || own.cargoLot.collectedQty + own.cargoLot.lostQty));
    const receiptId = `${VESTA_ORE_CACHE.lotId}:collection:${revision}`;
    if (own.cargoLot.collectionReceipts.some((entry) => entry.id === receiptId)) return false;
    const requested = Math.max(0, Math.floor(Number(payload.amount) || 0));
    const playerPickup = payload.collectorId === this.state.playerId;
    const acceptedQty = playerPickup
      ? Math.max(0, Math.min(own.cargoLot.remainingQty, Math.floor(Number(payload.acceptedAmount) || 0)))
      : 0;
    const lostQty = playerPickup ? 0 : Math.max(0, Math.min(own.cargoLot.remainingQty, requested));
    if (!(acceptedQty > 0) && !(lostQty > 0)) return false;
    own.cargoLot.collectedQty += acceptedQty;
    own.cargoLot.lostQty += lostQty;
    own.cargoLot.remainingQty = Math.max(0,
      own.cargoLot.totalQty - own.cargoLot.collectedQty - own.cargoLot.lostQty);
    own.cargoLot.collectionReceipts.push({ id: receiptId, acceptedQty, lostQty });
    if (own.cargoLot.collectionReceipts.length > 16) own.cargoLot.collectionReceipts.shift();
    if (pickup && pickup.data) pickup.data.vestaOreCacheRevision = revision + acceptedQty + lostQty;
    this.bus.emit('vestaOreCache:cargoChanged', {
      recordId: own.recordId,
      lotId: own.cargoLot.lotId,
      acceptedQty,
      lostQty,
      collectedQty: own.cargoLot.collectedQty,
      remainingQty: own.cargoLot.remainingQty,
    });
    return true;
  },

  _pallasHiddenCacheState() {
    const own = normalizePallasHiddenCacheState(this.state.world.pallasHiddenCache);
    this.state.world.pallasHiddenCache = own;
    return own;
  },

  _onPallasHiddenCacheSignalInvestigated(payload) {
    if (payload.sectorId !== PALLAS_HIDDEN_CACHE.sectorId) return false;
    const own = this._pallasHiddenCacheState();
    const completedAt = Math.max(0, Number(payload.completedAt) || Number(this.state.simTime) || 0);
    if (payload.poiId === PALLAS_HIDDEN_CACHE.cluePoiId) {
      if (own.phase !== 'unfound') return false;
      own.phase = 'searching';
      own.evidence = {
        evidenceId: PALLAS_HIDDEN_CACHE.evidenceId,
        sourcePoiId: PALLAS_HIDDEN_CACHE.cluePoiId,
        signalId: PALLAS_HIDDEN_CACHE.clueSignalId,
        foundAt: completedAt,
        carrier: 'physical_pirate_wreck_manifest',
      };
      own.search = {
        center: sectorLocalToGlobalForSector(PALLAS_HIDDEN_CACHE.searchCenterLocal, PALLAS_HIDDEN_CACHE.sectorId),
        radius: PALLAS_HIDDEN_CACHE.searchRadiusWu,
        sourceEvidenceId: PALLAS_HIDDEN_CACHE.evidenceId,
      };
      this.bus.emit('pallasHiddenCache:clueRecovered', {
        recordId: own.recordId,
        sectorId: PALLAS_HIDDEN_CACHE.sectorId,
        phase: own.phase,
        evidence: { ...own.evidence },
        search: { ...own.search, center: { ...own.search.center } },
      });
      return true;
    }
    if (payload.poiId !== PALLAS_HIDDEN_CACHE.cachePoiId || own.phase !== 'searching') return false;
    own.phase = 'choice';
    own.cache = {
      poiId: PALLAS_HIDDEN_CACHE.cachePoiId,
      fixedPos: payload.pos && Number.isFinite(Number(payload.pos.x)) && Number.isFinite(Number(payload.pos.z))
        ? { x: Number(payload.pos.x), z: Number(payload.pos.z) }
        : sectorLocalToGlobalForSector(PALLAS_HIDDEN_CACHE.cacheLocalPos, PALLAS_HIDDEN_CACHE.sectorId),
      foundAt: completedAt,
    };
    this._presentPallasHiddenCacheDecision('physical-investigation');
    return true;
  },

  _canReportPallasHiddenCache() {
    const ui = this.state && this.state.ui;
    return !!(ui && ui.docked === true && ui.dockedStationId === PALLAS_HIDDEN_CACHE.reportStationId);
  },

  _presentPallasHiddenCacheDecision(source = 'world', stationId = null) {
    const own = this._pallasHiddenCacheState();
    if (own.phase !== 'choice' || !own.cache) return false;
    if (source === 'sector-enter' && this._pallasDecisionNeedsRebind) return false;
    const reportAvailable = stationId === PALLAS_HIDDEN_CACHE.reportStationId || this._canReportPallasHiddenCache();
    const signature = `${own.recordId}:${own.cache.foundAt}:${reportAvailable ? 'drift-report' : 'field'}`;
    if (this._pallasDecisionSignature === signature) return false;
    this._pallasDecisionSignature = signature;
    this.bus.emit('pallasHiddenCache:decisionReady', {
      recordId: own.recordId,
      sectorId: PALLAS_HIDDEN_CACHE.sectorId,
      phase: own.phase,
      headline: 'BLACK-WAKE WEAPONS CACHE',
      prompt: reportAvailable
        ? 'Drift Market can file the cache report. Other dispositions leave a physical lot at the fixed cache.'
        : 'The cache is fixed. Recover or criminal use leaves a physical lot at the cache; report only from Drift Market.',
      source,
      reportAvailable,
      reportStationId: PALLAS_HIDDEN_CACHE.reportStationId,
      choices: PALLAS_HIDDEN_CACHE_CHOICES.map((choice) => ({
        ...choice,
        available: choice.id !== 'report' || reportAvailable,
        ...(choice.id === 'report' && !reportAvailable
          ? { unavailableReason: 'Dock at Drift Market to file this report.' }
          : {}),
      })),
      fixedPos: { ...own.cache.fixedPos },
    });
    return true;
  },

  _onPallasHiddenCacheChoice(payload) {
    const own = this._pallasHiddenCacheState();
    const choice = pallasHiddenCacheChoice(String(payload.choiceId || payload.choice || ''));
    if (own.phase !== 'choice' || !own.cache || own.receipt || !choice) return false;
    if (payload.recordId && payload.recordId !== own.recordId) return false;
    if (choice.id === 'report' && !this._canReportPallasHiddenCache()) return false;

    const resolvedAt = Math.max(0, Number(this.state.simTime) || 0);
    const phaseByChoice = { recover: 'recovered', report: 'reported', criminal_use: 'criminal_used' };
    own.phase = phaseByChoice[choice.id];
    own.choiceId = choice.id;
    own.resolvedAt = resolvedAt;
    const lot = pallasHiddenCacheLot(choice.id);
    const details = {
      recover: 'Weapons case secured. The finite restricted lot remains a physical pickup at the cache.',
      report: 'Drift Market logged the Pallas cache report through its own station desk.',
      criminal_use: 'Custody tags burned. The finite stolen-goods lot remains a physical pickup at the cache.',
    };
    own.receipt = {
      id: PALLAS_HIDDEN_CACHE_RESOLUTION_ID,
      recordId: own.recordId,
      sectorId: PALLAS_HIDDEN_CACHE.sectorId,
      cachePoiId: PALLAS_HIDDEN_CACHE.cachePoiId,
      choiceId: choice.id,
      outcome: own.phase,
      title: `BLACK-WAKE CACHE ${choice.label}`,
      detail: details[choice.id],
      resolvedAt,
      ...(choice.id === 'report' ? {
        stationId: PALLAS_HIDDEN_CACHE.reportStationId,
        factionId: PALLAS_HIDDEN_CACHE.reportFactionId,
        repDelta: PALLAS_HIDDEN_CACHE.reportRepDelta,
      } : {}),
      ...(lot ? {
        lotId: lot.lotId,
        commodityId: lot.commodityId,
        totalQty: lot.totalQty,
      } : {}),
    };
    if (lot) {
      own.cargoLot = {
        lotId: lot.lotId,
        provenanceId: lot.provenanceId,
        commodityId: lot.commodityId,
        totalQty: lot.totalQty,
        collectedQty: 0,
        lostQty: 0,
        remainingQty: lot.totalQty,
        collectionReceipts: [],
      };
    }
    // Commit the durable receipt before delegating any consequence to its single writer.
    if (choice.id === 'report') {
      this.bus.emit('faction:repDelta', {
        factionId: PALLAS_HIDDEN_CACHE.reportFactionId,
        delta: PALLAS_HIDDEN_CACHE.reportRepDelta,
        reason: 'pallas_hidden_cache_report',
      });
    }
    if (lot) this._spawnPallasHiddenCachePickup(PALLAS_HIDDEN_CACHE.sectorId);
    this.bus.emit('pallasHiddenCache:resolved', {
      recordId: own.recordId,
      choiceId: choice.id,
      receipt: { ...own.receipt },
    });
    return true;
  },

  _spawnPallasHiddenCachePickup(sectorId = this.state.world.currentSectorId) {
    if (sectorId !== PALLAS_HIDDEN_CACHE.sectorId || this.state.world.currentSectorId !== sectorId) return null;
    const own = this._pallasHiddenCacheState();
    const lot = pallasHiddenCacheLot(own.choiceId);
    if (!lot || !own.cache || !own.cargoLot || !(own.cargoLot.remainingQty > 0)) return null;
    if (own.cargoLot.lotId !== lot.lotId || own.cargoLot.provenanceId !== lot.provenanceId
      || own.cargoLot.commodityId !== lot.commodityId) return null;
    const live = (this.state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.pallasHiddenCacheLotId === lot.lotId);
    if (live) return live;
    const revision = own.cargoLot.collectedQty + own.cargoLot.lostQty;
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: { ...own.cache.fixedPos },
      vel: { x: 0, z: 0 },
      radius: 1.5,
      mass: 0.1,
      collides: true,
      ttl: Infinity,
      data: {
        kind: 'cargo',
        commodityId: lot.commodityId,
        amount: own.cargoLot.remainingQty,
        name: lot.pickupName,
        pallasHiddenCacheLotId: lot.lotId,
        pallasHiddenCacheRevision: revision,
        richLotSource: {
          lotId: lot.lotId,
          provenanceId: lot.provenanceId,
          sourceKind: 'pallas_hidden_cache',
          sourcePoiId: PALLAS_HIDDEN_CACHE.cachePoiId,
          recordId: PALLAS_HIDDEN_CACHE.recordId,
          choiceId: own.choiceId,
          lotQty: own.cargoLot.remainingQty,
          sourceOwner: 'player',
        },
      },
    });
    this._stampHomeSector(entity, PALLAS_HIDDEN_CACHE.sectorId);
    this.bus.emit('pallasHiddenCache:pickupReady', {
      recordId: own.recordId,
      pickupId: entity.id,
      lotId: lot.lotId,
      remainingQty: own.cargoLot.remainingQty,
      pos: { ...entity.pos },
    });
    return entity;
  },

  _onPallasHiddenCachePickupCollected(payload) {
    const own = this._pallasHiddenCacheState();
    const lot = pallasHiddenCacheLot(own.choiceId);
    if (!lot || !own.cargoLot || !(own.cargoLot.remainingQty > 0)
      || !Array.isArray(own.cargoLot.collectionReceipts)) return false;
    const pickup = payload.pickupId != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.pickupId) : null;
    if (pickup && pickup.data && pickup.data.jettisonedCargo) return false;
    const source = payload.lotSource || payload.richLotSource
      || pickup && pickup.data && (pickup.data.lotSource || pickup.data.richLotSource);
    if (!source || source.lotId !== lot.lotId || source.provenanceId !== lot.provenanceId
      || source.commodityId && source.commodityId !== lot.commodityId) return false;
    const revision = Math.max(0, Math.floor(Number(pickup && pickup.data && pickup.data.pallasHiddenCacheRevision)
      || own.cargoLot.collectedQty + own.cargoLot.lostQty));
    const receiptId = `${lot.lotId}:collection:${revision}`;
    if (own.cargoLot.collectionReceipts.some((entry) => entry.id === receiptId)) return false;
    const requested = Math.max(0, Math.floor(Number(payload.amount) || 0));
    const playerPickup = payload.collectorId === this.state.playerId;
    const acceptedQty = playerPickup
      ? Math.max(0, Math.min(own.cargoLot.remainingQty, Math.floor(Number(payload.acceptedAmount) || 0)))
      : 0;
    const lostQty = playerPickup ? 0 : Math.max(0, Math.min(own.cargoLot.remainingQty, requested));
    if (!(acceptedQty > 0) && !(lostQty > 0)) return false;
    own.cargoLot.collectedQty += acceptedQty;
    own.cargoLot.lostQty += lostQty;
    own.cargoLot.remainingQty = Math.max(0,
      own.cargoLot.totalQty - own.cargoLot.collectedQty - own.cargoLot.lostQty);
    own.cargoLot.collectionReceipts.push({ id: receiptId, acceptedQty, lostQty });
    if (own.cargoLot.collectionReceipts.length > 16) own.cargoLot.collectionReceipts.shift();
    if (pickup && pickup.data) pickup.data.pallasHiddenCacheRevision = revision + acceptedQty + lostQty;
    this.bus.emit('pallasHiddenCache:cargoChanged', {
      recordId: own.recordId,
      lotId: own.cargoLot.lotId,
      acceptedQty,
      lostQty,
      collectedQty: own.cargoLot.collectedQty,
      remainingQty: own.cargoLot.remainingQty,
    });
    return true;
  },

  smugglingDropCacheEligibility(commodityId, qty = 1) {
    const state = this.state;
    const player = state && state.entities && state.entities.get
      ? state.entities.get(state.playerId)
      : null;
    if (!player || player.alive === false || player.flags && player.flags.docked) {
      return { ok: false, reason: 'not_in_flight' };
    }
    if (state.mode !== 'paused') return { ok: false, reason: 'pause_required' };
    if (isUnsellableCargo(state, commodityId)) return { ok: false, reason: 'cargo_locked' };
    const available = Math.max(0, Math.floor(Number(state.player?.cargo?.items?.[commodityId]) || 0));
    const requested = Math.max(1, Math.floor(Number(qty) || 1));
    if (available <= 0) return { ok: false, reason: 'cargo_missing' };
    const own = normalizeSmugglingDropCacheState(state.world.smugglingDropCaches);
    const activeCount = own.records.filter((record) => record.status === 'stashed').length;
    if (activeCount >= SMUGGLING_DROP_CACHE.activeLimit) return { ok: false, reason: 'cache_limit' };
    let nearest = null;
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid' || entity.collides === false) continue;
      const dx = Number(player.pos?.x) - Number(entity.pos?.x);
      const dz = Number(player.pos?.z) - Number(entity.pos?.z);
      const centerDistance = Math.hypot(dx || 0, dz || 0);
      const surfaceDistance = Math.max(0, centerDistance - Math.max(0, Number(entity.radius) || 0));
      if (surfaceDistance > SMUGGLING_DROP_CACHE.anchorRangeWU) continue;
      const relativeSpeed = Math.hypot(
        (Number(player.vel?.x) || 0) - (Number(entity.vel?.x) || 0),
        (Number(player.vel?.z) || 0) - (Number(entity.vel?.z) || 0),
      );
      if (!nearest || surfaceDistance < nearest.surfaceDistance) {
        nearest = { entity, centerDistance, surfaceDistance, relativeSpeed };
      }
    }
    if (!nearest) return { ok: false, reason: 'no_nearby_rock' };
    if (nearest.relativeSpeed > SMUGGLING_DROP_CACHE.maxRelativeSpeedWUPerS) {
      return { ok: false, reason: 'relative_speed', relativeSpeedWUPerS: nearest.relativeSpeed };
    }
    return {
      ok: true,
      qty: Math.min(requested, available),
      anchorEntityId: nearest.entity.id,
      anchorName: nearest.entity.data?.name || 'unmarked rock',
      surfaceDistanceWU: nearest.surfaceDistance,
      relativeSpeedWUPerS: nearest.relativeSpeed,
    };
  },

  stashSmugglingDropCache(commodityId, qty = 1) {
    const eligibility = this.smugglingDropCacheEligibility(commodityId, qty);
    if (!eligibility.ok) return eligibility;
    const state = this.state;
    const player = state.entities.get(state.playerId);
    const anchor = state.entities.get(eligibility.anchorEntityId);
    const cargo = this.registry && this.registry.get ? this.registry.get('cargo') : null;
    if (!anchor || !cargo || typeof cargo.jettison !== 'function') return { ok: false, reason: 'owner_unavailable' };
    const own = normalizeSmugglingDropCacheState(state.world.smugglingDropCaches);
    const sequence = own.nextSequence++;
    const sectorId = String(state.world.currentSectorId || anchor.data?.homeSectorId || 'unknown');
    const commodity = COMMODITY_BY_ID.get(commodityId);
    const dx = (Number(player.pos?.x) || 0) - (Number(anchor.pos?.x) || 0);
    const dz = (Number(player.pos?.z) || 0) - (Number(anchor.pos?.z) || 0);
    const mag = Math.hypot(dx, dz) || 1;
    const nx = mag > 0 ? dx / mag : Math.cos(Number(player.rot) || 0);
    const nz = mag > 0 ? dz / mag : Math.sin(Number(player.rot) || 0);
    const fixedPos = {
      x: (Number(anchor.pos?.x) || 0) + nx * (Math.max(0, Number(anchor.radius) || 0) + 4.5),
      z: (Number(anchor.pos?.z) || 0) + nz * (Math.max(0, Number(anchor.radius) || 0) + 4.5),
    };
    const anchorId = `${String(anchor.data?.fieldId || 'rock')}:${Math.round(Number(anchor.pos?.x) || 0)}:${Math.round(Number(anchor.pos?.z) || 0)}`;
    const record = {
      schemaVersion: SMUGGLING_DROP_CACHE.schemaVersion,
      id: `drop_cache:${state.meta?.seed || 0}:${sequence}`,
      owner: 'player', status: 'stashed', sectorId,
      sectorName: state.world.sectors?.[sectorId]?.name || sectorId,
      anchorId, anchorName: eligibility.anchorName,
      fixedPos,
      commodityId,
      commodityName: commodity?.name || commodityId,
      quantity: eligibility.qty,
      remainingQty: eligibility.qty,
      pods: [],
      createdAt: Math.max(0, Number(state.simTime) || 0),
      soldAt: 0, soldStationId: null, payoutCr: 0, recoveredAt: 0,
    };
    this._pendingDropCacheStash = record;
    const dumped = cargo.jettison(commodityId, eligibility.qty, {
      purpose: `smuggling_drop_cache:${record.id}`,
      reactionImpulse: false,
      placement: {
        x: fixedPos.x, z: fixedPos.z,
        vx: Number(anchor.vel?.x) || 0,
        vz: Number(anchor.vel?.z) || 0,
        solid: true,
        persistent: true,
      },
    });
    this._pendingDropCacheStash = null;
    if (!(dumped > 0) || !record.pods.length) return { ok: false, reason: 'jettison_failed' };
    record.quantity = dumped;
    record.remainingQty = record.pods.reduce((sum, pod) => sum + pod.amount, 0);
    own.records.push(record);
    state.world.smugglingDropCaches = normalizeSmugglingDropCacheState(own);
    this.bus.emit('smuggling:dropCacheStashed', {
      cacheId: record.id, sectorId, anchorId, commodityId,
      quantity: record.remainingQty, tick: state.tick | 0,
    });
    return { ok: true, cacheId: record.id, quantity: record.remainingQty, anchorName: record.anchorName };
  },

  _onSmugglingDropCacheJettisoned(payload) {
    const record = this._pendingDropCacheStash;
    if (!record || payload.purpose !== `smuggling_drop_cache:${record.id}`) return false;
    const podIds = Array.isArray(payload.podIds) ? payload.podIds : [];
    for (let slot = 0; slot < podIds.length; slot++) {
      const entity = this.state.entities.get(podIds[slot]);
      if (!entity || entity.alive === false || entity.data?.recoverableCargoPod !== true) continue;
      const amount = Math.max(0, Math.floor(Number(entity.data.amount) || 0));
      if (!(amount > 0)) continue;
      entity.data.smugglingDropCacheId = record.id;
      entity.data.smugglingDropCacheSlot = slot;
      entity.data.persistenceOwner = 'smugglingDropCaches';
      entity.data.despawnAt = Number.POSITIVE_INFINITY;
      entity.ttl = Number.POSITIVE_INFINITY;
      this._stampHomeSector(entity, record.sectorId);
      record.pods.push({
        slot,
        amount,
        richLotSource: entity.data.richLotSource ? { ...entity.data.richLotSource } : null,
      });
    }
    return record.pods.length > 0;
  },

  _onSmugglingDropCacheRecovered(payload) {
    const entity = payload.podId != null ? this.state.entities.get(payload.podId) : null;
    const cacheId = entity && entity.data && entity.data.smugglingDropCacheId;
    if (!cacheId) return false;
    const own = normalizeSmugglingDropCacheState(this.state.world.smugglingDropCaches);
    const record = own.records.find((candidate) => candidate.id === cacheId && candidate.status === 'stashed');
    if (!record) return false;
    const slot = Math.max(0, Math.floor(Number(entity.data.smugglingDropCacheSlot) || 0));
    const pod = record.pods.find((candidate) => candidate.slot === slot);
    if (!pod) return false;
    pod.amount = Math.max(0, Math.floor(Number(payload.remainingAmount) || 0));
    record.pods = record.pods.filter((candidate) => candidate.amount > 0);
    record.remainingQty = record.pods.reduce((sum, candidate) => sum + candidate.amount, 0);
    if (record.remainingQty <= 0) {
      record.status = 'recovered';
      record.recoveredAt = Math.max(0, Number(this.state.simTime) || 0);
    }
    this.state.world.smugglingDropCaches = normalizeSmugglingDropCacheState(own);
    this.bus.emit('smuggling:dropCacheChanged', {
      cacheId: record.id, status: record.status, remainingQty: record.remainingQty,
    });
    return true;
  },

  _spawnSmugglingDropCaches(sectorId) {
    if (!sectorId || !this.state.world.smugglingDropCaches) return 0;
    const own = normalizeSmugglingDropCacheState(this.state.world.smugglingDropCaches);
    this.state.world.smugglingDropCaches = own;
    let spawned = 0;
    for (const record of own.records) {
      if (record.status !== 'stashed' || record.sectorId !== sectorId || record.remainingQty <= 0) continue;
      for (const podRecord of record.pods) {
        const existing = (this.state.entityList || []).find((entity) => entity && entity.alive !== false
          && entity.data?.smugglingDropCacheId === record.id
          && Number(entity.data?.smugglingDropCacheSlot) === podRecord.slot);
        if (existing) continue;
        const commodity = COMMODITY_BY_ID.get(record.commodityId);
        const podMass = Math.max(1.5, Math.min(18, (Number(commodity?.massPerU) || 0.5) * podRecord.amount));
        const radius = Math.max(2.2, Math.min(6.5, 2.2 + Math.sqrt(podRecord.amount) * 0.35));
        const side = (podRecord.slot - (record.pods.length - 1) * 0.5) * (radius * 2.4);
        const entity = this.helpers.spawnEntity({
          type: 'payload',
          pos: { x: record.fixedPos.x, z: record.fixedPos.z + side },
          vel: { x: 0, z: 0 },
          radius, mass: podMass, ttl: Number.POSITIVE_INFINITY, collides: true,
          physicsBody: {
            dynamic: true, ccd: true, radius, mass: podMass,
            inertiaY: 0.5 * podMass * radius * radius,
            material: 'payload', shape: 'ball',
          },
          data: {
            kind: 'cargo', commodityId: record.commodityId, amount: podRecord.amount,
            ...(podRecord.richLotSource ? { richLotSource: { ...podRecord.richLotSource } } : {}),
            jettisonedCargo: true, recoverableCargoPod: true,
            jettisonPurpose: `smuggling_drop_cache:${record.id}`,
            smugglingDropCacheId: record.id,
            smugglingDropCacheSlot: podRecord.slot,
            persistenceOwner: 'smugglingDropCaches',
            pickupEmbargoUntil: 0,
            despawnAt: Number.POSITIVE_INFINITY,
          },
        });
        this._stampHomeSector(entity, sectorId);
        spawned++;
      }
    }
    return spawned;
  },

  dropCacheSaleOffers(stationId) {
    const memory = fixerMemoryFor(this.state);
    if (!memory.unlocked || memory.homeStationId !== stationId
      || this.state.ui?.dockedStationId !== stationId || this.state.ui?.docked !== true) return [];
    const economy = this.registry && this.registry.get ? this.registry.get('economy') : null;
    return sellableSmugglingDropCaches(this.state).map((record) => {
      const quote = economy && typeof economy.quote === 'function'
        ? economy.quote(stationId, record.commodityId, 'sell', record.remainingQty)
        : null;
      const base = quote && quote.ok
        ? quote.total
        : (Number(COMMODITY_BY_ID.get(record.commodityId)?.basePrice) || 0) * record.remainingQty;
      return {
        cacheId: record.id,
        commodityId: record.commodityId,
        commodityName: record.commodityName,
        quantity: record.remainingQty,
        sectorName: record.sectorName,
        anchorName: record.anchorName,
        payoutCr: Math.max(1, Math.round(base * SMUGGLING_DROP_CACHE.locationValueMult)),
      };
    });
  },

  sellDropCacheLocation(cacheId, stationId) {
    const offer = this.dropCacheSaleOffers(stationId).find((candidate) => candidate.cacheId === cacheId);
    if (!offer) return { ok: false, reason: 'offer_unavailable' };
    const own = normalizeSmugglingDropCacheState(this.state.world.smugglingDropCaches);
    const record = own.records.find((candidate) => candidate.id === cacheId && candidate.status === 'stashed');
    if (!record) return { ok: false, reason: 'already_settled' };
    record.status = 'sold';
    record.soldAt = Math.max(0, Number(this.state.simTime) || 0);
    record.soldStationId = stationId;
    record.payoutCr = offer.payoutCr;
    record.remainingQty = 0;
    record.pods = [];
    this.state.world.smugglingDropCaches = normalizeSmugglingDropCacheState(own);
    for (const entity of [...(this.state.entityList || [])]) {
      if (entity && entity.alive !== false && entity.data?.smugglingDropCacheId === cacheId) {
        if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(entity.id);
        else entity.alive = false;
      }
    }
    this.bus.emit('economy:grantCredits', {
      amount: offer.payoutCr,
      reason: `smuggling:drop_cache_location:${record.id}`,
    });
    this.bus.emit('smuggling:dropCacheSold', { ...offer, stationId, tick: this.state.tick | 0 });
    return { ok: true, ...offer, stationId };
  },

  _contactTethysBlackMarket({ poiId, sectorId, completedAt }) {
    const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
    if (poiId !== discovery.poiId || sectorId !== discovery.sectorId) return false;
    const own = this._frontierRumorState();
    const record = own.byId[discovery.rumorId];
    if (!record || record.phase !== 'rumored') return false;
    const contactedAt = Math.max(0, Number(completedAt) || Number(this.state.simTime) || 0);
    record.phase = 'contacted';
    record.contactedAt = contactedAt;
    record.contactId = discovery.contactId;
    record.opportunity = {
      type: discovery.opportunityType,
      stationId: discovery.stationId,
      status: 'available',
    };
    record.risk = 'Quiet capsule work can draw law attention; loss means no payout.';
    const receipt = {
      type: 'contacted', rumorId: record.id, contactId: record.contactId,
      sectorId, poiId, opportunityType: discovery.opportunityType, t: contactedAt,
    };
    own.receipts.push(receipt);
    while (own.receipts.length > FRONTIER_RUMOR_RECEIPT_LIMIT) own.receipts.shift();
    this.bus.emit('frontierRumor:contacted', { ...receipt, opportunity: { ...record.opportunity } });
    return true;
  },

  _onLandmarkArtifactRecovered(payload) {
    const sectorId = payload && payload.sectorId;
    const poiId = payload && payload.poiId;
    const artifact = payload && payload.artifact;
    if (!sectorId || !poiId || !artifact || !artifact.id || !artifact.title || !artifact.body) return false;
    const sector = this.state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    const poi = sector && (sector.pois || []).find((row) => row && row.id === poiId);
    if (!poi) return false;
    if (payload.targetRef && poi.flavorTargetRef && payload.targetRef !== poi.flavorTargetRef) return false;
    const disc = this._discoveryFor(sectorId);
    const rec = disc.pois[poiId] || (disc.pois[poiId] = { discovered: false, identified: false });
    if (rec.landmarkArtifact && rec.landmarkArtifact.id === artifact.id) return false;
    const returnedAt = Math.max(0, Number(payload.returnedAt) || Number(this.state.simTime) || 0);
    rec.discovered = true;
    rec.identified = true;
    rec.investigated = true;
    rec.investigatedAt = returnedAt;
    rec.landmarkArtifact = {
      id: String(artifact.id),
      title: String(artifact.title),
      body: String(artifact.body),
      sourceRef: payload.targetRef ? String(payload.targetRef) : null,
      signalId: payload.signalId ? String(payload.signalId) : null,
      returnedAt,
    };
    this.bus.emit('discovery:plateUnlocked', {
      sectorId,
      poiId,
      type: poi.type || rec.type || null,
      artifactId: rec.landmarkArtifact.id,
    });
    return true;
  },

  // --- numeric helpers ----------------------------------------------------------------------
  // Edge distance in lightyears from the two sectors' static map positions (clamped 2..9).
  _edgeDist(a, b) {
    if (a && b && a.position && b.position) {
      const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
      const raw = Math.hypot(dx, dy);
      return clamp(raw * 1.4 + 1.5, 2, 9);
    }
    return 4;
  },

  _interdictChance(sector, via, drive) {
    if (!sector) return 0;
    if (via === 'gate') return clamp(0.02 + 0.06 * sector.tier - 0.10, 0, 0.15);
    const sec = sector.security != null ? sector.security : 0.5;
    return clamp(BASE_INTERDICT * (1 - sec) * (1 - (drive.driveStealth || 0)), 0, 0.6);
  },

  _gateToll(sector) {
    if (!sector) return 0;
    return sector.security > 0.6 ? Math.round(50 + 200 * sector.security) : 0;
  },

  // =========================================================================================
  // save/load (§4.5 — world overlay only: discovery, currentSectorId, jump, fuel, owners)
  // =========================================================================================
  serialize() {
    const state = this.state;
    this._captureCometIce();
    // Capture live durable entities into the bag before save so mid-route Continue
    // restores NPC/convoy/mission outcomes without depending on residency bags.
    const membership = state.world.currentSectorId;
    if (membership) this._captureSectorDurableRecords(membership, { reason: 'serialize' });
    // Also snapshot any other FULL/REDUCED resident that still has live entities.
    const residents = state.world.residentSectors || {};
    for (const sid of Object.keys(residents)) {
      if (sid === membership) continue;
      const tier = residents[sid] && residents[sid].tier;
      if (tier === RESIDENCY_TIER.FULL || tier === RESIDENCY_TIER.REDUCED) {
        this._captureSectorDurableRecords(sid, { reason: 'serialize' });
      }
    }
    // Saves never resume a transition FSM. Once Choice C is confirmed, normalize an in-flight
    // snapshot to its inevitable return instead of reloading at Ashfall with the ending already
    // filed and no way to charge again. A CHARGING snapshot has not spent fuel yet; JUMPING has.
    const unfiledCommitted = state.jump._unfiled === true
      && state.jump._unfiledConfirmed === true
      && (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING');
    const savedJump = unfiledCommitted
      ? {
        state: 'COOLDOWN', targetSectorId: null, via: null,
        chargeT: 0, chargeNeeded: 0, cooldownT: DRIVE_COOLDOWN * driveCooldownMultiplier(state.player),
      }
      : {
        state: state.jump.state, targetSectorId: state.jump.targetSectorId, via: state.jump.via,
        chargeT: state.jump.chargeT, chargeNeeded: state.jump.chargeNeeded, cooldownT: state.jump.cooldownT,
      };
    const savedFuelCurrent = unfiledCommitted && state.jump.state === 'CHARGING'
      ? Math.max(0, state.fuel.current - (state.jump._fuelCost || 0))
      : state.fuel.current;
    return {
      currentSectorId: unfiledCommitted ? UNFILED_JUMP_RETURN : state.world.currentSectorId,
      discovery: cloneSaveTree(state.world.discovery || {}),
      scanPings: cloneSaveTree(state.world.scanPings || {}),
      pendingSpawns: cloneSaveTree(state.world.pendingSpawns || {}),
      frontierRumors: cloneSaveTree(this._frontierRumorState()),
      vestaOreCache: cloneSaveTree(this._vestaOreCacheState()),
      pallasHiddenCache: cloneSaveTree(this._pallasHiddenCacheState()),
      ...(state.world.smugglingDropCaches ? {
        smugglingDropCaches: cloneSaveTree(normalizeSmugglingDropCacheState(state.world.smugglingDropCaches)),
      } : {}),
      cometIce: cloneSaveTree(state.world.cometIce),
      // v11: durable global-space entity records (never frameOrigin / residentSectors / sectorContents).
      records: serializeRecordsBag(ensureWorldRecords(state.world)),
      // Latest sectorSim recipes are bounded per sector and needed because sectorSim restores its
      // applied-id set on Continue (it correctly will not re-emit the same epoch).
      embodiment: serializeEmbodimentCache(state.world.embodiment),
      // v9: entity/overlay positions are already galactic-global. Persist schema tag only —
      // frameOrigin / frameOriginSeq are runtime boundary values and must not re-offset poses.
      coordinateSchema: state.world.coordinateSchema || 'global_v1',
      sectorOwners: this._ownerOverlay(),
      jump: savedJump,
      fuel: { current: savedFuelCurrent, max: state.fuel.max },
    };
  },

  _ownerOverlay() {
    const out = {};
    for (const id in this.state.world.sectors) {
      const s = this.state.world.sectors[id];
      if (s && s.owner && s.owner !== s.factionId) out[id] = s.owner;
    }
    return out;
  },

  deserialize(data) {
    if (!data) return;
    const state = this.state;
    // Sector entities are runtime-only and save load clears them before re-entering the saved
    // sector. Drop all residency bags as well, otherwise stale structural IDs make the
    // materializer believe stations/gates are still live and the loaded sector appears empty.
    state.world.residentSectors = {};
    state.world.sectorContents = {};
    state.world.activeSector = this._emptySectorBag();
    if (data.discovery) state.world.discovery = data.discovery;
    state.world.scanPings = (data.scanPings && typeof data.scanPings === 'object') ? data.scanPings : {};
    state.world.pendingSpawns = (data.pendingSpawns && typeof data.pendingSpawns === 'object') ? data.pendingSpawns : {};
    state.world.frontierRumors = normalizeFrontierRumorState(data.frontierRumors);
    state.world.vestaOreCache = normalizeVestaOreCacheState(data.vestaOreCache);
    state.world.pallasHiddenCache = normalizePallasHiddenCacheState(data.pallasHiddenCache);
    if (data.smugglingDropCaches) {
      state.world.smugglingDropCaches = normalizeSmugglingDropCacheState(data.smugglingDropCaches);
    } else {
      delete state.world.smugglingDropCaches;
    }
    const cometCycle = cometPassAt(state.meta && state.meta.seed || 1, state.simTime).cycle;
    state.world.cometIce = normalizeCometIceState(data.cometIce, cometCycle);
    this._cometIceEntityId = null;
    this._cometIcePassId = null;
    this._vestaDecisionSignature = null;
    this._vestaDecisionNeedsRebind = true;
    this._pallasDecisionSignature = null;
    this._pallasDecisionNeedsRebind = true;
    // Durable records restore before enterSector rematerializes them exactly once.
    state.world.records = deserializeRecordsBag(data.records);
    state.world.embodiment = normalizeEmbodimentCache(data.embodiment);
    if (data.currentSectorId) state.world.currentSectorId = data.currentSectorId;
    // Coordinate schema is global_v1 for v9+. Always reset the runtime frame on load rather
    // than trusting a stale rendering frame that may have been smuggled into a payload.
    state.world.coordinateSchema = (data.coordinateSchema === 'global_v1' || data.coordinateSchema == null)
      ? 'global_v1'
      : String(data.coordinateSchema);
    if (!state.world.frameOrigin || typeof state.world.frameOrigin !== 'object') {
      state.world.frameOrigin = { x: 0, z: 0 };
    } else {
      state.world.frameOrigin.x = 0;
      state.world.frameOrigin.z = 0;
    }
    state.world.frameOriginSeq = 0;
    // Never rehydrate runtime residency bags from disk (even if smuggled).
    if (data.residentSectors) { /* intentionally ignored */ }
    if (data.sectorContents) { /* intentionally ignored */ }
    if (data.jump) {
      // restore overlay fields but never resume a mid-charge/jump (avoid a stuck FSM on load)
      Object.assign(state.jump, data.jump);
      if (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING') {
        state.jump.state = 'IDLE'; state.jump.targetSectorId = null; state.jump.via = null;
        state.jump.chargeT = 0; state.jump.chargeNeeded = 0;
      }
      state.jump._unfiled = false;
      state.jump._unfiledConfirmed = false;
    }
    if (data.fuel) state.fuel = { current: data.fuel.current, max: data.fuel.max };
    if (data.sectorOwners) {
      for (const id in data.sectorOwners) {
        if (state.world.sectors[id]) state.world.sectors[id].owner = data.sectorOwners[id];
      }
    }
    // NOTE: the active sector's entities are NOT serialized; the save load sequence re-enters
    // the saved sector to repopulate it (calling enterSector after deserialize). Durable
    // world.records rematerialize inside _ensureSectorMaterialized during that enter.
  },

  newGame() {
    const state = this.state;
    // reset overlay + jump/fuel to defaults; the home sector is entered by main.js post-boot.
    // main.startNewGame replaces state.world with a fresh record after system init, so rebuild the
    // mutable ownership/map table here instead of relying on init's now-discarded copy.
    state.world.sectors = {};
    for (const sector of SECTORS) {
      state.world.sectors[sector.id] = { ...sector, owner: sector.factionId };
    }
    state.world.discovery = {};
    state.world.scanPings = {};
    state.world.pendingSpawns = {};
    state.world.frontierRumors = normalizeFrontierRumorState(null);
    state.world.vestaOreCache = freshVestaOreCacheState();
    state.world.pallasHiddenCache = freshPallasHiddenCacheState();
    delete state.world.smugglingDropCaches;
    state.world.cometIce = createCometIceState();
    state.world.records = createEmptyRecordsBag();
    state.world.embodiment = createEmptyEmbodimentCache();
    state.world.residentSectors = {};
    state.world.sectorContents = {};
    state.world.activeSector = this._emptySectorBag();
    state.world.currentSectorId = null;
    this._nextCriticalSpawnTick = 0;
    this._vestaDecisionSignature = null;
    this._vestaDecisionNeedsRebind = false;
    this._pallasDecisionSignature = null;
    this._pallasDecisionNeedsRebind = false;
    this._cometIceEntityId = null;
    this._cometIcePassId = null;
    // Coordinate membrane: new games always start at global_v1 with a zero runtime frame.
    state.world.coordinateSchema = 'global_v1';
    if (!state.world.frameOrigin || typeof state.world.frameOrigin !== 'object') {
      state.world.frameOrigin = { x: 0, z: 0 };
    } else {
      state.world.frameOrigin.x = 0;
      state.world.frameOrigin.z = 0;
    }
    state.world.frameOriginSeq = 0;
    this._seedChartedDiscovery();
    state.jump.state = 'IDLE'; state.jump.targetSectorId = null; state.jump.via = null;
    state.jump.chargeT = 0; state.jump.chargeNeeded = 0; state.jump.cooldownT = 0;
    state.jump._unfiled = false; state.jump._unfiledConfirmed = false;
    state.fuel = { current: 100, max: 100 };
    state.nav.route = null; state.nav.autoTravel = false; state.nav.waypoint = null;
    state.nav.autopilot = { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
    delete state.nav.waypointQueue;
  },
};

function cloneSaveTree(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneSaveTree);
  const out = {};
  for (const key of Object.keys(value)) out[key] = cloneSaveTree(value[key]);
  return out;
}

// Module-private helper (kept out of the singleton so `this` stays simple in callers).
function safeSector(state, id) {
  return state.world.sectors[id] || SECTOR_BY_ID.get(id) || null;
}

function paletteClassForSector(sector) {
  if (!sector) return 'core';
  if (PALETTE_CLASS_BY_REF.has(sector.palette)) return PALETTE_CLASS_BY_REF.get(sector.palette);
  const p = sector.palette || {};
  for (const [key, value] of Object.entries(SECTOR_PALETTE_CLASSES)) {
    if (p.nebulaTint === value.nebulaTint && p.fog === value.fog) return key;
  }
  return 'core';
}

function polarOffset(origin, angle, distance) {
  return {
    x: origin.x + Math.cos(angle) * distance,
    z: origin.z + Math.sin(angle) * distance,
  };
}

// Radial offset relative to a sector origin (default galactic 0,0 for Helios-local legacy).
// When pos is already galactic-global, pass the sector's global origin so t scales from the sector center.
function offsetAlongRadial(pos, t, sideOffset, origin = null) {
  const ox = origin ? origin.x : 0;
  const oz = origin ? origin.z : 0;
  const lx = pos.x - ox;
  const lz = pos.z - oz;
  const angle = Math.atan2(lz, lx);
  const baseX = ox + lx * t;
  const baseZ = oz + lz * t;
  return {
    x: baseX + Math.cos(angle + Math.PI / 2) * sideOffset,
    z: baseZ + Math.sin(angle + Math.PI / 2) * sideOffset,
  };
}

function midpoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function bearingFromOrigin(pos, origin = null) {
  const ox = origin ? origin.x : 0;
  const oz = origin ? origin.z : 0;
  return Math.atan2(pos.z - oz, pos.x - ox);
}

function bearingToward(from, to) {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

function sanitizeCoursePos(pos) {
  if (!pos || typeof pos !== 'object' || Array.isArray(pos)) return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function localCourseFromPayload(payload = {}) {
  const pos = sanitizeCoursePos(payload.pos);
  if (!pos) return null;
  const label = String(payload.label || payload.reason || 'Autopilot fix');
  const targetEntityId = payload.targetEntityId != null ? payload.targetEntityId : null;
  const targetSectorId = typeof payload.targetSectorId === 'string'
    ? payload.targetSectorId
    : (payload.type === 'gate' && typeof payload.sectorId === 'string' ? payload.sectorId : null);
  const course = {
    kind: payload.waypointKind || payload.kind || 'local',
    label,
    reason: payload.reason || label,
    pos,
    targetEntityId,
    arrivalRadius: Number.isFinite(payload.arrivalRadius)
      ? Math.max(12, Math.min(500, payload.arrivalRadius))
      : 36,
  };
  // A physical gate is a local position with an inter-sector completion condition. Preserve the
  // destination identity so navigation can retire the old-sector marker only after authoritative
  // sector entry; ordinary local fixes intentionally carry no targetSectorId.
  if (targetSectorId) course.targetSectorId = targetSectorId;
  return course;
}

function dist2(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

function starterSafeRadius(sector) {
  if (!sector) return 0;
  return sector.id === 'sector_helios_prime' || sector.tier === 0 ? STARTER_SAFE_RADIUS : 0;
}

function stationSafeRadius(station) {
  const liveRadius = Number(station && station.radius);
  return STATION_SAFE_RADIUS + (Number.isFinite(liveRadius) ? liveRadius : 0);
}

function tagAiSpawnContext(spec, sector, effectiveSector, context) {
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.ai.spawnContext = context;
  spec.data.ai.sectorId = sector && sector.id || null;
  spec.data.ai.sectorSecurity = Number.isFinite(effectiveSector && effectiveSector.security)
    ? effectiveSector.security
    : (Number.isFinite(sector && sector.security) ? sector.security : 0);
  spec.data.ai.sectorTier = Number.isFinite(effectiveSector && effectiveSector.tier)
    ? effectiveSector.tier
    : (Number.isFinite(sector && sector.tier) ? sector.tier : 0);
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}
