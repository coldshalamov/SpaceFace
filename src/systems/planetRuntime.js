// PQ-013 / SF-14 — planetary site runtime: THE registration adapter + band state machine + skim
// harvest + staged reentry (BUILD_PLAN_CORRECTED.md STEP 12).
//
// Q18 IDENTITY TRANSACTION. The Atlas zone record (src/data/authoredPlaces.js ZONE_TETHYS_ANVIL)
// is the canonical identity. This system is the ONE registration adapter: when the player's sector
// carries an authored site (src/data/planets.js), it binds — in one transaction — the visual/
// physics body (a 'planet' entity with a static exclusion circle), the attraction profile (an
// annular WELL registered into the PQ-012 field kernel through fields.registerExternal — the SAME
// kernel, SAME membrane, SAME predictor seam as every field), the atmosphere band state machine,
// and the published runtime (state.planet). No physics planet without an atlas record: the adapter
// refuses to spawn unless the zone record resolves and its converted global centre is where the
// site will live. Everything unwinds on sector exit.
//
// AUTHORITY BOUNDARIES (single-writer law):
//   • forces      — ONLY the field kernel (attraction) and queuePhysicsImpulse (bounded drag +
//                   recovery assist; additive, never a control overwrite — dockingCorridor idiom).
//   • hull damage — ONLY combat.kernel.routeDamage with the named damageType 'reentry_burn';
//                   terminal destruction is an ordinary hull death (wreck/aftermath compat free).
//   • cargo       — ONLY the cargo system's addCargo (mining idiom; partial-add handled).
//   • energy      — NOT touched. The emergency burn requires HELD BOOST, whose energy cost the
//                   propulsion kernel already owns; this system adds only heat + the assist shape
//                   (which opposes tangential velocity — the momentum cost). Zero new writers.
//
// DETERMINISM / GOLDEN SAFETY (three independent layers, the fields.js recipe):
//   1. PLANET_FLAGS Tier-B — OFF under node, so sf-sim / the 47a golden never construct anything.
//   2. The site lives in sector_tethys_junction; the 47a scenario never enters it.
//   3. This system is NOT in sf-sim.mjs's curated list.
// All math is pure in (positions, authored constants, dt, state.simTime); no rng, no wall clock.
//
// SAVE POLICY: transient (the fields.js precedent — "deliberately sidesteps the save-schema
// mutex"). state.planet normalizes away on save:loaded/game:new and the adapter re-registers from
// authored data on the next tick, so the IDENTITY (the Atlas zone id), the player's position, and
// all harvested cargo persist through their existing owners. Finite released Orchard pods retain
// heat/stage in their existing persistent entity envelope; ordinary ship heat/stage — seconds-lived,
// escape-window-forgiving scalars — reset. No save version bump, no golden hash movement.

import { PLANET_SITE, planetSitesForSector, planetFlag, classifyPlanetRegion, PLANET_REGION_RANK, ANVIL_SLING_WITNESS, anvilSlingWitnessPose } from '../data/planets.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { queuePhysicsImpulse, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { occupantGenerationOf } from '../core/entity.js';
import { ANVIL_ORCHARD, createOrchardRecord, normalizeOrchardRecord, orchardHistoryFitsTick } from '../data/anvilOrchard.js';
import { ORCHARD_GEOMETRY, orchardFrameBodySpec } from '../data/anvilOrchardBody.js';
import { createOrchardMotorState } from '../core/anvilOrchardNative.js';
import { isOrchardFrame, isOrchardPod } from '../data/anvilOrchardIdentity.js';

const MAX_TRACKED_SHIPS = 8;   // bounded per-tick work: player + the nearest 7 ships in the bands
const MAX_AFTERMATH = 4;       // bounded presentation memory of recent plunge terminations
const REGION_ORDER = ['outside', 'influence', 'sling', 'skim', 'danger', 'reentry'];

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function nowOf(state) { return Number.isFinite(state.simTime) ? state.simTime : state.tick / 60; }
function boundLife(entity, id, generation) {
  return !!entity && entity.id === id && Number.isSafeInteger(generation) && generation > 0
    && occupantGenerationOf(entity) === generation;
}

function defaultRuntime() {
  return {
    schemaVersion: 1,      // transient — normalized away on load (fields.js precedent)
    active: false,
    siteId: null,
    zoneId: null,          // THE canonical Atlas identity (save/nav/mission reference)
    sectorId: null,
    entityId: null,        // the spawned 'planet' entity (visual + static exclusion body)
    entityGeneration: null,
    witnessId: null,
    witnessGeneration: null,
    orchardFrameId: null,
    orchardFrameGeneration: null,
    fieldId: null,         // the annular attraction profile in the PQ-012 kernel
    center: { x: 0, z: 0 },// global centre (converted once from the authored sector-local anchor)
    player: {
      region: 'outside', regionRank: 0, r: Infinity,
      heat: 0, stage: null, stageAt: 0, outwardS: 0, burnNextAt: 0,
      collectorOn: false, pendingShallow: 0, pendingRich: 0, harvestedUnits: 0,
      recoveryBurn: false, commitCueAt: -Infinity,
    },
    ships: {},             // non-player exposure: nearest ships + at most three released Orchard pods
    aftermath: [],         // [{x,z,at,until}] recent plunge terminations (presentation memory)
    telemetry: { tracked: 0, inBands: 0, burnsRouted: 0, harvestUnits: 0, dragImpulses: 0 },
  };
}

function ensureRuntime(state) {
  const p = state.planet;
  if (p && p.schemaVersion === 1) return p;
  state.planet = defaultRuntime();
  return state.planet;
}

function newShipRecord(entity) {
  return { occupantGeneration: occupantGenerationOf(entity), region: 'outside', regionRank: 0, r: Infinity, heat: 0, stage: null, stageAt: 0, outwardS: 0, burnNextAt: 0, bandFirsts: null };
}

// Only finite Orchard cargo persists its thermal history. The existing entity save owner
// carries this enumerable top-level field; the strict native source data tree is untouched.
// A restore may remap numeric ids/lifetimes, so persistent binding is site + finite lot;
// native-ready admission is still required before this history can affect any current body.
const ORCHARD_THERMAL_KEYS = ['schemaVersion', 'siteId', 'lotId', 'savedAt', 'region',
  'heat', 'stage', 'stageAt', 'outwardS', 'burnNextAt'];
function orchardThermalRecord(entity, site, now) {
  const rec = newShipRecord(entity);
  const saved = Object.getOwnPropertyDescriptor(entity, 'orchardThermalExposure')?.value;
  if (!saved || Object.getPrototypeOf(saved) !== Object.prototype
    || Object.keys(saved).length !== ORCHARD_THERMAL_KEYS.length
    || !ORCHARD_THERMAL_KEYS.every(key => {
      const d = Object.getOwnPropertyDescriptor(saved, key);
      return d && 'value' in d;
    }) || saved.schemaVersion !== 1 || saved.siteId !== site.id
    || saved.lotId !== entity.data.worldRecordId
    || !Number.isFinite(saved.savedAt) || saved.savedAt < 0 || saved.savedAt > now
    || !REGION_ORDER.includes(saved.region)
    || !Number.isFinite(saved.heat) || saved.heat < 0 || saved.heat > 1
    || ![null, 'skim', 'commit', 'breakup', 'descent'].includes(saved.stage)
    || !Number.isFinite(saved.stageAt) || saved.stageAt < 0 || saved.stageAt > saved.savedAt
    || !Number.isFinite(saved.outwardS) || saved.outwardS < 0 || saved.outwardS > 60
    || !Number.isFinite(saved.burnNextAt) || saved.burnNextAt < 0
    || saved.burnNextAt > saved.savedAt + 0.500001) return rec;
  for (const key of ['region', 'heat', 'stage', 'stageAt', 'outwardS', 'burnNextAt']) rec[key] = saved[key];
  rec.regionRank = PLANET_REGION_RANK[rec.region];
  rec.lastThermalAt = saved.savedAt;
  return rec;
}
function retainOrchardThermal(entity, site, rec, now) {
  entity.orchardThermalExposure = {
    schemaVersion: 1, siteId: site.id, lotId: entity.data.worldRecordId, savedAt: now,
    region: rec.region, heat: rec.heat, stage: rec.stage, stageAt: rec.stageAt,
    outwardS: rec.outwardS, burnNextAt: rec.burnNextAt,
  };
}

// Bands that speak the first time a body reaches them (U5): the sling law, the working
// band, the danger band, and reentry each get exactly one first-contact receipt per body.
const BAND_FIRST_BANDS = Object.freeze(['sling', 'skim', 'danger', 'reentry']);

export const planetRuntime = {
  name: 'planetRuntime',

  init(ctx) {
    for (const unsub of this._lifecycleUnsubs || []) unsub();
    this._lifecycleUnsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._queryOut = [];
    this._scratchIds = [];
    ensureRuntime(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      // Transient normalize-away (fields.js precedent): the adapter rebuilds from authored data.
      this._lifecycleUnsubs = [
        this.bus.on('game:new', () => this._unwind('new_game')),
        this.bus.on('save:loaded', () => this._unwind('save_loaded')),
        this.bus.on('sector:exit', () => this._unwind('sector_exit')),
      ];
    }
  },

  newGame() { this._unwind('new_game'); },

  destroy() {
    for (const unsub of this._lifecycleUnsubs || []) unsub();
    this._lifecycleUnsubs = [];
  },

  update(dt, state) {
    let rt = ensureRuntime(state);
    if (!planetFlag('enabled')) return;                       // golden-safety layer 1
    const sectorId = state.world && state.world.currentSectorId;
    const site = (planetSitesForSector(sectorId)[0]) || null; // layer 2: authored sectors only

    if (rt.active && (!site || rt.sectorId !== sectorId)) {
      this._unwind('sector_changed');
      rt = ensureRuntime(state); // _unwind replaces state.planet — never keep the stale reference
    }
    if (site && !rt.active) this._register(state, rt, site, sectorId);
    if (!rt.active || !site) {
      // Away from a planet band the skim toggle would otherwise evaporate in silence — the key
      // answers why it cannot fire here, the same way a deploy cooldown does.
      this._denySkimToggle(state);
      return;
    }

    // The kernel is cleared by fields._clearAll on lifecycle boundaries; re-bind when missing so
    // the profile and the body can never drift apart (identity transaction stays whole).
    const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
    if (fsys && typeof fsys.hasExternal === 'function' && !fsys.hasExternal(rt.fieldId)) {
      this._registerField(fsys, rt, site);
    }

    // The finite Orchard joins the existing Anvil only when its normal consumer is installed.
    // planetRuntime remains the one place/band adapter; the machine, cargo, and physics owners
    // keep their existing authority, while this adapter admits one authored fixed landmark.
    if (site && rt.active && site.id === ANVIL_ORCHARD.planetId
      && sectorId === ANVIL_ORCHARD.sectorId) {
      this._ensureOrchardFrame(state, rt, site);
    }

    if (state.mode !== 'flight' || dt <= 0) return;
    this._tickShips(dt, state, rt, site);
    this._tickHarvest(dt, state, rt, site);
    this._tickWorkerHarvest(dt, state, rt, site);
    this._expireAftermath(state, rt);
  },

  // ── Q18 registration transaction ──────────────────────────────────────────────────────────────

  _register(state, rt, site, sectorId) {
    // "No physics planet without an atlas record": resolve the canonical zone and derive the ONE
    // global centre from its authored sector-local anchor. A missing/renamed record refuses spawn.
    const zones = SECTOR_ZONES[sectorId] || [];
    const zone = zones.find((z) => z && z.id === site.zoneId) || null;
    if (!zone) return;
    const global = sectorLocalToGlobalForSector(zone.center, sectorId);
    if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.z)) return;

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
    if (typeof spawnEntity !== 'function' || !fsys || typeof fsys.registerExternal !== 'function') return;

    const entity = spawnEntity({
      type: 'planet',
      team: 0,
      pos: { x: global.x, z: global.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      angVel: 0,
      radius: site.bodyRadius,          // the exclusion/collision policy: one static circle
      collides: true,
      hull: 1e9, hullMax: 1e9,          // a world does not die; ramming it is the ram's problem
      physicsBody: {
        schemaVersion: 1, radius: site.bodyRadius, mass: 1e9, inertiaY: 1e9,
        dynamic: false, ccd: false, material: 'station', revision: 0,
      },
      data: {
        kind: 'planet_site',
        planetSite: {
          siteId: site.id, zoneId: site.zoneId, name: site.name,
          planetType: site.planetType, seed: site.seed,
          radius: site.radius, centerY: site.centerY, bodyRadius: site.bodyRadius,
          bands: site.bands,
        },
      },
    });
    if (!entity) return;
    const witness = this._spawnSlingWitness(state, spawnEntity, global);

    rt.active = true;
    rt.siteId = site.id;
    rt.zoneId = site.zoneId;
    rt.sectorId = sectorId;
    rt.entityId = entity.id;
    rt.entityGeneration = occupantGenerationOf(entity);
    rt.witnessId = witness && witness.id;
    rt.witnessGeneration = occupantGenerationOf(witness);
    rt.fieldId = `${site.id}_pull`;
    rt.center.x = global.x;
    rt.center.z = global.z;
    this._registerField(fsys, rt, site);
    this.bus.emit('planet:registered', {
      siteId: site.id, zoneId: site.zoneId, entityId: entity.id, fieldId: rt.fieldId,
      center: { x: global.x, z: global.z },
    });
  },

  _spawnSlingWitness(state, spawnEntity, center) {
    // Traffic adopts the original witness slot. It owns the worker's durable identity,
    // movement and finite manifest; curated hosts without traffic retain the coast witness.
    const traffic = this.registry?.get?.('traffic');
    if (typeof traffic?.ensureAnvilWorker === 'function') {
      return traffic.ensureAnvilWorker(state, spawnEntity, center);
    }
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && existing.alive !== false && existing.data && existing.data.anvilSlingWitness === true) {
        return existing;
      }
    }
    const pose = anvilSlingWitnessPose(center);
    return spawnEntity({
      type: 'ship',
      team: 2,
      pos: { x: pose.pos.x, z: pose.pos.z },
      vel: { x: pose.vel.x, z: pose.vel.z },
      rot: Math.atan2(pose.vel.z, pose.vel.x),
      radius: 16,
      mass: 90,
      collides: true,
      hull: 220,
      hullMax: 220,
      data: {
        defId: ANVIL_SLING_WITNESS.defId,
        anvilSlingWitness: true,
        trafficRole: 'hauler',
        ai: { passive: true, archetype: 'passive' },
      },
    });
  },

  _registerField(fsys, rt, site) {
    fsys.registerExternal({
      id: rt.fieldId,
      kind: 'well',
      // Passive gravity keeps the shared force law, without weapon-style grind/exit stun.
      wellConsequences: site.field.wellConsequences,
      center: { x: rt.center.x, z: rt.center.z },
      radius: site.field.radius,
      strength: site.field.strength,
      falloff: site.field.falloff,
      innerRadius: site.field.innerRadius,
      innerSoft: site.field.innerSoft,
      sourceId: rt.entityId,
      createdAt: nowOf(this.state),
    });
  },

  _ensureOrchardFrame(state, rt, site) {
    const machinery = this.registry?.get?.('environmentalMachinery');
    const worldOwner = this.registry?.get?.('world');
    const sites = state && state.sites;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof machinery?.acceptOrchardHarvest !== 'function'
      || typeof worldOwner?.upsertWorldRecord !== 'function'
      || typeof spawnEntity !== 'function'
      || !sites || typeof sites !== 'object' || Array.isArray(sites)
      || !Number.isSafeInteger(state.tick) || state.tick < 0) return null;

    // This is the finite site row, not a producer-owned cache. A missing/null save section is
    // the only admission case; malformed or future-authored custody stays fail-closed.
    let rowDescriptor = Object.getOwnPropertyDescriptor(sites, 'anvilOrchard');
    if (!rowDescriptor || ('value' in rowDescriptor && rowDescriptor.value === null)) {
      if ((rowDescriptor && (!('value' in rowDescriptor) || !rowDescriptor.writable))
        || (!rowDescriptor && !Object.isExtensible(sites))) return null;
      try {
        Object.defineProperty(sites, 'anvilOrchard', {
          value: createOrchardRecord(state.tick), enumerable: true, configurable: true, writable: true,
        });
        rowDescriptor = Object.getOwnPropertyDescriptor(sites, 'anvilOrchard');
      } catch (_) { return null; }
    }
    if (!rowDescriptor || !('value' in rowDescriptor)) return null;
    const row = normalizeOrchardRecord(rowDescriptor.value);
    if (!row || !orchardHistoryFitsTick(row, state.tick) || row.frameStatus !== 'intact') return null;

    const resident = state.entities?.get?.(rt.orchardFrameId);
    if (boundLife(resident, rt.orchardFrameId, rt.orchardFrameGeneration)
      && resident.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId
      && isOrchardFrame(resident) && resident.data?.isLandmark === true
      && resident.data?.worldSiteTargetable === true) return resident;

    // The world-record index is the existing residency lane. Reuse a live exact frame rather
    // than minting a second owner when save/load or sector residency already materialized it.
    let frame = null;
    const index = state.entityIndex;
    if (index?.__spacefaceEntityIndexV1 === true && index.ready === true
      && index.byWorldRecordId instanceof Map) {
      frame = index.byWorldRecordId.get(ORCHARD_GEOMETRY.worldRecordId) || null;
    }
    if (!frame || frame.alive === false || state.entities?.get?.(frame.id) !== frame) {
      const entities = state.entities;
      if (entities && typeof entities.values === 'function') {
        for (const candidate of entities.values()) {
          if (candidate?.alive !== false
            && candidate.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId) {
            frame = candidate;
            break;
          }
        }
      }
    }
    if (frame) {
      if (!isOrchardFrame(frame) || frame.data?.isLandmark !== true
        || frame.data?.worldSiteTargetable !== true) return null;
      rt.orchardFrameId = frame.id;
      rt.orchardFrameGeneration = occupantGenerationOf(frame);
      return frame;
    }
    // A durable row may already be shelved by the ordinary world owner. Never mint a live
    // duplicate just because the transient planet cache cannot see that residency row.
    const worldRecord = state.world?.records?.byId;
    if (worldRecord && Object.prototype.hasOwnProperty.call(worldRecord, ORCHARD_GEOMETRY.worldRecordId)) {
      return null;
    }

    // Keep the only absolute anchor on PLANET_SITE. This point is derived from the existing
    // safe sling interval and a small angular offset, keeping it near the skim route while
    // leaving the outer working-band path clear of the frame's 70-WU physical bound. The
    // authored landmark identity also opts it out of debris heat/impact.
    const radius = site.bands.skim + (site.bands.sling - site.bands.skim) * 0.5;
    const angle = Math.PI / 9;
    const pos = { x: rt.center.x + Math.cos(angle) * radius,
      z: rt.center.z + Math.sin(angle) * radius };
    try {
      frame = spawnEntity({
        type: 'wreck', team: 0, pos, vel: { x: 0, z: 0 }, rot: angle,
        radius: ORCHARD_GEOMETRY.radius, mass: 1000000,
        collides: true, hull: 1e9, hullMax: 1e9,
        flags: { persistent: true }, homeSectorId: ANVIL_ORCHARD.sectorId,
        physicsBody: orchardFrameBodySpec(),
        data: {
          orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame',
          worldRecordId: ORCHARD_GEOMETRY.worldRecordId,
          identityKey: ORCHARD_GEOMETRY.worldRecordId,
          placeId: 'place_anvil_storm_orchard',
          authoredAssetId: ORCHARD_GEOMETRY.assetId,
          authoredPayloadAssetId: ORCHARD_GEOMETRY.assetId,
          masslineTetherable: false,
          orchardCollars: createOrchardMotorState(
            row.sockets.map((socket) => socket.progress), row.sockets.map((socket) => socket.cycle)),
          homeSectorId: ANVIL_ORCHARD.sectorId, sectorId: ANVIL_ORCHARD.sectorId,
          isLandmark: true, landmark: true, landmarkId: ANVIL_ORCHARD.id,
          worldSiteTargetable: true, durable: true,
          name: 'Anvil Storm Orchard',
        },
      });
    } catch (_) { return null; }
    if (!frame || !isOrchardFrame(frame) || frame.data?.isLandmark !== true
      || frame.data?.worldSiteTargetable !== true) return null;

    // Register the already-spawned authored body through the existing world-record owner.
    // Persistent entity serialization remains the canonical body snapshot; this record is its
    // stable sector identity and lets the ordinary residency index find the same frame.
    try { worldOwner.upsertWorldRecord(frame); } catch (_) { /* the persistent body remains live */ }
    rt.orchardFrameId = frame.id;
    rt.orchardFrameGeneration = occupantGenerationOf(frame);
    return frame;
  },

  _unwind(why) {
    const state = this.state;
    if (!state) return;
    const rt = ensureRuntime(state);
    // Retire the old runtime before publication. A listener may synchronously restore or
    // register a successor; the old unwind must never reset that successor afterward.
    state.planet = defaultRuntime();
    if (rt.active) {
      const fsys = this.registry && this.registry.get ? this.registry.get('fields') : null;
      if (fsys && typeof fsys.unregisterExternal === 'function' && rt.fieldId) fsys.unregisterExternal(rt.fieldId);
      const entity = state.entities && state.entities.get ? state.entities.get(rt.entityId) : null;
      if (boundLife(entity, rt.entityId, rt.entityGeneration) && entity.alive !== false
        && entity.type === 'planet' && entity.data?.planetSite?.siteId === rt.siteId) entity.alive = false;
      const witness = state.entities && state.entities.get ? state.entities.get(rt.witnessId) : null;
      if (boundLife(witness, rt.witnessId, rt.witnessGeneration)
        && witness.data?.anvilSlingWitness === true) {
        witness.data.stormshiftCollectorOn = false;
        if (witness.alive !== false && witness.data.itinerary?.kind !== 'anvil_work') witness.alive = false;
      }
      this.bus && this.bus.emit && this.bus.emit('planet:unregistered', { siteId: rt.siteId, why });
    }
  },

  // ── band state machine + heat + drag + the Plunge ─────────────────────────────────────────────

  _tickShips(dt, state, rt, site) {
    const now = nowOf(state);
    for (const rec of Object.values(rt.ships)) rec.collectorOn = false;
    const tel = rt.telemetry;
    tel.tracked = 0; tel.inBands = 0;

    // Bounded candidate set: one spatial query at the influence radius (dormant sectors = zero).
    const queryRadius = this.helpers && this.helpers.queryRadius;
    const player = state.entities.get(state.playerId);
    const candidates = this._queryOut;
    candidates.length = 0;
    if (typeof queryRadius === 'function') queryRadius(rt.center, site.bands.influence, candidates);

    // Track the player always (if in influence) + the nearest ships, bounded.
    const seen = this._scratchIds;
    seen.length = 0;
    if (player && player.alive !== false) {
      this._tickOneShip(dt, state, rt, site, player, rt.player, now, /*isPlayer*/ true);
      seen.push(player.id);
    }
    // Released finite cargo receives the same band/drag/burn law at its own position.
    // Reserve the three authored sockets independently of traffic's nearest-ship budget:
    // a long tether or a crowded band must not shelter the payload. Native ready custody,
    // not copied authored labels, admits the current released life. Keep exposure outside
    // pod.data, whose exact source tree remains owned by the release/collection authority.
    const physics = this.registry?.get?.('physics');
    let pods = 0;
    if (site.id === ANVIL_ORCHARD.planetId
      && state.world?.currentSectorId === ANVIL_ORCHARD.sectorId) {
      for (const e of candidates) {
        if (pods >= ANVIL_ORCHARD.socketCount) break;
        if (!e || seen.includes(e.id) || state.entities.get(e.id) !== e
          || !isOrchardPod(e) || !isDynamicPhysicsBodyEntity(e)) continue;
        const life = occupantGenerationOf(e);
        // A ready read observes the native world. Untouched cold cargo outside every
        // heating/drag band has nothing to advance; reject it cheaply before that read.
        // Any retained history, including zero heat, still takes the authoritative path.
        const hasHistory = rt.ships[e.id]?.occupantGeneration === life
          || Object.getOwnPropertyDescriptor(e, 'orchardThermalExposure') !== undefined;
        if (!hasHistory && PLANET_REGION_RANK[classifyPlanetRegion(site,
          Math.hypot(e.pos.x - rt.center.x, e.pos.z - rt.center.z))] < PLANET_REGION_RANK.skim) continue;
        if (!physics?.readOrchardPodReady?.(e)) continue;
        const rec = rt.ships[e.id]?.occupantGeneration === life
          ? rt.ships[e.id] : (rt.ships[e.id] = orchardThermalRecord(e, site, now));
        if (rec.lastThermalAt !== now) {
          this._tickOneShip(dt, state, rt, site, e, rec, now, false);
          rec.lastThermalAt = now;
          retainOrchardThermal(e, site, rec, now);
        }
        seen.push(e.id);
        pods++;
      }
    }
    let tracked = 0;
    for (let i = 0; i < candidates.length && tracked < MAX_TRACKED_SHIPS - 1; i++) {
      const e = candidates[i];
      if (!e || e.alive === false || e === player || state.entities.get(e.id) !== e) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      if (!isDynamicPhysicsBodyEntity(e)) continue;
      const life = occupantGenerationOf(e);
      const rec = rt.ships[e.id]?.occupantGeneration === life
        ? rt.ships[e.id] : (rt.ships[e.id] = newShipRecord(e));
      this._tickOneShip(dt, state, rt, site, e, rec, now, false);
      seen.push(e.id);
      tracked++;
    }
    // Drop records for ships that left the influence volume or died (bounded sweep).
    for (const id of Object.keys(rt.ships)) {
      if (!seen.includes(Number.isFinite(Number(id)) ? Number(id) : id) && !seen.includes(id)) delete rt.ships[id];
    }
    tel.tracked = seen.length;
  },

  _tickOneShip(dt, state, rt, site, e, rec, now, isPlayer) {
    const dx = e.pos.x - rt.center.x;
    const dz = e.pos.z - rt.center.z;
    const r = Math.hypot(dx, dz);
    rec.r = r;

    // Hysteresis: instantly ACCEPT a deeper (higher-rank) classification; stepping back OUT
    // requires clearing the CURRENT region's outer boundary plus the hysteresis margin (the edge
    // being crossed on the way out). Never flaps on the line.
    const raw = classifyPlanetRegion(site, r);
    const rawRank = PLANET_REGION_RANK[raw];
    if (rawRank > rec.regionRank) {
      rec.region = raw; rec.regionRank = rawRank;
    } else if (rawRank < rec.regionRank) {
      const currentOuterEdge = this._outerEdgeOf(site, rec.region);
      if (r > currentOuterEdge + site.hysteresis) { rec.region = raw; rec.regionRank = rawRank; }
    }
    const region = rec.region;
    if (rec.regionRank >= PLANET_REGION_RANK.skim) rt.telemetry.inBands++;

    // The band speaks once per body: the first crossing of each authored band emits one
    // receipt so the dive is answered — what the band is, and what its law is.
    if (BAND_FIRST_BANDS.includes(region)) {
      if (!rec.bandFirsts) rec.bandFirsts = {};
      if (!rec.bandFirsts[region]) {
        rec.bandFirsts[region] = true;
        this.bus.emit('planet:bandFirst', {
          entityId: e.id, siteId: rt.siteId, band: region, isPlayer, t: now,
        });
      }
    }

    // Heat: ONE scalar 0..1 (the sheath, the HUD arc and the stage machine all read this number).
    const h = site.heat;
    let dHeat = 0;
    if (region === 'skim') dHeat = h.skimRate;
    else if (region === 'danger') dHeat = h.dangerRate;
    else if (region === 'reentry') dHeat = h.reentryRate;
    else dHeat = -(h.coolRate);
    if (region === 'skim' && rec.heat > 0.6) dHeat = -h.coolSkimRate; // hot ships barely cool in-band
    rec.heat = Math.min(1, Math.max(0, rec.heat + dHeat * dt));

    // Atmosphere drag (bounded additive impulse through the membrane — never a velocity write).
    const dragRate = region === 'reentry' ? site.drag.reentry : region === 'danger' ? site.drag.danger : region === 'skim' ? site.drag.skim : 0;
    if (dragRate > 0) {
      const vx = finite(e.vel && e.vel.x), vz = finite(e.vel && e.vel.z);
      const speed = Math.hypot(vx, vz);
      if (speed > 1e-3) {
        let a = Math.min(site.drag.maxAccel, speed * dragRate);
        const mass = Math.max(1, finite(e.physicsBody && e.physicsBody.mass, finite(e.mass, 1)));
        queuePhysicsImpulse(e, { x: (-vx / speed) * a * mass * dt, y: 0, z: (-vz / speed) * a * mass * dt });
        rt.telemetry.dragImpulses++;
      }
    }

    // The Plunge (staged, escape windows preserved).
    this._tickPlunge(dt, state, rt, site, e, rec, r, region, now, isPlayer);

    // Player-only: recovery burn + the one-voice commit cue.
    if (isPlayer) this._tickRecovery(dt, state, rt, site, e, rec, r, now);
  },

  _outerEdgeOf(site, region) {
    // The planar radius at which `region` ENDS (its outer boundary — the edge crossed leaving it).
    switch (region) {
      case 'reentry': return site.bands.reentry;
      case 'danger': return site.bands.danger;
      case 'skim': return site.bands.skim;
      case 'sling': return site.bands.sling;
      case 'influence': return site.bands.influence;
      default: return Infinity;
    }
  },

  _tickPlunge(dt, state, rt, site, e, rec, r, region, now, isPlayer) {
    const p = site.plunge;
    const prev = rec.stage;
    const inHot = region === 'danger' || region === 'reentry';

    // Outward-escape accumulator: any time spent OUT of the hot bands counts toward regression.
    if (!inHot && rec.stage) rec.outwardS += dt; else rec.outwardS = 0;

    // Stage ladder (advance requires presence + heat; regress requires sustained escape).
    if (!rec.stage) {
      if (inHot) this._setStage(rt, e, rec, 'skim', now, isPlayer);
    }
    if (rec.stage === 'skim') {
      if (rec.heat >= p.commitHeat || region === 'reentry') this._setStage(rt, e, rec, 'commit', now, isPlayer);
      else if (rec.outwardS >= p.regressS && rec.heat < p.commitHeat * 0.7) this._setStage(rt, e, rec, null, now, isPlayer);
    }
    if (rec.stage === 'commit') {
      if (rec.heat >= p.breakupHeat && inHot) this._setStage(rt, e, rec, 'breakup', now, isPlayer);
      else if (rec.outwardS >= p.regressS) this._setStage(rt, e, rec, 'skim', now, isPlayer);
    }
    if (rec.stage === 'breakup') {
      if (r < p.descentRadius) this._setStage(rt, e, rec, 'descent', now, isPlayer);
      else if (rec.outwardS >= p.regressS && rec.heat < p.breakupHeat * 0.85) this._setStage(rt, e, rec, 'commit', now, isPlayer);
    }
    if (rec.stage === 'descent') {
      // Descent regression is possible but hard: you must actually climb out of the reentry band.
      if (region !== 'reentry' && region !== 'danger' && rec.outwardS >= p.regressS) this._setStage(rt, e, rec, 'breakup', now, isPlayer);
    }

    // Burn damage — routed, named, ordinary hull consequence (terminal = normal combat kill).
    // Cadence-batched at 0.5s: the real router applies flat armor PER PACKET, so per-tick
    // micro-packets (dps·dt ≈ 0.1) would be silently erased by any armorFlat > 0 — a defect the
    // live route capture caught (node's seam recorder had no armor model). Batching keeps the
    // authored dps truthful against armored hulls; the schedule derives from simTime (no drift).
    const dps = rec.stage === 'descent' ? p.descentDps : rec.stage === 'breakup' ? p.burnDps : 0;
    if (dps > 0 && e.alive !== false) {
      if (!(rec.burnNextAt > 0)) rec.burnNextAt = now + 0.5;
      if (now >= rec.burnNextAt) {
        rec.burnNextAt = now + 0.5;
        this._routeBurn(state, rt, e, dps * 0.5);
      }
      if (e.alive === false || (e.hull != null && e.hull <= 0)) {
        // Terminal at the site: remember the plunge point briefly (Aftermath — the band remembers).
        if (rt.aftermath.length >= MAX_AFTERMATH) rt.aftermath.shift();
        rt.aftermath.push({ x: e.pos.x, z: e.pos.z, at: now, until: now + p.aftermathS });
        this.bus.emit('planet:plungeStage', { id: e.id, stage: 'aftermath', siteId: rt.siteId, isPlayer });
        this._emitPlanetCue('planet.plunge.stage', e, { sourceEvent: 'planet:plungeStage', stage: 'aftermath' });
      }
    }
    if (prev !== rec.stage && rec.stage !== null) rt.telemetry.burnsRouted += 0; // stages logged via events
  },

  _setStage(rt, e, rec, stage, now, isPlayer) {
    if (rec.stage === stage) return;
    rec.stage = stage;
    rec.stageAt = now;
    rec.outwardS = 0;
    if (stage !== 'breakup' && stage !== 'descent') rec.burnNextAt = 0; // re-schedule on re-entry
    this.bus.emit('planet:plungeStage', { id: e.id, stage: stage || 'clear', siteId: rt.siteId, isPlayer });
    this._emitPlanetCue('planet.plunge.stage', e, { sourceEvent: 'planet:plungeStage', stage: stage || 'clear' });
  },

  // FB-142 — every planet verb ships a composed world cue beside its event (worldCueRecipes'
  // planet.* variants). One cue, anchored on the working ship, aimed along its motion — never
  // at the planet centre hundreds of WU below, never a second particle budget.
  _emitPlanetCue(id, e, extra) {
    if (!this.bus || typeof this.bus.emit !== 'function' || !e || !e.pos) return;
    const vx = finite(e.vel && e.vel.x), vz = finite(e.vel && e.vel.z);
    const a = Math.hypot(vx, vz) > 1 ? Math.atan2(vz, vx) : finite(e.rot);
    this.bus.emit('presentation:cue', {
      id,
      sourceId: e.id,
      targetId: e.id,
      position: { x: e.pos.x, z: e.pos.z },
      direction: { x: Math.cos(a), z: Math.sin(a) },
      ...(extra || null),
    });
  },

  _routeBurn(state, rt, e, damage) {
    const combat = this.registry && this.registry.get ? this.registry.get('combat') : null;
    const kernel = combat && (combat.kernel || (typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : null));
    if (!kernel || typeof kernel.routeDamage !== 'function') return;
    // damageType 'plasma' is the real damage vocabulary member (src/combat/damage.js channel
    // table) — reentry burn IS plasma; the reentry NAME travels in source.kind/origin.kind so
    // attribution/telemetry can distinguish it from weapon plasma.
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'plasma',
      pos: { x: e.pos.x, z: e.pos.z },
      source: { kind: 'planet_reentry' },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    kernel.routeDamage({
      attackerId: rt.entityId,
      targetId: e.id,
      packet,
      origin: { kind: 'planet_reentry', id: rt.siteId },
    });
    rt.telemetry.burnsRouted++;
  },

  // ── player recovery (the asymmetric out: costly, visible, never a teleport) ───────────────────

  _tickRecovery(dt, state, rt, site, player, rec, r, now) {
    const actions = state.input && state.input.actions;
    const committed = rec.stage === 'commit' || rec.stage === 'breakup' || rec.stage === 'descent';

    // One-voice commit cue (bible §8.3): fires once per commit entry, routed through the arbiter.
    if (committed && now - rt.player.commitCueAt > 8 && rec.stage === 'commit' && rec.stageAt === now) {
      rt.player.commitCueAt = now;
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'alert', kind: 'danger', priority: 110, ttl: 3.5, id: 'planet_commit', text: 'BURN NOW OR BREAK UP' });
      }
    }

    // Boost is a held LEVEL on state.input (input.js writes inp.boost; actions carries edges).
    const boosting = !!((state.input && state.input.boost) || (actions && actions.boost));
    let burning = false;
    if (committed && boosting) {
      const vx = finite(player.vel && player.vel.x), vz = finite(player.vel && player.vel.z);
      const dx = player.pos.x - rt.center.x, dz = player.pos.z - rt.center.z;
      const rr = Math.max(1e-3, r);
      const ox = dx / rr, oz = dz / rr; // outward unit
      // The assist engages when the pilot is actually trying to leave: nose outward-ish.
      const heading = { x: Math.cos(finite(player.rot)), z: Math.sin(finite(player.rot)) };
      if (heading.x * ox + heading.z * oz > 0.2) {
        burning = true;
        const mass = Math.max(1, finite(player.physicsBody && player.physicsBody.mass, 1));
        // Outward assist + tangential opposition (the momentum cost): burn out, not around.
        const tangX = -oz, tangZ = ox;
        const vTan = vx * tangX + vz * tangZ;
        const ax = ox * site.recovery.assistAccel - tangX * vTan * site.recovery.tangentialDamp;
        const az = oz * site.recovery.assistAccel - tangZ * vTan * site.recovery.tangentialDamp;
        queuePhysicsImpulse(player, { x: ax * mass * dt, y: 0, z: az * mass * dt });
        // The heat cost — the burn itself cooks you a little more on the way out.
        rec.heat = Math.min(1, rec.heat + site.recovery.heatSpike * dt);
      }
    }
    if (burning !== rt.player.recoveryBurn) {
      rt.player.recoveryBurn = burning;
      this.bus.emit('planet:recoveryBurn', { on: burning, siteId: rt.siteId });
      // The world cue marks the burn onset; the throttled release rides the action recipe's
      // 'off' variant on the same event, so no second cue is emitted here.
      if (burning) this._emitPlanetCue('planet.recovery.burn', player, { sourceEvent: 'planet:recoveryBurn' });
    }
  },

  // ── skim harvest (yield = path × density through the explicit collector) ──────────────────────

  _denySkimToggle(state) {
    const actions = state.input && state.input.actions;
    if (!actions || !actions.toggleSkimCollector) return;
    actions.toggleSkimCollector = false;
    this.bus.emit('toast', { text: 'Skim collector needs a planet band', kind: 'info', ttl: 1.6 });
  },

  _tickHarvest(dt, state, rt, site, ) {
    const actions = state.input && state.input.actions;
    const player = state.entities.get(state.playerId);
    const rec = rt.player;
    if (!player || player.alive === false) return;

    if (actions && actions.toggleSkimCollector) {
      actions.toggleSkimCollector = false;
      rec.collectorOn = !rec.collectorOn;
      this.bus.emit('planet:collector', { on: rec.collectorOn, siteId: rt.siteId });
      // FB-142 — the planet:collector audio route is the single voice (on and off registers);
      // the skim-intake world cue marks the mouth opening. No second generic audio:cue fires
      // here — that would stack a menu tone under the authored voice.
      if (rec.collectorOn) {
        this._emitPlanetCue('planet.skim.intake', player, { sourceEvent: 'planet:collector' });
      }
    }
    if (!rec.collectorOn) return;

    const region = rec.region;
    const inSkim = region === 'skim';
    const inDanger = region === 'danger';
    if (!inSkim && !inDanger) return;

    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed < site.harvest.minSpeed) return; // path × density: parked ships gather nothing

    const path = speed * dt; // WU flown this tick — THE yield driver (never a hold timer)
    if (inDanger) rec.pendingRich += path * site.harvest.densityDanger;
    else rec.pendingShallow += path * site.harvest.densitySkim;

    // Settle whole units through the cargo owner (mining idiom, partial-add honest).
    const cargoSys = this.registry && this.registry.get ? this.registry.get('cargo') : null;
    if (!cargoSys || typeof cargoSys.addCargo !== 'function') return;
    this._settle(rt, rec, cargoSys, 'pendingShallow', site.harvest.commodityShallow);
    this._settle(rt, rec, cargoSys, 'pendingRich', site.harvest.commodityRich);
  },

  // One admitted worker uses the SAME physical band and density law as the player.
  // Fractions are transient atmospheric exposure, not a second cargo ledger. Whole shallow gas
  // is offered first to the finite Orchard, then only its unaccepted remainder to traffic's
  // existing manifest. A ship outside the thermal budget cannot collect for free, and a
  // stopped/interrupted worker cannot bank a timed yield.
  _tickWorkerHarvest(dt, state, rt, site) {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const worker = state.entities.get(rt.witnessId);
    // Numeric ids recycle during restore/residency. Validate the bound life before even
    // clearing the presentation flag on what may now be a different occupant.
    if (!boundLife(worker, rt.witnessId, rt.witnessGeneration)
      || worker.data?.anvilSlingWitness !== true) return;
    worker.data.stormshiftCollectorOn = false;
    if (!worker || worker.alive === false || !(worker.hull > 0)
      || worker.data?.anvilSlingWitness !== true
      || worker.data?.itinerary?.kind !== 'anvil_work'
      || worker.data.itinerary.phase !== 'collect') return;
    const rec = rt.ships[worker.id];
    if (!rec || !this._scratchIds.includes(worker.id)) return;
    const traffic = this.registry?.get?.('traffic');
    if (typeof traffic?.acceptAnvilHarvest !== 'function') return;
    const region = rec.region;
    if (region !== 'skim' && region !== 'danger') return;
    const speed = Math.hypot(finite(worker.vel?.x), finite(worker.vel?.z));
    if (speed < site.harvest.minSpeed) return;
    rec.collectorOn = true;
    worker.data.stormshiftCollectorOn = true;
    const rich = region === 'danger';
    const key = rich ? 'pendingRich' : 'pendingShallow';
    const commodityId = rich ? site.harvest.commodityRich : site.harvest.commodityShallow;
    rec[key] = finite(rec[key]) + speed * dt
      * (rich ? site.harvest.densityDanger : site.harvest.densitySkim);
    const whole = Math.floor(rec[key]);
    if (whole < 1) return;
    // Discard refused whole units, as the player collector does. No hidden reserve can
    // appear after unloading or while the intake is closed.
    rec[key] -= whole;
    let orchardQty = 0;
    if (commodityId === ANVIL_ORCHARD.commodityId) {
      const machine = this.registry?.get?.('environmentalMachinery');
      const frame = state.entities?.get?.(rt.orchardFrameId);
      if (typeof machine?.acceptOrchardHarvest === 'function'
        && boundLife(frame, rt.orchardFrameId, rt.orchardFrameGeneration)
        && isOrchardFrame(frame)) {
        const acceptedByOrchard = machine.acceptOrchardHarvest(worker, {
          frame, commodityId, qty: whole,
        });
        orchardQty = Number.isFinite(acceptedByOrchard)
          ? Math.max(0, Math.min(whole, Math.floor(acceptedByOrchard))) : 0;
      }
    }
    const remaining = whole - orchardQty;
    const acceptedTraffic = remaining > 0
      ? traffic.acceptAnvilHarvest(worker, { siteId: site.id, commodityId, qty: remaining }) : 0;
    const trafficAccepted = Number.isFinite(acceptedTraffic)
      ? Math.max(0, Math.min(remaining, Math.floor(acceptedTraffic))) : 0;
    const qty = orchardQty + trafficAccepted;
    if (!qty) return;
    rec.harvestedUnits = finite(rec.harvestedUnits) + qty;
    this.bus.emit('planet:npcHarvest', { entityId: worker.id, siteId: site.id, commodityId, qty });
    this._emitHarvestMotes(rt, rec, commodityId, qty, worker);
  },

  _settle(rt, rec, cargoSys, key, commodityId) {
    const whole = Math.floor(rec[key]);
    if (whole < 1) return;
    const got = cargoSys.addCargo(commodityId, whole);
    const accepted = Number.isFinite(got) ? got : (got ? whole : 0);
    rec[key] -= whole;
    if (accepted > 0) {
      rec.harvestedUnits += accepted;
      rt.telemetry.harvestUnits += accepted;
      this.bus.emit('planet:harvest', { commodityId, qty: accepted, siteId: rt.siteId });
      const ship = this.state && this.state.entities && this.state.entities.get
        ? this.state.entities.get(this.state.playerId) : null;
      this._emitPlanetCue('planet.harvest.deposit', ship, { sourceEvent: 'planet:harvest', commodityId });
      this._emitHarvestMotes(rt, rec, commodityId, accepted);
    }
    if (accepted < whole) {
      this.bus.emit('planet:harvestDenied', { commodityId, reason: 'cargo_full', siteId: rt.siteId });
      const ship = this.state && this.state.entities && this.state.entities.get
        ? this.state.entities.get(this.state.playerId) : null;
      this._emitPlanetCue('planet.harvest.denied', ship, { sourceEvent: 'planet:harvestDenied', commodityId });
    }
  },

  // Harvest motes (bible §7.1: yield = path × density MADE VISIBLE — bright flecks drifting from
  // the band into the collector). One directional cue per settled batch through the shipped
  // presentation lane (pooled, bounded, flash-reduced automatically) — mote rate IS the yield rate.
  _emitHarvestMotes(rt, rec, commodityId, qty, actor = null) {
    const state = this.state;
    const player = actor || state.entities.get(state.playerId);
    if (!player) return;
    const vx = finite(player.vel && player.vel.x), vz = finite(player.vel && player.vel.z);
    const sp = Math.hypot(vx, vz) || 1;
    const fx = vx / sp, fz = vz / sp;
    // Deterministic side alternation (pattern idiom — the running unit count, never Math.random).
    const side = (rec.harvestedUnits & 1) === 0 ? 1 : -1;
    const px = player.pos.x + fx * 10 - fz * 22 * side;
    const pz = player.pos.z + fz * 10 + fx * 22 * side;
    const dx = player.pos.x - px, dz = player.pos.z - pz;
    const dl = Math.hypot(dx, dz) || 1;
    this.bus.emit('presentation:vfxCue', {
      id: 'planet.harvest.mote',
      lane: 'field',
      particles: Math.min(10, 3 + qty * 2),
      magnitude: 0.5,
      radius: 8,
      position: { x: px, z: pz },
      direction: { x: dx / dl, z: dz / dl },
      material: 'energy',
      color: commodityId === 'cmdty_gas_helium3' ? '#ffb35c' : '#9fd8e8',
      flashReduced: true,
    });
  },

  _expireAftermath(state, rt) {
    if (!rt.aftermath.length) return;
    const now = nowOf(state);
    while (rt.aftermath.length && rt.aftermath[0].until <= now) rt.aftermath.shift();
  },

  // ── diagnostics (perf contract: shares + counters declared) ───────────────────────────────────

  inspect() {
    const rt = this.state ? ensureRuntime(this.state) : null;
    return {
      active: !!(rt && rt.active),
      siteId: rt && rt.siteId,
      zoneId: rt && rt.zoneId,
      trackedShips: rt ? Object.keys(rt.ships).length : 0,
      maxTracked: MAX_TRACKED_SHIPS + ANVIL_ORCHARD.socketCount,
      playerRegion: rt && rt.player.region,
      playerHeat: rt && rt.player.heat,
      playerStage: rt && rt.player.stage,
      telemetry: rt && rt.telemetry,
    };
  },
};

export default planetRuntime;
