// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { ceresDisabledHaulerManifestTruth } from '../data/contactHail.js';
import { hash32 } from '../core/rng.js';
import { buildLossIntent, filterNewFreightIntents, mergeAppliedFreightIds } from '../economy/freightCausality.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { claimRichSeamOpportunity, reserveRichSeamOpportunity, richSeamOpportunityForEntity } from './fieldDepletion.js';
import { CERES_DISABLED_HAULER_INCIDENT_SCHEMA, CERES_DISABLED_HAULER_LAW_KIND, CERES_DISABLED_HAULER_OFFENDER_STABLE_ID, CERES_DISABLED_HAULER_PICKUP_TTL_S, CERES_DISABLED_HAULER_PLAYER_WINDOW_S, CERES_DISABLED_HAULER_REPAIR_AMOUNT, CERES_DISABLED_HAULER_REPAIR_HOLD_S, CERES_DISABLED_HAULER_TERMINAL_STATES, CERES_REFINERY_HAULER_SLOT_ID, CERES_RICH_SEAM_OBJECT_SLOT_ID, CERES_SEAM_MINER_SLOT_ID, CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT, CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER, CERES_TENDER_SLOT_ID, NPC_MINER_WORK_BATCH_U, NPC_MINER_WORK_LEDGER_CAP, ceresSeamMinerOwnerIdentity, dominantAsteroidCommodity, entityWithWorldRecord, setIntent, validCausalManifest } from './traffic.js';

export const trafficRecoveryOps = {
  // ── PQ-048.05 disabled-hauler recovery ───────────────────────────────────────────────────────

  _resetCeresDisabledHaulerRuntime() {
    this._ceresDisabledHaulerImpairmentActor = null;
    this._ceresDisabledHaulerRepairActor = null;
  },

  _activeCeresDisabledHaulerIncident() {
    this._ensureState();
    const incident = this.state.traffic.ceresDisabledHaulerIncident;
    return incident && !CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state) ? incident : null;
  },

  _ceresDisabledHaulerActor(incident, role) {
    if (!incident || (role !== 'hauler' && role !== 'responder')) return null;
    const worldRecordId = role === 'hauler'
      ? incident.haulerWorldRecordId
      : incident.responderWorldRecordId;
    const expectedSlotId = role === 'hauler' ? CERES_REFINERY_HAULER_SLOT_ID : CERES_TENDER_SLOT_ID;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.data
      || entity.data.worldRecordId !== worldRecordId
      || entity.data.activityActorSlotId !== expectedSlotId
      || entity.data.jobId !== `job:${worldRecordId}`
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
    if (role === 'responder') {
      const presence = entity.data.factionPresence;
      if (entity.data.durable !== true || !presence || presence.yardTender !== true) return null;
      return { entity, rec: null, jobId: entity.data.jobId, worldRecordId };
    }
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && candidate.activityActorSlotId === CERES_REFINERY_HAULER_SLOT_ID
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id));
    const manifest = entity.data.cargoManifest || rec && rec.manifest;
    if (!rec || entity.data.ceresActivityCast !== true || entity.data.ceresActivityJobOwned !== true
      || !this._ceresHandoffDeliveryIsCurrent(this.state.traffic.ceresMinerHaulerHandoff, manifest)
      || !ceresDisabledHaulerManifestTruth(this.state, entity, incident, rec.manifest)) return null;
    // Only an exact match may replace the deserialized copy. Quantities always come back from the
    // live transferred manifest, never from the incident envelope in isolation.
    incident.manifest = JSON.parse(JSON.stringify(manifest));
    return { entity, rec, jobId: entity.data.jobId, worldRecordId };
  },

  _beginCeresDisabledHaulerIncident() {
    this._ensureState();
    const existing = this.state.traffic.ceresDisabledHaulerIncident;
    if (existing) return existing;
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    const haulerBound = handoff && this._ceresHandoffActor(handoff, 'hauler');
    const responderBound = this._ceresCausalActorBySlot(CERES_TENDER_SLOT_ID);
    const responder = responderBound && responderBound.entity;
    const manifest = haulerBound && (haulerBound.entity.data.cargoManifest || haulerBound.rec.manifest);
    const responderWorldRecordId = responder && responder.data && responder.data.worldRecordId;
    if (!handoff || handoff.state !== 'in_transit' || !haulerBound
      || !validCausalManifest(manifest) || !manifest.custody
      || manifest.custody.handoffId !== handoff.handoffId
      || typeof responderWorldRecordId !== 'string' || !responderWorldRecordId) return null;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const incident = {
      schema: CERES_DISABLED_HAULER_INCIDENT_SCHEMA,
      incidentId: `ceres-disabled-hauler:${handoff.handoffId}:${manifest.manifestId}`,
      handoffId: handoff.handoffId,
      haulerWorldRecordId: handoff.haulerWorldRecordId,
      responderWorldRecordId,
      manifestId: manifest.manifestId,
      rootLotId: handoff.rootLotId,
      manifest: JSON.parse(JSON.stringify(manifest)),
      state: 'impair',
      choice: null,
      startedAtSimT: now,
      responseAtSimT: now + CERES_DISABLED_HAULER_PLAYER_WINDOW_S,
      holdStartedAtSimT: null,
      terminalAtSimT: null,
      outcome: null,
      failureReason: null,
      lossIntentId: null,
      lawIncidentReceiptId: null,
      theftCausalTick: null,
      pickupLines: [],
    };
    if (!this._ceresDisabledHaulerActor(incident, 'hauler')
      || !this._ceresDisabledHaulerActor(incident, 'responder')) return null;
    this.state.traffic.ceresDisabledHaulerIncident = incident;
    return incident;
  },

  _ceresDisabledHaulerClaimId(incident, role) {
    return `ceres-disabled-hauler:${incident.incidentId}:${role}`;
  },

  _claimCeresDisabledHaulerControl(incident, actor, role) {
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!incident || !actor || !actor.jobId || !jobs || typeof jobs.claimControl !== 'function') return false;
    const result = jobs.claimControl(actor.jobId, {
      claimId: this._ceresDisabledHaulerClaimId(incident, role),
      holder: 'traffic:ceresDisabledHaulerRecovery',
    });
    return !!(result && result.granted === true);
  },

  _releaseCeresDisabledHaulerControl(incident, role) {
    if (!incident || (role !== 'hauler' && role !== 'responder')) return;
    const worldRecordId = role === 'hauler' ? incident.haulerWorldRecordId : incident.responderWorldRecordId;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') {
      jobs.releaseControl(`job:${worldRecordId}`, this._ceresDisabledHaulerClaimId(incident, role));
    }
  },

  _releaseCeresDisabledHaulerControls(incident) {
    this._releaseCeresDisabledHaulerControl(incident, 'hauler');
    this._releaseCeresDisabledHaulerControl(incident, 'responder');
  },

  _requestCeresDisabledHaulerImpairment(incident, entity) {
    const already = this._ceresDisabledHaulerImpairmentActor
      && this._ceresDisabledHaulerImpairmentActor.incidentId === incident.incidentId
      && this._ceresDisabledHaulerImpairmentActor.entity === entity;
    if (already) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    const drive = this._ceresTenderServiceDriveRuntime(entity, kernel);
    if (!kernel || typeof kernel.routeDamage !== 'function' || !drive
      || !Number.isFinite(drive.health) || drive.health < 0) return false;
    if (drive.health <= 0 && drive.pendingTransition && drive.pendingTransition.destroyed === true) {
      this._ceresDisabledHaulerImpairmentActor = { incidentId: incident.incidentId, entity };
      return true;
    }
    if (drive.health <= 0) return false;
    const hullBefore = Number(entity.hull);
    const ionDamage = CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT
      + drive.health / CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: entity.id,
      packet: {
        channels: { ion: ionDamage }, penetration: 0, shieldBypass: 1, subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        source: { kind: 'traffic_disabled_hauler', id: incident.incidentId },
      },
      origin: { kind: 'traffic_disabled_hauler', id: incident.incidentId },
    });
    if (!result || result.ok !== true || result.hullDamage !== 0 || entity.hull !== hullBefore) return false;
    this._ceresDisabledHaulerImpairmentActor = { incidentId: incident.incidentId, entity };
    return true;
  },

  _requestCeresDisabledHaulerRepair(incident, entity) {
    const already = this._ceresDisabledHaulerRepairActor
      && this._ceresDisabledHaulerRepairActor.incidentId === incident.incidentId
      && this._ceresDisabledHaulerRepairActor.entity === entity;
    if (already) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.repair !== 'function') return false;
    const result = kernel.repair(entity.id, 'subsystem_drive', CERES_DISABLED_HAULER_REPAIR_AMOUNT,
      'traffic_disabled_hauler_responder');
    if (!result || result.ok !== true) return false;
    this._ceresDisabledHaulerRepairActor = { incidentId: incident.incidentId, entity };
    return true;
  },

  _stampCeresDisabledHauler(entity, incident) {
    if (!entity || !entity.data || !incident) return;
    entity.data.ceresDisabledHauler = {
      schema: incident.schema,
      incidentId: incident.incidentId,
      handoffId: incident.handoffId,
      manifestId: incident.manifestId,
      haulerWorldRecordId: incident.haulerWorldRecordId,
      state: incident.state,
      choice: incident.choice,
      responseAtSimT: incident.responseAtSimT,
      outcome: incident.outcome,
    };
  },

  _terminalizeCeresDisabledHauler(incident, outcome, reason = null) {
    if (!incident || CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = outcome;
    incident.outcome = outcome;
    incident.failureReason = reason == null ? null : String(reason);
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.holdStartedAtSimT = null;
    this._releaseCeresDisabledHaulerControls(incident);
    this._resetCeresDisabledHaulerRuntime();
    const hauler = entityWithWorldRecord(this.state, incident.haulerWorldRecordId);
    this._stampCeresDisabledHauler(hauler, incident);
    return true;
  },

  _onCeresDisabledHaulerPlayerClaim(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.entityId !== hauler.entity.id
      || payload.manifestId !== incident.manifestId || incident.choice && incident.choice !== 'recover') return false;
    incident.choice = 'recover';
    incident.state = 'player_recovery';
    this._releaseCeresDisabledHaulerControl(incident, 'responder');
    this._stampCeresDisabledHauler(hauler.entity, incident);
    return true;
  },

  _onCeresDisabledHaulerRecovery(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.manifestId !== incident.manifestId
      || payload.recoveryId && !String(payload.recoveryId).startsWith(`civilian-recovery:${incident.manifestId}:`)) return false;
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (handoff && handoff.handoffId === incident.handoffId) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'lawful_recovery');
    }
    return this._terminalizeCeresDisabledHauler(incident, 'recovered');
  },

  _onCeresDisabledHaulerAbandoned(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.manifestId !== incident.manifestId) return false;
    if (payload.outcome === 'drive_restored') {
      return this._terminalizeCeresDisabledHauler(incident, 'repaired');
    }
    if (payload.outcome === 'destroyed') {
      return this._terminalizeCeresDisabledHauler(incident, 'destroyed', 'destroyed');
    }
    incident.pendingAbandonmentReason = String(payload.outcome || 'abandoned');
    if (hauler && this._destroyCeresDisabledHauler(incident, hauler.entity, payload.outcome || 'abandoned')) {
      return true;
    }
    delete incident.pendingAbandonmentReason;
    this._bookCeresDisabledHaulerLoss(incident, payload.killerId, `recovery_${payload.outcome || 'abandoned'}`);
    return this._terminalizeCeresDisabledHauler(incident, 'abandoned', payload.outcome || null);
  },

  _spawnCeresDisabledHaulerPickups(incident, hauler) {
    if (!incident || !hauler || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return false;
    if (!Array.isArray(incident.pickupLines)) incident.pickupLines = [];
    if (incident.pickupLines.length) return true;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.manifest.lines.forEach((line, index) => {
      const angle = (hash32(incident.incidentId, index, 'steal-pickup') % 6284) / 1000;
      const radius = Math.max(2.8, Math.min(8, 2 + Math.cbrt(line.qty)));
      const pickupStableId = `${incident.incidentId}:pickup:${index}`;
      const pickup = this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: hauler.pos.x + Math.cos(angle) * (hauler.radius + 8), z: hauler.pos.z + Math.sin(angle) * (hauler.radius + 8) },
        vel: { x: Math.cos(angle) * 5, z: Math.sin(angle) * 5 },
        radius,
        mass: Math.max(20, line.qty * 12),
        collides: true,
        flags: { persistent: true },
        data: {
          kind: 'cargo', commodityId: line.commodityId, amount: line.qty,
          despawnAt: now + CERES_DISABLED_HAULER_PICKUP_TTL_S,
          lotSource: {
            lotId: `${incident.rootLotId}:stolen-line:${index}`,
            provenanceId: incident.manifestId,
            sourceKind: 'disabled_hauler_manifest_theft',
            recordId: incident.haulerWorldRecordId,
            choiceId: 'steal',
            sourceOwner: 'player',
          },
          ceresDisabledHaulerPickup: {
            schema: CERES_DISABLED_HAULER_INCIDENT_SCHEMA,
            incidentId: incident.incidentId, pickupStableId, manifestId: incident.manifestId,
            commodityId: line.commodityId, qty: line.qty,
          },
        },
      });
      if (pickup) incident.pickupLines.push({ pickupStableId, commodityId: line.commodityId, qty: line.qty, acceptedQty: 0 });
    });
    return incident.pickupLines.length === incident.manifest.lines.length;
  },

  _onCeresDisabledHaulerPickup(payload) {
    if (!payload || payload.collectorId !== this.state.playerId || payload.pickupId == null) return false;
    const pickup = this.state.entities && this.state.entities.get && this.state.entities.get(payload.pickupId);
    const marker = pickup && pickup.data && pickup.data.ceresDisabledHaulerPickup;
    const incident = this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident;
    if (!marker || !incident || marker.incidentId !== incident.incidentId || incident.state !== 'stolen') return false;
    const line = incident.pickupLines.find((entry) => entry.pickupStableId === marker.pickupStableId);
    const accepted = Math.max(0, Math.floor(Number(payload.acceptedAmount) || 0));
    if (!line || accepted <= 0 || line.acceptedQty >= line.qty) return false;
    line.acceptedQty = Math.min(line.qty, line.acceptedQty + accepted);
    this._reportCeresDisabledHaulerTheft(incident, pickup);
    return true;
  },

  _reportCeresDisabledHaulerTheft(incident, pickup) {
    if (!incident || incident.lawIncidentReceiptId || !pickup || !pickup.pos) return null;
    const law = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('lawSecurity') : null;
    if (!law || typeof law.reportIncident !== 'function') return null;
    if (!Number.isSafeInteger(incident.theftCausalTick)) incident.theftCausalTick = Math.max(0, this.state.tick | 0);
    const receipt = law.reportIncident({
      reportId: `${incident.incidentId}:law:${CERES_DISABLED_HAULER_LAW_KIND}`,
      kind: CERES_DISABLED_HAULER_LAW_KIND,
      offenderStableId: CERES_DISABLED_HAULER_OFFENDER_STABLE_ID,
      offenderEntityId: this.state.playerId,
      payloadStableId: incident.manifestId,
      causalTick: incident.theftCausalTick,
      pos: { x: pickup.pos.x, z: pickup.pos.z },
    });
    if (receipt && receipt.accepted === true) incident.lawIncidentReceiptId = receipt.incidentReceiptId;
    return receipt;
  },

  _bookCeresDisabledHaulerLoss(incident, killerId = null, cause = 'disabled_hauler_loss') {
    if (!incident || incident.lossIntentId) return false;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const stationId = this._nearestStationId(entityWithWorldRecord(this.state, incident.haulerWorldRecordId)?.pos);
    const intent = buildLossIntent({
      seed, freighterKey: incident.haulerWorldRecordId, stationId,
      sectorId: CERES_ACTIVITY_SECTOR_ID, manifest: incident.manifest, killerId,
      intentId: `${incident.incidentId}:freight-loss`, seq: 0,
    });
    const fresh = filterNewFreightIntents([intent], this.state.traffic.appliedLossIds);
    if (!fresh.length) {
      incident.lossIntentId = intent.intentId;
      return false;
    }
    for (const pressure of intent.pressures) {
      if (!pressure.stationId) continue;
      this.bus.emit('economy:applyTradePressure', { ...pressure, intentId: intent.intentId, recoveryCause: cause });
    }
    this.bus.emit('freight:loss', { ...intent, recoveryCause: cause });
    if (intent.news) this.bus.emit('news:headline', { ...intent.news, headline: null, recoveryCause: cause });
    this.state.traffic.appliedLossIds = mergeAppliedFreightIds(this.state.traffic.appliedLossIds, fresh);
    incident.lossIntentId = intent.intentId;
    return true;
  },

  _chooseCeresDisabledHauler(incident, choice) {
    if (!incident || CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)
      || incident.choice && incident.choice !== choice) return false;
    const hauler = this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!hauler) return false;
    incident.choice = choice;
    if (choice === 'recover') {
      incident.state = 'player_recovery';
      this._releaseCeresDisabledHaulerControl(incident, 'responder');
      this._stampCeresDisabledHauler(hauler.entity, incident);
      return true;
    }
    if (choice === 'steal') {
      if (!this._spawnCeresDisabledHaulerPickups(incident, hauler.entity)) return false;
      this._setTrafficManifest(hauler.entity, hauler.rec,
        this._buildMinerManifest(hauler.entity, 0, null, 0, 'hauler'));
      const handoff = this.state.traffic.ceresMinerHaulerHandoff;
      if (handoff && handoff.handoffId === incident.handoffId) {
        this._interruptCeresMinerHaulerHandoff(handoff, 'manifest_stolen', hauler.entity);
      }
      this._bookCeresDisabledHaulerLoss(incident, this.state.playerId, 'disabled_hauler_theft');
      this._terminalizeCeresDisabledHauler(incident, 'stolen');
      return true;
    }
    if (choice === 'abandon') {
      return this._destroyCeresDisabledHauler(incident, hauler.entity, 'player_abandon');
    }
    return false;
  },

  _destroyCeresDisabledHauler(incident, entity, reason) {
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!incident || !entity || !kernel || typeof kernel.routeDamage !== 'function') return false;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: entity.id,
      packet: {
        channels: { kinetic: Math.max(9999, Number(entity.hull) * 20) },
        shieldBypass: 1,
        penetration: 999,
        source: { kind: 'traffic_disabled_hauler_abandon', id: incident.incidentId, reason },
      },
      origin: { kind: 'traffic_disabled_hauler_abandon', id: incident.incidentId, reason },
    });
    return !!(result && result.ok === true && entity.alive === false);
  },

  _stepCeresDisabledHaulerIncident(dt) {
    const incident = this._activeCeresDisabledHaulerIncident();
    if (!incident || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return incident;
    const hauler = this._ceresDisabledHaulerActor(incident, 'hauler');
    const responder = this._ceresDisabledHaulerActor(incident, 'responder');
    if (!hauler || !responder) {
      if (this._ceresDisabledHaulerRestorePending) return incident;
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'actor_absent');
      return incident;
    }
    if (!this._ceresTenderServiceDriveDisabled(hauler.entity)) {
      if (incident.state === 'responder_repair') {
        this._terminalizeCeresDisabledHauler(incident, 'repaired');
        return incident;
      }
      this._releaseCeresDisabledHaulerControls(incident);
      incident.state = 'impair';
      incident.holdStartedAtSimT = null;
      this._ceresDisabledHaulerRepairActor = null;
      if (!this._requestCeresDisabledHaulerImpairment(incident, hauler.entity)) {
        this._terminalizeCeresDisabledHauler(incident, 'failed', 'drive_impairment_refused');
      }
      return incident;
    }
    const haulerClaimed = this._claimCeresDisabledHaulerControl(incident, hauler, 'hauler');
    if (!haulerClaimed) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'hauler_control_refused');
      return incident;
    }
    if (incident.state === 'impair') incident.state = 'distress';
    this._stampCeresDisabledHauler(hauler.entity, incident);
    if (incident.choice === 'recover' || incident.state === 'player_recovery') {
      setIntent(hauler.entity, 0, 0, false, false, null, hauler.entity.rot || 0);
      hauler.entity.data.intent.brake = true;
      return incident;
    }
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (now < incident.responseAtSimT) return incident;
    const responderClaimed = this._claimCeresDisabledHaulerControl(incident, responder, 'responder');
    if (!responderClaimed) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'responder_control_refused');
      return incident;
    }
    incident.state = 'responder_approach';
    const motion = this._driveCeresTenderServiceStandoff(incident, responder.entity, hauler.entity);
    if (!motion.ok) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'invalid_recovery_geometry');
      return incident;
    }
    if (!motion.holding) return incident;
    if (incident.holdStartedAtSimT == null) {
      incident.holdStartedAtSimT = now;
      return incident;
    }
    if (now < incident.holdStartedAtSimT + CERES_DISABLED_HAULER_REPAIR_HOLD_S) return incident;
    incident.state = 'responder_repair';
    if (!this._requestCeresDisabledHaulerRepair(incident, hauler.entity)) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'drive_repair_refused');
    }
    void dt;
    return incident;
  },

  _onNpcJobWork(intent) {
    const ceresOwned = this._ceresActivityIntentClaimsOwnership(intent);
    const actorContext = this._ceresActivityActorContext(intent);
    if (ceresOwned) {
      const context = this._ceresActivityActionContext(intent, 'work', actorContext);
      return context ? this._applyCeresActivityAction(context, intent) : false;
    }
    if (!intent || intent.completed !== true) return false;

    // General salvor: WORK finishes the cut; value is claimed here so a mid-LOAD kill still drops
    // the taken cargo via the civilian-manifest payload path.
    if (intent.kind === 'salvor') {
      const context = this._jobTrafficContext(intent, 'salvor');
      if (!context) return false;
      const carried = context.entity.data && context.entity.data.cargoManifest
        || context.rec.manifest;
      // A rejected yard keeps custody on the cutter. When the cyclic job reaches another wreck,
      // do not overwrite that conserved lot; it must return to an eligible intake first.
      if (carried && Array.isArray(carried.lines) && carried.totalQty > 0) return true;
      const waypointId = typeof intent.field === 'string' ? intent.field
        : (typeof intent.waypointId === 'string' ? intent.waypointId : '');
      const target = this._resolveSalvorTargetFromWaypoint(waypointId, intent.payload)
        || (intent.payload && intent.payload.targetId != null
          && this.state.entities && this.state.entities.get
          ? this.state.entities.get(intent.payload.targetId)
          : null);
      if (!target || target.alive === false) {
        // Player beat the cutter (or the body despawned) — depart empty, no mint.
        const source = this._salvageSourceBindingFromPayload(intent.payload);
        if (source) this._releaseSalvageSourceClaim(source, context.worldRecordId);
        this._setTrafficManifest(
          context.entity,
          context.rec,
          this._emptySalvorManifest(context.entity, intent.seq | 0),
        );
        return false;
      }
      return this._takeSalvageValueOntoSalvor(context, intent, target);
    }

    if (intent.kind !== 'miner') return false;
    const context = this._jobTrafficContext(intent, 'miner', ['miner', 'ore_carrier']);
    if (!context) return false;
    // This cutter already paid out through mining.applyMining into collectable ore bodies.
    if (context.entity.data.minerShiftRockId != null) return false;
    const fieldWaypoint = typeof intent.field === 'string' ? intent.field : '';
    if (!fieldWaypoint.startsWith('field:') || fieldWaypoint.length <= 6) return false;
    const rawAsteroidId = fieldWaypoint.slice(6);
    const numericAsteroidId = Number(rawAsteroidId);
    const asteroid = this.state.entities && this.state.entities.get
      ? (this.state.entities.get(rawAsteroidId)
        || (Number.isFinite(numericAsteroidId) ? this.state.entities.get(numericAsteroidId) : null))
      : null;
    if (!asteroid || asteroid.alive === false || asteroid.type !== 'asteroid') return false;
    const fieldId = asteroid.data && asteroid.data.fieldId;
    if (!fieldId) return false;

    const seq = Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    return this._applyNpcMinerExtraction(
      context,
      intent,
      asteroid,
      `npc-miner-work:${context.worldRecordId}:${seq}`,
    );
  },

  _onContactHailResponse(response) {
    if (!response) return false;
    const choice = String(response.choice || '').toLowerCase();
    if (choice === 'assist') return this._beginPassengerLinerAssist(response);
    if (choice === 'escort') return this._requestPriorityCourierEscort(response);
    if (choice === 'recover' || choice === 'steal' || choice === 'abandon') {
      const incident = this._activeCeresDisabledHaulerIncident();
      const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
      if (!incident || !hauler || response.targetId !== hauler.entity.id) return false;
      return this._chooseCeresDisabledHauler(incident, choice);
    }
    if (choice !== 'help') return false;
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response.targetId)
      : null;
    if (!target || target.alive === false || target.type !== 'ship') return false;
    const rec = this.state.traffic && Array.isArray(this.state.traffic.freighters)
      ? this.state.traffic.freighters.find((row) => row && row.id === target.id)
      : null;
    if (!rec || rec.activityActorSlotId !== CERES_SEAM_MINER_SLOT_ID || rec.role !== 'ore_carrier') return false;
    const owner = ceresSeamMinerOwnerIdentity(target, rec);
    const targetData = target.data || {};
    if (!owner || targetData.homeSectorId !== CERES_ACTIVITY_SECTOR_ID
      || targetData.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || (this.state.world && this.state.world.currentSectorId) !== CERES_ACTIVITY_SECTOR_ID) return false;
    const candidates = [];
    for (const entity of indexedTypeScan(this.state, 'asteroids')) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid') continue;
      const entityData = entity.data || {};
      if (entityData.activityObjectSlotId !== CERES_RICH_SEAM_OBJECT_SLOT_ID
        || entityData.sectorId !== CERES_ACTIVITY_SECTOR_ID
        || entityData.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) continue;
      const opportunity = richSeamOpportunityForEntity(this.state, entity);
      if (!opportunity || opportunity.state !== 'open' || opportunity.sectorId !== CERES_ACTIVITY_SECTOR_ID) continue;
      const dx = Number(entity.pos && entity.pos.x) - Number(target.pos && target.pos.x);
      const dz = Number(entity.pos && entity.pos.z) - Number(target.pos && target.pos.z);
      candidates.push({ entity, opportunity, distance: dx * dx + dz * dz });
    }
    candidates.sort((a, b) => a.distance - b.distance || String(a.entity.id).localeCompare(String(b.entity.id)));
    const seam = candidates[0];
    if (!seam) return false;
    const opportunity = seam.opportunity;
    const seamData = seam.entity.data || {};
    const reserved = reserveRichSeamOpportunity(this.state, {
      fieldId: seamData.fieldId,
      activityObjectSlotId: seamData.activityObjectSlotId,
      reservationId: `rich-help:${opportunity.opportunityId}:${owner.stableId}`,
      reservedByKind: 'npc',
      reservedById: target.id,
      reservedByStableId: owner.stableId,
      reservedByWorldRecordId: owner.worldRecordId,
      reservedByActivityActorSlotId: owner.activityActorSlotId,
      reservedByJobId: owner.jobId,
      simTime: this.state.simTime,
    });
    if (!reserved) return false;
    this.bus.emit('traffic:richSeamHelpReserved', {
      ...reserved,
      targetId: target.id,
      requestId: response.requestId || null,
      source: 'contact_hail',
    });
    return true;
  },

  /**
   * LOAD is the visible wrangle act. Value was claimed on WORK; this only re-affirms the taken
   * pool if WORK somehow missed (virtualized catch-up) and never invents commodities.
   */
  _onNpcJobLoad(intent) {
    if (!intent || intent.completed !== true || intent.kind !== 'salvor') return false;
    if (this._ceresActivityIntentClaimsOwnership(intent)) return false;
    const context = this._jobTrafficContext(intent, 'salvor');
    if (!context) return false;
    const hasCargo = context.entity.data
      && context.entity.data.cargoManifest
      && Array.isArray(context.entity.data.cargoManifest.lines)
      && context.entity.data.cargoManifest.totalQty > 0;
    if (hasCargo) return true;
    const origin = typeof intent.origin === 'string' ? intent.origin : '';
    const target = this._resolveSalvorTargetFromWaypoint(origin, intent.payload);
    if (!target || target.alive === false || !this._isSalvageableBody(target)) return false;
    return this._takeSalvageValueOntoSalvor(context, intent, target);
  },

  _applyNpcMinerExtraction(context, intent, asteroid, workId, options = null) {
    if (!context || !asteroid || asteroid.alive === false || asteroid.type !== 'asteroid'
      || typeof workId !== 'string' || !workId) return false;
    this._ensureCausalLedgerSets();
    const fieldId = asteroid.data && asteroid.data.fieldId;
    if (!fieldId || this.state.traffic.appliedMinerWorkIds.includes(workId)
      || this._pendingMinerWorkIds.has(workId)) return false;
    const reservation = this._reserveCausalId(
      workId,
      '_pendingMinerWorkIds',
      '_pendingMinerWorkTokens',
    );
    if (!reservation) return false;
    const causalGuard = options && typeof options.causalGuard === 'function'
      ? options.causalGuard
      : null;
    const stillCurrent = () => this._causalReservationIsCurrent(
      reservation,
      '_pendingMinerWorkIds',
      '_pendingMinerWorkTokens',
    ) && (!causalGuard || causalGuard());
    if (!stillCurrent()) {
      this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
      return false;
    }
    const seq = Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    let richClaim = null;
    try {
      const commodityId = dominantAsteroidCommodity(asteroid);
      const authoredYield = Math.max(1, Math.floor(Number(asteroid.data && asteroid.data.yieldU) || NPC_MINER_WORK_BATCH_U));
      const isCeresRichSeamWork = context.slot && context.slot.id === CERES_SEAM_MINER_SLOT_ID
        && asteroid.data && asteroid.data.activityObjectSlotId === CERES_RICH_SEAM_OBJECT_SLOT_ID;
      const activeHandoff = this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff;
      if (isCeresRichSeamWork && activeHandoff
        && activeHandoff.state !== 'delivered' && activeHandoff.state !== 'interrupted'
        && activeHandoff.minerWorldRecordId === context.worldRecordId) {
        throw new Error('ceres_miner_handoff_pending');
      }
      if (isCeresRichSeamWork && richSeamOpportunityForEntity(this.state, asteroid)?.state === 'open') {
        const owner = ceresSeamMinerOwnerIdentity(context.entity, context.rec);
        if (!owner) throw new Error('ceres_miner_stable_identity_missing');
        richClaim = claimRichSeamOpportunity(this.state, {
          fieldId,
          activityObjectSlotId: CERES_RICH_SEAM_OBJECT_SLOT_ID,
          claimId: workId,
          claimedByKind: 'npc',
          claimedById: context.entity.id,
          claimedByStableId: owner.stableId,
          claimedByWorldRecordId: owner.worldRecordId,
          claimedByActivityActorSlotId: owner.activityActorSlotId,
          claimedByJobId: owner.jobId,
          resolution: richSeamOpportunityForEntity(this.state, asteroid)?.reservationId ? 'help' : 'work',
          simTime: this.state.simTime,
        });
      }
      const richBonusU = richClaim ? richClaim.claimedBonusU : 0;
      const extractedU = Math.min(authoredYield, NPC_MINER_WORK_BATCH_U + richBonusU);
      const carrierRole = context.rec && context.rec.role === 'ore_carrier'
        ? 'ore_carrier'
        : 'miner';
      const manifest = this._buildMinerManifest(
        context.entity,
        seq,
        commodityId,
        extractedU,
        carrierRole,
        carrierRole === 'ore_carrier'
          ? {
              workId,
              asteroidId: asteroid.id,
              fieldId: String(fieldId),
              sectorId: (this.state.world && this.state.world.currentSectorId) || null,
              richOpportunityId: richClaim && richClaim.opportunityId || null,
              richBonusU,
              richResolution: richClaim && richClaim.resolution || null,
              richReservationId: richClaim && richClaim.reservationId || null,
            }
          : null,
      );
      if (!this._setTrafficManifest(context.entity, context.rec, manifest)) throw new Error('miner_manifest_rejected');
      if (isCeresRichSeamWork && !this._requestCeresMinerHaulerHandoff(context, manifest)) {
        throw new Error('ceres_miner_handoff_request_rejected');
      }
      this.bus.emit('mining:npcExtraction', {
        jobId: context.jobId,
        workId,
        minerId: context.entity.id,
        asteroidId: asteroid.id,
        fieldId: String(fieldId),
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        commodityId,
        extractedU,
        seq,
      });
      if (richClaim) {
        this.bus.emit('field:richSeamWorked', {
          ...richClaim,
          minerId: context.entity.id,
          asteroidId: asteroid.id,
          commodityId,
          extractedU,
        });
      }
      if (!stillCurrent()) {
        this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
        return false;
      }
    } catch {
      this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
      return false;
    }
    this.state.traffic.appliedMinerWorkIds.push(workId);
    this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
    if (context.slot && context.slot.id === CERES_SEAM_MINER_SLOT_ID) {
      this._committedCeresMinerWorkIds.add(workId);
      if (this._ceresCausal && this._ceresCausal.seeds.miner_loaded !== true) {
        this._ceresCausal.seeds.miner_loaded = true;
        this._emitCeresCausalReceipt(null, 'seed', {
          seeded: ['miner_loaded'],
          source: 'mining:npcExtraction',
          workId,
        });
      }
    }
    if (this.state.traffic.appliedMinerWorkIds.length > NPC_MINER_WORK_LEDGER_CAP) {
      this.state.traffic.appliedMinerWorkIds.splice(
        0,
        this.state.traffic.appliedMinerWorkIds.length - NPC_MINER_WORK_LEDGER_CAP,
      );
    }
    this._pruneCommittedCeresIds(
      this._committedCeresMinerWorkIds,
      this.state.traffic.appliedMinerWorkIds,
    );
    return true;
  },

  _pruneCommittedCeresIds(committedIds, retainedIds) {
    if (!committedIds || typeof committedIds.delete !== 'function' || !Array.isArray(retainedIds)) return;
    for (const id of committedIds) {
      if (!retainedIds.includes(id)) committedIds.delete(id);
    }
  },

  _resetTransientCausalLedgers(hard = false) {
    this._ensureState();
    this._ensureCausalLedgerSets();
    this.state.traffic.appliedArrivalIds = hard
      ? []
      : this.state.traffic.appliedArrivalIds
        .filter((id) => !this._committedCeresArrivalIds.has(id));
    if (hard) this.state.traffic.appliedLossIds = [];
    this.state.traffic.appliedMinerWorkIds = this.state.traffic.appliedMinerWorkIds
      .filter((id) => !this._committedCeresMinerWorkIds.has(id));
    this.state.traffic.appliedJobActionIds = [];
    // Salvor work receipts are transient like miner work — Continue may re-surface a legitimate cut.
    this.state.traffic.appliedSalvorWorkIds = [];
    this._committedCeresArrivalIds.clear();
    this._committedCeresMinerWorkIds.clear();
  },
};
