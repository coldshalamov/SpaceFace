// Salvage discovery loop (GDD pillar 1 — "wire the momentum toy": a floating communicator near
// wreckage starts a mission). This system turns the `derelict_field` named zones (src/data/
// sectorZones.js) into a reason to fly out: on sector entry it deterministically scatters 0-2
// salvage points near each derelict zone — wreck debris you can tether/haul, and occasionally a
// floating COMMUNICATOR beacon. Reaching or scanning a communicator reveals a black-box log line and
// OFFERS a short salvage mission (src/data/wreckMissions.js) via a `mission:offered` comms hook the
// missions/UI layer can consume.
//
// OWNERSHIP (§0.6): this system owns ONLY state.salvage (its own subtree of records) and the wreck
// entities it spawns through the core spawnEntity helper. It never edits missions/economy/scanner
// state — it emits intents/hooks (`mission:offered`, `salvage:placed`, `salvage:communicatorFound`,
// toasts/audio) that other systems already listen for or can opt into. It degrades gracefully: if a
// sector has no derelict_field zones, or spawnEntity/zones are absent, it is a strict no-op — so the
// deterministic golden sim (which never enters a derelict field with this wired) is unperturbed.
//
// DETERMINISM (§0.5): all placement + template rolls derive from mulberry32(hash32(seed, sectorId,
// zoneId, …)); NEVER Math.random. The per-zone hash stream is independent of live state.world.rng
// draw-order, so interleaving with other sector:enter consumers can't shift our rolls.

import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { zonesForSector, VESTA_DERELICT_SALVAGE_SOURCE } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';
import { pickWreckMission, wreckMissionById } from '../data/wreckMissions.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { COMMODITIES } from '../data/commodities.js';
import { WRECK_ECOLOGY_DAY_S, isPlayerWreckMarker, playerWreckMarker } from './aftermathWrecks.js';
import { addSalvage } from './cargo.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { combatVerbRecipe } from '../audio/combatVerbCues.js';

// Tuning (kept conservative so we never blow the ship/entity budget — brief: ≤2 salvage per zone).
const MAX_SALVAGE_PER_ZONE = 2;     // hard cap on entities placed per derelict zone
const COMMUNICATOR_CHANCE = 0.6;    // per-zone odds the first salvage point is a communicator hook
const SCATTER_MIN = 90;             // min offset from zone center (world units)
const SCATTER_FRAC = 0.55;          // scatter radius as a fraction of the zone radius
const COMMUNICATOR_FIND_RADIUS = 140; // player within this of a communicator triggers the offer
const WRECK_RADIUS = 9;             // matches intervention wrecks (tether/collision friendly)
const WRECK_MASS = 1800;            // heavy but towable; the old 1e6 placeholder defeated the verb
const WRECK_SALVAGE_TIME = 8;       // seconds the salvage beam takes to drain (mining._drainWreck)
const SALVAGE_SOURCE_SCHEMA = 'spaceface.salvageSourceLedger.v1';
const MAX_DURABLE_SOURCES = 16;

// Debris salvage pools — cheap, deterministic-per-seed loot so a plain wreck is still worth tethering.
const DEBRIS_POOLS = [
  { cmdty_scrap_metal: 3 },
  { cmdty_scrap_metal: 2, cmdty_ore_iron: 3 },
  { cmdty_salvage_electronics: 2 },
  { cmdty_scrap_metal: 4 },
];

// SF-029 (PB-MASS-B) — the wreck-side salvage-sorting job. A rolled debris wreck holds its
// valuable core under a breakable clamp, ringed by light dangerous debris, with a static cradle
// a tow away. The job is the SAME combat grammar as everything else on the line: latch the core,
// pull until the clamp's own break envelope gives, then fly the tow — the two authored gaps in
// the ring are the safe pull directions, the straight run to the cradle is the risky fast route,
// and every unit paid follows the delivered integrity the real geometry actually left. This is
// deliberately NOT a missions row: no board, no phase advancement — the reward is real salvage
// bay custody routed through the cargo owner's addSalvage, and the job lives and dies with the
// physical pocket.
const SORT_POCKET_ODDS = 0.35;      // per debris-wreck roll (independent rng stream, never zone rng)
const SORT_CORE_RADIUS = 5;
const SORT_CORE_MASS = 620;         // truthful heavy mass — the readout must say "heavy"
const SORT_CORE_HULL = 60;
const SORT_DEBRIS_COUNT = 7;
const SORT_DEBRIS_MASS = 45;        // light dangerous debris against the heavy core
const SORT_RING_INNER = 60;         // debris ring around the wreck (core sits inside it)
const SORT_RING_OUTER = 110;
const SORT_GAP_HALF_RAD = 0.55;     // half-width of each authored safe pull lane
const SORT_CRADLE_DISTANCE = 320;   // one 90°-off-gap bearing: the risky fast route through the ring
const SORT_CRADLE_RADIUS = 14;
const SORT_CRADLE_MASS = 1e9;
const SORT_CLAMP_DEF_ID = 'attachment_salvage_clamp';
const SORT_DELIVER_MAX_SPEED = 25;  // wu/s relative to the static cradle — a docked tow, not a fly-through
const SORT_IMPACT_DAMAGE = 0.15;    // integrity per debris impact; floor(qty × integrity) is what pays
const SORT_CORE_OFFSET = 2;         // center gap between wreck skin and core skin at spawn

// A communicator's contract names real cargo: whatever the offer asks the player to haul must be
// physically in the wreck for the job to close, so haul-type templates fold their authored
// commodity into the wreck's salvage pool at spawn (no invented cargo — recovery, not delivery).
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

const BASE_PRICE_BY_ID = new Map((COMMODITIES || []).map((row) => [row.id, Math.max(0, Math.floor(Number(row.basePrice) || 0))]));

export const salvage = {
  name: 'salvage',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    const state = this.state;
    this._ensureState();
    if (this.helpers) {
      // Source-state API. Mining and traffic can ask this owner to claim/drain/take the authored
      // Vesta wreck, but never write state.salvage or a source-backed wreck pool themselves.
      this.helpers.salvage = {
        ...(this.helpers.salvage || {}),
        source: (sourceKey) => this._sourceSnapshot(sourceKey),
        entityForPoint: (salvagePointId, sourceKey = null) => this._entityForPoint(salvagePointId, sourceKey),
        claimSource: (request) => this._claimSource(request),
        releaseSourceClaim: (request) => this._releaseSourceClaim(request),
        takeSource: (request) => this._takeSource(request),
        drainSource: (request) => this._drainSource(request),
      };
    }

    // On sector entry, (re)plan salvage for this sector's derelict fields.
    // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
    // drains the same plan under its slice clock in listener order.
    this.bus.on('sector:enter', (p) => {
      // A tail-sliced emit's payload can outlive the enter that minted it: entering B
      // while A's tail drains would replan A's sector on the live world and filter
      // state.salvage.points to the dead sector. Synthetic payloads (tests, census)
      // carry no epoch and always run.
      if (p && p.enterEpoch != null && this.state && this.state.world
          && this.state.world.enterSerial != null
          && p.enterEpoch !== this.state.world.enterSerial) return;
      if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
      this._planForSector(p && p.sectorId);
    });

    // Census mount (vesper pattern): register a cook provider so derelict salvage points
    // plan inside the renderer's deterministic sector census (jump + opening) instead of
    // relying on this listener's emit position. _planForSector's plannedSectorId guard
    // makes the emit listener's own call a no-op — ordering insurance, not a second plan.
    if (this.helpers) {
      this._cookProvider = (sector) => this._planForSectorSteps((sector && sector.id)
        || (this.state && this.state.world && this.state.world.currentSectorId));
      (this.helpers.sectorCookProviders
        || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
    }
    this.bus.on('aftermathWreck:recorded', (p) => this._onPlayerWreckMarker(p));
    this.bus.on('aftermathWreck:spawned', (p) => this._onPlayerWreckSpawned(p));
    // Scanning a communicator is an alternate trigger to reaching it (scan:completed carries a target).
    this.bus.on('scan:completed', (p) => this._onScan(p));
    // Clear transient entity ids BEFORE Continue rebuilds the sector. The prior save:loaded clear ran
    // after world.enterSector, erasing the newly planned points and leaving orphan wreck entities.
    this.bus.on('save:restoring', () => {
      state.salvage.points = [];
      state.salvage.plannedSectorId = null;
      if (Array.isArray(state.salvage.sortPockets)) state.salvage.sortPockets = [];
    });
    // The haul stays quiet. This fires only once the reactor is clear of the blast.
    this.bus.on('salvage:reactorTowedClear', () => this._onReactorTowedClear());
    // BP-01.1 receipt: an NPC vulture crew claims the field (e1EncounterRuntime H6 settle) —
    // a fixed acknowledgment on the existing toast/comms seams so the claim is legible to the
    // player instead of a silent event. Pure receipt; no gameplay outcome is applied here.
    this.bus.on('salvage:fieldVulture', (p) => {
      const text = p && p.text ? String(p.text)
        : 'Vulture crew on the field — a salvage claim is already being stripped.';
      this.bus.emit('toast', { text, kind: 'info', ttl: 4 });
      this.bus.emit('comms:log', {
        from: 'WRECK FIELD',
        text: p && p.detail ? String(p.detail) : 'A scavenger outfit filed the salvage claim first. What is left still drifts.',
        kind: 'salvage',
      });
    });
  },

  newGame() {
    this.state.salvage = freshSalvageState();
  },

  serialize() {
    const state = this._ensureState();
    const sources = {};
    for (const sourceKey of Object.keys(state.sources).sort((a, b) => a.localeCompare(b))) {
      const normalized = normalizeSourceRecord(state.sources[sourceKey], sourceDescriptor(sourceKey));
      if (normalized) sources[sourceKey] = normalized;
    }
    return { schema: SALVAGE_SOURCE_SCHEMA, sources };
  },

  deserialize(data) {
    const sources = data && !Array.isArray(data) && data.schema === SALVAGE_SOURCE_SCHEMA
      ? normalizeSourceLedger(data.sources)
      : {};
    this.state.salvage = { points: [], plannedSectorId: null, sources };
  },

  // The source ledger is deliberately narrow: only authored descriptors may occupy it.  That keeps
  // a malformed save from turning arbitrary wrecks into durable commodity sources.
  _ensureState() {
    if (!this.state.salvage || typeof this.state.salvage !== 'object' || Array.isArray(this.state.salvage)) {
      this.state.salvage = freshSalvageState();
    }
    const salvageState = this.state.salvage;
    if (!Array.isArray(salvageState.points)) salvageState.points = [];
    if (!Array.isArray(salvageState.sortPockets)) salvageState.sortPockets = [];
    if (!salvageState.sources || typeof salvageState.sources !== 'object' || Array.isArray(salvageState.sources)) {
      salvageState.sources = {};
    }
    if (typeof salvageState.plannedSectorId !== 'string') salvageState.plannedSectorId = null;
    return salvageState;
  },

  _sourceRecord(sourceKey, create = false) {
    const descriptor = sourceDescriptor(sourceKey);
    if (!descriptor) return null;
    const salvageState = this._ensureState();
    const existing = normalizeSourceRecord(salvageState.sources[sourceKey], descriptor);
    if (existing) {
      salvageState.sources[sourceKey] = existing;
      return existing;
    }
    if (!create || Object.keys(salvageState.sources).length >= MAX_DURABLE_SOURCES) return null;
    const fresh = freshSourceRecord(descriptor);
    salvageState.sources[sourceKey] = fresh;
    return fresh;
  },

  _sourceSnapshot(sourceKey) {
    const record = this._sourceRecord(sourceKey, false);
    return record ? snapshotSourceRecord(record, sourceDescriptor(sourceKey)) : null;
  },

  _entityForPoint(salvagePointId, sourceKey = null) {
    const salvageState = this._ensureState();
    const wantedPointId = cleanIdentity(salvagePointId);
    const wantedSourceKey = cleanIdentity(sourceKey);
    if (!wantedPointId) return null;
    if (wantedSourceKey) {
      const record = this._sourceRecord(wantedSourceKey, false);
      if (!record || record.extracted || poolTotal(record.remainingPool) <= 0) return null;
    }
    const point = salvageState.points.find((entry) => entry && entry.id === wantedPointId
      && (!wantedSourceKey || entry.sourceKey === wantedSourceKey));
    const entities = this.state.entities;
    if (point && entities && typeof entities.get === 'function') {
      const entity = entities.get(point.entityId);
      if (entity && entity.alive !== false) return entity;
    }
    if (!entities || typeof entities.values !== 'function') return null;
    for (const entity of entities.values()) {
      const data = entity && entity.data;
      if (entity && entity.alive !== false && data && data.salvagePointId === wantedPointId
        && (!wantedSourceKey || data.salvageSourceKey === wantedSourceKey)) return entity;
    }
    return null;
  },

  _claimSource(request = {}) {
    const sourceKey = cleanIdentity(request.sourceKey);
    const claimantId = cleanIdentity(request.claimantId);
    const workId = cleanIdentity(request.workId);
    const record = this._sourceRecord(sourceKey, false);
    if (!record || !claimantId || record.extracted || poolTotal(record.remainingPool) <= 0) {
      return { ok: false, source: this._sourceSnapshot(sourceKey) };
    }
    if (record.claimId && record.claimId !== claimantId) {
      return { ok: false, claimedBy: record.claimId, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
    }
    record.claimId = claimantId;
    if (workId) record.workId = workId;
    const entity = this._entityForPoint(record.salvagePointId, sourceKey);
    if (entity && entity.data) entity.data.salvorClaimedBy = claimantId;
    return { ok: true, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
  },

  _releaseSourceClaim(request = {}) {
    const sourceKey = cleanIdentity(request.sourceKey);
    const claimantId = cleanIdentity(request.claimantId);
    const record = this._sourceRecord(sourceKey, false);
    if (!record || !claimantId || (record.claimId && record.claimId !== claimantId)) {
      return { ok: false, source: this._sourceSnapshot(sourceKey) };
    }
    const hadClaim = record.claimId === claimantId;
    record.claimId = null;
    if (hadClaim && !record.extracted) record.workId = null;
    const entities = this.state.entities;
    if (entities && typeof entities.values === 'function') {
      for (const entity of entities.values()) {
        const data = entity && entity.data;
        if (entity && data && data.salvagePointId === record.salvagePointId
          && data.salvageSourceKey === sourceKey && data.salvorClaimedBy === claimantId) {
          delete data.salvorClaimedBy;
          break;
        }
      }
    }
    return { ok: true, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
  },

  _takeSource(request = {}) {
    const sourceKey = cleanIdentity(request.sourceKey);
    const claimantId = cleanIdentity(request.claimantId);
    const workId = cleanIdentity(request.workId);
    const record = this._sourceRecord(sourceKey, false);
    if (!record || !claimantId || record.extracted || record.claimId !== claimantId) {
      return { ok: false, duplicate: !!(record && record.extracted), pool: {}, source: this._sourceSnapshot(sourceKey) };
    }
    const pool = clonePool(record.remainingPool);
    if (poolTotal(pool) <= 0) {
      record.extracted = true;
      record.claimId = null;
      this._retireSourceEntity(record, sourceKey);
      return { ok: false, duplicate: true, pool: {}, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
    }
    record.remainingPool = {};
    record.claimId = null;
    record.workId = workId || record.workId || null;
    record.extractedBy = claimantId;
    record.extracted = true;
    this._retireSourceEntity(record, sourceKey);
    return { ok: true, pool, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
  },

  _drainSource(request = {}) {
    const sourceKey = cleanIdentity(request.sourceKey);
    const minerId = cleanIdentity(request.minerId);
    const record = this._sourceRecord(sourceKey, false);
    if (!record || !minerId || record.extracted || poolTotal(record.remainingPool) <= 0) {
      return { ok: false, taken: {}, source: this._sourceSnapshot(sourceKey) };
    }
    const taken = takePool(record.remainingPool, request.requested);
    if (poolTotal(taken) <= 0) return { ok: false, taken: {}, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
    if (record.claimId && record.claimId !== minerId) record.disputedBy = minerId;
    if (poolTotal(record.remainingPool) <= 0) {
      record.remainingPool = {};
      record.claimId = null;
      record.workId = `player-mining:${minerId}`;
      record.extractedBy = minerId;
      record.extracted = true;
      this._retireSourceEntity(record, sourceKey);
    } else {
      this._syncSourceEntity(record, sourceKey);
    }
    return { ok: true, taken, source: snapshotSourceRecord(record, sourceDescriptor(sourceKey)) };
  },

  _syncSourceEntity(record, sourceKey) {
    const entity = this._entityForPoint(record.salvagePointId, sourceKey);
    if (entity && entity.data) entity.data.salvagePool = clonePool(record.remainingPool);
  },

  _retireSourceEntity(record, sourceKey) {
    const entities = this.state.entities;
    if (entities && typeof entities.values === 'function') {
      for (const entity of entities.values()) {
        const data = entity && entity.data;
        if (entity && data && data.salvagePointId === record.salvagePointId && data.salvageSourceKey === sourceKey) {
          entity.alive = false;
          break;
        }
      }
    }
    const point = this._ensureState().points.find((entry) => entry && entry.id === record.salvagePointId
      && entry.sourceKey === sourceKey);
    if (point) point.entityId = null;
  },

  // =====================================================================================
  // PLACEMENT (deterministic, on sector entry)
  // =====================================================================================
  _planForSector(sectorId) {
    // Sync lane (emit listener): drain the chunked steps inline — the census drive
    // holds the same generator across its slices.
    for (const _ of this._planForSectorSteps(sectorId)) { /* inline */ }
  },

  *_planForSectorSteps(sectorId) {
    const state = this.state;
    if (!sectorId) return;
    // Idempotent within a visit: re-entering the same sector without leaving keeps the same layout.
    if (state.salvage.plannedSectorId === sectorId && state.salvage.points.some((s) => s.sectorId === sectorId)) return;

    // Drop stale points from other sectors (their wreck entities are culled by world teardown).
    state.salvage.points = state.salvage.points.filter((s) => s.sectorId === sectorId);
    state.salvage.plannedSectorId = sectorId;
    // Sort pockets share the points' lifecycle: rebuilt with the sector, transient by design.
    if (Array.isArray(state.salvage.sortPockets)) {
      state.salvage.sortPockets = state.salvage.sortPockets.filter((p) => p && p.sectorId === sectorId);
    }

    const zones = (typeof zonesForSector === 'function' ? zonesForSector(sectorId) : [])
      .filter((z) => z && z.type === 'derelict_field' && z.center);
    if (!zones.length) {
      this._bindPlayerWreckFromAftermath(sectorId);
      return;
    }

    const hash32 = (this.helpers && this.helpers.hash32) || fallbackHash32;
    const mulberry32 = (this.helpers && this.helpers.mulberry32) || fallbackMulberry32;
    const seed = state.meta && state.meta.seed;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;

    for (const zone of zones) {
      yield;
      if (zone.salvageCutterSource) {
        const rec = this._makeSourceSalvagePoint(sectorId, zone, zone.salvageCutterSource, spawnEntity);
        if (rec) state.salvage.points.push(rec);
        continue;
      }
      const rng = mulberry32(hash32(seed, sectorId, zone.id, 'salvage'));
      // 0..MAX per zone (biased toward 1-2 so a derelict field usually reads as populated).
      const count = Math.min(MAX_SALVAGE_PER_ZONE, Math.round(rng() * (MAX_SALVAGE_PER_ZONE + 0.4)));
      if (count <= 0) continue;
      const radius = Math.max(SCATTER_MIN + 20, (zone.radius || 400) * SCATTER_FRAC);
      const wantComm = rng() < COMMUNICATOR_CHANCE;

      for (let i = 0; i < count; i++) {
        yield;
        const ang = rng() * Math.PI * 2;
        const r = SCATTER_MIN + Math.sqrt(rng()) * (radius - SCATTER_MIN);
        const pos = { x: zone.center.x + Math.cos(ang) * r, z: zone.center.z + Math.sin(ang) * r };
        const isCommunicator = wantComm && i === 0;   // at most one communicator per zone, first slot
        const rec = this._makeSalvagePoint(sectorId, zone, i, pos, isCommunicator, rng, spawnEntity, seed);
        // A durable recovery sidecar may already own this stable point across Continue. Reserve it
        // before salvage:placed so survivor/loss promotion systems cannot claim the same wreck.
        const recovery = Object.values(state.recoveryEncounters && state.recoveryEncounters.records || {})
          .find((row) => row && row.salvagePointId === rec.id);
        if (recovery) {
          rec.offered = true;
          rec.recoveryEncounterId = recovery.id;
        }
        state.salvage.points.push(rec);
      }
    }

    if (state.salvage.points.length) {
      this.bus.emit('salvage:placed', {
        sectorId,
        count: state.salvage.points.length,
        communicators: state.salvage.points.filter((s) => s.isCommunicator).length,
      });
    }
    this._publishWreckFieldSources(sectorId, zones, state.salvage.points);
    this._bindPlayerWreckFromAftermath(sectorId);
  },

  _publishWreckFieldSources(sectorId, zones, points) {
    if (!this.bus || typeof this.bus.emit !== 'function' || !Array.isArray(zones)) return 0;
    let published = 0;
    for (const zone of zones) {
      const local = (points || []).filter((point) => point && point.zoneId === zone.id);
      const pos = local[0] && local[0].pos
        ? { x: local[0].pos.x, z: local[0].pos.z }
        : (zone.center ? sectorLocalToGlobalForSector(zone.center, sectorId) : null);
      if (!pos) continue;
      this.bus.emit('wreckField:source', {
        fieldId: `salvage:${zone.id}`,
        sectorId,
        zoneId: zone.id,
        kind: 'salvage',
        pos,
        // Authored derelicts have been here for years. Age them one day so the field is an
        // encounter place on the first visit, still using the same sim-day clock.
        bornAt: -WRECK_ECOLOGY_DAY_S,
      });
      published += 1;
    }
    return published;
  },

  _onPlayerWreckMarker(payload) {
    if (!isPlayerWreckMarker(payload)) return null;
    return this._bindPlayerWreckPoint(payload);
  },

  _onPlayerWreckSpawned(payload) {
    if (!payload || !payload.markerId) return null;
    const marker = playerWreckMarker(this.state);
    if (!marker || marker.markerId !== payload.markerId) return null;
    return this._bindPlayerWreckPoint(marker, payload.entityId);
  },

  _bindPlayerWreckFromAftermath(sectorId) {
    const marker = playerWreckMarker(this.state);
    if (!marker || (sectorId && marker.sectorId !== sectorId)) return null;
    let entityId = null;
    const list = indexedTypeScan(this.state, 'wrecks');
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (entity && entity.alive !== false && entity.data && entity.data.markerId === marker.markerId) {
        entityId = entity.id;
        break;
      }
    }
    return this._bindPlayerWreckPoint(marker, entityId);
  },

  _bindPlayerWreckPoint(marker, entityId = null) {
    if (!isPlayerWreckMarker(marker) || !marker.markerId) return null;
    const salvageState = this._ensureState();
    const id = `player_wreck:${marker.markerId}`;
    let rec = salvageState.points.find((point) => point && point.id === id);
    if (!rec) {
      rec = {
        id,
        sectorId: marker.sectorId,
        zoneId: marker.zoneId || null,
        pos: { x: marker.pos.x, z: marker.pos.z },
        playerWreck: true,
        markerId: marker.markerId,
        isCommunicator: false,
        offered: false,
        entityId: entityId,
      };
      salvageState.points.push(rec);
    } else {
      rec.pos = { x: marker.pos.x, z: marker.pos.z };
      rec.playerWreck = true;
      rec.markerId = marker.markerId;
      if (entityId != null) rec.entityId = entityId;
    }
    return rec;
  },

  _makeSalvagePoint(sectorId, zone, idx, localPos, isCommunicator, rng, spawnEntity, seed = null) {
    // Zone scatter is authored in sector-local XZ. Entity positions, discovery records and the
    // wreckField:source consumed by scavenger ecology all use galactic-global XZ, just like world.
    const pos = sectorLocalToGlobalForSector(localPos, sectorId);
    const id = `${zone.id}:sal${idx}`;
    let mission = null;
    if (isCommunicator) mission = pickWreckMission(rng);
    const pool = isCommunicator ? { cmdty_scrap_metal: 1 } : pickPool(rng);
    // Communicator missions with authored haul params put their contract cargo in the wreck pool:
    // "recover the box / canisters / offering" is a pull job, not a fetch-quest.
    if (isCommunicator && mission && mission.params && mission.params.cmdtyId) {
      const qty = Math.max(1, Math.floor(Number(mission.params.qty) || 1));
      pool[mission.params.cmdtyId] = (Math.floor(Number(pool[mission.params.cmdtyId]) || 0)) + qty;
    }

    let entityId = null;
    let wreckEntity = null;
    if (typeof spawnEntity === 'function') {
      // A wreck entity: tether-compatible (ATTACHABLE_TYPES includes 'wreck') and drainable by the
      // salvage beam (mining._drainWreck reads data.salvagePool / data.salvageTimeLeft). The
      // communicator carries the mission hook + a scan glyph so it reads distinctly on radar.
      const ent = spawnEntity({
        type: 'wreck',
        pos: { x: pos.x, z: pos.z },
        radius: WRECK_RADIUS,
        mass: WRECK_MASS,
        hull: 1,
        hullMax: 1,
        physicsBody: { shape: 'capsule' },
        data: {
          parentType: isCommunicator ? 'communicator' : 'debris',
          proportions: WRECK_COLLIDER_PROPORTIONS,
          loot: [],
          salvagePool: pool,
          salvageTimeLeft: WRECK_SALVAGE_TIME,
          salvagePointId: id,
          isCommunicator: !!isCommunicator,
          wreckMissionId: mission ? mission.id : null,
          scanLabel: isCommunicator ? 'Distress Communicator' : 'Wreck Debris',
        },
      });
      entityId = ent ? ent.id : null;
      wreckEntity = ent || null;
    }

    // SF-029: a rolled wreck hosts the salvage-sorting pocket. The roll draws from its OWN
    // seed-hashed stream — never from the zone rng above — so existing placement rolls stay
    // byte-identical whether or not the pocket lands.
    if (wreckEntity && !isCommunicator && seed != null) {
      this._makeSortPocket(sectorId, zone, id, wreckEntity, seed, spawnEntity);
    }

    return {
      id,
      sectorId,
      zoneId: zone.id,
      pos: { x: pos.x, z: pos.z },
      entityId,
      isCommunicator: !!isCommunicator,
      wreckMissionId: mission ? mission.id : null,
      offered: false,        // flips true once the mission has been offered (dedupe)
    };
  },

  // =====================================================================================
  // SF-029 — salvage-sorting pocket: spawn, clamp adoption, integrity, cradle delivery
  // =====================================================================================

  _makeSortPocket(sectorId, zone, pointId, wreck, seed, spawnEntity) {
    if (typeof spawnEntity !== 'function' || !wreck || wreck.alive === false) return null;
    const hash32 = (this.helpers && this.helpers.hash32) || fallbackHash32;
    const mulberry32 = (this.helpers && this.helpers.mulberry32) || fallbackMulberry32;
    const rng = mulberry32(hash32(seed, sectorId, zone.id, 'sort', pointId));
    if (rng() >= SORT_POCKET_ODDS) return null;
    // The core is the wreck's own leading pool entry — no invented cargo, the job is a SORT of
    // what this wreck already truthfully carries.
    const wreckPool = wreck.data && wreck.data.salvagePool && typeof wreck.data.salvagePool === 'object'
      ? wreck.data.salvagePool : null;
    const commodityId = wreckPool ? Object.keys(wreckPool).find((cid) => Math.floor(Number(wreckPool[cid]) || 0) > 0) : null;
    const poolQty = commodityId ? Math.floor(Number(wreckPool[commodityId])) : 0;
    if (!commodityId || poolQty <= 0) return null;

    const pocketId = `${pointId}:sort`;
    const wx = wreck.pos.x, wz = wreck.pos.z;
    const TAU = Math.PI * 2;
    const gapA = rng() * TAU;
    const gapB = (gapA + Math.PI) % TAU;
    // The core starts seated at the wreck under its clamp.
    const coreAng = rng() * TAU;
    const coreDist = WRECK_RADIUS + SORT_CORE_RADIUS + SORT_CORE_OFFSET;
    // The cradle sits 90° off the first safe gap: the straight run crosses the ring (the risky
    // fast route); the two gaps are the safe pull directions that then curve to the cradle.
    const cradleAng = (gapA + (rng() < 0.5 ? 1 : -1) * Math.PI / 2) % TAU;

    const core = spawnEntity({
      type: 'payload',
      pos: { x: wx + Math.cos(coreAng) * coreDist, z: wz + Math.sin(coreAng) * coreDist },
      vel: { x: 0, z: 0 },
      radius: SORT_CORE_RADIUS,
      mass: SORT_CORE_MASS,
      hull: SORT_CORE_HULL,
      hullMax: SORT_CORE_HULL,
      // Sensor body like every authored payload: no component impacts, but SG-02 keeps a real
      // dynamic body so the massline can attach and the clamp can hold it.
      collides: false,
      physicsBody: {
        dynamic: true,
        radius: SORT_CORE_RADIUS,
        mass: SORT_CORE_MASS,
        inertiaY: 0.5 * SORT_CORE_MASS * SORT_CORE_RADIUS * SORT_CORE_RADIUS,
        ccd: false,
        material: 'massline_sensor',
      },
      data: {
        parentType: 'sort_core',
        role: 'sort_core',
        loot: [],
        salvagePool: { [commodityId]: poolQty },
        salvagePointId: pointId,
        scanLabel: 'Wreck Drive Core',
        sortPocketId: pocketId,
        transientSector: false,
      },
    });
    if (!core || core.alive === false) return null;

    // Light dangerous debris ring with two authored gaps. Angular placement retries are bounded
    // and seeded; geometry is real — the lanes are actually clear.
    const debrisIds = [];
    for (let k = 0; k < SORT_DEBRIS_COUNT; k++) {
      let placed = false;
      for (let attempt = 0; attempt < 6 && !placed; attempt++) {
        const ang = (k / SORT_DEBRIS_COUNT) * TAU + rng() * (TAU / SORT_DEBRIS_COUNT);
        const nearGap = angularNear(ang, gapA, SORT_GAP_HALF_RAD) || angularNear(ang, gapB, SORT_GAP_HALF_RAD);
        if (nearGap) continue;
        const r = SORT_RING_INNER + rng() * (SORT_RING_OUTER - SORT_RING_INNER);
        const debris = spawnEntity({
          type: 'wreck',
          pos: { x: wx + Math.cos(ang) * r, z: wz + Math.sin(ang) * r },
          vel: { x: 0, z: 0 },
          radius: 3 + rng() * 2,
          mass: SORT_DEBRIS_MASS,
          hull: 1,
          hullMax: 1,
          physicsBody: { shape: 'capsule' },
          data: {
            parentType: 'sort_debris',
            loot: [],
            authoredSalvagePool: { cmdty_scrap_metal: 1 },
            authoredScanLabel: 'Light Debris',
            salvagePointId: pointId,
            sortPocketId: pocketId,
          },
        });
        if (debris && debris.alive !== false) debrisIds.push(debris.id);
        placed = true;
      }
    }

    const cradlePos = { x: wx + Math.cos(cradleAng) * SORT_CRADLE_DISTANCE, z: wz + Math.sin(cradleAng) * SORT_CRADLE_DISTANCE };
    const cradle = spawnEntity({
      type: 'wreck',
      pos: cradlePos,
      vel: { x: 0, z: 0 },
      radius: SORT_CRADLE_RADIUS,
      mass: SORT_CRADLE_MASS,
      hull: 1e9,
      hullMax: 1e9,
      // SG-02 substance law: a static destination needs the authored static body.
      collides: true,
      physicsBody: {
        dynamic: false,
        radius: SORT_CRADLE_RADIUS,
        mass: SORT_CRADLE_MASS,
      },
      data: {
        parentType: 'sort_cradle',
        loot: [],
        authoredSalvagePool: {},
        authoredScanLabel: 'Salvage Cradle',
        salvagePointId: pointId,
        sortPocketId: pocketId,
      },
    });
    if (!cradle || cradle.alive === false) return null;

    const salvageState = this._ensureState();
    const pocket = {
      id: pocketId,
      schema: 'spaceface.salvageSort.v1',
      sectorId,
      zoneId: zone.id,
      wreckId: wreck.id,
      coreId: core.id,
      cradleId: cradle.id,
      debrisIds,
      commodityId,
      poolQty,
      gapAngles: [gapA, gapB],
      clampId: null,
      phase: 'held',          // held → free → delivered | lost
      integrity: 1,
      prevCorePos: null,
      contacts: null,         // debris ids currently touching the towed core (lazily a Set)
    };
    salvageState.sortPockets.push(pocket);
    return pocket;
  },

  _sortAttachments() {
    const registry = this.registry;
    if (!registry || typeof registry.get !== 'function') return null;
    const actions = registry.get('actions');
    if (actions && actions.kernel && actions.kernel.attachments) return actions.kernel.attachments;
    const combat = registry.get('combat');
    return combat && combat.kernel && combat.kernel.attachments ? combat.kernel.attachments : null;
  },

  _updateSortPockets(dt, state) {
    const pockets = state.salvage && state.salvage.sortPockets;
    if (!pockets || !pockets.length) return;
    if (state.mode && state.mode !== 'flight') return;
    const attachments = this._sortAttachments();
    const entities = state.entities;
    if (!entities || typeof entities.get !== 'function') return;
    const bus = this.bus;
    for (const pocket of pockets) {
      if (!pocket || pocket.phase === 'delivered' || pocket.phase === 'lost') continue;
      const core = entities.get(pocket.coreId);
      if (!core || core.alive === false) { this._loseSortPocket(pocket, 'core_lost'); continue; }
      const wreck = entities.get(pocket.wreckId);
      const cradle = entities.get(pocket.cradleId);
      if (!cradle || cradle.alive === false) { this._loseSortPocket(pocket, 'cradle_lost'); continue; }

      // Clamp truth: adopted once both bodies are live, then read from the attachment authority.
      // ONLY an ADOPTED clamp observed no-longer-active shears the core — the kernel keeps broken
      // records in its byId map, so a non-active state IS the kernel's own break verdict, and a
      // record the authority lost outright means the constraint is physically gone either way.
      // A failed CREATION attempt (the physics port can still be booting) is transient: it stays
      // 'held' silently and retries next tick — a boot race never reads as a shear, and a core
      // under an unadopted pocket stays uncollectible.
      if (pocket.clampId == null) {
        if (!wreck || wreck.alive === false) {
          // The wreck died holding the core: the clamp authority breaks with it.
          this._separateSortCore(pocket, 'wreck_lost');
        } else if (attachments) {
          const created = attachments.create({
            defId: SORT_CLAMP_DEF_ID,
            ownerId: wreck.id,
            targetId: core.id,
            sourceWorld: { x: wreck.pos.x, y: 0, z: wreck.pos.z },
            targetWorld: { x: core.pos.x, y: 0, z: core.pos.z },
          });
          if (created && created.ok) {
            pocket.clampId = created.attachment ? created.attachment.id : created.id;
            pocket.phase = 'held';
          }
          // else: creation can fail while the physics port boots — retry next tick, still held.
        }
      } else {
        const clamp = attachments ? attachments.get(pocket.clampId) : null;
        if (attachments && clamp && clamp.state !== 'active') {
          this._separateSortCore(pocket, 'clamp_broken');
        }
      }

      if (pocket.phase === 'free') {
        this._sortDebrisContact(pocket, core, entities);
        // Delivery: free core, inside the cradle, slow enough to be set down. While the clamp
        // still holds, the core CANNOT be collected — the acceptance case that keeps the job
        // physical instead of a proximity timer.
        const dx = cradle.pos.x - core.pos.x, dz = cradle.pos.z - core.pos.z;
        const reach = (Number(cradle.radius) || 0) + (Number(core.radius) || 0);
        const speed = Math.hypot(Number(core.vel && core.vel.x) || 0, Number(core.vel && core.vel.z) || 0);
        if (dx * dx + dz * dz <= reach * reach && speed <= SORT_DELIVER_MAX_SPEED) {
          this._deliverSortPocket(pocket, core, cradle, state);
          continue;
        }
      }
      pocket.prevCorePos = { x: core.pos.x, z: core.pos.z };
    }
  },

  _separateSortCore(pocket, reason) {
    pocket.phase = 'free';
    if (!this.bus) return;
    this.bus.emit('salvage:sortSeparated', {
      schema: 'spaceface.salvageSort.v1', pocketId: pocket.id,
      wreckId: pocket.wreckId, coreId: pocket.coreId, reason,
    });
    if (reason !== 'wreck_lost') {
      // One honest line: the clamp is a physical thing that broke under load.
      this.bus.emit('comms:log', {
        from: 'WRECK FIELD',
        text: 'CLAMP SHEARED — the drive core is loose. Cradle marks the drop.',
        kind: 'salvage',
      });
    }
  },

  _sortDebrisContact(pocket, core, entities) {
    if (!pocket.prevCorePos) return;
    if (!pocket.contacts) pocket.contacts = new Set();
    for (const debrisId of pocket.debrisIds) {
      const debris = entities.get(debrisId);
      if (!debris || debris.alive === false) continue;
      const rSum = (Number(core.radius) || 0) + (Number(debris.radius) || 0);
      // Swept between ticks: the towed core's segment against the debris disk, so a fast tow
      // cannot tunnel through the light debris without the contact being read.
      const ax = pocket.prevCorePos.x, az = pocket.prevCorePos.z;
      const bx = core.pos.x, bz = core.pos.z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 1e-12
        ? Math.max(0, Math.min(1, ((debris.pos.x - ax) * dx + (debris.pos.z - az) * dz) / len2))
        : 0;
      const nx = ax + dx * t - debris.pos.x, nz = az + dz * t - debris.pos.z;
      const hit = nx * nx + nz * nz <= rSum * rSum;
      if (hit && !pocket.contacts.has(debrisId)) {
        pocket.contacts.add(debrisId);
        pocket.integrity = Math.max(0, pocket.integrity - SORT_IMPACT_DAMAGE);
        if (this.bus) {
          this.bus.emit('salvage:sortImpact', {
            schema: 'spaceface.salvageSort.v1', pocketId: pocket.id,
            debrisId, integrity: pocket.integrity,
          });
          this.bus.emit('toast', {
            text: `Core scored by debris — integrity ${Math.round(pocket.integrity * 100)}%.`,
            kind: 'warn', ttl: 3,
          });
        }
      } else if (!hit && pocket.contacts.has(debrisId)) {
        pocket.contacts.delete(debrisId);
      }
    }
  },

  _deliverSortPocket(pocket, core, cradle, state) {
    const paid = Math.floor(pocket.poolQty * pocket.integrity);
    const accepted = addSalvage(state, pocket.commodityId, paid);
    const lost = Math.max(0, pocket.poolQty - paid);
    const repairEstimateCr = lost > 0 ? lost * (BASE_PRICE_BY_ID.get(pocket.commodityId) || 0) : 0;
    pocket.phase = 'delivered';
    // The cradle took the core; this runtime spawned it and retires it.
    core.alive = false;
    if (!this.bus) return;
    const receipt = {
      schema: 'spaceface.salvageSort.v1',
      pocketId: pocket.id,
      cradleId: pocket.cradleId,
      commodityId: pocket.commodityId,
      poolQty: pocket.poolQty,
      integrity: pocket.integrity,
      paid,
      accepted,
      lost,
      repairEstimateCr,
    };
    this.bus.emit('salvage:sortDelivered', receipt);
    const pct = Math.round(pocket.integrity * 100);
    this.bus.emit('toast', {
      text: accepted > 0
        ? `Cradle took the core — ${accepted}u ${pocket.commodityId.replace('cmdty_', '').replaceAll('_', ' ')} to the bay (${pct}% integrity).`
        : 'Cradle took the core — the salvage bay could not take one more unit.',
      kind: accepted > 0 ? 'info' : 'warn', ttl: 4,
    });
    if (lost > 0) {
      this.bus.emit('comms:log', {
        from: 'SALVAGE CRADLE',
        text: `Delivery short: ${lost}u scored. That is ${repairEstimateCr}cr of core repair you are eating.`,
        kind: 'salvage',
      });
    }
    this.bus.emit('audio:cue', { id: 'scan_resolve', gain: 0.6 });
  },

  _loseSortPocket(pocket, reason) {
    pocket.phase = 'lost';
    if (this.bus) {
      this.bus.emit('salvage:sortLost', {
        schema: 'spaceface.salvageSort.v1', pocketId: pocket.id, reason,
      });
    }
  },

  _makeSourceSalvagePoint(sectorId, zone, descriptor, spawnEntity) {
    if (!descriptor || descriptor.sectorId !== sectorId || descriptor.zoneId !== zone.id) return null;
    const sourceKey = cleanIdentity(descriptor.sourceKey);
    const record = this._sourceRecord(sourceKey, true);
    if (!record || record.extracted || poolTotal(record.remainingPool) <= 0) return null;

    const existing = this._entityForPoint(record.salvagePointId, sourceKey);
    let entityId = existing ? existing.id : null;
    if (!existing && typeof spawnEntity === 'function') {
      const ent = spawnEntity({
        type: 'wreck',
        pos: { x: descriptor.pos.x, z: descriptor.pos.z },
        radius: WRECK_RADIUS,
        mass: WRECK_MASS,
        hull: 1,
        hullMax: 1,
        physicsBody: { shape: 'capsule' },
        data: {
          parentType: 'freighter',
          proportions: WRECK_COLLIDER_PROPORTIONS,
          loot: [],
          salvagePool: clonePool(record.remainingPool),
          salvageTimeLeft: WRECK_SALVAGE_TIME,
          salvagePointId: record.salvagePointId,
          salvageSourceKey: sourceKey,
          isCommunicator: false,
          wreckMissionId: null,
          scanLabel: 'Dead Freighter Drift',
        },
      });
      entityId = ent ? ent.id : null;
    }
    return {
      id: record.salvagePointId,
      sourceKey,
      sectorId,
      zoneId: zone.id,
      pos: { x: descriptor.pos.x, z: descriptor.pos.z },
      entityId,
      isCommunicator: false,
      wreckMissionId: null,
      offered: false,
    };
  },

  // =====================================================================================
  // TRIGGER (proximity OR scan) → reveal log + offer mission
  // =====================================================================================
  update(dt, state) {
    // SF-029: sort pockets tick first — their clamp/damage/delivery reads are flight-mode gated
    // and a strict no-op until a pocket actually rolled.
    this._updateSortPockets(dt, state);
    const list = state.salvage && state.salvage.points;
    if (!list || !list.length) return;             // no salvage → strict no-op (golden-sim safe)
    if (state.mode && state.mode !== 'flight') return;
    // Any un-offered communicators left? If not, skip the proximity scan entirely.
    let pending = false;
    for (const s of list) { if (s.isCommunicator && !s.offered) { pending = true; break; } }
    if (!pending) return;

    const player = state.entities && state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    const r2 = COMMUNICATOR_FIND_RADIUS * COMMUNICATOR_FIND_RADIUS;
    for (const s of list) {
      if (!s.isCommunicator || s.offered) continue;
      const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z;
      if (dx * dx + dz * dz <= r2) this._offerFromPoint(s);
    }
  },

  // Relief, not a second strain tone: the wanted-clear fall is the "pressure is gone"
  // voice. One play, and only on the clear — never while the line is still hauling.
  _onReactorTowedClear() {
    const id = combatVerbRecipe('salvage:reactorTowedClear');
    if (!id || !this.bus) return;
    this.bus.emit('audio:cue', { id, gain: 0.7 });
  },

  _onScan(p) {
    const list = this.state.salvage && this.state.salvage.points;
    if (!list || !list.length || !p) return;
    const targetId = p.targetId != null ? p.targetId : (p.entityId != null ? p.entityId : null);
    if (targetId == null) return;
    for (const s of list) {
      if (s.isCommunicator && !s.offered && s.entityId === targetId) this._offerFromPoint(s);
    }
  },

  /**
   * True when this point's offer is already claimed by the durable trails missions owns — a
   * settle receipt, a live accepted mission, or a still-boarded row. Sector replan forgets
   * `offered` (points are rebuilt on entry/Continue), so without this check a settled find
   * would re-sound its signal and re-emit an offer the board must reject anyway.
   */
  _offerAlreadyKnown(point) {
    const offerId = `salvage_${point && point.id}`;
    const missionState = this.state.missions;
    if (!missionState) return false;
    if ((missionState.receipts || []).some((r) => r && r.sourceOfferId === offerId)) return true;
    if ((missionState.active || []).some((m) => m && m.sourceOfferId === offerId)) return true;
    for (const board of Object.values(missionState.boards || {})) {
      if ((board && board.slots || []).some((o) => o && o.id === offerId)) return true;
    }
    return false;
  },

  // Reveal the black-box/log line and emit the mission offer hook. Idempotent per point.
  _offerFromPoint(point) {
    if (!point || point.offered) return;
    point.offered = true;
    const mission = point.wreckMissionId ? this._resolveMission(point.wreckMissionId) : null;
    if (!mission) {
      // Communicator with no template (degraded) — still surface the discovery, no offer.
      this.bus.emit('toast', { text: 'A dead communicator drifts silent in the wreckage.', kind: 'info', ttl: 3 });
      return;
    }

    // Replan rebuilt this point un-offered; the contract it carries may already be settled,
    // live, or still sitting on a board. In every case stay quiet — no replayed signal, no
    // re-emitted row (the receipt is the authority that also blocks re-boarding).
    if (this._offerAlreadyKnown(point)) return;

    // The black-box / distress log line (the hook the brief asks for).
    this.bus.emit('comms:log', { from: mission.giver || 'Derelict', text: mission.log, kind: 'salvage' });
    this.bus.emit('toast', { text: `Signal recovered — ${mission.giver}: "${truncate(mission.log, 80)}"`, kind: 'info', ttl: 5 });
    this.bus.emit('audio:cue', { id: 'scan_resolve' });

    // The mission offer — a self-contained comms hook the missions/UI layer can consume. We do NOT
    // touch missions state directly (we don't own it); we hand over the full template so a listener
    // can add it to the active list / show an accept prompt.
    const offer = this._buildOffer(mission, point);
    // Only emit a row the board can actually host — an unreachable stationId would spend the
    // offer silently. With the remote fallback this stays a defensive gate, not the path.
    if (offer.stationId) this.bus.emit('mission:offered', offer);
    this.bus.emit('salvage:communicatorFound', {
      salvagePointId: point.id,
      sectorId: point.sectorId,
      zoneId: point.zoneId,
      missionId: mission.id,
      pos: { x: point.pos.x, z: point.pos.z },
    });
  },

  _resolveMission(id) {
    // Small local import-free lookup: pickWreckMission already imported; use its by-id sibling lazily.
    return wreckMissionByIdSafe(id);
  },

  // Deterministic origin/destination station for the wreck contract: the sector's own
  // mission-capable dock (a communicator offer is a local recovery job, not a courier leg).
  // hash32(point.id) picks the slot so re-entering the sector re-issues the same board row.
  _wreckStation(point) {
    const sec = SECTOR_BY_ID.get(point && point.sectorId);
    if (!sec) return null;                    // an uncharted sector id can host no board at all
    const stations = sec.stations || [];
    const capable = stations.filter((s) => s && s.services && s.services.includes('missions') && !s.repGated);
    const pool = capable.length ? capable : stations.filter((s) => s && !s.repGated);
    if (pool.length) {
      const idx = fallbackHash32(point.id, 'salvage-station') % pool.length;
      return pool[idx] || pool[0] || null;
    }
    // The sector's own docks are either absent or entirely rep-locked — boarding there would
    // spend the communicator's one offer on a row the player can never reach. Reroute the
    // posting to a deterministic mission-capable dock anywhere on the chart instead: the
    // contract is still playable, just filed at the operator's home station.
    const remote = [];
    for (const sector of SECTORS) {
      for (const s of (sector && sector.stations) || []) {
        if (s && !s.repGated && s.services && s.services.includes('missions')) remote.push(s);
      }
    }
    if (!remote.length) return null;
    remote.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return remote[fallbackHash32(point.id, 'salvage-station-remote') % remote.length] || null;
  },

  _buildOffer(mission, point) {
    // Board-schema offer (missions._onExternalBoardOffer): id/type/stationId/params are required.
    // The board is the sector's mission dock; the job itself is fieldwork at the wreck.
    const station = this._wreckStation(point);
    const params = { ...(wreckOfferParams(mission)) };
    if (mission.params && typeof mission.params === 'object') Object.assign(params, mission.params);
    params.salvagePointId = point.id;
    params.wreckMissionId = mission.id;
    params.wreckPos = { x: point.pos.x, z: point.pos.z };
    params.wreckSectorId = point.sectorId;
    return {
      id: `salvage_${point.id}`,
      offerId: `salvage_${point.id}`,   // legacy field kept for any consumer keyed on it
      source: 'salvage',
      salvagePointId: point.id,
      sectorId: point.sectorId,
      zoneId: point.zoneId,
      type: mission.type,
      stationId: station ? station.id : null,
      factionId: null,                  // circumstance contract — no standing gate on a wreck find
      destStationId: station ? station.id : null,
      destSectorId: point.sectorId,
      distance: 600,
      riskTier: 1,
      collateral_cr: 0,
      duration_s: 2400,                 // a drifting wreck is a same-trip job, not an open contract
      time_limit_s: 2400,
      title: mission.title,
      summary: mission.summary,
      brief: mission.log ? `"${truncate(mission.log, 140)}"` : (mission.summary || null),
      giver: mission.giver,
      log: mission.log,
      reward_cr: mission.reward_cr || 0,
      choice: mission.choice || null,
      tag: mission.tag || 'wreck_salvage',
      wreckMissionId: mission.id,
      params,
      pos: { x: point.pos.x, z: point.pos.z },
    };
  },
};

// Per-type floor for communicator templates that carry no authored params (the pod is the
// physical passenger; other types always author their cargo). Kept minimal — templates own
// the numbers; this only guarantees a valid board shape for a degraded table row.
function wreckOfferParams(mission) {
  switch (mission && mission.type) {
    case 'cargo_delivery':
    case 'smuggling_run':
      return { cmdtyId: 'cmdty_classified_salvage', qty: 1, cargoValue: 140, fValue: 1, taskTime: 30 };
    case 'salvage_retrieval':
      return { cmdtyId: 'cmdty_salvage_electronics', qty: 2, cargoValue: 70, fValue: 1, taskTime: 30 };
    case 'bounty_hunt':
      return { targetStrength: 2, fValue: 1.2, taskTime: 90 };
    case 'patrol_clear':
      return { clearCount: 2, killCount: 0, targetStrength: 1.4, fValue: 1.4, taskTime: 90 };
    case 'recon_scan':
      return { scanTargets: 1, progress: 0, fValue: 1, taskTime: 25 };
    case 'passenger_transport':
      return { passengers: 1, fValue: 1, taskTime: 20 };
    default:
      return { fValue: 1, taskTime: 30 };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────
function wreckMissionByIdSafe(id) { try { return wreckMissionById(id); } catch (_) { return null; } }

function pickPool(rng) {
  const i = Math.floor((typeof rng === 'function' ? rng() : 0) * DEBRIS_POOLS.length) % DEBRIS_POOLS.length;
  // shallow copy so per-point drain can't mutate the shared template
  return { ...DEBRIS_POOLS[i] };
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** Wrap an angle difference to [-PI, PI] and test it against a half-width. */
function angularNear(ang, center, halfWidth) {
  let d = (ang - center) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= halfWidth;
}

function freshSalvageState() {
  return { points: [], plannedSectorId: null, sortPockets: [], sources: {} };
}

function sourceDescriptor(sourceKey) {
  if (sourceKey !== VESTA_DERELICT_SALVAGE_SOURCE.sourceKey) return null;
  return VESTA_DERELICT_SALVAGE_SOURCE;
}

function freshSourceRecord(descriptor) {
  return {
    sourceKey: descriptor.sourceKey,
    salvagePointId: descriptor.salvagePointId,
    sectorId: descriptor.sectorId,
    zoneId: descriptor.zoneId,
    remainingPool: clonePool(descriptor.pool),
    claimId: null,
    workId: null,
    extractedBy: null,
    disputedBy: null,
    extracted: false,
  };
}

function normalizeSourceLedger(rawSources) {
  if (!rawSources || typeof rawSources !== 'object' || Array.isArray(rawSources)) return {};
  const result = {};
  for (const sourceKey of Object.keys(rawSources).sort((a, b) => a.localeCompare(b))) {
    if (Object.keys(result).length >= MAX_DURABLE_SOURCES) break;
    const descriptor = sourceDescriptor(sourceKey);
    const record = normalizeSourceRecord(rawSources[sourceKey], descriptor);
    if (record) result[sourceKey] = record;
  }
  return result;
}

function normalizeSourceRecord(raw, descriptor) {
  if (!descriptor || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const remainingPool = normalizePool(raw.remainingPool);
  const extracted = raw.extracted === true || poolTotal(remainingPool) <= 0;
  return {
    sourceKey: descriptor.sourceKey,
    salvagePointId: descriptor.salvagePointId,
    sectorId: descriptor.sectorId,
    zoneId: descriptor.zoneId,
    remainingPool: extracted ? {} : remainingPool,
    claimId: extracted ? null : cleanIdentity(raw.claimId),
    workId: cleanIdentity(raw.workId),
    extractedBy: cleanIdentity(raw.extractedBy),
    disputedBy: cleanIdentity(raw.disputedBy),
    extracted,
  };
}

function snapshotSourceRecord(record, descriptor) {
  if (!record || !descriptor) return null;
  const remainingPool = clonePool(record.remainingPool);
  return {
    sourceKey: descriptor.sourceKey,
    salvagePointId: descriptor.salvagePointId,
    sectorId: descriptor.sectorId,
    zoneId: descriptor.zoneId,
    homeStationId: descriptor.homeStationId,
    remainingPool,
    remainingQty: poolTotal(remainingPool),
    claimId: cleanIdentity(record.claimId),
    workId: cleanIdentity(record.workId),
    extractedBy: cleanIdentity(record.extractedBy),
    disputedBy: cleanIdentity(record.disputedBy),
    extracted: record.extracted === true || poolTotal(remainingPool) <= 0,
  };
}

function normalizePool(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const commodityId of Object.keys(raw).sort((a, b) => a.localeCompare(b))) {
    const qty = Number(raw[commodityId]);
    const wholeQty = Number.isFinite(qty) ? Math.floor(qty) : 0;
    if (typeof commodityId === 'string' && commodityId && wholeQty > 0) {
      result[commodityId] = wholeQty;
    }
  }
  return result;
}

function clonePool(pool) {
  return normalizePool(pool);
}

function poolTotal(pool) {
  return Object.values(pool || {}).reduce((sum, qty) => {
    const normalized = Number(qty);
    return sum + (Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : 0);
  }, 0);
}

function takePool(remainingPool, requested) {
  const wanted = normalizePool(requested);
  const taken = {};
  for (const commodityId of Object.keys(wanted).sort((a, b) => a.localeCompare(b))) {
    const available = Number(remainingPool && remainingPool[commodityId]) || 0;
    const qty = Math.min(Math.floor(available), wanted[commodityId]);
    if (qty <= 0) continue;
    taken[commodityId] = qty;
    const remainder = Math.floor(available) - qty;
    if (remainder > 0) remainingPool[commodityId] = remainder;
    else delete remainingPool[commodityId];
  }
  return taken;
}

function cleanIdentity(value) {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  return normalized ? normalized.slice(0, 160) : null;
}

// FNV-1a fallback (mirrors core/rng.hash32) — only used if the core helper isn't wired (headless).
function fallbackHash32(...args) {
  let h = 0x811c9dc5;
  const str = args.join('|');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function fallbackMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
