// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { forEachFieldRock, forEachJobInteractable, forEachLivingWorldActor } from '../world/livingWorldViews.js';
import { spawnJettisonedCargoPod } from './lootShards.js';
import { hash32 } from '../core/rng.js';
import { getAsteroidFieldRock, promoteAsteroidFieldRock } from '../world/asteroidField.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { DRIVE_FAMILIES, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { isMasslineLatchedPickup } from './mining.js';
import { deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { shouldRunOnTick } from '../core/activityScheduler.js';
import { FREIGHT_MARKET_KEYS_FALLBACK, buildCargoManifest } from '../economy/freightCausality.js';
import { makeShipEntitySpec } from './ships.js';
import { AMBUSH_LOADED_HAULER_COMMODITY_ID, AMBUSH_LOADED_HAULER_QTY, CERES_AMBUSH_HAULER_SLOT_ID, CIVILIAN_ALARM_FLEE_ROLES, CIVILIAN_ALARM_HOLD_ROLES, CIVILIAN_ALARM_TTL_S, CIVILIAN_DISTRESS_COOLDOWN_S, CIVILIAN_DISTRESS_RADIUS_WU, CIVILIAN_HAULER_DUMP_ROLES, CIVILIAN_MANIFEST_PAYLOAD_TYPE, CIVILIAN_VIOLENCE_RADIUS_SQ, CIVILIAN_VIOLENCE_RING_CAP, DOCK_RANGE, HAULER_SPILL_POD_RADIUS, HAULER_SPILL_VEL_FRACTION, HELIOS_BERTH_MAX_DRIFT, HELIOS_TALLY_COUNT_S, HELIOS_TALLY_LEDGER_CAP, HELIOS_TALLY_REACH, HELIOS_TALLY_STILL, MINER_FIELD_SPREAD_CAP, RESCUE_CALLER_STANDDOWN_S, SALVOR_NOTICE_DELAY_MIN_S, SALVOR_NOTICE_DELAY_SPAN_S, SALVOR_WORK_LEDGER_CAP, SPILL_ANNOUNCE_NOTICE_S, SPILL_POD_CARRIER_RADIUS, STATION_TO_SECTOR, TRAFFIC_ROLES, WELL_DRAG_DANGER, WELL_DRAG_ESCORT_CAP, WELL_DRAG_FULL_HOLD_QTY, WELL_DRAG_PRESSURE_MAX, WELL_DRAG_PRESSURE_MIN, WELL_DRAG_RECOVER_S, WELL_DRAG_REGROUP_S, WELL_DRAG_SEEN_CAP, entityPos, factionHullFor, heliosFreightDisposition, isShipDisabled, isSurvivalCohort, normalizeHeliosFreightTally, pointInHeliosMemorial, setIntent, stationIdentity, validCausalManifest } from './traffic.js';

export const trafficRoleOps = {
  // ── Role behaviors (spec §12.1) ────────────────────────────────────────────────────────────
  _ensureCivilianViolenceRing() {
    if (!this._violenceRing || this._violenceRing.length !== CIVILIAN_VIOLENCE_RING_CAP) {
      this._violenceRing = new Array(CIVILIAN_VIOLENCE_RING_CAP);
      for (let i = 0; i < CIVILIAN_VIOLENCE_RING_CAP; i++) {
        this._violenceRing[i] = { x: 0, z: 0, t: -Infinity, attackerId: null, victimId: null };
      }
    }
    if (this._violenceWrite == null) this._violenceWrite = 0;
    if (!this._violenceThreatScratch) {
      this._violenceThreatScratch = {
        entityId: null, x: 0, z: 0, untilSimT: 0, hold: false, slow: false,
      };
    }
  },

  _clearCivilianViolenceMemory() {
    this._ensureCivilianViolenceRing();
    for (let i = 0; i < this._violenceRing.length; i++) {
      const slot = this._violenceRing[i];
      slot.x = 0;
      slot.z = 0;
      slot.t = -Infinity;
      slot.attackerId = null;
      slot.victimId = null;
    }
    this._violenceWrite = 0;
    const list = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        if (!rec) continue;
        rec.violenceAlarmed = false;
        rec.violenceResumeTargetId = null;
      }
    }
  },

  _recordViolence(x, z, attackerId, victimId, t) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this._ensureCivilianViolenceRing();
    const slot = this._violenceRing[this._violenceWrite];
    slot.x = x;
    slot.z = z;
    slot.t = Number.isFinite(t) ? t : 0;
    slot.attackerId = attackerId == null ? null : attackerId;
    slot.victimId = victimId == null ? null : victimId;
    this._violenceWrite = (this._violenceWrite + 1) % CIVILIAN_VIOLENCE_RING_CAP;
  },

  _onCombatDamage(payload) {
    const p = payload || {};
    if (!(Number(p.applied) > 0)) return;
    // Scripted traffic-incident packets (drive impairment, scuttle) are internal mechanics, not
    // witnessed violence: recording them would panic nearby civilians and spill the victim's
    // causal manifest, which breaks the incident's own handoff binding.
    if (p.origin && typeof p.origin.kind === 'string' && p.origin.kind.startsWith('traffic_')) return;
    const attackerId = p.attackerId != null ? p.attackerId
      : p.sourceId != null ? p.sourceId
        : null;
    const victimId = p.targetId != null ? p.targetId : p.id;
    const state = this.state;
    const victim = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(victimId)
      : null;
    if (victim && victim.type && victim.type !== 'ship') return;
    const attacker = attackerId != null && state && state.entities
      ? state.entities.get(attackerId)
      : null;
    if (isSurvivalCohort(attacker) || isSurvivalCohort(victim)) return;
    let x = Number(p.pos && p.pos.x);
    let z = Number(p.pos && p.pos.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const from = entityPos(attacker) || entityPos(victim);
      if (!from) return;
      x = from.x;
      z = from.z;
    }
    this._recordViolence(x, z, attackerId, victimId, Number.isFinite(state && state.simTime) ? state.simTime : 0);
    // The spill names what landed: a whip-flung mass reads as the mass, not as gunfire.
    const cause = p.origin && typeof p.origin.kind === 'string' ? p.origin.kind : 'combat_damage';
    this._spillHaulerCargoFromViolence(victim, attacker, cause);
    if (victim) {
      this._broadcastCivilianDistress(victim, attacker, 'combat_damage');
    }
  },

  _combatAimedShipVictim(shooter, payload) {
    const p = payload || {};
    const data = shooter && shooter.data || {};
    const combatId = data.combat && data.combat.targetId;
    const activityId = data.ai && data.ai.activity && data.ai.activity.targetId;
    const raw = combatId != null ? combatId
      : activityId != null ? activityId
        : (p.targetId != null ? p.targetId : null);
    if (raw == null) return null;
    const state = this.state;
    const victim = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(raw)
      : null;
    if (!victim || victim.alive === false || victim.type !== 'ship') return null;
    return victim;
  },

  _onCombatFire(payload) {
    const p = payload || {};
    // Real weapons fire carries ownerId + muzzle origin. Synthetic empty-space fire does not.
    const ownerId = p.ownerId != null ? p.ownerId : null;
    const origin = p.origin || p.from;
    if (ownerId == null || !origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return;
    const state = this.state;
    const shooter = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(ownerId)
      : null;
    if (!shooter || shooter.type !== 'ship') return;
    if (isSurvivalCohort(shooter)) return;
    const victim = this._combatAimedShipVictim(shooter, p);
    const sectorId = state && state.world && state.world.currentSectorId;
    const originInMemorial = pointInHeliosMemorial(sectorId, origin.x, origin.z);
    // Bare fire is ignored on the lanes. Shots whose muzzle is on the memorial disc
    // are the firefight reaching the array, even with no ship under the sights.
    if (!victim && !originInMemorial) return;
    if (victim && isSurvivalCohort(victim)) return;
    const t = Number.isFinite(state && state.simTime) ? state.simTime : 0;
    if (originInMemorial) this._recordViolence(origin.x, origin.z, ownerId, null, t);
    if (!victim) return;
    // Stamp the threatened hull, not the muzzle: witnesses (including the hull) sit in the 300 WU
    // bubble. Leave victimId empty so the existing combatant-skip still applies only to confirmed hits.
    const at = entityPos(victim) || origin;
    this._recordViolence(at.x, at.z, ownerId, null, t);
    this._spillHaulerCargoFromViolence(victim, shooter, 'combat_fire');
    this._broadcastCivilianDistress(victim, shooter, 'combat_fire');
  },

  _findNearbyDisabledShip(state, tug, maxRadius = 1500) {
    if (!state || !tug || !tug.pos) return null;
    const maxR2 = maxRadius * maxRadius;
    let best = null;
    let bestDist2 = maxR2;
    const checkCandidate = (candidate) => {
      if (!candidate || candidate.id === tug.id || candidate.alive === false || candidate.type !== 'ship') return;
      if (!candidate.pos) return;
      const dx = candidate.pos.x - tug.pos.x;
      const dz = candidate.pos.z - tug.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxR2 || d2 >= bestDist2) return;
      if (isShipDisabled(candidate, state)) {
        bestDist2 = d2;
        best = candidate;
      }
    };
    if (state.entityIndex || (state.entityList && state.entityList.length > 0)) {
      forEachLivingWorldActor(state, checkCandidate);
    } else if (state.entities && typeof state.entities.forEach === 'function') {
      state.entities.forEach(checkCandidate);
    }
    return best;
  },

  _broadcastCivilianDistress(caller, threatEnt, cause = 'threat') {
    if (!caller || !caller.pos) return null;
    const now = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    const data = caller.data || (caller.data = {});
    if (data.lastDistressSimT && (now - data.lastDistressSimT < CIVILIAN_DISTRESS_COOLDOWN_S)) {
      return null;
    }
    data.lastDistressSimT = now;

    const callerPos = entityPos(caller);
    if (!callerPos) return null;
    const threatPos = entityPos(threatEnt);
    const radius = CIVILIAN_DISTRESS_RADIUS_WU;
    const radiusSq = radius * radius;

    const recipients = [];
    let routedToPlayer = false;

    const player = this.state && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(this.state.playerId)
      : null;
    if (player && player.alive !== false && player.pos) {
      const pdx = player.pos.x - callerPos.x;
      const pdz = player.pos.z - callerPos.z;
      if (pdx * pdx + pdz * pdz <= radiusSq) {
        routedToPlayer = true;
        recipients.push(player.id);
      }
    }

    if (this.state && this.state.entities && typeof this.state.entities.forEach === 'function') {
      forEachLivingWorldActor(this.state, (ent) => {
        if (!ent || ent.id === caller.id || ent.alive === false || ent.type !== 'ship') return;
        if (ent.id === (this.state && this.state.playerId)) return;
        if (!ent.pos) return;
        const dx = ent.pos.x - callerPos.x;
        const dz = ent.pos.z - callerPos.z;
        if (dx * dx + dz * dz <= radiusSq) {
          recipients.push(ent.id);
        }
      });
    }

    const payload = {
      callerId: caller.id,
      callerRole: data.trafficRole || data.role || 'civilian',
      callerName: data.trafficLabel || caller.name || 'Civilian Craft',
      pos: { x: callerPos.x, z: callerPos.z },
      threatId: threatEnt ? threatEnt.id : null,
      cause,
      radius,
      routedToPlayer,
      recipients,
      simTime: now,
    };

    if (this.state && this.state.traffic) {
      this.state.traffic.lastDistressCall = payload;
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('distress:call', payload);
      if (routedToPlayer) {
        this.bus.emit('comms:message', {
          sender: payload.callerName,
          channel: 'distress',
          text: `MAYDAY: Under attack near (${Math.round(callerPos.x)}, ${Math.round(callerPos.z)})! Requesting immediate assistance!`,
          callerId: caller.id,
          pos: payload.pos,
        });
      }
    }

    return payload;
  },

  /**
   * Route-hold mayday (npcJobsRuntime._holdForRouteThreat): a worker parked in a hot lane cries
   * for help on a bounded cadence. No combat fire may ever land, so traffic's violence
   * broadcasts never fire for it. Reshape that cry into the exact lastDistressCall shape
   * _broadcastCivilianDistress produces (cause 'route_hold') so the nearest rescue craft
   * dispatches through the ordinary _findNearbyRescueTarget path and _stepRescue can track the
   * caller live. Stamps the caller's lastDistressSimT like a real broadcast, which is the
   * freshness signal the rescue stand-down bound reads.
   */
  _onNpcJobDistress(p) {
    const state = this.state;
    if (!state || !state.traffic) return null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const caller = p.hullId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(p.hullId)
      : null;
    const data = caller ? (caller.data || (caller.data = {})) : null;
    const pos = caller && caller.pos
      ? { x: caller.pos.x, z: caller.pos.z }
      : (p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)
        ? { x: p.pos.x, z: p.pos.z }
        : null);
    if (!pos) return null;
    if (data) data.lastDistressSimT = now;
    const payload = {
      callerId: caller ? caller.id : (p.hullId != null ? p.hullId : null),
      callerRole: (data && (data.trafficRole || data.role)) || p.kind || 'civilian',
      callerName: (data && data.trafficLabel) || (caller && caller.name) || 'Civilian Craft',
      pos,
      threatId: p.threatId != null ? p.threatId : null,
      cause: 'route_hold',
      radius: CIVILIAN_DISTRESS_RADIUS_WU,
      routedToPlayer: false,
      recipients: [],
      simTime: now,
    };
    state.traffic.lastDistressCall = payload;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('distress:call', payload);
    }
    return payload;
  },

  _civilianHaulerRole(entity, rec) {
    const role = (rec && rec.role)
      || (entity && entity.data && (entity.data.trafficRole || entity.data.jobKind || entity.data.role))
      || '';
    if (CIVILIAN_HAULER_DUMP_ROLES.has(role)) return role;
    if (entity && entity.data && entity.data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT_ID) {
      return 'hauler';
    }
    return '';
  },

  _trafficRecordFor(entity) {
    if (!entity) return null;
    const list = this.state && this.state.traffic && this.state.traffic.freighters;
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (rec && rec.id === entity.id) return rec;
    }
    return null;
  },

  _spillHaulerCargoFromViolence(hauler, attacker, cause = 'combat_damage') {
    if (!hauler || hauler.alive === false || hauler.type !== 'ship') return null;
    if (attacker && attacker.id === hauler.id) return null;
    if (isSurvivalCohort(hauler) || isSurvivalCohort(attacker)) return null;
    const data = hauler.data || (hauler.data = {});
    if (data.violenceCargoSpilled === true) return null;
    const rec = this._trafficRecordFor(hauler);
    if (!this._civilianHaulerRole(hauler, rec)) return null;
    let current = data.cargoManifest || (rec && rec.manifest) || null;
    if (!validCausalManifest(current)) {
      if (data.cargo && typeof data.cargo === 'object') {
        const lines = Object.entries(data.cargo)
          .filter(([id, q]) => typeof id === 'string' && Number.isSafeInteger(q) && q > 0)
          .map(([commodityId, qty]) => ({ commodityId, qty }));
        if (lines.length > 0) {
          const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
          current = { manifestId: `manifest_${hauler.id}`, lines, totalQty };
        }
      }
      if (!validCausalManifest(current) && (rec?.carrying || data.carrying)) {
        current = {
          manifestId: `manifest_${hauler.id}`,
          lines: [{ commodityId: AMBUSH_LOADED_HAULER_COMMODITY_ID, qty: AMBUSH_LOADED_HAULER_QTY }],
          totalQty: AMBUSH_LOADED_HAULER_QTY,
        };
      }
    }
    if (!validCausalManifest(current)) return null;
    const line = current.lines.find((row) => row && row.qty > 0);
    if (!line) return null;
    const dump = Math.min(line.qty, Math.max(1, Math.floor(line.qty * 0.25) || 1));
    const pos = entityPos(hauler);
    if (!pos) return null;
    const rot = Number.isFinite(hauler.rot) ? hauler.rot : 0;
    const clear = Math.max(0, Number(hauler.radius) || 0) + HAULER_SPILL_POD_RADIUS;
    const vx = Number.isFinite(hauler.vel && hauler.vel.x) ? hauler.vel.x : 0;
    const vz = Number.isFinite(hauler.vel && hauler.vel.z) ? hauler.vel.z : 0;
    // Ownership truth: the pod names who lost it — owner hull identity, operating faction, and
    // the route the hauler was flying — so scooping the pod and hailing the carrier tell the
    // same story. Manifests carry no route fields; the itinerary/target id stand in.
    const itinerary = data.itinerary || (rec && rec.itinerary) || {};
    const originStationId = itinerary.originStationId || null;
    const destinationStationId = itinerary.destinationStationId
      || stationIdentity(rec && rec.targetId ? this.state.entities.get(rec.targetId) : null)
      || null;
    const pod = spawnJettisonedCargoPod(this.state, {
      pos: { x: pos.x - Math.cos(rot) * clear, z: pos.z - Math.sin(rot) * clear },
      vel: { x: vx * HAULER_SPILL_VEL_FRACTION, z: vz * HAULER_SPILL_VEL_FRACTION },
      radius: HAULER_SPILL_POD_RADIUS,
      commodityId: line.commodityId,
      amount: dump,
      unitMass: 0.8,
      factionId: hauler.factionId || data.factionId || 'faction_free',
      ownerId: hauler.id,
      ownerName: data.name || hauler.name || hauler.id,
      originId: originStationId,
      destinationId: destinationStationId,
    }, this.helpers);
    if (!pod) return null;
    if (pod.data) {
      pod.data.manifestId = current.manifestId || null;
      pod.data.ownerRecordId = (rec && rec.worldRecordId) || null;
      pod.data.carrierRole = (rec && rec.role) || hauler.role || 'hauler';
      // The pod remembers what actually dislodged it — gunfire, a flung mass, or raw panic —
      // so a scoop-and-hail read matches the event that made it.
      pod.data.spillCause = cause;
      pod.data.attackerId = (attacker && attacker.id) || null;
    }
    data.violenceCargoSpilled = true;
    data.cargoDumped = true;
    data.carrying = false;
    if (rec) {
      rec.cargoDumped = true;
      rec.carrying = false;
    }
    if (data.cargo && data.cargo[line.commodityId] != null) {
      data.cargo[line.commodityId] = Math.max(0, data.cargo[line.commodityId] - dump);
    }
    const nextLines = current.lines
      .map((row) => {
        if (row !== line) return { ...row };
        return { ...row, qty: row.qty - dump };
      })
      .filter((row) => row.qty > 0);
    let totalQty = 0;
    for (let i = 0; i < nextLines.length; i++) totalQty += nextLines[i].qty;
    this._setTrafficManifest(hauler, rec, { ...current, lines: nextLines, totalQty });
    const t = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('freight:cargoSpilled', {
        carrierId: hauler.id,
        ownerId: hauler.id,
        ownerName: data.name || hauler.name || hauler.id,
        factionId: hauler.factionId || data.factionId || 'faction_free',
        attackerId: (attacker && attacker.id) || null,
        entityId: hauler.id,
        manifestId: current.manifestId || null,
        cause,
        commodityId: line.commodityId,
        qty: dump,
        podCount: 1,
        podIds: [pod.id],
        t,
      });
    }
    return pod;
  },

  _stampMemorialTouristFlee(e, rec) {
    if (rec) rec.civilianReaction = 'flee';
    if (!e || !e.data) return;
    e.data.civilianReaction = 'flee';
    e.data.memorialScatter = true;
    if (!e.data.ai || typeof e.data.ai !== 'object') e.data.ai = {};
    e.data.ai.fsm = 'flee';
    e.data.ai.state = 'flee';
  },

  // The array is wider than the 300-unit lane bubble. A sightseer on the memorial
  // still hears a shot at the far edge of the disc.
  _memorialZoneViolence(entity, now) {
    const ring = this._violenceRing;
    if (!ring) return null;
    const sectorId = this.state && this.state.world && this.state.world.currentSectorId;
    const selfId = entity && entity.id;
    let best = null;
    let bestT = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const row = ring[i];
      if (!row || now - row.t > CIVILIAN_ALARM_TTL_S) continue;
      if (selfId != null && selfId === row.attackerId) continue;
      if (!pointInHeliosMemorial(sectorId, row.x, row.z)) continue;
      if (row.t >= bestT) {
        bestT = row.t;
        best = row;
      }
    }
    return best;
  },

  _emitCivilianViolenceFlee(entity) {
    if (!entity || !entity.data) return false;
    if (entity.data.violenceFleeEmitted === true) return false;
    entity.data.violenceFleeEmitted = true;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ai:flee', {
        entityId: entity.id,
        reason: 'civilian-violence',
      });
    }
    return true;
  },

  _onLawIncidentOpened(payload) {
    const p = payload || {};
    const attackerId = p.attackerId != null ? p.attackerId : null;
    const victimId = p.victimId != null ? p.victimId : p.targetId;
    const state = this.state;
    const attacker = attackerId != null && state && state.entities
      ? state.entities.get(attackerId)
      : null;
    const victim = victimId != null && state && state.entities
      ? state.entities.get(victimId)
      : null;
    if (isSurvivalCohort(attacker) || isSurvivalCohort(victim)) return;
    const from = entityPos(attacker) || entityPos(victim);
    if (!from) return;
    this._recordViolence(
      from.x,
      from.z,
      attackerId,
      victimId,
      Number.isFinite(state && state.simTime) ? state.simTime : 0,
    );
  },

  _nearbyViolence(entity, now) {
    const pos = entity && entity.pos;
    const ring = this._violenceRing;
    if (!pos || !ring) return null;
    const id = entity.id;
    let best = null;
    let bestD2 = CIVILIAN_VIOLENCE_RADIUS_SQ;
    for (let i = 0; i < ring.length; i++) {
      const row = ring[i];
      if (!row || now - row.t > CIVILIAN_ALARM_TTL_S) continue;
      if (id === row.attackerId) continue;
      const dx = pos.x - row.x;
      const dz = pos.z - row.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = row;
      }
    }
    return best;
  },

  _pickFleeStation(entity, stations, fleeAim, currentTargetId) {
    if (!entity || !entity.pos || !stations || stations.length === 0) return null;
    const fx = Math.cos(fleeAim);
    const fz = Math.sin(fleeAim);
    let best = null;
    let bestScore = -Infinity;
    let bestOther = null;
    let bestOtherScore = -Infinity;
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      if (!station || !station.pos || station.alive === false) continue;
      const dx = station.pos.x - entity.pos.x;
      const dz = station.pos.z - entity.pos.z;
      const dist = Math.hypot(dx, dz);
      if (!(dist > 1)) continue;
      const score = (dx * fx + dz * fz) / dist;
      if (score > bestScore) {
        bestScore = score;
        best = station;
      }
      if (station.id !== currentTargetId && score > bestOtherScore) {
        bestOtherScore = score;
        bestOther = station;
      }
    }
    return bestOther || best;
  },

  /**
   * Civilians inside 300 WU of a recorded hit/incident. Haulers run; workers hold; a towing hull
   * keeps the load and leaves slowly. Live jobs go through npcJobs interrupt/resume — never setIntent.
   * Returns true only when this owner wrote ambient intent for the tick.
   */
  _reactCivilianViolence(e, rec, stations, state) {
    const roleName = (rec && rec.role) || (e.data && (e.data.trafficRole || e.data.jobKind || e.data.role)) || '';
    const doesFlee = CIVILIAN_ALARM_FLEE_ROLES.has(roleName);
    const doesHold = CIVILIAN_ALARM_HOLD_ROLES.has(roleName);
    if (!doesFlee && !doesHold) return false;
    if (isSurvivalCohort(e)) return false;

    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectorId = state.world && state.world.currentSectorId;
    let hit = this._nearbyViolence(e, now);
    if (roleName === 'tourist' && e.pos && pointInHeliosMemorial(sectorId, e.pos.x, e.pos.z)) {
      const memorialHit = this._memorialZoneViolence(e, now);
      if (memorialHit) hit = memorialHit;
    }
    const jobId = e.data && e.data.jobId;
    const jobs = this.helpers && this.helpers.npcJobs;
    const carrying = !!((rec && rec.carrying)
      || (e.data?.cargoManifest?.totalQty > 0)
      || (rec && rec.manifest && rec.manifest.totalQty > 0));

    if (!hit) {
      const alarmed = (rec && rec.violenceAlarmed) || (e.data && e.data.violenceAlarmed);
      if (alarmed) {
        if (rec) rec.violenceAlarmed = false;
        if (e.data) {
          e.data.violenceAlarmed = false;
          e.data.violenceFleeEmitted = false;
          if (e.data.memorialScatter) {
            e.data.memorialScatter = false;
            if (e.data.ai) {
              if (e.data.ai.fsm === 'flee') delete e.data.ai.fsm;
              if (e.data.ai.state === 'flee') delete e.data.ai.state;
            }
          }
        }
        if (jobId && jobs && typeof jobs.resume === 'function') jobs.resume(jobId);
        const resumeId = rec ? rec.violenceResumeTargetId : null;
        if (rec) rec.violenceResumeTargetId = null;
        if (!jobId && resumeId != null) {
          const prev = state.entities && typeof state.entities.get === 'function'
            ? state.entities.get(resumeId)
            : null;
          if (prev && prev.alive !== false && rec) rec.targetId = resumeId;
        }
        if (!jobId && e.data && e.data.intent) e.data.intent.brake = false;
      }
      return false;
    }

    const hold = doesHold && !carrying;
    const alreadyAlarmed = (rec && rec.violenceAlarmed) || (e.data && e.data.violenceAlarmed);
    const memorialScatter = roleName === 'tourist'
      && !!(e.pos && pointInHeliosMemorial(sectorId, e.pos.x, e.pos.z))
      && pointInHeliosMemorial(sectorId, hit.x, hit.z);
    if (memorialScatter) this._stampMemorialTouristFlee(e, rec);
    if (doesFlee && !hold && !alreadyAlarmed) this._emitCivilianViolenceFlee(e);
    const threatEnt = hit.attackerId != null && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(hit.attackerId)
      : null;
    this._broadcastCivilianDistress(e, threatEnt, 'threat_alarm');
    const threatPos = entityPos(threatEnt);
    const hx = threatPos ? threatPos.x : hit.x;
    const hz = threatPos ? threatPos.z : hit.z;
    const untilSimT = now + CIVILIAN_ALARM_TTL_S;
    if (jobId) {
      if (jobs && typeof jobs.interrupt === 'function') {
        const threat = this._violenceThreatScratch;
        threat.entityId = hit.attackerId != null ? hit.attackerId : hit.victimId;
        threat.x = hx;
        threat.z = hz;
        threat.untilSimT = untilSimT;
        threat.hold = hold;
        threat.slow = carrying;
        jobs.interrupt(jobId, threat);
      }
      if (rec) rec.violenceAlarmed = true;
      if (e.data) e.data.violenceAlarmed = true;
      return false;
    }

    if (rec) rec.violenceAlarmed = true;
    if (e.data) e.data.violenceAlarmed = true;
    if (hold) {
      const aim = (e.data && e.data.intent && Number.isFinite(e.data.intent.aimAngle))
        ? e.data.intent.aimAngle
        : (e.rot || 0);
      setIntent(e, 0, 0, false, false, null, aim);
      e.data.intent.brake = true;
      return true;
    }

    const dx = (e.pos && e.pos.x || 0) - hx;
    const dz = (e.pos && e.pos.z || 0) - hz;
    let aim = Math.atan2(dz, dx);
    if (!Number.isFinite(aim) || (dx === 0 && dz === 0)) {
      aim = ((hash32(e.id, 'civilian-alarm') >>> 0) / 4294967296) * Math.PI * 2;
    }

    // Role & Class Behavioral Variety
    if (roleName === 'miner' || roleName === 'ore_carrier' || roleName === 'prospector') {
      const reaction = carrying ? 'flee_with_load' : 'flee_alarmed';
      if (rec) {
        rec.civilianReaction = reaction;
        if (carrying) rec.fleeingWithLoad = true;
      }
      if (e.data) {
        e.data.civilianReaction = reaction;
        if (carrying) e.data.fleeingWithLoad = true;
      }
      if (stations && stations.length > 1 && rec && !rec.worldSiteRoute && !rec.claimTravelRoute) {
        if (rec.violenceResumeTargetId == null) rec.violenceResumeTargetId = rec.targetId;
        const dest = this._pickFleeStation(e, stations, aim, rec.targetId);
        if (dest && dest.id !== rec.targetId) rec.targetId = dest.id;
      }
      setIntent(e, 0, 1, true, false, null, aim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      return true;
    }

    if (roleName === 'courier') {
      const reaction = 'dodge_aggressive';
      if (rec) rec.civilianReaction = reaction;
      if (e.data) e.data.civilianReaction = reaction;
      const jinkPhase = (now * 6) + (((e.id * 17) ^ 0x5a) % 31);
      const lateralStrafe = Math.sin(jinkPhase) > 0 ? 1 : -1;
      const jinkAim = aim + Math.sin(jinkPhase * 0.7) * 0.65;
      setIntent(e, lateralStrafe, 1, true, false, null, jinkAim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      return true;
    }

    if (CIVILIAN_HAULER_DUMP_ROLES.has(roleName)) {
      const reaction = 'dump_cargo';
      if (rec) rec.civilianReaction = reaction;
      if (e.data) e.data.civilianReaction = reaction;
      // A panic dump before any hit lands is the hauler's own jettison, not battle damage.
      this._spillHaulerCargoFromViolence(e, threatEnt, 'panic_jettison');
      if (stations && stations.length > 1 && rec && !rec.worldSiteRoute && !rec.claimTravelRoute) {
        if (rec.violenceResumeTargetId == null) rec.violenceResumeTargetId = rec.targetId;
        const dest = this._pickFleeStation(e, stations, aim, rec.targetId);
        if (dest && dest.id !== rec.targetId) rec.targetId = dest.id;
      }
      setIntent(e, 0, 1, true, false, null, aim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      return true;
    }

    if (roleName === 'tug') {
      const reaction = 'assist_disabled';
      if (rec) rec.civilianReaction = reaction;
      if (e.data) e.data.civilianReaction = reaction;
      const disabled = this._findNearbyDisabledShip(state, e, 1500);
      if (disabled && disabled.pos) {
        if (rec) rec.assistingShipId = disabled.id;
        if (e.data) e.data.assistingShipId = disabled.id;
        const tdx = disabled.pos.x - (e.pos && e.pos.x || 0);
        const tdz = disabled.pos.z - (e.pos && e.pos.z || 0);
        const dist = Math.hypot(tdx, tdz);
        if (dist < 60) {
          setIntent(e, 0, 0, false, true, null, Math.atan2(tdz, tdx));
          if (e.data && e.data.intent) e.data.intent.brake = true;
        } else {
          setIntent(e, 0, 1, false, false, null, Math.atan2(tdz, tdx));
          if (e.data && e.data.intent) e.data.intent.brake = false;
        }
      } else {
        setIntent(e, 0, 0, false, true, null, e.rot || 0);
        if (e.data && e.data.intent) e.data.intent.brake = true;
      }
      return true;
    }

    if (roleName === 'tourist') {
      if (memorialScatter) {
        this._stampMemorialTouristFlee(e, rec);
        setIntent(e, 0, 1, true, false, null, aim);
        if (e.data && e.data.intent) e.data.intent.brake = false;
        return true;
      }
      const reaction = 'scenic_loiter';
      if (rec) rec.civilianReaction = reaction;
      if (e.data) e.data.civilianReaction = reaction;
      setIntent(e, 0, 0, false, true, null, aim);
      if (e.data && e.data.intent) e.data.intent.brake = true;
      return true;
    }

    if (doesFlee && stations && stations.length > 1 && !rec.worldSiteRoute && !rec.claimTravelRoute) {
      if (rec.violenceResumeTargetId == null) rec.violenceResumeTargetId = rec.targetId;
      const dest = this._pickFleeStation(e, stations, aim, rec.targetId);
      if (dest && dest.id !== rec.targetId) rec.targetId = dest.id;
    }
    setIntent(e, 0, 1, !carrying, false, null, aim);
    if (e.data && e.data.intent) e.data.intent.brake = false;
    return true;
  },

  // Patrols orbit a station on a slow circular track — a readable "on duty" presence.
  _stepOrbit(e, rec, stations, dt) {
    const station = stations[0];
    if (!station) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    rec.orbitPhase = (rec.orbitPhase || 0) + dt * 0.25;
    const R = 180;
    const tx = station.pos.x + Math.cos(rec.orbitPhase) * R;
    const tz = station.pos.z + Math.sin(rec.orbitPhase) * R;
    const aim = Math.atan2(tz - e.pos.z, tx - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Pirates/raiders flee from the nearest hostile (the player) — they raid weak targets but bolt
  // when outmatched. Distinct from combat AI: they never engage, they disengage.
  _stepFlee(e, rec, stations, state) {
    const player = state.entities.get(state.playerId);
    if (player && player.alive) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 500) { // flee directly away from the player
        const aim = Math.atan2(dz, dx);
        setIntent(e, 0, 1, true, false, null, aim); // boost away
        return;
      }
    }
    // no threat: loiter toward a station
    const station = stations[Math.floor((rec._fleeIdx == null ? (rec._fleeIdx = 0) : rec._fleeIdx))];
    const tgt = station || stations[0];
    if (!tgt) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const aim = Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Miners seek asteroids, "mine" (orbit the rock), then haul the ore to a station. Distinct from
  // haulers: their target is an asteroid, not a station, until they return to dock.
  _stepMiner(e, rec, stations, state) {
    if (rec.carrying) {
      // return to a station to offload, then seek a new rock
      const tgt = state.entities.get(rec.targetId);
      if (tgt && tgt.type === 'station' && tgt.alive) {
        const dist = Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
        if (dist < DOCK_RANGE) { rec.carrying = false; rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id; rec.waitT = 2; setIntent(e, 0, 0, false, false, null, e.rot); return; }
        setIntent(e, 0, 1, false, false, null, Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x)); return;
      }
      rec.targetId = this._pickStation(stations).id; return;
    }
    let rock = this._resolveAsteroid(state, rec.targetId);
    if (!rock || rock.type !== 'asteroid' || !rock.alive) {
      rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id;
      rock = this._resolveAsteroid(state, rec.targetId);
    }
    if (!rock) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const dist = Math.hypot(rock.pos.x - e.pos.x, rock.pos.z - e.pos.z);
    if (dist < 40) {
      if (rock.fieldResident) {
        promoteAsteroidFieldRock(state, rock.id, this.helpers, 'npc-mine');
      }
      rec.carrying = true; rec.targetId = this._pickStation(stations).id; rec.waitT = 1.5; setIntent(e, 0, 0, false, false, null, e.rot); return;
    }
    setIntent(e, 0, 1, false, false, null, Math.atan2(rock.pos.z - e.pos.z, rock.pos.x - e.pos.x));
  },

  // The count outlives the bark. One row per manifest, capped, on the traffic save.
  _rememberHeliosFreightTally(entity, manifest, commodityId) {
    const row = normalizeHeliosFreightTally({
      manifestId: manifest && manifest.manifestId,
      carrierWorldRecordId: entity && entity.data && entity.data.worldRecordId,
      commodityId,
      totalQty: manifest && manifest.totalQty,
      destinationId: 'station_helios',
      simTime: this.state && this.state.simTime,
    });
    if (!row || !this.state || !this.state.traffic) return;
    const bag = this.state.traffic;
    const prior = Array.isArray(bag.heliosFreightTallies) ? bag.heliosFreightTallies : [];
    if (prior.some((item) => item && item.manifestId === row.manifestId)) return;
    const next = prior.concat(row);
    bag.heliosFreightTallies = next.length > HELIOS_TALLY_LEDGER_CAP
      ? next.slice(next.length - HELIOS_TALLY_LEDGER_CAP) : next;
  },

  // The count is the start of the fact. Delivery and loss close it once, and neither
  // overwrites the other: a docked hold that is later destroyed was already off the barge,
  // and a lost hold does not become a delivery because a later hull reuses the id.
  _noteHeliosFreightDisposition(manifestId, disposition) {
    if (disposition !== 'delivered' && disposition !== 'lost') return false;
    if (!this.state || !this.state.traffic || typeof manifestId !== 'string' || !manifestId) return false;
    const rows = this.state.traffic.heliosFreightTallies;
    if (!Array.isArray(rows)) return false;
    const row = rows.find((item) => item && item.manifestId === manifestId);
    if (!row || heliosFreightDisposition(row.disposition) !== 'counted') return false;
    row.disposition = disposition;
    row.dispositionSimTime = Number(this.state.simTime) || 0;
    return true;
  },

  // Robbed and destroyed are the two opening-raid outcomes that take the counted hold.
  // Defended and flying on leave the ore on the barge, so the row stays counted until a
  // real dock or a later loss. Another shape cannot close a Helios tally.
  _onOpeningRaidFreightResolved(payload) {
    if (!payload || payload.shape !== 'opening_hauler_raid') return false;
    if (payload.outcome !== 'robbed' && payload.outcome !== 'hauler_destroyed') return false;
    const causality = payload.causality;
    const manifestId = causality && typeof causality.manifestId === 'string'
      ? causality.manifestId : '';
    return this._noteHeliosFreightDisposition(manifestId, 'lost');
  },

  // The Helios freight spine counts every laden hull at its tally post before the berth: the seam's
  // ore crosses the opening neighbourhood as real freight instead of slipping off behind the rock.
  _heliosTallyPoint() {
    if (this._heliosTallyPos !== undefined) return this._heliosTallyPos;
    const poi = (SECTOR_ANCHORS.sector_helios_prime?.pois || []).find((row) => row.id === 'poi_helios_tally');
    this._heliosTallyPos = poi ? sectorLocalToGlobalForSector(poi.pos, 'sector_helios_prime') : null;
    return this._heliosTallyPos;
  },

  // One existing hull runs seam -> loose ore -> refinery. Collection consumes the actual pickup;
  // a player taking/towing it first leaves the barge empty, and a killed barge spills its real hold.
  _stepHeliosOreCarrier(entity, rec, stations, state) {
    const refinery = stations.find((station) => stationIdentity(station) === 'station_helios');
    if (!refinery) return;
    const current = entity.data.cargoManifest || rec.manifest;
    const loaded = current?.totalQty > 0;
    rec.carrying = loaded;
    const steer = (target, reach) => {
      const dx = target.pos.x - entity.pos.x, dz = target.pos.z - entity.pos.z;
      const distance = Math.hypot(dx, dz);
      const close = distance <= reach;
      const aim = Math.atan2(dz, dx);
      const propulsion = resolvePropulsionProfile(entity, state);
      // A settled chip keeps its spawn-kick `vel` field after the body stops; leading on that stale
      // number had the barge crawl at ~5 WU/s toward a chip 150 WU off. Lead on observed motion.
      const leadCap = TRAFFIC_ROLES.ore_carrier.speed / Math.max(TRAFFIC_ROLES.ore_carrier.speed, Math.hypot(target.vel?.x || 0, target.vel?.z || 0));
      let leadX = (target.vel?.x || 0) * leadCap, leadZ = (target.vel?.z || 0) * leadCap;
      if (target.type === 'pickup') {
        const seen = rec.chipTrack;
        const dtSeen = seen && seen.id === target.id ? state.simTime - seen.t : 0;
        leadX = dtSeen > 0 ? (target.pos.x - seen.x) / dtSeen : 0;
        leadZ = dtSeen > 0 ? (target.pos.z - seen.z) / dtSeen : 0;
        rec.chipTrack = { id: target.id, x: target.pos.x, z: target.pos.z, t: state.simTime };
      }
      if (propulsion.family === DRIVE_FAMILIES.PULSE_PLATE) {
        // The Ironback's brake fires its pulse plate. A cargo approach uses its ordinary
        // precision thrusters instead: ask for a local velocity correction, never a pose snap.
        const decel = Math.max(1, propulsion.rcsReverseAccel);
        const speed = close ? 0 : Math.min(TRAFFIC_ROLES.ore_carrier.speed,
          Math.sqrt(2 * decel * Math.max(0, distance - reach * 0.6)));
        const vx = leadX + dx / Math.max(1, distance) * speed - (entity.vel?.x || 0);
        const vz = leadZ + dz / Math.max(1, distance) * speed - (entity.vel?.z || 0);
        const c = Math.cos(entity.rot || 0), s = Math.sin(entity.rot || 0);
        const forward = vx * c + vz * s;
        const side = -vx * s + vz * c;
        const throttle = Math.max(-1, Math.min(1, forward /
          Math.max(1, forward < 0 ? propulsion.rcsReverseAccel : propulsion.rcsForwardAccel)));
        const strafe = Math.max(-1, Math.min(1, side / Math.max(1, propulsion.rcsStrafeAccel)));
        setIntent(entity, strafe, throttle, false, false, null, aim);
        entity.data.intent.brake = false;
        return close;
      }
      const brakeAccel = Math.max(1, propulsion.reverseAccel || 0, (propulsion.mainAccel || 0) * 0.72);
      const closing = Math.max(0, ((entity.vel?.x || 0) * dx + (entity.vel?.z || 0) * dz) / Math.max(1, distance));
      const brake = close || Math.cos(aim - (entity.rot || 0)) < 0.85
        || closing * closing / (2 * brakeAccel) >= distance - reach;
      const speed = Math.min(TRAFFIC_ROLES.ore_carrier.speed,
        Math.sqrt(2 * brakeAccel * Math.max(0, distance - reach)));
      const throttle = Math.max((propulsion.assist?.deadInput || 0.025) + 0.001,
        speed / Math.max(1, propulsion.combatSpeed || entity.maxSpeed || 100));
      setIntent(entity, 0, brake ? 0 : Math.min(1, throttle), false, false, null, aim);
      entity.data.intent.brake = brake;
      return close;
    };
    if (loaded) {
      const tally = this._heliosTallyPoint();
      if (tally && rec.tallyManifestId !== current.manifestId) {
        rec.targetId = refinery.id;
        const at = steer({ pos: tally }, HELIOS_TALLY_REACH);
        const drift = Math.hypot(entity.vel?.x || 0, entity.vel?.z || 0);
        if (!at || drift > HELIOS_TALLY_STILL) {
          rec.tallyHoldSince = null;
          return;
        }
        if (rec.tallyHoldSince == null) rec.tallyHoldSince = state.simTime;
        if (state.simTime - rec.tallyHoldSince < HELIOS_TALLY_COUNT_S) return;
        rec.tallyManifestId = current.manifestId;
        rec.tallyHoldSince = null;
        const line = current.lines.find((row) => row && row.qty > 0);
        this._rememberHeliosFreightTally(entity, current, line && line.commodityId);
        this.bus.emit('traffic:freightTallied', {
          carrierId: entity.id, worldRecordId: entity.data.worldRecordId || null,
          manifestId: current.manifestId, totalQty: current.totalQty,
          commodityId: line && line.commodityId || null,
          destinationId: 'station_helios',
        });
        return;
      }
      rec.targetId = refinery.id;
      if (steer(refinery, (refinery.radius || 0) + DOCK_RANGE)
        && this._emitArrival(entity, rec, refinery, { manifest: current })) {
        this._setTrafficManifest(entity, rec,
          this._buildMinerManifest(entity, rec.dockSeq, null, 0, 'ore_carrier'));
        rec.carrying = false;
      }
      return;
    }
    const player = state.entities.get(state.playerId);
    let pickup = null, nearest = Infinity;
    forEachJobInteractable(state, (candidate) => {
      if (candidate?.type !== 'pickup' || candidate.alive === false || !candidate.pos
        || candidate.data?.npcMiningSource?.fieldId !== 'f_helios_starter'
        || !(candidate.data.amount > 0) || !candidate.data.commodityId
        || isMasslineLatchedPickup(state, player, candidate)) return;
      // A cut chip is the claim's lot, not free scrap: title to the cutter's stable record keeps a
      // passing lawful hull (or this barge's own hull) from contact-vacuuming it outside custody;
      // the player and outlaws can still take it, which is theft the law owner can see.
      const source = candidate.data.npcMiningSource;
      if (source.minerWorldRecordId && candidate.data.ownerId == null && !candidate.data.cargoIdentity) {
        candidate.data.ownerId = source.minerWorldRecordId;
        // X-05: title carries the owner's name too, so the target panel's `Owner:` fact can
        // print it. The freighters list holds {id} records — resolve through state.entities.
        const freighters = state.traffic && Array.isArray(state.traffic.freighters)
          ? state.traffic.freighters : [];
        const cutter = freighters
          .map((row) => row && state.entities && state.entities.get(row.id))
          .find((e) => e && e.data && e.data.worldRecordId === source.minerWorldRecordId);
        candidate.data.ownerName = (cutter && (cutter.name || (cutter.data && cutter.data.name))) || 'Claim crew';
      }
      const d2 = (candidate.pos.x - entity.pos.x) ** 2 + (candidate.pos.z - entity.pos.z) ** 2;
      if (d2 < nearest) { pickup = candidate; nearest = d2; }
    });
    if (!pickup) {
      // Wait beside the active face, not on top of it. There is no invented load on a timer.
      // The cutter may be a traffic hull or the claim's authored seam miner (npcJobs-commissioned);
      // either way the barge's berth is the face that hull is cutting, never the refinery apron.
      const cutting = (worker) => worker && worker.alive !== false && worker.type === 'ship'
        && worker.data?.minerShiftRockId != null;
      const miner = state.traffic.freighters.map((row) => state.entities.get(row.id)).find(cutting)
        || (state.entityList || []).find(cutting);
      const cutRock = miner && this._resolveAsteroid(state, miner.data.minerShiftRockId);
      // A rock knocked loose is no berth: chasing its momentum flung the barge 2 km off the claim
      // at 250 WU/s. Hold on the miner itself until it settles on a seated face again.
      const rock = cutRock && Math.hypot(cutRock.vel?.x || 0, cutRock.vel?.z || 0) <= HELIOS_BERTH_MAX_DRIFT
        ? cutRock : null;
      const berth = rock || miner || refinery;
      steer(berth, (berth.radius || 0) + 100);
      rec.targetId = berth.id;
      return;
    }
    rec.targetId = pickup.id;
    // Take custody at scoop range, short of hull contact: a refused contact shoves the 0.1-mass
    // chip away and the velocity-matched approach then chases it across the sector.
    if (!steer(pickup, (entity.radius || 6) * 1.25 + (pickup.radius || 1) + 18)) return;
    const qty = Math.floor(pickup.data.amount);
    if (!(qty > 0)) return;
    const manifest = this._buildMinerManifest(entity, rec.dockSeq || 0,
      pickup.data.commodityId, qty, 'ore_carrier', { ...pickup.data.npcMiningSource });
    // Commit custody before the event: a synchronous listener cannot collect this body twice.
    pickup.data.amount = 0;
    pickup.alive = false;
    this._setTrafficManifest(entity, rec, manifest);
    rec.carrying = true;
    rec.cargoDumped = false;
    entity.data.cargoDumped = false;
    this.bus.emit('traffic:oreCollected', {
      carrierId: entity.id, pickupId: pickup.id, manifestId: manifest.manifestId,
      commodityId: manifest.lines[0].commodityId, qty, ...pickup.data.npcMiningSource,
    });
  },

  _pickScenicBody(state, stations) {
    const world = state && state.world;
    if (world) {
      if (Array.isArray(world.planets) && world.planets.length > 0) {
        const p = world.planets[Math.floor(this._rng() * world.planets.length)];
        if (p && p.pos) return { id: p.id || 'planet_0', pos: p.pos, radius: p.radius || 400, name: p.name || 'Planet' };
      }
      if (Array.isArray(world.bodies) && world.bodies.length > 0) {
        const b = world.bodies[Math.floor(this._rng() * world.bodies.length)];
        if (b && b.pos) return { id: b.id || 'body_0', pos: b.pos, radius: b.radius || 300, name: b.name || 'Celestial Body' };
      }
      if (Array.isArray(world.pois) && world.pois.length > 0) {
        const scenicPois = world.pois.filter((p) => p && p.type && (p.type === 'anomaly' || p.type === 'beacon' || p.type === 'colony'));
        if (scenicPois.length > 0) {
          const poi = scenicPois[Math.floor(this._rng() * scenicPois.length)];
          if (poi && poi.pos) return { id: poi.id, pos: poi.pos, radius: 150, name: poi.name || 'Scenic POI' };
        }
      }
    }
    if (Array.isArray(stations) && stations.length > 0) {
      const scenicStation = stations.find((s) => s && (s.scenic || s.tourism || s.type === 'research' || s.size === 'L')) || stations[0];
      if (scenicStation && scenicStation.pos) {
        return { id: scenicStation.id, pos: scenicStation.pos, radius: 200, name: scenicStation.name || 'Scenic Station' };
      }
    }
    return null;
  },

  _stepTourist(e, rec, stations, state, dt) {
    if (!e || !e.pos) return;
    let target = null;
    if (rec.scenicBodyId && state.entities && typeof state.entities.get === 'function') {
      target = state.entities.get(rec.scenicBodyId);
    }
    if ((!target || target.alive === false) && !rec.scenicPos) {
      const body = this._pickScenicBody(state, stations);
      if (body) {
        rec.scenicBodyId = body.id;
        rec.scenicPos = body.pos;
        rec.scenicRadius = body.radius || 250;
        if (e.data) {
          e.data.scenicBodyId = body.id;
          e.data.scenicPos = body.pos;
        }
      }
    }
    const tPos = (target && target.pos) || rec.scenicPos || (stations && stations[0] && stations[0].pos);
    if (!tPos) {
      setIntent(e, 0, 0, false, false, null, e.rot || 0);
      return;
    }
    const dx = tPos.x - e.pos.x;
    const dz = tPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const loiterR = rec.scenicRadius || 250;
    if (dist > loiterR + 100) {
      const aim = Math.atan2(dz, dx);
      setIntent(e, 0, 0.8, false, false, null, aim);
    } else {
      rec.orbitPhase = (rec.orbitPhase || 0) + dt * 0.15;
      const tx = tPos.x + Math.cos(rec.orbitPhase) * loiterR;
      const tz = tPos.z + Math.sin(rec.orbitPhase) * loiterR;
      const aim = Math.atan2(tz - e.pos.z, tx - e.pos.x);
      setIntent(e, 0, 0.4, false, false, null, aim);
    }
  },

  _stepTug(e, rec, stations, state, dt) {
    if (!e || !e.pos) return false;
    let disabled = null;
    if (rec.assistingShipId && state.entities && typeof state.entities.get === 'function') {
      const candidate = state.entities.get(rec.assistingShipId);
      if (candidate && candidate.alive !== false && isShipDisabled(candidate, state)) {
        disabled = candidate;
      }
    }
    if (!disabled) {
      disabled = this._findNearbyDisabledShip(state, e, 1500);
    }
    if (!disabled || !disabled.pos) {
      rec.assistingShipId = null;
      if (e.data) e.data.assistingShipId = null;
      return false;
    }
    rec.assistingShipId = disabled.id;
    if (e.data) e.data.assistingShipId = disabled.id;
    const dx = disabled.pos.x - e.pos.x;
    const dz = disabled.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 60) {
      rec.civilianReaction = 'assist_disabled';
      if (e.data) e.data.civilianReaction = 'assist_disabled';
      setIntent(e, 0, 0, false, true, null, Math.atan2(dz, dx));
      if (e.data && e.data.intent) e.data.intent.brake = true;
    } else {
      rec.civilianReaction = 'assist_disabled';
      if (e.data) e.data.civilianReaction = 'assist_disabled';
      setIntent(e, 0, 0.8, false, false, null, Math.atan2(dz, dx));
      if (e.data && e.data.intent) e.data.intent.brake = false;
    }
    return true;
  },

  _onSurvivorPodRescued(payload) {
    const p = payload || {};
    const rescuerId = p.rescueHullId;
    if (rescuerId == null) return;
    const rec = this.state.traffic && this.state.traffic.freighters &&
      this.state.traffic.freighters.find((f) => f && f.id === rescuerId);
    if (!rec) return;
    rec.carryingSurvivor = true;
    rec.rescueTargetId = null;
    rec.rescueTargetType = null;
    rec.civilianReaction = 'transporting_survivor';
    const stations = this._sectorStations();
    const nearest = this._pickStation(stations);
    if (nearest) rec.targetId = nearest.id;
  },

  _findNearbyRescueTarget(state, rescuer, maxRadius = 2500) {
    if (!state || !rescuer || !rescuer.pos) return null;
    const maxR2 = maxRadius * maxRadius;

    // 1. Scan for unattended survivor pods
    let bestPod = null;
    let bestPodD2 = maxR2;
    const checkPod = (candidate) => {
      if (!candidate || candidate.alive === false || candidate.id === rescuer.id) return;
      if (!candidate.pos) return;
      const data = candidate.data || {};
      const isPod = candidate.type === 'payload' && (data.payloadType === 'survivor_pod' || data.tetherRole === 'survivor_pod');
      if (!isPod) return;
      const dx = candidate.pos.x - rescuer.pos.x;
      const dz = candidate.pos.z - rescuer.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= maxR2 && d2 < bestPodD2) {
        bestPodD2 = d2;
        bestPod = candidate;
      }
    };
    if (state.entities && typeof state.entities.forEach === 'function') {
      forEachJobInteractable(state, checkPod);
    }
    if (bestPod) {
      return { kind: 'pod', entity: bestPod, pos: { x: bestPod.pos.x, z: bestPod.pos.z } };
    }

    // 2. Scan for recent distress call
    const call = state.traffic && state.traffic.lastDistressCall;
    if (call && call.pos && Number.isFinite(call.simTime)) {
      const age = (state.simTime || 0) - call.simTime;
      if (age >= 0 && age < 45) {
        const dx = call.pos.x - rescuer.pos.x;
        const dz = call.pos.z - rescuer.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= maxR2) {
          return { kind: 'distress', pos: { x: call.pos.x, z: call.pos.z }, callerId: call.callerId };
        }
      }
    }

    // 3. Scan for nearby disabled ship needing assistance
    const disabled = this._findNearbyDisabledShip(state, rescuer, 1800);
    if (disabled && disabled.pos) {
      return { kind: 'disabled', entity: disabled, pos: { x: disabled.pos.x, z: disabled.pos.z } };
    }

    return null;
  },

  _stepRescue(e, rec, stations, state, dt) {
    if (!e || !e.pos || !rec) return false;

    // Phase 1: Carrying survivor to station
    if (rec.carryingSurvivor) {
      let target = state.entities && state.entities.get ? state.entities.get(rec.targetId) : null;
      if (!target || !target.alive || !target.pos) {
        target = this._pickStation(stations);
        rec.targetId = target ? target.id : null;
      }
      if (!target || !target.pos) return false;

      const dx = target.pos.x - e.pos.x;
      const dz = target.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const aimAngle = Math.atan2(dz, dx);

      if (dist < DOCK_RANGE) {
        // Arrived at station — survivor delivered
        const podEntityId = rec.rescueTargetId;
        rec.carryingSurvivor = false;
        rec.rescueTargetId = null;
        rec.rescueTargetType = null;
        rec.civilianReaction = null;
        rec.waitT = 3.0;
        setIntent(e, 0, 0, false, true, null, aimAngle);
        if (e.data && e.data.intent) e.data.intent.brake = true;
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('survivorPod:delivered', {
            rescueHullId: e.id,
            podEntityId,
            stationId: target.id,
            simTime: state.simTime || 0,
          });
          this.bus.emit('comms:message', {
            sender: (e.data && e.data.trafficLabel) || 'Rescue Craft',
            channel: 'emergency',
            text: `Survivor delivered safely to ${target.name || 'station'} medical facility. Resuming patrol.`,
            callerId: e.id,
            pos: { x: e.pos.x, z: e.pos.z },
          });
        }
        return true;
      }

      rec.civilianReaction = 'transporting_survivor';
      setIntent(e, 0, 1, false, false, null, aimAngle);
      return true;
    }

    // Phase 2: Active target tracking
    let targetObj = null;
    if (rec.rescueTargetType === 'pod' && rec.rescueTargetId != null) {
      const candidate = state.entities && state.entities.get ? state.entities.get(rec.rescueTargetId) : null;
      if (candidate && candidate.alive !== false && candidate.pos) {
        targetObj = { kind: 'pod', entity: candidate, pos: candidate.pos };
      } else {
        rec.rescueTargetId = null;
        rec.rescueTargetType = null;
      }
    } else if (rec.rescueTargetType === 'distress' && rec.rescueTargetPos) {
      const call = state.traffic && state.traffic.lastDistressCall;
      const age = (state.simTime || 0) - (call ? call.simTime : 0);
      // Live-caller mayday: the snapshot goes stale the moment the caller moves. While the
      // caller hull still lives and its mayday is recent, chase the hull. Its death hands the
      // scene to the pod scan (Phase 3 priority 1) and the existing aftermath; a mayday that
      // has gone quiet past the stand-down bound ends the escort instead of holding it forever.
      const caller = rec.rescueCallerId != null && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(rec.rescueCallerId)
        : null;
      const lastMaydayT = caller && caller.data && Number.isFinite(caller.data.lastDistressSimT)
        ? caller.data.lastDistressSimT
        : (call ? call.simTime : -Infinity);
      if (caller && caller.alive !== false && caller.pos) {
        if ((state.simTime || 0) - lastMaydayT > RESCUE_CALLER_STANDDOWN_S) {
          rec.rescueTargetPos = null;
          rec.rescueCallerId = null;
          rec.rescueOnSceneSimT = null;
          rec.rescueTargetType = null;
        } else {
          targetObj = { kind: 'distress', pos: caller.pos, callerEnt: caller };
        }
      } else if (!caller && call && age < 45) {
        targetObj = { kind: 'distress', pos: rec.rescueTargetPos };
      } else {
        rec.rescueTargetPos = null;
        rec.rescueCallerId = null;
        rec.rescueOnSceneSimT = null;
        rec.rescueTargetType = null;
      }
    } else if (rec.rescueTargetType === 'disabled' && rec.rescueTargetId != null) {
      const candidate = state.entities && state.entities.get ? state.entities.get(rec.rescueTargetId) : null;
      if (candidate && candidate.alive !== false && isShipDisabled(candidate, state)) {
        targetObj = { kind: 'disabled', entity: candidate, pos: candidate.pos };
      } else {
        rec.rescueTargetId = null;
        rec.rescueTargetType = null;
      }
    }

    // Phase 3: Find target if none active
    if (!targetObj) {
      const found = this._findNearbyRescueTarget(state, e, 2500);
      if (found) {
        targetObj = found;
        rec.rescueTargetType = found.kind;
        if (found.kind === 'pod') {
          rec.rescueTargetId = found.entity.id;
        } else if (found.kind === 'distress') {
          rec.rescueTargetPos = found.pos;
          rec.rescueCallerId = found.callerId != null ? found.callerId : null;
          rec.rescueOnSceneSimT = null; // fresh link-up episode: one on-scene call is owed
        } else if (found.kind === 'disabled') {
          rec.rescueTargetId = found.entity.id;
        }
      }
    }

    // Phase 4: Execute target approach
    if (targetObj && targetObj.pos) {
      const dx = targetObj.pos.x - e.pos.x;
      const dz = targetObj.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const aimAngle = Math.atan2(dz, dx);

      if (targetObj.kind === 'pod') {
        rec.civilianReaction = 'responding_survivor';
        if (dist <= 25) {
          // Within rescue claim radius
          setIntent(e, 0, 0, false, true, null, aimAngle);
          if (e.data && e.data.intent) e.data.intent.brake = true;
        } else {
          setIntent(e, 0, 1, false, false, null, aimAngle);
        }
        return true;
      }

      if (targetObj.kind === 'distress') {
        // Live caller: link up and hold station with the hull instead of circling the snapshot
        // point it called from. One throttled on-scene call per link-up; the latch holds until
        // the caller dies (pod scan takes over), nearby violence (the flee path wins), or the
        // stand-down bound in Phase 2.
        let callerEnt = targetObj.callerEnt || null;
        if (!callerEnt && rec.rescueCallerId != null && state.entities && typeof state.entities.get === 'function') {
          const live = state.entities.get(rec.rescueCallerId);
          if (live && live.alive !== false && live.pos) callerEnt = live;
        }
        if (callerEnt) {
          const cdx = callerEnt.pos.x - e.pos.x;
          const cdz = callerEnt.pos.z - e.pos.z;
          const cdist = Math.hypot(cdx, cdz);
          const caim = Math.atan2(cdz, cdx);
          if (cdist < 80) {
            rec.civilianReaction = 'standing_by_caller';
            setIntent(e, 0, 0, false, true, null, caim);
            if (e.data && e.data.intent) e.data.intent.brake = true;
            if (rec.rescueOnSceneSimT == null) {
              rec.rescueOnSceneSimT = state.simTime || 0;
              if (this.bus && typeof this.bus.emit === 'function') {
                this.bus.emit('comms:message', {
                  sender: (e.data && e.data.trafficLabel) || 'Rescue Craft',
                  channel: 'distress',
                  text: `On scene, ${(callerEnt.data && callerEnt.data.trafficLabel) || callerEnt.name || 'Civilian Craft'} — hang together.`,
                  callerId: callerEnt.id,
                  pos: { x: callerEnt.pos.x, z: callerEnt.pos.z },
                });
              }
            }
          } else {
            rec.civilianReaction = 'responding_distress';
            setIntent(e, 0, 1, false, false, null, caim);
          }
          return true;
        }
        rec.civilianReaction = 'responding_distress';
        if (dist < 80) {
          // Reached distress scene — check if any pods appeared
          const nearbyPod = this._findNearbyRescueTarget(state, e, 400);
          if (nearbyPod && nearbyPod.kind === 'pod') {
            rec.rescueTargetType = 'pod';
            rec.rescueTargetId = nearbyPod.entity.id;
            rec.rescueTargetPos = null;
            rec.rescueCallerId = null;
            rec.rescueOnSceneSimT = null;
          } else {
            // Scene cleared
            rec.rescueTargetType = null;
            rec.rescueTargetPos = null;
            rec.rescueCallerId = null;
            rec.rescueOnSceneSimT = null;
            rec.civilianReaction = null;
            return false;
          }
        } else {
          setIntent(e, 0, 1, false, false, null, aimAngle);
        }
        return true;
      }

      if (targetObj.kind === 'disabled') {
        rec.civilianReaction = 'responding_disabled';
        if (dist < 60) {
          rec.civilianReaction = 'standby_disabled';
          setIntent(e, 0, 0, false, true, null, aimAngle);
          if (e.data && e.data.intent) e.data.intent.brake = true;
        } else {
          setIntent(e, 0, 0.9, false, false, null, aimAngle);
        }
        return true;
      }
    }

    // No rescue task active — fall back to standard route
    rec.civilianReaction = null;
    return false;
  },

  _syncTrafficRecordToData(e, rec) {
    if (!e || !e.data || !rec) return;
    const d = e.data;
    d.carrying = !!rec.carrying;
    d.fleeingWithLoad = !!rec.fleeingWithLoad;
    d.scenicBodyId = rec.scenicBodyId || null;
    d.assistingShipId = rec.assistingShipId || null;
    d.cargoDumped = !!rec.cargoDumped;
    d.civilianReaction = rec.civilianReaction || null;
    d.carryingSurvivor = !!rec.carryingSurvivor;
    d.rescueTargetId = rec.rescueTargetId || null;
    d.rescueTargetType = rec.rescueTargetType || null;
  },

  _resolveAsteroid(state, id) {
    if (id == null) return null;
    const live = state.entities && state.entities.get && state.entities.get(id);
    if (live && live.type === 'asteroid' && live.alive !== false) return live;
    return getAsteroidFieldRock(state, id);
  },

  _pickAsteroid(state) {
    let picked = null;
    let seen = 0;
    forEachFieldRock(state, (e) => {
      seen += 1;
      if (this._rng() < 1 / seen) picked = e;
    });
    return picked ? picked.id : null;
  },

  /**
   * The rock a barge working out of `home` would actually cut: the nearest workable one, with a
   * deterministic spread so a shift's barges do not all stack on the same face.
   *
   * WHY THIS EXISTS. `_pickAsteroid` samples the sector's asteroid index UNIFORMLY, which is right
   * for its original callers (the ambient stepper wandering to some rock) and wrong for commissioning
   * a durable job. A sector is 4200 units in radius, so a uniformly-drawn field waypoint routinely
   * sends a barge past several hundred identical rocks to cut one across the map. Measured in
   * `sector_helios_prime`: live job hulls sitting 1083, 1694, 1841, 3815 and **13491** units from the
   * player, with the working ones effectively never in the same place as anything else.
   *
   * That is a fiction problem before it is a density problem — no crew burns a shift's fuel to reach
   * an identical rock — and it is a density problem because extraction ends up nowhere near the
   * refinery that eats the ore, so neither the player nor any other NPC ever shares a frame with it.
   *
   * `spread` picks the Nth-nearest rather than always the 1st, so several barges out of one refinery
   * work neighbouring faces instead of stacking on one. It is an index, not a random draw: the caller
   * derives it from the hull's own spawn ordinal so the result stays deterministic.
   */
  _pickWorkableAsteroidNear(state, home, spread = 0) {
    if (!home || !home.pos) return this._pickAsteroid(state);
    const wanted = Math.max(1, Math.min(MINER_FIELD_SPREAD_CAP, (spread | 0) + 1));
    const bestId = new Array(wanted).fill(null);
    const bestD2 = new Array(wanted).fill(Infinity);
    forEachFieldRock(state, (rock) => {
      if (!rock.pos) return;
      const dx = rock.pos.x - home.pos.x;
      const dz = rock.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      for (let i = 0; i < wanted; i++) {
        if (d2 >= bestD2[i]) continue;
        for (let j = wanted - 1; j > i; j--) { bestD2[j] = bestD2[j - 1]; bestId[j] = bestId[j - 1]; }
        bestD2[i] = d2;
        bestId[i] = rock.id;
        break;
      }
    });
    // Fewer rocks than the requested rank: fall back down the list rather than returning null, so a
    // thin field still yields a job instead of silently dropping the barge to its ambient stepper.
    for (let i = wanted - 1; i >= 0; i--) if (bestId[i] != null) return bestId[i];
    return null;
  },

  /**
   * The nearest OTHER station to `home`, or null when `home` is the only berth in reach.
   *
   * Distinct from `_pickExpressDestination`, which deliberately reaches for a far, interesting
   * endpoint because an express liner's whole point is crossing the map. Local trades need the
   * opposite: the berth you can actually be at before the seal fails.
   */
  _nearestStationTo(stations, home) {
    if (!Array.isArray(stations) || !home || !home.pos) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const st of stations) {
      if (!st || st === home || !st.pos) continue;
      const dx = st.pos.x - home.pos.x;
      const dz = st.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = st; }
    }
    return best;
  },

  /**
   * Nearest live entity of `type` to `anchor`, or null. Used to bind a working job to a real body
   * (a salvor's hulk) rather than a coordinate, so the site can be resolved again at render time
   * and the job dies honestly when the body does.
   *
   * Linear over the entity list, but this runs once per hull at commission — never per frame.
   */
  _nearestOfTypeTo(state, anchor, type) {
    if (!anchor || !anchor.pos || !state) return null;
    let best = null;
    let bestD2 = Infinity;
    const visit = type === 'asteroid'
      ? forEachFieldRock
      : (type === 'pickup' || type === 'payload')
        ? forEachJobInteractable
        : forEachLivingWorldActor;
    visit(state, (e) => {
      if (e.type !== type || !e.pos) return;
      const dx = e.pos.x - anchor.pos.x;
      const dz = e.pos.z - anchor.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    });
    return best;
  },

  // ── WF-01 / U03 general salvor occupation ─────────────────────────────────────────────────────
  // Independent cleanup profession on the ordinary route. Takes EXISTING wreck salvagePool /
  // civilian-manifest payloads through cargoManifest custody; never mints value. Movement is
  // exclusively npcJobsRuntime via jobId. Ceres authored cast is gated out below.

  _isGeneralSalvorEntity(entity) {
    if (!entity || !entity.data || entity.alive === false) return false;
    if (entity.data.ceresActivityCast === true) return false;
    if (entity.data.activityActorSlotId) return false;
    return entity.data.trafficRole === 'salvor' || (entity.data.jobId && entity.data.jobKind === 'salvor');
  },

  _salvagePoolTotal(pool) {
    if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return 0;
    let total = 0;
    for (const key of Object.keys(pool)) {
      const qty = Math.floor(Number(pool[key]) || 0);
      if (qty > 0) total += qty;
    }
    return total;
  },

  _salvageSourceBinding(entity) {
    const data = entity && entity.data;
    const sourceKey = data && typeof data.salvageSourceKey === 'string' ? data.salvageSourceKey : null;
    if (!sourceKey) return null;
    const salvageApi = this.helpers && this.helpers.salvage;
    const source = salvageApi && typeof salvageApi.source === 'function' ? salvageApi.source(sourceKey) : null;
    return {
      sourceKey,
      salvagePointId: typeof data.salvagePointId === 'string' ? data.salvagePointId : (source && source.salvagePointId) || null,
      source,
    };
  },

  _salvageSourceBindingFromPayload(payload) {
    const sourceKey = payload && typeof payload.salvageSource === 'string' ? payload.salvageSource : null;
    if (!sourceKey) return null;
    const salvageApi = this.helpers && this.helpers.salvage;
    const source = salvageApi && typeof salvageApi.source === 'function' ? salvageApi.source(sourceKey) : null;
    return {
      sourceKey,
      salvagePointId: typeof payload.salvagePointId === 'string'
        ? payload.salvagePointId
        : (source && source.salvagePointId) || null,
      source,
    };
  },

  _releaseSalvageSourceClaim(binding, worldRecordId) {
    const salvageApi = this.helpers && this.helpers.salvage;
    if (!binding || !binding.sourceKey || !worldRecordId
      || !salvageApi || typeof salvageApi.releaseSourceClaim !== 'function') return false;
    return !!salvageApi.releaseSourceClaim({ sourceKey: binding.sourceKey, claimantId: worldRecordId }).ok;
  },

  _salvorHomeForTarget(stations, sectorId, target) {
    const binding = this._salvageSourceBinding(target);
    if (binding && binding.source && binding.source.homeStationId) {
      return (stations || []).find((station) => stationIdentity(station) === binding.source.homeStationId) || null;
    }
    return this._pocketStation(stations, sectorId) || (stations && stations[0]) || null;
  },

  _onFreightCargoSpilled(payload) {
    const state = this.state;
    if (!state) return;
    if (state.mode !== 'flight') return;
    const sectorId = state.world && state.world.currentSectorId;
    if (!sectorId) return;

    const encounterId = payload && payload.encounterId;
    const matchByEncounter = encounterId != null && encounterId !== '';
    const carrierId = payload && payload.carrierId;
    const carrier = (carrierId != null && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(carrierId)
      : null;
    const carrierLive = !!(carrier && carrier.alive !== false && carrier.pos);
    const r2 = SPILL_POD_CARRIER_RADIUS * SPILL_POD_CARRIER_RADIUS;

    const encounterPods = [];
    const nearbyPods = [];
    forEachJobInteractable(state, (entity) => {
      if (entity.type !== 'pickup' || !entity.pos) return;
      const data = entity.data || {};
      if (!data.freightCustodyPod || typeof data.freightCustodyPod !== 'object') return;
      if (matchByEncounter && data.encounterId === encounterId) {
        encounterPods.push(entity);
        return;
      }
      if (!carrierLive) return;
      const dx = entity.pos.x - carrier.pos.x;
      const dz = entity.pos.z - carrier.pos.z;
      if (dx * dx + dz * dz <= r2) nearbyPods.push(entity);
    });
    // A violence spill names its pods on the event; they are jettison payloads, not custody pickups.
    if (!encounterPods.length && Array.isArray(payload && payload.podIds)) {
      for (const podId of payload.podIds) {
        const pod = state.entities && typeof state.entities.get === 'function' ? state.entities.get(podId) : null;
        if (pod && pod.alive !== false && pod.pos && !nearbyPods.includes(pod)) nearbyPods.push(pod);
      }
    }
    const pods = encounterPods.length ? encounterPods : nearbyPods;
    if (!pods.length) return;

    const isSurvival = (entity) => !!(entity && entity.data && entity.data.runCohort === 'survival');
    if (isSurvival(carrier) || pods.some(isSurvival)) return;

    const t = Number.isFinite(state.simTime) ? state.simTime : 0;
    const podIds = [];
    for (const pod of pods) {
      const data = pod.data || (pod.data = {});
      data.spillNoticed = true;
      // Announced on the distress channel, so yards do not wait the 18-45 s stumble used for hulks.
      data.salvorNoticeAt = t + SPILL_ANNOUNCE_NOTICE_S;
      podIds.push(pod.id);
    }

    this._salvageTargetCache = null;
    this._salvageTargetCacheTick = null;
    this._dispatchGeneralSalvors(sectorId);
    this._dispatchYardTugs(sectorId);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('traffic:spillNoticed', {
        encounterId,
        custodyId: payload && payload.custodyId,
        podIds,
        sectorId,
        t,
      });
    }
  },

  /**
   * THE WORLD ANSWERS C5 — `well:haulerDragged` (fields.js receipt). Three consequences, all
   * through owners that already exist: the hull's shadowing escorts converge and hold (read in
   * _stepEscort), the hauler heaves to and re-plans, and the destination's lane takes a bounded
   * `sectorsim:impulse` (price pressure → demand prose + board offers). Once per (well, hauler).
   */
  _onWellHaulerDragged(payload) {
    const state = this.state;
    if (!state || state.mode !== 'flight' || !payload || payload.haulerId == null) return;
    const hauler = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(payload.haulerId)
      : null;
    if (!hauler || hauler.alive === false || !hauler.pos) return;
    const seen = this._wellDragSeen || (this._wellDragSeen = new Set());
    const key = `${payload.wellId}|${payload.haulerId}`;
    if (seen.has(key)) return;
    if (seen.size >= WELL_DRAG_SEEN_CAP) seen.clear();
    seen.add(key);

    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const freighters = (state.traffic && Array.isArray(state.traffic.freighters)) ? state.traffic.freighters : [];
    let haulerRec = null;
    for (let i = 0; i < freighters.length; i++) {
      if (freighters[i] && freighters[i].id === hauler.id) { haulerRec = freighters[i]; break; }
    }

    // Escorts that were shadowing THIS hull (same nearest-ward rule as _stepEscort) re-form on it.
    const regroup = this._wellDragRegroup || (this._wellDragRegroup = new Map());
    const escortIds = [];
    for (let i = 0; i < freighters.length && escortIds.length < WELL_DRAG_ESCORT_CAP; i++) {
      const row = freighters[i];
      if (!row || row.role !== 'escort') continue;
      const escort = state.entities.get(row.id);
      if (!escort || escort.alive === false || !escort.pos) continue;
      if (this._escortWardOf(escort, freighters, state) !== hauler) continue;
      regroup.set(escort.id, { haulerId: hauler.id, untilSimT: now + WELL_DRAG_REGROUP_S });
      escortIds.push(escort.id);
    }

    // The hauler stops to recover and re-plans its leg — only an ambient, unrouted hull; job /
    // claim / world-site hulls keep the owner that steers them (their escorts and lane still react).
    const manifest = (hauler.data && hauler.data.cargoManifest) || (haulerRec && haulerRec.manifest) || null;
    const routed = !!(hauler.data && (hauler.data.jobId || hauler.data.claimConvoy || hauler.data.claimDepotId))
      || !!(haulerRec && (haulerRec.worldSiteRoute || haulerRec.claimTravelRoute));
    let replanned = false;
    if (haulerRec && !routed) {
      haulerRec.targetId = null;
      haulerRec.waitT = Math.max(Number(haulerRec.waitT) || 0, WELL_DRAG_RECOVER_S);
      replanned = true;
    }

    // Economy half: intent only. The impulse lands on the DESTINATION's sector.
    const destSectorId = STATION_TO_SECTOR.get(payload.destStationId)
      || payload.sectorId || (state.world && state.world.currentSectorId) || null;
    const qty = Math.max(0, Number(manifest && manifest.totalQty) || 0);
    const pricePressure = WELL_DRAG_PRESSURE_MIN
      + (WELL_DRAG_PRESSURE_MAX - WELL_DRAG_PRESSURE_MIN) * Math.min(1, qty / WELL_DRAG_FULL_HOLD_QTY);
    if (destSectorId && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('sectorsim:impulse', {
        kind: 'lane_disruption',
        sectorId: destSectorId,
        pricePressure: Math.round(pricePressure * 10000) / 10000,
        danger: WELL_DRAG_DANGER,
      });
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('traffic:haulerRegroup', {
        schemaVersion: 1,
        wellId: payload.wellId,
        haulerId: hauler.id,
        escortIds,
        replanned,
        destStationId: payload.destStationId || null,
        sectorId: payload.sectorId || (state.world && state.world.currentSectorId) || null,
        t: now,
      });
    }
  },

  /** The nearest live non-escort/patrol/pirate freighter — the hull an escort shadows. */
  _escortWardOf(escort, list, state) {
    let ward = null, wd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r || r.role === 'escort' || r.role === 'patrol' || r.role === 'pirate') continue;
      const w = state.entities.get(r.id);
      if (!w || !w.alive) continue;
      const d = Math.hypot(w.pos.x - escort.pos.x, w.pos.z - escort.pos.z);
      if (d < wd) { wd = d; ward = w; }
    }
    return ward;
  },

  _isSalvageableBody(entity) {
    if (!entity || entity.alive === false || !entity.pos) return false;
    const data = entity.data || {};
    const source = this._salvageSourceBinding(entity);
    if (source) return !!(source.source && !source.source.extracted && source.source.remainingQty > 0);
    if (entity.type === 'wreck') {
      return this._salvagePoolTotal(data.salvagePool) > 0;
    }
    if (entity.type === 'payload') {
      if (data.payloadType !== CIVILIAN_MANIFEST_PAYLOAD_TYPE && data.spillNoticed !== true) return false;
      return this._salvagePoolTotal(data.salvagePool) > 0;
    }
    if (entity.type === 'pickup'
        && data.spillNoticed === true
        && data.freightCustodyPod
        && typeof data.freightCustodyPod === 'object'
        && Number.isFinite(data.amount)
        && data.amount > 0) {
      return true;
    }
    return false;
  },

  _salvorClaimantOf(entity) {
    const source = this._salvageSourceBinding(entity);
    if (source) return source.source && source.source.claimId || null;
    const claim = entity && entity.data && entity.data.salvorClaimedBy;
    return typeof claim === 'string' && claim ? claim : null;
  },

  _clearSalvorClaim(entity, worldRecordId) {
    if (!entity || !entity.data) return;
    const source = this._salvageSourceBinding(entity);
    if (source) {
      this._releaseSalvageSourceClaim(source, worldRecordId);
      return;
    }
    if (worldRecordId && entity.data.salvorClaimedBy !== worldRecordId) return;
    delete entity.data.salvorClaimedBy;
  },

  _stampSalvorClaim(entity, worldRecordId) {
    if (!entity || !entity.data || !worldRecordId) return false;
    const source = this._salvageSourceBinding(entity);
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      return !!(salvageApi && typeof salvageApi.claimSource === 'function'
        && salvageApi.claimSource({ sourceKey: source.sourceKey, claimantId: worldRecordId }).ok);
    }
    const existing = this._salvorClaimantOf(entity);
    if (existing && existing !== worldRecordId) return false;
    entity.data.salvorClaimedBy = worldRecordId;
    return true;
  },

  _salvorNoticeReady(entity, simTime) {
    if (!entity || !entity.data) return false;
    const t = Number.isFinite(simTime) ? simTime : 0;
    if (!Number.isFinite(entity.data.salvorNoticeAt)) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const sectorId = (this.state.world && this.state.world.currentSectorId) || '';
      const span = Math.max(1, SALVOR_NOTICE_DELAY_SPAN_S | 0);
      const roll = (hash32(seed, 'salvor_notice', entity.id, sectorId, entity.type) >>> 0) % span;
      entity.data.salvorNoticeAt = t + SALVOR_NOTICE_DELAY_MIN_S + roll;
    }
    return t >= entity.data.salvorNoticeAt;
  },

  _listSalvageTargets() {
    const tick = Number.isInteger(deferredEnterTick(this.state)) ? deferredEnterTick(this.state) : 0;
    if (this._salvageTargetCache
        && this._salvageTargetCacheTick != null
        && tick - this._salvageTargetCacheTick < 4
        && !shouldRunOnTick(tick, 'traffic:salvageList', 4)) {
      return this._salvageTargetCache;
    }
    const out = [];
    forEachJobInteractable(this.state, (e) => {
      if (this._isSalvageableBody(e)) out.push(e);
    });
    // Stable order for deterministic assignment under the concurrent cap.
    out.sort((a, b) => {
      const ta = a.type === 'payload' ? 0 : 1;
      const tb = b.type === 'payload' ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id), 'en');
    });
    this._salvageTargetCache = out;
    this._salvageTargetCacheTick = tick;
    return out;
  },

  _countGeneralSalvors() {
    let n = 0;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'salvor') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || ent.alive === false || !ent.data) continue;
      if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
      if (ent.data.jobId) n += 1;
    }
    return n;
  },

  _pickUnclaimedSalvageTarget(anchor) {
    const ax = anchor && anchor.pos && Number.isFinite(anchor.pos.x) ? anchor.pos.x : 0;
    const az = anchor && anchor.pos && Number.isFinite(anchor.pos.z) ? anchor.pos.z : 0;
    let best = null;
    let bestD2 = Infinity;
    for (const target of this._listSalvageTargets()) {
      const claim = this._salvorClaimantOf(target);
      if (claim) continue;
      if (!this._salvorNoticeReady(target, deferredEnterNow(this.state) || 0)) continue;
      const dx = target.pos.x - ax;
      const dz = target.pos.z - az;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    return best;
  },

  _buildSalvorJobSpec(home, target, sectorId) {
    if (!home || !home.pos || !target || !target.pos) return null;
    const targetKind = target.type === 'payload' ? 'payload' : 'hulk';
    const source = this._salvageSourceBinding(target);
    return {
      kind: 'salvor',
      sectorId,
      route: [
        { id: 'yard:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Scrap Yard' },
        {
          id: `${targetKind}:${target.id}`,
          pos: { x: target.pos.x, z: target.pos.z },
          label: targetKind === 'payload' ? 'Loose Cargo' : 'Hulk',
        },
      ],
      // Planning only: points at the live body. Extracted value is stamped onto cargoManifest later.
      payload: {
        targetId: target.id,
        targetType: target.type,
        ...(source ? {
          salvageSource: source.sourceKey,
          salvagePointId: source.salvagePointId,
        } : {}),
        extracted: false,
      },
    };
  },

  _resolveSalvorTargetFromWaypoint(waypointId, payload = null) {
    const source = this._salvageSourceBindingFromPayload(payload);
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      return salvageApi && typeof salvageApi.entityForPoint === 'function'
        ? salvageApi.entityForPoint(source.salvagePointId, source.sourceKey)
        : null;
    }
    if (typeof waypointId !== 'string' || !waypointId) return null;
    let raw = null;
    if (waypointId.startsWith('hulk:')) raw = waypointId.slice(5);
    else if (waypointId.startsWith('payload:')) raw = waypointId.slice(8);
    else return null;
    if (!raw) return null;
    const numeric = Number(raw);
    return this.state.entities && this.state.entities.get
      ? (this.state.entities.get(raw)
        || (Number.isFinite(numeric) ? this.state.entities.get(numeric) : null))
      : null;
  },

  _buildSalvorManifest(entity, seq, pool, source = null) {
    const lines = [];
    let totalQty = 0;
    for (const commodityId of Object.keys(pool || {}).sort((a, b) => a.localeCompare(b))) {
      const qty = Math.max(0, Math.floor(Number(pool[commodityId]) || 0));
      if (qty <= 0) continue;
      lines.push({ commodityId, qty });
      totalQty += qty;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = entity && entity.data && entity.data.worldRecordId
      || entity && entity.id
      || 'npc-salvor';
    const marketKeys = lines.length
      ? lines.map((line) => line.commodityId)
      : FREIGHT_MARKET_KEYS_FALLBACK.slice();
    // Structural freight envelope only. Lines are overwritten from the real pool so we never mint
    // a random market draw in place of taken salvage.
    const manifest = buildCargoManifest({
      seed,
      freighterKey: `${freighterKey}:salvage:${Math.max(0, seq | 0)}`,
      role: 'hauler',
      marketKeys,
      capacity: Math.max(0, totalQty),
    });
    manifest.lines = lines;
    manifest.totalQty = totalQty;
    manifest.role = 'salvor';
    // The cutter's extracted lot keeps one durable identity from wreck to yard. The source sequence
    // is the WORK intent that created the manifest, not a later unload attempt, so a rejected hold
    // can circle and retry without becoming a second market receipt.
    manifest.lotId = manifest.manifestId;
    manifest.salvageSeq = Math.max(0, seq | 0);
    if (source && source.sourceKey) {
      manifest.salvageSource = source.sourceKey;
      manifest.salvagePointId = source.salvagePointId || null;
    }
    return manifest;
  },

  _emptySalvorManifest(entity, seq) {
    return this._buildSalvorManifest(entity, seq, {});
  },

  _despawnSalvagePayload(entity, reason) {
    if (!entity || entity.type !== 'payload') return false;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      removeEntity(entity.id, { immediate: true, reason: reason || 'salvor_absorbed' });
    } else entity.alive = false;
    return true;
  },

  _takeSalvageValueOntoSalvor(context, intent, target) {
    if (!context || !context.entity || !target) return false;
    const seq = Number.isSafeInteger(intent && intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    const workId = `npc-salvor-work:${context.worldRecordId}:${seq}`;
    const source = this._salvageSourceBinding(target);
    this._ensureState();
    if (!Array.isArray(this.state.traffic.appliedSalvorWorkIds)) {
      this.state.traffic.appliedSalvorWorkIds = [];
    }
    if (this.state.traffic.appliedSalvorWorkIds.includes(workId)) return false;

    let pool = target.data && target.data.salvagePool
      ? { ...target.data.salvagePool }
      : {};
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      if (!this._stampSalvorClaim(target, context.worldRecordId)
        || !salvageApi || typeof salvageApi.takeSource !== 'function') return false;
      const taken = salvageApi.takeSource({
        sourceKey: source.sourceKey,
        claimantId: context.worldRecordId,
        workId,
      });
      pool = taken && taken.ok ? taken.pool : {};
    }
    const total = this._salvagePoolTotal(pool);

    if (total > 0) {
      if (!source && !this._stampSalvorClaim(target, context.worldRecordId)) return false;
      const manifest = this._buildSalvorManifest(context.entity, seq, pool, source);
      this._setTrafficManifest(context.entity, context.rec, manifest);
      // Drain the body so the player cannot double-take what the cutter already loaded.
      if (!source && target.data) {
        target.data.salvagePool = {};
        if (target.type === 'wreck') {
          target.data.salvageTimeLeft = 0;
          target.data._salvaged = true;
        }
      }
      if (target.type === 'payload') this._despawnSalvagePayload(target, 'salvor_absorbed');
    } else {
      this._setTrafficManifest(context.entity, context.rec, this._emptySalvorManifest(context.entity, seq));
      this._clearSalvorClaim(target, context.worldRecordId);
    }

    // Keep job planning payload honest for save/Continue observers.
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(context.jobId) : null;
    if (entry && entry.job) {
      entry.job.payload = {
        targetId: target.id,
        targetType: target.type,
        ...(source ? {
          salvageSource: source.sourceKey,
          salvagePointId: source.salvagePointId,
        } : {}),
        extracted: total > 0,
        totalQty: total,
      };
    }

    this.state.traffic.appliedSalvorWorkIds.push(workId);
    if (this.state.traffic.appliedSalvorWorkIds.length > SALVOR_WORK_LEDGER_CAP) {
      this.state.traffic.appliedSalvorWorkIds.splice(
        0,
        this.state.traffic.appliedSalvorWorkIds.length - SALVOR_WORK_LEDGER_CAP,
      );
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('salvage:npcExtraction', {
        jobId: context.jobId,
        workId,
        salvorId: context.entity.id,
        targetId: target.id,
        targetType: target.type,
        salvageSource: source && source.sourceKey || null,
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        totalQty: total,
        seq,
      });
    }
    return true;
  },

  _spawnGeneralSalvorNear(home, sectorId, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!home || !home.pos) return null;
    const def = TRAFFIC_ROLES.salvor;
    const sector = (this.state.world && this.state.world.sectors)
      ? this.state.world.sectors[sectorId]
      : null;
    const controllingFaction = (sector && sector.factionId)
      || (this.state.world && this.state.world.currentSector && this.state.world.currentSector.factionId)
      || 'faction_free';
    // Deterministic offset from the yard so two concurrent cutters do not stack on one point.
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'salvor_spawn', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    const r = 100 + (seq % 3) * 28;
    const pos = { x: home.pos.x + Math.cos(ang) * r, z: home.pos.z + Math.sin(ang) * r };
    const spec = makeShipEntitySpec(factionHullFor(def.ship, controllingFaction, () => 0.5), {
      team: def.team,
      factionId: controllingFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return null;
    this._stampTrafficDurableIdentity(ent, sectorId, 'salvor', def, 800 + (seq | 0));
    ent.data.trafficRole = 'salvor';
    ent.data.role = 'salvor';
    ent.data.homeStationId = stationIdentity(home);
    ent.data.trafficLabel = def.label;
    ent.data.generalSalvor = true;
    // Empty hold on commission — value is claimed from the wreck/payload, never pre-rolled.
    const empty = this._emptySalvorManifest(ent, 0);
    this._setTrafficManifest(ent, null, empty);
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'salvor',
      targetId: home.id,
      waitT: 0,
      nextTradeT: 0,
      orbitPhase: ang,
      dockSeq: 0,
      manifest: empty,
      generalSalvor: true,
    };
    this.state.traffic.freighters.push(rec);
    return { entity: ent, rec };
  },
};
