// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { FREIGHT_MARKET_KEYS_FALLBACK, FREIGHT_TRADING_ROLES, abstractBaselineVolume, buildArrivalIntent, buildCargoManifest, filterNewFreightIntents, liveVolumeForSector, mergeAppliedFreightIds, pressureShareRecipe } from '../economy/freightCausality.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { NPC_JOB_SCHEMA } from './npcJobs.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { hash32 } from '../core/rng.js';
import { CERES_ACTIVITY_CAST, CERES_ACTIVITY_CAST_BY_SLOT_ID, CERES_AMBUSH_HAULER_SLOT_ID, CERES_HANDOFF_ARRIVE_GAIN, CERES_HANDOFF_ARRIVE_HYSTERESIS_WU_S, CERES_JOB_ACTION_LEDGER_CAP, CERES_JOB_ACTION_RECEIPT_EVENT, CERES_JOB_ACTION_RECEIPT_SCHEMA, CERES_MINER_HAULER_HANDOFF_RANGE_WU, CERES_MINER_HAULER_HANDOFF_SCHEMA, CERES_ORE_BARGE_UNLOAD_ACTION, CERES_PRIMARY_ACTION_BY_JOB_KIND, CERES_REFINERY_HAULER_CAPACITY_U, CERES_REFINERY_HAULER_SLOT_ID, CERES_SEAM_MINER_SLOT_ID, CERES_TENDER_SERVICE_CLEARANCE_WU, CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT, CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER, CERES_TENDER_SERVICE_HOLD_S, CERES_TENDER_SERVICE_INCIDENT_SCHEMA, CERES_TENDER_SERVICE_REPAIR_AMOUNT, CERES_TENDER_SERVICE_STANDOFF_WU, CERES_TENDER_SERVICE_TERMINAL_STATES, CERES_TENDER_SLOT_ID, DOCK_RANGE, WELL_DRAG_HOLD_RADIUS_WU, entityWithWorldRecord, hasExactCeresSectorAuthority, liveEntity, sameJSONValue, setIntent, terminalWorldRecord, validCausalManifest } from './traffic.js';

export const trafficEscortOps = {
  // Escorts convoy with the nearest civilian freighter — they shadow it, distinct from patrols.
  _stepEscort(e, rec, list, state) {
    // C5 pile-up: a well-dragged hauler's escorts boost onto it and hold there for a bounded window.
    const regroup = this._wellDragRegroup && this._wellDragRegroup.get(e.id);
    if (regroup) {
      const now = Number.isFinite(state.simTime) ? state.simTime : 0;
      const hauler = state.entities.get(regroup.haulerId);
      if (now < regroup.untilSimT && hauler && hauler.alive !== false && hauler.pos) {
        const dx = hauler.pos.x - e.pos.x, dz = hauler.pos.z - e.pos.z;
        const aim = Math.atan2(dz, dx);
        if (Math.hypot(dx, dz) > WELL_DRAG_HOLD_RADIUS_WU) setIntent(e, 0, 1, true, false, null, aim);
        else { setIntent(e, 0, 0, false, false, null, aim); e.data.intent.brake = true; }
        return;
      }
      this._wellDragRegroup.delete(e.id);
      if (e.data && e.data.intent) e.data.intent.brake = false;
    }
    let ward = null, wd = Infinity;
    for (const r of list) {
      if (r.role === 'escort' || r.role === 'patrol' || r.role === 'pirate') continue;
      const w = state.entities.get(r.id);
      if (!w || !w.alive) continue;
      const d = Math.hypot(w.pos.x - e.pos.x, w.pos.z - e.pos.z);
      if (d < wd) { wd = d; ward = w; }
    }
    if (!ward) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    // hold station ~80 units behind the ward
    const back = ward.rot || 0;
    const tx = ward.pos.x - Math.cos(back) * 80;
    const tz = ward.pos.z - Math.sin(back) * 80;
    setIntent(e, 0, 1, false, false, null, Math.atan2(tz - e.pos.z, tx - e.pos.x));
  },

  /**
   * Deterministic cargo manifest from station market keys (ECON-P2). Stamped on entity.data
   * so scanners / rematerialize / continuous handoff can read it without re-rolling.
   */
  _assignManifest(ent, role, station, sectorId) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (ent && ent.id != null ? String(ent.id) : `traffic:${role}`);
    const stationId = station && station.data && station.data.stationId;
    const market = stationId
      && this.state.economy
      && this.state.economy.markets
      && this.state.economy.markets[stationId];
    const manifest = buildCargoManifest({
      seed,
      freighterKey,
      role: role || 'hauler',
      market: market || FREIGHT_MARKET_KEYS_FALLBACK,
      ...((role === 'ore_carrier' || role === 'miner') && sectorId === 'sector_helios_prime' ? { capacity: 0 } : {}),
    });
    if (role === 'tanker' && manifest && Array.isArray(manifest.lines)) {
      const cryoId = 'cmdty_ice_water';
      if (!manifest.lines.some((line) => line && (line.commodityId === cryoId || line.commodityId === 'cmdty_gas_helium3'))) {
        const qty = Math.max(1, Math.floor((manifest.totalQty || 8) / 2) || 1);
        manifest.lines = [{ commodityId: cryoId, qty }, ...manifest.lines];
        let totalQty = 0;
        for (const line of manifest.lines) totalQty += Math.max(0, line && line.qty || 0);
        manifest.totalQty = totalQty;
      }
    }
    if (ent) {
      if (!ent.data) ent.data = {};
      ent.data.cargoManifest = manifest;
      if (sectorId && ent.data.sectorId == null) ent.data.sectorId = sectorId;
    }
    return manifest;
  },

  /**
   * Owner-safe arrival: emit aiTrader:requestTrade per manifest line (economy stock-only path).
   * Idempotent per freighter dockSeq. Never writes credits/cargo/stock/rep/heat here.
   */
  _emitArrival(entity, rec, station, options = null) {
    const stationId = station && station.data && station.data.stationId;
    if (!stationId || !rec) return false;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (entity && entity.data && entity.data.worldRecordId)
      || String(rec.id);
    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    const role = rec.role || 'hauler';
    if (!FREIGHT_TRADING_ROLES.includes(role)) return false;

    const suppliedManifest = options && options.manifest;
    let manifest = suppliedManifest && Array.isArray(suppliedManifest.lines) && suppliedManifest.lines.length
      ? suppliedManifest
      : rec.manifest
      || (entity && entity.data && entity.data.cargoManifest)
      || null;
    if (!manifest || !Array.isArray(manifest.lines) || !manifest.lines.length) {
      manifest = this._assignManifest(entity, role, station, sectorId);
      rec.manifest = manifest;
    }

    // Conservation: live arrivals share the old abstract lane budget with sectorSim pressure.
    const liveVol = liveVolumeForSector(this.state, sectorId);
    // Use a unit baseline floor so a quiet field still allows embodied trade; sectorSim
    // scales its own abstract share with the same recipe against the real baseline.
    const recipe = pressureShareRecipe({
      baselineVolume: Math.max(liveVol, abstractBaselineVolume({
        lanePressure: 0.25, days: 0.25, goodsCount: Math.max(1, (manifest.lines || []).length),
      })),
      liveVolume: liveVol || manifest.totalQty || 0,
    });

    const suppliedDockSeq = options && Number.isSafeInteger(options.dockSeq) && options.dockSeq >= 0
      ? options.dockSeq
      : null;
    const dockSeq = suppliedDockSeq == null ? (rec.dockSeq | 0) : suppliedDockSeq;
    const intent = buildArrivalIntent({
      seed,
      freighterKey,
      freighterId: rec.id,
      stationId,
      sectorId,
      dockSeq,
      manifest,
      liveScale: recipe.liveScale > 0 ? recipe.liveScale : 1,
    });

    this._ensureCausalLedgerSets();
    const t = this.state.traffic;
    if (this._pendingArrivalIds.has(intent.intentId)) return false;
    const fresh = filterNewFreightIntents([intent], t.appliedArrivalIds);
    if (!fresh.length) {
      // A replayed job intent names its original sequence even after this hull has moved to its
      // next ambient leg. Preserve that newer manifest and only keep the sequence floor monotonic.
      rec.dockSeq = Math.max(rec.dockSeq | 0, dockSeq + 1);
      if (entity && entity.data) entity.data.freightDockSeq = rec.dockSeq;
      return false; // already applied this dock intent
    }

    // Reserve before any synchronous downstream owner sees the intent. A listener may re-enter the
    // same live completion; both the action reservation and this effect reservation must already be
    // visible or the nested delivery would apply twice.
    const reservation = this._reserveCausalId(
      intent.intentId,
      '_pendingArrivalIds',
      '_pendingArrivalTokens',
    );
    if (!reservation) return false;
    const causalGuard = options && typeof options.causalGuard === 'function'
      ? options.causalGuard
      : null;
    const stillCurrent = () => this._causalReservationIsCurrent(
      reservation,
      '_pendingArrivalIds',
      '_pendingArrivalTokens',
    ) && (!causalGuard || causalGuard());
    if (!stillCurrent()) {
      this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
      return false;
    }
    try {
      for (const trade of intent.trades) {
        this.bus.emit('aiTrader:requestTrade', {
          stationId: trade.stationId,
          commodityId: trade.commodityId,
          side: trade.side,
          qty: trade.qty,
          cause: intent.cause,
          source: intent.source,
          intentId: intent.intentId,
          freighterId: rec.id,
          lotId: intent.lotId,
          lotSource: intent.lotSource,
        });
        if (!stillCurrent()) {
          this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
          return false;
        }
      }
      this.bus.emit('freight:arrival', intent);
      if (!stillCurrent()) {
        this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
        return false;
      }
    } catch {
      this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
      return false;
    }
    t.appliedArrivalIds = mergeAppliedFreightIds(t.appliedArrivalIds, fresh);
    this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
    if (options && options.ceresAction === true) {
      this._committedCeresArrivalIds.add(intent.intentId);
      this._pruneCommittedCeresIds(
        this._committedCeresArrivalIds,
        t.appliedArrivalIds,
      );
    }
    rec.dockSeq = Math.max(rec.dockSeq | 0, dockSeq + 1);
    if (entity && entity.data) entity.data.freightDockSeq = rec.dockSeq;
    this._noteHeliosFreightDisposition(manifest && manifest.manifestId, 'delivered');

    // After delivery, refresh manifest for the next leg (still deterministic per dockSeq key).
    const nextKey = `${freighterKey}:leg:${rec.dockSeq}`;
    const nextManifest = buildCargoManifest({
      seed,
      freighterKey: nextKey,
      role,
      market: (this.state.economy && this.state.economy.markets && this.state.economy.markets[stationId])
        || FREIGHT_MARKET_KEYS_FALLBACK,
    });
    rec.manifest = nextManifest;
    if (entity && entity.data) entity.data.cargoManifest = nextManifest;
    return true;
  },

  /**
   * Bridge a materialized one-shot hauler job into the existing freight/economy authority.
   * Historical offscreen catch-up deliberately has no intent sink, so this can only represent an
   * unload the live job actually surfaced. Cyclic jobs use the kernel sequence; one-shot haulers
   * use the durable dock generation captured in their job payload.
   */
  _ceresActivityEntryForWorldRecordId(worldRecordId) {
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    for (const activityEntry of CERES_ACTIVITY_CAST) {
      if (activityEntry.service) continue;
      const expected = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        activityEntry.slot.worldRecordSlotId,
      );
      if (worldRecordId === expected) return activityEntry;
    }
    return null;
  },

  _ceresActivityIntentClaimsOwnership(intent) {
    const jobId = intent && typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return false;
    const worldRecordId = jobId.slice(4);
    if (this._ceresActivityEntryForWorldRecordId(worldRecordId)) return true;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(jobId) : null;
    const entity = (entry && liveEntity(this.state, entry.entityId))
      || entityWithWorldRecord(this.state, worldRecordId);
    const entitySlot = entity && entity.data && entity.data.activityActorSlotId;
    if (entitySlot) {
      const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(entitySlot);
      if (activityEntry && !activityEntry.service) return true;
    }
    return !!(this.state.traffic && Array.isArray(this.state.traffic.freighters)
      && this.state.traffic.freighters.some((rec) => {
        if (!rec || rec.worldRecordId !== worldRecordId) return false;
        const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(rec.activityActorSlotId);
        return !!activityEntry && !activityEntry.service;
      }));
  },

  _ceresActivityActorContext(intent) {
    const jobId = intent && typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return null;
    const worldRecordId = jobId.slice(4);
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    const slotId = entity && entity.data && entity.data.activityActorSlotId;
    const activityEntry = slotId && CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
    const expectedEntry = this._ceresActivityEntryForWorldRecordId(worldRecordId);
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const durableRecord = records && records[worldRecordId];
    if (!entity || !activityEntry || activityEntry.service || expectedEntry !== activityEntry
      || slotId === CERES_TENDER_SLOT_ID
      || terminalWorldRecord(durableRecord)
      || !hasExactCeresSectorAuthority(entity)
      || entity.data.ceresActivityCast !== true
      || entity.data.ceresActivityJobOwned !== true
      || entity.data.jobId !== jobId) return null;
    return { jobId, worldRecordId, entity, activityEntry };
  },

  _ceresActivityActionContext(intent, action, actorContext, pendingActionToken = null) {
    const base = actorContext || this._ceresActivityActorContext(intent);
    if (!base || intent.completed !== true) return null;
    if (!this.state.world || this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return null;
    const { jobId, worldRecordId, entity, activityEntry } = base;
    const { slot } = activityEntry;
    const rule = slot.id === CERES_SEAM_MINER_SLOT_ID && action === 'unload'
      ? CERES_ORE_BARGE_UNLOAD_ACTION
      : CERES_PRIMARY_ACTION_BY_JOB_KIND[slot.jobKind];
    if (!rule || rule.action !== action || intent.kind !== slot.jobKind) return null;

    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(jobId) : null;
    if (!entry || !entry.job || entry.job.schema !== NPC_JOB_SCHEMA || entry.job.corrupt === true
      || entry.job.materialized !== true || entry.job.id !== jobId || entry.job.kind !== slot.jobKind
      || entry.kind !== slot.jobKind || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || entry.worldRecordId !== worldRecordId || entry.entityId !== entity.id) return null;
    const rec = this.state.traffic && this.state.traffic.freighters
      && this.state.traffic.freighters.find((candidate) => candidate
        && candidate.id === entity.id
        && candidate.worldRecordId === worldRecordId
        && candidate.activityActorSlotId === slot.id
        && candidate.ceresActivityCast === true
        && candidate.ceresActivityJobOwned === true
        && candidate.role === slot.presentationRole);
    if (!rec) return null;

    if (entry.job.phase !== rule.phase || entry.job.progress !== 1
      || intent.phase !== rule.phase
      || !Number.isSafeInteger(intent.seq) || intent.seq <= 0
      || intent.seq !== entry.job.sequence
      || !Number.isFinite(intent.simTime) || intent.simTime !== entry.job.simTime) return null;
    const routeIndex = entry.job.routeIndex;
    const route = Array.isArray(entry.job.route) ? entry.job.route : [];
    if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= route.length) return null;
    const waypoint = route[routeIndex];
    const waypointId = waypoint && typeof waypoint.id === 'string' ? waypoint.id : '';
    if (!waypointId || intent.waypointId !== waypointId || intent[rule.intentField] !== waypointId) return null;
    const authoredMarks = slot.route && Array.isArray(slot.route.marks) ? slot.route.marks : [];
    const matchingMarks = authoredMarks.filter((mark) => mark && mark.id === waypointId);
    if (matchingMarks.length !== 1 || matchingMarks[0].targetRef !== waypoint.targetRef) return null;
    const targetRef = waypoint.targetRef;
    const target = this._resolveCeresActivityTarget(
      targetRef,
      waypoint,
      matchingMarks[0],
      activityEntry,
    );
    if (!target) return null;

    const kernelSequence = intent.seq;
    let sequence = kernelSequence;
    const jobPayload = entry.job.payload;
    if (slot.jobKind === 'hauler') {
      if (!sameJSONValue(intent.payload, jobPayload)) return null;
      const runSeq = jobPayload && jobPayload.activityRunSeq;
      const entityRunSeq = entity.data.freightDockSeq;
      if (!Number.isSafeInteger(runSeq) || runSeq < 0
        || runSeq !== (rec.dockSeq | 0) || runSeq !== (entityRunSeq | 0)) return null;
      sequence = runSeq;
      if (slot.id === CERES_REFINERY_HAULER_SLOT_ID
        && jobPayload.manifest != null
        && !validCausalManifest(jobPayload.manifest)) return null;
    }
    const receiptId = `ceres-job-action:${jobId}:${action}:${sequence}:${targetRef}`;
    this._ensureState();
    this._ensureCausalLedgerSets();
    const pendingReceipt = this._pendingJobActionIds.has(receiptId);
    if (this.state.traffic.appliedJobActionIds.includes(receiptId)
      || (pendingReceipt && !this._causalReservationIsCurrent(
        pendingActionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      ))) return null;
    return {
      ...base,
      slot,
      entry,
      rec,
      action,
      kernelSequence,
      sequence,
      waypoint,
      targetRef,
      target,
      jobPayload,
      receiptId,
      receiptAuthority: {
        routeId: slot.route.id,
        jobId,
        jobKind: slot.jobKind,
        action,
        sequence,
        kernelSequence,
        actorSlotId: slot.id,
        actorId: entity.id,
        targetRef,
        targetKind: target.kind,
        targetId: target.id,
        simTime: entry.job.simTime,
      },
    };
  },

  _ceresActivityActionStillCurrent(context, intent, actionToken) {
    if (!context || !intent || !this._causalReservationIsCurrent(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    )) return false;
    const actorContext = this._ceresActivityActorContext(intent);
    const current = this._ceresActivityActionContext(
      intent,
      context.action,
      actorContext,
      actionToken,
    );
    if (!current) return false;
    return current.receiptId === context.receiptId
      && current.slot === context.slot
      && current.entry === context.entry
      && current.entry.job === context.entry.job
      && current.entity === context.entity
      && current.rec === context.rec
      && current.waypoint === context.waypoint
      && current.target.kind === context.target.kind
      && current.target.id === context.target.id
      && current.target.entity === context.target.entity
      && sameJSONValue(current.receiptAuthority, context.receiptAuthority);
  },

  _resolveCeresActivityTarget(targetRef, waypoint, authoredMark, activityEntry) {
    if (typeof targetRef !== 'string' || !targetRef || !waypoint || !authoredMark
      || authoredMark.targetRef !== targetRef) return null;
    const parts = targetRef.split(':');
    const namespace = parts[0];
    if (namespace === 'activity') {
      const anchor = activityEntry && activityEntry.pocket
        && activityEntry.pocket.activityAnchor
        && activityEntry.pocket.activityAnchor.localPos;
      const offset = authoredMark.offset;
      if (parts.length !== 2 || !anchor || !offset || !waypoint.pos
        || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
        || !Number.isFinite(offset.x) || !Number.isFinite(offset.z)
        || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return null;
      const canonicalPos = sectorLocalToGlobalForSector({
        x: anchor.x + offset.x,
        z: anchor.z + offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (waypoint.pos.x !== canonicalPos.x || waypoint.pos.z !== canonicalPos.z) return null;
      return { kind: 'activity', id: null };
    }

    const index = this.state.entityIndex;
    // Keyed answers are exact only under full coverage: when every entities-map member is an
    // indexed carrier (entities.size === _indexedIds.size), the slot sets and type lanes
    // enumerate the whole candidate population. A bare-map/unindexed member shrinks the keyed
    // view — fall back to the whole-map walk, preserving the old result for every member.
    // (No _indexedIds on a partial index shape means coverage can't be proven — walk.)
    const entitiesMap = this.state.entities;
    const covered = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
      && index._indexedIds instanceof Set && entitiesMap
      && entitiesMap.size === index._indexedIds.size;
    let predicate = null;
    let keyed = null;
    let kind = namespace;
    if (namespace === 'field' && parts.length === 3 && parts[1] === 'slot') {
      const slotId = parts[2];
      predicate = (entity) => entity.type === 'asteroid'
        && entity.data && entity.data.activityObjectSlotId === slotId;
      kind = 'field-slot';
      if (covered) keyed = index.byActivityObjectSlotId.get(slotId) || null;
    } else if (namespace === 'object' && parts.length === 2) {
      const slotId = parts[1];
      predicate = (entity) => entity.type === 'fx'
        && entity.data && entity.data.activityObjectSlotId === slotId;
      if (covered) keyed = index.byActivityObjectSlotId.get(slotId) || null;
    } else if (namespace === 'actor' && parts.length === 2) {
      const slotId = parts[1];
      const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const expectedWorldRecordId = activityEntry && !activityEntry.service
        ? stableRecordId(
            seed,
            CERES_ACTIVITY_SECTOR_ID,
            RECORD_KIND.CONVOY,
            activityEntry.slot.worldRecordSlotId,
          )
        : null;
      const records = this.state.world && this.state.world.records && this.state.world.records.byId;
      const durableRecord = records && expectedWorldRecordId && records[expectedWorldRecordId];
      predicate = (entity) => entity.type === 'ship'
        && entity.data && entity.data.ceresActivityCast === true
        && entity.data.ceresActivityJobOwned === true
        && entity.data.activityActorSlotId === slotId
        && entity.data.worldRecordId === expectedWorldRecordId
        && !terminalWorldRecord(durableRecord);
      if (covered) keyed = index.byActivityActorSlotId.get(slotId) || null;
    } else if ((namespace === 'dest' || namespace === 'station') && parts.length >= 2) {
      const stationId = parts[1];
      predicate = (entity) => entity.type === 'station'
        && entity.data && entity.data.stationId === stationId;
      kind = 'station';
      if (covered) keyed = index.stations.length ? index.stations : null;
    } else if (namespace === 'world-site' && parts.length === 2) {
      const worldRecordId = `${parts[1]}/root`;
      predicate = (entity) => entity.type === 'fx'
        && entity.data && entity.data.worldRecordId === worldRecordId;
      kind = 'world-site';
      const counted = covered ? (index.byWorldRecordIdCount.get(worldRecordId) || 0) : -1;
      if (counted === 1) {
        keyed = [index.byWorldRecordId.get(worldRecordId)];
      } else if (counted > 1 && index.fx.length) {
        // Duplicate keepers exist — the fx lane is the type-filtered superset of every
        // indexed candidate, so the exactly-one count below sees the same population.
        keyed = index.fx;
      }
    } else {
      return null;
    }

    // A present keyed set/bucket answers O(1); its absence falls back to the whole-map walk so
    // an unindexed carrier (harness, bare-map write) still resolves exactly like before. Keyed
    // answers carry the byWorldRecordId coverage contract: every writer of the slot fields is
    // either a spawn literal (append-covered) or a sync-armed stamp site — a new unregistered
    // write would need its own syncEntityActivitySlotMembership arm.
    const source = keyed
      || (this.state.entities && this.state.entities.values ? this.state.entities.values() : []);
    const matches = [];
    for (const entity of source) {
      if (!entity || entity.alive === false || !predicate(entity)
        || !hasExactCeresSectorAuthority(entity)) continue;
      matches.push(entity);
    }
    if (matches.length !== 1) return null;
    return { kind, id: matches[0].id, entity: matches[0] };
  },

  _recordCeresActivityAction(context, actionToken, effectType = null, effectApplied = false) {
    const { receiptId } = context;
    const authority = context.receiptAuthority;
    if (!authority) return false;
    const applied = this.state.traffic.appliedJobActionIds;
    if (!this._causalReservationIsCurrent(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    )) return false;
    if (!applied.includes(receiptId)) applied.push(receiptId);
    if (applied.length > CERES_JOB_ACTION_LEDGER_CAP) {
      applied.splice(0, applied.length - CERES_JOB_ACTION_LEDGER_CAP);
    }
    const receipt = {
      schema: CERES_JOB_ACTION_RECEIPT_SCHEMA,
      receiptId,
      actionId: receiptId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      routeId: authority.routeId,
      jobId: authority.jobId,
      jobKind: authority.jobKind,
      action: authority.action,
      sequence: authority.sequence,
      kernelSequence: authority.kernelSequence,
      actorSlotId: authority.actorSlotId,
      actorId: authority.actorId,
      targetRef: authority.targetRef,
      targetKind: authority.targetKind,
      targetId: authority.targetId,
      effectType,
      effectApplied: effectApplied === true,
      simTime: authority.simTime,
    };
    this.bus.emit(CERES_JOB_ACTION_RECEIPT_EVENT, receipt);
    this._releaseCausalReservation(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    );
    return true;
  },

  _applyCeresActivityAction(context, intent) {
    const applied = this.state.traffic.appliedJobActionIds;
    if (applied.includes(context.receiptId) || this._pendingJobActionIds.has(context.receiptId)) return false;
    const actionToken = this._reserveCausalId(
      context.receiptId,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    );
    if (!actionToken) return false;
    const causalGuard = () => this._ceresActivityActionStillCurrent(context, intent, actionToken);
    let effectType = null;
    let effectApplied = false;
    try {
      if (context.slot.id === CERES_SEAM_MINER_SLOT_ID && context.action === 'work') {
        effectType = 'mining:npcExtraction';
        effectApplied = this._applyNpcMinerExtraction(
          context,
          intent,
          context.target.entity,
          `npc-miner-work:${context.jobId}:${context.action}:${context.sequence}:${context.targetRef}`,
          { causalGuard },
        );
        if (!effectApplied) throw new Error('ceres_miner_effect_rejected');
      } else if (context.slot.id === CERES_SEAM_MINER_SLOT_ID && context.action === 'unload') {
        const deliveredManifest = context.rec.manifest
          || (context.entity.data && context.entity.data.cargoManifest)
          || null;
        if (!validCausalManifest(deliveredManifest) || deliveredManifest.role !== 'ore_carrier') {
          throw new Error('ceres_ore_barge_manifest_rejected');
        }
        const handoff = this.state.traffic.ceresMinerHaulerHandoff;
        if (handoff && handoff.state !== 'delivered' && handoff.state !== 'interrupted'
          && handoff.minerWorldRecordId === context.worldRecordId
          && handoff.rootLotId === this._ceresHandoffRootLotId(deliveredManifest)) {
          effectType = 'traffic:ceresMinerHaulerHold';
          effectApplied = true;
          this._stampCeresHandoffStatus(context.entity, handoff, 'HOLDING FOR HAULER');
        } else {
          effectType = 'freight:arrival';
          effectApplied = this._emitArrival(context.entity, context.rec, context.target.entity, {
            dockSeq: context.sequence,
            manifest: deliveredManifest,
            ceresAction: true,
            causalGuard,
          });
          if (!effectApplied) throw new Error('ceres_ore_barge_arrival_rejected');
          this._setTrafficManifest(
            context.entity,
            context.rec,
            this._buildMinerManifest(context.entity, context.sequence, null, 0, 'ore_carrier'),
          );
        }
      } else if (context.slot.id === CERES_REFINERY_HAULER_SLOT_ID) {
        const deliveredManifest = context.rec.manifest
          || (context.entity.data && context.entity.data.cargoManifest)
          || null;
        if (!validCausalManifest(deliveredManifest)
          || !deliveredManifest.custody || !deliveredManifest.custody.handoffId) {
          effectType = 'traffic:emptyHauler';
          effectApplied = true;
          context.rec.dockSeq = context.sequence + 1;
          context.entity.data.freightDockSeq = context.rec.dockSeq;
        } else {
          effectType = 'freight:arrival';
          const handoff = this.state.traffic.ceresMinerHaulerHandoff;
          if (!this._ceresHandoffDeliveryIsCurrent(handoff, deliveredManifest)) {
            throw new Error('ceres_handoff_delivery_rejected');
          }
          if (!this._ceresRefinerySettlementInRange(context.entity, context.target.entity)) {
            this._stampCeresHandoffStatus(
              context.entity,
              handoff,
              'REFINERY APPROACH — DOCKING',
              context.target.entity,
            );
            this._recommissionCeresRefineryHauler(context);
            throw new Error('ceres_refinery_out_of_range');
          }
          effectApplied = this._emitArrival(context.entity, context.rec, context.target.entity, {
            dockSeq: context.sequence,
            manifest: deliveredManifest,
            ceresAction: true,
            causalGuard,
          });
          if (!effectApplied || !this._markCeresHandoffDelivered(deliveredManifest, context)) {
            throw new Error('ceres_freight_effect_rejected');
          }
          this._setTrafficManifest(
            context.entity,
            context.rec,
            this._buildMinerManifest(context.entity, context.sequence + 1, null, 0, 'hauler'),
          );
        }
      } else if (context.slot.id === CERES_AMBUSH_HAULER_SLOT_ID) {
        // No freight/economy claim: this receipt-only crossing still advances its durable run token so
        // the next one-shot recommission cannot collide with the prior unload identity.
        context.rec.dockSeq = context.sequence + 1;
        context.entity.data.freightDockSeq = context.rec.dockSeq;
      }
    } catch {
      this._releaseCausalReservation(
        actionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      );
      return false;
    }
    const recorded = this._recordCeresActivityAction(context, actionToken, effectType, effectApplied);
    if (!recorded) {
      this._releaseCausalReservation(
        actionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      );
    }
    return recorded;
  },

  _jobTrafficContext(intent, expectedRole, acceptedTrafficRoles = expectedRole) {
    if (!intent || intent.kind !== expectedRole) return null;
    const jobId = typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return null;
    const worldRecordId = jobId.slice(4);
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || !entity.data || entity.data.jobId !== jobId) return null;

    this._ensureState();
    const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id);
    const accepted = Array.isArray(acceptedTrafficRoles)
      ? acceptedTrafficRoles
      : [acceptedTrafficRoles];
    if (!rec || !accepted.includes(rec.role)) return null;
    return { jobId, worldRecordId, entity, rec };
  },

  _buildMinerManifest(entity, workSeq, commodityId, qty, role = 'miner', lotSource = null) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = entity && entity.data && entity.data.worldRecordId
      || entity && entity.id
      || 'npc-miner';
    const amount = Math.max(0, Math.floor(Number(qty) || 0));
    const manifest = buildCargoManifest({
      seed,
      freighterKey: `${freighterKey}:work:${Math.max(0, workSeq | 0)}`,
      role,
      marketKeys: commodityId ? [commodityId] : FREIGHT_MARKET_KEYS_FALLBACK,
      capacity: amount,
    });
    if (amount > 0 && commodityId) {
      manifest.lines = [{ commodityId, qty: amount }];
      manifest.totalQty = amount;
    }
    if (role === 'ore_carrier' && amount > 0 && commodityId) {
      manifest.lotId = manifest.manifestId;
      manifest.lotSource = lotSource ? { ...lotSource } : null;
      manifest.custody = {
        holderKind: 'traffic',
        holderId: String(freighterKey),
        acquiredBy: 'mining:npcExtraction',
      };
    }
    return manifest;
  },

  _setTrafficManifest(entity, rec, manifest) {
    if (!manifest) return false;
    if (rec) rec.manifest = manifest;
    if (entity && entity.data) entity.data.cargoManifest = manifest;
    return true;
  },

  // PQ-048.03 — one exact Ceres custody relay. The durable record deliberately keeps only stable
  // world-record identities and JSON cargo facts; numeric entity ids are re-resolved every tick.
  _ceresHandoffRootLotId(manifest) {
    const source = manifest && manifest.lotSource;
    return source && typeof source.rootLotId === 'string' && source.rootLotId
      || manifest && manifest.lotId
      || manifest && manifest.manifestId
      || null;
  },

  _ceresHandoffActor(handoff, role) {
    const worldRecordId = role === 'miner'
      ? handoff && handoff.minerWorldRecordId
      : handoff && handoff.haulerWorldRecordId;
    const expectedSlot = role === 'miner'
      ? CERES_SEAM_MINER_SLOT_ID
      : CERES_REFINERY_HAULER_SLOT_ID;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || !entity.data
      || entity.data.activityActorSlotId !== expectedSlot) return null;
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id)
      && candidate.activityActorSlotId === expectedSlot);
    return rec ? { entity, rec, worldRecordId } : null;
  },

  _stampCeresHandoffStatus(entity, handoff, status, target = null) {
    if (!entity || !entity.data || !handoff) return;
    const data = entity.data;
    data.ceresHandoffId = handoff.handoffId;
    data.ceresHandoffState = handoff.state;
    data.ceresHandoffStatus = String(status || 'RENDEZVOUS');
    const targetWorldRecordId = target && target.data && target.data.worldRecordId || null;
    if (target && target.id != null) data.ceresHandoffTargetId = target.id;
    else delete data.ceresHandoffTargetId;
    if (targetWorldRecordId) data.ceresHandoffTargetWorldRecordId = targetWorldRecordId;
    else delete data.ceresHandoffTargetWorldRecordId;
  },

  _requestCeresMinerHaulerHandoff(context, manifest) {
    if (!context || !context.entity || !context.rec || !context.slot
      || context.slot.id !== CERES_SEAM_MINER_SLOT_ID
      || !validCausalManifest(manifest) || manifest.role !== 'ore_carrier') return null;
    const minerWorldRecordId = context.worldRecordId || context.entity.data && context.entity.data.worldRecordId;
    const lotId = manifest.lotId || manifest.manifestId;
    if (typeof minerWorldRecordId !== 'string' || !minerWorldRecordId
      || typeof lotId !== 'string' || !lotId) return null;
    this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const haulerWorldRecordId = stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      'ceres:activity:ceres_refinery_hauler',
    );
    const handoffId = `ceres-miner-hauler:${minerWorldRecordId}:${lotId}`;
    const current = this.state.traffic.ceresMinerHaulerHandoff;
    if (current && current.state !== 'delivered' && current.state !== 'interrupted') {
      return current.handoffId === handoffId ? current : null;
    }
    const qty = manifest.totalQty;
    const handoff = {
      schema: CERES_MINER_HAULER_HANDOFF_SCHEMA,
      handoffId,
      rootLotId: this._ceresHandoffRootLotId(manifest),
      minerWorldRecordId,
      haulerWorldRecordId,
      state: 'requested',
      requestedAtSimT: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      requestedQty: qty,
      transferredQty: 0,
      deliveredQty: 0,
      remainingQty: qty,
      terminalizedQty: 0,
      transferSeq: 0,
      deliveredTransferSeq: 0,
    };
    this.state.traffic.ceresMinerHaulerHandoff = handoff;
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    this._stampCeresHandoffStatus(context.entity, handoff, 'HAULER REQUESTED', hauler && hauler.entity);
    if (hauler) this._stampCeresHandoffStatus(hauler.entity, handoff, 'MINER ORE REQUEST', context.entity);
    return handoff;
  },

  _ceresHandoffClaimId(handoff, role) {
    return `ceres-handoff:${handoff.handoffId}:${role}`;
  },

  _claimCeresMinerHaulerHandoffControl(handoff, pair, role) {
    if (!handoff || !pair || !pair.entity || !pair.entity.data) return false;
    const jobId = pair.entity.data.jobId;
    const claimId = this._ceresHandoffClaimId(handoff, role);
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!jobs || typeof jobs.claimControl !== 'function' || typeof jobId !== 'string') return false;
    const result = jobs.claimControl(jobId, { claimId, holder: 'traffic:ceresMinerHaulerHandoff' });
    return !!(result && result.granted === true);
  },

  _releaseCeresMinerHaulerHandoffControl(handoff, role) {
    if (!handoff) return;
    const worldRecordId = role === 'miner' ? handoff.minerWorldRecordId : handoff.haulerWorldRecordId;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return;
    const jobId = `job:${worldRecordId}`;
    const claimId = this._ceresHandoffClaimId(handoff, role);
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') jobs.releaseControl(jobId, claimId);
  },

  _releaseCeresMinerHaulerHandoffControls(handoff) {
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
  },

  _ceresHandoffCapacity(pair) {
    const configured = pair && pair.entity && pair.entity.data && pair.entity.data.ceresHandoffCapacityU;
    const recordCapacity = pair && pair.rec && pair.rec.ceresHandoffCapacityU;
    const value = Number.isFinite(configured) ? configured : recordCapacity;
    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : CERES_REFINERY_HAULER_CAPACITY_U;
  },

  _ceresRefinerySettlementInRange(entity, station) {
    if (!entity || !entity.pos || !station || !station.pos) return false;
    const dx = station.pos.x - entity.pos.x;
    const dz = station.pos.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const dockRange = Math.max(
      DOCK_RANGE,
      CERES_MINER_HAULER_HANDOFF_RANGE_WU,
      Number.isFinite(station.data && station.data.dockRadius) ? station.data.dockRadius : 0,
      (Number.isFinite(entity.radius) ? entity.radius : 0)
        + (Number.isFinite(station.radius) ? station.radius : 0) + 12,
    ) + 6;
    return Number.isFinite(distance) && distance <= dockRange;
  },

  _splitCeresHandoffManifest(manifest, transferQty) {
    const requested = Math.max(0, Math.floor(Number(transferQty) || 0));
    let remaining = requested;
    const movedLines = [];
    const remainderLines = [];
    for (const line of manifest.lines) {
      const take = Math.min(line.qty, remaining);
      if (take > 0) movedLines.push({ commodityId: line.commodityId, qty: take });
      const left = line.qty - take;
      if (left > 0) remainderLines.push({ commodityId: line.commodityId, qty: left });
      remaining -= take;
    }
    const movedQty = movedLines.reduce((sum, line) => sum + line.qty, 0);
    const remainderQty = remainderLines.reduce((sum, line) => sum + line.qty, 0);
    return { movedLines, movedQty, remainderLines, remainderQty };
  },

  _markCeresHandoffCausalTransfer(handoff) {
    const chain = this._ceresCausal;
    if (!chain || !chain.seeds) return;
    chain.seeds.ore_handoff = true;
    chain.seeds.hauler_ore_manifest = true;
  },

  _transferCeresMinerHaulerHandoff(handoff, minerPair, haulerPair, distance) {
    const source = minerPair.entity.data && minerPair.entity.data.cargoManifest || minerPair.rec.manifest;
    if (!validCausalManifest(source) || source.role !== 'ore_carrier'
      || this._ceresHandoffRootLotId(source) !== handoff.rootLotId) return false;
    const held = haulerPair.entity.data && haulerPair.entity.data.cargoManifest || haulerPair.rec.manifest;
    if (validCausalManifest(held)) return false;
    const capacity = this._ceresHandoffCapacity(haulerPair);
    const transferQty = Math.min(source.totalQty, capacity);
    if (transferQty <= 0) {
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'HAULER HOLD FULL', haulerPair.entity);
      this._stampCeresHandoffStatus(haulerPair.entity, handoff, 'NO FREE ORE CAPACITY', minerPair.entity);
      return false;
    }
    const split = this._splitCeresHandoffManifest(source, transferQty);
    if (split.movedQty !== transferQty || split.remainderQty + split.movedQty !== source.totalQty) return false;
    const transferSeq = (handoff.transferSeq | 0) + 1;
    const wholeLot = split.movedQty === source.totalQty;
    const lotSource = source.lotSource && typeof source.lotSource === 'object' ? source.lotSource : {};
    const transferred = {
      ...source,
      manifestId: wholeLot ? source.manifestId : `${source.manifestId}:handoff:${transferSeq}`,
      freighterKey: handoff.haulerWorldRecordId,
      role: 'hauler',
      lines: split.movedLines,
      totalQty: split.movedQty,
      lotId: wholeLot ? source.lotId : `${source.lotId}:handoff:${transferSeq}`,
      lotSource: { ...lotSource, rootLotId: handoff.rootLotId, handoffId: handoff.handoffId, transferSeq },
      custody: {
        holderKind: 'traffic', holderId: handoff.haulerWorldRecordId,
        acquiredBy: 'traffic:ceresMinerHaulerHandoff', handoffId: handoff.handoffId,
        transferSeq, rootLotId: handoff.rootLotId,
      },
    };
    if (!this._setTrafficManifest(haulerPair.entity, haulerPair.rec, transferred)) return false;
    handoff.transferSeq = transferSeq;
    handoff.transferredQty += split.movedQty;
    handoff.remainingQty = split.remainderQty;
    handoff.transferredAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    handoff.lastTransferDistanceWU = Math.round(distance * 1000) / 1000;
    this._markCeresHandoffCausalTransfer(handoff);
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
    if (split.remainderQty > 0) {
      handoff.state = 'in_transit';
      const remainder = {
        ...source,
        lines: split.remainderLines,
        totalQty: split.remainderQty,
        lotSource: { ...lotSource, rootLotId: handoff.rootLotId, handoffId: handoff.handoffId },
        custody: {
          ...(source.custody && typeof source.custody === 'object' ? source.custody : {}),
          holderKind: 'traffic', holderId: handoff.minerWorldRecordId, acquiredBy: 'mining:npcExtraction',
        },
      };
      this._setTrafficManifest(minerPair.entity, minerPair.rec, remainder);
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'HOLDING REMAINDER', haulerPair.entity);
    } else {
      handoff.state = 'in_transit';
      handoff.resumedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
      this._setTrafficManifest(
        minerPair.entity,
        minerPair.rec,
        this._buildMinerManifest(minerPair.entity, handoff.transferSeq, null, 0, 'ore_carrier'),
      );
      this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'SEAM WORK RESUMED');
    }
    const recommissioned = this._recommissionCeresRefineryHauler(haulerPair);
    this._stampCeresHandoffStatus(
      haulerPair.entity,
      handoff,
      recommissioned ? 'ORE TRANSFERRED — REFINERY BOUND' : 'REFINERY ROUTE PENDING',
    );
    return true;
  },

  _markCeresHandoffDelivered(manifest, context) {
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (!this._ceresHandoffDeliveryIsCurrent(handoff, manifest)) return false;
    const transferSeq = manifest.custody.transferSeq | 0;
    handoff.deliveredTransferSeq = transferSeq;
    handoff.deliveredQty = Math.min(handoff.requestedQty, handoff.deliveredQty + manifest.totalQty);
    handoff.lastSinkReceiptId = context.receiptId;
    handoff.deliveredAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const miner = this._ceresHandoffActor(handoff, 'miner');
    if (handoff.remainingQty <= 0
      && handoff.deliveredQty + (handoff.terminalizedQty | 0) >= handoff.requestedQty) {
      handoff.state = 'delivered';
      this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'ORE HANDOFF COMPLETE');
    } else {
      handoff.state = 'requested';
      if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER RETURNING');
    }
    this._stampCeresHandoffStatus(context.entity, handoff, 'ORE DELIVERED');
    return true;
  },

  _ceresHandoffDeliveryIsCurrent(handoff, manifest) {
    const custody = manifest && manifest.custody;
    const transferSeq = custody ? (custody.transferSeq | 0) : 0;
    const outstandingQty = handoff && handoff.transferredQty - handoff.deliveredQty;
    return !!(handoff && custody && handoff.state !== 'interrupted' && handoff.state !== 'delivered'
      && custody.handoffId === handoff.handoffId
      && transferSeq > (handoff.deliveredTransferSeq | 0)
      && transferSeq === (handoff.transferSeq | 0)
      && Number.isSafeInteger(manifest.totalQty) && manifest.totalQty > 0
      && manifest.totalQty === outstandingQty);
  },

  _interruptCeresMinerHaulerHandoff(handoff, reason, entity = null) {
    if (!handoff || handoff.state === 'interrupted' || handoff.state === 'delivered') return false;
    handoff.state = 'interrupted';
    handoff.interruptedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    handoff.interruption = String(reason || 'interrupted');
    this._releaseCeresMinerHaulerHandoffControls(handoff);
    const miner = this._ceresHandoffActor(handoff, 'miner');
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'HANDOFF INTERRUPTED', hauler && hauler.entity);
    if (hauler) this._stampCeresHandoffStatus(hauler.entity, handoff, 'HANDOFF INTERRUPTED', miner && miner.entity);
    if (entity && entity.data) this._stampCeresHandoffStatus(entity, handoff, 'HANDOFF INTERRUPTED');
    if (this._ceresCausal && this._ceresCausal.seeds) {
      this._ceresCausal.seeds.aftermath_open = true;
    }
    return true;
  },

  _preserveCeresHandoffAfterMinerLoss(handoff) {
    if (!handoff || handoff.state !== 'in_transit') return false;
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    const manifest = hauler && (hauler.entity.data && hauler.entity.data.cargoManifest
      || hauler.rec.manifest);
    if (!hauler || !this._ceresHandoffDeliveryIsCurrent(handoff, manifest)) return false;
    handoff.terminalizedQty = (handoff.terminalizedQty | 0) + handoff.remainingQty;
    handoff.remainingQty = 0;
    handoff.interruption = 'miner_destroyed_after_transfer';
    handoff.interruptedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
    this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE IN TRANSIT — MINER LOST');
    return true;
  },

  _rehydrateCeresCausalHandoffSeeds() {
    const chain = this._ceresCausal;
    const handoff = this.state && this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff;
    if (!chain || !chain.seeds || !handoff || handoff.state === 'interrupted') return;
    if (handoff.state !== 'delivered') chain.seeds.miner_loaded = true;
    if (handoff.transferSeq > 0) {
      chain.seeds.ore_handoff = true;
      chain.seeds.hauler_ore_manifest = true;
    }
  },

  _ceresHandoffTransferWindow() {
    const chain = this._ceresCausal;
    if (!chain) return true;
    const live = (chain.active || []).find((candidate) => candidate
      && candidate.eventId === 'ev_miner_calls_hauler');
    if (live) return live.phase === 'transfer' || live.phase === 'split';
    return Array.isArray(chain.completed) && chain.completed.includes('ev_miner_calls_hauler');
  },

  _stepCeresMinerHaulerHandoffs(dt) {
    this._ensureState();
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (!handoff || handoff.schema !== CERES_MINER_HAULER_HANDOFF_SCHEMA
      || handoff.state === 'delivered' || handoff.state === 'interrupted'
      || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return;
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const minerRecord = records && records[handoff.minerWorldRecordId];
    const haulerRecord = records && records[handoff.haulerWorldRecordId];
    const miner = this._ceresHandoffActor(handoff, 'miner');
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    if (terminalWorldRecord(haulerRecord)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed');
      return;
    }
    if (terminalWorldRecord(minerRecord)
      && !this._preserveCeresHandoffAfterMinerLoss(handoff)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed');
      return;
    }
    if (!miner || !hauler) {
      this._releaseCeresMinerHaulerHandoffControls(handoff);
      return; // world-record identities let a later materialization resume this exact handoff.
    }
    const held = hauler.entity.data && hauler.entity.data.cargoManifest || hauler.rec.manifest;
    if (handoff.state === 'in_transit') {
      if (!validCausalManifest(held) || !held.custody || held.custody.handoffId !== handoff.handoffId) {
        this._interruptCeresMinerHaulerHandoff(handoff, 'transferred_manifest_missing', hauler.entity);
      } else {
        this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE TRANSFERRED — REFINERY BOUND');
      }
      return;
    }
    const source = miner.entity.data && miner.entity.data.cargoManifest || miner.rec.manifest;
    if (!validCausalManifest(source) || source.role !== 'ore_carrier'
      || this._ceresHandoffRootLotId(source) !== handoff.rootLotId) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'source_manifest_missing', miner.entity);
      return;
    }
    if (validCausalManifest(held)) {
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER HOLD BUSY', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE TRANSFERRED — REFINERY BOUND', miner.entity);
      return;
    }
    const minerClaimed = this._claimCeresMinerHaulerHandoffControl(handoff, miner, 'miner');
    const haulerClaimed = this._claimCeresMinerHaulerHandoffControl(handoff, hauler, 'hauler');
    if (!minerClaimed || !haulerClaimed) {
      if (minerClaimed) this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      if (haulerClaimed) this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER REQUESTED', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff, 'RENDEZVOUS PENDING', miner.entity);
      return;
    }
    const dx = miner.entity.pos.x - hauler.entity.pos.x;
    const dz = miner.entity.pos.z - hauler.entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const aim = Number.isFinite(distance) && distance > 0.0001 ? Math.atan2(dz, dx) : hauler.entity.rot || 0;
    setIntent(miner.entity, 0, 0, false, false, null, miner.entity.rot || 0);
    miner.entity.data.intent.brake = true;
    if (!Number.isFinite(distance) || distance > CERES_MINER_HAULER_HANDOFF_RANGE_WU) {
      handoff.state = 'rendezvous';
      const haulerSpeed = Math.hypot(
        Number(hauler.entity.vel && hauler.entity.vel.x) || 0,
        Number(hauler.entity.vel && hauler.entity.vel.z) || 0,
      );
      const desiredSpeed = Math.max(0, (distance - CERES_MINER_HAULER_HANDOFF_RANGE_WU * 0.8)
        * CERES_HANDOFF_ARRIVE_GAIN);
      const braking = haulerSpeed > desiredSpeed + CERES_HANDOFF_ARRIVE_HYSTERESIS_WU_S;
      setIntent(hauler.entity, 0, braking ? 0 : 1, false, false, null, aim);
      hauler.entity.data.intent.brake = braking;
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HOLDING FOR HAULER', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff,
        braking ? 'RENDEZVOUS BRAKING' : 'RENDEZVOUS INBOUND', miner.entity);
      return;
    }
    setIntent(hauler.entity, 0, 0, false, false, null, aim);
    hauler.entity.data.intent.brake = true;
    this._stampCeresHandoffStatus(miner.entity, handoff,
      this._ceresHandoffTransferWindow() ? 'TRANSFER WINDOW OPEN' : 'TRANSFER WINDOW PENDING', hauler.entity);
    this._stampCeresHandoffStatus(hauler.entity, handoff,
      this._ceresHandoffTransferWindow() ? 'TRANSFER WINDOW OPEN' : 'TRANSFER WINDOW PENDING', miner.entity);
    if (this._ceresHandoffTransferWindow()) this._transferCeresMinerHaulerHandoff(handoff, miner, hauler, distance);
    void dt;
  },

  // ── PQ-048.04 tender service occupation ──────────────────────────────────────────────────────
  // The tender and miner keep their own owner-authored jobs. Traffic borrows both hulls only for
  // this bounded incident, writes ordinary flight intent while it holds the leases, and returns
  // them through npcJobsRuntime after combat truth says the drive is back.

  _resetCeresTenderServiceRuntime() {
    this._ceresTenderServiceImpairmentActor = null;
    this._ceresTenderServiceRepairActor = null;
  },

  _hasActiveCeresTenderServiceLink() {
    const active = this._ceresCausal && this._ceresCausal.active;
    return Array.isArray(active) && active.some((live) => live
      && live.eventId === 'ev_tender_services_miner');
  },

  _activeCeresTenderServiceIncident() {
    this._ensureState();
    const incident = this.state.traffic.ceresTenderServiceIncident;
    return incident && !CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state) ? incident : null;
  },

  _ceresTenderServiceActor(incident, role) {
    if (!incident || (role !== 'tender' && role !== 'miner')) return null;
    const worldRecordId = role === 'tender'
      ? incident.tenderWorldRecordId
      : incident.minerWorldRecordId;
    const expectedSlotId = role === 'tender' ? CERES_TENDER_SLOT_ID : CERES_SEAM_MINER_SLOT_ID;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.data
      || entity.data.worldRecordId !== worldRecordId
      || entity.data.activityActorSlotId !== expectedSlotId
      || entity.data.jobId !== `job:${worldRecordId}`
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
    if (role === 'tender') {
      const presence = entity.data.factionPresence;
      if (entity.data.durable !== true || !presence || presence.yardTender !== true
        || entity.data.ceresActivityCast !== undefined || entity.data.ceresActivityJobOwned !== undefined) return null;
      return { entity, rec: null, jobId: entity.data.jobId, worldRecordId };
    }
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && candidate.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id));
    if (!rec || entity.data.ceresActivityCast !== true || entity.data.ceresActivityJobOwned !== true) return null;
    return { entity, rec, jobId: entity.data.jobId, worldRecordId };
  },

  _beginCeresTenderServiceIncident() {
    this._ensureState();
    const current = this._activeCeresTenderServiceIncident();
    if (current) return current;
    const tenderBound = this._ceresCausalActorBySlot(CERES_TENDER_SLOT_ID);
    const tender = tenderBound && tenderBound.entity;
    const minerBound = this._ceresCausalActorBySlot(CERES_SEAM_MINER_SLOT_ID);
    const miner = minerBound && minerBound.entity;
    const tenderWorldRecordId = tender && tender.data && tender.data.worldRecordId;
    const minerWorldRecordId = miner && miner.data && miner.data.worldRecordId;
    if (typeof tenderWorldRecordId !== 'string' || !tenderWorldRecordId
      || typeof minerWorldRecordId !== 'string' || !minerWorldRecordId
      || tenderWorldRecordId === minerWorldRecordId) return null;
    const currentSequence = this.state.traffic.ceresTenderServiceSequence;
    if (!Number.isSafeInteger(currentSequence) || currentSequence < 0
      || currentSequence >= Number.MAX_SAFE_INTEGER) return null;
    const sequence = currentSequence + 1;
    const incident = {
      schema: CERES_TENDER_SERVICE_INCIDENT_SCHEMA,
      incidentId: `ceres-tender-service:${tenderWorldRecordId}:${minerWorldRecordId}:${sequence}`,
      sequence,
      tenderWorldRecordId,
      minerWorldRecordId,
      state: 'impair',
      startedAtSimT: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      holdStartedAtSimT: null,
      terminalAtSimT: null,
      failureReason: null,
    };
    // Verify both exact owner contracts before publishing an incident. A same-looking foreign hull
    // must never be adopted into this closed pair merely because its numeric id is nearby.
    if (!this._ceresTenderServiceActor(incident, 'tender')
      || !this._ceresTenderServiceActor(incident, 'miner')) return null;
    this.state.traffic.ceresTenderServiceSequence = sequence;
    this.state.traffic.ceresTenderServiceIncident = incident;
    return incident;
  },

  _ceresTenderServiceClaimId(incident, role) {
    return `ceres-tender-service:${incident.incidentId}:${role}`;
  },

  _claimCeresTenderServiceControl(incident, pair, role) {
    if (!incident || !pair || !pair.entity || !pair.jobId) return false;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!jobs || typeof jobs.claimControl !== 'function') return false;
    const result = jobs.claimControl(pair.jobId, {
      claimId: this._ceresTenderServiceClaimId(incident, role),
      holder: 'traffic:ceresTenderService',
    });
    return !!(result && result.granted === true);
  },

  _releaseCeresTenderServiceControl(incident, role) {
    if (!incident || (role !== 'tender' && role !== 'miner')) return;
    const worldRecordId = role === 'tender' ? incident.tenderWorldRecordId : incident.minerWorldRecordId;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') {
      jobs.releaseControl(`job:${worldRecordId}`, this._ceresTenderServiceClaimId(incident, role));
    }
  },

  _releaseCeresTenderServiceControls(incident) {
    this._releaseCeresTenderServiceControl(incident, 'miner');
    this._releaseCeresTenderServiceControl(incident, 'tender');
  },

  _ceresTenderServiceCombatKernel() {
    const combat = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('combat')
      : null;
    if (!combat) return null;
    return typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : combat.kernel || null;
  },

  _ceresTenderServiceDriveDisabled(entity) {
    const combat = this.state && this.state.combat;
    const runtime = combat && combat.entities && combat.entities[String(entity && entity.id)];
    const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
    return !!(drive && (drive.destroyed === true || drive.effectiveDisabled === true));
  },

  _ceresTenderServiceDriveRuntime(entity, kernel = null) {
    const combat = this.state && this.state.combat;
    const runtime = combat && combat.entities && combat.entities[String(entity && entity.id)];
    const liveDrive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
    if (liveDrive) return liveDrive;
    // The kernel owns initialization. Asking its existing inspector for the component is the
    // narrowest way to obtain the live health before a first impairment, without inventing traffic
    // combat state or assuming a numeric entity id survives Continue.
    if (!kernel || typeof kernel.inspect !== 'function' || !entity) return null;
    const inspection = kernel.inspect({ entityId: entity.id });
    return inspection && inspection.entity && inspection.entity.combat
      && inspection.entity.combat.subsystems
      && inspection.entity.combat.subsystems.subsystem_drive || null;
  },

  _requestCeresTenderServiceImpairment(incident, miner) {
    const alreadyRequested = this._ceresTenderServiceImpairmentActor
      && this._ceresTenderServiceImpairmentActor.incidentId === incident.incidentId
      && this._ceresTenderServiceImpairmentActor.entity === miner;
    if (alreadyRequested) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.routeDamage !== 'function') return false;
    const drive = this._ceresTenderServiceDriveRuntime(miner, kernel);
    if (!drive || !Number.isFinite(drive.health) || drive.health < 0) return false;
    if (drive.health <= 0) {
      // A save can land between routeDamage and combat's next prePhysics transition. Do not inject
      // a second packet into that already-zero component; wait for combat to make it truly disabled.
      if (drive.pendingTransition && drive.pendingTransition.destroyed === true) {
        this._ceresTenderServiceImpairmentActor = { incidentId: incident.incidentId, entity: miner };
        return true;
      }
      return false;
    }
    const hullBefore = Number(miner.hull);
    if (!Number.isFinite(hullBefore)) return false;
    const ionDamage = CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT
      + drive.health / CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER;
    if (!Number.isFinite(ionDamage) || ionDamage <= 0) return false;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: miner.id,
      packet: {
        channels: { ion: ionDamage },
        penetration: 0,
        shieldBypass: 1,
        subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        source: { kind: 'traffic_service', id: incident.incidentId },
      },
      origin: { kind: 'traffic_service', id: incident.incidentId },
    });
    if (!result || result.ok !== true || result.hullDamage !== 0 || result.attackerId !== null
      || miner.hull !== hullBefore) return false;
    this._ceresTenderServiceImpairmentActor = { incidentId: incident.incidentId, entity: miner };
    return true;
  },

  _requestCeresTenderServiceRepair(incident, miner) {
    const alreadyRequested = this._ceresTenderServiceRepairActor
      && this._ceresTenderServiceRepairActor.incidentId === incident.incidentId
      && this._ceresTenderServiceRepairActor.entity === miner;
    if (alreadyRequested) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.repair !== 'function') return false;
    const result = kernel.repair(
      miner.id,
      'subsystem_drive',
      CERES_TENDER_SERVICE_REPAIR_AMOUNT,
      'traffic_tender_service',
    );
    if (!result || result.ok !== true) return false;
    this._ceresTenderServiceRepairActor = { incidentId: incident.incidentId, entity: miner };
    return true;
  },

  _ceresTenderServiceStandoff(tender, miner) {
    const tenderRadius = Number.isFinite(tender && tender.radius) ? Math.max(0, tender.radius) : 0;
    const minerRadius = Number.isFinite(miner && miner.radius) ? Math.max(0, miner.radius) : 0;
    return Math.max(CERES_TENDER_SERVICE_STANDOFF_WU,
      tenderRadius + minerRadius + CERES_TENDER_SERVICE_CLEARANCE_WU);
  },

  _driveCeresTenderServiceStandoff(incident, tender, miner) {
    const dx = tender.pos.x - miner.pos.x;
    const dz = tender.pos.z - miner.pos.z;
    const currentDistance = Math.hypot(dx, dz);
    if (!Number.isFinite(currentDistance)) return { ok: false, holding: false };
    let nx = currentDistance > 0.0001 ? dx / currentDistance : 0;
    let nz = currentDistance > 0.0001 ? dz / currentDistance : 0;
    if (currentDistance <= 0.0001) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const angle = (hash32(seed, incident.incidentId) % 6284) / 1000;
      nx = Math.cos(angle);
      nz = Math.sin(angle);
    }
    const standoff = this._ceresTenderServiceStandoff(tender, miner);
    const targetX = miner.pos.x + nx * standoff;
    const targetZ = miner.pos.z + nz * standoff;
    const targetDx = targetX - tender.pos.x;
    const targetDz = targetZ - tender.pos.z;
    const targetDistance = Math.hypot(targetDx, targetDz);
    const aim = targetDistance > 0.0001 ? Math.atan2(targetDz, targetDx) : tender.rot || 0;
    if (!Number.isFinite(targetDistance)) return { ok: false, holding: false };
    if (targetDistance <= 3) {
      setIntent(tender, 0, 0, false, false, null, aim);
      tender.data.intent.brake = true;
      setIntent(miner, 0, 0, false, false, null, miner.rot || 0);
      miner.data.intent.brake = true;
      return { ok: true, holding: true, standoff, distance: currentDistance };
    }
    setIntent(tender, 0, 1, false, false, null, aim);
    tender.data.intent.brake = false;
    setIntent(miner, 0, 0, false, false, null, miner.rot || 0);
    miner.data.intent.brake = true;
    return { ok: true, holding: false, standoff, distance: currentDistance };
  },

  _failCeresTenderServiceIncident(incident, reason) {
    if (!incident || CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = 'failed';
    incident.failureReason = String(reason || 'service_failed');
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.holdStartedAtSimT = null;
    this._releaseCeresTenderServiceControls(incident);
    this._resetCeresTenderServiceRuntime();
    return true;
  },

  _completeCeresTenderServiceIncident(incident) {
    if (!incident || CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = 'succeeded';
    incident.failureReason = null;
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._releaseCeresTenderServiceControls(incident);
    this._resetCeresTenderServiceRuntime();
    return true;
  },

  _stepCeresTenderServiceIncident(dt) {
    const incident = this._activeCeresTenderServiceIncident();
    if (!incident || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return incident;
    const tender = this._ceresTenderServiceActor(incident, 'tender');
    const miner = this._ceresTenderServiceActor(incident, 'miner');
    if (!tender || !miner) {
      this._failCeresTenderServiceIncident(incident, 'actor_absent');
      return incident;
    }
    const driveDisabled = this._ceresTenderServiceDriveDisabled(miner.entity);
    if (incident.state === 'repair' && !driveDisabled) {
      this._completeCeresTenderServiceIncident(incident);
      return incident;
    }
    if (!driveDisabled) {
      // A rematerialized actor can have a fresh combat runtime even while the compact incident is
      // still active. Reapply the exact non-lethal drive impairment to that new body only.
      this._releaseCeresTenderServiceControls(incident);
      incident.state = 'impair';
      incident.holdStartedAtSimT = null;
      this._ceresTenderServiceRepairActor = null;
      if (!this._requestCeresTenderServiceImpairment(incident, miner.entity)) {
        this._failCeresTenderServiceIncident(incident, 'drive_impairment_refused');
      }
      return incident;
    }
    const minerClaimed = this._claimCeresTenderServiceControl(incident, miner, 'miner');
    const tenderClaimed = this._claimCeresTenderServiceControl(incident, tender, 'tender');
    if (!minerClaimed || !tenderClaimed) {
      if (minerClaimed) this._releaseCeresTenderServiceControl(incident, 'miner');
      if (tenderClaimed) this._releaseCeresTenderServiceControl(incident, 'tender');
      this._failCeresTenderServiceIncident(incident, 'job_control_refused');
      return incident;
    }
    if (incident.state === 'impair') incident.state = 'approach';
    const motion = this._driveCeresTenderServiceStandoff(incident, tender.entity, miner.entity);
    if (!motion.ok) {
      this._failCeresTenderServiceIncident(incident, 'invalid_service_geometry');
      return incident;
    }
    if (!motion.holding) return incident;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (incident.state === 'approach') {
      incident.state = 'holding';
      incident.holdStartedAtSimT = now;
      return incident;
    }
    if (incident.state === 'holding'
      && now >= incident.holdStartedAtSimT + CERES_TENDER_SERVICE_HOLD_S) {
      incident.state = 'repair';
    }
    if (incident.state === 'repair' && !this._requestCeresTenderServiceRepair(incident, miner.entity)) {
      this._failCeresTenderServiceIncident(incident, 'drive_repair_refused');
    }
    void dt;
    return incident;
  },
};
