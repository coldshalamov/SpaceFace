// PQ-019A: physical facility embodiment and deterministic cargo-capsule schedule.
//
// Ownership boundary:
// - Sole writer for state.heistFacilities and the entities it creates.
// - Emits candidate receipts only. It never settles cargo, credits, reputation,
//   WANTED heat, missions, patrols, or saves.

import { Masks } from '../core/entity.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  projectPq019FacilitySocket,
} from '../data/heistFacilities.js';

const HEIST_FACILITIES_SCHEMA_VERSION = 1;
const MAX_CANDIDATE_RECEIPTS = 32;

// ── Player-visible launch schedule cue (PQ-019A) ────────────────────────────────────────────────
//
// A pending schedule was previously invisible to the player: the owner produced deterministic
// receipts, but nothing announced the launch window on the flight route. These T-minus moments are
// the cue.
//
// Contract:
//   * BOUNDED MOMENTS, NOT PER-FRAME. The publisher fires only on the tick where the sim clock
//     CROSSES an authored threshold, so a 30 s window speaks at most four times (30/15/5 + away).
//   * STATELESS AND DETERMINISTIC. `crossedLaunchCueTMinus` is a pure function of
//     (launchAtSimT, previous simTime, current simTime); the previous clock is reconstructed from
//     the frame's own `dt`. There is no cursor to persist, so the cue adds NO save key and cannot
//     desynchronize from the schedule it describes. Re-entering the sector cannot re-fire a
//     threshold that is already in the past, and entering mid-window speaks only the thresholds
//     still ahead — by construction, not by bookkeeping.
//   * ONE VOICE. Every line is enqueued under the single stable id below, on the `objective`
//     channel (priority 60; danger 110 stays reserved for life-critical alerts). VoiceQueue
//     coalesces same-id entries in place, so the whole countdown occupies at most one floor slot
//     and can never stack a second pill against itself.
//   * SIM-INERT. The publisher writes no sim state and spawns nothing. It reaches the player only
//     through the established `ctx.helpers.voice.say` seam, which is DOM-free — alerts.js owns the
//     floor pill and is already window-guarded. Where voiceArbiter is not registered (headless
//     harnesses, deterministic sim) `helpers.voice` is undefined and the call is a strict no-op.
//     This is deliberately NOT gated on `typeof window`: per the weapons.js N1 note, host-divergent
//     behavior is the bug that gate creates, and it would also blind the focused tests.
//   * NON-COLOR SEMANTICS. Each line states the facility and the remaining time in words. No cue
//     depends on hue, and none introduces motion beyond the existing floor presentation.
export const PQ019_LAUNCH_CUE_TMINUS_S = Object.freeze([30, 15, 5]);
export const PQ019_LAUNCH_CUE_VOICE_ID = 'pq019a:launch-schedule';
export const PQ019_LAUNCH_CUE_CHANNEL = 'objective';
const LAUNCH_CUE_TTL_S = 4;

/**
 * Largest-information cue threshold crossed in the half-open interval (prevSimT, simT].
 *
 * Pure and total. Returns the SMALLEST crossed threshold when a single long frame steps over
 * several at once, because the reading closest to launch is the truthful one to show. Returns null
 * when the clock did not advance across any authored moment.
 */
export function crossedLaunchCueTMinus(launchAtSimT, prevSimT, simT) {
  if (![launchAtSimT, prevSimT, simT].every(Number.isFinite)) return null;
  if (!(simT > prevSimT)) return null;
  let crossed = null;
  for (const tMinus of PQ019_LAUNCH_CUE_TMINUS_S) {
    const at = launchAtSimT - tMinus;
    if (at > prevSimT && at <= simT && (crossed === null || tMinus < crossed)) {
      crossed = tMinus;
    }
  }
  return crossed;
}

/** Player-facing line for a T-minus moment. Text carries the whole meaning. */
export function launchCueTextForTMinus(tMinus) {
  return `${PQ019_FACILITIES.heist_launcher.name}: cargo launch in ${tMinus}s`;
}

/** Player-facing line for the moment the capsule is physically away. */
export function launchCueAwayText() {
  return `Cargo capsule away — outbound to ${PQ019_FACILITIES.lawful_catcher.name}`;
}

function makeState() {
  return {
    schemaVersion: HEIST_FACILITIES_SCHEMA_VERSION,
    facilities: {},
    schedule: null,
    capsuleEntityId: null,
    candidateReceipts: [],
    candidateIds: {},
  };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function cleanScheduleId(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function entityIsAlive(state, id) {
  if (id == null || !state?.entities?.get) return null;
  const entity = state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function stableNumber(value) {
  return Number(finite(value).toFixed(6));
}

function scheduleReceipt(scheduleId, launchAtSimT) {
  return Object.freeze({
    accepted: true,
    receiptId: `pq019a:schedule:${scheduleId}:${stableNumber(launchAtSimT).toFixed(6)}`,
    scheduleId,
    launchAtSimT: stableNumber(launchAtSimT),
    source: 'heistFacilities',
  });
}

function deniedReceipt(request, active) {
  return Object.freeze({
    accepted: false,
    reason: 'active_schedule',
    scheduleId: cleanScheduleId(request?.scheduleId),
    launchAtSimT: Number.isFinite(request?.launchAtSimT)
      ? stableNumber(request.launchAtSimT)
      : null,
    activeScheduleId: active.scheduleId,
    source: 'heistFacilities',
  });
}

export const heistFacilities = {
  name: 'heistFacilities',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    ctx.heistFacilities = this;

    if (!this.state.heistFacilities
      || this.state.heistFacilities.schemaVersion !== HEIST_FACILITIES_SCHEMA_VERSION) {
      this.state.heistFacilities = makeState();
    }
    this._normalizeState();

    if (this._wiredBus === this.bus) {
      if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
        this.materializeForSector(PQ019_HEIST_SECTOR_ID);
      }
      return;
    }
    this._wiredBus = this.bus;

    this.bus.on('sector:enter', ({ sectorId } = {}) => this.materializeForSector(sectorId));
    this.bus.on('sector:exit', ({ sectorId } = {}) => this._dematerializeSector(sectorId));
    this.bus.on('entity:destroyed', ({ id } = {}) => this._onEntityDestroyed(id));
    this.bus.on('physics:impact', (impact = {}) => this._onPhysicsImpact(impact));
    this.bus.on('heist:requestLaunchSchedule', (request = {}) => {
      this.requestLaunchSchedule(request);
    });

    if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
      this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    }
  },

  newGame() {
    this.state.heistFacilities = makeState();
    if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
      this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    }
  },

  update(dt, state) {
    const owned = state.heistFacilities;
    const schedule = owned?.schedule;
    if (!schedule || schedule.status !== 'scheduled') return;
    if (state.world?.currentSectorId !== PQ019_HEIST_SECTOR_ID) return;
    // Announce before launching: a countdown that speaks only after the capsule is away is not a cue.
    this._publishLaunchCue(schedule, state, dt);
    if (state.simTime + 1e-9 < schedule.launchAtSimT) return;
    this._launchScheduledCapsule(schedule);
  },

  /**
   * Speak the authored T-minus moment, if this frame crossed one. Pure decision, seam-only effect.
   * Returns the emitted cue receipt or null.
   */
  _publishLaunchCue(schedule, state, dt) {
    const step = Number(dt);
    if (!Number.isFinite(step) || step <= 0) return null;
    const simT = Number(state.simTime);
    const tMinus = crossedLaunchCueTMinus(schedule.launchAtSimT, simT - step, simT);
    if (tMinus === null) return null;
    return this._sayLaunchCue({
      scheduleId: schedule.scheduleId,
      moment: `t_minus_${tMinus}`,
      tMinusS: tMinus,
      text: launchCueTextForTMinus(tMinus),
    });
  },

  /**
   * Single exit for every player-visible schedule line.
   *
   * Emits an owner receipt (observable headlessly, presenter-free) and routes the spoken copy
   * through the one-voice seam under one stable id. No DOM, no sim write.
   */
  _sayLaunchCue({ scheduleId, moment, tMinusS, text }) {
    // Flight only. The countdown is a flight-HUD voice, and while docked the Station OS is a
    // fullscreen surface in front of the #alerts slot, so speaking there would push a pill nobody
    // can see and burn the one-voice floor behind another screen. Matches the stationBroadcast
    // precedent (`state.mode !== 'flight'` -> strict no-op). The LAUNCH itself is world simulation
    // and is deliberately not gated: the capsule still departs on schedule while the player is
    // docked, it simply is not narrated to a surface they are not looking at.
    if (this.state?.mode !== 'flight') return null;

    const receipt = Object.freeze({
      cueId: `pq019a:cue:${scheduleId}:${moment}`,
      scheduleId,
      moment,
      tMinusS,
      text,
      voiceId: PQ019_LAUNCH_CUE_VOICE_ID,
      channel: PQ019_LAUNCH_CUE_CHANNEL,
      source: 'heistFacilities',
    });
    const say = this.helpers?.voice?.say;
    if (typeof say === 'function') {
      say({
        channel: PQ019_LAUNCH_CUE_CHANNEL,
        id: PQ019_LAUNCH_CUE_VOICE_ID,
        text,
        kind: 'info',
        ttl: LAUNCH_CUE_TTL_S,
      });
    }
    this.bus.emit('heist:launchCue', receipt);
    return receipt;
  },

  materializeForSector(sectorId) {
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return 0;
    let created = 0;
    for (const facility of Object.values(PQ019_FACILITIES)) {
      const record = this._facilityRecord(facility.id);
      let visual = entityIsAlive(this.state, record.visualEntityId)
        || this._findOwnedEntity(facility.id, `${facility.role}_visual`);
      if (!visual) {
        visual = this._spawnFacilityVisual(facility);
        created++;
      }
      record.visualEntityId = visual.id;

      let head = entityIsAlive(this.state, record.headEntityId)
        || this._findOwnedEntity(facility.id, `${facility.role}_head`);
      if (!head) {
        head = this._spawnFacilityHead(facility);
        created++;
      }
      record.headEntityId = head.id;
    }
    return created;
  },

  requestLaunchSchedule(request = {}) {
    const scheduleId = cleanScheduleId(request.scheduleId);
    const launchAtSimT = Number(request.launchAtSimT);
    if (!scheduleId || !Number.isFinite(launchAtSimT) || launchAtSimT < 0) {
      const denied = Object.freeze({
        accepted: false,
        reason: 'invalid_schedule',
        scheduleId,
        launchAtSimT: Number.isFinite(launchAtSimT) ? stableNumber(launchAtSimT) : null,
        source: 'heistFacilities',
      });
      this.bus.emit('heist:launchScheduleReceipt', denied);
      return denied;
    }

    const owned = this.state.heistFacilities;
    const active = owned.schedule;
    if (active) {
      if (active.scheduleId === scheduleId
        && active.launchAtSimT === stableNumber(launchAtSimT)) {
        this.bus.emit('heist:launchScheduleReceipt', active.receipt);
        return active.receipt;
      }
      const denied = deniedReceipt(request, active);
      this.bus.emit('heist:launchScheduleReceipt', denied);
      return denied;
    }

    const receipt = scheduleReceipt(scheduleId, launchAtSimT);
    owned.schedule = {
      scheduleId,
      launchAtSimT: receipt.launchAtSimT,
      status: 'scheduled',
      receipt,
      capsuleEntityId: null,
      launchedAtTick: null,
    };
    this.bus.emit('heist:launchScheduleReceipt', receipt);
    return receipt;
  },

  _normalizeState() {
    const owned = this.state.heistFacilities;
    if (!owned.facilities || typeof owned.facilities !== 'object') owned.facilities = {};
    if (!Array.isArray(owned.candidateReceipts)) owned.candidateReceipts = [];
    if (!owned.candidateIds || typeof owned.candidateIds !== 'object') owned.candidateIds = {};
    if (owned.capsuleEntityId != null
      && !Number.isInteger(Number(owned.capsuleEntityId))) {
      owned.capsuleEntityId = null;
    }
  },

  _facilityRecord(facilityId) {
    const records = this.state.heistFacilities.facilities;
    if (!records[facilityId]) {
      records[facilityId] = {
        facilityId,
        visualEntityId: null,
        headEntityId: null,
      };
    }
    return records[facilityId];
  },

  _findOwnedEntity(facilityId, role) {
    return this.state.entityList.find((entity) => (
      entity?.alive !== false
      && entity.data?.heistFacilityId === facilityId
      && entity.data?.heistFacilityRole === role
    )) || null;
  },

  _global(localPos) {
    return sectorLocalToGlobalForSector(localPos, PQ019_HEIST_SECTOR_ID);
  },

  _spawnFacilityVisual(facility) {
    return this.helpers.spawnEntity({
      type: 'fx',
      factionId: facility.factionId,
      pos: this._global(facility.localPos),
      rot: facility.rot,
      radius: Math.max(20, facility.headRadius * 2),
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      homeSectorId: facility.sectorId,
      data: {
        heistFacilityId: facility.id,
        heistFacilityRole: `${facility.role}_visual`,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        placeId: facility.placeId,
        placeScale: facility.placeScale,
        name: facility.name,
        worldDressing: true,
        placeRadius: Math.max(20, facility.headRadius * 2),
      },
    });
  },

  _spawnFacilityHead(facility) {
    const socketLocal = projectPq019FacilitySocket(facility);
    const mass = 1e9;
    return this.helpers.spawnEntity({
      type: 'fx',
      _noMesh: true,
      factionId: facility.factionId,
      pos: this._global(socketLocal),
      rot: facility.rot,
      radius: facility.headRadius,
      mass,
      hull: 1e9,
      hullMax: 1e9,
      collides: true,
      collisionMask: Masks.PAYLOAD,
      ttl: Infinity,
      flags: { noInterp: true, invuln: true },
      homeSectorId: facility.sectorId,
      physicsBody: {
        dynamic: false,
        radius: facility.headRadius,
        mass,
        inertiaY: 0.5 * mass * facility.headRadius * facility.headRadius,
        ccd: false,
        material: 'station',
      },
      data: {
        heistFacilityId: facility.id,
        heistFacilityRole: `${facility.role}_head`,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        socketName: facility.socketName,
        payloadCustodyOnly: true,
      },
    });
  },

  _dematerializeSector(sectorId) {
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return;
    const owned = this.state.heistFacilities;
    const activeCapsule = this._activeScheduleCapsule(owned.schedule);
    if (activeCapsule) this.helpers.removeEntity(activeCapsule.id);
    owned.capsuleEntityId = null;
    if (owned.schedule) owned.schedule.capsuleEntityId = null;

    for (const facility of Object.values(PQ019_FACILITIES)) {
      const record = this._facilityRecord(facility.id);
      if (record.visualEntityId != null) this.helpers.removeEntity(record.visualEntityId);
      if (record.headEntityId != null) this.helpers.removeEntity(record.headEntityId);
      record.visualEntityId = null;
      record.headEntityId = null;
    }
  },

  _launchScheduledCapsule(schedule) {
    const owned = this.state.heistFacilities;
    const rebound = this._activeScheduleCapsule(schedule);
    if (rebound) {
      schedule.status = 'launched';
      return rebound;
    }

    this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    const launcher = this._facilityHead('heist_launcher');
    const catcher = this._facilityHead('lawful_catcher');
    if (!launcher || !catcher) return null;

    const dx = catcher.pos.x - launcher.pos.x;
    const dz = catcher.pos.z - launcher.pos.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0) || !Number.isFinite(length)) return null;
    const nx = dx / length;
    const nz = dz / length;
    const clearance = launcher.radius + PQ019_CAPSULE.radius + 2;
    const capsule = this.helpers.spawnEntity({
      type: 'payload',
      factionId: PQ019_CAPSULE.legalOwnerFactionId,
      ownerId: PQ019_CAPSULE.ownerId,
      team: 2,
      pos: {
        x: launcher.pos.x + nx * clearance,
        z: launcher.pos.z + nz * clearance,
      },
      vel: {
        x: nx * PQ019_CAPSULE.launchSpeed,
        z: nz * PQ019_CAPSULE.launchSpeed,
      },
      rot: Math.atan2(nz, nx),
      radius: PQ019_CAPSULE.radius,
      mass: PQ019_CAPSULE.mass,
      hull: PQ019_CAPSULE.hull,
      hullMax: PQ019_CAPSULE.hull,
      collides: true,
      ttl: Infinity,
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: true,
        radius: PQ019_CAPSULE.radius,
        mass: PQ019_CAPSULE.mass,
        inertiaY: 0.5 * PQ019_CAPSULE.mass * PQ019_CAPSULE.radius * PQ019_CAPSULE.radius,
        ccd: true,
        material: 'payload',
      },
      data: {
        heistFacilityRole: 'cargo_capsule',
        heistPayloadStableId: PQ019_CAPSULE.stableId,
        authoredPayloadAssetId: PQ019_CAPSULE.authoredPayloadAssetId,
        legalOwnerFactionId: PQ019_CAPSULE.legalOwnerFactionId,
        ownerId: PQ019_CAPSULE.ownerId,
        launchScheduleId: schedule.scheduleId,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
      },
    });

    owned.capsuleEntityId = capsule.id;
    schedule.capsuleEntityId = capsule.id;
    schedule.status = 'launched';
    schedule.launchedAtTick = this.state.tick | 0;
    this.bus.emit('heist:capsuleLaunched', Object.freeze({
      scheduleId: schedule.scheduleId,
      capsuleEntityId: capsule.id,
      payloadStableId: PQ019_CAPSULE.stableId,
      launchedAtTick: schedule.launchedAtTick,
      source: 'heistFacilities',
    }));
    // Closes the countdown on the same stable voice id, so the last thing the player heard about
    // this schedule is that the capsule is real and where it is headed. The rebind path above
    // returns before this point: recovering a still-live capsule is not a fresh launch.
    this._sayLaunchCue({
      scheduleId: schedule.scheduleId,
      moment: 'away',
      tMinusS: 0,
      text: launchCueAwayText(),
    });
    return capsule;
  },

  _facilityHead(facilityId) {
    const facility = PQ019_FACILITIES[facilityId];
    if (!facility) return null;
    const record = this._facilityRecord(facilityId);
    return entityIsAlive(this.state, record.headEntityId)
      || this._findOwnedEntity(facilityId, `${facility.role}_head`);
  },

  _onEntityDestroyed(id) {
    if (id == null) return;
    const owned = this.state.heistFacilities;
    if (owned.capsuleEntityId === id) owned.capsuleEntityId = null;
    if (owned.schedule?.capsuleEntityId === id) owned.schedule.capsuleEntityId = null;
    for (const record of Object.values(owned.facilities)) {
      if (record.visualEntityId === id) record.visualEntityId = null;
      if (record.headEntityId === id) record.headEntityId = null;
    }
  },

  _onPhysicsImpact(impact) {
    if (!(Number(impact.dp) > 0)) return;
    const a = entityIsAlive(this.state, impact.aId);
    const b = entityIsAlive(this.state, impact.bId);
    if (!a || !b) return;

    const owned = this.state.heistFacilities;
    const schedule = owned.schedule;
    if (!schedule || schedule.status !== 'launched') return;
    const activeCapsule = this._activeScheduleCapsule(schedule);
    if (!activeCapsule) return;
    const capsule = a.id === activeCapsule.id
      ? a
      : (b.id === activeCapsule.id ? b : null);
    if (!capsule) return;
    const head = capsule === a ? b : a;
    const facilityId = head.data?.heistFacilityId;
    if (!facilityId || head.data?.heistFacilityRole !== `${facilityId}_head`) return;
    if (facilityId !== 'lawful_catcher' && facilityId !== 'fence_receiver') return;
    if (!head.collides || head.collisionMask !== Masks.PAYLOAD
      || head.physicsBody?.dynamic !== false) return;

    const kind = facilityId === 'lawful_catcher'
      ? 'lawful_catch_contact'
      : 'fence_contact';
    const tick = Math.max(0, Math.trunc(finite(impact.tick, this.state.tick)));
    const scheduleId = schedule.scheduleId;
    const receiptId = [
      'pq019a',
      scheduleId,
      PQ019_CAPSULE.stableId,
      facilityId,
      tick,
    ].join(':');
    if (owned.candidateIds[receiptId]) return;

    const receipt = Object.freeze({
      receiptId,
      kind,
      source: 'physics:impact',
      scheduleId,
      payloadEntityId: capsule.id,
      payloadStableId: PQ019_CAPSULE.stableId,
      facilityId,
      physicsImpactDp: stableNumber(impact.dp),
      tick,
      pos: Object.freeze({
        x: stableNumber(impact.pos?.x),
        z: stableNumber(impact.pos?.z),
      }),
    });
    owned.candidateIds[receiptId] = true;
    owned.candidateReceipts.push(receipt);
    while (owned.candidateReceipts.length > MAX_CANDIDATE_RECEIPTS) {
      const removed = owned.candidateReceipts.shift();
      if (removed) delete owned.candidateIds[removed.receiptId];
    }
    this.bus.emit('heist:facilityCandidate', receipt);
  },

  _activeScheduleCapsule(schedule) {
    const owned = this.state.heistFacilities;
    const capsuleId = owned.capsuleEntityId;
    if (!schedule || capsuleId == null || schedule.capsuleEntityId !== capsuleId) return null;
    const capsule = entityIsAlive(this.state, capsuleId);
    if (!this._isOwnedCapsule(capsule)) return null;
    if (capsule.data.launchScheduleId !== schedule.scheduleId) return null;
    return capsule;
  },

  _isOwnedCapsule(entity) {
    return !!entity
      && entity.type === 'payload'
      && entity.data?.heistFacilityRole === 'cargo_capsule'
      && entity.data?.heistPayloadStableId === PQ019_CAPSULE.stableId
      && entity.data?.runtimeOwner === 'heistFacilities';
  },

  // ── PQ-019B: receiver prepare / commit / abort ────────────────────────────────────────────────
  //
  // This owner holds the capsule entity, so it is the only thing in the game that can physically
  // consume it. The seam is a two-phase handoff keyed by the arbiter's TERMINAL RECEIPT, which is
  // what stops a payload from being eaten by an outcome that was never decided.
  //
  // The split matters: PREPARE reserves and proves, COMMIT consumes. Nothing is destroyed, moved,
  // or paid for during prepare, so an arbitration that ends up choosing a different winner — or a
  // process that dies mid-handoff — costs nothing and leaves a capsule that is still physically
  // there. "Receiver must commit before terminal arbitration" is one of the packet's stop
  // conditions; this shape makes that ordering the only expressible one.
  //
  // Exactly-once is enforced twice over, deliberately. WITHIN a session the handoff record's status
  // is the gate. ACROSS a reload the arbiter's durable effect journal is, because this system's
  // state is not in the save owner's capture plan and the capsule is a transient entity — both are
  // gone after a load, which is precisely why the durable answer cannot live here.

  /**
   * Reserve the capsule for one terminal receipt. Idempotent per `receiptId`.
   *
   * Refuses to reserve a handoff the physical world did not earn: the facility must have actually
   * recorded a custody candidate for this capsule, so a caller cannot teleport the payload into the
   * fence and claim a delivery that never touched anything.
   */
  prepareReceiverHandoff(request = {}) {
    const receiptId = cleanScheduleId(request.receiptId);
    const facilityId = cleanScheduleId(request.facilityId);
    const payloadStableId = cleanScheduleId(request.payloadStableId);
    if (!receiptId || !RECEIVER_FACILITY_IDS.has(facilityId)
      || payloadStableId !== PQ019_CAPSULE.stableId) {
      return receiverDenial('invalid_handoff', receiptId);
    }

    const owned = this.state.heistFacilities;
    const active = owned.receiverHandoff;
    if (active) {
      if (active.receiptId !== receiptId) return receiverDenial('handoff_in_progress', receiptId);
      if (active.status === 'committed') {
        return { prepared: false, reason: 'already_committed', handoff: active };
      }
      if (active.status === 'prepared') return { prepared: true, handoff: active, resumed: true };
    }

    const schedule = owned.schedule;
    const capsule = this._activeScheduleCapsule(schedule);
    if (!capsule) return receiverDenial('payload_absent', receiptId);

    // Physical proof: this facility must already own a custody candidate for this capsule.
    const contact = owned.candidateReceipts.find((row) => (
      row && row.facilityId === facilityId && row.payloadStableId === payloadStableId
      && row.scheduleId === schedule.scheduleId
    ));
    if (!contact) return receiverDenial('no_custody_contact', receiptId);

    const handoff = {
      receiptId,
      facilityId,
      payloadStableId,
      scheduleId: schedule.scheduleId,
      capsuleEntityId: capsule.id,
      custodyReceiptId: contact.receiptId,
      status: 'prepared',
      preparedAtTick: this.state.tick | 0,
      committedAtTick: null,
    };
    owned.receiverHandoff = handoff;
    // A reservation, not a consumption: the capsule is still alive, still colliding, still where the
    // player left it. Only its own data carries the reservation mark.
    capsule.data.receiverHandoffReceiptId = receiptId;
    this.bus.emit('heist:receiverPrepared', Object.freeze({ ...handoff, source: 'heistFacilities' }));
    return { prepared: true, handoff };
  },

  /**
   * Consume the reserved capsule. Exactly once: a second call reports `already_committed` and
   * removes nothing. This system never pays anyone — settlement is the mission owner's, through the
   * terminal receipt's own effect key.
   */
  commitReceiverHandoff(receiptId) {
    const id = cleanScheduleId(receiptId);
    const owned = this.state.heistFacilities;
    const handoff = owned.receiverHandoff;
    if (!handoff) return { committed: false, reason: 'not_prepared', handoff: null };
    if (id && handoff.receiptId !== id) {
      return { committed: false, reason: 'receipt_mismatch', handoff };
    }
    if (handoff.status === 'committed') {
      return { committed: false, reason: 'already_committed', handoff };
    }
    if (handoff.status !== 'prepared') return { committed: false, reason: 'not_prepared', handoff };

    const capsule = entityIsAlive(this.state, handoff.capsuleEntityId);
    if (!this._isOwnedCapsule(capsule)) {
      // The capsule died or was demoted between prepare and commit. Fail closed: mark the handoff
      // spent so nothing can retry into a fabricated delivery, and report the physical truth.
      handoff.status = 'aborted';
      handoff.abortReason = 'payload_absent';
      return { committed: false, reason: 'payload_absent', handoff };
    }

    handoff.status = 'committed';
    handoff.committedAtTick = this.state.tick | 0;
    this.helpers.removeEntity(capsule.id);
    owned.capsuleEntityId = null;
    if (owned.schedule) {
      owned.schedule.capsuleEntityId = null;
      owned.schedule.status = 'delivered';
    }
    const receipt = Object.freeze({
      ...handoff,
      consumedEntityId: capsule.id,
      effectId: `pq019b:receiverCommit:${handoff.receiptId}`,
      source: 'heistFacilities',
    });
    this.bus.emit('heist:receiverCommitted', receipt);
    return { committed: true, handoff, receipt };
  },

  /**
   * Release the reservation. The capsule is left exactly as it was found — still alive, still
   * physical — because abort must be free. Idempotent.
   */
  abortReceiverHandoff(receiptId, reason = 'aborted') {
    const id = cleanScheduleId(receiptId);
    const owned = this.state.heistFacilities;
    const handoff = owned.receiverHandoff;
    if (!handoff) return { aborted: false, reason: 'not_prepared' };
    if (id && handoff.receiptId !== id) return { aborted: false, reason: 'receipt_mismatch' };
    if (handoff.status === 'committed') return { aborted: false, reason: 'already_committed' };

    const capsule = entityIsAlive(this.state, handoff.capsuleEntityId);
    if (this._isOwnedCapsule(capsule)) delete capsule.data.receiverHandoffReceiptId;
    owned.receiverHandoff = null;
    this.bus.emit('heist:receiverAborted', Object.freeze({
      receiptId: handoff.receiptId,
      facilityId: handoff.facilityId,
      reason: cleanScheduleId(reason) || 'aborted',
      source: 'heistFacilities',
    }));
    return { aborted: true, restoredEntityId: capsule ? capsule.id : null };
  },

  /** The live handoff record, or null. */
  receiverHandoff() {
    return this.state.heistFacilities?.receiverHandoff || null;
  },
};

// ── PQ-019B receiver-handoff support ─────────────────────────────────────────────────────────────

/** Only the two RECEIVER facilities can take custody. The launcher is not a destination. */
export const RECEIVER_FACILITY_IDS = new Set(['lawful_catcher', 'fence_receiver']);

function receiverDenial(reason, receiptId) {
  return { prepared: false, reason, receiptId: receiptId || null, handoff: null };
}

export default heistFacilities;
