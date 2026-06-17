// World / Sectors / Navigation system (ARCHITECTURE §2.3 step 13, §3.8, design 05).
//
// Owns: the sector graph (loaded copy of SECTORS), the active sector's live contents
// (stations / asteroid fields / enemies / POIs / gates), the fog-of-war discovery overlay,
// the jump state machine (IDLE→CHARGING→JUMPING→COOLDOWN), fuel, hazard membership, POI scan
// reveal, and the Dijkstra route helper.
//
// enterSector(sectorId, {fromJump}) is the entry point main.js calls at boot
//   (registry.get('world').enterSector(startSectorId)). It despawns the previous sector's
//   scoped entities (NOT the player), spawns the new sector from data, sets
//   state.world.currentSectorId / activeSector / state.bounds, places the player at an
//   entry point, and emits sector:enter. It does NOT auto-run on game:started.
//
// Determinism (§0.5): all generation uses a per-sector seeded stream
//   state.world.rng = mulberry32(hash32(meta.seed, sectorId, seq)); never Math.random().
// Single-writer (§0.6): world owns world.*/jump/fuel/nav; it emits economy:chargeCredits for
//   gate tolls and never writes credits/cargo/rep directly. (Radiation hull drain is an
//   environmental effect applied to the entity hull, which has no separate combat owner.)
import { SECTORS, dangerIndex } from '../data/sectors.js';
import { ASTEROIDS, FIELDS } from '../data/mining.js';
import { makeEnemySpawnSpec } from './combat.js';

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

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Per-sector enemy archetype pools (real ids from src/data/enemies.js), picked by lawfulness/tier.
const LAWFUL_ENEMIES = ['patrol_lawman', 'reaver_pirate'];
const PIRATE_ENEMIES = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
const FRONTIER_ENEMIES = ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'];

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
    if (!state.world.pendingSpawns || typeof state.world.pendingSpawns !== 'object') state.world.pendingSpawns = {};

    // Runtime-only flags (not serialized).
    this._combatLock = false;     // last combat:lockChanged value
    this._scanT = 0;              // active sector-scan elapsed
    this._scanning = false;
    this._driveTierId = null;     // resolved from equipped jump-drive module (null → T1 default)
    this._sectorSeq = 0;          // monotonic, disambiguates re-entry into the same sector
    this._hazardSet = new Set();  // hazard zone indices the player is currently inside

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
  },

  // =========================================================================================
  // enterSector — load a sector's contents (the spine of the system)
  // =========================================================================================
  /**
   * Despawn the previous sector's scoped entities, spawn the target sector from data, set
   * world/bounds, place the player at an entry point, and emit sector:enter.
   * @param {string} sectorId
   * @param {{fromJump?:boolean, via?:string, fromSectorId?:string}} [opts]
   */
  enterSector(sectorId, opts = {}) {
    const state = this.state;
    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
    if (!sector) { console.warn('[world] enterSector: unknown sector', sectorId); return null; }

    const fromSectorId = opts.fromSectorId || state.world.currentSectorId || null;
    // Despawn the OLD sector's contents (everything sector-scoped except the player).
    if (state.world.currentSectorId) {
      this.bus.emit('sector:exit', { sectorId: state.world.currentSectorId });
    }
    this._despawnSectorEntities();

    // Per-sector deterministic RNG stream (§0.5).
    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, this._sectorSeq++));
    const rng = state.world.rng;

    // Discovery overlay bookkeeping (§3.8) — entering reveals the sector + one hop.
    const disc = this._discoveryFor(sectorId);
    const firstVisit = !disc.discovered;
    disc.discovered = true;
    disc.visitedCount = (disc.visitedCount || 0) + 1;

    // World radius / bounds.
    const worldRadius = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    state.bounds = { radius: worldRadius, hardRadius: worldRadius + 500, center: { x: 0, z: 0 } };

    // Compute the entry point: come in near the gate to the sector we arrived from.
    const entryPoint = this._entryPointFor(sector, fromSectorId, rng);
    state.world.entryPoint = entryPoint;

    // Build the live activeSector instance (entity-id handles for everything we spawn).
    const active = { stations: [], fields: [], hazards: [], pois: [], gates: [], enemies: [] };

    this._spawnStations(sector, active, rng);
    this._spawnFields(sector, active, disc, rng);
    this._spawnGates(sector, active, rng);
    this._spawnPOIs(sector, active, disc, rng);
    this._spawnHazards(sector, active);
    this._spawnEnemies(sector, active, rng);

    state.world.activeSector = active;
    state.world.currentSectorId = sectorId;
    this._hazardSet = new Set();

    // Place the player ship at the entry point (move existing entity; world never spawns the player).
    this._placePlayer(entryPoint);
    this._resolveShipModules();
    this._flushPendingSpawns(sectorId, sector);

    if (firstVisit) {
      this.bus.emit('sector:discovered', { sectorId });
      this.bus.emit('toast', { text: `New sector discovered: ${sector.name}`, kind: 'info', ttl: 4 });
    }
    // Reveal direct neighbors on the map ("see one hop ahead") without marking them visited.
    for (const nb of (sector.neighbors || [])) this._discoveryFor(nb);

    this.bus.emit('sector:enter', { sectorId, sector, entryPoint, firstVisit });
    return active;
  },

  // --- despawn everything sector-scoped (NOT the player) ------------------------------------
  _despawnSectorEntities() {
    const state = this.state;
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.id === state.playerId) continue;          // keep the flyable ship
      e.alive = false;
      // Emit cleanup so render disposes meshes immediately (we run outside the sim sweep).
      this.bus.emit('entity:destroyed', {
        id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId,
      });
      state.entities.delete(e.id);
      state.freeIds.push(e.id);
      const last = list.pop();
      if (i < list.length) list[i] = last;
    }
  },

  // --- spawn helpers ------------------------------------------------------------------------
  _spawnStations(sector, active, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const stations = sector.stations || [];
    const n = stations.length;
    stations.forEach((st, i) => {
      // Spread stations on a ring inside the playfield; clear of the origin/entry point.
      const ang = (Math.PI * 2 * i) / Math.max(1, n) + rng() * 0.6;
      const ringR = wr * (0.28 + rng() * 0.22);
      const pos = { x: Math.cos(ang) * ringR, z: Math.sin(ang) * ringR };
      const dockRadius = st.size === 'L' ? 90 : st.size === 'S' ? 60 : 72;
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: st.factionId || sector.factionId, pos,
        radius: dockRadius, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: st.id, stationTypeId: st.type, dockRadius,
          services: st.services || [], factionId: st.factionId || sector.factionId,
          name: st.name, size: st.size || 'M',
          contested: !!st.contested, repGated: !!st.repGated, sectorId: sector.id,
        },
      });
      active.stations.push({ id: ent.id, stationId: st.id, pos });
    });
  },

  // Asteroid FIELDS: clusters of real ASTEROIDS-type rocks so mining oreTables resolve.
  _spawnFields(sector, active, disc, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const params = FIELDS[sector.tier] || FIELDS[3] || FIELDS[1];
    const fieldDefs = sector.fields || [];
    if (!fieldDefs.length) return;

    // Split the sector's asteroid budget across its declared fields, weighted by countWeight.
    const totalWeight = fieldDefs.reduce((s, f) => s + (f.countWeight || 1), 0) || 1;
    const budget = params.astCount || 80;

    for (const fdef of fieldDefs) {
      const depleted = (disc.fieldsDepleted && disc.fieldsDepleted[fdef.id]) || 0;
      const share = (fdef.countWeight || 1) / totalWeight;
      const count = Math.max(4, Math.round(budget * share * (1 - 0.6 * depleted)));
      // Cluster center somewhere in the outer half of the disc.
      const cang = rng() * Math.PI * 2;
      const cR = wr * (0.35 + rng() * 0.4);
      const center = { x: Math.cos(cang) * cR, z: Math.sin(cang) * cR };
      const clusterR = params.clusterRadius || 450;
      const astIds = [];
      for (let i = 0; i < count; i++) {
        const a = this._spawnAsteroid(fdef, params, center, clusterR, rng);
        if (a) astIds.push(a.id);
      }
      active.fields.push({ id: fdef.id, type: fdef.type, center, asteroidIds: astIds });
    }
  },

  _spawnAsteroid(fdef, params, center, clusterR, rng) {
    const def = AST_BY_ID.get(fdef.type) || AST_BY_ID.get('ast_common_rock');
    // disc-uniform scatter inside the cluster
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

    return this.helpers.spawnEntity({
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
  },

  // Jump GATES: one per outbound edge, placed on the disc rim toward the neighbor's map position.
  _spawnGates(sector, active, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    for (const nbId of (sector.neighbors || [])) {
      const nb = safeSector(this.state, nbId);
      const ang = this._bearingTo(sector, nb, rng);
      const gateR = wr * 0.82;
      const pos = { x: Math.cos(ang) * gateR, z: Math.sin(ang) * gateR };
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: sector.factionId, pos,
        radius: 70, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: null, isGate: true, gateTo: nbId, dockRadius: 70,
          services: [], factionId: sector.factionId, name: `Gate → ${nb ? nb.name : nbId}`,
          sectorId: sector.id,
        },
      });
      active.gates.push({ id: ent.id, to: nbId, pos });
    }
    // Optional wormhole edge (gated) as a special gate.
    if (sector.wormholeTo) {
      const ang = rng() * Math.PI * 2;
      const pos = { x: Math.cos(ang) * wr * 0.6, z: Math.sin(ang) * wr * 0.6 };
      const ent = this.helpers.spawnEntity({
        type: 'station', factionId: sector.factionId, pos,
        radius: 80, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
        data: {
          stationId: null, isGate: true, isWormhole: true, gateTo: sector.wormholeTo.sectorId,
          gatedBy: sector.wormholeTo.gatedBy, dockRadius: 80, services: [],
          factionId: sector.factionId, name: 'Wormhole', sectorId: sector.id,
        },
      });
      active.gates.push({ id: ent.id, to: sector.wormholeTo.sectorId, pos, wormhole: true });
    }
  },

  // POIs: tracked in the discovery overlay; spawn a lightweight marker entity for in-range scan.
  _spawnPOIs(sector, active, disc, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    if (!disc.pois) disc.pois = {};
    for (const poi of (sector.pois || [])) {
      const ang = rng() * Math.PI * 2;
      const r = wr * (0.2 + rng() * 0.6);
      const pos = poi.pos ? { x: poi.pos.x, z: poi.pos.z } : { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
      if (!disc.pois[poi.id]) disc.pois[poi.id] = { discovered: false, identified: false };
      const ent = this.helpers.spawnEntity({
        type: 'fx', factionId: poi.factionId || null, pos,
        radius: 6, mass: 0, collides: false, ttl: Infinity,
        data: {
          poi: true, poiId: poi.id, poiType: poi.type, name: poi.name,
          hidden: !!poi.hidden, gatedBy: poi.gatedBy || null,
          scanRange: poi.scanRange || SCAN_RANGE, sectorId: sector.id,
        },
      });
      active.pois.push({ id: ent.id, poiId: poi.id, type: poi.type, pos, hidden: !!poi.hidden });
    }
  },

  // Hazard zones: pure data tags on activeSector (flight/combat/ai read these); no entity needed.
  _spawnHazards(sector, active) {
    for (const hz of (sector.hazards || [])) {
      active.hazards.push({
        type: hz.type, center: { x: hz.center.x, z: hz.center.z },
        radius: hz.radius, intensity: hz.intensity, moving: !!hz.moving,
      });
    }
  },

  // Enemy spawns sized by enemyDensity / enemyLevel via makeEnemySpawnSpec (combat).
  _spawnEnemies(sector, active, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    const density = sector.enemyDensity || 0;
    if (density <= 0) return;
    const di = dangerIndex(sector);
    const count = Math.min(10, Math.round(density * 8 + di * 2 + rng() * 1.5));
    const pool = this._enemyPool(sector);
    const [lvLo, lvHi] = sector.enemyLevel || [1, 2];
    for (let i = 0; i < count; i++) {
      const typeId = pool[Math.floor(rng() * pool.length)];
      const level = Math.round(lvLo + (lvHi - lvLo) * (rng() * 0.6 + 0.4 * (1 - sector.security)));
      const ang = rng() * Math.PI * 2;
      const r = wr * (0.3 + rng() * 0.5);
      const pos = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
      const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos);
      const ent = this.helpers.spawnEntity(spec);
      active.enemies.push(ent.id);
    }
    // WANTED hunters (V2 §20b / cut-list #15): if the player is hot, bounty-hunter lawful patrols
    // spawn specifically to hunt them — real consequence for piracy. Count scales with heat; they
    // drop near the player so the threat is immediate, not ambient. High-sec already has patrols,
    // so hunters matter most in the lawless fringe where a criminal hides.
    const heatVal = this.state.player && this.state.player.heat;
    if (typeof heatVal === 'number' && heatVal >= 0.15 && sector.security < 0.6) {
      const hunters = Math.min(4, Math.round(heatVal * 4 + 0.5));
      const player = this.state.entities.get(this.state.playerId);
      const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
      for (let i = 0; i < hunters; i++) {
        const ang = rng() * Math.PI * 2;
        const r = 180 + rng() * 220; // drop in a ring around the player — closing in
        const pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
        const level = Math.round(lvHi + (lvHi - lvLo) * 0.5 * rng()); // tough: top of band or above
        const spec = makeEnemySpawnSpec('patrol_lawman', clamp(level, lvLo, lvHi + 2), pos);
        const ent = this.helpers.spawnEntity(spec);
        active.enemies.push(ent.id);
      }
    }
  },

  _enemyPool(sector) {
    if (sector.security >= 0.6) return LAWFUL_ENEMIES;
    if (sector.tier >= 3) return FRONTIER_ENEMIES;
    return PIRATE_ENEMIES;
  },

  // --- entry point + player placement -------------------------------------------------------
  _entryPointFor(sector, fromSectorId, rng) {
    const wr = sector.worldRadius || DEFAULT_WORLD_RADIUS;
    if (fromSectorId && (sector.neighbors || []).includes(fromSectorId)) {
      // arrive near the gate back to where we came from, facing inward
      const ang = this._bearingTo(sector, safeSector(this.state, fromSectorId), rng);
      const r = wr * 0.78;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const heading = Math.atan2(-z, -x); // face origin
      return { x, z, heading };
    }
    // first/home spawn: near origin
    return { x: 0, z: 0, heading: 0 };
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

    this._tickScan(dt, state);
    this._tickHazards(dt, state);
    this._tickPOIScan(state);
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

    // Load the new sector (re-seeds world.rng, despawns old, spawns new, places player).
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
    const px = origin ? origin.x : (player ? player.pos.x : 0);
    const pz = origin ? origin.z : (player ? player.pos.z : 0);
    const pool = this._enemyPool(sector);
    const rng = this.state.world.rng || this.state.rng;
    const [lvLo, lvHi] = sector.enemyLevel || [1, 2];
    const placed = [];
    for (let i = 0; i < count; i++) {
      const typeId = pool[Math.floor(rng() * pool.length)];
      const level = Math.round(lvLo + (lvHi - lvLo) * 0.6);
      const ang = rng() * Math.PI * 2;
      const r = 280 + rng() * 160; // short range "ambush pocket"
      const pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
      const spec = makeEnemySpawnSpec(typeId, clamp(level, lvLo, lvHi), pos);
      const ent = this.helpers.spawnEntity(spec);
      placed.push(ent.id);
    }
    if (this.state.world.activeSector) this.state.world.activeSector.enemies.push(...placed);
    this.bus.emit('interdiction:triggered', { sectorId: sector.id, ambushCount: count, spawnPos: { x: px, z: pz } });
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

  _onSetCourse({ sectorId }) {
    const route = this.computeRoute(sectorId, 'fuel');
    this.state.nav.route = route;
    this.state.nav.autoTravel = true;
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
      // pop the smallest-dist node (linear scan; graph is tiny — 10 nodes)
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
    const inside = this._hazardSet;
    const nowInside = new Set();
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
    this._hazardSet = nowInside;
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
    return {
      currentSectorId: state.world.currentSectorId,
      discovery: state.world.discovery,
      pendingSpawns: state.world.pendingSpawns || {},
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
    if (data.discovery) state.world.discovery = data.discovery;
    state.world.pendingSpawns = (data.pendingSpawns && typeof data.pendingSpawns === 'object') ? data.pendingSpawns : {};
    if (data.currentSectorId) state.world.currentSectorId = data.currentSectorId;
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
    // the saved sector to repopulate it (calling enterSector after deserialize).
  },

  newGame() {
    const state = this.state;
    // reset overlay + jump/fuel to defaults; the home sector is entered by main.js post-boot.
    state.world.discovery = {};
    state.world.pendingSpawns = {};
    state.jump.state = 'IDLE'; state.jump.targetSectorId = null; state.jump.via = null;
    state.jump.chargeT = 0; state.jump.chargeNeeded = 0; state.jump.cooldownT = 0;
    state.fuel = { current: 100, max: 100 };
    state.nav.route = null; state.nav.autoTravel = false;
  },
};

// Module-private helper (kept out of the singleton so `this` stays simple in callers).
function safeSector(state, id) {
  return state.world.sectors[id] || SECTOR_BY_ID.get(id) || null;
}
