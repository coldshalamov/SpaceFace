// PQ-019A: physical facility embodiment and deterministic cargo-capsule schedule.
//
// Ownership boundary:
// - Sole writer for state.heistFacilities and the entities it creates.
// - Emits candidate receipts only. It never settles cargo, credits, reputation,
//   WANTED heat, missions, patrols, or saves.

import { Masks } from '../core/entity.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../core/physicsAuthority.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  HEIST_CAPSULE_RUN_VARIANT_ID,
  heistLaunchVariant,
  isHeistPayloadStableId,
  isKnownHeistLaunchVariantId,
  projectBreakawayForkMouth,
  projectPq019FacilitySocket,
} from '../data/heistFacilities.js';
import {
  captureCandidate,
  createCaptureOutput,
  createCaptureState,
  defineReceiver,
  restoreCaptureState,
  stepCapture,
  validateCaptureProof,
} from '../physicalCargo/breakaway/captureKernel.js';
import {
  dropDressingRow,
  forEachDressingRow,
  getDressingRow,
  insertDressingRow,
} from '../world/dressingTable.js';

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
export function launchCueAwayText(variantId = HEIST_CAPSULE_RUN_VARIANT_ID) {
  const variant = heistLaunchVariant(variantId);
  if (variant.custody === 'capture_fork') {
    return `${variant.payload.name} broke away off the ${PQ019_FACILITIES.lawful_catcher.name} line`;
  }
  return `Cargo capsule away — outbound to ${PQ019_FACILITIES.lawful_catcher.name}`;
}

// ── BREAKAWAY capture fork ───────────────────────────────────────────────────────────────────────
//
// A launch variant whose custody is `capture_fork` never takes custody from a touch. Its receiver is
// sampled once per fixed tick AFTER physics (registry: physics 177 < heistFacilities 222), the pure
// kernel decides the mechanical phase, and the only thing this owner does to the body is queue a
// bounded dissipative impulse through the physics authority for the NEXT step. Refusals the player
// can act on (too fast, too sideways, off-centre) are published only when the load actually crosses
// the mouth plane, so the event stream is bounded by real attempts rather than per-frame.
const CAPTURE_REFUSAL_REASONS = new Set(['too_fast', 'too_sideways', 'outside_mouth', 'wrong_direction']);
// A refused crossing is narrated only within this many rail half-widths of the fork's centre line.
const CAPTURE_REFUSAL_LATERAL_REACH = 2;
const CAPTURE_SETTLED_KIND = 'capture_settled';

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

function liveOwnedThing(state, id) {
  const entity = entityIsAlive(state, id);
  if (entity) return entity;
  const row = getDressingRow(state, id);
  return row && row.alive !== false ? row : null;
}

function stableNumber(value) {
  return Number(finite(value).toFixed(6));
}

function scheduleReceipt(scheduleId, launchAtSimT, variantId = null) {
  return Object.freeze({
    accepted: true,
    receiptId: `pq019a:schedule:${scheduleId}:${stableNumber(launchAtSimT).toFixed(6)}`,
    scheduleId,
    launchAtSimT: stableNumber(launchAtSimT),
    // Conditional, so the historical Capsule Run receipt keeps its exact shape.
    ...(variantId ? { variantId } : {}),
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
    this.bus.on('save:loaded', () => this._resetForRestore());

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
    if (!schedule) return;
    if (schedule.status === 'launched') {
      if (state.world?.currentSectorId !== PQ019_HEIST_SECTOR_ID) return;
      if (heistLaunchVariant(schedule.variantId).custody === 'capture_fork') {
        this._stepCaptureFork(schedule, state);
      }
      return;
    }
    if (schedule.status !== 'scheduled') return;
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
      let visual = liveOwnedThing(this.state, record.visualEntityId)
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
    // A configured launch variant. Absent means the historical Capsule Run; an unknown id is refused
    // rather than silently launching a different payload than the contract promised.
    const requestedVariant = request.variantId == null ? null : cleanScheduleId(request.variantId);
    const variantId = requestedVariant && requestedVariant !== HEIST_CAPSULE_RUN_VARIANT_ID
      ? requestedVariant : null;
    if (!scheduleId || !Number.isFinite(launchAtSimT) || launchAtSimT < 0
      || (request.variantId != null && !isKnownHeistLaunchVariantId(requestedVariant))) {
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

    const receipt = scheduleReceipt(scheduleId, launchAtSimT, variantId);
    owned.schedule = {
      scheduleId,
      launchAtSimT: receipt.launchAtSimT,
      status: 'scheduled',
      receipt,
      capsuleEntityId: null,
      launchedAtTick: null,
      ...(variantId ? { variantId } : {}),
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
    const fromList = (this.state.entityList || []).find((entity) => (
      entity?.alive !== false
      && entity.data?.heistFacilityId === facilityId
      && entity.data?.heistFacilityRole === role
    ));
    if (fromList) return fromList;
    let found = null;
    forEachDressingRow(this.state, (row) => {
      if (found) return;
      if (row.data?.heistFacilityId === facilityId && row.data?.heistFacilityRole === role) {
        found = row;
      }
    });
    return found;
  },

  _global(localPos) {
    return sectorLocalToGlobalForSector(localPos, PQ019_HEIST_SECTOR_ID);
  },

  _spawnFacilityVisual(facility) {
    return insertDressingRow(this.state, {
      type: 'fx',
      pos: this._global(facility.localPos),
      rot: facility.rot,
      radius: Math.max(20, facility.headRadius * 2),
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
        factionId: facility.factionId,
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
      flags: { noInterp: true, invuln: true, missionPinned: true },
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
    this._clearCaptureFork(owned);

    for (const facility of Object.values(PQ019_FACILITIES)) {
      const record = this._facilityRecord(facility.id);
      if (record.visualEntityId != null) {
        if (!dropDressingRow(this.state, record.visualEntityId)) {
          this.helpers.removeEntity(record.visualEntityId);
        }
      }
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
    const variant = heistLaunchVariant(schedule.variantId);
    const payload = variant.payload;
    let nx = dx / length;
    let nz = dz / length;
    // A breakaway variant leaves the launcher OFF the catcher line. The historical capsule keeps its
    // exact unit vector (no atan2 round-trip), so its arc is bit-identical to before variants existed.
    const headingOffset = Number(payload.launchHeadingOffsetRad) || 0;
    if (headingOffset !== 0) {
      const heading = Math.atan2(nz, nx) + headingOffset;
      nx = Math.cos(heading);
      nz = Math.sin(heading);
    }
    const clearance = launcher.radius + payload.radius + 2;
    const capsule = this.helpers.spawnEntity({
      type: 'payload',
      factionId: payload.legalOwnerFactionId,
      ownerId: payload.ownerId,
      team: 2,
      pos: {
        x: launcher.pos.x + nx * clearance,
        z: launcher.pos.z + nz * clearance,
      },
      vel: {
        x: nx * payload.launchSpeed,
        z: nz * payload.launchSpeed,
      },
      rot: Math.atan2(nz, nx),
      radius: payload.radius,
      mass: payload.mass,
      hull: payload.hull,
      hullMax: payload.hull,
      collides: true,
      ttl: Infinity,
      // A durable load is a physical obligation the save owner carries across a reload; the
      // historical capsule stays transient.
      flags: variant.durableLoad ? { missionPinned: true, persistent: true } : { missionPinned: true },
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: true,
        radius: payload.radius,
        mass: payload.mass,
        inertiaY: 0.5 * payload.mass * payload.radius * payload.radius,
        ccd: true,
        material: 'payload',
      },
      data: {
        heistFacilityRole: 'cargo_capsule',
        heistPayloadStableId: payload.stableId,
        authoredPayloadAssetId: payload.authoredPayloadAssetId,
        legalOwnerFactionId: payload.legalOwnerFactionId,
        ownerId: payload.ownerId,
        launchScheduleId: schedule.scheduleId,
        missionPinned: true,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
        ...(variant.id !== HEIST_CAPSULE_RUN_VARIANT_ID ? { heistVariantId: variant.id } : {}),
      },
    });
    // Release spin is written by the owner that created the body, before its first physics step —
    // an initial condition of a new body, not a write to one already in flight.
    const spin = Number(payload.launchSpinRadS) || 0;
    if (spin !== 0) capsule.angVel = spin;

    owned.capsuleEntityId = capsule.id;
    schedule.capsuleEntityId = capsule.id;
    schedule.status = 'launched';
    schedule.launchedAtTick = this.state.tick | 0;
    this.bus.emit('heist:capsuleLaunched', Object.freeze({
      scheduleId: schedule.scheduleId,
      capsuleEntityId: capsule.id,
      payloadStableId: payload.stableId,
      launchedAtTick: schedule.launchedAtTick,
      ...(schedule.variantId ? { variantId: schedule.variantId } : {}),
      source: 'heistFacilities',
    }));
    // Closes the countdown on the same stable voice id, so the last thing the player heard about
    // this schedule is that the capsule is real and where it is headed. The rebind path above
    // returns before this point: recovering a still-live capsule is not a fresh launch.
    this._sayLaunchCue({
      scheduleId: schedule.scheduleId,
      moment: 'away',
      tMinusS: 0,
      text: launchCueAwayText(schedule.variantId),
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
    const current = this.state.entities?.get(id);
    const dressing = getDressingRow(this.state, id);
    const stillOurs = (entity, role) => !!(
      entity
      && entity.alive !== false
      && entity.data?.heistFacilityRole === role
    );
    if (owned.capsuleEntityId === id && !stillOurs(current, 'cargo_capsule')) {
      owned.capsuleEntityId = null;
    }
    if (owned.schedule?.capsuleEntityId === id && !stillOurs(current, 'cargo_capsule')) {
      owned.schedule.capsuleEntityId = null;
    }
    for (const record of Object.values(owned.facilities)) {
      const facility = PQ019_FACILITIES[record.facilityId];
      const visualRole = facility ? `${facility.role}_visual` : null;
      const headRole = facility ? `${facility.role}_head` : null;
      if (record.visualEntityId === id
        && !stillOurs(current, visualRole)
        && !stillOurs(dressing, visualRole)) {
        record.visualEntityId = null;
      }
      if (record.headEntityId === id && !stillOurs(current, headRole)) {
        record.headEntityId = null;
      }
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
    // A capture-fork variant never takes custody from a touch: bumping the catcher head (which is
    // the fork's rear stop) or the fence is a collision, not a delivery.
    if (heistLaunchVariant(schedule.variantId).custody !== 'contact') return;
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
    this._pushCandidateReceipt(receipt);
  },

  /** Journal one custody receipt (bounded) and publish it. The only emitter of facility candidates. */
  _pushCandidateReceipt(receipt) {
    const owned = this.state.heistFacilities;
    if (owned.candidateIds[receipt.receiptId]) return false;
    owned.candidateIds[receipt.receiptId] = true;
    owned.candidateReceipts.push(receipt);
    while (owned.candidateReceipts.length > MAX_CANDIDATE_RECEIPTS) {
      const removed = owned.candidateReceipts.shift();
      if (removed) delete owned.candidateIds[removed.receiptId];
    }
    this.bus.emit('heist:facilityCandidate', receipt);
    return true;
  },

  _activeScheduleCapsule(schedule) {
    const owned = this.state.heistFacilities;
    const capsuleId = owned.capsuleEntityId;
    if (!schedule || capsuleId == null || schedule.capsuleEntityId !== capsuleId) return null;
    const capsule = entityIsAlive(this.state, capsuleId);
    if (!this._isOwnedCapsule(capsule)) return null;
    if (capsule.data.launchScheduleId !== schedule.scheduleId) return null;
    if (capsule.data.heistPayloadStableId !== heistLaunchVariant(schedule.variantId).payload.stableId) {
      return null;
    }
    return capsule;
  },

  _isOwnedCapsule(entity) {
    return !!entity
      && entity.type === 'payload'
      && entity.data?.heistFacilityRole === 'cargo_capsule'
      && isHeistPayloadStableId(entity.data?.heistPayloadStableId)
      && entity.data?.runtimeOwner === 'heistFacilities';
  },

  // ── BREAKAWAY capture fork ─────────────────────────────────────────────────────────────────────

  /** World-space receiver for a fork variant. Authored geometry is immutable, so it is built once. */
  _forkReceiver(variant) {
    const fork = variant.fork;
    if (this._forkReceiverCache && this._forkReceiverCache.id === fork.id) return this._forkReceiverCache;
    const mouth = projectBreakawayForkMouth(fork);
    const world = this._global({ x: mouth.x, z: mouth.z });
    this._forkReceiverCache = defineReceiver({
      ...fork, id: fork.id, x: world.x, z: world.z, nx: mouth.nx, nz: mouth.nz,
    });
    return this._forkReceiverCache;
  },

  /** Post-physics sample of the live load into one reused scratch object. */
  _forkSample(load, state) {
    const s = this._forkSampleScratch || (this._forkSampleScratch = {
      payloadId: '', x: 0, z: 0, prevX: 0, prevZ: 0, vx: 0, vz: 0, omegaY: 0,
      radius: 1, mass: 1, inertiaY: 1, tick: 0, alive: true,
    });
    const body = load.physicsBody || {};
    const mass = body.mass > 0 ? body.mass : load.mass;
    const radius = load.radius;
    const tick = state.tick | 0;
    const prev = state.heistFacilities.capturePrev;
    const contiguous = !!prev && prev.entityId === load.id && prev.tick === tick - 1;
    s.payloadId = load.data.heistPayloadStableId;
    s.x = load.pos.x;
    s.z = load.pos.z;
    s.prevX = contiguous ? prev.x : s.x;
    s.prevZ = contiguous ? prev.z : s.z;
    s.vx = load.vel.x;
    s.vz = load.vel.z;
    // The SG-02 owner's physical Y angular velocity — never a display bank or a heading rate.
    s.omegaY = Number.isFinite(load.angVel) ? load.angVel : 0;
    s.radius = radius;
    s.mass = mass;
    s.inertiaY = body.inertiaY > 0 ? body.inertiaY : 0.5 * mass * radius * radius;
    s.tick = tick;
    s.alive = load.alive !== false;
    return s;
  },

  /** One mechanical tick of the fork for the active load. Queues impulses; never moves the body. */
  _stepCaptureFork(schedule, state) {
    const owned = state.heistFacilities;
    const load = this._activeScheduleCapsule(schedule);
    if (!load) {
      owned.capturePrev = null;
      return null;
    }
    const variant = heistLaunchVariant(schedule.variantId);
    const receiver = this._forkReceiver(variant);
    let capture = owned.capture;
    if (!capture || capture.payloadId !== variant.payload.stableId || capture.receiverId !== receiver.id) {
      capture = owned.capture = createCaptureState(variant.payload.stableId, receiver.id);
    }
    // The mechanical state rides on the load's own data, so the save owner persists it with the body.
    if (variant.durableLoad && load.data.breakawayCapture !== capture) load.data.breakawayCapture = capture;
    const tick = state.tick | 0;
    // At most one mechanical sample per fixed tick: dwell must never double-count.
    if (tick <= capture.lastTick) return null;
    const sample = this._forkSample(load, state);
    const out = this._forkOut || (this._forkOut = createCaptureOutput());
    const before = capture.phase;
    stepCapture(capture, sample, receiver, { authorized: true, open: true }, out);
    const prev = owned.capturePrev || (owned.capturePrev = { entityId: null, x: 0, z: 0, tick: -1 });
    prev.entityId = load.id;
    prev.x = sample.x;
    prev.z = sample.z;
    prev.tick = tick;

    if (out.impulse.x !== 0 || out.impulse.z !== 0 || out.torqueY !== 0) {
      const evidence = this._forkEvidence || (this._forkEvidence = {
        provenance: 'breakaway:captureFork', tick: 0, kind: 'receiver_brake',
      });
      evidence.tick = tick;
      if (out.impulse.x !== 0 || out.impulse.z !== 0) {
        queuePhysicsImpulse(load, { x: out.impulse.x, y: 0, z: out.impulse.z }, evidence);
      }
      if (out.torqueY !== 0) queuePhysicsTorqueImpulse(load, { x: 0, y: out.torqueY, z: 0 }, evidence);
    }

    // The mouth PLANE is infinite; the mouth is not. A load crossing that plane a kilometre wide of
    // the rails (the breakaway launch arc does exactly that) made no attempt worth narrating.
    const refused = before === 'outside' && out.phase === 'outside' && CAPTURE_REFUSAL_REASONS.has(out.reason)
      && Math.abs(out.lateral) <= receiver.halfWidth * CAPTURE_REFUSAL_LATERAL_REACH;
    if (out.event || refused) {
      this.bus.emit('heist:captureFork', Object.freeze({
        scheduleId: schedule.scheduleId,
        payloadStableId: variant.payload.stableId,
        facilityId: variant.fork.facilityId,
        receiverId: receiver.id,
        event: out.event || 'capture_refused',
        phase: out.phase,
        reason: out.reason,
        speed: stableNumber(Math.hypot(sample.vx, sample.vz)),
        tick,
        source: 'heistFacilities',
      }));
    }

    if (out.event === 'capture_ready') {
      this._recordSettledCapture(schedule, load, variant, receiver, capture, sample);
    }
    return out;
  },

  /** Journal the settled-capture custody receipt for the current sample, if proof holds right now. */
  _recordSettledCapture(schedule, load, variant, receiver, capture, sample) {
    const candidate = captureCandidate(capture, sample, receiver, {
      authorized: true, scheduleId: schedule.scheduleId,
    });
    if (!candidate.ok) return false;
    return this._pushCandidateReceipt(Object.freeze({
      receiptId: candidate.receipt.receiptId,
      kind: CAPTURE_SETTLED_KIND,
      source: candidate.receipt.source,
      scheduleId: schedule.scheduleId,
      payloadEntityId: load.id,
      payloadStableId: variant.payload.stableId,
      facilityId: variant.fork.facilityId,
      receiverId: receiver.id,
      entryTick: candidate.receipt.entryTick,
      entryCount: candidate.receipt.entryCount,
      tick: sample.tick,
      pos: Object.freeze({ x: stableNumber(sample.x), z: stableNumber(sample.z) }),
    }));
  },

  /**
   * FRESH custody for a fork variant, evaluated now. Called at prepare AND at commit: a load that
   * settled once and was then dragged, shot or knocked out of the bay has no custody left to pass.
   */
  _forkCustodyProof(schedule, load) {
    const variant = heistLaunchVariant(schedule?.variantId);
    if (variant.custody !== 'capture_fork') return { ok: true, reason: 'contact_custody' };
    const capture = this.state.heistFacilities.capture;
    if (!capture || !load) return { ok: false, reason: 'not_ready_or_stale' };
    return validateCaptureProof(capture, this._forkSample(load, this.state), this._forkReceiver(variant), true);
  },

  _clearCaptureFork(owned) {
    if (owned.capture !== undefined) delete owned.capture;
    if (owned.capturePrev !== undefined) delete owned.capturePrev;
  },

  // ── Save boundary ─────────────────────────────────────────────────────────────────────────────

  /**
   * `save:loaded`. This owner's schedule, custody receipts, handoff and fork state are NOT in the
   * save capture plan, so after a load they describe the session BEFORE it. Kept, a stale schedule
   * would deny the restored contract's own launch request (`active_schedule`) and a stale handoff
   * would refuse its prepare. The re-materialized facility records are current and stay. A durable
   * load restored by the save owner waits, unowned, until its mission re-adopts it.
   */
  _resetForRestore() {
    const owned = this.state?.heistFacilities;
    if (!owned) return;
    owned.schedule = null;
    owned.capsuleEntityId = null;
    owned.candidateReceipts = [];
    owned.candidateIds = {};
    if (owned.receiverHandoff !== undefined) delete owned.receiverHandoff;
    this._clearCaptureFork(owned);
  },

  /**
   * Re-adopt a DURABLE load that the save owner restored (its `flags.persistent` body) for the
   * mission whose saved record names this schedule.
   *
   * Rebuilds the one launched schedule around the SAME body — no respawn, no new launch, no pose
   * write — restores the fork's mechanical state from the body's own data, and re-steps the fork for
   * the current tick so custody can be proven fresh immediately. A load that is still settled in the
   * fork re-derives its custody receipt, because the receipt journal belonged to the old session.
   */
  adoptRestoredLoad(request = {}) {
    const scheduleId = cleanScheduleId(request.scheduleId);
    const variant = heistLaunchVariant(request.variantId);
    const owned = this.state.heistFacilities;
    if (!scheduleId || !variant.durableLoad) return { adopted: false, reason: 'not_durable' };
    if (owned.schedule && owned.schedule.scheduleId !== scheduleId) {
      return { adopted: false, reason: 'active_schedule', activeScheduleId: owned.schedule.scheduleId };
    }
    const load = this._findRestoredLoad(scheduleId, variant);
    if (!load) return { adopted: false, reason: 'payload_absent' };
    if (owned.schedule && owned.schedule.capsuleEntityId === load.id) {
      return { adopted: true, entityId: load.id, resumed: true };
    }

    const receipt = scheduleReceipt(scheduleId, Number(this.state.simTime) || 0, variant.id);
    owned.schedule = {
      scheduleId,
      launchAtSimT: receipt.launchAtSimT,
      status: 'launched',
      receipt,
      capsuleEntityId: load.id,
      launchedAtTick: this.state.tick | 0,
      variantId: variant.id,
    };
    owned.capsuleEntityId = load.id;

    if (variant.custody === 'capture_fork') {
      const receiver = this._forkReceiver(variant);
      let capture = null;
      try {
        capture = load.data.breakawayCapture ? restoreCaptureState(load.data.breakawayCapture) : null;
      } catch {
        capture = null; // a corrupt mechanical record restarts the approach; custody is never assumed
      }
      if (!capture || capture.payloadId !== variant.payload.stableId || capture.receiverId !== receiver.id) {
        capture = createCaptureState(variant.payload.stableId, receiver.id);
      }
      owned.capture = capture;
      load.data.breakawayCapture = capture;
      owned.capturePrev = null;
      if (this.state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID) {
        this._stepCaptureFork(owned.schedule, this.state);
        if (owned.capture.phase === 'ready' && this._forkSampleScratch) {
          this._recordSettledCapture(owned.schedule, load, variant, receiver, owned.capture, this._forkSampleScratch);
        }
      }
    }
    return { adopted: true, entityId: load.id };
  },

  /** The restored body for a schedule, matched by stable data — never by a recycled entity id. */
  _findRestoredLoad(scheduleId, variant) {
    for (const entity of this.state.entityList || []) {
      if (!entity || entity.alive === false || !this._isOwnedCapsule(entity)) continue;
      if (entity.data.launchScheduleId !== scheduleId) continue;
      if (entity.data.heistPayloadStableId !== variant.payload.stableId) continue;
      return entity;
    }
    return null;
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
      || !isHeistPayloadStableId(payloadStableId)) {
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
    const variant = heistLaunchVariant(schedule.variantId);
    if (payloadStableId !== variant.payload.stableId) return receiverDenial('invalid_handoff', receiptId);

    // Physical proof: this facility must already own a custody candidate for this capsule. A fork
    // variant accepts only its own settled-capture receipt, never a touch.
    const forkCustody = variant.custody === 'capture_fork';
    const contact = owned.candidateReceipts.find((row) => (
      row && row.facilityId === facilityId && row.payloadStableId === payloadStableId
      && row.scheduleId === schedule.scheduleId
      && (!forkCustody || row.kind === CAPTURE_SETTLED_KIND)
    ));
    if (!contact) return receiverDenial('no_custody_contact', receiptId);
    // ...and a fork's custody must still be physically true NOW, not merely have been true once.
    if (forkCustody) {
      const proof = this._forkCustodyProof(schedule, capsule);
      if (!proof.ok) return receiverDenial(proof.reason, receiptId);
    }

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
    // Fresh custody is re-proven immediately before consumption: listeners of `receiverPrepared`
    // run synchronously and may have moved the load since prepare checked it.
    const proof = this._forkCustodyProof(owned.schedule, capsule);
    if (!proof.ok) {
      handoff.status = 'aborted';
      handoff.abortReason = proof.reason;
      return { committed: false, reason: proof.reason, handoff };
    }
    // A fork delivery records the load's condition at the instant custody passes, before the body
    // is consumed — the mission's quality quote reads this, never a later guess.
    if (heistLaunchVariant(owned.schedule?.variantId).custody === 'capture_fork') {
      const hullMax = Number(capsule.hullMax);
      handoff.condition01 = hullMax > 0
        ? Math.max(0, Math.min(1, Number(capsule.hull) / hullMax))
        : 1;
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

  /**
   * PQ-019C — release a SETTLED schedule so the launcher can take the next contract.
   *
   * Why this has to exist: `requestLaunchSchedule` denies any request whose `scheduleId` differs
   * from the live one, and nothing ever cleared `owned.schedule`. `_dematerializeSector` only nulls
   * the capsule id and `commitReceiverHandoff` only marks the schedule `delivered`, both of which
   * deliberately PRESERVE the schedule so sector re-entry can resume a run in progress. The result
   * was that the first capsule run permanently owned the launcher: every later mission carries a new
   * stable `scheduleId`, so a second accepted contract — and every reduced-stake recovery, which is
   * a new mission by construction — was refused `active_schedule` and died before it launched.
   * `owned.receiverHandoff` had the same shape of problem: a spent handoff refused the next run's
   * prepare with `handoff_in_progress`.
   *
   * This is the ONLY thing that clears either, it is called only after the mission owner has a
   * committed terminal receipt, and it is idempotent. It deliberately does NOT decide anything: a
   * capsule still physically present at release belongs to a run that is already over (an expired or
   * abandoned one), so it is removed rather than left orphaned in the sector with no owner.
   */
  releaseSchedule(scheduleId) {
    const id = cleanScheduleId(scheduleId);
    const owned = this.state.heistFacilities;
    const schedule = owned?.schedule;
    if (!schedule) return { released: false, reason: 'no_schedule' };
    if (id && schedule.scheduleId !== id) {
      return { released: false, reason: 'schedule_mismatch', activeScheduleId: schedule.scheduleId };
    }
    const capsule = this._activeScheduleCapsule(schedule);
    if (capsule) this.helpers.removeEntity(capsule.id);
    owned.capsuleEntityId = null;
    owned.schedule = null;
    owned.receiverHandoff = null;
    this._clearCaptureFork(owned);
    this.bus.emit('heist:launchScheduleReleased', Object.freeze({
      scheduleId: schedule.scheduleId,
      removedCapsuleEntityId: capsule ? capsule.id : null,
      source: 'heistFacilities',
    }));
    return { released: true, scheduleId: schedule.scheduleId };
  },
};

// ── PQ-019B receiver-handoff support ─────────────────────────────────────────────────────────────

/** Only the two RECEIVER facilities can take custody. The launcher is not a destination. */
export const RECEIVER_FACILITY_IDS = new Set(['lawful_catcher', 'fence_receiver']);

// PQ-152.01 reuses the three embodied Tethys facilities as places: the launcher approach
// for the door jam, the lawful catcher as the impound cradle, the fence as the loud vault.
export const SET_PIECE_FACILITY_BY_ROLE = Object.freeze({
  jam_hulk: 'heist_launcher',
  cradle_lock: 'lawful_catcher',
  vault_hatch: 'fence_receiver',
});

export function setPieceFacilityWorldPos(role) {
  const facilityId = SET_PIECE_FACILITY_BY_ROLE[role];
  const facility = facilityId ? PQ019_FACILITIES[facilityId] : null;
  if (!facility) return null;
  try {
    return sectorLocalToGlobalForSector(
      projectPq019FacilitySocket(facility),
      PQ019_HEIST_SECTOR_ID,
    );
  } catch {
    return sectorLocalToGlobalForSector(facility.localPos, PQ019_HEIST_SECTOR_ID);
  }
}

function receiverDenial(reason, receiptId) {
  return { prepared: false, reason, receiptId: receiptId || null, handoff: null };
}

export default heistFacilities;
