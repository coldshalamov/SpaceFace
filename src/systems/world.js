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
import { effectiveSectorFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for spawn sizing
import { ASTEROIDS, FIELDS, deriveAsteroidSeams } from '../data/mining.js';
import { makeEnemySpawnSpec } from './combat.js';
import { planZoneSpawns, zoneAt, zoneThreat } from '../data/sectorZones.js'; // named-zone purposeful spawning (WORLD_OVERHAUL_2_1)
import { applyFrameOrigin, deriveFrameOrigin } from '../core/coordinates.js';
import {
  CORRIDOR_SECTOR_IDS,
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

// ---- global tuning constants (design 05 "GLOBAL TUNING CONSTANTS" + "Formulas") -------------
const DEFAULT_WORLD_RADIUS = 4000;
const BASE_FUEL = 4;            // fuel units per lightyear
const BASE_INTERDICT = 0.35;
const GATE_CHARGE = 3.0;        // s align time for a gate jump
const GATE_COOLDOWN = 0;
const DRIVE_COOLDOWN = 6.0;     // s
const JUMPING_DURATION = 1.2;   // s tunnel/blackout
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
const STATION_SECTOR_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_SECTOR_ID.set(station.id, sector.id);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Per-sector enemy archetype pools (real ids from src/data/enemies.js), picked by lawfulness/tier.
const LAWFUL_ENEMIES = ['patrol_lawman'];
const PIRATE_ENEMIES = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
const FRONTIER_ENEMIES = ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'];
const STARTER_SAFE_RADIUS = 1400;
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
const PALETTE_CLASS_BY_REF = new Map(Object.entries(SECTOR_PALETTE_CLASSES).map(([key, value]) => [value, key]));
const DRESSING_RADIUS = Object.freeze({
  place_lane_beacon: 18,
  place_nav_buoy: 12,
  place_mining_drone: 8,
  place_station_billboard: 28,
  place_conveyor_barge: 48,
  place_dead_hulk: 42,
  place_debris_chunk: 26,
  place_asteroid_seamed: 18,
  place_asteroid_rock_a: 15,
  place_asteroid_rock_b: 18,
  place_asteroid_rock_c: 10,
  place_asteroid_graffiti: 16,
});

export const world = {
  name: 'world',

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
    bus.on('world:requestRoute', (p) => this._onRequestRoute(p || {}));
    bus.on('world:requestSectorScan', () => this._beginScan());
    bus.on('ui:setCourse', (p) => this._onSetCourse(p || {}));
    bus.on('combat:lockChanged', (p) => this._onLockChanged(p || {}));
    bus.on('module:equipped', () => this._resolveShipModules());
    bus.on('module:unequipped', () => this._resolveShipModules());
    bus.on('ship:statsChanged', () => this._resolveShipModules());
    bus.on('field:depletedChanged', (p) => this._onFieldDepleted(p || {}));
    bus.on('spawn:request', (p) => this._onSpawnRequest(p || {}));
    bus.on('ui:purchaseSurveyData', (p) => this._onPurchaseSurveyData(p || {}));
    // Mark the boss POI defeated when the dreadnought dies, so it does not respawn on sector
    // re-entry or save reload. (The entity carries data.isBoss + data.bossSectorId/bossPoiId.)
    bus.on('entity:killed', (p) => {
      this._onBossKilled(p || {});
      this._onDurableEntityKilled(p || {});
    });
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
    if (!p || !p.id) return;
    const e = this.state.entities.get(p.id);
    const d = e && e.data;
    if (!d || !d.isBoss) return;
    const sectorId = d.bossSectorId || this.state.world.currentSectorId;
    const poiId = d.bossPoiId;
    if (!sectorId || !poiId) return;
    const disc = this._discoveryFor(sectorId);
    if (!disc.pois) disc.pois = {};
    const rec = disc.pois[poiId] || (disc.pois[poiId] = { discovered: true, identified: true });
    rec.bossDefeated = true;
    rec.discovered = true;
    rec.identified = true;
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
    this.bus.emit('boss:defeated', { sectorId, poiId, killerId: p.killerId || null });
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
   * @param {{fromJump?:boolean, via?:string, fromSectorId?:string, continuous?:boolean, noTeleport?:boolean, placePlayer?:boolean}} [opts]
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
    });

    const active = state.world.sectorContents[sectorId]
      || (state.world.sectorContents[sectorId] = this._emptySectorBag());
    state.world.activeSector = active;
    state.world.currentSectorId = sectorId;
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

    // Materialize / promote first so demotion never leaves the player with zero content mid-plan.
    for (const id of plan.materialize) {
      const tier = plan.tiers.get(id);
      this._ensureSectorMaterialized(id, tier);
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
      this._syncSectorTierContent(id, tier);
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
  _ensureSectorMaterialized(sectorId, tier) {
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
    this._spawnGates(sector, active, rng);
    this._spawnPOIs(sector, active, disc, rng);
    this._spawnHazards(sector, active);
    // Durable records rematerialize before ambient re-roll so identity/outcomes never reroll.
    const rematerialized = this._rematerializeSectorRecords(sectorId, active, tier);
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
  _syncSectorTierContent(sectorId, tier) {
    const state = this.state;
    const rec = state.world.residentSectors[sectorId];
    if (!rec || rec.tier === tier) {
      // Still may need FULL extras if bag was created as REDUCED.
      if (tier === RESIDENCY_TIER.FULL) this._promoteSectorToFull(sectorId);
      if (tier === RESIDENCY_TIER.REDUCED) this._stripSectorFullExtras(sectorId);
      this._setResidentMeta(sectorId, tier, rec && rec.reason);
      return;
    }
    if (tier === RESIDENCY_TIER.FULL) this._promoteSectorToFull(sectorId);
    if (tier === RESIDENCY_TIER.REDUCED) this._stripSectorFullExtras(sectorId);
    this._setResidentMeta(sectorId, tier, rec.reason);
  },

  _promoteSectorToFull(sectorId) {
    const state = this.state;
    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    const active = state.world.sectorContents[sectorId];
    if (!sector || !active) return;
    // Rematerialize durable combat/convoy/mission records first (idempotent).
    const rematerialized = this._rematerializeSectorRecords(sectorId, active, RESIDENCY_TIER.FULL);
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
  _rematerializeSectorRecords(sectorId, active, tier) {
    const state = this.state;
    const bag = ensureWorldRecords(state.world);
    // sectorSim remains recipe-only; world adopts current recipes only at FULL promotion.
    if (tier === RESIDENCY_TIER.FULL) this._reconcileEmbodimentRecords(sectorId, bag);
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
    let ent = null;
    if (rec.enemyTypeId && (rec.kind === RECORD_KIND.NPC || rec.kind === RECORD_KIND.MISSION_TARGET || rec.isBoss)) {
      const pos = { x: rec.pos.x, z: rec.pos.z };
      const level = Number.isFinite(rec.level) ? rec.level : 1;
      const spec = makeEnemySpawnSpec(rec.enemyTypeId, level, pos, { factionId: rec.factionId || undefined });
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
      ent = this.helpers.spawnEntity(spec);
    } else {
      const spec = spawnSpecFromRecord(rec);
      if (!spec) return null;
      // Convoy / freighter shell via ship def when present.
      if (rec.kind === RECORD_KIND.CONVOY && rec.shipDefId) {
        // Keep spawnSpecFromRecord shell; shipDefId already stamped on data.defId.
      }
      ent = this.helpers.spawnEntity(spec);
    }
    if (!ent) return null;
    applyRecordVitals(ent, rec);
    bindEntityToRecord(ent, rec);
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
    const n = stations.length;
    stations.forEach((st, i) => {
      // Authored anchors win; procedural ring is fallback for dev sectors missing pos.
      // RNG order preserved: roll ang/ringR before conversion even when pos is authored.
      const ang = (Math.PI * 2 * i) / Math.max(1, n) + rng() * 0.6;
      const ringR = wr * (0.28 + rng() * 0.22);
      const local = st.pos
        ? { x: st.pos.x, z: st.pos.z }
        : { x: Math.cos(ang) * ringR, z: Math.sin(ang) * ringR };
      const pos = this._toGlobal(local, sector.id);
      const size = st.size || 'M';
      const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
      const collisionRadius = size === 'L' ? 42 : size === 'S' ? 26 : 34;
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: st.factionId || sector.factionId, pos,
        radius: collisionRadius, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: st.id, stationTypeId: st.type, dockRadius,
          placeScale: dockRadius / 14,
          collisionRadius,
          services: st.services || [], factionId: st.factionId || sector.factionId,
          name: st.name, size,
          contested: !!st.contested, repGated: !!st.repGated, sectorId: sector.id,
          homeSectorId: sector.id,
          archetypeGlb: st.archetypeGlb || null,
          landmark: !!st.landmark,
          landmarkGlb: st.landmarkGlb || null,
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
    const params = { ...baseParams, _homeSectorId: sector.id };
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
      for (let i = 0; i < count; i++) {
        const a = this._spawnAsteroid(fdef, params, center, clusterR, rng);
        if (a) {
          this._stampHomeSector(a, sector.id);
          astIds.push(a.id);
        }
      }
      active.fields.push({ id: fdef.id, type: fdef.type, center: { x: center.x, z: center.z }, asteroidIds: astIds });
    }
  },

  _spawnAsteroid(fdef, params, center, clusterR, rng) {
    const def = AST_BY_ID.get(fdef.type) || AST_BY_ID.get('ast_common_rock');
    // disc-uniform scatter inside the cluster (center is already galactic-global)
    const ang = rng() * Math.PI * 2;
    const r = clusterR * Math.sqrt(rng());
    const pos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };

    const [hpLo, hpHi] = def.hp || [120, 520];
    const oreHP = Math.round(hpLo + (hpHi - hpLo) * rng());
    const [szLo, szHi] = def.sizeRange || [6, 14];
    const size = szLo + (szHi - szLo) * rng();
    const [yLo, yHi] = def.yieldU || [8, 22];
    // interpolate yield in lockstep with hp (matches mining's _defaultYield)
    const t = hpHi === hpLo ? 1 : (oreHP - hpLo) / (hpHi - hpLo);
    const yieldU = Math.max(1, Math.round(yLo + (yHi - yLo) * t));
    const tierCap = Math.min(def.tierCap, params.tierCap != null ? params.tierCap : def.tierCap);

    const ent = this.helpers.spawnEntity({
      type: 'asteroid', pos,
      radius: size, mass: 200 + size * 40, angVel: (rng() - 0.5) * 0.35,
      hull: oreHP, hullMax: oreHP, collides: true,
      data: {
        typeId: def.id, tier: def.tierCap, tierCap,
        oreHP, oreHPMax: oreHP, yieldU,
        size, pctEjected: 0, respawnSec: params.respawnSec || 120,
        fieldId: fdef.id,
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
      const placeId = poi.landmarkGlb
        ? String(poi.landmarkGlb).replace(/^places\//, '').replace(/\.glb$/, '')
        : null;
      const visualRadius = finitePositive(poi.visualRadius)
        ? Number(poi.visualRadius)
        : (placeId && DRESSING_RADIUS[placeId]) || (poi.landmark ? 24 : 10);
      const ent = this.helpers.spawnEntity({
        type: 'fx', factionId: poi.factionId || null, pos,
        radius: visualRadius, mass: 0, collides: false, ttl: Infinity,
        data: {
          poi: true, poiId: poi.id, poiType: poi.type, name: poi.name,
          hidden: !!poi.hidden, gatedBy: poi.gatedBy || null,
          scanRange: poi.scanRange || SCAN_RANGE, sectorId: sector.id,
          // V2 §6 / M3: claimable bodies carry their claim flag + size so the player can claim them.
          claimable: !!poi.claimable, size: poi.size || 'M',
          landmark: !!poi.landmark,
          landmarkGlb: poi.landmarkGlb || null,
          placeId,
          visualRadius,
          placeRadius: visualRadius,
          homeSectorId: sector.id,
        },
      });
      this._stampHomeSector(ent, sector.id);
      active.pois.push({
        id: ent.id, poiId: poi.id, type: poi.type, pos: { x: pos.x, z: pos.z },
        hidden: !!poi.hidden, claimable: !!poi.claimable,
      });
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
    const rockIds = ['place_asteroid_rock_a', 'place_asteroid_rock_b', 'place_asteroid_rock_c'];
    for (let i = 0; i < Math.min(3, fields.length); i++) {
      const field = fields[i];
      if (!field || !field.center) continue;
      const ang = rng() * Math.PI * 2;
      const dist = 210 + rng() * 170;
      this._spawnPlaceProp(active, sector, rockIds[i % rockIds.length], polarOffset(field.center, ang, dist), {
        paletteClass,
        rot: ang + Math.PI * 0.5,
        name: 'Belt Rock',
        placeScale: 1,
      });
      this._spawnPlaceProp(active, sector, i === 0 ? 'place_asteroid_seamed' : 'place_mining_drone', polarOffset(field.center, ang + 1.9, 120 + rng() * 130), {
        paletteClass,
        rot: ang,
        name: i === 0 ? 'Seamed Rock' : 'Mining Drone',
        placeScale: 1,
      });
    }
    if (stations[0] && fields[0] && fields[0].center) {
      const pos = midpoint(stations[0].pos, fields[0].center, 0.58);
      this._spawnPlaceProp(active, sector, 'place_conveyor_barge', pos, {
        paletteClass,
        rot: bearingToward(fields[0].center, stations[0].pos),
        name: 'Ore Conveyor',
        placeScale: 1,
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
      this._spawnPlaceProp(active, sector, 'place_asteroid_graffiti', polarOffset(fields[0].center, ang, 250 + rng() * 120), {
        paletteClass,
        rot: ang,
        name: 'Tagged Asteroid',
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
    this._spawnPlaceProp(active, sector, 'place_asteroid_seamed', polarOffset(anchor, base + 3.0, 330 + rng() * 140), {
      paletteClass,
      rot: base + Math.PI,
      name: 'Seam Signal',
    });
  },

  _spawnPlaceProp(active, sector, placeId, pos, options = {}) {
    if (!placeId || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
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
      },
    });
    this._stampHomeSector(ent, sector.id);
    active.dressing.push({ id: ent.id, placeId, pos: { x: pos.x, z: pos.z }, paletteClass });
    return ent;
  },

  // Hazard zones: pure data tags on activeSector (flight/combat/ai read these); no entity needed.
  // Centers are converted once from sector-local authorship into galactic-global.
  _spawnHazards(sector, active) {
    for (const hz of (sector.hazards || [])) {
      const center = this._toGlobal(hz.center, sector.id);
      active.hazards.push({
        type: hz.type, center: { x: center.x, z: center.z },
        radius: hz.radius, intensity: hz.intensity, moving: !!hz.moving,
      });
    }
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
    // spawn fewer ambient when the world is tight). The reservation is a per-sector allotment freed on
    // sector:exit (spawnBudget resets there); any unspent slots are released below. No budget → unchanged.
    const budget = this.helpers && this.helpers.spawnBudget;
    let grant = Math.min(count, AMBIENT_HEADROOM);
    if (budget && typeof budget.request === 'function') grant = budget.request(grant, 'world_ambient');
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
          // Never drop a hostile in the tutorial-safe bubble or on top of the player at entry.
          if (starterSafe > 0 && dist2(pos, sectorOrigin) < starterSafe * starterSafe) continue;
          if (player && player.pos && dist2(pos, player.pos) < ZONE_HOSTILE_PLAYER_CLEARANCE * ZONE_HOSTILE_PLAYER_CLEARANCE) continue;
        }
        const spec = makeEnemySpawnSpec(intent.archetypeId, clamp(intent.level, lvLo, lvHi + 2), pos, { factionId: intent.factionId });
        spec.data = spec.data || {};
        spec.data.ai = spec.data.ai || {};
        spec.data.ai.squadId = intent.squadId;   // one squad per zone → coherent formation on the zone
        spec.data.ai.doctrine = intent.doctrine;
        spec.data.ai.formation = intent.formation;
        spec.data.ai.zoneId = intent.zoneId;
        spec.data.ai.zoneName = intent.zoneName;
        tagAiSpawnContext(spec, sector, sec, intent.context);
        const ent = this.helpers.spawnEntity(spec);
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
        const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos);
        tagAiSpawnContext(spec, sector, sec, 'ambient');
        const ent = this.helpers.spawnEntity(spec);
        this._stampHomeSector(ent, sector.id);
        this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, typeId || 'npc', active);
        active.enemies.push(ent.id);
      }
    }
    // Return any reserved-but-unspent ambient slots (safe-zone skips / no valid pos) so the
    // encounterDirector can use them. Reserve/release keeps the shared cap honest (REVAMP 2.1 risk #1).
    if (budget && typeof budget.releaseSome === 'function') {
      const spawned = active.enemies.length - enemiesBefore;
      if (spawned < grant) budget.releaseSome('world_ambient', grant - spawned);
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
      for (let i = 0; i < hunters; i++) {
        const pos = this._directHostileSpawnPos(sector, active, rng, { x: px, z: pz }, HUNTER_SPAWN_MIN_RADIUS, HUNTER_SPAWN_MAX_RADIUS);
        if (!pos) continue;
        const level = Math.round(lvHi + (lvHi - lvLo) * 0.5 * rng()); // tough: top of band or above
        const spec = makeEnemySpawnSpec('patrol_lawman', clamp(level, lvLo, lvHi + 2), pos);
        tagAiSpawnContext(spec, sector, sec, 'bounty_hunter');
        const ent = this.helpers.spawnEntity(spec);
        this._stampHomeSector(ent, sector.id);
        this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, 'patrol_lawman:hunter', active);
        active.enemies.push(ent.id);
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
    // Place the boss near the POI marker (or a deterministic ring position if the POI is unplaced).
    // Convert sector-local authorship once into galactic-global.
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const local = bossPoi.pos
      ? { x: bossPoi.pos.x, z: bossPoi.pos.z }
      : (() => { const ang = rng() * Math.PI * 2, r = wr * 0.45; return { x: Math.cos(ang) * r, z: Math.sin(ang) * r }; })();
    const pos = this._toGlobal(local, sector.id);
    const [lvLo, lvHi] = sector.enemyLevel || [10, 15];
    const level = clamp(lvHi, lvLo, 15);
    const spec = makeEnemySpawnSpec('dreadnought_boss', level, pos);
    spec.data = spec.data || {};
    spec.data.isBoss = true;          // flag so the kill handler can find this entity cheaply
    spec.data.bossPoiId = bossPoi.id; // links back to the discovery record to mark defeated
    spec.data.bossSectorId = sector.id;
    const ent = this.helpers.spawnEntity(spec);
    this._stampHomeSector(ent, sector.id);
    this._assignDurableRecordId(ent, sector.id, RECORD_KIND.NPC, `boss:${bossPoi.id}`, active);
    active.enemies.push(ent.id);
    active.boss = { entityId: ent.id, poiId: bossPoi.id };
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
    const state = this.state;
    const player = state.entities.get(state.playerId);
    if (!player) return; // world never spawns the player; main.js/ships own that
    player.pos.x = entryPoint.x; player.pos.z = entryPoint.z; player.pos.y = 0;
    player.prevPos.copy(player.pos);
    player.vel.x = 0; player.vel.z = 0;
    player.rot = entryPoint.heading || 0; player.prevRot = player.rot;
    if (player.flags) player.flags.noInterp = true; // skip interpolation across the teleport
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
    this._tickScan(dt, state);
    this._tickHazards(dt, state);
    this._tickZoneLabel(state);
    this._tickPOIScan(state);
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
    jump.chargeT += dt;
    this.bus.emit('jump:chargeTick', { progress: clamp(jump.chargeT / Math.max(0.01, jump.chargeNeeded), 0, 1) });
    if (jump.chargeT >= jump.chargeNeeded) {
      // consume fuel now (charge complete)
      this._spendFuel(jump._fuelCost || 0);
      jump.state = 'JUMPING';
      jump.chargeT = 0;
      jump._jumpT = 0;
      const player = state.entities.get(state.playerId);
      const fromPos = player ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
      this.bus.emit('jump:start', { from: state.world.currentSectorId, to: jump.targetSectorId, via: jump.via, fromPos });
    }
  },

  // --- jump: JUMPING (brief tunnel) → arrive --------------------------------
  _tickJumping(dt, state) {
    const jump = state.jump;
    jump._jumpT = (jump._jumpT || 0) + dt;
    if (jump._jumpT < JUMPING_DURATION) return;

    const target = jump.targetSectorId;
    const via = jump.via;
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
      ambushCount = 1 + Math.floor(state.rng() * (1 + tier));
      this._spawnAmbush(sector, ambushCount);
    }

    const player = state.entities.get(state.playerId);
    const toPos = player ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    this.bus.emit('jump:arrive', { sectorId: target, interdicted, ambushCount, toPos });

    jump.state = via === 'gate' ? (GATE_COOLDOWN > 0 ? 'COOLDOWN' : 'IDLE') : 'COOLDOWN';
    jump.cooldownT = via === 'gate' ? GATE_COOLDOWN : DRIVE_COOLDOWN;
    jump.targetSectorId = null;
    jump.via = null;
    jump.chargeNeeded = 0;
    jump._fuelCost = 0;
  },

  _spawnAmbush(sector, count, origin = null) {
    if (!sector || count <= 0) return;
    const player = this.state.entities.get(this.state.playerId);
    const active = this.state.world.activeSector || null;
    if (this._playerDockedNoHostileSpawnZone(player)) return;
    const px = origin ? origin.x : (player ? player.pos.x : 0);
    const pz = origin ? origin.z : (player ? player.pos.z : 0);
    const pool = this._enemyPool(sector);
    const rng = this.state.world.rng || this.state.rng;
    const [lvLo, lvHi] = sector.enemyLevel || [1, 2];
    const placed = [];
    for (let i = 0; i < count; i++) {
      const typeId = pool[Math.floor(rng() * pool.length)];
      const level = Math.round(lvLo + (lvHi - lvLo) * 0.6);
      const pos = this._directHostileSpawnPos(sector, active, rng, { x: px, z: pz }, AMBUSH_SPAWN_MIN_RADIUS, AMBUSH_SPAWN_MAX_RADIUS);
      if (!pos) continue;
      const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos);
      tagAiSpawnContext(spec, sector, sector, origin ? 'spawn_request' : 'interdiction');
      const ent = this.helpers.spawnEntity(spec);
      this._stampHomeSector(ent, sector.id);
      placed.push(ent.id);
    }
    if (!placed.length) return;
    if (this.state.world.activeSector) this.state.world.activeSector.enemies.push(...placed);
    this.bus.emit('interdiction:triggered', { sectorId: sector.id, ambushCount: placed.length, spawnPos: { x: px, z: pz } });
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
    this._spawnAmbush(sector, req.count || 1, req.position || null);
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

    // gate toll (high-sec customs) — charge credits via economy (single-writer)
    if (via === 'gate') {
      const toll = this._gateToll(target);
      if (toll > 0 && ((state.player && state.player.credits) | 0) < toll) return reject('credits');
      if (toll > 0) this.bus.emit('economy:chargeCredits', { amount: toll, reason: 'gate_toll' });
    }

    const chargeNeeded = via === 'gate' ? GATE_CHARGE : drive.baseCharge * (edgeDist / 4);
    jump.state = 'CHARGING';
    jump.targetSectorId = targetSectorId;
    jump.via = via;
    jump.chargeT = 0;
    jump.chargeNeeded = chargeNeeded;
    jump._fuelCost = fuelCost;
    this.bus.emit('jump:chargeStart', { targetSectorId, via, chargeNeeded });
  },

  _abortCharge(reason) {
    const jump = this.state.jump;
    if (jump.state !== 'CHARGING') return;
    // Fuel isn't spent until completion; refund half as goodwill to the tank (capped at max).
    if (jump.via === 'drive' && jump._fuelCost) {
      this._addFuel((jump._fuelCost * FUEL_REFUND_FRAC) | 0);
    }
    jump.state = 'IDLE';
    jump.targetSectorId = null; jump.via = null;
    jump.chargeT = 0; jump.chargeNeeded = 0; jump._fuelCost = 0;
    this.bus.emit('jump:chargeAbort', { reason });
  },

  // =========================================================================================
  // route planning (Dijkstra) — handles world:requestRoute / ui:setCourse
  // =========================================================================================
  _onRequestRoute({ targetSectorId, mode }) {
    const route = this.computeRoute(targetSectorId, mode || 'fuel');
    this.state.nav.route = route;
    return route;
  },

  _onSetCourse(payload = {}) {
    const pos = sanitizeCoursePos(payload.pos);
    if (pos) {
      const label = String(payload.label || payload.reason || 'Autopilot fix');
      const targetEntityId = payload.targetEntityId != null ? payload.targetEntityId : null;
      const arrivalRadius = Number.isFinite(payload.arrivalRadius)
        ? Math.max(12, Math.min(500, payload.arrivalRadius))
        : 36;
      this.state.nav.route = null;
      this.state.nav.autoTravel = false;
      this.state.nav.waypoint = {
        kind: payload.waypointKind || payload.kind || 'local',
        label,
        reason: payload.reason || label,
        pos,
      };
      if (targetEntityId != null) this.state.nav.waypoint.targetEntityId = targetEntityId;
      this.state.nav.autopilot = {
        active: payload.autopilot !== false,
        target: pos,
        targetEntityId,
        label,
        arrivalRadius,
        status: 'armed',
      };
      this.bus.emit('nav:waypoint', this.state.nav.waypoint);
      this.bus.emit('nav:autopilot', this.state.nav.autopilot);
      return this.state.nav.autopilot;
    }

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
      const dx = ent.pos.x - player.pos.x, dz = ent.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const sr = ((ent.data && ent.data.scanRange) || SCAN_RANGE) * (1 + 0.25 * scannerTier);
      if (dist <= sr) {
        if (!rec.discovered) { rec.discovered = true; this.bus.emit('poi:discovered', { poiId: p.poiId, type: p.type }); }
        if (dist <= sr * 0.5) {
          rec.identified = true;
          this.bus.emit('poi:identified', { poiId: p.poiId, type: p.type, reward: (ent.data && ent.data.reward) || null });
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
    // If ships exposes fuelMax / jumpDriveTier / scannerTier, honor them; else keep defaults.
    const state = this.state;
    const player = state.entities.get(state.playerId);
    const derived = player && player.data && player.data.derived;
    if (!derived) return;
    if (derived.fuelMax != null && derived.fuelMax > 0) {
      const wasFull = state.fuel.current >= state.fuel.max;
      state.fuel.max = derived.fuelMax;
      if (wasFull || state.fuel.current > state.fuel.max) state.fuel.current = Math.min(state.fuel.current, state.fuel.max);
    }
    if (derived.jumpDriveTier && DRIVE_TIERS[derived.jumpDriveTier]) this._driveTierId = derived.jumpDriveTier;
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
    return {
      currentSectorId: state.world.currentSectorId,
      discovery: state.world.discovery,
      scanPings: state.world.scanPings || {},
      pendingSpawns: state.world.pendingSpawns || {},
      // v11: durable global-space entity records (never frameOrigin / residentSectors / sectorContents).
      records: serializeRecordsBag(ensureWorldRecords(state.world)),
      // Latest sectorSim recipes are bounded per sector and needed because sectorSim restores its
      // applied-id set on Continue (it correctly will not re-emit the same epoch).
      embodiment: serializeEmbodimentCache(state.world.embodiment),
      // v9: entity/overlay positions are already galactic-global. Persist schema tag only —
      // frameOrigin / frameOriginSeq are runtime boundary values and must not re-offset poses.
      coordinateSchema: state.world.coordinateSchema || 'global_v1',
      sectorOwners: this._ownerOverlay(),
      jump: {
        state: state.jump.state, targetSectorId: state.jump.targetSectorId, via: state.jump.via,
        chargeT: state.jump.chargeT, chargeNeeded: state.jump.chargeNeeded, cooldownT: state.jump.cooldownT,
      },
      fuel: { current: state.fuel.current, max: state.fuel.max },
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
    state.world.records = createEmptyRecordsBag();
    state.world.embodiment = createEmptyEmbodimentCache();
    state.world.residentSectors = {};
    state.world.sectorContents = {};
    state.world.activeSector = this._emptySectorBag();
    state.world.currentSectorId = null;
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
    state.fuel = { current: 100, max: 100 };
    state.nav.route = null; state.nav.autoTravel = false; state.nav.waypoint = null;
    state.nav.autopilot = { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
  },
};

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
