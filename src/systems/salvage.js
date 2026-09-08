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

import { zonesForSector, VESTA_DERELICT_SALVAGE_SOURCE } from '../data/sectorZones.js';
import { pickWreckMission, wreckMissionById } from '../data/wreckMissions.js';

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

export const salvage = {
  name: 'salvage',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
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
    this.bus.on('sector:enter', (p) => this._planForSector(p && p.sectorId));
    // Scanning a communicator is an alternate trigger to reaching it (scan:completed carries a target).
    this.bus.on('scan:completed', (p) => this._onScan(p));
    // Clear transient entity ids BEFORE Continue rebuilds the sector. The prior save:loaded clear ran
    // after world.enterSector, erasing the newly planned points and leaving orphan wreck entities.
    this.bus.on('save:restoring', () => {
      state.salvage.points = [];
      state.salvage.plannedSectorId = null;
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
    const state = this.state;
    if (!sectorId) return;
    // Idempotent within a visit: re-entering the same sector without leaving keeps the same layout.
    if (state.salvage.plannedSectorId === sectorId && state.salvage.points.some((s) => s.sectorId === sectorId)) return;

    // Drop stale points from other sectors (their wreck entities are culled by world teardown).
    state.salvage.points = state.salvage.points.filter((s) => s.sectorId === sectorId);
    state.salvage.plannedSectorId = sectorId;

    const zones = (typeof zonesForSector === 'function' ? zonesForSector(sectorId) : [])
      .filter((z) => z && z.type === 'derelict_field' && z.center);
    if (!zones.length) return; // no derelict fields here → strict no-op

    const hash32 = (this.helpers && this.helpers.hash32) || fallbackHash32;
    const mulberry32 = (this.helpers && this.helpers.mulberry32) || fallbackMulberry32;
    const seed = state.meta && state.meta.seed;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;

    for (const zone of zones) {
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
        const ang = rng() * Math.PI * 2;
        const r = SCATTER_MIN + Math.sqrt(rng()) * (radius - SCATTER_MIN);
        const pos = { x: zone.center.x + Math.cos(ang) * r, z: zone.center.z + Math.sin(ang) * r };
        const isCommunicator = wantComm && i === 0;   // at most one communicator per zone, first slot
        const rec = this._makeSalvagePoint(sectorId, zone, i, pos, isCommunicator, rng, spawnEntity);
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
  },

  _makeSalvagePoint(sectorId, zone, idx, pos, isCommunicator, rng, spawnEntity) {
    const id = `${zone.id}:sal${idx}`;
    let mission = null;
    if (isCommunicator) mission = pickWreckMission(rng);
    const pool = isCommunicator ? { cmdty_scrap_metal: 1 } : pickPool(rng);

    let entityId = null;
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
        data: {
          parentType: isCommunicator ? 'communicator' : 'debris',
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
        data: {
          parentType: 'freighter',
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

  _onScan(p) {
    const list = this.state.salvage && this.state.salvage.points;
    if (!list || !list.length || !p) return;
    const targetId = p.targetId != null ? p.targetId : (p.entityId != null ? p.entityId : null);
    if (targetId == null) return;
    for (const s of list) {
      if (s.isCommunicator && !s.offered && s.entityId === targetId) this._offerFromPoint(s);
    }
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

    // The black-box / distress log line (the hook the brief asks for).
    this.bus.emit('comms:log', { from: mission.giver || 'Derelict', text: mission.log, kind: 'salvage' });
    this.bus.emit('toast', { text: `Signal recovered — ${mission.giver}: "${truncate(mission.log, 80)}"`, kind: 'info', ttl: 5 });
    this.bus.emit('audio:cue', { id: 'scan_resolve' });

    // The mission offer — a self-contained comms hook the missions/UI layer can consume. We do NOT
    // touch missions state directly (we don't own it); we hand over the full template so a listener
    // can add it to the active list / show an accept prompt.
    const offer = this._buildOffer(mission, point);
    this.bus.emit('mission:offered', offer);
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

  _buildOffer(mission, point) {
    return {
      source: 'salvage',
      offerId: `salvage_${point.id}`,
      salvagePointId: point.id,
      sectorId: point.sectorId,
      zoneId: point.zoneId,
      type: mission.type,
      title: mission.title,
      summary: mission.summary,
      giver: mission.giver,
      log: mission.log,
      reward_cr: mission.reward_cr || 0,
      choice: mission.choice || null,
      tag: mission.tag || 'wreck_salvage',
      wreckMissionId: mission.id,
      pos: { x: point.pos.x, z: point.pos.z },
    };
  },
};

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

function freshSalvageState() {
  return { points: [], plannedSectorId: null, sources: {} };
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
