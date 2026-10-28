import { normalizeWinnowRecovery } from '../world/vestaWinnowRecovery.js';
import { normalizeCharonSupply, releaseCharonSupply } from '../world/charonSalvageSupply.js';
// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { forEachJobInteractable, forEachLivingWorldActor } from '../world/livingWorldViews.js';
import { CERES_ACTIVITY_SECTOR_ID, TETHYS_ACTIVITY_SECTOR_ID, activityActorSlotById, activityPocketsForSector } from '../data/sectorActivityPockets.js';
import { deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
import { missReservedRichSeamOpportunity, openRichSeamOpportunity } from './fieldDepletion.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { spawnJettisonedCargoPod } from './lootShards.js';
import { volatileClassOf } from '../data/commodityVolatileClasses.js';
import { killMachineFieldCenter, killMachineFieldDir, killMachinePhase, killMachinesForSector } from '../data/environmentalMachinery.js';
import { customsWeirForSector, pointInsideCustomsWeir } from '../world/customsWeir.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { PASSENGER_LINER_SERVICE, PRIORITY_COURIER_JOB_SCHEMA, PRIORITY_COURIER_SERVICE, passengerLinerFlyingTo } from '../data/laneContacts.js';
import { FREIGHT_MARKET_KEYS_FALLBACK, FREIGHT_TRADING_ROLES, buildCargoManifest, buildLossIntent, filterNewFreightIntents, mergeAppliedFreightIds } from '../economy/freightCausality.js';
import { captureCeresWorkfleetHardware } from './ceresWorkfleet.js';
import { normalizeCaptainRoster } from './captainMemory.js';
import { normalizeColdburnRey } from './coldburnRey.js';
import { BREAKER_FEED_CHUNK_RADIUS_HI_WU, BREAKER_FEED_CHUNK_RADIUS_LO_WU, BREAKER_FEED_DRIFT_WU_S, BREAKER_FEED_MEAN_INTERVAL_S, BREAKER_FEED_PRODUCTS_HI, BREAKER_FEED_PRODUCTS_LO, BREAKER_FEED_PRODUCT_SPIT_WU_S, BREAKER_FEED_PRODUCT_TTL_S, BREAKER_FEED_RIM_PAD_WU, BREAKER_FEED_TTL_S, BREAKER_FEED_TYPE_ID, CERES_ACTIVITY_CAST_BY_SLOT_ID, CERES_ACTIVITY_JOB_KINDS, CERES_CALVED_SEAM_BONUS_U, CERES_CAPSULE_BATCH_U, CERES_CAPSULE_COAST_SPEED_WU_S, CERES_CAPSULE_LAUNCH_CLEARANCE_WU, CERES_CAPSULE_TTL_S, CERES_CATHEDRAL_SALVOR_SLOT_ID, CERES_CAUSAL_CHAIN_CYCLE_GAP_S, CERES_CAUSAL_CHAIN_EVENT, CERES_CAUSAL_CHAIN_SCHEMA, CERES_CAUSAL_STAMP_KEYS, CERES_CLAMP_POD_CLEARANCE_WU, CERES_CLAMP_POD_DRIFT_WU_S, CERES_CLAMP_POD_TTL_S, CERES_CLAMP_POD_U, CERES_CUTTER_SPILL_PICKUPS, CERES_CUTTER_SPILL_QTY, CERES_CUTTER_SPILL_TTL_S, CERES_DISABLED_HAULER_LAW_KIND, CERES_DISABLED_HAULER_OFFENDER_STABLE_ID, CERES_DISABLED_HAULER_TERMINAL_STATES, CERES_MINER_HAULER_SAVE_SCHEMA, CERES_PROBE_DROP_COUNT, CERES_PROBE_SPACING_WU, CERES_PROBE_TTL_S, CERES_RICH_SEAM_OBJECT_SLOT_ID, CERES_SEAM_MINER_SLOT_ID, CERES_SEAM_SURVEYOR_SLOT_ID, CERES_TENDER_SLOT_ID, DEBRIS_FIELD_DRIFT_JITTER_WU_S, DEBRIS_FIELD_EXIT_PAD_S, DEBRIS_FIELD_MEAN_INTERVAL_S, DEBRIS_FIELD_MISS_MAX_WU, DEBRIS_FIELD_PIECES_HI, DEBRIS_FIELD_PIECES_LO, DEBRIS_FIELD_SPAWN_RADIUS_WU, DEBRIS_FIELD_SPEED_HI_WU_S, DEBRIS_FIELD_SPEED_LO_WU_S, DEBRIS_FIELD_SPREAD_WU, DEBRIS_STREAM_EXIT_PAD_S, DEBRIS_STREAM_HEADING_JITTER_RAD, DEBRIS_STREAM_MEAN_INTERVAL_S, DEBRIS_STREAM_MISS_MAX_WU, DEBRIS_STREAM_PIECES_HI, DEBRIS_STREAM_PIECES_LO, DEBRIS_STREAM_RADIUS_HI_WU, DEBRIS_STREAM_RADIUS_LO_WU, DEBRIS_STREAM_RIBBON_WU, DEBRIS_STREAM_SPAWN_RADIUS_WU, DEBRIS_STREAM_SPEED_HI_WU_S, DEBRIS_STREAM_SPEED_LO_WU_S, DEBRIS_STREAM_TYPE_ID, HITCH_SHED_AMOUNT_HI, HITCH_SHED_AMOUNT_LO, HITCH_SHED_BACK_OFF_WU, HITCH_SHED_BACK_VEL_WU_S, HITCH_SHED_MEAN_INTERVAL_S, HITCH_SHED_MIN_SPEED_WU_S, METEOR_PASS_EXIT_PAD_S, METEOR_PASS_MEAN_INTERVAL_S, METEOR_PASS_MISS_MAX_WU, METEOR_PASS_RADIUS_HI_WU, METEOR_PASS_RADIUS_LO_WU, METEOR_PASS_SPAWN_RADIUS_WU, METEOR_PASS_SPEED_HI_WU_S, METEOR_PASS_SPEED_LO_WU_S, METEOR_PASS_TYPE_ID, PASSENGER_LINER_INVALIDATED_CAP, PASSENGER_LINER_RECEIPT_CAP, PASSENGER_LINER_SUSPENSION_CAP, SECTOR_CAUSAL_CHAINS, SMUGGLER_CACHE_AMOUNT_HI, SMUGGLER_CACHE_AMOUNT_LO, SMUGGLER_CACHE_DRIFT_WU_S, SMUGGLER_CACHE_LANDMARK_MAX_WU, SMUGGLER_CACHE_LANDMARK_MIN_WU, SMUGGLER_CACHE_MEAN_INTERVAL_S, SMUGGLER_CACHE_OFFSET_HI_WU, SMUGGLER_CACHE_OFFSET_LO_WU, SMUGGLER_CACHE_TTL_S, TETHYS_HANDOFF_DRIFT_WU_S, TETHYS_HANDOFF_PICKUPS, TETHYS_HANDOFF_TTL_S, TETHYS_JETTISON_PICKUPS, TETHYS_JETTISON_SPREAD_WU_S, TETHYS_JETTISON_TTL_S, TRAFFIC_LAW_LOSS_CAUSE, VOLATILE_SLOUGH_AMOUNT, VOLATILE_SLOUGH_BACK_OFF_WU, VOLATILE_SLOUGH_BACK_VEL_WU_S, VOLATILE_SLOUGH_MEAN_INTERVAL_S, VOLATILE_SLOUGH_MIN_SPEED_WU_S, WEIR_TILL_AMOUNT, WEIR_TILL_COMMODITY, WEIR_TILL_CROSS_MIN_SPEED_WU_S, WEIR_TILL_DRIFT_SCALE, WEIR_TILL_EMBARGO_S, WEIR_TILL_MAX_PODS, _CERES_CAUSAL_ACTOR_SCRATCH, ceresActivityActorWorldRecordId, ceresSeamMinerOwnerIdentity, compactStableIds, entityWithWorldRecord, heliosFreightTallies, lawPresenceRole, leftoverHaulerSlot, leftoverNormalizeDisruptedStationIds, leftoverSlotTargetsStation, liveEntity, normalizeCeresDisabledHaulerIncident, normalizeCeresMinerHaulerHandoff, normalizeCeresTenderServiceIncident, normalizeDepotServices, normalizeHeliosFreightTallyList, stationIdentity, terminalWorldRecord } from './traffic.js';

export const trafficCausalChainOps = {
  // Authored once on a genuinely fresh hull, never inferred from an absent/empty hold.
  _initializeTethysShipment(entity, entry, wasFresh, record) {
    if (wasFresh !== true || record || entity?.alive === false
      || entry?.slot?.id !== 'tethys_quiet_runner'
      || entity?.data?.activityActorSlotId !== 'tethys_quiet_runner'
      || entity.homeSectorId !== TETHYS_ACTIVITY_SECTOR_ID
      || !entity.data.worldRecordId || Object.hasOwn(entity.data, 'cargoManifest')) return false;
    const worldRecordId = entity.data.worldRecordId;
    if (worldRecordId !== stableRecordId(this.state.meta?.seed || 1, TETHYS_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY, entry.slot.worldRecordSlotId) || this.state.entities.get(entity.id) !== entity) return false;
    return this._setTrafficManifest(entity, null, {
      manifestId: `tethys-quiet-shipment:${worldRecordId}`, role: 'smuggler',
      ownerFactionId: entity.factionId || entity.data.factionId || null,
      lines: [{ commodityId: 'cmdty_stolen_goods', qty: 6 }], totalQty: 6,
      tethysShipment: { schema: 1, worldRecordId, handoffDone: false, jettisonDone: false },
    });
  },

  _tethysShipmentActor(slotId = 'tethys_quiet_runner') {
    if (!['tethys_quiet_runner', 'tethys_quiet_keeper'].includes(slotId)) return null;
    const bound = this._ceresCausalActorBySlot(slotId);
    const entity = bound && bound.entity, rec = bound && bound.rec;
    const slot = activityActorSlotById(slotId);
    const worldRecordId = slot && stableRecordId(this.state.meta?.seed || 1,
      TETHYS_ACTIVITY_SECTOR_ID, RECORD_KIND.CONVOY, slot.worldRecordSlotId);
    if (!entity || entity.type !== 'ship' || entity.alive === false || !rec || !worldRecordId
      || this.state.entities.get(entity.id) !== entity || rec.id !== entity.id
      || rec.worldRecordId !== worldRecordId || entity.data?.worldRecordId !== worldRecordId
      || rec.activityActorSlotId !== slotId || entity.data.activityActorSlotId !== slotId
      || entity.homeSectorId !== TETHYS_ACTIVITY_SECTOR_ID
      || entity.data.manifestPayloadDropped === true) return null;
    if (this.state.entityList.some(other => other !== entity && other.alive !== false
      && other.data?.worldRecordId === worldRecordId)) return null;
    return { entity, rec, worldRecordId };
  },

  _rebindTethysSavedCast() {
    const sectorId = TETHYS_ACTIVITY_SECTOR_ID;
    const records = this.state.world?.records?.byId || {};
    this._tethysSavedCastRebindPending = false;
    for (const pocket of activityPocketsForSector(sectorId)) for (const slot of pocket.actorSlots) {
      const id = stableRecordId(this.state.meta?.seed || 1, sectorId, RECORD_KIND.CONVOY, slot.worldRecordSlotId);
      const record = records[id];
      if (!record || record.kind !== RECORD_KIND.CONVOY || record.recordId !== id || terminalWorldRecord(record)
        || record.sectorId !== sectorId || record.trafficRole !== slot.presentationRole) continue;
      const matches = this.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === id);
      if (matches.length !== 1) continue;
      const entity = matches[0];
      const rows = this.state.traffic?.freighters?.filter(row => row.id === entity.id) || [];
      const job = this.helpers?.npcJobs?.get?.(entity.data.jobId || `job:${id}`);
      if (rows.length !== 1 || entity.type !== 'ship' || this.state.entities.get(entity.id) !== entity
        || entity.homeSectorId !== sectorId || entity.data.trafficRole !== slot.presentationRole
        || (entity.data.activityActorSlotId && entity.data.activityActorSlotId !== slot.id)) continue;
      if (entity.data.activityActorSlotId === slot.id && rows[0].worldRecordId === id
        && rows[0].activityActorSlotId === slot.id) continue;
      if (job?.control || job?.job?.phase === 'flee') {
        this._tethysSavedCastRebindPending = true;
        continue;
      }
      // Restore only authored identity on an already adopted original hull. Stock is untouched,
      // including explicit empty/malformed manifests. Never materialize or initialize here.
      this._stampAuthoredActivityEntity(entity, entity.data, { pocket, slot }, sectorId, id);
      rows[0].worldRecordId = id;
      rows[0].activityActorSlotId = slot.id;
      rows[0].manifest = entity.data.cargoManifest || null;
    }
  },

  _tethysQuietCacheCenter() {
    const pocket = activityPocketsForSector(TETHYS_ACTIVITY_SECTOR_ID)
      .find(entry => entry.id === 'tethys_quiet_cache');
    return pocket?.activityAnchor?.localPos
      ? sectorLocalToGlobalForSector(pocket.activityAnchor.localPos, TETHYS_ACTIVITY_SECTOR_ID) : null;
  },

  _prepareTethysRendezvous(live) {
    if (live.tethysRendezvous) return;
    const center = this._tethysQuietCacheCenter(), jobs = this.helpers?.npcJobs;
    if (!center || !jobs?.assign || !jobs.release || !jobs.get) return;
    const pair = ['tethys_quiet_runner', 'tethys_quiet_keeper'].map(slot => this._tethysShipmentActor(slot));
    if (pair.some(actor => !actor)) return;
    const prior = pair.map(actor => jobs.get(actor.entity.data.jobId));
    if (prior.some(entry => entry?.control || entry?.job?.phase === 'flee')) return;
    live.redirectedSlots ||= [];
    for (let i = 0; i < pair.length; i++) {
      const { entity } = pair[i], slotId = entity.data.activityActorSlotId;
      if (live.redirectedSlots.some(row => row.slotId === slotId)) continue;
      if (this._tethysShipmentActor(slotId)?.entity !== entity) continue;
      const priorJobId = entity.data.jobId || null;
      const priorJobEntry = priorJobId ? jobs.get(priorJobId) : null;
      if (priorJobEntry?.control || priorJobEntry?.job?.phase === 'flee') continue;
      if (priorJobId) jobs.release(priorJobId);
      const current = () => this._tethysShipmentActor(slotId)?.entity === entity;
      if (!current() || entity.data.jobId || jobs.get(`job:${pair[i].worldRecordId}`)) continue;
      const pos = { x: center.x + (i === 0 ? -56 : 56), z: center.z - 70 };
      // Bounded paperwork hold uses the ordinary arrival gate and physical feedback driver.
      // The two hulls meet outside the cache prop, 112 WU apart; no pose or velocity writes.
      const assignedJobId = jobs.assign(entity, { kind: activityActorSlotById(slotId).jobKind,
        sectorId: TETHYS_ACTIVITY_SECTOR_ID, speed: 26, commissionS: 120,
        route: [{ id: 'tethys:quiet-meet:hold', pos }, { id: 'tethys:quiet-meet:return', pos }] });
      const assignedEntry = assignedJobId && jobs.get(assignedJobId);
      if (!assignedEntry) {
        if (current() && !entity.data.jobId && !jobs.get(`job:${pair[i].worldRecordId}`)
          && priorJobId && priorJobEntry) {
          this.state.npcJobs.byId[priorJobId] = priorJobEntry;
          entity.data.jobId = priorJobId;
        }
        continue;
      }
      if (!current() || assignedEntry.entityId !== entity.id || assignedEntry.control
        || assignedEntry.job?.route?.[0]?.id !== 'tethys:quiet-meet:hold') continue;
      live.redirectedSlots.push({ slotId, priorJobId, priorJobEntry, assignedJobId,
        tethysEntity: entity, tethysAssignedEntry: assignedEntry });
    }
    live.tethysRendezvous = live.redirectedSlots.filter(row => row.tethysEntity).length === 2;
  },

  _tethysShipmentValid(manifest, worldRecordId) {
    const marker = manifest && manifest.tethysShipment;
    return !!marker && marker.schema === 1 && marker.worldRecordId === worldRecordId
      && manifest.manifestId === `tethys-quiet-shipment:${worldRecordId}`
      && typeof marker.handoffDone === 'boolean' && typeof marker.jettisonDone === 'boolean'
      && Number.isSafeInteger(manifest.totalQty) && manifest.totalQty >= 0 && manifest.totalQty <= 6
      && Array.isArray(manifest.lines) && manifest.lines.length <= 1
      && (manifest.totalQty === 0 ? manifest.lines.length === 0
        : manifest.lines.length === 1 && manifest.lines[0]?.commodityId === 'cmdty_stolen_goods'
          && manifest.lines[0].qty === manifest.totalQty);
  },

  _emitTethysShipmentPortion(actor, phase, makeSpec) {
    if (!actor || !['handoff', 'jettison'].includes(phase)
      || typeof this.helpers?.stageEntitySpawn !== 'function') return 0;
    const { entity, rec, worldRecordId } = actor;
    const busy = this._tethysShipmentBusy || (this._tethysShipmentBusy = new WeakSet());
    if (busy.has(entity)) return 0;
    let manifest = entity.data.cargoManifest;
    if (!this._tethysShipmentValid(manifest, worldRecordId)
      || manifest.tethysShipment[`${phase}Done`]
      || (phase === 'handoff' && manifest.tethysShipment.jettisonDone)) return 0;
    busy.add(entity);
    let emitted = 0;
    try {
      // A portion has one attempt. Failed admissions stay aboard, not silently reassigned
      // to the next handoff after Continue. These are completion flags, never stock counters.
      manifest = { ...manifest, tethysShipment: { ...manifest.tethysShipment, [`${phase}Done`]: true } };
      this._setTrafficManifest(entity, rec, manifest);
      const count = Math.min(3, manifest.totalQty);
      for (let index = 0; index < count; index++) {
        const original = manifest;
        const current = () => {
          const bound = this._tethysShipmentActor();
          return bound?.entity === entity && bound.rec === rec && bound.worldRecordId === worldRecordId
            && entity.data.cargoManifest === original && rec.manifest === original;
        };
        if (!current()) break;
        const spec = makeSpec(index);
        if (!spec) continue;
        spec.flags = { ...spec.flags, persistent: true };
        spec.data = { ...spec.data, manifestId: original.manifestId, ownerRecordId: worldRecordId,
          ownerFactionId: original.ownerFactionId || entity.factionId || entity.data.factionId || null };
        const remaining = original.totalQty - 1;
        const next = { ...original, totalQty: remaining,
          lines: remaining ? [{ commodityId: 'cmdty_stolen_goods', qty: remaining }] : [] };
        let stage;
        try {
          stage = this.helpers.stageEntitySpawn(spec);
          if (!stage) continue;
          stage.commit({
            preflight: current,
            commit: () => current() && this._setTrafficManifest(entity, rec, next) === true,
            abort: () => {
              if (this.state.entities.get(entity.id) === entity && entity.alive !== false
                && entity.data.worldRecordId === worldRecordId && entity.data.cargoManifest === next
                && rec.manifest === next) this._setTrafficManifest(entity, rec, original);
            },
          });
        } catch (error) {
          // Publication observers can throw AFTER the pod and debit committed. That stock
          // is still spent even if the new pod was immediately collected or destroyed.
          if (!stage?.committed) stage?.abort();
        }
        if (stage?.committed) emitted++;
        if (entity.data.cargoManifest !== (stage?.committed ? next : original)) break;
        manifest = entity.data.cargoManifest;
      }
    } finally { busy.delete(entity); }
    return emitted;
  },

  // ── PQ-045.causal-chain — Ceres-only choreography timer ────────────────────────────────────────

  _wipeCeresCausalDataKeys(data) {
    if (!data || typeof data !== 'object') return;
    for (let i = 0; i < CERES_CAUSAL_STAMP_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, CERES_CAUSAL_STAMP_KEYS[i])) {
        delete data[CERES_CAUSAL_STAMP_KEYS[i]];
      }
    }
  },

  /** Clear every ceresCausal* key traffic plants — both live actors and freighter ledger rows. */
  _clearAllCeresCausalEntityStamps() {
    const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(freighters)) {
      for (let i = 0; i < freighters.length; i++) {
        const rec = freighters[i];
        if (!rec) continue;
        if (Object.prototype.hasOwnProperty.call(rec, 'ceresCausalDisabled')) {
          delete rec.ceresCausalDisabled;
        }
        const entity = this.state.entities && this.state.entities.get(rec.id);
        if (entity && entity.data) this._wipeCeresCausalDataKeys(entity.data);
      }
    }
    if (this.state) {
      forEachLivingWorldActor(this.state, (candidate) => {
        const data = candidate && candidate.data;
        if (!data) return;
        let stamped = data.activityActorSlotId != null;
        if (!stamped) {
          const keys = Object.keys(data);
          for (let j = 0; j < keys.length; j++) {
            if (keys[j].startsWith('ceresCausal')) {
              stamped = true;
              break;
            }
          }
        }
        if (stamped) this._wipeCeresCausalDataKeys(data);
      });
    }
  },

  _resetCeresCausalChain(reason = 'reset') {
    if (this._ceresCausal && this._ceresCausal.active && this._ceresCausal.active.length) {
      for (const live of this._ceresCausal.active.slice()) {
        this._restoreCeresCausalJobs(live);
        this._stampCeresCausalCue(live, false);
        this._emitCeresCausalReceipt(live, 'abort', { reason: String(reason || 'reset') });
      }
    }
    this._clearAllCeresCausalEntityStamps();
    this._ceresCausal = null;
  },

  /** The chain table row for the sector the live ledger belongs to (null with no ledger). */
  _causalSpec() {
    const chain = this._ceresCausal;
    return chain && SECTOR_CAUSAL_CHAINS.get(chain.sectorId) || null;
  },

  /** Definition lookup through the live ledger's own sector table, never another sector's. */
  _causalDef(eventId) {
    const spec = this._causalSpec();
    return spec ? spec.byId.get(eventId) : undefined;
  },

  /** True when the live ledger is the Ceres chain — the gate for every Ceres-only effect. */
  _causalIsCeres() {
    const chain = this._ceresCausal;
    return !!chain && chain.sectorId === CERES_ACTIVITY_SECTOR_ID;
  },

  _ensureCeresCausalChain(reason = 'ensure') {
    const sectorId = this.state && this.state.world && this.state.world.currentSectorId;
    if (reason === 'save_loaded' && sectorId === TETHYS_ACTIVITY_SECTOR_ID) this._rebindTethysSavedCast();
    const spec = sectorId ? SECTOR_CAUSAL_CHAINS.get(sectorId) : null;
    if (!spec) {
      this._resetCeresCausalChain('wrong_sector');
      return null;
    }
    if (this._ceresCausal && this._ceresCausal.sectorId === sectorId
      && this._ceresCausal.schema === spec.schema) {
      return this._ceresCausal;
    }
    // A ledger left over from another sector's chain (continuous exits never reset it) is torn
    // down before this sector's own chain arms.
    if (this._ceresCausal) this._resetCeresCausalChain('wrong_sector');
    const simTime = Number.isFinite(deferredEnterNow(this.state)) ? deferredEnterNow(this.state) : 0;
    this._ceresCausal = {
      schema: spec.schema,
      sectorId,
      cycle: 0,
      nextIndex: 0,
      active: [],
      completed: [],
      seeds: Object.create(null),
      nextEligibleAt: simTime,
      startedAt: simTime,
      reason: String(reason || 'ensure'),
    };
    this._emitCeresCausalReceipt(null, 'chain_ready', {
      reason: String(reason || 'ensure'),
      cycle: 0,
    });
    return this._ceresCausal;
  },

  /**
   * After continuous re-entry, live links may carry phaseEndsAt values that are already in the past
   * (exit never reset the ledger). Rebase each remaining phase window from current simTime so the
   * chain does not fast-forward one transition per tick.
   */
  _rebaseCeresCausalPhaseEnds() {
    const chain = this._ceresCausal;
    if (!chain || !Array.isArray(chain.active) || !chain.active.length) return;
    const deferredNow = deferredEnterNow(this.state);
    const simTime = Number.isFinite(deferredNow) ? deferredNow : 0;
    for (let i = 0; i < chain.active.length; i++) {
      const live = chain.active[i];
      if (!live) continue;
      const def = this._causalDef(live.eventId);
      const phase = def && Array.isArray(def.phases) ? def.phases[live.phaseIndex] : null;
      const durationS = phase && Number.isFinite(phase.durationS) ? phase.durationS : 1;
      if (!(Number.isFinite(live.phaseEndsAt) && live.phaseEndsAt > simTime)) {
        live.phaseEndsAt = simTime + durationS;
      }
    }
    if (Number.isFinite(chain.nextEligibleAt) && chain.nextEligibleAt < simTime) {
      chain.nextEligibleAt = simTime;
    }
  },

  /**
   * Resolve a Ceres cast (or tender reuse) actor by stable slot id. Returns a preallocated scratch
   * object — copy entity/rec before the next call. Freighter ledger first, then tender fall-through
   * via a single worldRecordId probe (or one entityList scan when the tender is only activity-stamped).
   */
  _ceresCausalActorBySlot(slotId) {
    if (typeof slotId !== 'string' || !slotId) return null;
    const scratch = _CERES_CAUSAL_ACTOR_SCRATCH;
    scratch.entity = null;
    scratch.rec = null;
    scratch.slotId = null;
    const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(freighters)) {
      for (let i = 0; i < freighters.length; i++) {
        const rec = freighters[i];
        if (!rec || rec.activityActorSlotId !== slotId) continue;
        const entity = liveEntity(this.state, rec.id);
        if (entity && entity.alive !== false) {
          scratch.entity = entity;
          scratch.rec = rec;
          scratch.slotId = slotId;
          return scratch;
        }
      }
    }
    // Tender is owned by factionPresence (excluded from traffic job cast) but still has the stable
    // activity slot id stamped when adopted. Freighter ledger already missed it; probe by
    // worldRecordId, then a single entityList pass if the tender was only activity-stamped.
    if (slotId === CERES_TENDER_SLOT_ID) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const worldRecordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        `ceres:activity:${CERES_TENDER_SLOT_ID}`,
      );
      let entity = entityWithWorldRecord(this.state, worldRecordId);
      if (!entity) {
        forEachLivingWorldActor(this.state, (candidate) => {
          if (entity || !candidate.data
            || candidate.data.activityActorSlotId !== CERES_TENDER_SLOT_ID) return;
          entity = candidate;
        });
      }
      if (entity && entity.alive !== false) {
        scratch.entity = entity;
        scratch.rec = null;
        scratch.slotId = slotId;
        return scratch;
      }
    }
    return null;
  },

  _ceresCausalWorldRecordIdForSlot(slotId) {
    if (!this._causalIsCeres() && this._ceresCausal) {
      // Another sector's authored cast: the durable id is minted from that sector's own slot
      // namespace, never the Ceres one.
      const slot = typeof slotId === 'string' && slotId ? activityActorSlotById(slotId) : null;
      if (!slot || !slot.worldRecordSlotId) return null;
      const seed = (this.state && this.state.meta && this.state.meta.seed) || 1;
      return stableRecordId(seed, this._ceresCausal.sectorId, RECORD_KIND.CONVOY, slot.worldRecordSlotId);
    }
    return ceresActivityActorWorldRecordId(this.state, slotId);
  },

  /**
   * The authored cast entry ({ pocket, slot, service }) for a slot id in the live ledger's sector.
   * Ceres keeps its own indexed cast; every other chain sector resolves through the activity
   * pocket registry that materialized the hull in the first place.
   */
  _causalCastEntry(slotId) {
    if (typeof slotId !== 'string' || !slotId) return undefined;
    if (!this._ceresCausal || this._causalIsCeres()) return CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
    for (const pocket of activityPocketsForSector(this._ceresCausal.sectorId)) {
      const slot = pocket.actorSlots.find((candidate) => candidate.id === slotId);
      if (slot) return { pocket, slot, service: false };
    }
    return undefined;
  },

  /** True when the durable cast record is terminal (destroyed/defeated) — not merely absent this tick. */
  _ceresCausalSlotTerminallyGone(slotId) {
    if (slotId === CERES_TENDER_SLOT_ID) return false;
    const worldRecordId = this._ceresCausalWorldRecordIdForSlot(slotId);
    if (!worldRecordId) return false;
    const records = this.state && this.state.world && this.state.world.records && this.state.world.records.byId;
    return terminalWorldRecord(records && records[worldRecordId]);
  },

  _ceresCausalRequiredActorsLive(def) {
    if (!def || !Array.isArray(def.actorSlots)) return false;
    for (let i = 0; i < def.actorSlots.length; i++) {
      const slotId = def.actorSlots[i];
      // Tender is optional for chain bookkeeping: the Pitborn yard tender may lag rematerialization.
      if (slotId === CERES_TENDER_SLOT_ID) continue;
      if (!this._ceresCausalActorBySlot(slotId)) return false;
    }
    return true;
  },

  /**
   * True when at least one required non-tender cast slot is terminally destroyed (not a transient
   * single-tick absence). Used to skip the link rather than wait forever.
   */
  _ceresCausalRequiredActorsTerminallyGone(def) {
    if (!def || !Array.isArray(def.actorSlots)) return false;
    for (let i = 0; i < def.actorSlots.length; i++) {
      const slotId = def.actorSlots[i];
      if (slotId === CERES_TENDER_SLOT_ID) continue;
      if (this._ceresCausalActorBySlot(slotId)) continue;
      if (this._ceresCausalSlotTerminallyGone(slotId)) return true;
    }
    return false;
  },

  _ceresCausalSeedsReady(requires) {
    const seeds = this._ceresCausal && this._ceresCausal.seeds;
    if (!seeds) return false;
    if (!Array.isArray(requires) || requires.length === 0) return true;
    for (let i = 0; i < requires.length; i++) {
      if (seeds[requires[i]] !== true) return false;
    }
    return true;
  },

  /**
   * Seeds planted for a terminal outcome. Complete uses `def.seeds`; any interrupt/fallback/skip
   * prefers `def.interruptSeeds` when authored, otherwise falls back to `def.seeds` so the
   * plant-on-every-outcome anti-softlock guarantee stays intact for links without a branch.
   */
  _ceresCausalSeedsForOutcome(def, outcome = 'complete') {
    if (!def) return null;
    if (outcome !== 'complete' && Array.isArray(def.interruptSeeds)) return def.interruptSeeds;
    return Array.isArray(def.seeds) ? def.seeds : null;
  },

  _plantCeresCausalSeeds(def, seedsOverride = null) {
    if (!def || !this._ceresCausal) return;
    const list = Array.isArray(seedsOverride) ? seedsOverride : def.seeds;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      this._ceresCausal.seeds[list[i]] = true;
    }
  },

  /** Plant interrupt or complete seeds for a terminal cast skip / forced seed. */
  _plantCeresCausalOutcomeSeeds(def, outcome = 'complete') {
    const list = this._ceresCausalSeedsForOutcome(def, outcome);
    this._plantCeresCausalSeeds(def, list);
    return list;
  },

  _openCeresRichSeamOpportunity(live) {
    if (!live || !this._causalIsCeres()) return null;
    // The strike opens the seam's primary window; a calving that actually reached its calve phase
    // re-arms the window as the catalog's fresh-face aftermath ("fresh faces are visibly brighter
    // ore") once the prior window has resolved. Keyed on phaseSeeded — the natural seed-at-phase
    // flag — because the completion path force-sets `seeded` on interrupts, and an aborted calving
    // never visibly happened, so it must open nothing.
    const isStrike = live.eventId === 'ev_rich_seam_strike';
    const isCalving = live.eventId === 'ev_rock_calving' && live.phaseSeeded === true;
    if (!isStrike && !isCalving) return null;
    const cycle = this._ceresCausal && this._ceresCausal.cycle || 0;
    const rec = openRichSeamOpportunity(this.state, {
      fieldId: 'f_ceres_1',
      activityObjectSlotId: CERES_RICH_SEAM_OBJECT_SLOT_ID,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      sourceEventId: live.eventId,
      sourceCycle: cycle,
      attempt: isCalving ? 1 : 0,
      // The catalog's fresh faces are "visibly brighter ore": the calved window out-pays the
      // strike's default bonus through the same bonusU field the seam readouts already render
      // (target panel names it FRESH SEAM; the Hold's lot row shows the seam bonus size).
      bonusU: isCalving ? CERES_CALVED_SEAM_BONUS_U : undefined,
      opportunityId: isCalving
        ? `rich-seam:f_ceres_1:${CERES_RICH_SEAM_OBJECT_SLOT_ID}:${cycle}:calved`
        : undefined,
      simTime: this.state && this.state.simTime,
    });
    if (rec && this.bus && typeof this.bus.emit === 'function') this.bus.emit('field:richSeamOpened', rec);
    return rec;
  },

  _emitCeresCausalReceipt(live, kind, extra = null) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const chain = this._ceresCausal;
    const payload = {
      schema: chain && chain.schema || CERES_CAUSAL_CHAIN_SCHEMA,
      kind: String(kind || 'tick'),
      sectorId: chain && chain.sectorId || CERES_ACTIVITY_SECTOR_ID,
      simTime: Number.isFinite(deferredEnterNow(this.state)) ? deferredEnterNow(this.state) : 0,
      cycle: chain ? chain.cycle | 0 : 0,
      activeCount: chain && Array.isArray(chain.active) ? chain.active.length : 0,
      completed: chain && Array.isArray(chain.completed) ? chain.completed.slice() : [],
      seeds: chain && chain.seeds ? { ...chain.seeds } : {},
      eventId: live && live.eventId || null,
      phase: live && live.phase || null,
      phaseIndex: live && Number.isInteger(live.phaseIndex) ? live.phaseIndex : null,
      actorSlotIds: live && Array.isArray(live.actorSlotIds) ? live.actorSlotIds.slice() : [],
      cue: live && live.cue || null,
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
    this.bus.emit(CERES_CAUSAL_CHAIN_EVENT, payload);
  },

  _startCeresCausalEvent(def, simTime) {
    if (!def || !this._ceresCausal) return null;
    const phase = def.phases[0];
    const live = {
      eventId: def.id,
      phaseIndex: 0,
      phase: phase.name,
      cue: phase.cue || null,
      phaseEndsAt: simTime + phase.durationS,
      actorSlotIds: def.actorSlots.slice(),
      seeded: false,
      redirectedSlots: null,
      serviceIncidentId: null,
      probeDrops: null,
    };
    this._ceresCausal.active.push(live);
    // Stamp a transient presentation cue on the primary actor (not a movement intent).
    this._stampCeresCausalCue(live, true);
    // The two persisted service incidents are Ceres-owned machinery (the tender yard, the dock
    // hauler); another sector's chain never starts them even if it borrows an event id.
    if (this._causalIsCeres() && def.id === 'ev_disabled_hauler_recovery') {
      const incident = this._beginCeresDisabledHaulerIncident();
      live.serviceIncidentId = incident && incident.incidentId || null;
    }
    if (this._causalIsCeres() && def.id === 'ev_tender_services_miner') {
      const incident = this._beginCeresTenderServiceIncident();
      live.serviceIncidentId = incident && incident.incidentId || null;
    }
    this._applyCeresCausalJobHints(def, live, live.phase);
    this._emitCeresCausalReceipt(live, 'event_start');
    return live;
  },

  _stampCeresCausalCue(live, active) {
    if (!live || !Array.isArray(live.actorSlotIds)) return;
    for (let i = 0; i < live.actorSlotIds.length; i++) {
      const bound = this._ceresCausalActorBySlot(live.actorSlotIds[i]);
      if (!bound || !bound.entity || !bound.entity.data) continue;
      if (active) {
        bound.entity.data.ceresCausalEventId = live.eventId;
        bound.entity.data.ceresCausalPhase = live.phase;
        bound.entity.data.ceresCausalCue = live.cue;
      } else if (bound.entity.data.ceresCausalEventId === live.eventId) {
        delete bound.entity.data.ceresCausalEventId;
        delete bound.entity.data.ceresCausalPhase;
        delete bound.entity.data.ceresCausalCue;
      }
    }
  },

  _setCeresCausalDisabled(slotId, disabled) {
    const bound = this._ceresCausalActorBySlot(slotId);
    if (!bound || !bound.entity || !bound.entity.data) return;
    if (disabled === true) bound.entity.data.ceresCausalDisabled = true;
    else delete bound.entity.data.ceresCausalDisabled;
    // Do not write rec.ceresCausalDisabled — nothing reads it; save-envelope hygiene.
  },

  /**
   * Route a cast actor's job toward a subject (or reaffirm the authored cycle) via npcJobsRuntime.
   * Movement stays job-owned; we only assign/redirect jobs. Tender is not traffic job-owned.
   */
  _applyCeresCausalJobHints(def, live, phaseName) {
    if (!def || !live || !Array.isArray(def.jobHints) || !def.jobHints.length) return;
    if (this._ceresCausal?.sectorId === TETHYS_ACTIVITY_SECTOR_ID && def.id === 'ev_criminal_handoff') {
      if (['converge', 'standoff', 'swap'].includes(phaseName)) this._prepareTethysRendezvous(live);
      else if (phaseName === 'part') this._restoreCeresCausalJobs(live);
      return;
    }
    for (let i = 0; i < def.jobHints.length; i++) {
      const hint = def.jobHints[i];
      if (!hint || !Array.isArray(hint.phases) || !hint.phases.includes(phaseName)) continue;
      if (hint.reaffirm === true) {
        this._reaffirmCeresCausalActorJob(hint.actorSlotId);
        continue;
      }
      if (hint.subjectSlotId) {
        this._redirectCeresCausalActorJob(hint.actorSlotId, hint.subjectSlotId, live);
      }
    }
  },

  _reaffirmCeresCausalActorJob(actorSlotId) {
    const entry = this._causalCastEntry(actorSlotId);
    if (!entry || entry.service) return false;
    const bound = this._ceresCausalActorBySlot(actorSlotId);
    if (!bound || !bound.entity) return false;
    const entity = bound.entity;
    if (!entity.data || !entity.data.jobId) {
      return !!(this._causalIsCeres()
        ? this._assignCeresActivityJob(entity, entry)
        : this._assignActivityJob(entity, entry));
    }
    // Already job-owned — leave the existing cycle alone.
    return true;
  },

  _redirectCeresCausalActorJob(actorSlotId, subjectSlotId, live) {
    const entry = this._causalCastEntry(actorSlotId);
    if (!entry || entry.service || !entry.slot || !CERES_ACTIVITY_JOB_KINDS.has(entry.slot.jobKind)) {
      return false; // no traffic job seam (e.g. tender) — stamp-only
    }
    const actorBound = this._ceresCausalActorBySlot(actorSlotId);
    if (!actorBound || !actorBound.entity || !actorBound.entity.pos) return false;
    const actorEntity = actorBound.entity;
    const subjectBound = this._ceresCausalActorBySlot(subjectSlotId);
    if (!subjectBound || !subjectBound.entity || !subjectBound.entity.pos) return false;
    const subjectEntity = subjectBound.entity;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    const worldRecordId = actorEntity.data && actorEntity.data.worldRecordId;
    const jobId = (actorEntity.data && actorEntity.data.jobId)
      || (worldRecordId ? `job:${worldRecordId}` : null);
    const redirected = Array.isArray(live.redirectedSlots) ? live.redirectedSlots : null;
    if (redirected) {
      for (let i = 0; i < redirected.length; i++) {
        const record = redirected[i];
        const slotId = typeof record === 'string' ? record : record && record.slotId;
        if (slotId === actorSlotId) return true;
      }
    }

    if (typeof assign !== 'function') return false;
    const priorJobId = actorEntity.data && actorEntity.data.jobId || jobId || null;
    const priorJobEntry = typeof getJob === 'function' && priorJobId ? getJob(priorJobId) : null;
    if (typeof release === 'function' && jobId) release(jobId);
    if (actorEntity.data) actorEntity.data.jobId = null;
    const subjectPos = { x: subjectEntity.pos.x, z: subjectEntity.pos.z };
    const dx = subjectPos.x - actorEntity.pos.x;
    const dz = subjectPos.z - actorEntity.pos.z;
    const distance = Math.hypot(dx, dz);
    const durationS = 25;
    const speed = Number.isFinite(distance) && distance > 0
      ? Math.max(12, distance / durationS)
      : 40;
    const spec = {
      kind: entry.slot.jobKind,
      sectorId: this._ceresCausal.sectorId,
      speed,
      route: [
        {
          id: `causal:${live.eventId}:origin`,
          label: `causal:${live.eventId}:origin`,
          pos: { x: actorEntity.pos.x, z: actorEntity.pos.z },
        },
        {
          id: `causal:${live.eventId}:subject`,
          label: `causal:${live.eventId}:subject`,
          pos: { x: subjectPos.x, z: subjectPos.z },
          targetRef: `actor:${subjectSlotId}`,
        },
      ],
    };
    const assigned = assign(actorEntity, spec);
    if (!assigned) {
      // Real-target actors reject non-canonical routes; restore the prior job id without going
      // through _assignCeresActivityJob (that path mints a freight manifest for empty haulers).
      if (actorEntity.data && priorJobId) actorEntity.data.jobId = priorJobId;
      const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
      if (priorJobId && priorJobEntry && byId && typeof byId === 'object') byId[priorJobId] = priorJobEntry;
      return false;
    }
    if (!live.redirectedSlots) live.redirectedSlots = [];
    live.redirectedSlots.push({
      slotId: actorSlotId,
      priorJobId,
      priorJobEntry,
      assignedJobId: actorEntity.data && actorEntity.data.jobId || assigned,
    });
    return true;
  },

  /**
   * The salvor's stack phase spills its cutting count as real ore pickups at the wreck — the
   * stripping aftermath the player can dive into and grab. Deterministic spread (hash32, no
   * shared-rng consumption), TTL-bounded, once per link (the cutter stacks once per cycle).
   */
  _spillCeresCutterCount(live) {
    if (!live || live.countSpilled) return;
    const bound = this._ceresCausalActorBySlot(CERES_CATHEDRAL_SALVOR_SLOT_ID);
    if (!bound || !bound.entity || !bound.entity.pos) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    for (let index = 0; index < CERES_CUTTER_SPILL_PICKUPS; index++) {
      const angle = (hash32(live.eventId, index, 'stack-spill') % 6284) / 1000;
      const radius = 10 + (hash32(live.eventId, index, 'stack-radius') % 9);
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: {
          x: bound.entity.pos.x + Math.cos(angle) * radius,
          z: bound.entity.pos.z + Math.sin(angle) * radius,
        },
        vel: { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6 },
        radius: 2.4, mass: 0.4, collides: true,
        data: {
          kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: CERES_CUTTER_SPILL_QTY,
          despawnAt: now + CERES_CUTTER_SPILL_TTL_S,
          ceresSpillSource: 'ev_cutter_strips_wreck',
        },
      });
    }
    live.countSpilled = true;
  },

  /**
   * The original runner's three-unit exchange portion becomes ordinary cargo pickups only
   * at a real, slow, hull-clear Quiet Cache rendezvous. The other three units remain aboard
   * for the later jettison. The manifest's durable completion flag prevents phase/load replay.
   */
  _dropTethysHandoffLoad(live) {
    if (!live || live.handoffDropped) return;
    const actor = this._tethysShipmentActor();
    const runner = actor && actor.entity;
    if (!runner || !runner.pos) return;
    // Actor lookup returns a shared scratch row: retain each actual hull, never the row.
    const keeperBound = this._tethysShipmentActor('tethys_quiet_keeper');
    const keeper = keeperBound && keeperBound.entity;
    if (!keeper || !keeper.pos || keeper === runner) return;
    const a = runner.pos, b = keeper.pos;
    if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) return;
    const cache = this._tethysQuietCacheCenter();
    if (!cache || Math.hypot(a.x-cache.x,a.z-cache.z)>130
      || Math.hypot(b.x-cache.x,b.z-cache.z)>130) return;
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    const runnerClear = Math.max(0, Number(runner.radius) || 0) + 6.4;
    const keeperClear = Math.max(0, Number(keeper.radius) || 0) + 6.4;
    // A missed rendezvous keeps the portion aboard. Never bridge a distant pair with loot.
    const rvx = Number(runner.vel?.x) || 0, rvz = Number(runner.vel?.z) || 0;
    if (gap > 180 || gap < runnerClear + keeperClear + 12
      || Math.hypot(rvx - (Number(keeper.vel?.x) || 0), rvz - (Number(keeper.vel?.z) || 0)) > 8) return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._emitTethysShipmentPortion(actor, 'handoff', (index) => {
      // Piece i crosses first: the three land spaced across the gap, drifting gently on the
      // line between the hulls so a witness reads the exchange order.
      const t = (runnerClear + (gap - runnerClear - keeperClear)
        * index / (TETHYS_HANDOFF_PICKUPS - 1)) / gap;
      const jitter = (hash32(live.eventId, index, 'handoff-jitter') % 6284) / 1000;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz) || 1;
      // Jitter is perpendicular: it cannot erode longitudinal hull or pod spacing.
      const jx = -dz / dist * Math.sin(jitter) * 2;
      const jz = dx / dist * Math.sin(jitter) * 2;
      return {
        type: 'pickup',
        pos: { x: a.x + dx * t + jx, z: a.z + dz * t + jz },
        vel: {
          x: rvx + (dx / dist) * TETHYS_HANDOFF_DRIFT_WU_S,
          z: rvz + (dz / dist) * TETHYS_HANDOFF_DRIFT_WU_S,
        },
        radius: 2.4, mass: 0.4, collides: true,
        homeSectorId: TETHYS_ACTIVITY_SECTOR_ID,
        data: {
          kind: 'cargo', commodityId: 'cmdty_stolen_goods', amount: 1,
          legality: 'contraband',
          despawnAt: now + TETHYS_HANDOFF_TTL_S,
          tethysHandoff: true,
        },
      };
    });
    live.handoffDropped = true;
  },

  /**
   * ev_smuggler_breaks' jettison: the bolting runner sheds its load off its own tail — three
   * pickups sprayed behind the hull on inherited velocity plus a fan (the catalog's "dumps
   * three cargo pickups in a spray to shed mass"). Same pipeline as the handoff: the player
   * who beats the patrol to the drift owns the take.
   */
  _sprayTethysRunnerJettison(live) {
    if (!live || live.jettisonSprayed) return;
    const actor = this._tethysShipmentActor();
    if (!actor || !actor.entity.pos) return;
    const entity = actor.entity;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const vx = (entity.vel && entity.vel.x) || 0;
    const vz = (entity.vel && entity.vel.z) || 0;
    const speed = Math.hypot(vx, vz);
    const heading = speed > 0.5 ? Math.atan2(vz, vx) : 0;
    this._emitTethysShipmentPortion(actor, 'jettison', (index) => {
      // Fan the three pieces behind the hull: mostly aft, each on its own scatter so the spray
      // is a cone, not a stack.
      const scatter = ((hash32(live.eventId, index, 'jettison-scatter') % 6284) / 1000) - Math.PI;
      const back = heading + Math.PI + scatter * 0.35;
      const drop = Math.max(0, Number(entity.radius) || 0) + 6.4
        + (hash32(live.eventId, index, 'jettison-drop') % 7);
      return {
        type: 'pickup',
        pos: {
          x: entity.pos.x + Math.cos(back) * drop,
          z: entity.pos.z + Math.sin(back) * drop,
        },
        vel: {
          x: vx * 0.85 + Math.cos(back) * TETHYS_JETTISON_SPREAD_WU_S,
          z: vz * 0.85 + Math.sin(back) * TETHYS_JETTISON_SPREAD_WU_S,
        },
        radius: 2.4, mass: 0.4, collides: true,
        homeSectorId: TETHYS_ACTIVITY_SECTOR_ID,
        data: {
          kind: 'cargo', commodityId: 'cmdty_stolen_goods', amount: 1,
          legality: 'contraband',
          despawnAt: now + TETHYS_JETTISON_TTL_S,
          tethysJettison: true,
        },
      };
    });
    live.jettisonSprayed = true;
  },

  /** The refinery dock the chain's station-owned links (capsule, clamp pod) shear/launch from. */
  _ceresCausalRefineryStation() {
    const stations = this._sectorStations();
    for (let i = 0; i < stations.length; i++) {
      const candidate = stations[i];
      if (candidate && candidate.alive !== false && candidate.pos
        && candidate.data && candidate.data.stationId === 'station_ceres') {
        return candidate;
      }
    }
    return null;
  },

  /**
   * ev_meteor_passage cadence: one pass per roll, ~1-2 per hour class (the catalog's rarity).
   * The clock lives in the persisted traffic bag so a Continue keeps the schedule instead of
   * re-rolling it; the live-pass record stays instance-local — a restored rock re-derives the
   * "one at a time" guard through the live-entity scan in _spawnPocketMeteor.
   */
  _stepPocketMeteorPass(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const pass = this._meteorPass;
    if (pass) {
      const rock = pass.rockId != null && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(pass.rockId) : null;
      if (!rock || rock.alive === false) this._meteorPass = null;
    }
    if (!Number.isFinite(bag.nextMeteorPassAt)) {
      bag.nextMeteorPassAt = now + this._meteorPassIntervalS();
      return;
    }
    if (now < bag.nextMeteorPassAt) return;
    bag.nextMeteorPassAt = now + this._meteorPassIntervalS();
    if (this._meteorPass) return;
    this._spawnPocketMeteor(state);
  },

  _meteorPassIntervalS() {
    return METEOR_PASS_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The catalog's arrangement: one large rock on a straight chord across the pocket at 3-4x
   * traffic speed, entering and leaving at the speed-revealed band. Ballistic by physicsBody —
   * dynamic membership puts it on the movables/spatial lanes so radar, the despawn sweep and
   * the mining beam all resolve it at its live pose under either physics authority, and the
   * body keeps its spawn linvel under Rapier the same way the compat integrator keeps vel.
   * The chord is aimed past the player's own lane within the miss band — the rock crosses
   * where the player is actually looking. Cracking it is the authored interruption: the
   * ordinary mining path owns the ore spray and the fracture debris.
   */
  _spawnPocketMeteor(state) {
    const helpers = this.helpers;
    const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
    if (!state || !spawn) return null;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos) return null;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.alive !== false && e.data && e.data.meteorPassage === true) return null;
    }
    const bearing = this._rng() * Math.PI * 2;
    const dirX = Math.cos(bearing);
    const dirZ = Math.sin(bearing);
    const miss = (this._rng() - 0.5) * 2 * METEOR_PASS_MISS_MAX_WU;
    const speed = METEOR_PASS_SPEED_LO_WU_S
      + this._rng() * (METEOR_PASS_SPEED_HI_WU_S - METEOR_PASS_SPEED_LO_WU_S);
    const radius = METEOR_PASS_RADIUS_LO_WU
      + this._rng() * (METEOR_PASS_RADIUS_HI_WU - METEOR_PASS_RADIUS_LO_WU);
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const entry = {
      x: player.pos.x - dirX * METEOR_PASS_SPAWN_RADIUS_WU - dirZ * miss,
      z: player.pos.z - dirZ * METEOR_PASS_SPAWN_RADIUS_WU + dirX * miss,
    };
    // Beam mk1 needs ~4-8 s of contact to crack it inside a ~30 s crossing — a fast window,
    // paid by the second rather than all-or-nothing, exactly like an ordinary rock.
    const oreHP = Math.round(radius * 8);
    const yieldU = Math.max(3, Math.round(radius * 0.5));
    const travelS = (METEOR_PASS_SPAWN_RADIUS_WU * 2) / speed;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const entity = spawn({
      type: 'asteroid',
      pos: entry,
      vel: { x: dirX * speed, z: dirZ * speed },
      rot: this._rng() * Math.PI * 2,
      angVel: (this._rng() - 0.5) * 0.5,
      radius,
      mass: Math.max(1, Math.round(radius * radius * radius * 0.25)),
      physicsBody: {
        radius: asteroidColliderRadius(METEOR_PASS_TYPE_ID, radius),
        dynamic: true,
      },
      hull: oreHP,
      hullMax: oreHP,
      collides: true,
      homeSectorId: sectorId,
      data: {
        typeId: METEOR_PASS_TYPE_ID,
        tier: 0,
        tierCap: 0,
        oreHP,
        oreHPMax: oreHP,
        yieldU,
        size: radius,
        meteorPassage: true,
        despawnAt: now + travelS + METEOR_PASS_EXIT_PAD_S,
      },
    });
    if (entity) {
      this._meteorPass = {
        rockId: typeof entity === 'object' ? entity.id : entity,
        sectorId,
        bornAt: now,
      };
    }
    return entity || null;
  },

  /**
   * ev_debris_on_route cadence: one field per roll on a schedule that survives a Continue
   * (same persisted-bag pattern as the meteor pass). The live-field record stays
   * instance-local — a restored field re-derives the "one at a time" guard through the
   * live-entity scan in _spawnPocketDebrisField.
   */
  _stepPocketDebrisField(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const field = this._debrisField;
    if (field) {
      let anyAlive = false;
      const byId = state.entities && typeof state.entities.get === 'function' ? state.entities : null;
      if (byId) {
        for (let i = 0; i < field.pieceIds.length; i++) {
          const piece = byId.get(field.pieceIds[i]);
          if (piece && piece.alive !== false) { anyAlive = true; break; }
        }
      }
      if (!anyAlive) this._debrisField = null;
    }
    if (!Number.isFinite(bag.nextDebrisFieldAt)) {
      bag.nextDebrisFieldAt = now + this._debrisFieldIntervalS();
      return;
    }
    if (now < bag.nextDebrisFieldAt) return;
    bag.nextDebrisFieldAt = now + this._debrisFieldIntervalS();
    if (this._debrisField) return;
    this._spawnPocketDebrisField(state);
  },

  _debrisFieldIntervalS() {
    return DEBRIS_FIELD_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The catalog's arrangement: 8-12 small pieces on parallel tracks entering at the pocket
   * edge on one shared slow vector — a ribbon crossing the player's route over about two
   * minutes, not a cloud parked on it. Every piece is a standard scrap pickup (collides,
   * TTL'd, collectible by the ordinary custody pipeline), spread across a band perpendicular
   * to the drift so the constellation reads at range. A piece the player catches simply
   * leaves the constellation early; the rest exit at the far edge under despawnAt.
   */
  _spawnPocketDebrisField(state) {
    const helpers = this.helpers;
    const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
    if (!state || !spawn) return null;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos) return null;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.alive !== false && e.data && e.data.debrisOnRoute === true) return null;
    }
    const bearing = this._rng() * Math.PI * 2;
    const dirX = Math.cos(bearing);
    const dirZ = Math.sin(bearing);
    const miss = (this._rng() - 0.5) * 2 * DEBRIS_FIELD_MISS_MAX_WU;
    const speed = DEBRIS_FIELD_SPEED_LO_WU_S
      + this._rng() * (DEBRIS_FIELD_SPEED_HI_WU_S - DEBRIS_FIELD_SPEED_LO_WU_S);
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const pieces = DEBRIS_FIELD_PIECES_LO
      + Math.floor(this._rng() * (DEBRIS_FIELD_PIECES_HI - DEBRIS_FIELD_PIECES_LO + 1));
    const travelS = (DEBRIS_FIELD_SPAWN_RADIUS_WU * 2) / speed;
    const despawnAt = now + travelS + DEBRIS_FIELD_EXIT_PAD_S;
    const pieceIds = [];
    // The ribbon's center enters on the player's far side aimed across their route within the
    // miss band — the field drifts through where the player is actually looking.
    const centerX = player.pos.x - dirX * DEBRIS_FIELD_SPAWN_RADIUS_WU - dirZ * miss;
    const centerZ = player.pos.z - dirZ * DEBRIS_FIELD_SPAWN_RADIUS_WU + dirX * miss;
    for (let i = 0; i < pieces; i++) {
      const across = (this._rng() - 0.5) * 2 * DEBRIS_FIELD_SPREAD_WU;
      const along = (this._rng() - 0.5) * 2 * DEBRIS_FIELD_SPREAD_WU;
      const jitX = (this._rng() - 0.5) * 2 * DEBRIS_FIELD_DRIFT_JITTER_WU_S;
      const jitZ = (this._rng() - 0.5) * 2 * DEBRIS_FIELD_DRIFT_JITTER_WU_S;
      const amount = 1 + Math.floor(this._rng() * 3);
      const entity = spawn({
        type: 'pickup',
        pos: {
          x: centerX - dirZ * across + dirX * along,
          z: centerZ + dirX * across + dirZ * along,
        },
        vel: { x: dirX * speed + jitX, z: dirZ * speed + jitZ },
        radius: 2.4, mass: 0.4, collides: true,
        homeSectorId: sectorId,
        data: {
          kind: 'ore', commodityId: 'cmdty_scrap_metal', amount,
          despawnAt,
          debrisOnRoute: true,
        },
      });
      if (entity) pieceIds.push(typeof entity === 'object' ? entity.id : entity);
    }
    if (pieceIds.length) {
      this._debrisField = {
        pieceIds,
        sectorId,
        bornAt: now,
      };
    }
    return pieceIds.length ? pieceIds : null;
  },

  /**
   * ev_smuggler_dumps_cache cadence: one live cache per roll on a persisted clock (same
   * saved-bag pattern as the meteor and debris field). The live record is instance-local;
   * a restored cache re-derives the guard through the live-entity scan in
   * _spawnSmugglerDeadDrop.
   */
  _stepSmugglerDeadDrop(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const cache = this._smugglerCache;
    if (cache) {
      const e = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(cache.cacheId) : null;
      if (!e || e.alive === false) this._smugglerCache = null;
    }
    if (!Number.isFinite(bag.nextSmugglerCacheAt)) {
      bag.nextSmugglerCacheAt = now + this._smugglerCacheIntervalS();
      return;
    }
    if (now < bag.nextSmugglerCacheAt) return;
    bag.nextSmugglerCacheAt = now + this._smugglerCacheIntervalS();
    if (this._smugglerCache) return;
    this._spawnSmugglerDeadDrop(state);
  },

  _smugglerCacheIntervalS() {
    return SMUGGLER_CACHE_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The catalog's arrangement: the dead-drop lands BESIDE a landmark — a real rock off the
   * lane — where "catch it by silhouette occlusion or not at all" is honest geometry. The
   * cache is a standard cargo pickup carrying hot contraband (cmdty_stolen_goods legality
   * stamps it; the scan fine is the point of taking it) with `unlitDrop` — the motion
   * presentation suppresses the transponder strobe and the takeable ring, so the find is
   * silhouette-reading, not signal-following. A slow creep keeps it near the landmark until
   * the despawn sweep clears an unclaimed drop.
   */
  _spawnSmugglerDeadDrop(state) {
    const helpers = this.helpers;
    const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
    if (!state || !spawn) return null;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos) return null;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.alive !== false && e.data && e.data.smugglerCache === true) return null;
    }
    // Landmark: a real pocket rock near the player's route — the catalog's "distinctive rock
    // marker away from lanes". Nearest qualifying asteroid inside the band wins; with no rock
    // in reach the drop still happens on a hashed bearing off the player's route (the
    // landmark is the story cue, not a hard gate — the catalog's interruption is the scan).
    let landmark = null;
    let landmarkDist = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d >= SMUGGLER_CACHE_LANDMARK_MIN_WU && d <= SMUGGLER_CACHE_LANDMARK_MAX_WU
        && d < landmarkDist) {
        landmark = e;
        landmarkDist = d;
      }
    }
    const bearing = this._rng() * Math.PI * 2;
    const anchor = landmark
      ? landmark.pos
      : {
          x: player.pos.x + Math.cos(bearing) * SMUGGLER_CACHE_LANDMARK_MIN_WU,
          z: player.pos.z + Math.sin(bearing) * SMUGGLER_CACHE_LANDMARK_MIN_WU,
        };
    const offBearing = this._rng() * Math.PI * 2;
    const offDist = SMUGGLER_CACHE_OFFSET_LO_WU
      + this._rng() * (SMUGGLER_CACHE_OFFSET_HI_WU - SMUGGLER_CACHE_OFFSET_LO_WU);
    const drift = this._rng() * SMUGGLER_CACHE_DRIFT_WU_S;
    const amount = SMUGGLER_CACHE_AMOUNT_LO
      + Math.floor(this._rng() * (SMUGGLER_CACHE_AMOUNT_HI - SMUGGLER_CACHE_AMOUNT_LO + 1));
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const entity = spawn({
      type: 'pickup',
      pos: {
        x: anchor.x + Math.cos(offBearing) * offDist,
        z: anchor.z + Math.sin(offBearing) * offDist,
      },
      vel: { x: Math.cos(offBearing) * drift, z: Math.sin(offBearing) * drift },
      radius: 2.4, mass: 0.4, collides: true,
      homeSectorId: sectorId,
      data: {
        kind: 'cargo', commodityId: 'cmdty_stolen_goods', amount,
        legality: 'contraband',
        despawnAt: now + SMUGGLER_CACHE_TTL_S,
        smugglerCache: true,
        unlitDrop: true,
      },
    });
    if (entity) {
      this._smugglerCache = {
        cacheId: typeof entity === 'object' ? entity.id : entity,
        sectorId,
        bornAt: now,
      };
    }
    return entity || null;
  },

  /**
   * ev_debris_stream_crossing cadence: one rake per roll on a persisted clock (the same
   * saved-bag pattern as the meteor pass). The live-stream record is instance-local — a
   * restored stream re-derives the "one at a time" guard through the live-entity scan in
   * _spawnPocketDebrisStream.
   */
  _stepPocketDebrisStream(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const stream = this._debrisStream;
    if (stream) {
      let anyAlive = false;
      const byId = state.entities && typeof state.entities.get === 'function' ? state.entities : null;
      if (byId) {
        for (let i = 0; i < stream.rockIds.length; i++) {
          const rock = byId.get(stream.rockIds[i]);
          if (rock && rock.alive !== false) { anyAlive = true; break; }
        }
      }
      if (!anyAlive) this._debrisStream = null;
    }
    if (!Number.isFinite(bag.nextDebrisStreamAt)) {
      bag.nextDebrisStreamAt = now + this._debrisStreamIntervalS();
      return;
    }
    if (now < bag.nextDebrisStreamAt) return;
    bag.nextDebrisStreamAt = now + this._debrisStreamIntervalS();
    if (this._debrisStream) return;
    this._spawnPocketDebrisStream(state);
  },

  _debrisStreamIntervalS() {
    return DEBRIS_STREAM_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The catalog's arrangement: 8-10 small rocks on parallel vectors crossing the corridor
   * diagonally — a rake, not a cloud. Every rock is a real collidable dynamic body on the
   * shared ballistic heading (heading jitter ≤ ~4° keeps the ribbon parallel, spacing across
   * the perpendicular band keeps it a ribbon), fast enough that contact is a strike rather
   * than a nudge. The crossing chord aims across the player's own route inside the miss
   * band, so the rake arrives where the player is looking. Mining a fast rock on the way
   * through is the authored counter-play; the despawn sweep owns every exit.
   */
  _spawnPocketDebrisStream(state) {
    const helpers = this.helpers;
    const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
    if (!state || !spawn) return null;
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos) return null;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.alive !== false && e.data && e.data.debrisStream === true) return null;
    }
    const bearing = this._rng() * Math.PI * 2;
    const miss = (this._rng() - 0.5) * 2 * DEBRIS_STREAM_MISS_MAX_WU;
    const baseSpeed = DEBRIS_STREAM_SPEED_LO_WU_S
      + this._rng() * (DEBRIS_STREAM_SPEED_HI_WU_S - DEBRIS_STREAM_SPEED_LO_WU_S);
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const pieces = DEBRIS_STREAM_PIECES_LO
      + Math.floor(this._rng() * (DEBRIS_STREAM_PIECES_HI - DEBRIS_STREAM_PIECES_LO + 1));
    const travelS = (DEBRIS_STREAM_SPAWN_RADIUS_WU * 2) / baseSpeed;
    const despawnAt = now + travelS + DEBRIS_STREAM_EXIT_PAD_S;
    const dirX = Math.cos(bearing);
    const dirZ = Math.sin(bearing);
    const centerX = player.pos.x - dirX * DEBRIS_STREAM_SPAWN_RADIUS_WU - dirZ * miss;
    const centerZ = player.pos.z - dirZ * DEBRIS_STREAM_SPAWN_RADIUS_WU + dirX * miss;
    const rockIds = [];
    for (let i = 0; i < pieces; i++) {
      const across = (this._rng() - 0.5) * 2 * DEBRIS_STREAM_RIBBON_WU;
      const along = (this._rng() - 0.5) * 2 * DEBRIS_STREAM_RIBBON_WU;
      const heading = bearing + (this._rng() - 0.5) * 2 * DEBRIS_STREAM_HEADING_JITTER_RAD;
      const speed = baseSpeed * (0.92 + this._rng() * 0.16);
      const radius = DEBRIS_STREAM_RADIUS_LO_WU
        + this._rng() * (DEBRIS_STREAM_RADIUS_HI_WU - DEBRIS_STREAM_RADIUS_LO_WU);
      const oreHP = Math.round(radius * 8);
      const yieldU = Math.max(2, Math.round(radius * 0.5));
      const entity = spawn({
        type: 'asteroid',
        pos: {
          x: centerX - dirZ * across + dirX * along,
          z: centerZ + dirX * across + dirZ * along,
        },
        vel: { x: Math.cos(heading) * speed, z: Math.sin(heading) * speed },
        rot: this._rng() * Math.PI * 2,
        angVel: (this._rng() - 0.5) * 0.8,
        radius,
        mass: Math.max(1, Math.round(radius * radius * radius * 0.25)),
        physicsBody: {
          radius: asteroidColliderRadius(DEBRIS_STREAM_TYPE_ID, radius),
          dynamic: true,
        },
        hull: oreHP,
        hullMax: oreHP,
        collides: true,
        homeSectorId: sectorId,
        data: {
          typeId: DEBRIS_STREAM_TYPE_ID,
          tier: 0,
          tierCap: 0,
          oreHP,
          oreHPMax: oreHP,
          yieldU,
          size: radius,
          debrisStream: true,
          despawnAt,
        },
      });
      if (entity) rockIds.push(typeof entity === 'object' ? entity.id : entity);
    }
    if (rockIds.length) {
      this._debrisStream = {
        rockIds,
        sectorId,
        bornAt: now,
      };
    }
    return rockIds.length ? rockIds : null;
  },

  /**
   * CR-CHAIN hitch cadence: one shed per roll on a persisted clock. The pod is real owned
   * freight (spawnJettisonedCargoPod caps and persists it); the live record only suppresses
   * a second shed while the last hitch is still loose in the pocket.
   */
  _stepHitchShed(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const shed = this._hitchShed;
    if (shed) {
      const e = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(shed.podId) : null;
      if (!e || e.alive === false) this._hitchShed = null;
    }
    if (!Number.isFinite(bag.nextHitchShedAt)) {
      bag.nextHitchShedAt = now + this._hitchShedIntervalS();
      return;
    }
    if (now < bag.nextHitchShedAt) return;
    bag.nextHitchShedAt = now + this._hitchShedIntervalS();
    if (this._hitchShed) return;
    this._shedHaulerHitch(state);
  },

  _hitchShedIntervalS() {
    return HITCH_SHED_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The braid: pick a loaded hauler actually under way (job-bound, above the drift line,
   * carrying manifest lines) and let one piece of its own freight slip off the stern. The
   * pod spawns behind the hull on the hauler's own velocity minus a small back-off, so it
   * drops straight back into the lane it came from. Owner stamps make it that truck's
   * cargo — stealing it is the ordinary owned-cargo answer, not a free find.
   */
  _shedHaulerHitch(state) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const list = state && state.traffic && state.traffic.freighters;
    const byId = state && state.entities && typeof state.entities.get === 'function' ? state.entities : null;
    if (!Array.isArray(list) || !list.length || !byId) return null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const start = Math.floor(this._rng() * list.length);
    for (let i = 0; i < list.length; i++) {
      const rec = list[(start + i) % list.length];
      const hauler = rec && byId.get(rec.id);
      if (!hauler || hauler.alive === false || !hauler.pos || !hauler.vel) continue;
      if (!hauler.data || !hauler.data.jobId) continue;
      const manifest = hauler.data.cargoManifest;
      const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : null;
      if (!lines || !lines.length) continue;
      const speed = Math.hypot(hauler.vel.x || 0, hauler.vel.z || 0);
      if (speed < HITCH_SHED_MIN_SPEED_WU_S) continue;
      const line = lines[0];
      const commodityId = line && line.commodityId;
      if (typeof commodityId !== 'string' || !commodityId) continue;
      const amount = HITCH_SHED_AMOUNT_LO
        + Math.floor(this._rng() * (HITCH_SHED_AMOUNT_HI - HITCH_SHED_AMOUNT_LO + 1));
      const backX = -hauler.vel.x / speed;
      const backZ = -hauler.vel.z / speed;
      const stern = (hauler.radius || 10) + HITCH_SHED_BACK_OFF_WU;
      const pod = spawnJettisonedCargoPod(state, {
        commodityId,
        amount,
        pos: { x: hauler.pos.x + backX * stern, z: hauler.pos.z + backZ * stern },
        vel: {
          x: hauler.vel.x + backX * HITCH_SHED_BACK_VEL_WU_S,
          z: hauler.vel.z + backZ * HITCH_SHED_BACK_VEL_WU_S,
        },
        ownerId: hauler.id,
        ownerName: hauler.name || hauler.data.name || null,
        originId: hauler.data.originStationId || null,
        destinationId: hauler.data.destStationId || null,
        factionId: hauler.factionId || 'faction_free',
      }, this.helpers);
      if (!pod) return null;
      pod.data = pod.data || {};
      pod.data.hitchShed = true;
      pod.data.shedFromJobId = hauler.data.jobId;
      pod.homeSectorId = pod.homeSectorId || sectorId;
      this._hitchShed = { podId: pod.id, haulerId: hauler.id, sectorId, bornAt: now };
      return pod;
    }
    return null;
  },

  /**
   * Volatile-slough cadence: one pressurized pod per roll on a persisted clock, and only
   * while the last one is not still loose in the pocket. Rarer than the freight hitch —
   * this is a hazard read, not a cargo beat.
   */
  _stepVolatileSlough(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const slough = this._volatileSlough;
    if (slough) {
      const e = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(slough.podId) : null;
      if (!e || e.alive === false) this._volatileSlough = null;
    }
    if (!Number.isFinite(bag.nextVolatileSloughAt)) {
      bag.nextVolatileSloughAt = now + this._volatileSloughIntervalS();
      return;
    }
    if (now < bag.nextVolatileSloughAt) return;
    bag.nextVolatileSloughAt = now + this._volatileSloughIntervalS();
    if (this._volatileSlough) return;
    this._sloughVolatilePod(state);
  },

  _volatileSloughIntervalS() {
    return VOLATILE_SLOUGH_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The moving mine: pick a volatiles tanker actually under way and let one pod of its own
   * volatile manifest line slip the stern. Prefers the tanker's biggest volatile lot (the
   * dominant lot is what the pod mostly IS); a tanker with no volatile line sheds nothing.
   */
  _sloughVolatilePod(state) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const list = state && state.traffic && state.traffic.freighters;
    const byId = state && state.entities && typeof state.entities.get === 'function' ? state.entities : null;
    if (!Array.isArray(list) || !list.length || !byId) return null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const start = Math.floor(this._rng() * list.length);
    for (let i = 0; i < list.length; i++) {
      const rec = list[(start + i) % list.length];
      if (!rec || rec.role !== 'tanker') continue;
      const tanker = byId.get(rec.id);
      if (!tanker || tanker.alive === false || !tanker.pos || !tanker.vel) continue;
      if (!tanker.data || !tanker.data.jobId) continue;
      const manifest = tanker.data.cargoManifest;
      const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : null;
      if (!lines || !lines.length) continue;
      const speed = Math.hypot(tanker.vel.x || 0, tanker.vel.z || 0);
      if (speed < VOLATILE_SLOUGH_MIN_SPEED_WU_S) continue;
      let volatileLine = null;
      let volatileQty = 0;
      for (const line of lines) {
        const qty = Math.max(0, Math.floor(Number(line && line.qty) || 0));
        if (qty > volatileQty && typeof volatileClassOf === 'function'
            && volatileClassOf(line && line.commodityId)) {
          volatileLine = line;
          volatileQty = qty;
        }
      }
      if (!volatileLine) continue;
      const backX = -tanker.vel.x / speed;
      const backZ = -tanker.vel.z / speed;
      const stern = (tanker.radius || 10) + VOLATILE_SLOUGH_BACK_OFF_WU;
      const pod = spawnJettisonedCargoPod(state, {
        commodityId: volatileLine.commodityId,
        amount: VOLATILE_SLOUGH_AMOUNT,
        pos: { x: tanker.pos.x + backX * stern, z: tanker.pos.z + backZ * stern },
        vel: {
          x: tanker.vel.x + backX * VOLATILE_SLOUGH_BACK_VEL_WU_S,
          z: tanker.vel.z + backZ * VOLATILE_SLOUGH_BACK_VEL_WU_S,
        },
        ownerId: tanker.id,
        ownerName: tanker.name || tanker.data.name || null,
        originId: tanker.data.originStationId || null,
        destinationId: tanker.data.destStationId || null,
        factionId: tanker.factionId || 'faction_free',
      }, this.helpers);
      if (!pod) return null;
      pod.data = pod.data || {};
      pod.data.volatileSlough = true;
      pod.data.shedFromJobId = tanker.data.jobId;
      pod.homeSectorId = pod.homeSectorId || sectorId;
      this._volatileSlough = { podId: pod.id, tankerId: tanker.id, sectorId, bornAt: now };
      return pod;
    }
    return null;
  },

  /**
   * CR-FEED cadence + the chew. One live feed chunk at a time on a persisted clock. While
   * a chunk is live the stepper also owns its last metres: it holds at the mouth rim
   * through warning/calm and bursts on the machine's own surge tick, so the bite the
   * player watches is the machine's authored rhythm, not the feed's arrival.
   */
  _stepBreakerFeed(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const feed = this._breakerFeed;
    if (feed) {
      const e = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(feed.chunkId) : null;
      if (!e || e.alive === false) this._breakerFeed = null;
      else this._driveBreakerFeed(e, feed, now, state);
    }
    if (!Number.isFinite(bag.nextBreakerFeedAt)) {
      bag.nextBreakerFeedAt = now + this._breakerFeedIntervalS();
      return;
    }
    if (now < bag.nextBreakerFeedAt) return;
    bag.nextBreakerFeedAt = now + this._breakerFeedIntervalS();
    if (this._breakerFeed) return;
    this._spawnBreakerFeed(state);
  },

  _breakerFeedIntervalS() {
    return BREAKER_FEED_MEAN_INTERVAL_S * (0.6 + this._rng() * 0.8);
  },

  /**
   * The feed: one small metallic scrap chunk enters the machine's own intake volume — the
   * field's real force can take it from there — on a drift aimed at the mouth. Minable
   * and bumpable on the way in: the player who steals the feed steals the chew.
   */
  _spawnBreakerFeed(state) {
    const helpers = this.helpers;
    const spawn = helpers && typeof helpers.spawnEntity === 'function' ? helpers.spawnEntity : null;
    if (!state || !spawn) return null;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const machines = sectorId && typeof killMachinesForSector === 'function'
      ? killMachinesForSector(sectorId) : null;
    if (!machines || !machines.length) return null;
    const candidates = [];
    for (const machine of machines) {
      if (machine && machine.mouth && machine.globalPos
          && Array.isArray(machine.fields) && machine.fields.length) candidates.push(machine);
    }
    if (!candidates.length) return null;
    const machine = candidates[Math.floor(this._rng() * candidates.length)];
    const field = machine.fields[0];
    const center = killMachineFieldCenter(machine, field);
    const dir = killMachineFieldDir(machine, field);
    // Half-way down the cone, off-axis a touch — inside the intake, not already at the rim.
    const along = (field.radius || 60) * (0.35 + this._rng() * 0.3);
    const across = (this._rng() - 0.5) * (field.halfWidth || field.radius || 60) * 0.5;
    const spawnX = center.x + dir.x * along + -dir.z * across;
    const spawnZ = center.z + dir.z * along + dir.x * across;
    const mx = machine.globalPos.x - spawnX;
    const mz = machine.globalPos.z - spawnZ;
    const mDist = Math.hypot(mx, mz) || 1;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const radius = BREAKER_FEED_CHUNK_RADIUS_LO_WU
      + this._rng() * (BREAKER_FEED_CHUNK_RADIUS_HI_WU - BREAKER_FEED_CHUNK_RADIUS_LO_WU);
    const oreHP = Math.round(radius * 8);
    const yieldU = Math.max(2, Math.round(radius * 0.5));
    const chunk = spawn({
      type: 'asteroid',
      pos: { x: spawnX, z: spawnZ },
      vel: { x: (mx / mDist) * BREAKER_FEED_DRIFT_WU_S, z: (mz / mDist) * BREAKER_FEED_DRIFT_WU_S },
      rot: this._rng() * Math.PI * 2,
      angVel: (this._rng() - 0.5) * 0.6,
      radius,
      mass: Math.max(1, Math.round(radius * radius * radius * 0.25)),
      physicsBody: {
        radius: asteroidColliderRadius(BREAKER_FEED_TYPE_ID, radius),
        dynamic: true,
      },
      hull: oreHP,
      hullMax: oreHP,
      collides: true,
      homeSectorId: sectorId,
      data: {
        typeId: BREAKER_FEED_TYPE_ID,
        tier: 0,
        tierCap: 0,
        oreHP,
        oreHPMax: oreHP,
        yieldU,
        breakerFeed: true,
        breakerMachineId: machine.id,
        despawnAt: now + BREAKER_FEED_TTL_S,
      },
    });
    if (!chunk) return null;
    this._breakerFeed = {
      chunkId: typeof chunk === 'object' ? chunk.id : chunk,
      machineId: machine.id,
      sectorId,
      bornAt: now,
    };
    return chunk;
  },

  /**
   * The last metres. Inside the rim distance the chunk waits for the bite — the machine's
   * own surge is the chew, so a feed that arrives during calm sits in the jaws until the
   * cycle comes round. On surge: the chunk is gone and a few ore pickups spit back out of
   * the mouth — the product, collectable through the ordinary pickup pipeline.
   */
  _driveBreakerFeed(chunk, feed, now, state) {
    const sectorId = (state.world && state.world.currentSectorId) || null;
    if (sectorId !== feed.sectorId || !chunk.pos) { this._breakerFeed = null; return; }
    const machines = typeof killMachinesForSector === 'function' ? killMachinesForSector(sectorId) : [];
    let machine = null;
    for (const m of machines) { if (m && m.id === feed.machineId) { machine = m; break; } }
    if (!machine || !machine.mouth || !machine.globalPos) { this._breakerFeed = null; return; }
    const rim = (machine.mouth.radius || 18) + (chunk.radius || 6) + BREAKER_FEED_RIM_PAD_WU;
    const dx = machine.globalPos.x - chunk.pos.x;
    const dz = machine.globalPos.z - chunk.pos.z;
    if (Math.hypot(dx, dz) > rim) return;
    const phase = typeof killMachinePhase === 'function' ? killMachinePhase(machine, now) : null;
    if (!phase || phase.phase !== 'surge') {
      // Waiting in the jaws: hold at the rim — the field still shoves, the drift is spent.
      if (chunk.vel) { chunk.vel.x = 0; chunk.vel.z = 0; }
      return;
    }
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(chunk.id);
    } else {
      chunk.alive = false;
    }
    this._breakerFeed = null;
    this._spitBreakerProducts(machine, now, state);
  },

  _spitBreakerProducts(machine, now, state) {
    const spawn = this.helpers && typeof this.helpers.spawnEntity === 'function'
      ? this.helpers.spawnEntity : null;
    if (!spawn) return;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const count = BREAKER_FEED_PRODUCTS_LO
      + Math.floor(this._rng() * (BREAKER_FEED_PRODUCTS_HI - BREAKER_FEED_PRODUCTS_LO + 1));
    // The chew product blows back out the intake side — toward the field that fed it.
    const field = machine.fields && machine.fields[0];
    let outDir = machine.dir || { x: 1, z: 0 };
    if (field) {
      const fc = killMachineFieldCenter(machine, field);
      const fx = fc.x - machine.globalPos.x;
      const fz = fc.z - machine.globalPos.z;
      const fl = Math.hypot(fx, fz);
      if (fl > 1e-3) outDir = { x: fx / fl, z: fz / fl };
    }
    const dir = outDir;
    const despawnAt = now + BREAKER_FEED_PRODUCT_TTL_S;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.5 + (this._rng() - 0.5) * 0.3;
      const outX = dir.x * Math.cos(spread) - dir.z * Math.sin(spread);
      const outZ = dir.x * Math.sin(spread) + dir.z * Math.cos(spread);
      const amount = 1 + Math.floor(this._rng() * 3);
      spawn({
        type: 'pickup',
        pos: {
          x: machine.globalPos.x + outX * ((machine.mouth.radius || 18) + 4),
          z: machine.globalPos.z + outZ * ((machine.mouth.radius || 18) + 4),
        },
        vel: { x: outX * BREAKER_FEED_PRODUCT_SPIT_WU_S, z: outZ * BREAKER_FEED_PRODUCT_SPIT_WU_S },
        radius: 2.4, mass: 0.4, collides: true,
        homeSectorId: sectorId,
        data: {
          kind: 'ore', commodityId: 'cmdty_scrap_metal', amount,
          despawnAt,
          breakerProduct: true,
        },
      });
    }
  },

  /**
   * CR-WEIR till: crossing detection + the booth's banking pass. A freighter that was
   * inside the weir last tick and is outside now — still making way, not held — has paid
   * its toll. The till is instance-local bookkeeping over real station-owned pods; the
   * pods themselves are persistent jettisoned cargo (capped), and a restored sector
   * re-derives the inside-set cleanly because it is only a crossing detector.
   */
  _stepWeirTill(dt, state) {
    const bag = state && state.traffic;
    if (!bag) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = (state.world && state.world.currentSectorId) || null;
    const weir = sectorId && typeof customsWeirForSector === 'function'
      ? customsWeirForSector(sectorId) : null;
    if (!weir) {
      if (this._weirInside) this._weirInside.clear();
      if (this._weirTill) this._weirTill.length = 0;
      return;
    }
    if (!this._weirInside) this._weirInside = new Set();
    if (!this._weirTill) this._weirTill = [];
    // The booth banks the pile's tail: a full till's oldest pod is collected.
    while (this._weirTill.length >= WEIR_TILL_MAX_PODS) {
      const oldest = this._weirTill.shift();
      const e = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(oldest) : null;
      if (e && e.alive !== false && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(oldest);
      }
    }
    for (let i = this._weirTill.length - 1; i >= 0; i--) {
      const e = state.entities.get(this._weirTill[i]);
      if (!e || e.alive === false) this._weirTill.splice(i, 1);
    }
    const list = Array.isArray(bag.freighters) ? bag.freighters : [];
    const insideNow = new Set();
    for (const rec of list) {
      const hauler = rec && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(rec.id) : null;
      if (!hauler || hauler.alive === false || !hauler.pos) continue;
      if (!hauler.data || !hauler.data.jobId) continue;
      if (pointInsideCustomsWeir(weir, hauler.pos)) {
        insideNow.add(hauler.id);
        continue;
      }
      if (!this._weirInside.has(hauler.id)) continue;
      const speed = Math.hypot((hauler.vel && hauler.vel.x) || 0, (hauler.vel && hauler.vel.z) || 0);
      if (speed < WEIR_TILL_CROSS_MIN_SPEED_WU_S) continue;
      this._payWeirToll(hauler, weir, now, state, speed);
    }
    this._weirInside = insideNow;
  },

  /**
   * The toll in kind: one pod of the booth's own freight slips off at the crossing point
   * and settles almost still — the till piles where the lane pays. Station-owned: the
   * pod that tempts a passerby answers as station freight taken.
   */
  _payWeirToll(hauler, weir, now, state, speed) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const pod = spawnJettisonedCargoPod(state, {
      commodityId: WEIR_TILL_COMMODITY,
      amount: WEIR_TILL_AMOUNT,
      pos: { x: hauler.pos.x, z: hauler.pos.z },
      vel: {
        x: (hauler.vel ? hauler.vel.x : 0) * WEIR_TILL_DRIFT_SCALE,
        z: (hauler.vel ? hauler.vel.z : 0) * WEIR_TILL_DRIFT_SCALE,
      },
      ownerId: weir.stationId,
      ownerName: weir.stationId,
      pickupEmbargoUntil: now + WEIR_TILL_EMBARGO_S,
      factionId: 'faction_scn',
    }, this.helpers);
    if (!pod) return null;
    pod.data = pod.data || {};
    pod.data.tollPaid = true;
    pod.data.tollWeirId = weir.id;
    pod.data.shedFromJobId = hauler.data.jobId;
    this._weirTill.push(pod.id);
    return pod;
  },

  /**
   * ev_cargo_capsule_launch's launch phase: the refinery's outbound batch as one real pickup on a
   * fixed ballistic leg. The bearing is a hash32 of the event id — the launcher's scheduled lane,
   * identical across seeds and cycles without consuming shared rng. Standard pickup pipeline: the
   * collecting player owns the cargo write, exactly like the cutter spill; the TTL bounds the exit
   * leg so the lane never accumulates capsules. No launch face resolvable → the link completes as
   * the catalog's fallback (the stage beat played; nothing left the face).
   */
  _launchCeresCargoCapsule(live) {
    if (!live || live.capsuleLaunched) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const station = this._ceresCausalRefineryStation();
    if (!station) return;
    const bearing = (hash32('ev_cargo_capsule_launch', 0, 'capsule-leg') % 6284) / 1000;
    const launchDist = (station.radius || 30) + CERES_CAPSULE_LAUNCH_CLEARANCE_WU;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: {
        x: station.pos.x + Math.cos(bearing) * launchDist,
        z: station.pos.z + Math.sin(bearing) * launchDist,
      },
      vel: {
        x: Math.cos(bearing) * CERES_CAPSULE_COAST_SPEED_WU_S,
        z: Math.sin(bearing) * CERES_CAPSULE_COAST_SPEED_WU_S,
      },
      radius: 2.4, mass: 0.6, collides: true,
      data: {
        kind: 'ore',
        commodityId: 'cmdty_refined_metals',
        amount: CERES_CAPSULE_BATCH_U,
        name: 'Refinery Outbound Capsule',
        despawnAt: now + CERES_CAPSULE_TTL_S,
        ceresCapsuleSource: 'ev_cargo_capsule_launch',
      },
    });
    if (entity) live.capsuleLaunched = true;
  },

  /**
   * The catalog's drop geometry: three points at 40 wu spacing centered on the surveyor's authored
   * wedge — the same line its job patrols, so the probes always read as a line. The segment is
   * oriented so the LAST index lands at the end nearer the seam face the strike opens ("a later
   * rich-seam event can seed AT the line's far end") — proximity, not mark order, decides which
   * end is far. Derived from the live cast marks so a retuned wedge retunes the line; null when
   * the marks cannot resolve (the caller then drops at the mover's live position instead).
   */
  _ceresProbeLinePoint(dropIndex) {
    const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(CERES_SEAM_SURVEYOR_SLOT_ID);
    const marks = entry && entry.slot && entry.slot.route && entry.slot.route.marks;
    const anchor = entry && entry.pocket && entry.pocket.activityAnchor
      && entry.pocket.activityAnchor.localPos;
    if (!Array.isArray(marks) || marks.length < 2
      || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) return null;
    const ends = [];
    for (const mark of marks.slice(0, 2)) {
      if (!mark || !mark.offset
        || !Number.isFinite(mark.offset.x) || !Number.isFinite(mark.offset.z)) return null;
      const pos = sectorLocalToGlobalForSector({
        x: anchor.x + mark.offset.x,
        z: anchor.z + mark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
      ends.push(pos);
    }
    // The catalog's "far end" is the end toward the seam face the strike opens — orient the
    // segment by proximity to the miner's ore-face mark so a wedge-mark reorder cannot silently
    // point the line at the wrong end.
    const seamEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(CERES_SEAM_MINER_SLOT_ID);
    const seamAnchor = seamEntry && seamEntry.pocket && seamEntry.pocket.activityAnchor
      && seamEntry.pocket.activityAnchor.localPos;
    const seamMarks = seamEntry && seamEntry.slot && seamEntry.slot.route
      && seamEntry.slot.route.marks;
    const seamMark = Array.isArray(seamMarks) && seamMarks.find((mark) => mark
      && typeof mark.targetRef === 'string'
      && mark.targetRef.indexOf(CERES_RICH_SEAM_OBJECT_SLOT_ID) >= 0);
    if (seamMark && seamMark.offset
      && Number.isFinite(seamMark.offset.x) && Number.isFinite(seamMark.offset.z)
      && seamAnchor && Number.isFinite(seamAnchor.x) && Number.isFinite(seamAnchor.z)) {
      const seamPos = sectorLocalToGlobalForSector({
        x: seamAnchor.x + seamMark.offset.x,
        z: seamAnchor.z + seamMark.offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (seamPos && Number.isFinite(seamPos.x) && Number.isFinite(seamPos.z)) {
        const d0 = Math.hypot(ends[0].x - seamPos.x, ends[0].z - seamPos.z);
        const d1 = Math.hypot(ends[1].x - seamPos.x, ends[1].z - seamPos.z);
        if (d0 < d1) ends.reverse();
      }
    }
    const dx = ends[1].x - ends[0].x;
    const dz = ends[1].z - ends[0].z;
    const len = Math.hypot(dx, dz);
    if (!(len > 0)) return null;
    const along = Math.min(len * 0.95, Math.max(len * 0.05,
      len / 2 + (dropIndex - 1) * CERES_PROBE_SPACING_WU));
    return { x: ends[0].x + (dx / len) * along, z: ends[0].z + (dz / len) * along };
  },

  /**
   * ev_surveyor_probe_line's drop phases: one real probe pickup plants at its authored point on
   * the sweep line and stays — the catalog's "green pin lamp at rest" (the shared pickup render
   * already pulses each drop lazily). Standard pickup pipeline: the collecting player owns the
   * cargo write (a stolen probe pays 1u electronics), exactly like the cutter spill and the
   * outbound capsule; nothing mints cargo onto a hull. Idempotent per drop index — seedAtPhase
   * re-fires the close phase's effects on the same tick.
   */
  _dropCeresSurveyProbe(live, dropIndex) {
    if (!live || !Number.isInteger(dropIndex) || dropIndex < 0 || dropIndex >= CERES_PROBE_DROP_COUNT) return;
    if (!Array.isArray(live.probeDrops)) live.probeDrops = [];
    if (live.probeDrops.includes(dropIndex)) return;
    if (live.probeDrops.length >= CERES_PROBE_DROP_COUNT) return;
    const bound = this._ceresCausalActorBySlot(CERES_SEAM_SURVEYOR_SLOT_ID);
    if (!bound || !bound.entity || !bound.entity.pos) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const pos = this._ceresProbeLinePoint(dropIndex)
      || { x: bound.entity.pos.x, z: bound.entity.pos.z };
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 2.0, mass: 0.4, collides: true,
      // Residency owns the line — it despawns with the pocket instead of double-planting on
      // sector re-entry inside the TTL.
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      data: {
        kind: 'ore', commodityId: 'cmdty_electronics', amount: 1,
        name: 'Survey Probe',
        despawnAt: now + CERES_PROBE_TTL_S,
        // The line is player-reserved: NPC hulls (the surveyor retraces this wedge, and any ship
        // crossing the pocket) pass through without silently consuming the world objects.
        playerCollectOnly: true,
        homeSectorId: CERES_ACTIVITY_SECTOR_ID,
        ceresProbeSource: 'ev_surveyor_probe_line',
        ceresProbeIndex: dropIndex,
      },
    });
    if (entity) live.probeDrops.push(dropIndex);
  },

  /**
   * ev_pod_breaks_clamp's drift phase: the sheared pod as one real pickup on a slow tumble out
   * of the refinery's cargo face. The drift bearing is hash-seeded per cycle — every cycle's
   * clamp fails the same way but never on the same leg, and shared rng stays untouched. Same
   * pickup pipeline as the capsule/spill/probes: player-reserved (near traffic does the math
   * and dodges; nobody pockets station cargo), the collecting player owns the cargo write, and
   * the TTL bounds the loose-pod window so the stack never fills the pocket with prizes.
   * No resolvable face → the link completes as the strobe-blinks-wrong minute (nothing left).
   */
  _shearCeresClampPod(live) {
    if (!live || live.clampPodSheared) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const station = this._ceresCausalRefineryStation();
    if (!station) return;
    const cycle = this._ceresCausal && this._ceresCausal.cycle | 0;
    const bearing = (hash32('ev_pod_breaks_clamp', cycle, 'clamp-pod-drift') % 6284) / 1000;
    const launchDist = (station.radius || 30) + CERES_CLAMP_POD_CLEARANCE_WU;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: {
        x: station.pos.x + Math.cos(bearing) * launchDist,
        z: station.pos.z + Math.sin(bearing) * launchDist,
      },
      vel: {
        x: Math.cos(bearing) * CERES_CLAMP_POD_DRIFT_WU_S,
        z: Math.sin(bearing) * CERES_CLAMP_POD_DRIFT_WU_S,
      },
      radius: 3.2, mass: 30, collides: true,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      data: {
        kind: 'cargo',
        commodityId: 'cmdty_refined_metals',
        amount: CERES_CLAMP_POD_U,
        name: 'Loose Refinery Pod',
        despawnAt: now + CERES_CLAMP_POD_TTL_S,
        playerCollectOnly: true,
        homeSectorId: CERES_ACTIVITY_SECTOR_ID,
        lotSource: {
          lotId: `ceres:clamp-pod:${cycle}`,
          provenanceId: 'station_ceres',
          sourceKind: 'station_clamp_break',
          sourceOwner: 'station',
        },
        ceresClampPod: {
          schema: CERES_CAUSAL_CHAIN_SCHEMA,
          eventId: live.eventId,
          cycle,
          podStableId: `ceres-clamp-pod:${cycle}`,
        },
      },
    });
    if (entity) live.clampPodSheared = true;
  },

  /**
   * The witness half of the escape: pocketing a Loose Refinery Pod files one payload_theft with
   * the station's law — same kind as the disabled-hauler steal, latched on the pickup's own
   * marker so a repeat collect cannot double-file a pod that is already gone.
   */
  _onCeresClampPodPickup(payload) {
    if (!payload || payload.collectorId !== this.state.playerId || payload.pickupId == null) return false;
    const pickup = this.state.entities && this.state.entities.get && this.state.entities.get(payload.pickupId);
    const marker = pickup && pickup.data && pickup.data.ceresClampPod;
    if (!marker || marker.schema !== CERES_CAUSAL_CHAIN_SCHEMA || marker.theftFiled === true) return false;
    const law = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('lawSecurity') : null;
    if (!law || typeof law.reportIncident !== 'function') return null;
    const receipt = law.reportIncident({
      reportId: `ev_pod_breaks_clamp:law:${marker.cycle | 0}`,
      kind: CERES_DISABLED_HAULER_LAW_KIND,
      offenderStableId: CERES_DISABLED_HAULER_OFFENDER_STABLE_ID,
      offenderEntityId: this.state.playerId,
      payloadStableId: marker.podStableId,
      causalTick: Math.max(0, this.state.tick | 0),
      pos: { x: pickup.pos.x, z: pickup.pos.z },
    });
    if (receipt && receipt.accepted === true) marker.theftFiled = true;
    return receipt;
  },

  _restoreCeresCausalJobs(live) {
    if (!live || !Array.isArray(live.redirectedSlots) || !live.redirectedSlots.length) return;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    for (let i = 0; i < live.redirectedSlots.length; i++) {
      const redirected = live.redirectedSlots[i];
      const slotId = typeof redirected === 'string' ? redirected : redirected && redirected.slotId;
      const entry = this._causalCastEntry(slotId);
      if (!entry || entry.service) continue;
      const bound = this._ceresCausalActorBySlot(slotId);
      if (!bound || !bound.entity) continue;
      const entity = bound.entity;
      if (redirected.tethysEntity) {
        const original = this._tethysShipmentActor(slotId);
        const current = this.helpers?.npcJobs?.get?.(entity.data?.jobId);
        if (original?.entity !== redirected.tethysEntity || current !== redirected.tethysAssignedEntry
          || current?.control || current?.job?.phase === 'flee') continue;
      }
      const assignedJobId = redirected && typeof redirected === 'object' && redirected.assignedJobId
        ? redirected.assignedJobId
        : entity.data && entity.data.jobId;
      if (typeof release === 'function' && assignedJobId) release(assignedJobId);
      if (redirected.tethysEntity && (this._tethysShipmentActor(slotId)?.entity !== entity
        || entity.data?.jobId || this.helpers?.npcJobs?.get?.(assignedJobId))) continue;
      if (entity.data) {
        const priorJobId = redirected && typeof redirected === 'object' ? redirected.priorJobId : null;
        const priorJobEntry = redirected && typeof redirected === 'object' ? redirected.priorJobEntry : null;
        const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
        if (priorJobId && priorJobEntry && byId && typeof byId === 'object') byId[priorJobId] = priorJobEntry;
        entity.data.jobId = priorJobId || null;
      }
    }
    live.redirectedSlots = null;
  },

  _applyCeresCausalPhaseEffects(def, live, phaseName) {
    if (!def || !live) return;
    // Choreography-only for every link except four authored exceptions: the surveyor's drop
    // phases plant real probe pickups on its sweep line (see _dropCeresSurveyProbe), the salvor's
    // stack phase spills its cutting count as real pickups at the wreck (catalog: "scrap pickups
    // persist"), the capsule launch puts the refinery's outbound batch on the lane as one real
    // pickup (see _launchCeresCargoCapsule), and the clamp pod's drift phase tumbles one real
    // cargo pod off the refinery face (see _shearCeresClampPod). All ride the standard pickup
    // pipeline — the collecting player owns the cargo write, exactly like the disabled-hauler
    // spill. Tethys instead spends its explicitly authored fresh-hull manifest below.
    const isCeres = this._causalIsCeres();
    if (isCeres && def.id === 'ev_surveyor_probe_line') {
      const phaseDef = (def.phases || []).find((phase) => phase && phase.name === phaseName);
      if (phaseDef && Number.isSafeInteger(phaseDef.probe)) {
        this._dropCeresSurveyProbe(live, phaseDef.probe);
      }
    }
    if (isCeres && def.id === 'ev_cutter_strips_wreck' && phaseName === 'stack') {
      this._spillCeresCutterCount(live);
    }
    if (isCeres && def.id === 'ev_cargo_capsule_launch' && phaseName === 'launch') {
      this._launchCeresCargoCapsule(live);
    }
    if (isCeres && def.id === 'ev_pod_breaks_clamp' && phaseName === 'drift') {
      this._shearCeresClampPod(live);
    }
    if (!isCeres && this._ceresCausal.sectorId === TETHYS_ACTIVITY_SECTOR_ID) {
      if (def.id === 'ev_criminal_handoff' && phaseName === 'swap') {
        this._dropTethysHandoffLoad(live);
      }
      if (def.id === 'ev_smuggler_breaks' && phaseName === 'jettison') {
        this._sprayTethysRunnerJettison(live);
      }
    }
    this._applyCeresCausalJobHints(def, live, phaseName);
    void phaseName;
  },

  _seedCeresCausalEvent(def, live) {
    if (!def || !live || live.seeded || !this._ceresCausal) return;
    if (live.phase !== def.seedAtPhase) return;
    live.seeded = true;
    // Marks the NATURAL seed-at-phase path (vs _completeCeresCausalEvent's anti-softlock forced
    // seed, which fakes seeded on interrupts). The calving's fresh-face re-arm keys on this flag:
    // only a calving that actually reached its calve phase may re-arm the seam window.
    live.phaseSeeded = true;
    this._plantCeresCausalSeeds(def);
    this._openCeresRichSeamOpportunity(live);
    this._applyCeresCausalPhaseEffects(def, live, live.phase);
    this._emitCeresCausalReceipt(live, 'seed', {
      seeded: def.seeds.slice(),
    });
  },

  _completeCeresCausalEvent(live, outcome = 'complete') {
    if (!live || !this._ceresCausal) return;
    const def = this._causalDef(live.eventId);
    // Plant seeds and count toward re-arm on EVERY terminal outcome so an interrupted link degrades
    // the chain rather than killing it (fallback/abort must not soft-lock later requires).
    // Interrupt outcomes prefer interruptSeeds (alternate aftermath story) when authored.
    if (def && !live.seeded) {
      live.seeded = true;
      live.phase = def.seedAtPhase;
      const seeded = this._plantCeresCausalOutcomeSeeds(def, outcome);
      this._openCeresRichSeamOpportunity(live);
      this._emitCeresCausalReceipt(live, 'seed', {
        seeded: Array.isArray(seeded) ? seeded.slice() : [],
        forced: outcome !== 'complete',
      });
    } else if (live.phaseSeeded === true && live.eventId === 'ev_rock_calving') {
      // Single-shot loss edge: if the strike window was still live at the calve seed, the fresh-face
      // open was refused and latched off above. Retry once at completion — the opener is a no-op
      // while any window is live, so this fires only when the prior window has since resolved.
      // A calving interrupted AFTER its calve phase also qualifies: the rock did split.
      this._openCeresRichSeamOpportunity(live);
    }
    this._restoreCeresCausalJobs(live);
    this._stampCeresCausalCue(live, false);
    // Belt-and-suspenders: wipe all stamp keys on participants even if actors are briefly absent.
    if (live.actorSlotIds) {
      for (let i = 0; i < live.actorSlotIds.length; i++) {
        const slotId = live.actorSlotIds[i];
        const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
        if (Array.isArray(freighters)) {
          for (let j = 0; j < freighters.length; j++) {
            const rec = freighters[j];
            if (!rec || rec.activityActorSlotId !== slotId) continue;
            if (Object.prototype.hasOwnProperty.call(rec, 'ceresCausalDisabled')) {
              delete rec.ceresCausalDisabled;
            }
            const entity = this.state.entities && this.state.entities.get(rec.id);
            if (!entity || !entity.data) continue;
            // Two live links can share a hull (the cap allows two). The hull's stamp belongs to
            // the link that stamped it last: finishing the other one must not blank a cue that a
            // still-running link is showing until its next phase edge.
            const stampedBy = entity.data.ceresCausalEventId;
            if (stampedBy && stampedBy !== live.eventId
              && this._ceresCausal.active.some((other) => other !== live && other.eventId === stampedBy)) continue;
            this._wipeCeresCausalDataKeys(entity.data);
          }
        }
      }
    }
    const active = this._ceresCausal.active;
    const idx = active.indexOf(live);
    if (idx >= 0) active.splice(idx, 1);
    if (!this._ceresCausal.completed.includes(live.eventId)) {
      this._ceresCausal.completed.push(live.eventId);
    }
    this._emitCeresCausalReceipt(live, outcome === 'complete' ? 'event_complete' : 'event_interrupt', {
      outcome,
    });
  },

  _advanceCeresCausalLive(live, simTime) {
    if (!live || !this._ceresCausal) return;
    const def = this._causalDef(live.eventId);
    if (!def) {
      this._completeCeresCausalEvent(live, 'abort');
      return;
    }
    if (this._causalIsCeres() && def.id === 'ev_tender_services_miner') {
      const incident = this._activeCeresTenderServiceIncident();
      if (!incident || (live.serviceIncidentId && incident.incidentId !== live.serviceIncidentId)) {
        this._completeCeresCausalEvent(live, 'fallback');
        return;
      }
      this._stepCeresTenderServiceIncident(0);
      if (incident.state === 'succeeded') {
        live.phaseIndex = 3;
        live.phase = 'first_light';
        live.cue = 'blind_cone';
        this._stampCeresCausalCue(live, true);
        this._completeCeresCausalEvent(live, 'complete');
      } else if (incident.state === 'failed') {
        this._completeCeresCausalEvent(live, 'fallback');
      } else {
        const phaseIndex = incident.state === 'impair' ? 0
          : incident.state === 'approach' ? 1
            : incident.state === 'holding' || incident.state === 'repair' ? 2
              : 0;
        const phase = def.phases[phaseIndex];
        if (live.phaseIndex !== phaseIndex) {
          live.phaseIndex = phaseIndex;
          live.phase = phase.name;
          live.cue = phase.cue || null;
          this._stampCeresCausalCue(live, true);
          this._emitCeresCausalReceipt(live, 'phase', { incidentId: incident.incidentId });
        }
      }
      return;
    }
    if (this._causalIsCeres() && def.id === 'ev_disabled_hauler_recovery') {
      const incident = this._activeCeresDisabledHaulerIncident()
        || this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident;
      if (!incident || (live.serviceIncidentId && incident.incidentId !== live.serviceIncidentId)) {
        this._completeCeresCausalEvent(live, 'fallback');
        return;
      }
      this._stepCeresDisabledHaulerIncident(0);
      if (incident.state === 'repaired' || incident.state === 'recovered') {
        this._completeCeresCausalEvent(live, 'complete');
      } else if (CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)) {
        this._completeCeresCausalEvent(live, 'fallback');
      } else {
        const phaseIndex = incident.state === 'impair' || incident.state === 'distress' ? 1
          : incident.state === 'player_recovery' || incident.state === 'responder_approach' ? 2
            : 3;
        const phase = def.phases[phaseIndex];
        if (live.phaseIndex !== phaseIndex) {
          live.phaseIndex = phaseIndex;
          live.phase = phase.name;
          live.cue = phase.cue || null;
          this._stampCeresCausalCue(live, true);
          this._emitCeresCausalReceipt(live, 'phase', { incidentId: incident.incidentId });
        }
      }
      return;
    }
    // Primary-actor death is the catalog interruption path; fall back and free the concurrency slot.
    // Seeds still plant (see _completeCeresCausalEvent) so the chain degrades link-by-link.
    if (!this._ceresCausalRequiredActorsLive(def)) {
      this._completeCeresCausalEvent(live, 'fallback');
      return;
    }
    // One phase step per tick at most (rebase caps multi-step catch-up).
    if (simTime < live.phaseEndsAt) return;
    this._seedCeresCausalEvent(def, live);
    const nextIndex = live.phaseIndex + 1;
    if (nextIndex >= def.phases.length) {
      this._completeCeresCausalEvent(live, 'complete');
      return;
    }
    const next = def.phases[nextIndex];
    live.phaseIndex = nextIndex;
    live.phase = next.name;
    live.cue = next.cue || null;
    live.phaseEndsAt = simTime + next.durationS;
    this._stampCeresCausalCue(live, true);
    this._applyCeresCausalPhaseEffects(def, live, live.phase);
    this._seedCeresCausalEvent(def, live);
    this._emitCeresCausalReceipt(live, 'phase');
  },

  _tryStartNextCeresCausalEvents(simTime) {
    const chain = this._ceresCausal;
    const spec = this._causalSpec();
    if (!chain || !spec) return;
    if (simTime < chain.nextEligibleAt) return;
    while (chain.active.length < spec.maxConcurrent
      && chain.nextIndex < spec.chain.length) {
      const def = spec.chain[chain.nextIndex];
      if (!this._ceresCausalSeedsReady(def.requires)) {
        // Anti-softlock with divergent interrupt seeds: an earlier interrupt may have withheld
        // this link's seed while killing the cast that would have produced it. Terminal cast
        // loss still advances (same plant policy as the live-check skip below).
        //
        // When the salvor branch is already open (aftermath_open) a sequential mid-chain seed
        // will never arrive — skip the superseded link with its interrupt seeds so the cycle
        // still completes. The cutter itself is the aftermath consumer and is not skipped here.
        const supersededByAftermath = chain.seeds
          && chain.seeds.aftermath_open === true
          && def.id !== 'ev_cutter_strips_wreck';
        const successfulService = def.id === 'ev_cutter_strips_wreck'
          && chain.seeds && chain.seeds.miner_serviced === true;
        if (this._ceresCausalRequiredActorsTerminallyGone(def) || supersededByAftermath || successfulService) {
          const seeded = this._plantCeresCausalOutcomeSeeds(def, 'skip_terminal_cast');
          if (!chain.completed.includes(def.id)) chain.completed.push(def.id);
          this._emitCeresCausalReceipt(null, 'event_interrupt', {
            outcome: successfulService
              ? 'skip_service_success'
              : supersededByAftermath && !this._ceresCausalRequiredActorsTerminallyGone(def)
              ? 'skip_superseded'
              : 'skip_terminal_cast',
            eventId: def.id,
            seeded: Array.isArray(seeded) ? seeded.slice() : [],
          });
          chain.nextIndex += 1;
          continue;
        }
        break;
      }
      // Do not start a second copy of a still-active or already-completed event in this cycle.
      if (chain.completed.includes(def.id)
        || chain.active.some((live) => live && live.eventId === def.id)) {
        chain.nextIndex += 1;
        continue;
      }
      if (!this._ceresCausalRequiredActorsLive(def)) {
        // Terminal cast loss: plant seeds and advance so the chain never waits forever on a
        // destroyed hull. Transient single-tick absence keeps waiting (break).
        if (this._ceresCausalRequiredActorsTerminallyGone(def)) {
          const seeded = this._plantCeresCausalOutcomeSeeds(def, 'skip_terminal_cast');
          if (!chain.completed.includes(def.id)) chain.completed.push(def.id);
          this._emitCeresCausalReceipt(null, 'event_interrupt', {
            outcome: 'skip_terminal_cast',
            eventId: def.id,
            seeded: Array.isArray(seeded) ? seeded.slice() : [],
          });
          chain.nextIndex += 1;
          continue;
        }
        break;
      }
      this._startCeresCausalEvent(def, simTime);
      chain.nextIndex += 1;
    }
    if (chain.nextIndex >= spec.chain.length
      && chain.active.length === 0
      && chain.completed.length >= spec.chain.length) {
      // Full cycle resolved with no player input. Gap, then re-arm from the head of the chain.
      // The sector's story rides the flight news channel; each table row authors which cycle
      // outcome decides the line (Ceres: aftermath branch opened = loss story, clean service =
      // clean shift).
      const story = spec.cycleNews(chain);
      if (story && story.text) {
        this.bus.emit('news:publish', {
          text: story.text,
          kind: story.kind,
          sourceRef: story.sourceRef,
          channelId: 'news',
          stationId: story.stationId,
          sectorId: chain.sectorId,
          cycle: (chain.cycle | 0) + 1,
        });
      }
      chain.cycle = (chain.cycle | 0) + 1;
      chain.nextIndex = 0;
      chain.completed = [];
      chain.seeds = Object.create(null);
      chain.nextEligibleAt = simTime + CERES_CAUSAL_CHAIN_CYCLE_GAP_S;
      this._emitCeresCausalReceipt(null, 'cycle_complete', {
        cycle: chain.cycle,
        nextEligibleAt: chain.nextEligibleAt,
      });
    }
  },

  _stepCeresCausalChain(dt) {
    const chain = this._ensureCeresCausalChain('step');
    if (!chain) return;
    // Keep the original runner on its authored local circuit between one-shot hauler jobs.
    // Ceres has its own recurring cast branch; Tethys must not fall into ambient smuggler flight.
    if (chain.sectorId === TETHYS_ACTIVITY_SECTOR_ID) {
      if (this._tethysSavedCastRebindPending && this.state.simTime >= (this._tethysSavedCastRebindAt || 0)) {
        this._tethysSavedCastRebindAt = this.state.simTime + 1;
        this._rebindTethysSavedCast();
      }
      const runner = this._tethysShipmentActor();
      const retained = runner && this.helpers?.npcJobs?.get?.(`job:${runner.worldRecordId}`);
      if (runner && runner.entity.data.trafficRole === 'smuggler'
        && !runner.entity.data.jobId && !retained) this._reaffirmCeresCausalActorJob('tethys_quiet_runner');
    }
    // The miner-to-hauler handoff ledger is Ceres machinery; another sector's chain has none.
    if (this._causalIsCeres()) this._rehydrateCeresCausalHandoffSeeds();
    const simTime = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    // Advance active links first so a finishing seed can admit the next link in the same step.
    if (Array.isArray(chain.active) && chain.active.length) {
      const snapshot = chain.active.slice();
      for (let i = 0; i < snapshot.length; i++) {
        if (chain.active.includes(snapshot[i])) this._advanceCeresCausalLive(snapshot[i], simTime);
        if (chain.sectorId === TETHYS_ACTIVITY_SECTOR_ID && chain.active.includes(snapshot[i])
          && snapshot[i].eventId === 'ev_criminal_handoff' && snapshot[i].phase === 'swap') {
          this._dropTethysHandoffLoad(snapshot[i]);
        }
      }
    }
    this._tryStartNextCeresCausalEvents(simTime);
    // dt is accepted for call-site symmetry with traffic.update; phase ends are absolute simTime.
    void dt;
  },

  /** Test/support seam: return a frozen snapshot of the transient chain ledger. */
  getCeresCausalChainSnapshot() {
    const chain = this._ceresCausal;
    if (!chain) return null;
    return Object.freeze({
      schema: chain.schema,
      sectorId: chain.sectorId,
      cycle: chain.cycle | 0,
      nextIndex: chain.nextIndex | 0,
      activeCount: Array.isArray(chain.active) ? chain.active.length : 0,
      active: Object.freeze((chain.active || []).map((live) => Object.freeze({
        eventId: live.eventId,
        phase: live.phase,
        phaseIndex: live.phaseIndex,
        cue: live.cue,
        phaseEndsAt: live.phaseEndsAt,
        actorSlotIds: Object.freeze((live.actorSlotIds || []).slice()),
        seeded: live.seeded === true,
      }))),
      completed: Object.freeze((chain.completed || []).slice()),
      seeds: Object.freeze({ ...(chain.seeds || {}) }),
      nextEligibleAt: chain.nextEligibleAt,
    });
  },

  _onNpcJobUnload(intent) {
    if (intent?.payload?.claimConvoy) return this._unloadClaimConvoy(intent);
    if (intent?.payload?.claimDepot) return this._unloadClaimDepot(intent);
    const ceresOwned = this._ceresActivityIntentClaimsOwnership(intent);
    const actorContext = this._ceresActivityActorContext(intent);
    if (ceresOwned) {
      const context = this._ceresActivityActionContext(intent, 'unload', actorContext);
      return context ? this._applyCeresActivityAction(context, intent) : false;
    }
    if (!intent || intent.completed !== true) return false;

    // General salvor: present the conserved hold to the economy owner. Traffic never writes a
    // market; it clears custody only after the synchronous intake acknowledgement says the exact
    // lot was accepted (including an idempotent duplicate acknowledgement).
    if (intent.kind === 'salvor') {
      const context = this._jobTrafficContext(intent, 'salvor');
      if (!context || this.helpers?.npcJobs?.get(context.jobId)?.control) return false;
      const destination = typeof intent.destination === 'string' ? intent.destination : '';
      if (!destination.startsWith('yard:') || destination.length <= 5) return false;
      const manifest = context.entity.data && context.entity.data.cargoManifest
        || context.rec.manifest;
      if (!manifest || !Array.isArray(manifest.lines)) return false;
      const yard = this._sectorStations().find(station => stationIdentity(station) === destination.slice(5));
      if (!yard || !this._salvorAtTarget(context.entity, yard,
        Math.max(this._salvorReach(context.entity, yard), yard.data?.dockRadius || 0))) return false;
      if (!(manifest.totalQty > 0)) {
        const job = this.helpers?.npcJobs?.get(context.jobId)?.job;
        if (job?.payload?.sourceUnavailable) this.helpers.npcJobs.release(context.jobId);
        return true;
      }

      const manifestId = typeof manifest.manifestId === 'string' && manifest.manifestId
        ? manifest.manifestId
        : null;
      const lotId = typeof manifest.lotId === 'string' && manifest.lotId
        ? manifest.lotId
        : manifestId;
      const sourceSeq = Number.isSafeInteger(manifest.salvageSeq) && manifest.salvageSeq >= 0
        ? manifest.salvageSeq
        : (Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0);
      const lines = manifest.lines.map((line) => ({
        commodityId: line && line.commodityId,
        qty: line && line.qty,
      }));
      const copiedQty = lines.reduce(
        (sum, line) => sum + (Number.isSafeInteger(line.qty) && line.qty > 0 ? line.qty : 0),
        0,
      );
      if (!manifestId || !lotId || copiedQty !== manifest.totalQty
        || lines.some((line) => typeof line.commodityId !== 'string' || !line.commodityId
          || !Number.isSafeInteger(line.qty) || line.qty <= 0)) return false;
      if (!this.bus || typeof this.bus.emit !== 'function') return false;

      const yardId = destination.slice(5);
      const generation = manifest.salvageIntakeGeneration ?? 0;
      if (!Number.isSafeInteger(generation) || generation < 0 || generation >= Number.MAX_SAFE_INTEGER) return false;
      const payload = {
        intakeId: `salvage-intake:${context.worldRecordId}:${sourceSeq}:${manifestId}${generation ? `:remainder:${generation}` : ''}`,
        jobId: context.jobId,
        salvorId: context.entity.id,
        yardId,
        stationId: yardId,
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        seq: Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0,
        manifestId,
        lotId,
        lines,
      };
      const run = this.state.traffic;
      const offered = JSON.stringify(manifest.lines);
      let committed = false;
      // Non-enumerable: this synchronous owner handshake is not save/event content.
      // Economy calls it before publishing settlement, so even a kill or Continue listener
      // observes the reduced hold, never both accepted stock and its old physical cargo.
      Object.defineProperty(payload, 'commitCustody', { value: (result) => {
        // A listener may Continue, replace the job/hull, or settle this exact lot recursively.
        // Never clear a newer owner or newer load using a stale acknowledgement.
        const current = this._jobTrafficContext(intent, 'salvor');
        if (this.state.traffic !== run || !current || current.entity !== context.entity
          || current.rec !== context.rec || context.entity.alive === false
          || context.entity.data.cargoManifest !== manifest || context.rec.manifest !== manifest
          || manifest.totalQty !== copiedQty || JSON.stringify(manifest.lines) !== offered) return false;
        if (!result || result.ok !== true) return false;
        if (result.intakeId !== payload.intakeId || result.yardId !== yardId
          || result.manifestId !== manifestId || result.lotId !== lotId
          || !Array.isArray(result.acceptedLines) || !result.acceptedLines.length) return false;
        const accepted = new Map();
        for (const line of result.acceptedLines) {
          const available = lines.find(offeredLine => offeredLine.commodityId === line?.commodityId);
          if (!available || accepted.has(line.commodityId) || !Number.isSafeInteger(line.qty)
            || line.qty <= 0 || line.qty > available.qty) return false;
          accepted.set(line.commodityId, line.qty);
        }
        const acceptedQty = [...accepted.values()].reduce((sum, qty) => sum + qty, 0);
        if (acceptedQty !== result.qty) return false;
        const remainder = manifest.lines.map(line => ({ ...line, qty: line.qty - (accepted.get(line.commodityId) || 0) }))
          .filter(line => line.qty > 0);
        const next = remainder.length ? { ...manifest, lines: remainder,
          totalQty: copiedQty - acceptedQty, salvageIntakeGeneration: generation + 1, salvageIntakeHeld: true }
          : this._emptySalvorManifest(context.entity, intent.seq | 0);
        this._setTrafficManifest(context.entity, context.rec, next);
        committed = true;
        return true;
      } });
      this.bus.emit('salvage:npcUnload', payload);
      if (!committed && this.state.traffic === run && context.entity.data.cargoManifest === manifest
        && ['unsupported_salvage_yard', 'salvage_listing_unavailable'].includes(payload.intakeResult?.reason)) {
        manifest.salvageIntakeHeld = true;
      }
      return committed;
    }

    if (intent.kind !== 'hauler' && intent.kind !== 'miner') return false;
    const context = intent.kind === 'miner'
      ? this._jobTrafficContext(intent, 'miner', ['miner', 'ore_carrier'])
      : this._jobTrafficContext(intent, 'hauler', ['hauler', 'courier', 'shuttle', 'tug']);
    if (!context) return false;

    const destination = typeof intent.destination === 'string' ? intent.destination : '';
    if (intent.kind === 'miner' && context.entity.data.minerShiftRockId != null) return false;
    const prefix = intent.kind === 'miner' ? 'home:' : 'dest:';
    if (!destination.startsWith(prefix) || destination.length <= prefix.length) return false;
    const stationId = destination.slice(prefix.length);
    const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === stationId);
    if (!station) return false;

    const priorityItinerary = intent.kind === 'hauler' && context.rec.role === 'courier'
      ? this._priorityCourierItinerary(context.entity)
      : null;
    if (intent.kind === 'hauler' && context.rec.role === 'courier') {
      const marker = intent.payload && intent.payload.priorityCourierService;
      if (!priorityItinerary || !marker || typeof marker !== 'object'
        || marker.schema !== PRIORITY_COURIER_JOB_SCHEMA
        || marker.serviceId !== PRIORITY_COURIER_SERVICE.id
        || marker.legSeq !== priorityItinerary.legSeq
        || stationId !== priorityItinerary.destinationStationId) return false;
    }

    const manifest = intent.kind === 'hauler' && intent.payload && intent.payload.manifest;
    const applied = this._emitArrival(context.entity, context.rec, station, {
      dockSeq: Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : undefined,
      manifest,
    });
    if (applied && priorityItinerary) {
      this._advancePriorityCourierLeg(context.entity, context.rec, this._sectorStations(), priorityItinerary);
    }
    if (applied && intent.kind === 'miner') {
      this._setTrafficManifest(
        context.entity,
        context.rec,
        this._buildMinerManifest(
          context.entity,
          intent.seq,
          null,
          0,
          context.rec.role === 'ore_carrier' ? 'ore_carrier' : 'miner',
        ),
      );
    }
    return applied;
  },

  _onNpcJobHold(intent) {
    if (!this._ceresActivityIntentClaimsOwnership(intent)) return false;
    const actorContext = this._ceresActivityActorContext(intent);
    if (!actorContext) return false;
    const context = this._ceresActivityActionContext(intent, 'hold', actorContext);
    return context ? this._applyCeresActivityAction(context, intent) : false;
  },

  /**
   * Owner-safe loss on freighter kill: scarcity pressure + named news payload.
   * Idempotent per freighterKey. Does not write wallet/cargo/rep/heat.
   */
  _onEntityKilled(p) {
    if (!p || p.id == null) return;
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    let rec = null;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === p.id) { rec = list[i]; idx = i; break; }
    }
    const lostWorldSiteRoute = !!(rec && rec.worldSiteRoute);
    const lostClaimTravelRoute = !!(rec && rec.claimTravelRoute);
    const ent = this.state.entities && this.state.entities.get && this.state.entities.get(p.id);
    const role = (rec && rec.role)
      || (ent && ent.data && ent.data.trafficRole)
      || null;
    const killedWorldRecordId = (ent && ent.data && ent.data.worldRecordId)
      || (rec && rec.worldRecordId)
      || null;
    // The source ledger, not this traffic system, owns the durable claim. Releasing through its
    // helper happens before any future cutter can consider the exact Vesta wreck again.
    const killedSalvageSource = ent && ent.data && typeof ent.data.salvageSource === 'string'
      ? ent.data.salvageSource
      : null;
    if (killedSalvageSource && killedWorldRecordId) {
      this._releaseSalvageSourceClaim({ sourceKey: killedSalvageSource }, killedWorldRecordId);
    }
    const disabledHaulerIncident = this._activeCeresDisabledHaulerIncident();
    if (disabledHaulerIncident
      && disabledHaulerIncident.haulerWorldRecordId === killedWorldRecordId) {
      const pendingAbandonment = disabledHaulerIncident.pendingAbandonmentReason;
      delete disabledHaulerIncident.pendingAbandonmentReason;
      const outcome = disabledHaulerIncident.choice === 'abandon'
        || pendingAbandonment
        ? 'abandoned'
        : 'destroyed';
      this._terminalizeCeresDisabledHauler(disabledHaulerIncident, outcome, 'participant_destroyed');
    }
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (handoff && handoff.minerWorldRecordId === killedWorldRecordId
      && this._preserveCeresHandoffAfterMinerLoss(handoff)) {
      // The miner-held remainder falls through to the ordinary loss owner below. The live hauler's
      // already-transferred fragment remains an independently conserved delivery obligation.
    } else if (handoff && (handoff.minerWorldRecordId === killedWorldRecordId
      || handoff.haulerWorldRecordId === killedWorldRecordId)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed', ent);
    }
    // The service incident owns only its two temporary job-control leases. Death, wreck creation,
    // freight loss, and any durable world outcome remain with their existing owners below; this
    // branch just guarantees neither job remains borrowed after either exact participant dies.
    const serviceIncident = this._activeCeresTenderServiceIncident();
    if (serviceIncident && (serviceIncident.minerWorldRecordId === killedWorldRecordId
      || serviceIncident.tenderWorldRecordId === killedWorldRecordId)) {
      this._failCeresTenderServiceIncident(serviceIncident, 'participant_destroyed');
    }
    // Release any wreck/payload reservation so another cutter (or the player) can take it.
    if (ent && ent.data && ent.data.worldRecordId) {
      const claimId = ent.data.worldRecordId;
      this._releaseShelvedSalvorClaims(claimId);
      forEachJobInteractable(this.state, (body) => {
        if (body.data && body.data.salvorClaimedBy === claimId) {
          this._clearSalvorClaim(body, claimId);
        }
      });
    }
    if (!rec && !(ent && ent.data && ent.data.trafficRole)) return;
    if (p.killerId != null && p.killerId === this.state.playerId) {
      this._markRouteDisrupted(this._leftoverKillStationId(ent, rec), p.id);
    }
    // The civic liner is passenger custody, never freight. Its loss stops the one durable
    // service and publishes its own exactly-once receipt before any freight/economy loss branch.
    const passengerItinerary = ent && this._passengerLinerClaim(ent);
    if (passengerItinerary && (rec && rec.passengerLinerService === PASSENGER_LINER_SERVICE.id
      || this._passengerLinerIdIsSuspended(passengerItinerary.worldRecordId))) {
      if (rec) {
        this._settlePassengerLinerLeg(ent, rec, passengerItinerary, 'LOST', passengerLinerFlyingTo(passengerItinerary));
        this.state.traffic.passengerLinerSuspendedIds = compactStableIds([
          ...(this.state.traffic.passengerLinerSuspendedIds || []), passengerItinerary.worldRecordId,
        ], PASSENGER_LINER_SUSPENSION_CAP);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('traffic:passengerLinerSuspended', {
            serviceId: PASSENGER_LINER_SERVICE.id,
            worldRecordId: passengerItinerary.worldRecordId,
            receiptId: passengerItinerary.custody && passengerItinerary.custody.receiptId,
          });
        }
        if (idx >= 0) list.splice(idx, 1);
        const activeIdx = this._active.indexOf(p.id);
        if (activeIdx >= 0) this._active.splice(activeIdx, 1);
      }
      return;
    }
    const ceresOreCarrier = role === 'ore_carrier'
      && ((ent && ent.data && ent.data.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID)
        || (rec && rec.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID));
    if (ceresOreCarrier) {
      const owner = ceresSeamMinerOwnerIdentity(ent, rec);
      if (owner) {
        const missed = missReservedRichSeamOpportunity(this.state, {
          ...owner,
          simTime: this.state.simTime,
        });
        if (missed && this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('field:richSeamMissed', { ...missed, reason: 'owner_lost' });
        }
      }
    }
    if ((ent && ent.data && ent.data.ceresActivityCast === true)
      || (rec && rec.ceresActivityCast === true)) {
      // Cast identity is durable world state. Release its movement owner, but do not fabricate a
      // freight economy receipt: these authored marks deliberately do not claim the generic
      // field:/dest: receipt bridges.
      const recordId = (ent && ent.data && ent.data.worldRecordId)
        || (rec && rec.worldRecordId)
        || null;
      this._releaseCeresActivityJob(recordId);
      const carriedManifest = (rec && rec.manifest)
        || (ent && ent.data && ent.data.cargoManifest)
        || null;
      const ceresHandoffHauler = !!(handoff && handoff.haulerWorldRecordId === recordId
        && carriedManifest && carriedManifest.custody
        && carriedManifest.custody.handoffId === handoff.handoffId);
      if (!ceresOreCarrier && !ceresHandoffHauler) {
        if (idx >= 0) list.splice(idx, 1);
        const activeIdx = this._active.indexOf(p.id);
        if (activeIdx >= 0) this._active.splice(activeIdx, 1);
        if (lostWorldSiteRoute) {
          this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
        }
        return;
      }
      // The Ore Barge and this exact transferred hauler lot both fall through to the ordinary
      // freight-loss path, which is the existing custody sink for a destroyed live manifest.
    }
    const lawLoss = lawPresenceRole(role);
    if (role && !lawLoss && !FREIGHT_TRADING_ROLES.includes(role) && !(rec && rec.manifest && rec.manifest.totalQty)) {
      // Non-trading traffic without a law record — drop tracking only.
      if (idx >= 0) list.splice(idx, 1);
      if (lostWorldSiteRoute) {
        this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
      }
      if (lostClaimTravelRoute) {
        this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
      }
      return;
    }

    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (rec && rec.id != null ? String(rec.id) : String(p.id));
    const sectorId = p.sectorId
      || (this.state.world && this.state.world.currentSectorId)
      || null;
    const stationId = this._nearestStationId(ent && ent.pos)
      || (rec && rec.targetId && this._stationIdForEntity(rec.targetId));
    const manifest = (rec && rec.manifest)
      || (ent && ent.data && ent.data.cargoManifest)
      || buildCargoManifest({ seed, freighterKey, role: role || 'hauler', market: FREIGHT_MARKET_KEYS_FALLBACK });

    const intent = buildLossIntent({
      seed,
      freighterKey,
      freighterId: p.id,
      stationId,
      sectorId,
      manifest,
      killerId: p.killerId,
      seq: this.state.tick | 0,
    });
    if (lawLoss) {
      intent.cause = TRAFFIC_LAW_LOSS_CAUSE;
      intent.lawRole = role;
      intent.source = 'traffic_law';
      if (intent.news) {
        intent.news.cause = TRAFFIC_LAW_LOSS_CAUSE;
        intent.news.lawRole = role;
      }
    }

    const t = this.state.traffic;
    const fresh = filterNewFreightIntents([intent], t.appliedLossIds);
    if (fresh.length) {
      for (const pr of intent.pressures) {
        if (!pr.stationId) continue;
        this.bus.emit('economy:applyTradePressure', {
          stationId: pr.stationId,
          good: pr.good,
          commodityId: pr.commodityId,
          vol: pr.vol,
          sectorId: pr.sectorId,
          source: pr.source,
          cause: pr.cause,
          intentId: intent.intentId,
          freighterId: p.id,
        });
      }
      this.bus.emit('freight:loss', intent);
      if (intent.news) {
        this.bus.emit('news:headline', {
          ...intent.news,
          headline: null, // presentation may fill from newsTemplates
        });
      }
      t.appliedLossIds = mergeAppliedFreightIds(t.appliedLossIds, fresh);
      this._noteHeliosFreightDisposition(manifest && manifest.manifestId, 'lost');
    }

    if (p.killerId != null && p.killerId === this.state.playerId) {
      this._markRouteDisrupted(stationId, p.id);
    }

    if (idx >= 0) list.splice(idx, 1);
    const activeIdx = this._active.indexOf(p.id);
    if (activeIdx >= 0) this._active.splice(activeIdx, 1);
    if (lostWorldSiteRoute) {
      this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
    }
    if (lostClaimTravelRoute) {
      this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
    }
  },

  /**
   * Despawn-side twin of the kill-time claim release in _onEntityKilled: a salvor removed by
   * sector exit, residency demotion, or a despawnAt sweep leaves no corpse, but the
   * `salvorClaimedBy` / source `claimId` it stamped outlives it on persistent bodies. Release
   * both so a later cutter (or the player) can take the body. `p.entity` is the destroyed
   * object itself — ids recycle, so a queued receipt must never resolve its claimant through
   * the live map against a new occupant. Far-row shelving keeps its durable identity for
   * promote-resume, so 'virtualize' receipts do not release.
   */
  _onEntityDestroyed(p) {
    if (!p || p.id == null || this._restoreEpochPending === true) return;
    if (p.reason === 'virtualize') return;
    const ent = (p.entity && typeof p.entity === 'object') ? p.entity
      : (this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(p.id) : null);
    const data = ent && ent.data;
    const worldRecordId = data && typeof data.worldRecordId === 'string' && data.worldRecordId
      ? data.worldRecordId
      : null;
    if (!worldRecordId) return;
    this._releaseShelvedSalvorClaims(worldRecordId);
    const sourceKey = typeof data.salvageSource === 'string' && data.salvageSource
      ? data.salvageSource
      : null;
    if (sourceKey) this._releaseSalvageSourceClaim({ sourceKey }, worldRecordId);
    forEachJobInteractable(this.state, (body) => {
      if (body && body.data && body.data.salvorClaimedBy === worldRecordId) {
        this._clearSalvorClaim(body, worldRecordId);
      }
    });
  },

  _leftoverDisruptedStationIds() {
    this._ensureState();
    const ids = new Set(this.state.traffic.disruptedStationIds);
    const list = this.state.traffic && this.state.traffic.freighters;
    if (!Array.isArray(list)) return ids;
    for (const rec of list) {
      if (!rec) continue;
      const ent = liveEntity(this.state, rec.id);
      if (!ent) continue;
      if (!(rec.routeDisrupted || (ent.data && ent.data.routeDisrupted))) continue;
      const stationId = (ent.data && ent.data.stationId)
        || (rec.targetId != null && this._stationIdForEntity(rec.targetId))
        || this._nearestStationId(ent.pos);
      if (stationId) ids.add(stationId);
    }
    this.state.traffic.disruptedStationIds = leftoverNormalizeDisruptedStationIds([...ids]);
    return ids;
  },

  _leftoverRememberDisruptedStation(stationId) {
    if (typeof stationId !== 'string' || !stationId) return;
    this._ensureState();
    if (!this.state.traffic.disruptedStationIds.includes(stationId)) {
      this.state.traffic.disruptedStationIds.push(stationId);
    }
  },

  _leftoverKillStationId(ent, rec) {
    const fromEntity = ent && ent.data && (ent.data.stationId || ent.data.destStationId);
    if (typeof fromEntity === 'string' && fromEntity) return fromEntity;
    const fromTarget = rec && rec.targetId != null
      ? this._stationIdForEntity(rec.targetId)
      : null;
    if (typeof fromTarget === 'string' && fromTarget) return fromTarget;
    return this._nearestStationId(ent && ent.pos) || null;
  },

  _leftoverSlotRefillsDisruptedApproach(entry, disruptedIds) {
    if (!leftoverHaulerSlot(entry) || !disruptedIds || !disruptedIds.size) return false;
    for (const stationId of disruptedIds) {
      if (leftoverSlotTargetsStation(entry, stationId)) return true;
    }
    return false;
  },

  _leftoverStationOpenForTopUp(station, disruptedIds) {
    if (!station || !disruptedIds || !disruptedIds.size) return true;
    const stationId = station.data && station.data.stationId;
    if (!stationId) return true;
    return !disruptedIds.has(stationId);
  },

  _markRouteDisrupted(stationId, victimId) {
    if (!stationId) return 0;
    this._leftoverRememberDisruptedStation(stationId);
    const list = this.state.traffic && this.state.traffic.freighters;
    if (!Array.isArray(list)) return 0;
    let marked = 0;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (!rec || rec.id === victimId) continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      const recStation = (rec.targetId != null && this._stationIdForEntity(rec.targetId))
        || this._nearestStationId(ent && ent.pos);
      if (recStation !== stationId) continue;
      rec.routeDisrupted = true;
      if (ent) {
        const data = ent.data || (ent.data = {});
        data.routeDisrupted = true;
      }
      marked += 1;
    }
    return marked;
  },

  _nearestStationId(pos) {
    if (!pos) return null;
    const stations = this._sectorStations();
    let best = null;
    let bestD = Infinity;
    for (const s of stations) {
      if (!s || !s.pos) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best && best.data && best.data.stationId ? best.data.stationId : null;
  },

  _stationIdForEntity(entityId) {
    const e = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    return e && e.data && e.data.stationId ? e.data.stationId : null;
  },

  _ensureState() {
    if (!this.state.traffic) this.state.traffic = { freighters: [] };
    if (!Array.isArray(this.state.traffic.freighters)) this.state.traffic.freighters = [];
    const count = this.state.traffic.freighters.length;
    this.state.traffic.count = count;
    this.state.traffic.liveCount = count;
    if (this.state.player) this.state.player.trafficCount = count;
    this.state.traffic.disruptedStationIds = leftoverNormalizeDisruptedStationIds(
      this.state.traffic.disruptedStationIds,
      true,
    );
    if (!Array.isArray(this.state.traffic.appliedArrivalIds)) this.state.traffic.appliedArrivalIds = [];
    if (!Array.isArray(this.state.traffic.appliedLossIds)) this.state.traffic.appliedLossIds = [];
    if (!Array.isArray(this.state.traffic.appliedMinerWorkIds)) this.state.traffic.appliedMinerWorkIds = [];
    if (!Array.isArray(this.state.traffic.appliedJobActionIds)) this.state.traffic.appliedJobActionIds = [];
    if (!Array.isArray(this.state.traffic.appliedSalvorWorkIds)) this.state.traffic.appliedSalvorWorkIds = [];
    this.state.traffic.passengerReceiptIds = compactStableIds(
      this.state.traffic.passengerReceiptIds,
      PASSENGER_LINER_RECEIPT_CAP,
      true,
    );
    this.state.traffic.passengerLinerSuspendedIds = compactStableIds(
      this.state.traffic.passengerLinerSuspendedIds,
      PASSENGER_LINER_SUSPENSION_CAP,
      true,
    );
    this.state.traffic.passengerLinerInvalidatedIds = compactStableIds(
      this.state.traffic.passengerLinerInvalidatedIds,
      PASSENGER_LINER_INVALIDATED_CAP,
      true,
    );
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    const normalizedHandoff = normalizeCeresMinerHaulerHandoff(handoff, false);
    if (!normalizedHandoff) {
      this.state.traffic.ceresMinerHaulerHandoff = null;
    } else if (handoff.terminalizedQty == null) {
      handoff.terminalizedQty = normalizedHandoff.terminalizedQty;
    }
    const serviceIncident = this.state.traffic.ceresTenderServiceIncident;
    const normalizedServiceIncident = normalizeCeresTenderServiceIncident(serviceIncident, false);
    if (!normalizedServiceIncident) {
      this.state.traffic.ceresTenderServiceIncident = null;
    }
    const disabledHaulerIncident = this.state.traffic.ceresDisabledHaulerIncident;
    if (!normalizeCeresDisabledHaulerIncident(disabledHaulerIncident, false)) {
      this.state.traffic.ceresDisabledHaulerIncident = null;
    }
    const serviceSequence = this.state.traffic.ceresTenderServiceSequence;
    const minimumServiceSequence = normalizedServiceIncident ? normalizedServiceIncident.sequence : 0;
    if (!Number.isSafeInteger(serviceSequence) || serviceSequence < minimumServiceSequence || serviceSequence < 0) {
      this.state.traffic.ceresTenderServiceSequence = minimumServiceSequence;
    }
    if (!Number.isFinite(this.state.traffic.rngSeed) || (this.state.traffic.rngSeed >>> 0) === 0) {
      this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', this.state.world && this.state.world.currentSectorId);
    }
  },

  _ensureCausalLedgerSets() {
    for (const key of [
      '_pendingJobActionIds',
      '_pendingMinerWorkIds',
      '_pendingArrivalIds',
      '_committedCeresMinerWorkIds',
      '_committedCeresArrivalIds',
    ]) {
      if (!Object.hasOwn(this, key) || !(this[key] instanceof Set)) this[key] = new Set();
    }
    for (const key of [
      '_pendingJobActionTokens',
      '_pendingMinerWorkTokens',
      '_pendingArrivalTokens',
    ]) {
      if (!Object.hasOwn(this, key) || !(this[key] instanceof Map)) this[key] = new Map();
    }
    if (!Object.hasOwn(this, '_causalRunEpoch')
      || !Number.isSafeInteger(this._causalRunEpoch)
      || this._causalRunEpoch < 0) this._causalRunEpoch = 0;
    if (!Object.hasOwn(this, '_restoreEpochPending')) this._restoreEpochPending = false;
  },

  _reserveCausalId(id, idsKey, tokensKey) {
    this._ensureCausalLedgerSets();
    const ids = this[idsKey];
    const tokens = this[tokensKey];
    if (typeof id !== 'string' || !id || ids.has(id) || tokens.has(id)) return null;
    const token = Object.freeze({ id, epoch: this._causalRunEpoch });
    ids.add(id);
    tokens.set(id, token);
    return token;
  },

  _causalReservationIsCurrent(token, idsKey, tokensKey) {
    this._ensureCausalLedgerSets();
    return !!token
      && token.epoch === this._causalRunEpoch
      && this[idsKey].has(token.id)
      && this[tokensKey].get(token.id) === token;
  },

  _releaseCausalReservation(token, idsKey, tokensKey) {
    if (!this._causalReservationIsCurrent(token, idsKey, tokensKey)) return false;
    this[tokensKey].delete(token.id);
    this[idsKey].delete(token.id);
    return true;
  },

  _invalidateCausalRunEpoch() {
    this._ensureCausalLedgerSets();
    this._causalRunEpoch = this._causalRunEpoch >= Number.MAX_SAFE_INTEGER
      ? 1
      : this._causalRunEpoch + 1;
    for (const ledger of [
      this._pendingJobActionIds,
      this._pendingMinerWorkIds,
      this._pendingArrivalIds,
      this._pendingJobActionTokens,
      this._pendingMinerWorkTokens,
      this._pendingArrivalTokens,
    ]) ledger.clear();
    return this._causalRunEpoch;
  },

  _resetRngForSector(sectorId) {
    this._ensureState();
    this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', sectorId, deferredEnterTick(this.state) || 0);
  },

  _rng() {
    this._ensureState();
    return drawSeeded(this.state.traffic, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'traffic'));
  },

  serialize() {
    captureCeresWorkfleetHardware(this);
    this._ensureState();
    const heliosFreightTallies = normalizeHeliosFreightTallyList(this.state.traffic.heliosFreightTallies);
    return {
      schema: CERES_MINER_HAULER_SAVE_SCHEMA,
      vestaWinnowRecovery: normalizeWinnowRecovery(this.state.traffic.vestaWinnowRecovery),
      charonSalvageSupply: normalizeCharonSupply(this.state.traffic.charonSalvageSupply),
      pallasWorkLoop: normalizePallasShift(this.state.traffic.pallasWorkLoop, this.state.meta.seed),
      ...(this.state.traffic.captainRoster?.length
        ? { captainRoster: normalizeCaptainRoster(this.state.traffic.captainRoster) } : {}),
      ...(this.state.traffic.coldburnRey
        ? { coldburnRey: normalizeColdburnRey(this.state.traffic.coldburnRey) } : {}),
      ...(this.state.traffic.depotServices?.length
        ? { depotServices: normalizeDepotServices(this.state.traffic.depotServices) } : {}),
      ceresMinerHaulerHandoff: normalizeCeresMinerHaulerHandoff(
        this.state.traffic.ceresMinerHaulerHandoff,
      ),
      ceresTenderServiceIncident: normalizeCeresTenderServiceIncident(
        this.state.traffic.ceresTenderServiceIncident,
      ),
      ceresTenderServiceSequence: this.state.traffic.ceresTenderServiceSequence,
      ceresDisabledHaulerIncident: normalizeCeresDisabledHaulerIncident(
        this.state.traffic.ceresDisabledHaulerIncident,
      ),
      passengerReceiptIds: this.state.traffic.passengerReceiptIds.slice(),
      passengerLinerSuspendedIds: this.state.traffic.passengerLinerSuspendedIds.slice(),
      passengerLinerInvalidatedIds: this.state.traffic.passengerLinerInvalidatedIds.slice(),
      disruptedStationIds: leftoverNormalizeDisruptedStationIds(
        this.state.traffic.disruptedStationIds,
      ),
      ...(heliosFreightTallies.length ? { heliosFreightTallies } : {}),
      ...(Number.isFinite(this.state.traffic.nextMeteorPassAt)
        ? { nextMeteorPassAt: this.state.traffic.nextMeteorPassAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextDebrisFieldAt)
        ? { nextDebrisFieldAt: this.state.traffic.nextDebrisFieldAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextSmugglerCacheAt)
        ? { nextSmugglerCacheAt: this.state.traffic.nextSmugglerCacheAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextDebrisStreamAt)
        ? { nextDebrisStreamAt: this.state.traffic.nextDebrisStreamAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextHitchShedAt)
        ? { nextHitchShedAt: this.state.traffic.nextHitchShedAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextVolatileSloughAt)
        ? { nextVolatileSloughAt: this.state.traffic.nextVolatileSloughAt } : {}),
      ...(Number.isFinite(this.state.traffic.nextBreakerFeedAt)
        ? { nextBreakerFeedAt: this.state.traffic.nextBreakerFeedAt } : {}),
    };
  },

  deserialize(data) {
    for (const _ of this.deserializeChunked(data)) { /* sync lane: every batch inline */ }
  },

  // Generator twin: each section (release pass, incident normalizes, id compacts) is atomic —
  // yields sit only at those boundaries so order and RNG consumption stay identical.
  *deserializeChunked(data) {
    releaseCharonSupply(this);
    const previousTraffic = this.state && this.state.traffic;
    this._releaseCeresMinerHaulerHandoffControls(previousTraffic && previousTraffic.ceresMinerHaulerHandoff);
    this._releaseCeresTenderServiceControls(previousTraffic && previousTraffic.ceresTenderServiceIncident);
    this._resetCeresTenderServiceRuntime();
    this._releaseCeresDisabledHaulerControls(previousTraffic && previousTraffic.ceresDisabledHaulerIncident);
    this._resetCeresDisabledHaulerRuntime();
    this._ensureState();
    this._nextDepotDispatchAt = 0;
    this._depotWatchRequested = new Set();
    yield 'traffic-releases';
    const winnow = normalizeWinnowRecovery(data?.vestaWinnowRecovery);
    if (data?.vestaWinnowRecovery != null && !winnow) throw new Error('Invalid finite Vesta Winnow recovery ledger');
    this.state.traffic.vestaWinnowRecovery = winnow;
    this.state.traffic.charonSalvageSupply = normalizeCharonSupply(data?.charonSalvageSupply) || (data?.charonSalvageSupply ? { blocked: true } : null);
    this.state.traffic.pallasWorkLoop = normalizePallasShift(data?.pallasWorkLoop, this.state.meta.seed);
    const depotServices = normalizeDepotServices(data?.depotServices);
    const captainRoster = normalizeCaptainRoster(data?.captainRoster);
    if (captainRoster.length) this.state.traffic.captainRoster = captainRoster;
    else delete this.state.traffic.captainRoster;
    const coldburnRey = normalizeColdburnRey(data?.coldburnRey);
    if (coldburnRey) this.state.traffic.coldburnRey = coldburnRey;
    else delete this.state.traffic.coldburnRey;
    if (depotServices.length) this.state.traffic.depotServices = depotServices;
    else delete this.state.traffic.depotServices;
    this.state.traffic.ceresMinerHaulerHandoff = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresMinerHaulerHandoff(data.ceresMinerHaulerHandoff)
      : null;
    this.state.traffic.ceresTenderServiceIncident = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresTenderServiceIncident(data.ceresTenderServiceIncident)
      : null;
    const incident = this.state.traffic.ceresTenderServiceIncident;
    const requestedSequence = data && !Array.isArray(data) && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? data.ceresTenderServiceSequence
      : 0;
    this.state.traffic.ceresTenderServiceSequence = Number.isSafeInteger(requestedSequence)
      && requestedSequence >= (incident ? incident.sequence : 0)
      ? requestedSequence
      : (incident ? incident.sequence : 0);
    this.state.traffic.ceresDisabledHaulerIncident = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresDisabledHaulerIncident(data.ceresDisabledHaulerIncident)
      : null;
    const validTrafficSave = !!(data && !Array.isArray(data) && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA);
    yield 'traffic-incidents';
    this.state.traffic.passengerReceiptIds = compactStableIds(
      validTrafficSave ? data.passengerReceiptIds : [],
      PASSENGER_LINER_RECEIPT_CAP,
    );
    this.state.traffic.passengerLinerSuspendedIds = compactStableIds(
      validTrafficSave ? data.passengerLinerSuspendedIds : [],
      PASSENGER_LINER_SUSPENSION_CAP,
    );
    this.state.traffic.passengerLinerInvalidatedIds = compactStableIds(
      validTrafficSave ? data.passengerLinerInvalidatedIds : [],
      PASSENGER_LINER_INVALIDATED_CAP,
    );
    this.state.traffic.disruptedStationIds = leftoverNormalizeDisruptedStationIds(
      validTrafficSave ? data.disruptedStationIds : [],
    );
    const tallies = validTrafficSave
      ? normalizeHeliosFreightTallyList(data.heliosFreightTallies) : [];
    if (tallies.length) this.state.traffic.heliosFreightTallies = tallies;
    else delete this.state.traffic.heliosFreightTallies;
    // The sky clock survives a Continue; a save without it re-rolls on the next step.
    this.state.traffic.nextMeteorPassAt = validTrafficSave && Number.isFinite(data.nextMeteorPassAt)
      ? data.nextMeteorPassAt : undefined;
    this.state.traffic.nextDebrisFieldAt = validTrafficSave && Number.isFinite(data.nextDebrisFieldAt)
      ? data.nextDebrisFieldAt : undefined;
    this.state.traffic.nextSmugglerCacheAt = validTrafficSave && Number.isFinite(data.nextSmugglerCacheAt)
      ? data.nextSmugglerCacheAt : undefined;
    this.state.traffic.nextDebrisStreamAt = validTrafficSave && Number.isFinite(data.nextDebrisStreamAt)
      ? data.nextDebrisStreamAt : undefined;
    this.state.traffic.nextHitchShedAt = validTrafficSave && Number.isFinite(data.nextHitchShedAt)
      ? data.nextHitchShedAt : undefined;
    this.state.traffic.nextVolatileSloughAt = validTrafficSave && Number.isFinite(data.nextVolatileSloughAt)
      ? data.nextVolatileSloughAt : undefined;
    this.state.traffic.nextBreakerFeedAt = validTrafficSave && Number.isFinite(data.nextBreakerFeedAt)
      ? data.nextBreakerFeedAt : undefined;
    this._meteorPass = null;
    this._debrisField = null;
    this._smugglerCache = null;
    this._debrisStream = null;
    this._hitchShed = null;
    this._volatileSlough = null;
    this._breakerFeed = null;
    if (this._weirInside) this._weirInside.clear();
    if (this._weirTill) this._weirTill.length = 0;
  },

  newGame() {
    this._nextDepotDispatchAt = 0;
    this._depotWatchRequested = new Set();
    this._releaseCeresMinerHaulerHandoffControls(
      this.state && this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff,
    );
    this._releaseCeresTenderServiceControls(
      this.state && this.state.traffic && this.state.traffic.ceresTenderServiceIncident,
    );
    this._resetCeresTenderServiceRuntime();
    this._releaseCeresDisabledHaulerControls(
      this.state && this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident,
    );
    this._resetCeresDisabledHaulerRuntime();
    this._invalidateCausalRunEpoch();
    this._restoreEpochPending = false;
    this._meteorPass = null;
    this._debrisField = null;
    this._smugglerCache = null;
    this._debrisStream = null;
    this._hitchShed = null;
    this._volatileSlough = null;
    this._breakerFeed = null;
    if (this._weirInside) this._weirInside.clear();
    if (this._weirTill) this._weirTill.length = 0;
    this._active = [];
    // Enter-dedupe stamps: sector-object identity already makes a stale match impossible,
    // but reset them so a new world can't carry previous-run epoch/simTime tokens forward.
    this._emittedSector = null;
    this._emittedSimTime = 0;
    this._emittedEpoch = null;
    this._cookedSector = null;
    this._cookedSimTime = 0;
    this._cookedEnterEpoch = null;
    this._ensureCausalLedgerSets();
    for (const ledger of [
      this._pendingJobActionIds,
      this._pendingMinerWorkIds,
      this._pendingArrivalIds,
      this._committedCeresMinerWorkIds,
      this._committedCeresArrivalIds,
    ]) {
      if (ledger && typeof ledger.clear === 'function') ledger.clear();
    }
    this._resetCeresCausalChain('new_game');
    this.state.traffic = {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      appliedJobActionIds: [],
      appliedSalvorWorkIds: [],
      ceresMinerHaulerHandoff: null,
      ceresTenderServiceIncident: null,
      ceresTenderServiceSequence: 0,
      ceresDisabledHaulerIncident: null,
      passengerReceiptIds: [],
      passengerLinerSuspendedIds: [],
      passengerLinerInvalidatedIds: [],
      disruptedStationIds: [],
      rngSeed: hash32(this.state.meta && this.state.meta.seed, 'traffic', 'boot'),
    };
  },
};
import { normalizePallasShift } from '../data/pallasWorkShift.js';
