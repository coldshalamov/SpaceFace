// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { applyCaptainRouteMemory } from './captainMemory.js';
import { CINDER_RUN_COURIER_CONTACT_ID, NAMED_LANE_CONTACTS, PASSENGER_LINER_ITINERARY_KIND, PASSENGER_LINER_SERVICE, PASSENGER_LINER_SERVICE_SCHEMA, PRIORITY_COURIER_ITINERARY_KIND, PRIORITY_COURIER_JOB_SCHEMA, PRIORITY_COURIER_SERVICE, PRIORITY_COURIER_SERVICE_SCHEMA, carryPassengerLinerLastOutcome, isPassengerLinerItinerary, isPriorityCourierItinerary, pickNamedLaneContact } from '../data/laneContacts.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { deferredEnterNow } from '../core/sectorEnterDefer.js';
import { NPC_JOB_PHASE } from './npcJobs.js';
import { massline2Flag } from '../data/featureFlags.js';
import { makeShipEntitySpec } from './ships.js';
import { STATION_CREW_ROLES } from '../economy/stationConditions.js';
import { CERES_REFINERY_HAULER_SLOT_ID, CERES_SEAM_MINER_SLOT_ID, DOCK_RANGE, FREIGHTER_SHIP, MINER_FIELD_SPREAD_CAP, PASSENGER_LINER_ACTIVE_INCIDENT_STATUSES, PASSENGER_LINER_INCIDENT_MAX_AGE_S, PASSENGER_LINER_INVALIDATED_CAP, PASSENGER_LINER_RECEIPT_CAP, TRADE_INTERVAL_S, TRAFFIC_ROLES, compactStableIds, factionHullFor, isWorldSiteTrafficFallbackRole, lawPresenceRole, liveEntity, occupationalJobKind, passengerLinerLegIds, passengerLinerServiceForSector, priorityCourierServiceForSector, setIntent, stableTrafficKey, stationIdentity, stationName } from './traffic.js';

export const trafficJobOps = {
  // PQ-014 — natural NPC job assignment. Civilian traffic IS the natural producer for the three
  // job kinds: role 'miner' → miner job (home refinery ↔ asteroid field), 'hauler' → hauler job
  // (origin → destination terminal run), 'patrol' → patrol job (cyclic beat around a station).
  // Other roles keep their ambient stepper. Builds the route from the same in-sector stations /
  // asteroids the ambient steppers already use, so no new spawn fountain and no new geometry authority.
  _maybeAssignJob(ent, role, originStation, target, stations, sectorId) {
    // Helios' existing ore barge gathers the cutter's loose ore; it is not a second miner.
    if (role === 'ore_carrier' && sectorId === 'sector_helios_prime') return;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return;                 // runtime not registered → strict no-op
    if (!ent || !ent.data || !ent.data.worldRecordId) return; // no stable identity → not a durable job
    if (ent.data.worldSiteTrafficHookId || ent.data.claimTravelTrafficHookId) return; // infrastructure owns this slot
    const spec = this._buildJobSpec(role, ent, originStation, target, stations, sectorId);
    if (!spec) return;
    applyCaptainRouteMemory(this.state, ent, spec);
    const jobId = assign(ent, spec);
    if (jobId && (role === 'miner' || role === 'ore_carrier' || occupationalJobKind(role) === 'miner')) {
      // A commissioned barge departs empty. Its real cargo is created only when a materialized work
      // stop completes, so scanners never show a miner carrying random market goods outbound.
      const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === ent.id);
      this._setTrafficManifest(ent, rec, this._buildMinerManifest(ent, 0, null, 0, role));
    }
  },

  _buildJobSpec(role, ent, originStation, target, stations, sectorId) {
    const home = originStation && originStation.pos ? originStation : (stations && stations[0]);
    if (!home || !home.pos) return null;
    const priorityItinerary = role === 'courier'
      ? this._priorityCourierItinerary(ent, sectorId)
      : null;
    if (priorityItinerary) {
      const origin = this._stationForPriorityCourier(stations, priorityItinerary.originStationId);
      const destination = this._stationForPriorityCourier(stations, priorityItinerary.destinationStationId);
      if (!origin || !origin.pos || !destination || !destination.pos) return null;
      const manifest = ent && ent.data && ent.data.cargoManifest;
      if (!manifest || !Array.isArray(manifest.lines)) return null;
      return {
        kind: 'hauler',
        sectorId,
        speed: PRIORITY_COURIER_SERVICE.sprintSpeedWU,
        route: [
          { id: 'origin:' + stationIdentity(origin), pos: { x: origin.pos.x, z: origin.pos.z }, label: `${stationName(origin, 'Origin')} Berth` },
          { id: 'dest:' + stationIdentity(destination), pos: { x: destination.pos.x, z: destination.pos.z }, label: `${stationName(destination, 'Destination')} Gate` },
        ],
        payload: {
          manifest,
          priorityCourierService: {
            schema: PRIORITY_COURIER_JOB_SCHEMA,
            serviceId: PRIORITY_COURIER_SERVICE.id,
            legSeq: priorityItinerary.legSeq,
          },
        },
      };
    }
    if (role === 'miner' || role === 'ore_carrier' || occupationalJobKind(role) === 'miner') {
      // The seam this refinery actually works, not a rock drawn uniformly from the whole 4200-unit
      // sector. `spread` walks the nearest few faces so a shift's barges sit beside each other
      // instead of stacking on one; it is derived from the live job count, so it is deterministic
      // and does not consume the traffic RNG stream (which would move every later seeded draw).
      const spread = this.state.npcJobs && this.state.npcJobs.byId
        ? Object.keys(this.state.npcJobs.byId).length % MINER_FIELD_SPREAD_CAP
        : 0;
      const rockId = this._pickWorkableAsteroidNear(this.state, home, spread);
      const rock = rockId != null && this.state.entities ? this.state.entities.get(rockId) : null;
      if (!rock || !rock.pos) return null; // no field to work → keep the ambient miner stepper
      return {
        kind: 'miner', sectorId,
        route: [
          { id: 'home:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Refinery' },
          { id: 'field:' + rockId, pos: { x: rock.pos.x, z: rock.pos.z }, label: 'Belt' },
        ],
      };
    }
    if (role === 'tug') {
      // A tug's run is the tow. Its route therefore starts AT the body it came for and ends at the
      // yard that wants it, which is what puts the load inside `NPC_TOW_MAX_RANGE_WU` by the time
      // npcJobsRuntime opens the DEPART phase — the attachment forms because the tug is actually
      // there, not because a timer said so. No target means no job: a tug with nothing to drag is
      // exactly the decorative hull this role is not allowed to be.
      // `target` is the exact body the dispatcher booked this run for. Re-searching here could pick
      // a different one than the dispatcher claimed and leave the claim on the wrong body.
      const body = target && target.pos ? target : this._pickUnclaimedTowTarget(home);
      if (!body || !body.pos) return null;
      const yard = this._nearestStationTo(stations, home) || home;
      if (!yard || !yard.pos) return null;
      return {
        kind: 'hauler', sectorId,
        speed: TRAFFIC_ROLES.tug.speed,
        route: [
          { id: 'tow:' + body.id, pos: { x: body.pos.x, z: body.pos.z }, label: 'Tow' },
          { id: 'yard:' + stationIdentity(yard), pos: { x: yard.pos.x, z: yard.pos.z }, label: 'Yard' },
        ],
        payload: {
          role: 'tug',
          towTargetId: body.id,
          manifest: ent && ent.data && ent.data.cargoManifest ? ent.data.cargoManifest : null,
        },
      };
    }
    if (role === 'hauler' || role === 'arclight' || role === 'tanker' || occupationalJobKind(role) === 'hauler') {
      // The ambient stepper's target is deliberately random. Reusing it here can turn a local
      // terminal run into an express-scale crossing, so durable working freight chooses the nearest
      // other berth from its actual spawn/home station instead. Express liners keep their separate
      // itinerary path above and never enter this branch.
      const dest = this._nearestStationTo(stations, home);
      if (!dest || !dest.pos) return null; // only one station → nowhere to haul to
      return {
        kind: 'hauler', sectorId,
        route: [
          { id: 'origin:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Origin' },
          { id: 'dest:' + stationIdentity(dest), pos: { x: dest.pos.x, z: dest.pos.z }, label: 'Destination' },
        ],
        // The manifest was deterministically stamped by _assignManifest before job assignment.
        // Carry that exact detached descriptor through the job kernel instead of inventing a
        // hard-coded commodity that can disagree with the visible hull and destination market.
        payload: ent && ent.data && ent.data.cargoManifest
          ? { manifest: ent.data.cargoManifest }
          : null,
      };
    }
    if (role === 'surveyor') {
      // A grid, not a beat. The dossier's shift is "crab the grid — pulse, wait, pulse, log", so
      // the marks are laid out as an offset lattice rather than a ring: a ring reads as a patrol
      // circling something, and a surveyor is covering ground nobody has charted.
      const cx = home.pos.x; const cz = home.pos.z;
      const marks = [[300, 120], [520, -180], [180, -420], [-160, -140]];
      return {
        kind: 'surveyor', sectorId,
        route: marks.map(([ox, oz], i) => ({
          id: 'mark' + i, pos: { x: cx + ox, z: cz + oz }, label: 'Mark ' + (i + 1),
        })),
      };
    }
    if (role === 'salvor') {
      // General salvors only fly when a real takeable body exists (wreck salvagePool or loose
      // civilian-manifest payload). Never mint scrap into the job payload — value is claimed from
      // the live body on work completion. Ceres authored cast uses _assignCeresActivityJob instead.
      if (sectorId === CERES_ACTIVITY_SECTOR_ID) return null;
      const target = this._pickUnclaimedSalvageTarget(home);
      if (!target) return null;
      return this._buildSalvorJobSpec(home, target, sectorId);
    }
    if (role === 'tender' || occupationalJobKind(role) === 'tender') {
      // A call-out: berth to client hull and back. The client is another station rather than a
      // moving ship, because a tender's WORK phase holds station and welding onto something that
      // flies away mid-repair would contradict the "soft target by necessity" the Code promises.
      // The NEAREST other berth, not the most interesting one. A call-out is by definition local:
      // you are the rig that can be there before the seal fails. Measured before this constraint
      // existed, `_pickExpressDestination` handed a tender a client **12,757 units** away — a
      // three-minute transit leg at its planning speed, for a job whose whole premise is urgency,
      // and a hull that consequently spends its entire observable life in `transit`.
      const client = this._nearestStationTo(stations, home);
      if (!client || !client.pos) return null;
      return {
        kind: 'tender', sectorId,
        route: [
          { id: 'berth:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Berth' },
          { id: 'client:' + stationIdentity(client), pos: { x: client.pos.x, z: client.pos.z }, label: 'Call-out' },
        ],
      };
    }
    if (role === 'patrol' || occupationalJobKind(role) === 'patrol') {
      const R = 200; const cx = home.pos.x; const cz = home.pos.z;
      return {
        kind: 'patrol', sectorId,
        route: [
          { id: 'beat0', pos: { x: cx + R, z: cz }, label: 'Beat 1' },
          { id: 'beat1', pos: { x: cx, z: cz + R }, label: 'Beat 2' },
          { id: 'beat2', pos: { x: cx - R, z: cz }, label: 'Beat 3' },
          { id: 'beat3', pos: { x: cx, z: cz - R }, label: 'Beat 4' },
        ],
      };
    }
    return null;
  },

  _stationForPriorityCourier(stations, stationId) {
    return (stations || []).find((station) => stationIdentity(station) === stationId) || null;
  },

  _priorityCourierItinerary(entity, sectorId = null) {
    const data = entity && entity.data || {};
    const itinerary = data.itinerary;
    const activeSectorId = sectorId || (this.state.world && this.state.world.currentSectorId);
    if (data.trafficRole !== 'courier'
      || activeSectorId !== PRIORITY_COURIER_SERVICE.sectorId
      || !isPriorityCourierItinerary(itinerary)) return null;
    return this._normalizePriorityCourierItinerary(itinerary);
  },

  _normalizePriorityCourierItinerary(itinerary) {
    const prior = itinerary.escort && typeof itinerary.escort === 'object' ? itinerary.escort : {};
    const legSeq = itinerary.legSeq;
    const usedLegSeq = Number.isSafeInteger(prior.usedLegSeq) && prior.usedLegSeq >= 0
      ? prior.usedLegSeq
      : null;
    const active = prior.active === true && prior.legSeq === legSeq && usedLegSeq !== legSeq;
    itinerary.escort = {
      legSeq,
      active,
      requestedAt: active && Number.isFinite(prior.requestedAt) ? prior.requestedAt : null,
      heldS: active && Number.isFinite(prior.heldS) ? Math.max(0, Math.min(prior.heldS, PRIORITY_COURIER_SERVICE.escort.holdS)) : 0,
      usedLegSeq,
      creditS: usedLegSeq === legSeq && Number.isFinite(prior.creditS)
        ? Math.max(0, Math.min(prior.creditS, PRIORITY_COURIER_SERVICE.escort.recoveryCreditS))
        : 0,
    };
    return itinerary;
  },

  _priorityCourierDueAt(stations, originStationId, destinationStationId, departureAt) {
    const origin = this._stationForPriorityCourier(stations, originStationId);
    const destination = this._stationForPriorityCourier(stations, destinationStationId);
    if (!origin || !origin.pos || !destination || !destination.pos) return null;
    const distance = Math.hypot(destination.pos.x - origin.pos.x, destination.pos.z - origin.pos.z);
    // The existing one-shot hauler graph has commission/load/depart/approach/unload stops around
    // its physical transit. Keep that observable work in the saved deadline rather than pretending
    // a boost removes dock work.
    const jobOverheadS = 2 + 8 + 3 + 4 + 6;
    return departureAt + distance / PRIORITY_COURIER_SERVICE.sprintSpeedWU
      + jobOverheadS + PRIORITY_COURIER_SERVICE.dueSlackS;
  },

  _newPriorityCourierItinerary(stations, originStationId, destinationStationId, legSeq = 0) {
    const departureAt = (Number.isFinite(deferredEnterNow(this.state)) ? deferredEnterNow(this.state) : 0)
      + PRIORITY_COURIER_SERVICE.dwellS;
    const dueAt = this._priorityCourierDueAt(stations, originStationId, destinationStationId, departureAt);
    if (!Number.isFinite(dueAt)) return null;
    return {
      kind: PRIORITY_COURIER_ITINERARY_KIND,
      schema: PRIORITY_COURIER_SERVICE_SCHEMA,
      serviceId: PRIORITY_COURIER_SERVICE.id,
      contactId: PRIORITY_COURIER_SERVICE.contactId,
      sectorId: PRIORITY_COURIER_SERVICE.sectorId,
      originStationId,
      destinationStationId,
      legSeq,
      departureAt,
      dueAt,
      escort: {
        legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        usedLegSeq: null,
        creditS: 0,
      },
    };
  },

  _priorityCourierContact() {
    return NAMED_LANE_CONTACTS.find((contact) => contact.id === PRIORITY_COURIER_SERVICE.contactId) || null;
  },

  _priorityCourierStatus(entity, itinerary, jobEntry = null) {
    const job = jobEntry && jobEntry.job;
    if (job && (job.phase === NPC_JOB_PHASE.FLEE || jobEntry.control)) return 'INTERRUPTED';
    const escort = itinerary && itinerary.escort || {};
    const creditS = Number.isFinite(escort.creditS) ? Math.max(0, escort.creditS) : 0;
    const now = Number.isFinite(deferredEnterNow(this.state)) ? deferredEnterNow(this.state) : 0;
    if (now > itinerary.dueAt + creditS) return 'LATE';
    if (!entity.data.jobId && now < itinerary.departureAt) return 'BERTH';
    return 'ON_TIME';
  },

  _refreshPriorityCourierPresentation(entity, rec, stations, itinerary, jobEntry = null) {
    const status = this._priorityCourierStatus(entity, itinerary, jobEntry);
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    const route = `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    const stateLabel = status === 'BERTH' ? 'BERTHED'
      : status === 'INTERRUPTED' ? 'INTERRUPTED'
      : status === 'LATE' ? 'LATE SPRINT'
      : 'PRIORITY SPRINT';
    entity.data.priorityCourierState = status;
    entity.data.trafficLabel = `SPAN-HOLD · ${stateLabel} · ${route}`;
    entity.data.scanLabel = `${entity.data.trafficLabel} · OVERTAKE BURN`;
    rec.itinerary = itinerary;
    return status;
  },

  _stampPriorityCourierService(entity, rec, stations) {
    if (!entity || !entity.data || !rec || rec.role !== 'courier') return false;
    const current = this._priorityCourierItinerary(entity, PRIORITY_COURIER_SERVICE.sectorId);
    const itinerary = current || this._newPriorityCourierItinerary(
      stations,
      PRIORITY_COURIER_SERVICE.stops[0],
      PRIORITY_COURIER_SERVICE.stops[1],
    );
    if (!itinerary) return false;
    entity.data.itinerary = itinerary;
    const contact = this._priorityCourierContact();
    if (contact) this._stampNamedLaneContact(entity, contact);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    rec.priorityCourierService = PRIORITY_COURIER_SERVICE.id;
    rec.targetId = destination ? destination.id : rec.targetId;
    this._refreshPriorityCourierPresentation(entity, rec, stations, itinerary);
    return true;
  },

  _isPriorityCourierServiceCandidate(rec, entity) {
    const data = entity && entity.data;
    const flags = entity && entity.flags || {};
    const manifest = rec && rec.manifest || data && data.cargoManifest;
    const ai = data && data.ai;
    const isExactLegacyKess = data && data.namedLaneContactId === PRIORITY_COURIER_SERVICE.contactId;
    if (!rec || !entity || !data || entity.team !== TRAFFIC_ROLES.courier.team
      || rec.role === 'express' || rec.role === 'miner' || rec.role === 'ore_carrier' || rec.role === 'salvor'
      || (rec.role !== 'courier' && !isWorldSiteTrafficFallbackRole(rec.role))) return false;
    if (typeof data.worldRecordId !== 'string' || !data.worldRecordId
      || data.jobId || data.worldSiteTrafficHookId || data.claimTravelTrafficHookId
      || data.activityActorSlotId || data.ceresActivityCast || data.ceresActivityJobOwned
      || data.generalSalvor || (!isExactLegacyKess && data.namedLaneContactId) || data.missionId || data.missionTag
      || data.missionPinned || data.missionTargetSlot || data.contractId || data.persistent
      || data.worldRecordSlotId || data.hitchable || data.isBoss || data.encounterBoss || data.missionBoss
      || data.scenarioActorId || data.scenarioRole || data.itinerary || flags.missionPinned || flags.persistent) return false;
    if (rec.worldSiteRoute || rec.claimTravelRoute || rec.activityActorSlotId
      || rec.ceresActivityCast || rec.ceresActivityJobOwned || rec.generalSalvor || rec.jobId
      || rec.control || rec.controlLease || rec.itinerary) return false;
    if (ai && (ai.lawful === true || ai.pirate === true || ai.hostile === true
      || ai.spawnContext === 'patrol' || ai.isBoss === true || ai.missionTarget === true)) return false;
    // Ordinary ambient freight is retained for the Kess leg. Custody/lot manifests belong to an
    // active authored chain and must never be repurposed by this compatibility rebuild.
    if (manifest && (manifest.active === true || manifest.custody || manifest.lotId || manifest.lotSource
      || manifest.special === true || manifest.protected === true || manifest.reservedBy)) return false;
    return true;
  },

  _rebuildPriorityCourierService(entity, rec, sectorId, stations) {
    if (!this._isPriorityCourierServiceCandidate(rec, entity) || rec.role === 'courier') return false;
    const contact = this._priorityCourierContact();
    rec.role = 'courier';
    entity.data.defId = (contact && contact.ship) || TRAFFIC_ROLES.courier.ship;
    // Keep the durable record id. The ships owner refreshes physical hull stats when available;
    // the compact traffic fixtures still receive the presentation invalidation without a second
    // state writer or a replacement entity.
    this._stampTrafficDurableIdentity(entity, sectorId, 'courier', TRAFFIC_ROLES.courier, 0);
    const shipsSystem = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('ships')
      : null;
    if (shipsSystem && typeof shipsSystem.recomputeEntity === 'function') {
      shipsSystem.recomputeEntity(entity.id, []);
    } else if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ship:appearanceChanged', { id: entity.id });
    }
    return this._stampPriorityCourierService(entity, rec, stations);
  },

  _ensurePriorityCourierService(sectorId, stations) {
    if (!priorityCourierServiceForSector(sectorId)) return false;
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    for (const rec of list) {
      const entity = rec && liveEntity(this.state, rec.id);
      if (entity && this._priorityCourierItinerary(entity, sectorId)) {
        return this._stampPriorityCourierService(entity, rec, stations);
      }
    }
    const candidates = list
      .map((rec) => ({ rec, entity: rec && liveEntity(this.state, rec.id) }))
      .filter(({ rec, entity }) => this._isPriorityCourierServiceCandidate(rec, entity))
      .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
    // An exact, unowned legacy Kess courier wins before an ordinary fallback. Every other route
    // through this method uses the same predicate, so protected records cannot be relabelled.
    const candidate = candidates.find(({ rec }) => rec.role === 'courier') || candidates[0];
    if (!candidate) return false;
    if (candidate.rec.role === 'courier') {
      return this._stampPriorityCourierService(candidate.entity, candidate.rec, stations);
    }
    // A full legacy/Continue roster can be at cap before this service existed. Rebuild the chosen
    // idle civilian in place; never append a ninth contact.
    return this._rebuildPriorityCourierService(
      candidate.entity,
      candidate.rec,
      sectorId,
      stations,
    );
  },

  _priorityCourierJobEntry(entity) {
    const get = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const jobId = entity && entity.data && entity.data.jobId;
    return typeof get === 'function' && typeof jobId === 'string' ? get(jobId) : null;
  },

  _advancePriorityCourierEscort(entity, itinerary, jobEntry, dt) {
    const escort = itinerary && itinerary.escort;
    if (!escort || escort.active !== true || escort.legSeq !== itinerary.legSeq
      || escort.usedLegSeq === itinerary.legSeq) return false;
    const job = jobEntry && jobEntry.job;
    if (!job || job.phase !== NPC_JOB_PHASE.TRANSIT || jobEntry.control) return false;
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    if (!player || player.alive === false || !player.pos || !entity.pos) return false;
    const distance = Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
    const inEscortBand = distance >= PRIORITY_COURIER_SERVICE.escort.minRangeWU
      && distance <= PRIORITY_COURIER_SERVICE.escort.maxRangeWU;
    escort.heldS = inEscortBand
      ? Math.min(PRIORITY_COURIER_SERVICE.escort.holdS, escort.heldS + Math.max(0, Number(dt) || 0))
      : 0;
    if (escort.heldS < PRIORITY_COURIER_SERVICE.escort.holdS) return false;
    escort.active = false;
    escort.usedLegSeq = itinerary.legSeq;
    escort.creditS = PRIORITY_COURIER_SERVICE.escort.recoveryCreditS;
    return true;
  },

  _stepPriorityCourierService(entity, rec, stations, dt) {
    const itinerary = this._priorityCourierItinerary(entity);
    if (!itinerary) return false;
    const jobEntry = this._priorityCourierJobEntry(entity);
    this._advancePriorityCourierEscort(entity, itinerary, jobEntry, dt);
    const status = this._refreshPriorityCourierPresentation(entity, rec, stations, itinerary, jobEntry);
    if (entity.data.jobId) return true; // npcJobsRuntime remains the sole movement writer.

    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    if (!origin || !destination) {
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      return true;
    }
    if (status === 'BERTH') {
      rec.targetId = origin.id;
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      return true;
    }
    this._maybeAssignJob(entity, 'courier', origin, destination, stations, PRIORITY_COURIER_SERVICE.sectorId);
    if (!entity.data.jobId) setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
    return true;
  },

  _requestPriorityCourierEscort(response) {
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response && response.targetId)
      : null;
    const rec = target && this.state.traffic && Array.isArray(this.state.traffic.freighters)
      ? this.state.traffic.freighters.find((row) => row && row.id === target.id)
      : null;
    const itinerary = target && this._priorityCourierItinerary(target);
    if (!target || !rec || !itinerary) return false;
    const status = this._priorityCourierStatus(target, itinerary, this._priorityCourierJobEntry(target));
    const escort = itinerary.escort || {};
    if ((status !== 'LATE' && status !== 'INTERRUPTED')
      || escort.active === true || escort.usedLegSeq === itinerary.legSeq) return false;
    itinerary.escort = {
      legSeq: itinerary.legSeq,
      active: true,
      requestedAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      heldS: 0,
      usedLegSeq: Number.isSafeInteger(escort.usedLegSeq) ? escort.usedLegSeq : null,
      creditS: 0,
    };
    this._refreshPriorityCourierPresentation(target, rec, this._sectorStations(), itinerary,
      this._priorityCourierJobEntry(target));
    return true;
  },

  _advancePriorityCourierLeg(entity, rec, stations, itinerary) {
    const nextOrigin = itinerary.destinationStationId;
    const nextDestination = itinerary.originStationId;
    const nextLegSeq = itinerary.legSeq + 1;
    const next = this._newPriorityCourierItinerary(stations, nextOrigin, nextDestination, nextLegSeq);
    if (!next) return false;
    entity.data.itinerary = next;
    const origin = this._stationForPriorityCourier(stations, nextOrigin);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPriorityCourierPresentation(entity, rec, stations, next);
    return true;
  },

  _passengerLinerClaim(entity, sectorId = null) {
    const data = entity && entity.data || {};
    const itinerary = data.itinerary;
    const activeSectorId = sectorId || (this.state.world && this.state.world.currentSectorId);
    const worldRecordId = data.worldRecordId;
    if (data.trafficRole !== 'express'
      || activeSectorId !== PASSENGER_LINER_SERVICE.sectorId
      || typeof worldRecordId !== 'string' || !worldRecordId
      || !isPassengerLinerItinerary(itinerary)
      || itinerary.worldRecordId !== worldRecordId) return null;
    const custody = itinerary.custody || {};
    const ids = passengerLinerLegIds(worldRecordId, itinerary.legSeq);
    if (custody.passengerId !== ids.passengerId || custody.ticketId !== ids.ticketId
      || custody.receiptId !== ids.receiptId
      || custody.originStationId !== itinerary.originStationId
      || custody.destinationStationId !== itinerary.destinationStationId) return null;
    return itinerary;
  },

  _passengerLinerItinerary(entity, sectorId = null) {
    const itinerary = this._passengerLinerClaim(entity, sectorId);
    if (!itinerary) return null;
    const custody = itinerary.custody || {};
    const atOrigin = itinerary.state === 'BOARDING' || itinerary.state === 'DELAYED';
    const aboard = itinerary.state === 'EN_ROUTE' || itinerary.state === 'DIVERTING';
    if ((atOrigin && custody.state !== 'AT_ORIGIN') || (aboard && custody.state !== 'ONBOARD')) return null;
    if (!atOrigin && !aboard) return null;
    return this._normalizePassengerLinerItinerary(itinerary);
  },

  _normalizePassengerLinerItinerary(itinerary) {
    const prior = itinerary.assist && typeof itinerary.assist === 'object' ? itinerary.assist : {};
    const legSeq = itinerary.legSeq;
    const usedLegSeq = Number.isSafeInteger(prior.usedLegSeq) && prior.usedLegSeq >= 0
      ? prior.usedLegSeq
      : null;
    const active = prior.active === true && prior.legSeq === legSeq && usedLegSeq !== legSeq
      && typeof prior.targetWorldRecordId === 'string' && prior.targetWorldRecordId === itinerary.worldRecordId;
    itinerary.assist = {
      legSeq,
      active,
      requestedAt: active && Number.isFinite(prior.requestedAt) ? prior.requestedAt : null,
      heldS: active && Number.isFinite(prior.heldS)
        ? Math.max(0, Math.min(prior.heldS, PASSENGER_LINER_SERVICE.assist.holdS))
        : 0,
      targetWorldRecordId: active ? prior.targetWorldRecordId : null,
      usedLegSeq,
    };
    return itinerary;
  },

  _newPassengerLinerItinerary(entity, originStationId, destinationStationId, legSeq = 0) {
    const worldRecordId = entity && entity.data && entity.data.worldRecordId;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const now = Number.isFinite(deferredEnterNow(this.state)) ? deferredEnterNow(this.state) : 0;
    const departureAt = now + PASSENGER_LINER_SERVICE.dwellS;
    const ids = passengerLinerLegIds(worldRecordId, legSeq);
    return {
      kind: PASSENGER_LINER_ITINERARY_KIND,
      schema: PASSENGER_LINER_SERVICE_SCHEMA,
      serviceId: PASSENGER_LINER_SERVICE.id,
      sectorId: PASSENGER_LINER_SERVICE.sectorId,
      worldRecordId,
      originStationId,
      destinationStationId,
      legSeq,
      departureAt,
      dwellUntil: departureAt,
      state: 'BOARDING',
      delayedBy: null,
      diversion: null,
      lastOutcome: null,
      custody: {
        passengerId: ids.passengerId,
        ticketId: ids.ticketId,
        receiptId: ids.receiptId,
        state: 'AT_ORIGIN',
        originStationId,
        destinationStationId,
      },
      assist: {
        legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        targetWorldRecordId: null,
        usedLegSeq: null,
      },
    };
  },

  _passengerLinerStatusLabel(itinerary) {
    if (!itinerary) return 'SERVICE';
    if (itinerary.state === 'BOARDING') return 'BOARDING';
    if (itinerary.state === 'DELAYED') return 'DELAYED';
    if (itinerary.state === 'DIVERTING') return 'DIVERTING';
    if (itinerary.state === 'EN_ROUTE') return 'EN ROUTE';
    return String(itinerary.state || 'SERVICE').replace(/_/g, ' ');
  },

  _refreshPassengerLinerPresentation(entity, rec, stations, itinerary) {
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    const route = itinerary.state === 'DIVERTING'
      ? `${stationName(origin, itinerary.originStationId)} RETURN`
      : `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    const status = this._passengerLinerStatusLabel(itinerary);
    entity.data.passengerLinerService = PASSENGER_LINER_SERVICE.id;
    entity.data.passengerLinerState = itinerary.state;
    entity.data.hitchable = massline2Flag('hitchhiking') === true;
    entity.data.trafficLabel = `HELIOS CIVIC LINER · ${status} · ${route}`;
    entity.data.scanLabel = entity.data.hitchable
      ? `${entity.data.trafficLabel} · HITCHABLE`
      : entity.data.trafficLabel;
    if (!entity.data.name) entity.data.name = 'Helios Civic Liner';
    if (!entity.data.callsign) entity.data.callsign = 'HELIOS-LINE';
    rec.passengerLinerService = PASSENGER_LINER_SERVICE.id;
    rec.itinerary = itinerary;
  },

  _syncPassengerLinerWorldRecord(entity) {
    const world = this._registry && this._registry.get && this._registry.get('world');
    if (world && typeof world.upsertWorldRecord === 'function') {
      try { world.upsertWorldRecord(entity); } catch (_) { /* world residency will capture on save/demote */ }
    }
  },

  _passengerLinerIdIsSuspended(worldRecordId) {
    return typeof worldRecordId === 'string'
      && (this.state.traffic.passengerLinerSuspendedIds || []).includes(worldRecordId);
  },

  _invalidatePassengerLinerClaim(entity, rec) {
    const data = entity && entity.data || {};
    const worldRecordId = data.worldRecordId;
    if (typeof worldRecordId === 'string' && worldRecordId) {
      this.state.traffic.passengerLinerInvalidatedIds = compactStableIds([
        ...(this.state.traffic.passengerLinerInvalidatedIds || []), worldRecordId,
      ], PASSENGER_LINER_INVALIDATED_CAP);
    }
    delete data.passengerLinerService;
    delete data.passengerLinerState;
    delete data.itinerary;
    if (rec) {
      delete rec.passengerLinerService;
      delete rec.itinerary;
      rec.nextTradeT = Number.isFinite(rec.nextTradeT) ? rec.nextTradeT : TRADE_INTERVAL_S;
    }
    if (massline2Flag('hitchhiking')) {
      data.hitchable = true;
      data.scanLabel = 'EXPRESS LINER · HITCHABLE';
    } else {
      delete data.hitchable;
      data.scanLabel = 'EXPRESS LINER';
    }
    data.trafficLabel = TRAFFIC_ROLES.express.label;
  },

  _isPassengerLinerServiceCandidate(rec, entity) {
    const data = entity && entity.data;
    const flags = entity && entity.flags || {};
    const manifest = rec && rec.manifest || data && data.cargoManifest;
    const ai = data && data.ai;
    if (!rec || !entity || !data || rec.role !== 'express' || data.trafficRole !== 'express'
      || entity.team !== TRAFFIC_ROLES.express.team || data.defId !== FREIGHTER_SHIP
      || data.hitchable !== true || typeof data.worldRecordId !== 'string' || !data.worldRecordId
      || this._passengerLinerIdIsSuspended(data.worldRecordId)
      || (this.state.traffic.passengerLinerInvalidatedIds || []).includes(data.worldRecordId)) return false;
    if (data.jobId || data.worldSiteTrafficHookId || data.claimTravelTrafficHookId
      || data.activityActorSlotId || data.ceresActivityCast || data.ceresActivityJobOwned
      || data.generalSalvor || data.namedLaneContactId || data.missionId || data.missionTag
      || data.missionPinned || data.missionTargetSlot || data.contractId || data.persistent
      || data.worldRecordSlotId || data.isBoss || data.encounterBoss || data.missionBoss
      || data.scenarioActorId || data.scenarioRole || flags.missionPinned || flags.persistent) return false;
    if (rec.worldSiteRoute || rec.claimTravelRoute || rec.activityActorSlotId
      || rec.ceresActivityCast || rec.ceresActivityJobOwned || rec.generalSalvor || rec.jobId
      || rec.control || rec.controlLease) return false;
    if (ai && (ai.lawful === true || ai.pirate === true || ai.hostile === true
      || ai.spawnContext === 'patrol' || ai.isBoss === true || ai.missionTarget === true)) return false;
    const itinerary = data.itinerary;
    if (itinerary && itinerary.kind !== 'express_hitch_route') return false;
    if (manifest && (manifest.active === true || manifest.custody || manifest.lotId || manifest.lotSource
      || manifest.special === true || manifest.protected === true || manifest.reservedBy)) return false;
    return true;
  },

  _stampPassengerLinerService(entity, rec, stations) {
    if (!entity || !entity.data || !rec || rec.role !== 'express'
      || this._passengerLinerIdIsSuspended(entity.data.worldRecordId)) return false;
    const current = this._passengerLinerItinerary(entity, PASSENGER_LINER_SERVICE.sectorId);
    const itinerary = current || this._newPassengerLinerItinerary(
      entity,
      PASSENGER_LINER_SERVICE.stops[0],
      PASSENGER_LINER_SERVICE.stops[1],
    );
    if (!itinerary) return false;
    entity.data.itinerary = itinerary;
    delete entity.data.cargoManifest;
    rec.manifest = null;
    rec.nextTradeT = Number.POSITIVE_INFINITY;
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _ensurePassengerLinerService(sectorId, stations) {
    if (!passengerLinerServiceForSector(sectorId)) return false;
    this._ensureState();
    // The single civic service is suspended after its exact hull is lost. Do not silently replace
    // it with another ambient express on a later residency pass.
    if ((this.state.traffic.passengerLinerSuspendedIds || []).length) return false;
    const list = this.state.traffic.freighters || [];
    for (const rec of list) {
      const entity = rec && liveEntity(this.state, rec.id);
      const claimed = entity && entity.data && entity.data.itinerary
        && (entity.data.itinerary.kind === PASSENGER_LINER_ITINERARY_KIND
          || entity.data.itinerary.serviceId === PASSENGER_LINER_SERVICE.id);
      if (!claimed) continue;
      const itinerary = this._passengerLinerItinerary(entity, sectorId);
      if (itinerary) return this._stampPassengerLinerService(entity, rec, stations);
      // A corrupt passenger envelope must become an ordinary express, never a fresh service with
      // an invented passenger claim on the same load.
      this._invalidatePassengerLinerClaim(entity, rec);
      return false;
    }
    const candidates = list
      .map((rec) => ({ rec, entity: rec && liveEntity(this.state, rec.id) }))
      .filter(({ rec, entity }) => this._isPassengerLinerServiceCandidate(rec, entity))
      .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
    const candidate = candidates[0];
    return candidate ? this._stampPassengerLinerService(candidate.entity, candidate.rec, stations) : false;
  },

  _activePassengerLinerCoalitionIncident() {
    const incidents = this.state && this.state.lawSecurity && this.state.lawSecurity.incidents;
    const now = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    if (!incidents || typeof incidents !== 'object' || Array.isArray(incidents)) return null;
    const eligible = [];
    for (const key of Object.keys(incidents).sort()) {
      const incident = incidents[key];
      if (!incident || typeof incident !== 'object' || Array.isArray(incident)
        || incident.stationId !== 'station_coalition'
        || typeof incident.id !== 'string' || !incident.id
        || !PASSENGER_LINER_ACTIVE_INCIDENT_STATUSES.has(incident.status)
        || !Number.isFinite(incident.startedAt) || incident.startedAt < 0
        || incident.startedAt > now || now - incident.startedAt > PASSENGER_LINER_INCIDENT_MAX_AGE_S
        || incident.resolvedAt != null) continue;
      eligible.push(incident);
    }
    return eligible[0] || null;
  },

  _beginPassengerLinerAssist(response) {
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response && response.targetId)
      : null;
    const rec = target && (this.state.traffic.freighters || []).find((row) => row && row.id === target.id);
    const itinerary = target && this._passengerLinerItinerary(target);
    if (!target || !rec || rec.passengerLinerService !== PASSENGER_LINER_SERVICE.id || !itinerary
      || itinerary.state !== 'BOARDING' || itinerary.custody.state !== 'AT_ORIGIN'
      || this.state.player && this.state.player.targetId !== target.id) return false;
    const assist = itinerary.assist || {};
    if (assist.active === true || assist.usedLegSeq === itinerary.legSeq) return false;
    itinerary.assist = {
      legSeq: itinerary.legSeq,
      active: true,
      requestedAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      heldS: 0,
      targetWorldRecordId: itinerary.worldRecordId,
      usedLegSeq: Number.isSafeInteger(assist.usedLegSeq) ? assist.usedLegSeq : null,
    };
    this._refreshPassengerLinerPresentation(target, rec, this._sectorStations(), itinerary);
    this._syncPassengerLinerWorldRecord(target);
    return true;
  },

  _advancePassengerLinerAssist(entity, rec, itinerary, dt) {
    const assist = itinerary.assist;
    if (!assist || assist.active !== true || assist.legSeq !== itinerary.legSeq
      || assist.usedLegSeq === itinerary.legSeq || assist.targetWorldRecordId !== itinerary.worldRecordId
      || itinerary.state !== 'BOARDING' || itinerary.custody.state !== 'AT_ORIGIN') return false;
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    const stableTarget = this.state.player && this.state.player.targetId === entity.id;
    const liveSector = this.state.world && this.state.world.currentSectorId === PASSENGER_LINER_SERVICE.sectorId;
    if (!player || player.alive === false || !player.pos || !entity.pos || !stableTarget || !liveSector) {
      assist.heldS = 0;
      return false;
    }
    const distance = Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
    const inFormation = distance >= PASSENGER_LINER_SERVICE.assist.minRangeWU
      && distance <= PASSENGER_LINER_SERVICE.assist.maxRangeWU;
    assist.heldS = inFormation
      ? Math.min(PASSENGER_LINER_SERVICE.assist.holdS, assist.heldS + Math.max(0, Number(dt) || 0))
      : 0;
    if (assist.heldS < PASSENGER_LINER_SERVICE.assist.holdS) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    assist.active = false;
    assist.usedLegSeq = itinerary.legSeq;
    itinerary.dwellUntil = now;
    itinerary.departureAt = Math.min(itinerary.departureAt, now);
    this._refreshPassengerLinerPresentation(entity, rec, this._sectorStations(), itinerary);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _passengerLinerReceiptText(outcome) {
    if (outcome === 'RETURNED') return 'HELIOS CIVIC LINER RETURNED TO HELIOS — COALITION SERVICE DIVERTED.';
    if (outcome === 'LOST') return 'HELIOS CIVIC LINER LOST — SERVICE SUSPENDED.';
    return 'HELIOS CIVIC LINER ARRIVED AT COALITION — PASSENGER SERVICE COMPLETE.';
  },

  _settlePassengerLinerLeg(entity, rec, itinerary, outcome, stationId) {
    const receiptId = itinerary.custody && itinerary.custody.receiptId;
    if (typeof receiptId !== 'string' || !receiptId) return false;
    const trafficState = this.state.traffic;
    const applied = trafficState.passengerReceiptIds || [];
    const fresh = !applied.includes(receiptId);
    if (fresh) {
      trafficState.passengerReceiptIds = compactStableIds([...applied, receiptId], PASSENGER_LINER_RECEIPT_CAP);
    }
    itinerary.state = outcome;
    itinerary.lastOutcome = {
      outcome,
      receiptId,
      stationId: stationId || null,
      settledAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
    };
    itinerary.custody.state = outcome;
    if (fresh && this.bus && typeof this.bus.emit === 'function') {
      const receipt = {
        receiptId,
        serviceId: PASSENGER_LINER_SERVICE.id,
        worldRecordId: itinerary.worldRecordId,
        legSeq: itinerary.legSeq,
        passengerId: itinerary.custody.passengerId,
        ticketId: itinerary.custody.ticketId,
        outcome,
        stationId: stationId || null,
        sectorId: PASSENGER_LINER_SERVICE.sectorId,
      };
      this.bus.emit('traffic:passengerLinerReceipt', receipt);
      this.bus.emit('news:publish', {
        ...receipt,
        text: this._passengerLinerReceiptText(outcome),
        kind: 'passenger_liner_service',
        sourceRef: 'traffic:helios-civic-liner',
        channelId: 'news',
      });
    }
    this._syncPassengerLinerWorldRecord(entity);
    return fresh;
  },

  _advancePassengerLinerLeg(entity, rec, stations, itinerary, outcome) {
    const nextOrigin = outcome === 'RETURNED'
      ? itinerary.originStationId
      : itinerary.destinationStationId;
    const nextDestination = outcome === 'RETURNED'
      ? itinerary.destinationStationId
      : itinerary.originStationId;
    const next = this._newPassengerLinerItinerary(entity, nextOrigin, nextDestination, itinerary.legSeq + 1);
    if (!next) return false;
    carryPassengerLinerLastOutcome(itinerary, next);
    entity.data.itinerary = next;
    const origin = this._stationForPriorityCourier(stations, nextOrigin);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPassengerLinerPresentation(entity, rec, stations, next);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _stepPassengerLinerService(entity, rec, stations, dt) {
    const itinerary = this._passengerLinerItinerary(entity);
    if (!itinerary || rec.passengerLinerService !== PASSENGER_LINER_SERVICE.id) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const incident = this._activePassengerLinerCoalitionIncident();
    if (itinerary.state === 'BOARDING' || itinerary.state === 'DELAYED') {
      if (incident) {
        itinerary.state = 'DELAYED';
        itinerary.delayedBy = { incidentId: incident.id, startedAt: incident.startedAt };
      } else if (itinerary.state === 'DELAYED') {
        itinerary.state = 'BOARDING';
        itinerary.delayedBy = null;
      }
      this._advancePassengerLinerAssist(entity, rec, itinerary, dt);
      if (itinerary.state === 'BOARDING' && now >= itinerary.departureAt) {
        itinerary.state = 'EN_ROUTE';
        itinerary.custody.state = 'ONBOARD';
        itinerary.departedAt = now;
      }
      if (itinerary.state !== 'EN_ROUTE') {
        const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
        rec.targetId = origin ? origin.id : rec.targetId;
        setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
        this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
        return true;
      }
    }
    if (itinerary.state === 'EN_ROUTE' && incident
      && itinerary.originStationId === 'station_helios'
      && itinerary.destinationStationId === 'station_coalition') {
      itinerary.state = 'DIVERTING';
      itinerary.diversion = {
        incidentId: incident.id,
        startedAt: incident.startedAt,
        returnStationId: 'station_helios',
      };
    }
    const travelStationId = itinerary.state === 'DIVERTING'
      ? itinerary.diversion && itinerary.diversion.returnStationId
      : itinerary.destinationStationId;
    const target = this._stationForPriorityCourier(stations, travelStationId);
    if (!target || !target.pos) {
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
      return true;
    }
    rec.targetId = target.id;
    const dx = target.pos.x - entity.pos.x;
    const dz = target.pos.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const aimAngle = Math.atan2(dz, dx);
    if (distance < DOCK_RANGE) {
      const outcome = itinerary.state === 'DIVERTING' ? 'RETURNED' : 'DELIVERED';
      this._settlePassengerLinerLeg(entity, rec, itinerary, outcome, travelStationId);
      this._advancePassengerLinerLeg(entity, rec, stations, itinerary, outcome);
      setIntent(entity, 0, 0, false, false, null, aimAngle);
      return true;
    }
    setIntent(entity, 0, 1, massline2Flag(
      'hitchhiking', this.state.runtime && this.state.runtime.features,
    ), false, null, aimAngle);
    this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
    return true;
  },

  _clearStalePassengerLinerDelays() {
    for (const rec of this.state.traffic && this.state.traffic.freighters || []) {
      const entity = rec && liveEntity(this.state, rec.id);
      const itinerary = entity && this._passengerLinerItinerary(entity);
      if (!itinerary || itinerary.state !== 'DELAYED') continue;
      itinerary.state = 'BOARDING';
      itinerary.delayedBy = null;
      itinerary.assist = {
        legSeq: itinerary.legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        targetWorldRecordId: null,
        usedLegSeq: itinerary.assist && Number.isSafeInteger(itinerary.assist.usedLegSeq)
          ? itinerary.assist.usedLegSeq
          : null,
      };
      this._refreshPassengerLinerPresentation(entity, rec, this._sectorStations(), itinerary);
      this._syncPassengerLinerWorldRecord(entity);
    }
  },

  /**
   * Prefer Helios Station (or first station) as the pocket density anchor so ≥3 freighters
   * sit inside default radar/sensor range of the first-hour play space.
   */
  _pocketStation(stations, sectorId) {
    if (!stations || !stations.length) return null;
    if (sectorId === 'sector_helios_prime') {
      for (const s of stations) {
        const id = (s.data && (s.data.stationId || s.data.id)) || s.id;
        if (id === 'station_helios') return s;
      }
    }
    return stations[0];
  },

  /**
   * Stamp exactly one deterministic named lane contact onto ambient traffic in this sector
   * (or spawn a dedicated freighter if none match the contact's role). Reuses freight causality
   * manifests — no parallel economy authority. Idempotent per sector presence.
   */
  _offerCeresTenderRumor() {
    this._ensureState();
    const trafficState = this.state.traffic;
    if (trafficState.ceresTenderRumorSent) return;
    trafficState.ceresTenderRumorSent = true;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('uniqueWreck:rumorHeard', {
      wreckId: 'wreck_dmc_refinery_tender',
      sourceRef: 'bar.station_ceres.refinery_tender',
      channelId: 'bar',
      text: 'A refinery tender went dark on the Ceres seam. The manifest is still aboard.',
    });
  },

  _onCeresTenderWreckResolved(payload) {
    if (!payload || payload.wreckId !== 'wreck_dmc_refinery_tender') return;
    this._ensureState();
    const effects = this.state.traffic.ceresPocketEffects
      || (this.state.traffic.ceresPocketEffects = {});
    const now = this.state.simTime || 0;
    if (payload.choiceId === 'strip') {
      effects.salvorQuietUntil = now + 600;
      effects.tenderJob = 'quiet';
      return;
    }
    if (payload.choiceId === 'return_manifest') {
      effects.tenderJob = 'resumed';
      effects.salvorQuietUntil = 0;
    }
  },

  _ensureNamedLaneContact(sectorId, sector, stations) {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
      this._offerCeresTenderRumor();
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const contact = pickNamedLaneContact(sectorId, seed);
      if (!contact || contact.id !== 'lane_rell_moisture') return;
      let miner = null;
      for (const rec of list) {
        const entity = rec && liveEntity(this.state, rec.id);
        if (!entity || !entity.data) continue;
        if (entity.data.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID) {
          miner = entity;
          continue;
        }
        if (entity.data.namedLaneContactId === contact.id) {
          delete entity.data.namedLaneContactId;
          delete entity.data.name;
          delete entity.data.callsign;
          delete entity.data.gimmick;
          delete entity.data.scanLabel;
          if (entity.data.trafficLabel === contact.callsign) {
            const role = entity.data.trafficRole;
            entity.data.trafficLabel = (TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler).label;
          }
          if (entity.data.ai && entity.data.ai.name === contact.name) delete entity.data.ai.name;
          if (entity.data.ai && entity.data.ai.namedLaneContactId === contact.id) {
            delete entity.data.ai.namedLaneContactId;
          }
        }
      }
      if (miner) this._stampNamedLaneContact(miner, contact);
      const second = NAMED_LANE_CONTACTS.find((row) => row && row.id === 'lane_jorah_seam_haul');
      if (second) {
        for (const rec of list) {
          const entity = rec && liveEntity(this.state, rec.id);
          if (!entity || !entity.data) continue;
          if (entity.data.activityActorSlotId !== CERES_REFINERY_HAULER_SLOT_ID) continue;
          if (entity.data.namedLaneContactId && entity.data.namedLaneContactId !== second.id) continue;
          this._stampNamedLaneContact(entity, second);
          break;
        }
      }
      return;
    }
    // Tethys has one explicit Kess service. Never let the generic named-contact fallback append a
    // second courier when an old/full ambient roster lacks a reusable courier slot.
    if (priorityCourierServiceForSector(sectorId)) {
      this._ensurePriorityCourierService(sectorId, stations);
      return;
    }
    // PQ-143.02 one-off: the Cinder Run Courier is an authored fixture of the start sector —
    // stamped deterministically on her own dedicated express slot every pass (never the seed-hash
    // pick), so the default route always has its far-too-fast courier. The generic
    // single-named-contact rule below ignores her slot, so the sector's picked contact (Mira or
    // Kess) still appears alongside her.
    this._ensureCinderRunCourierFixture(sectorId, sector, stations, list);
    this._ensureHeliosArclightFixture(sectorId, sector, stations, list);
    this._ensureHeliosTankerFixture(sectorId, sector, stations, list);
    this._ensureHeliosCustomsFixture(sectorId, sector, stations, list);
    this._ensureHeliosMemorialTourist(sectorId, sector, stations, list);
    // Already have a live named contact? (The courier's dedicated fixture slot does not count.)
    for (const rec of list) {
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (e && e.alive && e.data && e.data.namedLaneContactId
        && e.data.namedLaneContactId !== CINDER_RUN_COURIER_CONTACT_ID) return;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const contact = pickNamedLaneContact(sectorId, seed);
    if (!contact) return;

    // Prefer an existing freighter with matching role. If none matches, spawn the authored
    // contact's own role/hull; never put a courier identity on a patrol (or vice versa).
    let rec = list.find((r) => r.role === contact.role) || null;
    let ent = rec && this.state.entities.get(rec.id);
    if (!ent || !ent.alive) {
      if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
      const role = contact.role || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const station = this._pocketStation(stations, sectorId) || stations[0];
      const ang = this._rng() * Math.PI * 2;
      const r = 110 + this._rng() * 80;
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      const aiSpec = {
        archetype: def.archetype,
        passive: true,
        spawnContext: lawPresenceRole(role) ? 'patrol' : 'convoy_civilian',
      };
      if (lawPresenceRole(role)) aiSpec.lawful = true;
      // A named lane contact names its own hull; that identity outranks the faction fleet, so only
      // an unnamed contact falling back to the role default is eligible for substitution.
      const laneFaction = (sector && sector.factionId) || 'faction_free';
      const spec = makeShipEntitySpec(
        contact.ship || factionHullFor(def.ship, laneFaction, () => this._rng()),
        {
          team: def.team,
          factionId: laneFaction,
          pos,
          ai: aiSpec,
        },
      );
      ent = this.helpers.spawnEntity(spec);
      if (!ent) return;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, list.length);
      if (ent.data && STATION_CREW_ROLES.includes(role)) ent.data.homeStationId = stationIdentity(station);
      const target = this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._active.push(ent.id);
      rec = {
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 3,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: 0,
        manifest,
      };
      list.push(rec);
    }
    this._stampNamedLaneContact(ent, contact);
  },

  _stampNamedLaneContact(ent, contact) {
    if (!ent || !contact) return;
    if (!ent.data) ent.data = {};
    ent.data.namedLaneContactId = contact.id;
    ent.data.name = contact.name;
    ent.data.callsign = contact.callsign;
    ent.data.gimmick = contact.gimmick;
    ent.data.trafficLabel = contact.callsign;
    ent.data.scanLabel = contact.callsign;
    // A hitchable express keeps teaching the affordance under her callsign — the contact stamp
    // otherwise rewrites 'EXPRESS LINER · … · HITCHABLE' down to a bare name and the first-hour
    // hitch read disappears with it.
    if (ent.data.hitchable === true && !/HITCHABLE/i.test(ent.data.scanLabel)) {
      ent.data.scanLabel = `${contact.callsign} · HITCHABLE`;
    }
    if (contact.hail) ent.data.hail = contact.hail;
    if (contact.memoryHook) ent.data.memoryHook = contact.memoryHook;
    if (!ent.data.ai) ent.data.ai = {};
    ent.data.ai.name = contact.name;
    // NXI-165: the contact id also rides the durable ai record (captured by worldRecords and
    // rebound with the hull), so a rematerialized/re-adopted worker can heal its live stamp —
    // the name follows the stable worker record instead of being re-picked onto a second hull.
    ent.data.ai.namedLaneContactId = contact.id;
    // Named patrol keeps lawful; named freighter stays passive civilian.
    if (lawPresenceRole(contact.role)) {
      ent.data.ai.lawful = true;
      ent.data.ai.spawnContext = 'patrol';
    }
  },
};
