// PQ-019A: physical facility embodiment and deterministic cargo-capsule schedule.
//
// Ownership boundary:
// - Sole writer for state.heistFacilities and the entities it creates.
// - Emits candidate receipts only. It never settles cargo, credits, reputation,
//   WANTED heat, missions, patrols, or saves.

import { Masks } from '../core/entity.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../core/physicsAuthority.js';
import { wrapAngle } from '../core/rng.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  BREAKAWAY_BERTH,
  BREAKAWAY_CAPTURE_FORK,
  BREAKAWAY_CARRIER,
  BREAKAWAY_FORK_COLLIDERS,
  BREAKAWAY_FORK_VISUAL,
  COUNTERWEIGHT_SCENE,
  HOT_RETURN_MONITORS,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  PQ019_OBSERVE,
  PQ019_ROUTINE,
  PQ019_SHIPMENT_UNIT,
  HEIST_CAPSULE_RUN_VARIANT_ID,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  heistLaunchVariant,
  isHeistPayloadStableId,
  isKnownHeistLaunchVariantId,
  projectBreakawayForkMouth,
  projectPq019FacilitySocket,
} from '../data/heistFacilities.js';
import { makeShipEntitySpec } from './ships.js';
import { makeEnemySpawnSpec } from './combat.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
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
import { indexedTypeScan } from '../world/livingWorldViews.js';

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
const CAPTURE_REFUSAL_TEXT = Object.freeze({
  too_fast: 'Too fast for the catcher — bleed speed before the mouth',
  too_sideways: 'Too much sideways — line up with the rails',
  outside_mouth: 'Missed the catcher mouth',
  wrong_direction: 'Wrong way into the catcher',
});
const CAPTURE_REFUSAL_REPEAT_TICKS = 90;
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
    // PQ-195.04: the berth worker hull this owner materializes with the sector. Transient by
    // design — the ACTIVATED/consequence state lives in the serialized npcJobs record, never here.
    berth: { workerEntityId: null },
    // PQ-195.08: the Third Shift carrier + its transport clamp. Transient ids only — the carrier
    // is a live ship hull, never serialized; on save/load the run resumes with the load already
    // free (the fiction: the shipment went on without it).
    carrierEntityId: null,
    clampAttachmentId: null,
    carrierPendingClamp: false,
    carrierClampAttempts: 0,
    carrierReleased: false,
    carrierHeading: null,
    carrierLaunchPos: null,
    carrierReleaseAnchor: null,
    carrierDepartAnchor: null,
    // SF-140: the routine lawful transfer. Runs whenever no contract owns the launcher schedule.
    // `nextLaunchAtSimT` and `seq` are durable — the cadence survives sector hops and reloads;
    // the live capsule/escort ids never do.
    routine: {
      seq: 0,
      nextLaunchAtSimT: null,
      capsuleEntityId: null,
      escortEntityId: null,
      escortsRemaining: 0,
      theftReportId: null,
    },
    // SF-140: durable learned facts — { factId: { atTick, method, detail } }. Learned once,
    // kept across reloads: observation is knowledge, and knowledge is durable.
    observed: {},
    // SF-140: cumulative tailing progress toward the crew-route observation.
    followHoldTicks: 0,
    // SF-143: the counterweight yard. Always physical; `sceneId` is the armed contract.
    counterweight: makeCounterweightState(),
    // SF-147: monitor posts — edge-trigger bookkeeping keyed `${monitorId}:${entityId}`.
    monitorContacts: {},
  };
}

/** The counterweight scene's owned record. Bodies are spawned lazily by materialize. */
function makeCounterweightState() {
  return {
    sceneId: null,          // armed contract; null = scenery only
    armedTick: null,
    gate: 'closed',         // closed | opening | open | closing
    gateHoldTicks: 0,
    gateReleaseTicks: 0,
    doorPose01: 0,
    doorEntityId: null,
    ballastEntityId: null,
    crewEntityId: null,
    crewClampId: null,
    crewPhase: 'parked',    // parked | fetch | carry | hold | deliver | lost
    crewTargetId: null,
    crates: {},             // stableId -> { entityId, state, restTicks, deliveredTick }
    legsDone: 0,
    pressureSpawned: false,
    // SF-147-style suspension: body snapshots taken at sector exit for re-entry.
    suspendedBodies: null,
  };
}

/**
 * Stable per-seed worldRecordId of Berth Three's worker hull.
 *
 * Exported so npcJobsRuntime derives the exact same join key for the berth job entry. Both callers
 * must use this helper, never their own copy of the formula.
 */
export function berthWorkerRecordId(seed) {
  return stableRecordId(
    (Number(seed) >>> 0) || 1,
    PQ019_HEIST_SECTOR_ID,
    RECORD_KIND.NPC,
    BREAKAWAY_BERTH.worker.worldRecordSlotId,
  );
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
    this.registry = ctx.registry;
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

    this.bus.on('sector:enter', (p = {}) => {
      const { sectorId, enterEpoch } = p;
      // A tail-drained emit carries the epoch of the enter that minted it: a replayed
      // payload whose enterEpoch no longer matches the world's serial is stale — do not
      // materialize its facilities under the live world's id. Synthetic payloads carry
      // no epoch and always run.
      if (enterEpoch != null && this.state && this.state.world
          && this.state.world.enterSerial != null
          && enterEpoch !== this.state.world.enterSerial) return;
      // Live GPU + flight + hard enter: defer into the cook's FIFO — the census drains
      // the same materializeForSector call under its slice clock in listener order.
      if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
      this.materializeForSector(sectorId);
    });
    // Census arm: facility materialization lands inside the sector cook deterministically.
    this._cookProvider = (sector) => this._materializeForSectorSteps((sector && sector.id)
      || (this.state && this.state.world && this.state.world.currentSectorId));
    (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
      .push(this._cookProvider);
    this.bus.on('sector:exit', ({ sectorId } = {}) => this._dematerializeSector(sectorId));
    this.bus.on('entity:destroyed', ({ id } = {}) => this._onEntityDestroyed(id));
    this.bus.on('physics:impact', (impact = {}) => this._onPhysicsImpact(impact));
    this.bus.on('heist:requestLaunchSchedule', (request = {}) => {
      this.requestLaunchSchedule(request);
    });
    // SF-140: a scan pulse that covers a heist object resolves it as knowledge. The scanner
    // emits a sector-wide `scan:completed` (targetId null); WHICH object was learned is read
    // off player proximity at pulse time — the pulse physically covered what it covered.
    this.bus.on('scan:completed', (p = {}) => this._onScanCompleted(p));
    // SF-140: taking a routine capsule is a real theft. The law owner judges witnesses and
    // jurisdiction exactly as it does for a mission's payload — a stolen lawful transfer
    // raises WANTED and pays nobody.
    this.bus.on('tether:latched', (p = {}) => this._onRoutineTake(p));
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
    if (!owned) return;
    const inSector = state.world?.currentSectorId === PQ019_HEIST_SECTOR_ID;
    // The whole scene is sector-local machinery: outside Tethys nothing steps, and nothing
    // pretends to. Sector exit dematerializes the transients; the durable records wait.
    if (!inSector) return;

    // SF-140/143/147 — the standing machinery always steps while the sector is live, whether
    // or not any contract is armed: routine transfers fly, the gate answers its cradle, the
    // monitors sweep the lane, and watching/following accrues knowledge.
    this._stepRoutine(state, dt);
    this._stepCounterweightScene(state);
    this._stepMonitors(state);
    this._stepFollowObserve(state);

    const schedule = owned.schedule;
    if (!schedule) return;
    if (schedule.status === 'launched') {
      if (heistLaunchVariant(schedule.variantId).custody === 'capture_fork') {
        this._stepCarrier(state);
        this._stepCaptureFork(schedule, state);
      }
      return;
    }
    if (schedule.status !== 'scheduled') return;
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
    if (tMinus !== null) {
      return this._sayLaunchCue({
        scheduleId: schedule.scheduleId,
        moment: `t_minus_${tMinus}`,
        tMinusS: tMinus,
        text: launchCueTextForTMinus(tMinus),
      });
    }
    // SF-140: a LEARNED schedule speaks earlier than the authored countdown — the 60s moment an
    // unobserved launcher never earns. Same pure crossing rule, same one-voice seam.
    if (state.heistFacilities?.observed?.launcher_schedule) {
      const at = schedule.launchAtSimT - PQ019_OBSERVE.earlyWarningS;
      if (at > simT - step && at <= simT) {
        return this._sayLaunchCue({
          scheduleId: schedule.scheduleId,
          moment: `t_minus_${PQ019_OBSERVE.earlyWarningS}`,
          tMinusS: PQ019_OBSERVE.earlyWarningS,
          text: `${PQ019_FACILITIES.heist_launcher.name}: cargo launch in ${PQ019_OBSERVE.earlyWarningS}s — you know this cadence`,
        });
      }
    }
    return null;
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
    // Sync lane (emit listener, heist mission paths): drain the chunked steps
    // inline — the census drive holds the same generator across its slices.
    const steps = this._materializeForSectorSteps(sectorId);
    for (;;) { const s = steps.next(); if (s.done) return s.value; }
  },

  *_materializeForSectorSteps(sectorId) {
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return 0;
    let created = 0;
    for (const facility of Object.values(PQ019_FACILITIES)) {
      yield;
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

      // PQ-195.00: the capture fork machine is a static dressing visual at the mouth the
      // capture kernel samples — the same placement math, so the seen machine and the
      // physical capture volume cannot disagree. The visual never collides; PQ-195.01 adds
      // the real rails and rear arrestor below, and the custody head stays the rear stop.
      if (facility.id === BREAKAWAY_CAPTURE_FORK.facilityId) {
        let fork = liveOwnedThing(this.state, record.forkVisualEntityId)
          || this._findOwnedEntity(facility.id, `${facility.role}_fork`);
        if (!fork) {
          fork = this._spawnForkVisual(facility);
          created++;
        }
        record.forkVisualEntityId = fork.id;
        created += this._materializeForkColliders(facility, record);
      }
    }
    // PQ-195.04: Berth Three's stalled industrial worker. It is an ordinary hull that lives beside
    // the catcher whether or not the berth is activated (a job-bound one is re-linked by
    // npcJobsRuntime on the same entry), so its presence is materialization, not consequence state.
    yield;
    created += this._materializeBerthWorker();
    // SF-143: the counterweight yard — cradle, door, ballast, staged crates, tug. Always
    // materialized: the machinery is real whether or not a watch is armed on it.
    created += this._materializeCounterweight();
    // SF-147: the monitored posts on the escape lane — permanent lawful machinery.
    created += this._materializeMonitors();
    return created;
  },

  /**
   * Spawn (or adopt) Berth Three's worker hull.
   *
   * The hull carries a stable `worldRecordId` — the join key npcJobsRuntime binds a berth job to —
   * plus `persistenceOwner: 'heistFacilities'`, which tells the world-record owner this hull's
   * lifecycle belongs to us. So it is never captured into world.records and never respawned twice;
   * it is re-created here on every sector materialize, exactly like the facility heads.
   */
  _materializeBerthWorker() {
    const worker = BREAKAWAY_BERTH.worker;
    const worldRecordId = berthWorkerRecordId(this.state.meta && this.state.meta.seed);
    let entity = this._findBerthWorker(worldRecordId);
    let created = 0;
    if (!entity) {
      // An extant live durable record means another owner already holds this hull; never spawn a
      // second copy over it.
      const record = this.state.world?.records?.byId?.[worldRecordId];
      if (record && record.alive !== false && record.outcome !== 'destroyed') return 0;
      const spec = makeShipEntitySpec(worker.shipId, {
        team: worker.team,
        factionId: worker.factionId,
        pos: this._global(BREAKAWAY_BERTH.workerLocalPos),
        ai: { archetype: 'passive', passive: true, spawnContext: 'berth_worker' },
      });
      spec.homeSectorId = PQ019_HEIST_SECTOR_ID;
      spec.data.worldRecordId = worldRecordId;
      spec.data.persistenceOwner = 'heistFacilities';
      spec.data.berthWorkerId = BREAKAWAY_BERTH.id;
      spec.data.identityKey = worker.worldRecordSlotId;
      spec.data.sectorId = PQ019_HEIST_SECTOR_ID;
      spec.data.homeSectorId = PQ019_HEIST_SECTOR_ID;
      spec.data.berthName = BREAKAWAY_BERTH.name;
      spec.data.trafficLabel = worker.label;
      entity = this.helpers.spawnEntity(spec);
      if (!entity) return 0;
      created = 1;
    }
    this.state.heistFacilities.berth.workerEntityId = entity.id;
    return created;
  },

  /** The live berth worker hull, matched by its stable record id (never a recycled numeric id). */
  _findBerthWorker(worldRecordId) {
    const index = this.state && this.state.entityIndex;
    if (index && index.__spacefaceEntityIndexV1 === true && index.ready === true
      && index.byWorldRecordId instanceof Map && index.byWorldRecordIdCount instanceof Map
      && index.byWorldRecordIdCount.get(worldRecordId) === 1) {
      const entity = index.byWorldRecordId.get(worldRecordId);
      return (entity && entity.alive !== false && entity.data
        && entity.data.berthWorkerId === BREAKAWAY_BERTH.id) ? entity : null;
    }
    const list = (this.state && this.state.entityList) || [];
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (entity?.alive !== false && entity.data?.worldRecordId === worldRecordId
        && entity.data?.berthWorkerId === BREAKAWAY_BERTH.id) {
        return entity;
      }
    }
    return null;
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
    if (!owned.berth || typeof owned.berth !== 'object') owned.berth = { workerEntityId: null };
    if (owned.berth.workerEntityId == null || !Number.isInteger(Number(owned.berth.workerEntityId))) {
      owned.berth.workerEntityId = null;
    }
    if (owned.capsuleEntityId != null
      && !Number.isInteger(Number(owned.capsuleEntityId))) {
      owned.capsuleEntityId = null;
    }
    // PQ-195.08: a saved game never carries a live carrier — entity ids are transient, so a stale
    // restore drops every carrier/clamp reference. The load it carried persists independently.
    if (owned.carrierEntityId != null
      && !Number.isInteger(Number(owned.carrierEntityId))) {
      owned.carrierEntityId = null;
    }
    if (owned.clampAttachmentId != null
      && typeof owned.clampAttachmentId !== 'string') {
      owned.clampAttachmentId = null;
    }
    // SF-140/143/147 rows: state grown by this packet. Missing fields in a stale restore are
    // rebuilt, never invented.
    if (!owned.routine || typeof owned.routine !== 'object') {
      owned.routine = {
        seq: 0, nextLaunchAtSimT: null, capsuleEntityId: null,
        escortEntityId: null, escortsRemaining: 0, theftReportId: null,
      };
    }
    if (!owned.observed || typeof owned.observed !== 'object') owned.observed = {};
    if (!Number.isInteger(Number(owned.followHoldTicks))) owned.followHoldTicks = 0;
    if (!owned.counterweight || typeof owned.counterweight !== 'object') {
      owned.counterweight = makeCounterweightState();
    } else {
      const cw = owned.counterweight;
      if (!cw.crates || typeof cw.crates !== 'object') cw.crates = {};
      if (cw.gate !== 'open' && cw.gate !== 'opening' && cw.gate !== 'closing') cw.gate = 'closed';
    }
    if (!owned.monitorContacts || typeof owned.monitorContacts !== 'object') owned.monitorContacts = {};
    if (!owned.monitorPosts || typeof owned.monitorPosts !== 'object') owned.monitorPosts = {};
  },

  _facilityRecord(facilityId) {
    const records = this.state.heistFacilities.facilities;
    if (!records[facilityId]) {
      records[facilityId] = {
        facilityId,
        visualEntityId: null,
        headEntityId: null,
        // PQ-195.00: restored pre-fork records lack this key; materialize treats a
        // missing id as "not yet spawned" and fills it in, so no migration is needed.
        forkVisualEntityId: null,
        // PQ-195.01: the fork's static steel. Same "missing id means not yet spawned" rule.
        forkRailAEntityId: null,
        forkRailBEntityId: null,
        forkArrestorEntityId: null,
      };
    }
    return records[facilityId];
  },

  _findOwnedEntity(facilityId, role) {
    const index = this.state && this.state.entityIndex;
    const lists = index && index.__spacefaceEntityIndexV1 && index.ready === true
      ? [index.collidables, index.payloads]
      : [this.state.entityList];
    for (let l = 0; l < lists.length; l++) {
      const list = lists[l];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (entity?.alive !== false
          && entity.data?.heistFacilityId === facilityId
          && entity.data?.heistFacilityRole === role) {
          return entity;
        }
      }
    }
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

  _spawnForkVisual(facility) {
    const mouth = projectBreakawayForkMouth();
    // Mouth-centred extent of the authored machine: the farthest modelled corner is
    // ~97 WU from the mouth plane, so a 100 WU envelope keeps the whole machine drawn.
    const envelope = 100;
    return insertDressingRow(this.state, {
      type: 'fx',
      pos: this._global({ x: mouth.x, z: mouth.z }),
      rot: Math.atan2(mouth.nz, mouth.nx),
      radius: envelope,
      homeSectorId: facility.sectorId,
      data: {
        heistFacilityId: facility.id,
        heistFacilityRole: `${facility.role}_fork`,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        placeId: BREAKAWAY_FORK_VISUAL.placeId,
        placeScale: BREAKAWAY_FORK_VISUAL.placeScale,
        name: 'Breakaway Capture Fork',
        worldDressing: true,
        placeRadius: envelope,
        factionId: facility.factionId,
      },
    });
  },

  /**
   * PQ-195.01: the fork's static steel — two rails and a rear arrestor. Spawned through the ordinary
   * entity path and recorded on the facility record exactly like the custody head, so sector hops and
   * re-materializes reuse the same bodies instead of orphaning or duplicating them. Position and yaw
   * come from projectBreakawayForkMouth() — the same projection the kernel receiver and the visual use
   * — so colliders, capture volume and machine cannot disagree.
   */
  _materializeForkColliders(facility, record) {
    const mouth = projectBreakawayForkMouth(BREAKAWAY_CAPTURE_FORK);
    // Lateral axis is the inward normal rotated a quarter turn. A capsule built through the craft
    // recipe runs its length along local +X, whose world direction for a body yaw of θ is
    // (cosθ, sinθ) — the same convention the visual uses, so the rail yaw is atan2(nz, nx).
    const lx = -mouth.nz;
    const lz = mouth.nx;
    const railRot = Math.atan2(mouth.nz, mouth.nx);
    const arrestorRot = Math.atan2(lz, lx);
    const spec = BREAKAWAY_FORK_COLLIDERS;
    const at = (depth, lateral) => this._global({
      x: mouth.x + mouth.nx * depth + lx * lateral,
      z: mouth.z + mouth.nz * depth + lz * lateral,
    });
    const rows = [
      [`${facility.role}_rail_a`, 'forkRailAEntityId',
        at(spec.railAxialCenter, spec.railLateralOffset), railRot,
        spec.railLength, spec.railThickness / 2],
      [`${facility.role}_rail_b`, 'forkRailBEntityId',
        at(spec.railAxialCenter, -spec.railLateralOffset), railRot,
        spec.railLength, spec.railThickness / 2],
      [`${facility.role}_arrestor`, 'forkArrestorEntityId',
        at(spec.arrestorAxialCenter, 0), arrestorRot,
        spec.arrestorLength, spec.arrestorThickness / 2],
    ];
    let created = 0;
    for (const [role, idKey, pos, rot, length, halfWidth] of rows) {
      let collider = entityIsAlive(this.state, record[idKey])
        || this._findOwnedEntity(facility.id, role);
      if (!collider) {
        collider = this._spawnForkCollider(facility, role, pos, rot, length, halfWidth);
        created++;
      }
      record[idKey] = collider.id;
    }
    return created;
  },

  _spawnForkCollider(facility, role, pos, rot, length, halfWidth) {
    const mass = 1e9;
    const envelope = Math.max(length * 0.5, halfWidth);
    return this.helpers.spawnEntity({
      type: 'fx',
      _noMesh: true,
      factionId: facility.factionId,
      pos,
      rot,
      radius: envelope,
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
        shape: 'capsule',
        // Unit reference radius: data.proportions carry absolute WU, so the capsule is exactly the
        // authored machine dimensions rather than a multiple of the broadphase envelope.
        radius: 1,
        mass,
        inertiaY: 0.5 * mass * envelope * envelope,
        ccd: false,
        material: 'station',
      },
      data: {
        proportions: { length, halfWidth },
        heistFacilityId: facility.id,
        heistFacilityRole: role,
        runtimeOwner: 'heistFacilities',
        sectorId: facility.sectorId,
        homeSectorId: facility.sectorId,
        // Receipt semantics, not a physics filter: collisionMask does not filter Rapier contacts.
        payloadCustodyOnly: true,
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
      if (record.forkVisualEntityId != null) {
        if (!dropDressingRow(this.state, record.forkVisualEntityId)) {
          this.helpers.removeEntity(record.forkVisualEntityId);
        }
      }
      for (const idKey of ['forkRailAEntityId', 'forkRailBEntityId', 'forkArrestorEntityId']) {
        if (record[idKey] != null) this.helpers.removeEntity(record[idKey]);
        record[idKey] = null;
      }
      record.visualEntityId = null;
      record.headEntityId = null;
      record.forkVisualEntityId = null;
    }
    // PQ-195.04: the berth worker is ours to remove here; it is deliberately not world-durable
    // (`persistenceOwner: 'heistFacilities'`), so no other owner will take it. Its job record stays
    // in state.npcJobs and re-links to the fresh hull on the next materialize.
    const berth = this.state.heistFacilities.berth;
    if (berth && berth.workerEntityId != null) {
      this.helpers.removeEntity(berth.workerEntityId);
      berth.workerEntityId = null;
    }
    // PQ-195.08: the carrier is ours too — a transient hull that never survives a sector exit.
    // Removing it here makes `breakOrphans` release the clamped load before the sweep; the
    // mission runtime's suspension path has already snapshotted that load's state.
    if (owned.carrierEntityId != null) {
      this.helpers.removeEntity(owned.carrierEntityId);
      owned.carrierEntityId = null;
    }
    owned.clampAttachmentId = null;
    owned.carrierPendingClamp = false;
    owned.carrierClampAttempts = 0;
    owned.carrierReleased = false;
    owned.carrierHeading = null;
    owned.carrierLaunchPos = null;
    owned.carrierReleaseAnchor = null;
    owned.carrierDepartAnchor = null;

    // SF-140: the routine capsule and its escort are bounded transients — the cadence waits in
    // `routine.nextLaunchAtSimT`, the bodies never cross the boundary.
    if (owned.routine) {
      if (owned.routine.capsuleEntityId != null) this.helpers.removeEntity(owned.routine.capsuleEntityId);
      if (owned.routine.escortEntityId != null) this.helpers.removeEntity(owned.routine.escortEntityId);
      owned.routine.capsuleEntityId = null;
      owned.routine.escortEntityId = null;
      owned.routine.theftReportId = null;
    }
    // SF-147: shed shipment units are sector transients too — the mission runtime's suspension
    // snapshot (taken in its own earlier `sector:exit` listener) is what carries them back, so
    // the live bodies are removed here rather than left floating in an unloaded sector.
    for (const entity of indexedTypeScan(this.state, 'payloads')) {
      if (entity?.alive !== false && entity.data?.heistUnit === true
        && entity.data?.runtimeOwner === 'heistFacilities') {
        this.helpers.removeEntity(entity.id);
      }
    }

    // SF-143: an ARMED yard snapshots every loose body before dematerializing them, so sector
    // re-entry restores the exact physical commitment — not a reset yard and not a fabricated
    // manifest. Unarmed yards simply restock on the next materialize.
    const cw = owned.counterweight;
    if (cw) {
      if (cw.sceneId) {
        cw.suspendedBodies = this.snapshotCounterweightBodies();
      }
      if (cw.doorEntityId != null) this.helpers.removeEntity(cw.doorEntityId);
      if (cw.ballastEntityId != null) this.helpers.removeEntity(cw.ballastEntityId);
      if (cw.crewEntityId != null) this.helpers.removeEntity(cw.crewEntityId);
      for (const row of Object.values(cw.crates || {})) {
        if (row.entityId != null) this.helpers.removeEntity(row.entityId);
        row.entityId = null;
        row.restTicks = 0;
      }
      cw.doorEntityId = null;
      cw.ballastEntityId = null;
      cw.crewEntityId = null;
      cw.crewClampId = null;
      cw.crewTargetId = null;
      cw.crewPhase = 'parked';
      const sceneRows = [];
      forEachDressingRow(this.state, (row) => {
        if (row.data?.heistFacilityId === COUNTERWEIGHT_SCENE.id) sceneRows.push(row.id);
      });
      for (const rowId of sceneRows) dropDressingRow(this.state, rowId);
    }

    // SF-147: the monitor posts are scenery rows; the contact edge-set resets with the field.
    if (owned.monitorPosts) {
      for (const row of Object.values(owned.monitorPosts)) {
        if (row.entityId != null) dropDressingRow(this.state, row.entityId);
        row.entityId = null;
      }
    }
    owned.monitorContacts = {};
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
    const spawnPos = {
      x: launcher.pos.x + nx * clearance,
      z: launcher.pos.z + nz * clearance,
    };
    const capsule = variant.id === BREAKAWAY_THIRD_SHIFT_VARIANT_ID
      ? this._spawnCarrierCagedLoad(schedule, variant, nx, nz, spawnPos)
      : this.helpers.spawnEntity(this._payloadSpawnSpec({
        payload,
        schedule,
        variant,
        pos: spawnPos,
        vel: { x: nx * payload.launchSpeed, z: nz * payload.launchSpeed },
        rot: Math.atan2(nz, nx),
      }));
    if (!capsule) return null;
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

  /** The authored payload entity spec — one shape for the free launch and the carrier's caged load. */
  _payloadSpawnSpec({ payload, schedule, variant, pos, vel, rot }) {
    return {
      type: 'payload',
      factionId: payload.legalOwnerFactionId,
      ownerId: payload.ownerId,
      team: 2,
      pos,
      vel,
      rot,
      radius: payload.radius,
      mass: payload.mass,
      hull: payload.hull,
      hullMax: payload.hull,
      collides: true,
      // A heist load is a damageable cargo body, not a ghost: the default payload mask leaves
      // projectiles broadphase-blind to it, which made the load unkillable on the ordinary
      // route. Adding PROJECTILE is what a 480-hull cage is FOR — durable, not invulnerable.
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
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
        // SF-147: the sealed units physically inside the shell. Knocks shed them as real pods;
        // custody at a receiver reads this count — the fence pays for units, not intentions.
        ...(Number.isFinite(payload.shipmentUnits)
          ? { shipmentUnits: payload.shipmentUnits, shipmentUnitsTotal: payload.shipmentUnits }
          : {}),
        ...(variant.id !== HEIST_CAPSULE_RUN_VARIANT_ID ? { heistVariantId: variant.id } : {}),
      },
    };
  },

  /**
   * PQ-195.08: the Third Shift load does not start free. A real yard tug (a `ship_hawser` hull with
   * ordinary flight fields and `data.intent`) hauls the assembly out of the same launch mouth on the
   * same heading, clamped by the ordinary attachment service — `attachment_transport_clamp` between
   * the carrier's aft `transport_clamp` socket and the load's tether socket. The clamp is what is
   * physical here: it is cut at the authored route point, when the carrier's clamp subsystem is
   * disabled, or when the carrier is lost (`breakOrphans`), and cutting only removes the joint —
   * the released body keeps whatever momentum it already had.
   *
   * Fail-closed: if the attachment service or physics port is absent the launch returns null and
   * retries next tick; we never fake a release the player did not see.
   */
  _spawnCarrierCagedLoad(schedule, variant, nx, nz, loadPos) {
    const owned = this.state.heistFacilities;
    const payload = variant.payload;
    const carrierDef = BREAKAWAY_CARRIER;
    const heading = Math.atan2(nz, nx);
    const attachments = this._combatAttachments();
    if (!attachments) {
      // The constraint owner is absent (headless sims without combat). The load still physically
      // exists — it degrades to the historical free launch rather than vanish.
      return this.helpers.spawnEntity(this._payloadSpawnSpec({
        payload,
        schedule,
        variant,
        pos: { x: loadPos.x, z: loadPos.z },
        vel: { x: nx * payload.launchSpeed, z: nz * payload.launchSpeed },
        rot: heading,
      }));
    }

    const carrierSpec = makeShipEntitySpec(carrierDef.shipId, {
      team: 2,
      factionId: carrierDef.factionId,
      pos: { x: 0, z: 0 },
      rot: heading,
    });
    const gap = payload.radius + carrierSpec.radius + carrierDef.clampStandoffWu;
    carrierSpec.pos = { x: loadPos.x + nx * gap, z: loadPos.z + nz * gap };
    carrierSpec.vel = { x: nx * carrierDef.cruiseSpeedWu, z: nz * carrierDef.cruiseSpeedWu };
    carrierSpec.ttl = Infinity;
    carrierSpec.collides = true;
    carrierSpec.flags = { missionPinned: true };
    carrierSpec.homeSectorId = PQ019_HEIST_SECTOR_ID;
    carrierSpec.data = Object.assign(carrierSpec.data || {}, {
      heistFacilityRole: 'transport_carrier',
      combatProfileId: 'combat_profile_heist_carrier',
      launchScheduleId: schedule.scheduleId,
      missionPinned: true,
      runtimeOwner: 'heistFacilities',
      sectorId: PQ019_HEIST_SECTOR_ID,
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      transientSector: true,
    });
    const carrier = this.helpers.spawnEntity(carrierSpec);

    // The caged load leaves at the same mouth position the free launch used, already moving with
    // the tug — the constraint holds it there, nothing teleports it during transit.
    const capsule = this.helpers.spawnEntity(this._payloadSpawnSpec({
      payload,
      schedule,
      variant,
      pos: { x: loadPos.x, z: loadPos.z },
      vel: { x: nx * carrierDef.cruiseSpeedWu, z: nz * carrierDef.cruiseSpeedWu },
      rot: heading,
    }));

    // The physics bodies for these brand-new entities register on the NEXT physics step, so the
    // joint cannot be created here — `_stepCarrier` binds it once the records exist.
    owned.carrierEntityId = carrier.id;
    owned.clampAttachmentId = null;
    owned.carrierPendingClamp = true;
    owned.carrierClampAttempts = 0;
    owned.carrierReleased = false;
    owned.carrierHeading = { x: nx, z: nz };
    owned.carrierLaunchPos = { x: loadPos.x, z: loadPos.z };
    owned.carrierReleaseAnchor = {
      x: loadPos.x + nx * carrierDef.routeReleaseWu,
      z: loadPos.z + nz * carrierDef.routeReleaseWu,
    };
    owned.carrierDepartAnchor = null;
    return capsule;
  },

  /**
   * The combat kernel's attachment service — the same seam player tethers use. Optional chaining:
   * headless sims may run without combat registered, in which case the carrier launch refuses.
   */
  _combatAttachments() {
    const combat = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('combat')
      : null;
    return combat && combat.kernel && combat.kernel.attachments ? combat.kernel.attachments : null;
  },

  /**
   * Drive the carrier's ordinary NPC intent while the run is live: transit to the release anchor,
   * voluntary cut on arrival, then the departure lane and a bounded despawn. Written every step by
   * this owner — `flightV3` executes the intent; nothing here touches position or velocity.
   */
  /** The clamp bolt is gone. A hull with no clamp subsystem is not refused. */
  _clampBankOut(state, entity) {
    const book = state && state.combat && state.combat.entities;
    if (!book || !entity || entity.id == null) return false;
    const runtime = book[String(entity.id)];
    const clamp = runtime && runtime.subsystems && runtime.subsystems.subsystem_transport_clamp;
    return !!(clamp && clamp.effectiveDisabled === true);
  },

  _stepCarrier(state) {
    const owned = this.state.heistFacilities;
    if (!owned || owned.carrierEntityId == null) return;
    const carrier = state.entities.get(owned.carrierEntityId);
    // Verify identity, not just presence: after a reload a stale serialized id could point at a
    // recycled entity. The carrier is never serialized, so a mismatched row means it is gone.
    const isOurs = carrier && carrier.alive !== false
      && carrier.data?.heistFacilityRole === 'transport_carrier'
      && carrier.data?.launchScheduleId === owned.schedule?.scheduleId;
    if (!isOurs) {
      // Lost mid-run: breakOrphans already removed the joint; the load is free with whatever
      // momentum it had. Nothing here fabricates a release or a payout.
      owned.carrierEntityId = null;
      owned.clampAttachmentId = null;
      return;
    }
    const anchor = owned.carrierReleaseAnchor;
    const heading = owned.carrierHeading || { x: 1, z: 0 };
    const attachments = this._combatAttachments();

    // The joint is bound one step after spawn: the physics bodies for the new entities only
    // register on the first physics step after creation, so `create` cannot succeed in the same
    // tick. A real refusal (socket missing, limit, dead endpoint) ends the cage — the load
    // continues free, honestly; a physics-port rejection just means the records are not up yet.
    if (owned.carrierPendingClamp) {
      if (this._clampBankOut(state, carrier)) {
        owned.carrierPendingClamp = false;
        owned.carrierReleased = true;
        return;
      }
      const load = this._activeScheduleCapsule(owned.schedule);
      const result = attachments && load && load.alive !== false
        ? attachments.create({ defId: 'attachment_transport_clamp', ownerId: carrier.id, targetId: load.id })
        : null;
      if (result && result.ok) {
        owned.clampAttachmentId = result.attachment.id;
        owned.carrierPendingClamp = false;
      } else if (!result || (result.reason !== 'physics_port_unavailable' && result.reason !== 'physics_create_rejected')) {
        owned.carrierPendingClamp = false;
        owned.carrierReleased = true;
      } else {
        owned.carrierClampAttempts = (owned.carrierClampAttempts | 0) + 1;
        if (owned.carrierClampAttempts > 120) {
          owned.carrierPendingClamp = false;
          owned.carrierReleased = true;
        }
      }
      return;
    }

    // The tug flies ONE straight lane down the breakaway heading — steering to a far point keeps
    // it on the line instead of orbiting an arrival anchor at cruise speed. Release and despawn
    // are progress crossings, never arrivals.
    const launchPos = owned.carrierLaunchPos || anchor;
    const laneEnd = owned.carrierDepartAnchor || (owned.carrierDepartAnchor = launchPos
      ? { x: launchPos.x + heading.x * BREAKAWAY_CARRIER.departureWu, z: launchPos.z + heading.z * BREAKAWAY_CARRIER.departureWu }
      : null);
    const progress = launchPos
      ? (carrier.pos.x - launchPos.x) * heading.x + (carrier.pos.z - launchPos.z) * heading.z
      : 0;

    if (!owned.carrierReleased) {
      const clamp = owned.clampAttachmentId != null && attachments
        ? attachments.get(owned.clampAttachmentId)
        : null;
      const clampLive = clamp && clamp.state === 'active' && clamp.ownerId === carrier.id;
      if (!clampLive) {
        // The joint is gone — subsystem disabled, or an external break we did not order. Either
        // way the physics already released the load; the tug just flies its departure lane.
        owned.carrierReleased = true;
        owned.clampAttachmentId = null;
      } else if (progress >= BREAKAWAY_CARRIER.routeReleaseWu) {
        // The authored voluntary release: the carrier's own cut removes the joint as it crosses
        // the release line. Both bodies keep their momentum; `cut` never writes velocity.
        attachments.cut(clamp.id, carrier.id, 'transport_release');
        owned.carrierReleased = true;
        owned.clampAttachmentId = null;
      } else {
        this._driveCarrier(carrier, laneEnd || anchor, BREAKAWAY_CARRIER.cruiseSpeedWu);
        return;
      }
    }

    // Post-release: the tug keeps its lane past the release line and is removed once it is clear —
    // a bounded transient, never permanent traffic.
    if (progress >= BREAKAWAY_CARRIER.departureWu) {
      this.helpers.removeEntity(carrier.id);
      owned.carrierEntityId = null;
      return;
    }
    if (laneEnd) this._driveCarrier(carrier, laneEnd, BREAKAWAY_CARRIER.cruiseSpeedWu);
  },

  /**
   * Write the carrier's `data.intent` exactly like a civilian mover: forward throttle toward an
   * aim angle. Throttle is the target pace as a fraction of governed speed, so a heavier hull
   * settles at the authored cruise instead of sprinting.
   *
   * `approach` marks a move that must ARRIVE, not transit — the same trapezoid a working
   * hauler drives (`npcJobsRuntime._driveTo`): the commanded speed is the lesser of the plan
   * and the decel-bound speed for the remaining distance, and the helm asserts brake once the
   * hull can no longer stop inside the reach. Assisted Flight V3 treats `moveZ` as a fraction
   * of the kernel's governed combat speed — `entity.maxSpeed` is the legacy cruise figure and
   * undershoots it ~3x, which is how the tug used to orbit its crate at 120 WU/s forever.
   */
  _driveCarrier(carrier, target, speedWu, approach = null) {
    const dx = target.x - carrier.pos.x;
    const dz = target.z - carrier.pos.z;
    const dist = Math.hypot(dx, dz);
    const data = carrier.data || (carrier.data = {});
    const intent = data.intent || (data.intent = {});
    const profile = resolvePropulsionProfile(carrier, this.state);
    const governed = Math.max(1,
      Number(profile && profile.combatSpeed) || Number(carrier.maxSpeed) || 1);
    const deadInput = Math.max(0, Number(profile && profile.assist && profile.assist.deadInput) || 0.025);
    const reach = approach && Number.isFinite(approach.reachWu) ? Math.max(0, approach.reachWu) : 0;
    // A tow measures the LOAD's distance to the goal, not the nose's: the crate trails a body
    // length down the line, so braking on the tug's own distance released it outside the pad.
    const approachDist = approach && Number.isFinite(approach.measuredDistWu)
      ? approach.measuredDistWu
      : dist;
    const remaining = Math.max(0, approachDist - reach);
    const decel = Math.max(1,
      Number(profile && profile.reverseAccel) || 0,
      (Number(profile && profile.mainAccel) || 0) * 0.72)
      // A load on the clamp line is real mass: with a 120 t crate on a ~70 t tug the same helm
      // stops in barely a third of the solo envelope. Scale the estimate or the trapezoid plans
      // a stop the towed assembly cannot make.
      * Math.max(0.05, Math.min(1, Number(approach && approach.decelScale) || 1));
    // The speed an ARRIVE maneuver must kill is the hull's whole speed, not only the closing
    // component: a tangential drift reads zero closing forever and orbits its mark without ever
    // falling inside the working ring.
    const closing = Math.hypot(
      Number(carrier.vel && carrier.vel.x) || 0,
      Number(carrier.vel && carrier.vel.z) || 0);
    const aimAngle = dist > 1e-6 ? Math.atan2(dz, dx) : Number(carrier.rot) || 0;
    const brake = !!(approach && (
      (approach.brakeWithinWu > 0 && approachDist <= approach.brakeWithinWu)
      || closing * closing / (2 * decel) >= remaining));
    const speed = brake ? 0
      : Math.min(speedWu, approach ? Math.sqrt(2 * decel * remaining) : speedWu);
    let moveZ;
    if (approach) {
      // Δv steering for ARRIVE moves: commanded velocity is plan speed along the approach line;
      // the helm points the nose at the velocity it must CHANGE (v_cmd − v), so a tangential
      // drift gets burned off instead of orbited and the stop is the same law, not a second
      // controller. Throttle rides the correction's size — a heavy tow puts down real authority
      // instead of a fraction of a governed figure the load never feels.
      const vx = Number(carrier.vel && carrier.vel.x) || 0;
      const vz = Number(carrier.vel && carrier.vel.z) || 0;
      const ux = dist > 1e-6 ? dx / dist : 0;
      const uz = dist > 1e-6 ? dz / dist : 0;
      const dvx = ux * speed - vx;
      const dvz = uz * speed - vz;
      const dv = Math.hypot(dvx, dvz);
      const dvAngle = dv > 1e-6 ? Math.atan2(dvz, dvx) : aimAngle;
      const aligned = Math.cos(wrapAngle(dvAngle - (Number(carrier.rot) || 0))) >= 0.8;
      intent.aimAngle = dvAngle;
      // Braking rides the same law: a zero commanded speed turns dv into pure retrograde — the
      // nose flips and burns the hull's whole speed off. `intent.brake` still asserts the
      // kernel's own reverse gear underneath.
      moveZ = dv <= deadInput * 2 || !aligned
        ? 0
        : Math.min(1, dv / 12);
    } else {
      const throttle = Math.min(1, Math.max(speed / governed, deadInput + 0.001));
      intent.aimAngle = aimAngle;
      moveZ = speed <= 0 ? 0 : throttle;
    }
    intent.moveX = 0;
    intent.moveZ = moveZ;
    intent.boost = false;
    intent.brake = brake;
    intent.fire = false;
    intent.fireGroup = null;
  },

  /**
   * PQ-195.07: re-embody a suspended run's load on sector re-entry. The body the run left behind
   * comes back as the SAME body — the snapshot the runtime took at the boundary, not a fresh
   * launch: no arc, no launch cue, no `heist:capsuleLaunched` (the run's own bookkeeping, e.g.
   * `pressureSpawned`, must not re-arm). The schedule, when it survives, is relinked; the durable
   * `launchScheduleId` in the data block is the custody identity either way.
   */
  respawnSuspendedCapsule({ scheduleId = null, variantId = null, snapshot = null } = {}) {
    const owned = this.state.heistFacilities;
    if (!owned || !snapshot || !snapshot.pos) return null;
    const x = Number(snapshot.pos.x);
    const z = Number(snapshot.pos.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const variant = heistLaunchVariant(variantId);
    const payload = variant.payload;
    this.materializeForSector(PQ019_HEIST_SECTOR_ID);
    const capsule = this.helpers.spawnEntity({
      type: 'payload',
      factionId: payload.legalOwnerFactionId,
      ownerId: payload.ownerId,
      team: 2,
      pos: { x, z },
      vel: {
        x: Number(snapshot.vel && snapshot.vel.x) || 0,
        z: Number(snapshot.vel && snapshot.vel.z) || 0,
      },
      rot: Number.isFinite(snapshot.rot) ? snapshot.rot : 0,
      radius: payload.radius,
      mass: payload.mass,
      hull: Number.isFinite(snapshot.hull) ? snapshot.hull : payload.hull,
      hullMax: Number.isFinite(snapshot.hullMax) ? snapshot.hullMax : payload.hull,
      collides: true,
      // Same mask as `_payloadSpawnSpec`: the resumed body stays a damageable cargo body.
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
      ttl: Infinity,
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
        launchScheduleId: scheduleId,
        missionPinned: true,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
        resumedFromSuspension: true,
        ...(variant.id !== HEIST_CAPSULE_RUN_VARIANT_ID ? { heistVariantId: variant.id } : {}),
        // SF-147: the load ledger survives the boundary — a shell that left with two units
        // returns with two units, not a refilled manifest.
        ...(Number.isFinite(snapshot.shipmentUnits)
          ? {
            shipmentUnits: snapshot.shipmentUnits,
            shipmentUnitsTotal: Number.isFinite(snapshot.shipmentUnitsTotal)
              ? snapshot.shipmentUnitsTotal : snapshot.shipmentUnits,
          }
          : {}),
      },
    });
    if (!capsule) return null;
    if (Number.isFinite(snapshot.angVel)) capsule.angVel = snapshot.angVel;
    // The approach is part of the run too: restore the capture the snapshot carried onto the
    // body (the same shape `adoptRestoredLoad` reads after a reload), and relink the live fork
    // record when the schedule survived the boundary. A mismatch restarts the approach — the
    // same rule the restore path already applies; custody is never assumed.
    if (variant.custody === 'capture_fork') {
      const receiver = this._forkReceiver(variant);
      let capture = null;
      try {
        capture = snapshot.capture ? restoreCaptureState(snapshot.capture) : null;
      } catch {
        capture = null;
      }
      if (!capture || capture.payloadId !== payload.stableId || capture.receiverId !== receiver.id) {
        capture = createCaptureState(payload.stableId, receiver.id);
      }
      capsule.data.breakawayCapture = capture;
      if (owned.schedule && owned.schedule.scheduleId === scheduleId) {
        owned.capture = capture;
        owned.capturePrev = null;
      }
    }
    owned.capsuleEntityId = capsule.id;
    if (owned.schedule && owned.schedule.scheduleId === scheduleId) {
      owned.schedule.capsuleEntityId = capsule.id;
    }
    this.bus.emit('heist:capsuleResumed', Object.freeze({
      scheduleId,
      capsuleEntityId: capsule.id,
      payloadStableId: payload.stableId,
      resumedAtTick: this.state.tick | 0,
      ...(variantId ? { variantId } : {}),
      source: 'heistFacilities',
    }));
    return capsule;
  },

  /**
   * SF-147: re-embody the shipment units a hot run shed before it crossed the boundary. Same rule
   * as `respawnSuspendedCapsule` — snapshots are the bodies, never a refilled manifest; a pod that
   * was fenced, returned, or destroyed while the sector was out simply does not come back.
   */
  respawnSuspendedUnits({ scheduleId = null, snapshots = null } = {}) {
    if (!scheduleId || !Array.isArray(snapshots) || !snapshots.length) return { respawned: 0, entityIds: [] };
    const entityIds = [];
    for (const snap of snapshots) {
      if (!snap || !snap.pos || !Number.isFinite(snap.pos.x) || !Number.isFinite(snap.pos.z)) continue;
      const index = Number.isFinite(snap.unitIndex) ? snap.unitIndex : 0;
      const unitOf = String(snap.unitOf || '');
      if (!unitOf) continue;
      const entity = this.helpers.spawnEntity({
        type: 'payload',
        factionId: snap.factionId || 'faction_scn',
        ownerId: snap.ownerId || null,
        team: 2,
        pos: { x: snap.pos.x, z: snap.pos.z },
        vel: { x: Number(snap.vel?.x) || 0, z: Number(snap.vel?.z) || 0 },
        rot: Number.isFinite(snap.rot) ? snap.rot : 0,
        radius: PQ019_SHIPMENT_UNIT.radius,
        mass: PQ019_SHIPMENT_UNIT.mass,
        hull: Number.isFinite(snap.hull) ? snap.hull : PQ019_SHIPMENT_UNIT.hull,
        hullMax: PQ019_SHIPMENT_UNIT.hull,
        collides: true,
        collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
        ttl: Infinity,
        flags: { missionPinned: true },
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        physicsBody: {
          dynamic: true,
          radius: PQ019_SHIPMENT_UNIT.radius,
          mass: PQ019_SHIPMENT_UNIT.mass,
          inertiaY: 0.5 * PQ019_SHIPMENT_UNIT.mass * PQ019_SHIPMENT_UNIT.radius ** 2,
          ccd: true,
          material: 'payload',
        },
        data: {
          heistFacilityRole: 'shipment_unit',
          heistUnit: true,
          heistUnitOf: unitOf,
          heistUnitIndex: index,
          heistPayloadStableId: `${unitOf}:u${index}`,
          authoredPayloadAssetId: PQ019_SHIPMENT_UNIT.authoredPayloadAssetId,
          legalOwnerFactionId: snap.legalOwnerFactionId || snap.factionId || 'faction_scn',
          ownerId: snap.ownerId || null,
          launchScheduleId: scheduleId,
          missionPinned: true,
          runtimeOwner: 'heistFacilities',
          sectorId: PQ019_HEIST_SECTOR_ID,
          homeSectorId: PQ019_HEIST_SECTOR_ID,
          transientSector: true,
          resumedFromSuspension: true,
        },
      });
      if (entity) {
        if (Number.isFinite(snap.angVel)) entity.angVel = snap.angVel;
        entityIds.push(entity.id);
      }
    }
    return { respawned: entityIds.length, entityIds };
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
      const forkRole = facility ? `${facility.role}_fork` : null;
      if (record.visualEntityId === id
        && !stillOurs(current, visualRole)
        && !stillOurs(dressing, visualRole)) {
        record.visualEntityId = null;
      }
      if (record.headEntityId === id && !stillOurs(current, headRole)) {
        record.headEntityId = null;
      }
      if (record.forkVisualEntityId === id
        && !stillOurs(current, forkRole)
        && !stillOurs(dressing, forkRole)) {
        record.forkVisualEntityId = null;
      }
      // PQ-195.01 static steel: the record id clears when its body is gone, so a later materialize
      // re-spawns instead of trusting a dead id.
      for (const [idKey, role] of [
        ['forkRailAEntityId', `${facility?.role}_rail_a`],
        ['forkRailBEntityId', `${facility?.role}_rail_b`],
        ['forkArrestorEntityId', `${facility?.role}_arrestor`],
      ]) {
        if (facility && record[idKey] === id && !stillOurs(current, role)) record[idKey] = null;
      }
    }
    // PQ-195.04: clear the berth worker handle when its hull is gone, so a later materialize
    // re-spawns instead of trusting a dead id.
    if (owned.berth && owned.berth.workerEntityId === id
      && !(current && current.alive !== false && current.data?.berthWorkerId === BREAKAWAY_BERTH.id)) {
      owned.berth.workerEntityId = null;
    }

    // SF-140: routine capsule + escort handles.
    if (owned.routine) {
      if (owned.routine.capsuleEntityId === id
        && !(current && current.alive !== false && current.data?.heistRoutine === true)) {
        owned.routine.capsuleEntityId = null;
      }
      if (owned.routine.escortEntityId === id
        && !(current && current.alive !== false && current.data?.heistRoutineEscort === true)) {
        owned.routine.escortEntityId = null;
      }
    }

    // SF-143: door/ballast/crew/crate handles — and honest loss events while a watch is armed.
    const cw = owned.counterweight;
    if (cw) {
      const stillOursScene = (entity, role) => !!(entity && entity.alive !== false
        && entity.data?.heistFacilityRole === role);
      if (cw.doorEntityId === id && !stillOursScene(current, 'counterweight_door')) cw.doorEntityId = null;
      if (cw.ballastEntityId === id && !stillOursScene(current, 'counterweight_body')) cw.ballastEntityId = null;
      if (cw.crewEntityId === id
        && !(current && current.alive !== false && current.data?.counterweightCrew === true)) {
        cw.crewEntityId = null;
        // The crew-lost event is spoken by `_stepGateCrew` on the next live tick — only while
        // armed does a missing tug count as a lost actor rather than unspawned scenery.
      }
      for (const [stableId, row] of Object.entries(cw.crates || {})) {
        if (row.entityId !== id) continue;
        if (!(current && current.alive !== false && current.data?.counterweightStableId === stableId)) {
          row.entityId = null;
          if (row.state !== 'delivered' && row.state !== 'lost') {
            row.state = 'lost';
            if (cw.sceneId) {
              this._emitCounterweightEvent(this.state, { event: 'crate_lost', stableId });
            }
          }
        }
      }
    }
  },

  _onPhysicsImpact(impact) {
    if (!(Number(impact.dp) > 0)) return;
    const a = entityIsAlive(this.state, impact.aId);
    const b = entityIsAlive(this.state, impact.bId);
    if (!a || !b) return;

    // SF-140/147: routine-capsule custody and unit pods at receivers resolve independently of any
    // booked schedule — these bodies are never the schedule's capsule.
    if (this._onSceneImpact(impact, a, b)) return;

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
    const custodyHead = !!(facilityId && head.data?.heistFacilityRole === `${facilityId}_head`
      && (facilityId === 'lawful_catcher' || facilityId === 'fence_receiver')
      && head.collides && head.collisionMask === Masks.PAYLOAD
      && head.physicsBody?.dynamic === false);
    const variant = heistLaunchVariant(schedule.variantId);
    // The receiver's grab is CUSTODY of the whole shell — the units inside arrive with it. A catch
    // impact is never the "hard knock" that sheds a pod; knocks are ships, rock, the fork steel.
    const takesCustody = custodyHead
      && (facilityId === 'fence_receiver' || variant.custody === 'contact');
    // SF-147: a hard knock sheds a sealed unit as a real pod — physical loss of load, not a flag.
    if (!takesCustody) this._maybeEjectShipmentUnit(capsule, impact);
    if (!custodyHead) return;
    // CONTACT CUSTODY IS FACILITY-SPECIFIC. A capture-fork variant never takes custody from a touch
    // of the catcher head — that head is the fork's rear stop and only the fork kernel settles a
    // delivery there. The Quiet fence is a plain contact receiver for EVERY payload, so the SAME
    // physical body can still be handed over at the fence. That is PQ-195.03's second destination.
    if (variant.custody !== 'contact' && facilityId !== 'fence_receiver') return;

    const kind = facilityId === 'lawful_catcher'
      ? 'lawful_catch_contact'
      : 'fence_contact';
    const tick = Math.max(0, Math.trunc(finite(impact.tick, this.state.tick)));
    const scheduleId = schedule.scheduleId;
    const payloadStableId = variant.payload.stableId;
    const receiptId = [
      'pq019a',
      scheduleId,
      payloadStableId,
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
      payloadStableId,
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

  /**
   * SF-140/147: custody contact for bodies that are NOT the booked schedule's capsule —
   * the routine transfer, and the sealed units a stolen shipment sheds on hard knocks.
   * Returns true when the impact was ours to handle.
   */
  _onSceneImpact(impact, a, b) {
    const owned = this.state.heistFacilities;
    const headOf = (entity) => {
      const facilityId = entity.data?.heistFacilityId;
      return facilityId && entity.data?.heistFacilityRole === `${facilityId}_head`
        ? facilityId
        : null;
    };
    const headA = headOf(a);
    const headB = headOf(b);
    if (!headA && !headB) return false;
    const body = headA ? b : a;
    const facilityId = headA || headB;
    const tick = Math.max(0, Math.trunc(finite(impact.tick, this.state.tick)));

    // The routine capsule landing in the Concord catcher — lawful freight received, logged,
    // and consumed, exactly like a contract catch minus the contract.
    if (this._isRoutineCapsule(body) && facilityId === 'lawful_catcher') {
      const scheduleId = body.data.launchScheduleId;
      const receipt = Object.freeze({
        receiptId: `pq019a:routine:caught:${scheduleId}`,
        kind: 'routine_caught',
        source: 'physics:impact',
        scheduleId,
        payloadEntityId: body.id,
        payloadStableId: body.data.heistPayloadStableId,
        facilityId,
        tick,
        pos: Object.freeze({ x: stableNumber(impact.pos?.x), z: stableNumber(impact.pos?.z) }),
      });
      this.helpers.removeEntity(body.id);
      if (owned.routine) {
        if (owned.routine.capsuleEntityId === body.id) owned.routine.capsuleEntityId = null;
        if (owned.routine.escortEntityId != null) {
          this.helpers.removeEntity(owned.routine.escortEntityId);
          owned.routine.escortEntityId = null;
        }
      }
      this.bus.emit('heist:routineReceipt', receipt);
      // A witnessed catch teaches where lawful freight actually lands.
      if (this._playerDistTo(body.pos) <= PQ019_OBSERVE.watchRadiusWu) {
        this._observeFact('catcher_receiver', 'watch', { routineSeq: owned.routine?.seq });
      }
      return true;
    }

    // The Quiet fence has no use for logged Concord freight — it says so, once, per capsule.
    if (this._isRoutineCapsule(body) && facilityId === 'fence_receiver') {
      if (body.data.routineRefusedAtTick === tick) return true;
      if (body.data.routineRefusedAtTick == null) {
        body.data.routineRefusedAtTick = tick;
        this._saySceneCue({
          cueId: `pq019a:routine:refused:${body.data.launchScheduleId}`,
          text: `${PQ019_FACILITIES.fence_receiver.name} waves the freight off — logged Concord freight is worth nothing here`,
        });
      }
      return true;
    }

    // A shed shipment unit finding a receiver: custody is per-unit, and which receiver got it is
    // the custody the mission settles against.
    if (body.data?.heistUnit === true
      && (facilityId === 'lawful_catcher' || facilityId === 'fence_receiver')) {
      const kind = facilityId === 'lawful_catcher' ? 'unit_returned' : 'unit_fenced';
      const scheduleId = body.data.launchScheduleId;
      const receipt = Object.freeze({
        receiptId: `pq019a:${scheduleId}:${body.data.heistUnitOf}:unit:${body.id}:${facilityId}`,
        kind,
        source: 'physics:impact',
        scheduleId,
        payloadEntityId: body.id,
        payloadStableId: body.data.heistUnitOf,
        unitEntityId: body.id,
        facilityId,
        physicsImpactDp: stableNumber(impact.dp),
        tick,
        pos: Object.freeze({ x: stableNumber(impact.pos?.x), z: stableNumber(impact.pos?.z) }),
      });
      // The receiver takes custody — the pod is consumed by the handoff.
      this.helpers.removeEntity(body.id);
      this._pushCandidateReceipt(receipt);
      return true;
    }

    return false;
  },

  /**
   * SF-147: a hard knock physically sheds one sealed unit from a multi-unit stolen shipment as a
   * real pod beside the capsule. The capsule's `shipmentUnits` count is the durable load ledger —
   * the fence pays for units that actually arrive, not for the manifest the shell once claimed.
   */
  _maybeEjectShipmentUnit(capsule, impact) {
    const units = Number(capsule.data?.shipmentUnits) || 0;
    if (units <= 0) return;
    // A load authored as ONE unit is indivisible — there is no partial-load version of a
    // flywheel, so knocks on it never mint a pod inside the fork bay.
    if ((Number(capsule.data?.shipmentUnitsTotal) || units) <= 1) return;
    if (!(Number(impact.dp) >= 30)) return;
    const tick = Math.max(0, Math.trunc(finite(impact.tick, this.state.tick)));
    if (capsule.data.lastUnitEjectTick === tick) return; // one unit per hard hit
    capsule.data.lastUnitEjectTick = tick;
    capsule.data.shipmentUnits = units - 1;
    const scheduleId = capsule.data.launchScheduleId;
    const index = (Number(capsule.data.shipmentUnitsTotal) || units) - (units - 1);
    const angle = ((index * 2.399963) % (Math.PI * 2)); // deterministic spread per unit
    const pod = this.helpers.spawnEntity({
      type: 'payload',
      factionId: capsule.factionId,
      ownerId: capsule.ownerId,
      team: Number.isFinite(capsule.team) ? capsule.team : 2,
      pos: { x: impact.pos?.x ?? capsule.pos.x, z: impact.pos?.z ?? capsule.pos.z },
      vel: {
        x: (capsule.vel?.x || 0) * 0.85 + Math.cos(angle) * 8,
        z: (capsule.vel?.z || 0) * 0.85 + Math.sin(angle) * 8,
      },
      radius: PQ019_SHIPMENT_UNIT.radius,
      mass: PQ019_SHIPMENT_UNIT.mass,
      hull: PQ019_SHIPMENT_UNIT.hull,
      hullMax: PQ019_SHIPMENT_UNIT.hull,
      collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
      ttl: Infinity,
      // Like the capsule itself: mission-pinned, and NOT save-persistent — the mission's load
      // snapshot re-embodies shed units on restore just as it does the shell.
      flags: { missionPinned: true },
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: true,
        radius: PQ019_SHIPMENT_UNIT.radius,
        mass: PQ019_SHIPMENT_UNIT.mass,
        inertiaY: 0.5 * PQ019_SHIPMENT_UNIT.mass * PQ019_SHIPMENT_UNIT.radius ** 2,
        ccd: true,
        material: 'payload',
      },
      data: {
        heistFacilityRole: 'shipment_unit',
        heistUnit: true,
        heistUnitOf: capsule.data.heistPayloadStableId,
        heistUnitIndex: index,
        heistPayloadStableId: `${capsule.data.heistPayloadStableId}:u${index}`,
        authoredPayloadAssetId: PQ019_SHIPMENT_UNIT.authoredPayloadAssetId,
        legalOwnerFactionId: capsule.data.legalOwnerFactionId,
        ownerId: capsule.ownerId,
        launchScheduleId: scheduleId,
        missionPinned: true,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
      },
    });
    if (!pod) return;
    this.bus.emit('heist:shipmentUnit', Object.freeze({
      event: 'unit_ejected',
      scheduleId,
      unitEntityId: pod.id,
      unitIndex: index,
      unitsRemaining: units - 1,
      pos: Object.freeze({ x: stableNumber(pod.pos.x), z: stableNumber(pod.pos.z) }),
      tick,
      source: 'heistFacilities',
    }));
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

    if (refused) this._narrateCaptureRefusal(schedule.scheduleId, out.reason, tick);
    if (out.event === 'capture_ready') {
      this._recordSettledCapture(schedule, load, variant, receiver, capture, sample);
    }
    return out;
  },

  /** One line per reason per approach. A miss the player can see has to say which gate failed. */
  _narrateCaptureRefusal(scheduleId, reason, tick) {
    const text = CAPTURE_REFUSAL_TEXT[reason];
    if (!text) return false;
    const owned = this.state && this.state.heistFacilities;
    if (!owned) return false;
    const told = owned.captureRefusalTold || (owned.captureRefusalTold = { key: '', tick: -1e9 });
    const key = `${scheduleId || ''}:${reason}`;
    const now = Number.isFinite(tick) ? tick : 0;
    if (told.key === key && now - told.tick < CAPTURE_REFUSAL_REPEAT_TICKS) return false;
    told.key = key;
    told.tick = now;
    this._saySceneCue({ cueId: `pq019a:capture:${reason}`, text });
    return true;
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
   * FRESH custody for a delivery, evaluated now. Called at prepare AND at commit: a load that
   * settled once and was then dragged, shot or knocked out of the bay has no custody left to pass.
   *
   * Fork custody is proven by live mechanical state, and ONLY at the fork. A contact receiver (the
   * Quiet fence) proves custody with its own recorded contact receipt, so an SP-07 handoff there is
   * a contact delivery even though the same variant uses the fork arc elsewhere (PQ-195.03).
   */
  _forkCustodyProof(schedule, load, facilityId = null) {
    const variant = heistLaunchVariant(schedule?.variantId);
    if (variant.custody !== 'capture_fork'
      || (facilityId && facilityId !== variant.fork?.facilityId)) {
      return { ok: true, reason: 'contact_custody' };
    }
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
    // PQ-195.08: the carrier and its clamp are live-run ids that never serialize — a restored
    // game has no tug at all, so every reference is stale by definition.
    owned.carrierEntityId = null;
    owned.clampAttachmentId = null;
    owned.carrierPendingClamp = false;
    owned.carrierClampAttempts = 0;
    owned.carrierReleased = false;
    owned.carrierHeading = null;
    owned.carrierLaunchPos = null;
    owned.carrierReleaseAnchor = null;
    owned.carrierDepartAnchor = null;
    // SF-140/143/147: every live-id reference is stale after a restore. The yard's armed sceneId
    // is the MISSION's durable record — `adoptCounterweightScene` re-arms it from that record, so
    // the facility clears its session arming here rather than trusting a stale scene.
    if (owned.routine) {
      owned.routine.capsuleEntityId = null;
      owned.routine.escortEntityId = null;
      owned.routine.theftReportId = null;
    }
    const cw = owned.counterweight;
    if (cw) {
      cw.doorEntityId = null;
      cw.ballastEntityId = null;
      cw.crewEntityId = null;
      cw.crewClampId = null;
      cw.crewTargetId = null;
      cw.crewPhase = 'parked';
      cw.sceneId = null;
      cw.armedTick = null;
      cw.suspendedBodies = null;
      for (const row of Object.values(cw.crates || {})) {
        row.entityId = null;
        row.restTicks = 0;
      }
    }
    if (owned.monitorPosts) {
      for (const row of Object.values(owned.monitorPosts)) row.entityId = null;
    }
    owned.monitorContacts = {};
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

  /** Remove every owned load body stamped with `scheduleId`. Used only for a run that is over. */
  _removeUnadoptedLoads(scheduleId) {
    let removed = 0;
    for (const entity of indexedTypeScan(this.state, 'payloads')) {
      if (!entity || entity.alive === false || !this._isOwnedCapsule(entity)) continue;
      if (entity.data.launchScheduleId !== scheduleId) continue;
      this.helpers.removeEntity(entity.id);
      removed++;
    }
    return removed;
  },

  /** The restored body for a schedule, matched by stable data — never by a recycled entity id. */
  _findRestoredLoad(scheduleId, variant) {
    for (const entity of indexedTypeScan(this.state, 'payloads')) {
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

    // Physical proof: this facility must already own a custody candidate for this capsule. A FORK
    // delivery accepts only its own settled-capture receipt, never a touch; the fork's own facility
    // is the only place that holds. The Quiet fence is a contact receiver, so an SP-07 handoff there
    // is earned by its `fence_contact` receipt (PQ-195.03 — one object, two destinations).
    const forkCustody = variant.custody === 'capture_fork' && facilityId === variant.fork?.facilityId;
    const contact = owned.candidateReceipts.find((row) => (
      row && row.facilityId === facilityId && row.payloadStableId === payloadStableId
      && row.scheduleId === schedule.scheduleId
      && (!forkCustody || row.kind === CAPTURE_SETTLED_KIND)
    ));
    if (!contact) return receiverDenial('no_custody_contact', receiptId);
    // ...and a fork's custody must still be physically true NOW, not merely have been true once.
    if (forkCustody) {
      const proof = this._forkCustodyProof(schedule, capsule, facilityId);
      if (!proof.ok) return receiverDenial(proof.reason, receiptId);
    }

    const handoff = {
      receiptId,
      facilityId,
      payloadStableId,
      scheduleId: schedule.scheduleId,
      capsuleEntityId: capsule.id,
      custodyReceiptId: contact.receiptId,
      // SF-147: the sealed units physically inside the shell at custody — the custody the
      // settlement reads, captured before consumption.
      shipmentUnits: Number.isFinite(capsule.data?.shipmentUnits) ? capsule.data.shipmentUnits : null,
      shipmentUnitsTotal: Number.isFinite(capsule.data?.shipmentUnitsTotal)
        ? capsule.data.shipmentUnitsTotal : null,
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
    const proof = this._forkCustodyProof(owned.schedule, capsule, handoff.facilityId);
    if (!proof.ok) {
      handoff.status = 'aborted';
      handoff.abortReason = proof.reason;
      return { committed: false, reason: proof.reason, handoff };
    }
    // A FORK delivery records the load's condition at the instant custody passes, before the body
    // is consumed — the mission's quality quote reads this, never a later guess. The Quiet fence does
    // not grade condition (PQ-195.03), so a fence handoff records none.
    if (handoff.facilityId === heistLaunchVariant(owned.schedule?.variantId).fork?.facilityId) {
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
    // A durable load the save owner restored but no mission re-adopted (its run settled from a
    // refused or already-decided record) hangs off no schedule. Left alone it would be an orphan body
    // that every later save respawns — a duplicate of cargo whose contract is over.
    if (!schedule) {
      const orphans = id ? this._removeUnadoptedLoads(id) : 0;
      return { released: false, reason: 'no_schedule', ...(orphans ? { removedOrphanLoads: orphans } : {}) };
    }
    if (id && schedule.scheduleId !== id) {
      const orphans = this._removeUnadoptedLoads(id);
      return {
        released: false,
        reason: 'schedule_mismatch',
        activeScheduleId: schedule.scheduleId,
        ...(orphans ? { removedOrphanLoads: orphans } : {}),
      };
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

  // ── SF-140: the routine lawful transfer ─────────────────────────────────────────────────────
  //
  // While no contract owns `owned.schedule` the launcher keeps flying ordinary logged freight to
  // the Concord catcher. The routine capsule is the same physical body on the same launch math —
  // what it never carries is a mission schedule identity, so no settlement table can see it. A
  // stolen routine capsule reports through the ordinary law seam (`_onRoutineTake`) and pays
  // nobody: "legitimate transfers never become player rewards" is structural here, not a rule
  // someone must remember.

  _isRoutineCapsule(entity) {
    return !!entity && entity.type === 'payload' && entity.data?.heistRoutine === true;
  },

  _stepRoutine(state, dt) {
    const owned = state.heistFacilities;
    const routine = owned?.routine;
    if (!routine) return;

    // Track the flying capsule; catch/loss/theft bookkeeping lives in the impact and
    // entity-destroyed handlers.
    if (routine.capsuleEntityId != null) {
      const capsule = entityIsAlive(state, routine.capsuleEntityId);
      if (this._isRoutineCapsule(capsule)) {
        this._stepRoutineEscort(state, routine, capsule);
        return;
      }
      routine.capsuleEntityId = null;
      routine.escortEntityId = null;
      routine.theftReportId = null;
      if (routine.nextLaunchAtSimT == null) {
        routine.nextLaunchAtSimT = stableNumber(state.simTime + PQ019_ROUTINE.cadenceS);
      }
      return;
    }

    // A booked launcher flies no routine — the contract owns the slot until it settles.
    if (owned.schedule) return;
    if (routine.nextLaunchAtSimT == null) {
      routine.nextLaunchAtSimT = stableNumber(state.simTime + PQ019_ROUTINE.firstLaunchDelayS);
      return;
    }

    // The OBSERVED schedule earns a spoken early warning; an unwatched launcher throws silently.
    const facts = owned.observed || {};
    if (facts.launcher_schedule
      && routine.earlyCueSeq !== routine.seq
      && state.simTime + 1e-9 >= routine.nextLaunchAtSimT - PQ019_OBSERVE.earlyWarningS) {
      routine.earlyCueSeq = routine.seq;
      this._saySceneCue({
        cueId: `pq019a:routine:early:${routine.seq}`,
        text: `${PQ019_FACILITIES.heist_launcher.name}: routine transfer in ~${PQ019_OBSERVE.earlyWarningS}s — you know this cadence`,
      });
    }

    if (state.simTime + 1e-9 < routine.nextLaunchAtSimT) return;
    this._launchRoutineCapsule(state, routine, dt);
  },

  _launchRoutineCapsule(state, routine) {
    const launcher = this._facilityHead('heist_launcher');
    const catcher = this._facilityHead('lawful_catcher');
    if (!launcher || !catcher) {
      // Machinery down — retry on a bounded delay rather than throwing nothing forever.
      routine.nextLaunchAtSimT = stableNumber(state.simTime + 30);
      return null;
    }
    const dx = catcher.pos.x - launcher.pos.x;
    const dz = catcher.pos.z - launcher.pos.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0) || !Number.isFinite(length)) {
      routine.nextLaunchAtSimT = stableNumber(state.simTime + 30);
      return null;
    }
    routine.seq = (routine.seq | 0) + 1;
    const scheduleId = `${PQ019_ROUTINE.schedulePrefix}:${routine.seq}`;
    const payload = heistLaunchVariant(null).payload;
    const nx = dx / length;
    const nz = dz / length;
    const clearance = launcher.radius + payload.radius + 2;
    const capsule = this.helpers.spawnEntity(this._payloadSpawnSpec({
      payload,
      schedule: { scheduleId, variantId: null },
      variant: heistLaunchVariant(null),
      pos: { x: launcher.pos.x + nx * clearance, z: launcher.pos.z + nz * clearance },
      vel: { x: nx * payload.launchSpeed, z: nz * payload.launchSpeed },
      rot: Math.atan2(nz, nx),
    }));
    if (!capsule) {
      routine.nextLaunchAtSimT = stableNumber(state.simTime + 30);
      return null;
    }
    // Logged ordinary freight: nothing separable inside, and its own marker so handlers never
    // confuse it with a mission's payload.
    capsule.data.heistRoutine = true;
    capsule.data.shipmentUnits = 0;
    routine.capsuleEntityId = capsule.id;
    routine.nextLaunchAtSimT = stableNumber(state.simTime + PQ019_ROUTINE.cadenceS);
    routine.theftReportId = null;
    this._saySceneCue({
      cueId: `pq019a:routine:away:${routine.seq}`,
      text: `Routine transfer away — ${PQ019_FACILITIES.lawful_catcher.name} bound`,
    });
    // Watching a real throw IS the schedule lesson — no scan pulse required.
    const player = entityIsAlive(this.state, this.state.playerId);
    if (player && Math.hypot(player.pos.x - capsule.pos.x, player.pos.z - capsule.pos.z)
        <= PQ019_OBSERVE.watchRadiusWu) {
      this._observeFact('launcher_schedule', 'watch', { routineSeq: routine.seq });
    }
    // A fenced theft buys the launcher an escort for its next transfers — a real consequence
    // the player can see, not a flag.
    if ((routine.escortsRemaining | 0) > 0) {
      this._spawnRoutineEscort(state, routine, capsule);
      routine.escortsRemaining--;
    }
    return capsule;
  },

  _spawnRoutineEscort(state, routine, capsule) {
    const spec = makeShipEntitySpec(PQ019_ROUTINE.escortShipId, {
      team: 2,
      factionId: PQ019_ROUTINE.escortFactionId,
      pos: { x: capsule.pos.x - 30, z: capsule.pos.z + 30 },
      rot: Number(capsule.rot) || 0,
      ai: { archetype: 'passive', passive: true, spawnContext: 'routine_escort' },
    });
    spec.ttl = Infinity;
    spec.homeSectorId = PQ019_HEIST_SECTOR_ID;
    spec.data = Object.assign(spec.data || {}, {
      heistRoutineEscort: true,
      missionPinned: true,
      runtimeOwner: 'heistFacilities',
      sectorId: PQ019_HEIST_SECTOR_ID,
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      transientSector: true,
    });
    const escort = this.helpers.spawnEntity(spec);
    if (escort) routine.escortEntityId = escort.id;
    return escort;
  },

  /** The escort shadows its capsule at a standoff behind it — an ordinary hull with intent. */
  _stepRoutineEscort(state, routine, capsule) {
    const escort = entityIsAlive(state, routine.escortEntityId);
    if (!escort || escort.data?.heistRoutineEscort !== true) {
      routine.escortEntityId = null;
      return;
    }
    const speed = Math.hypot(capsule.vel?.x || 0, capsule.vel?.z || 0) || 1;
    const bx = capsule.pos.x - (capsule.vel.x / speed) * PQ019_ROUTINE.escortStandoffWu;
    const bz = capsule.pos.z - (capsule.vel.z / speed) * PQ019_ROUTINE.escortStandoffWu;
    this._driveCarrier(escort, { x: bx, z: bz }, PQ019_ROUTINE.escortSpeedWu);
  },

  /** `tether:latched` on a routine capsule — a real theft, judged by the law owner. */
  _onRoutineTake(payload = {}) {
    const state = this.state;
    const owned = state.heistFacilities;
    const routine = owned?.routine;
    if (!routine) return false;
    const capsule = entityIsAlive(state, payload.targetId);
    if (!this._isRoutineCapsule(capsule)) return false;
    if (capsule.data?.runtimeOwner !== 'heistFacilities') return false;
    const scheduleId = capsule.data.launchScheduleId;
    if (!scheduleId || routine.theftReportId === scheduleId) return false;
    const law = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('lawSecurity')
      : null;
    if (!law || typeof law.reportIncident !== 'function') return false;
    const reportId = `pq019a:routine-theft:${scheduleId}`;
    const receipt = law.reportIncident({
      reportId,
      kind: 'payload_theft',
      offenderStableId: 'player',
      offenderEntityId: state.playerId,
      payloadStableId: capsule.data.heistPayloadStableId,
      causalTick: state.tick | 0,
      pos: { x: capsule.pos.x, z: capsule.pos.z },
    });
    // Denied reports are not cached — a latch later, inside a witness ring, must get a fresh
    // judgement. An accepted report is stored only to spare the bus a repeat call for the same
    // take; law's own idempotency ledger is still the authority.
    if (receipt && receipt.accepted === true) routine.theftReportId = scheduleId;
    this._saySceneCue({
      cueId: `pq019a:routine:theft:${scheduleId}:${receipt && receipt.accepted === true ? 'w' : 'u'}`,
      text: receipt && receipt.accepted === true
        ? 'Routine cargo taken — witnesses logged it, Concord will come'
        : 'Routine cargo taken — nobody is coming for it, and nobody is paying for it',
    });
    return true;
  },

  // ── SF-140: interception by observation ─────────────────────────────────────────────────────

  /** One durable learned fact. First writer wins; knowledge is never un-learned. */
  _observeFact(factId, method, detail = null) {
    const owned = this.state.heistFacilities;
    const facts = owned.observed || (owned.observed = {});
    if (facts[factId]) return false;
    facts[factId] = {
      atTick: this.state.tick | 0,
      method: String(method || 'watch'),
      ...(detail && typeof detail === 'object' ? { detail } : {}),
    };
    this.bus.emit('heist:observed', Object.freeze({
      fact: factId,
      method: String(method || 'watch'),
      atTick: this.state.tick | 0,
      source: 'heistFacilities',
    }));
    this._saySceneCue({
      cueId: `pq019a:observed:${factId}`,
      text: {
        launcher_schedule: 'Launcher schedule learned — it throws freight on a real cadence, observed or not',
        catcher_receiver: 'Concord catcher geometry learned — its custody head is the lawful end of the line',
        fence_receiver: 'Quiet fence geometry learned — the only buyer that does not ask questions',
        crew_route: 'Crew route learned — where the worker goes is where the machinery is',
      }[factId] || `Heist fact learned — ${factId}`,
    });
    return true;
  },

  /** Read-only view of the learned fact table for the mission owner and tests. */
  heistObservations() {
    const observed = this.state?.heistFacilities?.observed || {};
    return Object.freeze({ ...observed });
  },

  _playerDistTo(pos) {
    const player = entityIsAlive(this.state, this.state?.playerId);
    if (!player || !pos) return Infinity;
    return Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  },

  /** `scan:completed` — a pulse covered whatever it physically covered. */
  _onScanCompleted(payload = {}) {
    if (payload.sectorId !== PQ019_HEIST_SECTOR_ID) return;
    const state = this.state;
    const radius = PQ019_OBSERVE.scanRadiusWu;
    // Facility heads are the real objects; their visuals share the socket.
    const heads = {
      launcher_schedule: this._facilityHead('heist_launcher'),
      catcher_receiver: this._facilityHead('lawful_catcher'),
      fence_receiver: this._facilityHead('fence_receiver'),
    };
    for (const [factId, head] of Object.entries(heads)) {
      if (head && this._playerDistTo(head.pos) <= radius) this._observeFact(factId, 'scan');
    }
    // A pulse over a flying routine capsule teaches both ends of its lane.
    const routine = state.heistFacilities?.routine;
    const capsule = routine && entityIsAlive(state, routine.capsuleEntityId);
    if (this._isRoutineCapsule(capsule) && this._playerDistTo(capsule.pos) <= radius) {
      this._observeFact('launcher_schedule', 'scan', { routineSeq: routine.seq });
      this._observeFact('catcher_receiver', 'scan', { routineSeq: routine.seq });
    }
    // Scanning a working hull teaches its route.
    const worker = entityIsAlive(state, state.heistFacilities?.berth?.workerEntityId);
    if (worker && this._playerDistTo(worker.pos) <= radius) this._observeFact('crew_route', 'scan');
    const crew = entityIsAlive(state, state.heistFacilities?.counterweight?.crewEntityId);
    if (crew && this._playerDistTo(crew.pos) <= radius) this._observeFact('crew_route', 'scan');
  },

  /** "Follow a worker": cumulative proximity accrues the crew-route fact. */
  _stepFollowObserve(state) {
    const owned = state.heistFacilities;
    if (owned.observed?.crew_route) return;
    const candidates = [
      owned.berth?.workerEntityId,
      owned.carrierEntityId,
      owned.counterweight?.crewEntityId,
    ];
    for (const id of candidates) {
      const hull = entityIsAlive(state, id);
      if (hull && this._playerDistTo(hull.pos) <= PQ019_OBSERVE.followRadiusWu) {
        owned.followHoldTicks = (owned.followHoldTicks | 0) + 1;
        if (owned.followHoldTicks >= PQ019_OBSERVE.followTicks) {
          this._observeFact('crew_route', 'follow', {
            worker: hull.data?.berthWorkerId || hull.data?.heistFacilityRole || 'yard',
          });
        }
        return;
      }
    }
    owned.followHoldTicks = 0;
  },

  // ── SF-143: the counterweight scene ─────────────────────────────────────────────────────────
  //
  // The yard is real whether or not a watch is armed: the gate answers its cradle for anyone.
  // Arming gives the crew a work order — the tug walks staged crates through the open gate while
  // the balance holds. Commitment is the physical change of balance; interruption is a physical
  // choice between the mechanism and the output.

  _materializeCounterweight() {
    const owned = this.state.heistFacilities;
    const cw = owned.counterweight || (owned.counterweight = makeCounterweightState());
    const scene = COUNTERWEIGHT_SCENE;
    let created = 0;

    // Cradle pad and receiver pad visuals — scenery the gate/door read off.
    if (!this._findOwnedEntity(scene.id, 'counterweight_cradle')) {
      insertDressingRow(this.state, {
        type: 'fx',
        pos: this._global(scene.cradle.pos),
        radius: scene.cradle.radiusWu,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        data: {
          heistFacilityId: scene.id,
          heistFacilityRole: 'counterweight_cradle',
          runtimeOwner: 'heistFacilities',
          sectorId: PQ019_HEIST_SECTOR_ID,
          homeSectorId: PQ019_HEIST_SECTOR_ID,
          name: 'Counterweight Cradle',
          worldDressing: true,
          factionId: scene.crew.factionId,
        },
      });
      created++;
    }
    if (!this._findOwnedEntity(scene.id, 'counterweight_pad')) {
      insertDressingRow(this.state, {
        type: 'fx',
        pos: this._global(scene.receiverPad.pos),
        radius: scene.receiverPad.radiusWu,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        data: {
          heistFacilityId: scene.id,
          heistFacilityRole: 'counterweight_pad',
          runtimeOwner: 'heistFacilities',
          sectorId: PQ019_HEIST_SECTOR_ID,
          homeSectorId: PQ019_HEIST_SECTOR_ID,
          name: 'Transfer Receiver Pad',
          worldDressing: true,
          factionId: scene.crew.factionId,
        },
      });
      created++;
    }

    // The door: a real static collider at its current pose — kinematic machinery, never teleported.
    let door = entityIsAlive(this.state, cw.doorEntityId)
      || this._findOwnedEntity(scene.id, 'counterweight_door');
    if (!door) {
      door = this._spawnCounterweightDoor(cw.doorPose01);
      created++;
    }
    cw.doorEntityId = door ? door.id : null;

    // The ballast block — the intended counterweight, staged beside the cradle.
    let ballast = entityIsAlive(this.state, cw.ballastEntityId)
      || this._findScenePayload(scene.ballast.stableId);
    if (!ballast) {
      const snap = this._suspendedBodyFor(scene.ballast.stableId);
      ballast = snap
        ? this._spawnSceneBodyAt(scene.ballast, snap)
        : this._spawnSceneBody(scene.ballast, scene.ballast.localPos);
      created++;
    }
    cw.ballastEntityId = ballast ? ballast.id : null;

    // The staged crates — respawn only what the manifest says should exist. A `lost` crate while
    // ARMED stays gone (the manifest shrank); while unarmed the yard has restocked.
    for (const def of scene.crates) {
      const row = cw.crates[def.stableId] || (cw.crates[def.stableId] = {
        entityId: null, state: 'staged', restTicks: 0, deliveredTick: null,
      });
      let crate = entityIsAlive(this.state, row.entityId)
        || this._findScenePayload(def.stableId);
      // While ARMED the manifest is the truth: `lost` and `delivered` crates stay gone — the
      // pad consumed one, the void took the other; neither respawns at the staging point.
      if (!crate && !(cw.sceneId && (row.state === 'lost' || row.state === 'delivered'))) {
        const snap = this._suspendedBodyFor(def.stableId);
        crate = snap
          ? this._spawnSceneBodyAt(def, snap)
          : this._spawnSceneBody(def, def.localPos);
        if (crate) {
          if (row.state === 'lost') row.state = 'staged';
          created++;
        }
      }
      row.entityId = crate ? crate.id : null;
      row.restTicks = 0;
    }

    // The yard tug — an ordinary hull parked at the yard. `persistenceOwner` keeps it out of the
    // world-record respawn path exactly like Berth Three's worker.
    let crew = entityIsAlive(this.state, cw.crewEntityId) || this._findSceneCrew();
    if (!crew) {
      const worldRecordId = stableRecordId(
        (Number(this.state.meta && this.state.meta.seed) >>> 0) || 1,
        PQ019_HEIST_SECTOR_ID,
        RECORD_KIND.NPC,
        scene.crew.worldRecordSlotId,
      );
      const record = this.state.world?.records?.byId?.[worldRecordId];
      if (!(record && record.alive !== false && record.outcome !== 'destroyed')) {
        const spec = makeShipEntitySpec(scene.crew.shipId, {
          team: 2,
          factionId: scene.crew.factionId,
          pos: this._global(scene.crew.parkLocalPos),
          ai: { archetype: 'passive', passive: true, spawnContext: 'counterweight_crew' },
        });
        spec.homeSectorId = PQ019_HEIST_SECTOR_ID;
        // Yard machinery, same pin class as the breakaway carrier and the gate door: without the
        // mission pin the activity classifier shelves the parked hull beyond the physics reach,
        // no Rapier body is ever created, and `_driveCarrier`'s written intent produces force on
        // a body that does not exist — the tug reads as frozen at its park point.
        spec.flags = { ...(spec.flags || {}), missionPinned: true };
        spec.data.worldRecordId = worldRecordId;
        spec.data.persistenceOwner = 'heistFacilities';
        spec.data.counterweightCrew = true;
        spec.data.missionPinned = true;
        // A yard tug tows crates on the same transport clamp the breakaway carrier uses — it
        // needs the carrier profile's aft `transport_clamp` socket or every clamp attempt is a
        // source_socket_unavailable refusal.
        spec.data.combatProfileId = 'combat_profile_heist_carrier';
        spec.data.sectorId = PQ019_HEIST_SECTOR_ID;
        spec.data.homeSectorId = PQ019_HEIST_SECTOR_ID;
        spec.data.trafficLabel = scene.crew.label;
        crew = this.helpers.spawnEntity(spec);
        if (crew) created++;
      }
    }
    cw.crewEntityId = crew ? crew.id : null;
    if (cw.crewPhase !== 'lost' && !crew) cw.crewPhase = 'lost';
    if (cw.suspendedBodies) cw.suspendedBodies = null;
    return created;
  },

  _suspendedBodyFor(stableId) {
    const snaps = this.state?.heistFacilities?.counterweight?.suspendedBodies;
    if (!Array.isArray(snaps)) return null;
    const snap = snaps.find((row) => row && row.stableId === stableId);
    return snap && snap.pos ? { x: snap.pos.x, z: snap.pos.z } : null;
  },

  _spawnCounterweightDoor(pose01) {
    const scene = COUNTERWEIGHT_SCENE;
    const mass = 1e9;
    const open = this._doorPose(pose01);
    return this.helpers.spawnEntity({
      type: 'fx',
      _noMesh: true,
      factionId: scene.crew.factionId,
      pos: this._global(open),
      rot: Math.PI / 2, // capsule length along local +X → spans Z, across the corridor
      radius: Math.max(scene.door.lengthWu * 0.5, scene.door.halfWidthWu),
      mass,
      hull: 1e9,
      hullMax: 1e9,
      collides: true,
      collisionMask: Masks.SHIP | Masks.PAYLOAD,
      ttl: Infinity,
      flags: { noInterp: true, invuln: true, missionPinned: true },
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: false,
        shape: 'capsule',
        radius: 1,
        mass,
        inertiaY: 1,
        ccd: false,
        material: 'station',
      },
      data: {
        proportions: { length: scene.door.lengthWu, halfWidth: scene.door.halfWidthWu },
        heistFacilityId: scene.id,
        heistFacilityRole: 'counterweight_door',
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        name: 'Yard Gate Door',
      },
    });
  },

  /** Door world pose for a 0..1 slide — closed across the corridor, open parked beside it. */
  _doorPose(pose01) {
    const d = COUNTERWEIGHT_SCENE.door;
    return {
      x: d.closedPos.x,
      z: d.closedPos.z - Math.max(0, Math.min(1, pose01)) * d.openOffsetWu,
    };
  },

  _spawnSceneBody(def, localPos) {
    const spec = this._sceneBodySpec(def);
    spec.pos = this._global(localPos);
    spec.vel = { x: 0, z: 0 };
    return this.helpers.spawnEntity(spec);
  },

  /** Same body at an exact WORLD position — suspended snapshots are already global. */
  _spawnSceneBodyAt(def, worldPos) {
    const spec = this._sceneBodySpec(def);
    spec.pos = { x: worldPos.x, z: worldPos.z };
    spec.vel = { x: 0, z: 0 };
    return this.helpers.spawnEntity(spec);
  },

  _findScenePayload(stableId) {
    const list = this.state.entityList || [];
    for (const entity of list) {
      if (entity?.alive !== false && entity.type === 'payload'
        && entity.data?.counterweightStableId === stableId
        && entity.data?.runtimeOwner === 'heistFacilities') {
        return entity;
      }
    }
    return null;
  },

  _findSceneCrew() {
    const list = this.state.entityList || [];
    for (const entity of list) {
      if (entity?.alive !== false && entity.data?.counterweightCrew === true) return entity;
    }
    return null;
  },

  /** Any qualifying body physically resting on the cradle — or null. Mass is the contract. */
  _cradleHeldBody(state) {
    const cradle = COUNTERWEIGHT_SCENE.cradle;
    const center = this._global(cradle.pos);
    const list = state.entityList || [];
    for (const entity of list) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      // Ships are never ballast — only loose heavy bodies count.
      if (entity.type !== 'payload' && entity.type !== 'wreck' && entity.type !== 'asteroid'
        && entity.type !== 'debris' && entity.type !== 'hulk') continue;
      const mass = Number(entity.physicsBody?.mass ?? entity.mass);
      if (!(mass >= cradle.minMass && mass <= cradle.maxMass)) continue;
      const dx = entity.pos.x - center.x;
      const dz = entity.pos.z - center.z;
      if (dx * dx + dz * dz > cradle.radiusWu * cradle.radiusWu) continue;
      const speed = Math.hypot(entity.vel?.x || 0, entity.vel?.z || 0);
      if (speed >= cradle.settleSpeedWu) continue;
      return entity;
    }
    return null;
  },

  _stepCounterweightScene(state) {
    const owned = state.heistFacilities;
    const cw = owned?.counterweight;
    if (!cw) return;
    const cradle = COUNTERWEIGHT_SCENE.cradle;
    const wasOpen = cw.gate === 'open';

    // 1. The gate answers actual configured conditions — the balance, never a trigger flag.
    const held = this._cradleHeldBody(state);
    if (held) {
      cw.gateHoldTicks = (cw.gateHoldTicks | 0) + 1;
      cw.gateReleaseTicks = 0;
    } else {
      cw.gateReleaseTicks = (cw.gateReleaseTicks | 0) + 1;
      cw.gateHoldTicks = 0;
    }
    if (cw.gateHoldTicks >= cradle.holdTicks) {
      if (cw.gate !== 'open') {
        cw.gate = 'open';
        this._emitCounterweightEvent(state, { event: 'gate_open', holderEntityId: held?.id ?? null });
        this._saySceneCue({
          cueId: 'pq019a:counterweight:gate_open',
          text: 'Yard gate open — the balance is holding',
        });
        // The first committed opening under an armed contract brings the yard's one bounded
        // interruption — the choice between the mechanism and the output, made physical.
        if (cw.sceneId && !cw.pressureSpawned) {
          this._spawnCounterweightPressure(state, cw);
        }
      }
    } else if (cw.gateHoldTicks > 0) {
      if (!wasOpen) cw.gate = 'opening';
    } else if (wasOpen || cw.gate === 'opening' || cw.gate === 'closing') {
      if (cw.gateReleaseTicks >= cradle.releaseTicks) {
        // 'closing' only ever comes FROM 'open' — the committed-open close announces once on the
        // transition into 'closed', whatever tick the slide actually finished on.
        const wasCommittedOpen = wasOpen || cw.gate === 'closing';
        cw.gate = 'closed';
        if (wasCommittedOpen) {
          this._emitCounterweightEvent(state, { event: 'gate_closed' });
          this._saySceneCue({
            cueId: 'pq019a:counterweight:gate_closed',
            text: 'Yard gate shut — the balance left the cradle',
          });
        }
      } else if (wasOpen) {
        cw.gate = 'closing';
      }
    }

    // 2. The door is kinematic steel — its pose follows the balance, never teleports.
    const prevDoorPose = cw.doorPose01;
    const target = cw.gate === 'open' || cw.gate === 'opening' ? 1 : 0;
    const step = 1 / Math.max(1, COUNTERWEIGHT_SCENE.door.travelTicks);
    if (cw.doorPose01 < target) cw.doorPose01 = Math.min(target, cw.doorPose01 + step);
    else if (cw.doorPose01 > target) cw.doorPose01 = Math.max(target, cw.doorPose01 - step);
    const door = entityIsAlive(state, cw.doorEntityId);
    if (door) {
      const pose = this._doorPose(cw.doorPose01);
      const world = this._global(pose);
      door.pos.x = world.x;
      door.pos.z = world.z;
      if (door.physicsBody) { door.dirty = true; }
      if (cw.doorPose01 !== prevDoorPose) {
        // The collider is a fixed SG-02 body: entity.pos writes alone never reach it — the
        // static layer only re-evaluates records on physicsStaticVersion change (entity
        // add/remove). Bumping the index on each slide tick is the sanctioned invalidation
        // (massSeed does the same for its anchor rebuild): the next sync sees the moved pose
        // and translates the steel. Without it the collider stays at its spawn pose — an
        // invisible closed wall the tug presses into forever.
        const index = state.entityIndex;
        if (index && Number.isFinite(index.physicsStaticVersion)) index.physicsStaticVersion++;
      }
    }

    // 3. The crew works only for an armed contract, and only while it exists.
    if (!cw.sceneId) return;
    this._stepGateCrew(state, cw);

    // 4. A delivery is a crate physically at rest inside the pad — whoever carried it. The pad is
    // a working receiver, not a painted circle: a body crossing its footprint below the arrest
    // speed is damped to a standstill by the pad's own machinery (a crate slung through faster
    // transits honest and untouched). A crate the tug just let go ('released') counts the same as
    // any loose body; one that rolls back out unfinished is just a staged crate again.
    const pad = COUNTERWEIGHT_SCENE.receiverPad;
    const padCenter = this._global(pad.pos);
    const arrestEvidence = this._padArrestEvidence || (this._padArrestEvidence = {
      provenance: 'counterweight:receiverPad', tick: 0, kind: 'receiver_brake',
    });
    arrestEvidence.tick = state.tick | 0;
    for (const [stableId, row] of Object.entries(cw.crates)) {
      if (row.state !== 'staged' && row.state !== 'carried' && row.state !== 'released') continue;
      const crate = entityIsAlive(state, row.entityId);
      if (!crate) continue;
      const dx = crate.pos.x - padCenter.x;
      const dz = crate.pos.z - padCenter.z;
      const inside = dx * dx + dz * dz <= pad.radiusWu * pad.radiusWu;
      const vx = Number(crate.vel?.x) || 0;
      const vz = Number(crate.vel?.z) || 0;
      const speed = Math.hypot(vx, vz);
      if (inside && speed <= pad.arrestSpeedWu && speed > pad.settleSpeedWu) {
        // Arrest: the pad bleeds the crossing body's momentum — impulse opposing velocity, strong
        // enough to win against a taut clamp line, so a crate towed in under power is caught off
        // the line instead of orbiting its tug across the receiver forever.
        const mass = Math.max(1, Number(crate.physicsBody?.mass ?? crate.mass) || 1);
        queuePhysicsImpulse(crate, {
          x: -vx * mass * 0.8, y: 0, z: -vz * mass * 0.8,
        }, arrestEvidence);
      }
      if (inside && speed < pad.settleSpeedWu) {
        row.restTicks = (row.restTicks | 0) + 1;
        if (row.restTicks >= pad.settleTicks) {
          row.state = 'delivered';
          row.deliveredTick = state.tick | 0;
          cw.legsDone = (cw.legsDone | 0) + 1;
          // Custody passes to the pad: a crate still on the tug's clamp is taken off the line.
          if (cw.crewTargetId === stableId && cw.crewClampId != null) {
            const attachments = this._combatAttachments();
            const crew = entityIsAlive(state, cw.crewEntityId);
            if (attachments && crew) {
              try { attachments.cut(cw.crewClampId, crew.id, 'receiver_custody'); }
              catch { /* the joint may already be gone */ }
            }
            cw.crewClampId = null;
            cw.crewTargetId = null;
            cw.carryStandoff = null;
            if (cw.crewPhase !== 'lost') cw.crewPhase = 'parked';
          }
          this._emitCounterweightEvent(state, {
            event: 'crate_delivered',
            stableId,
            legsDone: cw.legsDone,
          });
        }
      } else {
        row.restTicks = 0;
        if (row.state === 'released' && !inside) row.state = 'staged';
      }
    }
  },

  _emitCounterweightEvent(state, payload) {
    const cw = state.heistFacilities?.counterweight;
    this.bus.emit('heist:counterweight', Object.freeze({
      sceneId: cw?.sceneId || null,
      tick: state.tick | 0,
      source: 'heistFacilities',
      ...payload,
    }));
  },

  /**
   * The yard's one bounded interruption: `lightCount` light raiders inbound on the corridor while
   * the gate is held. Positions are derived from the authored corridor ends — deterministic, no
   * rng — so the same commitment always draws the same answer.
   */
  _spawnCounterweightPressure(state, cw) {
    const pressure = COUNTERWEIGHT_SCENE.pressure;
    cw.pressureSpawned = true;
    const spawned = [];
    const origins = [COUNTERWEIGHT_SCENE.corridor.stagePos, COUNTERWEIGHT_SCENE.corridor.receiverPos];
    for (let i = 0; i < (pressure.lightCount | 0); i++) {
      const origin = this._global(origins[i % origins.length]);
      // Inbound along the corridor: spawn one body-length outside the field and leave the run to
      // the raider's own AI.
      const inward = i % origins.length === 0 ? 1 : -1;
      const pos = { x: origin.x - inward * pressure.spawnDistanceWu, z: origin.z };
      const enemyTypeId = pressure.lightPool[i % pressure.lightPool.length];
      const spec = makeEnemySpawnSpec(enemyTypeId, pressure.lightLevel, pos, {
        spawnContext: 'counterweight_pressure',
      });
      if (!spec) continue;
      spec.homeSectorId = PQ019_HEIST_SECTOR_ID;
      spec.data = Object.assign(spec.data || {}, {
        counterweightPressure: true,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
        spawnMotive: pressure.motive,
      });
      const entity = this.helpers.spawnEntity(spec);
      if (entity) spawned.push(entity.id);
    }
    this._emitCounterweightEvent(state, {
      event: 'pressure_inbound',
      count: spawned.length,
      entityIds: spawned,
    });
    this._saySceneCue({
      cueId: `pq019a:counterweight:pressure:${cw.sceneId}`,
      text: 'Raiders inbound on the yard — the balance or the crates, you can only cover one',
    });
    return spawned;
  },

  /**
   * The yard tug's one working loop: fetch a staged crate, carry it through the open gate,
   * release at the pad, come back. Carries HOLD where they physically are while the gate is not
   * open — the clamped crate is real mass in the corridor, not a paused animation.
   */
  _stepGateCrew(state, cw) {
    const scene = COUNTERWEIGHT_SCENE;
    const crew = entityIsAlive(state, cw.crewEntityId);
    if (!crew || crew.data?.counterweightCrew !== true) {
      if (cw.crewPhase !== 'lost') {
        cw.crewPhase = 'lost';
        this._emitCounterweightEvent(state, { event: 'crew_lost' });
      }
      return;
    }
    const attachments = this._combatAttachments();
    const staged = () => Object.entries(cw.crates).find(
      ([, row]) => row.state === 'staged' && entityIsAlive(state, row.entityId),
    );

    if (cw.crewPhase === 'lost' || cw.crewPhase === 'parked') {
      const next = staged();
      if (next && cw.gate === 'open' && attachments && !this._clampBankOut(state, crew)) {
        cw.crewPhase = 'fetch';
        cw.crewTargetId = next[0];
      } else {
        // Idle or blocked — sit at the park point.
        const park = this._global(scene.crew.parkLocalPos);
        this._driveCarrier(crew, park, scene.crew.cruiseSpeedWu, {
          reachWu: 8,
          brakeWithinWu: 12,
        });
        return;
      }
    }

    const target = cw.crewTargetId ? cw.crates[cw.crewTargetId] : null;
    const crate = target ? entityIsAlive(state, target.entityId) : null;

    if (cw.crewPhase === 'fetch') {
      if (!crate) {
        // The crate it was fetching is gone — pick another or stand down.
        const next = staged();
        if (next) { cw.crewTargetId = next[0]; return; }
        cw.crewPhase = 'parked';
        cw.crewTargetId = null;
        return;
      }
      const dist = Math.hypot(crew.pos.x - crate.pos.x, crew.pos.z - crate.pos.z);
      const clampRing = crew.radius + crate.radius + scene.crew.clampStandoffWu + 4;
      if (dist <= clampRing) {
        if (this._clampBankOut(state, crew)) {
          cw.crewPhase = 'parked';
          cw.crewTargetId = null;
          return;
        }
        const result = attachments && attachments.create({
          defId: 'attachment_transport_clamp',
          ownerId: crew.id,
          targetId: crate.id,
        });
        if (result && result.ok) {
          cw.crewClampId = result.attachment.id;
          target.state = 'carried';
          cw.crewPhase = 'carry';
          cw.carryStandoff = null; // re-latch the leg's standoff off the load's fresh position
          return;
        }
        if (result && result.reason !== 'physics_port_unavailable'
          && result.reason !== 'physics_create_rejected') {
          // A real refusal (no socket, dead endpoint) — this crate cannot ride the tug.
          cw.crewPhase = 'parked';
          cw.crewTargetId = null;
          return;
        }
      }
      this._driveCarrier(crew, crate.pos, scene.crew.cruiseSpeedWu, {
        reachWu: scene.crew.clampStandoffWu,
        // Braking is ring-INCLUSIVE: the clamp check above runs first every tick, so a hull that
        // crosses the ring at speed still lands the joint; a transient physics-port refusal just
        // holds station inside the ring until the body records exist.
        brakeWithinWu: clampRing,
      });
      return;
    }

    if (cw.crewPhase === 'carry' || cw.crewPhase === 'hold' || cw.crewPhase === 'deliver') {
      // The clamp is the custody: a cut line means the crate is loose wherever physics left it —
      // unless the yard just released it at the pad, where 'released' belongs to the pad's own
      // rest detection now. Without that distinction the cut's very next tick read as a dropped
      // carry and the tug re-clamped its own delivery forever.
      const clamp = cw.crewClampId != null && attachments
        ? attachments.get(cw.crewClampId) : null;
      if (!clamp || clamp.state !== 'active') {
        if (target && crate && target.state === 'carried') target.state = 'staged';
        cw.crewClampId = null;
        cw.crewTargetId = null;
        cw.carryStandoff = null;
        cw.crewPhase = 'parked';
        return;
      }
      if (cw.crewPhase === 'deliver') {
        // Released at the pad: the crate's own rest detection finishes the leg.
        if (!crate || (target.state !== 'carried' && target.state !== 'released')) {
          cw.crewPhase = 'parked';
          cw.crewTargetId = null;
          cw.crewClampId = null;
          cw.carryStandoff = null;
        }
        return;
      }
      if (crate) {
        // The cage's own dampers: a bolted transport clamp is not a free pivot — its shunt
        // bleeds the load's swing relative to the hull and hands the momentum to the tug as
        // reaction. A radial spring alone conserves the pair's angular momentum: once slung,
        // tug and crate orbit their barycenter with the helm's alignment gate shut forever.
        const mCrate = Math.max(1, Number(crate.physicsBody?.mass ?? crate.mass) || 1);
        const mTug = Math.max(1, Number(crew.physicsBody?.mass ?? crew.mass) || 1);
        const mu = (mCrate * mTug) / (mCrate + mTug);
        const rvx = (Number(crate.vel?.x) || 0) - (Number(crew.vel?.x) || 0);
        const rvz = (Number(crate.vel?.z) || 0) - (Number(crew.vel?.z) || 0);
        if (rvx * rvx + rvz * rvz > 0.25) {
          const dampEvidence = this._clampDampEvidence || (this._clampDampEvidence = {
            provenance: 'counterweight:clampDamper', tick: 0, kind: 'receiver_brake',
          });
          dampEvidence.tick = state.tick | 0;
          const jx = -rvx * mu * 0.1;
          const jz = -rvz * mu * 0.1;
          queuePhysicsImpulse(crate, { x: jx, y: 0, z: jz }, dampEvidence);
          queuePhysicsImpulse(crew, { x: -jx, y: 0, z: -jz }, dampEvidence);
        }
      }
      if (cw.gate !== 'open') {
        // HOLD — the carry parks clear of the door plane, off whichever side of the steel the
        // hull is already on. Braking in place inside the door's footprint lets the sliding
        // collider shove or pin the hull; the west standoff also keeps the towed load's swing
        // out of the gate. A hull already through reverses only for the load it trails.
        cw.crewPhase = 'hold';
        const doorWorld = this._global(this._doorPose(0));
        const towLine = (Number(crew.radius) || 0) + (Number(crate && crate.radius) || 0)
          + scene.crew.clampStandoffWu + 6;
        const east = crew.pos.x > doorWorld.x;
        const holdPos = {
          x: doorWorld.x + (east ? 1 : -1) * (scene.door.halfWidthWu + towLine + 24),
          z: this._global(scene.receiverPad.pos).z,
        };
        this._driveCarrier(crew, holdPos, scene.crew.towSpeedWu ?? scene.crew.cruiseSpeedWu, {
          reachWu: 10,
          brakeWithinWu: 16,
          speedServo: true,
        });
        return;
      }
      cw.crewPhase = 'carry';
      const padPos = this._global(scene.receiverPad.pos);
      // The load owns the delivery: the crate trails the nose a body-length back, so its own
      // distance to the receiver is what matters — a tug that parked its own hull inside the ring
      // used to drop its trailer just outside it.
      const crateDist = crate
        ? Math.hypot(crate.pos.x - padPos.x, crate.pos.z - padPos.z)
        : Infinity;
      const releaseRing = scene.receiverPad.radiusWu - scene.crew.deliverStandoffWu;
      const crateSpeed = crate
        ? Math.hypot(crate.vel?.x || 0, crate.vel?.z || 0)
        : Infinity;
      // Let go only where the pad can keep it: inside the delivery ring AND settled below its own
      // rest speed. A cut at carry pace tosses a 120 t crate straight through the receiver and the
      // "delivered" leg becomes a loose body drifting out the far side.
      if (crate && crateDist <= releaseRing && crateSpeed <= scene.receiverPad.settleSpeedWu) {
        attachments.cut(clamp.id, crew.id, 'transport_release');
        if (target) target.state = 'released';
        cw.crewClampId = null;
        cw.crewPhase = 'deliver';
        return;
      }
      if (crate && crateDist <= scene.receiverPad.radiusWu) {
        // The load is over the receiver — kill the tow now. Holding power drags it through the
        // pad at carry pace; braking lets its own momentum carry it deep into the arrest field
        // while the hull comes back to meet it. If it skids wide and leaves the ring, the next
        // tick's carry plan takes over and brings it around again.
        const data = crew.data || (crew.data = {});
        const intent = data.intent || (data.intent = {});
        intent.moveX = 0;
        intent.moveZ = 0;
        intent.boost = false;
        intent.brake = true;
        intent.fire = false;
        return;
      }
      const crateRelX = crate ? crate.pos.x - crew.pos.x : 0;
      const crateRelZ = crate ? crate.pos.z - crew.pos.z : 0;
      const crateRel = Math.hypot(crateRelX, crateRelZ);
      const lineLen = (Number(crew.radius) || 0) + (Number(crate && crate.radius) || 0)
        + scene.crew.clampStandoffWu + 6;
      const toPadX = padPos.x - crew.pos.x;
      const toPadZ = padPos.z - crew.pos.z;
      const toPadD = Math.hypot(toPadX, toPadZ) || 1;
      const planSpeed = scene.crew.towSpeedWu ?? scene.crew.cruiseSpeedWu;
      const crewSpeed = Math.hypot(Number(crew.vel?.x) || 0, Number(crew.vel?.z) || 0);
      if (crateSpeed > planSpeed * 1.6 || crewSpeed > planSpeed * 1.6) {
        // Slung past plan pace: the line is storing energy the helm cannot spend. Bleed the swing
        // before adding more — thrust fed into an over-speed tether assembly is a slingshot pump,
        // not a tow.
        const data = crew.data || (crew.data = {});
        const intent = data.intent || (data.intent = {});
        intent.moveX = 0;
        intent.moveZ = 0;
        intent.boost = false;
        intent.brake = true;
        intent.fire = false;
        return;
      }
      if (crate && crateRel > lineLen * 0.6) {
        // Tow geometry: a load ahead of or abeam the bow turns thrust into a mutual orbit — the
        // tug circles its own anchor and the crate never moves. While the line leads, swing to
        // the load's far side first so the crate lies behind the bow on the pad line.
        const lead = (crateRelX * toPadX + crateRelZ * toPadZ) / (crateRel * toPadD);
        if (lead > 0.15) {
          const px = padPos.x - crate.pos.x;
          const pz = padPos.z - crate.pos.z;
          const pd = Math.hypot(px, pz) || 1;
          const lineUp = {
            x: crate.pos.x + (px / pd) * (lineLen + 8),
            z: crate.pos.z + (pz / pd) * (lineLen + 8),
          };
          this._driveCarrier(crew, lineUp, scene.crew.cruiseSpeedWu, {
            reachWu: 12,
            brakeWithinWu: 16,
            speedServo: true,
          });
          return;
        }
      }
      // The carry target stands PAST the receiver on the far side from where the load came on —
      // LATCHED once per leg. The tow drags the crate through the pad's circle, where the
      // receiver's own arrest machinery catches it off the line. Recomputing the aim off the live
      // crate every tick made the target outrun the tow and spiralled the assembly out.
      if (!cw.carryStandoff || cw.carryStandoff.stableId !== cw.crewTargetId) {
        const bx = padPos.x - crate.pos.x;
        const bz = padPos.z - crate.pos.z;
        const bd = Math.hypot(bx, bz) || 1;
        cw.carryStandoff = {
          stableId: cw.crewTargetId,
          x: padPos.x + (bx / bd) * (scene.receiverPad.radiusWu + 30),
          z: padPos.z + (bz / bd) * (scene.receiverPad.radiusWu + 30),
        };
      }
      const towMass = Math.max(1,
        (Number(crate && (crate.physicsBody?.mass ?? crate.mass)) || 0)
        + (Number(crew.physicsBody?.mass ?? crew.mass) || 1));
      this._driveCarrier(crew, cw.carryStandoff, planSpeed, {
        reachWu: 14,
        brakeWithinWu: 20,
        speedServo: true,
        decelScale: (Number(crew.physicsBody?.mass ?? crew.mass) || 1) / towMass,
      });
      return;
    }
  },

  /**
   * Arm the yard for one contract. One scene at a time — the machinery is singular. Idempotent
   * per sceneId so a mission re-requesting its own arming gets its own receipt back.
   */
  requestCounterweightScene(request = {}) {
    const sceneId = cleanScheduleId(request.sceneId);
    const owned = this.state.heistFacilities;
    const cw = owned?.counterweight;
    if (!sceneId || !cw) {
      const denied = Object.freeze({ accepted: false, reason: 'invalid_scene', sceneId, source: 'heistFacilities' });
      this.bus.emit('heist:counterweightSceneReceipt', denied);
      return denied;
    }
    if (cw.sceneId && cw.sceneId !== sceneId) {
      const denied = Object.freeze({
        accepted: false, reason: 'active_scene', sceneId, activeSceneId: cw.sceneId,
        source: 'heistFacilities',
      });
      this.bus.emit('heist:counterweightSceneReceipt', denied);
      return denied;
    }
    if (cw.sceneId === sceneId) {
      const receipt = Object.freeze({ accepted: true, sceneId, resumed: true, source: 'heistFacilities' });
      this.bus.emit('heist:counterweightSceneReceipt', receipt);
      return receipt;
    }
    cw.sceneId = sceneId;
    cw.armedTick = this.state.tick | 0;
    cw.legsDone = 0;
    cw.pressureSpawned = false;
    // RESUME: the mission's durable manifest ledger re-marks the scene — a crate already paid
    // stays delivered (never paid twice), a crate already lost stays lost (the manifest does not
    // refill across a boundary or a reload).
    const resume = request.resume && typeof request.resume === 'object' ? request.resume : null;
    if (resume) {
      const delivered = new Set(Array.isArray(resume.deliveredStableIds) ? resume.deliveredStableIds : []);
      const lost = new Set(Array.isArray(resume.lostStableIds) ? resume.lostStableIds : []);
      for (const [stableId, row] of Object.entries(cw.crates)) {
        if (delivered.has(stableId)) row.state = 'delivered';
        else if (lost.has(stableId)) row.state = 'lost';
      }
      cw.legsDone = Math.max(0, Number(resume.legsDone) | 0);
    }
    this._emitCounterweightEvent(this.state, { event: 'scene_armed' });
    const receipt = Object.freeze({ accepted: true, sceneId, source: 'heistFacilities' });
    this.bus.emit('heist:counterweightSceneReceipt', receipt);
    return receipt;
  },

  /**
   * Disarm the yard. The machinery stays; the work order ends — crates keep their physical
   * positions ("lost output remains physical") and the tug returns to its park point.
   */
  releaseCounterweightScene(request = {}) {
    const sceneId = cleanScheduleId(request.sceneId);
    const cw = this.state.heistFacilities?.counterweight;
    if (!cw || (sceneId && cw.sceneId !== sceneId)) {
      return { released: false, reason: cw ? 'scene_mismatch' : 'no_scene' };
    }
    const releasedId = cw.sceneId;
    const attachments = this._combatAttachments();
    const crew = entityIsAlive(this.state, cw.crewEntityId);
    if (cw.crewClampId != null && attachments && crew) {
      try { attachments.cut(cw.crewClampId, crew.id, 'scene_release'); } catch { /* clamp may be gone */ }
    }
    cw.crewClampId = null;
    cw.crewTargetId = null;
    cw.carryStandoff = null;
    if (cw.crewPhase !== 'lost') cw.crewPhase = 'parked';
    for (const row of Object.values(cw.crates)) {
      if (row.state === 'carried') row.state = 'staged';
    }
    cw.sceneId = null;
    cw.armedTick = null;
    this._emitCounterweightEvent(this.state, { event: 'scene_released', releasedSceneId: releasedId });
    return { released: true, sceneId: releasedId };
  },

  /** Plain snapshot for the mission owner — positions are durable truth, ids are not. */
  counterweightSceneStatus() {
    const state = this.state;
    const cw = state?.heistFacilities?.counterweight;
    if (!cw) return null;
    const crates = {};
    for (const [stableId, row] of Object.entries(cw.crates)) {
      const crate = entityIsAlive(state, row.entityId);
      crates[stableId] = {
        state: row.state,
        pos: crate ? { x: crate.pos.x, z: crate.pos.z } : null,
      };
    }
    return {
      sceneId: cw.sceneId,
      armedTick: cw.armedTick,
      gate: cw.gate,
      doorPose01: cw.doorPose01,
      legsDone: cw.legsDone,
      crewPhase: cw.crewPhase,
      crates,
    };
  },

  /** Durable body snapshots of every loose scene body — the suspension contract. */
  snapshotCounterweightBodies() {
    const state = this.state;
    const cw = state?.heistFacilities?.counterweight;
    if (!cw || !cw.sceneId) return null;
    const snap = (entity, stableId, role) => (entity ? {
      stableId, role,
      pos: { x: entity.pos.x, z: entity.pos.z },
      vel: { x: entity.vel?.x || 0, z: entity.vel?.z || 0 },
      rot: Number.isFinite(entity.rot) ? entity.rot : 0,
      angVel: Number.isFinite(entity.angVel) ? entity.angVel : 0,
      hull: Number.isFinite(entity.hull) ? entity.hull : null,
      hullMax: entity.hullMax,
      state: role === 'crate' ? cw.crates[stableId]?.state : undefined,
    } : null);
    const out = [];
    const ballast = entityIsAlive(state, cw.ballastEntityId) || this._findScenePayload(COUNTERWEIGHT_SCENE.ballast.stableId);
    const b = snap(ballast, COUNTERWEIGHT_SCENE.ballast.stableId, 'ballast');
    if (b) out.push(b);
    for (const [stableId, row] of Object.entries(cw.crates)) {
      const crate = entityIsAlive(state, row.entityId) || this._findScenePayload(stableId);
      const s = snap(crate, stableId, 'crate');
      if (s) out.push(s);
    }
    return out;
  },

  /**
   * Re-embody suspended scene bodies after a sector boundary or a reload. Relinks the durable
   * rows by stableId — the same bodies, never duplicates of an already-carried manifest.
   */
  respawnCounterweightBodies(snapshots = []) {
    const state = this.state;
    const cw = state?.heistFacilities?.counterweight;
    if (!cw) return { respawned: 0 };
    const byStable = new Map();
    for (const def of [COUNTERWEIGHT_SCENE.ballast, ...COUNTERWEIGHT_SCENE.crates]) {
      byStable.set(def.stableId, def);
    }
    let respawned = 0;
    for (const snap of snapshots) {
      if (!snap || !snap.stableId || !snap.pos) continue;
      const def = byStable.get(snap.stableId);
      if (!def) continue;
      const existing = this._findScenePayload(snap.stableId);
      if (existing) continue; // never double a body that survived
      // Snapshots are already world positions — no sector-local re-projection.
      const entity = this.helpers.spawnEntity({
        ...this._sceneBodySpec(def),
        pos: { x: snap.pos.x, z: snap.pos.z },
        vel: { x: Number(snap.vel?.x) || 0, z: Number(snap.vel?.z) || 0 },
        rot: Number.isFinite(snap.rot) ? snap.rot : 0,
        hull: Number.isFinite(snap.hull) ? snap.hull : def.hull,
        hullMax: Number.isFinite(snap.hullMax) ? snap.hullMax : def.hull,
      });
      if (entity) {
        if (Number.isFinite(snap.angVel)) entity.angVel = snap.angVel;
        respawned++;
      }
    }
    // Relink every live body to its row.
    cw.ballastEntityId = (this._findScenePayload(COUNTERWEIGHT_SCENE.ballast.stableId) || {}).id ?? null;
    for (const def of COUNTERWEIGHT_SCENE.crates) {
      const row = cw.crates[def.stableId];
      const body = this._findScenePayload(def.stableId);
      if (row && body) row.entityId = body.id;
    }
    cw.suspendedBodies = null;
    return { respawned };
  },

  _sceneBodySpec(def) {
    return {
      type: 'payload',
      factionId: COUNTERWEIGHT_SCENE.crew.factionId,
      ownerId: `facility:${COUNTERWEIGHT_SCENE.id}`,
      team: 2,
      radius: def.radius,
      mass: def.mass,
      hull: def.hull,
      hullMax: def.hull,
      collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
      ttl: Infinity,
      flags: { missionPinned: true, persistent: true },
      homeSectorId: PQ019_HEIST_SECTOR_ID,
      physicsBody: {
        dynamic: true,
        radius: def.radius,
        mass: def.mass,
        inertiaY: 0.5 * def.mass * def.radius * def.radius,
        ccd: true,
        material: 'payload',
      },
      data: {
        heistFacilityRole: 'counterweight_body',
        counterweightStableId: def.stableId,
        counterweightRole: def.stableId === COUNTERWEIGHT_SCENE.ballast.stableId ? 'ballast' : 'crate',
        authoredPayloadAssetId: def.authoredPayloadAssetId,
        legalOwnerFactionId: COUNTERWEIGHT_SCENE.crew.factionId,
        ownerId: `facility:${COUNTERWEIGHT_SCENE.id}`,
        name: def.name,
        missionPinned: true,
        runtimeOwner: 'heistFacilities',
        sectorId: PQ019_HEIST_SECTOR_ID,
        homeSectorId: PQ019_HEIST_SECTOR_ID,
        transientSector: true,
      },
    };
  },

  /**
   * After a reload: bodies restored by the save owner (persistent flags) are re-adopted by the
   * armed record; the scene re-links by stableId rather than by live entity id.
   */
  adoptCounterweightScene(request = {}) {
    const sceneId = cleanScheduleId(request.sceneId);
    const cw = this.state?.heistFacilities?.counterweight;
    if (!sceneId || !cw) return { adopted: false, reason: 'no_scene' };
    if (cw.sceneId && cw.sceneId !== sceneId) return { adopted: false, reason: 'active_scene' };
    cw.sceneId = sceneId;
    cw.ballastEntityId = (this._findScenePayload(COUNTERWEIGHT_SCENE.ballast.stableId) || {}).id ?? null;
    let found = 0;
    for (const def of COUNTERWEIGHT_SCENE.crates) {
      const row = cw.crates[def.stableId] || (cw.crates[def.stableId] = {
        entityId: null, state: 'staged', restTicks: 0, deliveredTick: null,
      });
      const body = this._findScenePayload(def.stableId);
      if (body) { row.entityId = body.id; found++; }
      row.restTicks = 0;
    }
    return { adopted: true, sceneId, bodiesRelinked: found };
  },

  /**
   * Terminal notification from the mission owner: a fenced capsule run costs the launcher its
   * next routine transfers' escort coverage — a durable consequence the next schedules show.
   */
  noteScheduleOutcome(request = {}) {
    const owned = this.state?.heistFacilities;
    if (!owned) return false;
    const outcome = cleanScheduleId(request.outcome);
    const record = this._facilityRecord('heist_launcher');
    if (!Array.isArray(record.losses)) record.losses = [];
    record.losses.push({
      scheduleId: cleanScheduleId(request.scheduleId) || null,
      outcome,
      unitsLost: Number.isFinite(request.unitsLost) ? request.unitsLost : null,
      atTick: this.state.tick | 0,
    });
    while (record.losses.length > 8) record.losses.shift();
    if (outcome === 'fenced_success' && owned.routine) {
      owned.routine.escortsRemaining = (owned.routine.escortsRemaining | 0)
        + PQ019_ROUTINE.escortAfterLosses;
    }
    return true;
  },

  // ── SF-147: the monitored lane ──────────────────────────────────────────────────────────────
  //
  // The posts are permanent lawful scenery on the escape route. They emit a scan receipt for any
  // heist payload body that crosses their field — what a scan MEANS (a re-raised theft, fresh
  // pursuit) is the mission's reading of provenance, never the post's.

  _materializeMonitors() {
    const owned = this.state.heistFacilities;
    if (!owned.monitorPosts || typeof owned.monitorPosts !== 'object') owned.monitorPosts = {};
    let created = 0;
    for (const post of HOT_RETURN_MONITORS.posts) {
      const row = owned.monitorPosts[post.id] || (owned.monitorPosts[post.id] = { entityId: null });
      let entity = entityIsAlive(this.state, row.entityId)
        || this._findMonitorPost(post.id);
      if (!entity) {
        entity = insertDressingRow(this.state, {
          type: 'fx',
          pos: this._global(post.localPos),
          radius: 30,
          homeSectorId: PQ019_HEIST_SECTOR_ID,
          data: {
            heistFacilityId: 'hot_return_monitor',
            heistMonitorId: post.id,
            heistFacilityRole: 'monitor_post',
            runtimeOwner: 'heistFacilities',
            sectorId: PQ019_HEIST_SECTOR_ID,
            homeSectorId: PQ019_HEIST_SECTOR_ID,
            name: post.name,
            worldDressing: true,
            factionId: post.factionId,
          },
        });
        created++;
      }
      row.entityId = entity ? entity.id : null;
    }
    return created;
  },

  _findMonitorPost(monitorId) {
    let found = null;
    forEachDressingRow(this.state, (row) => {
      if (found) return;
      if (row.data?.heistMonitorId === monitorId) found = row;
    });
    return found;
  },

  _stepMonitors(state) {
    const owned = state.heistFacilities;
    const posts = owned?.monitorPosts;
    if (!posts) return;
    const contacts = owned.monitorContacts || (owned.monitorContacts = {});
    const radius = HOT_RETURN_MONITORS.radiusWu;
    const radius2 = radius * radius;
    // Current crossings, computed fresh each tick — deterministic, no drift.
    const live = {};
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.type !== 'payload' || !entity.pos) continue;
      const data = entity.data || {};
      // Only heist payloads and their shed units are interesting to a theft monitor.
      if (!data.heistPayloadStableId && !data.heistUnitOf) continue;
      for (const post of HOT_RETURN_MONITORS.posts) {
        const world = this._global(post.localPos);
        const dx = entity.pos.x - world.x;
        const dz = entity.pos.z - world.z;
        if (dx * dx + dz * dz > radius2) continue;
        const key = `${post.id}:${entity.id}`;
        live[key] = true;
        if (contacts[key]) continue;
        contacts[key] = true;
        const hot = owned.monitorHot || (owned.monitorHot = {});
        if (!hot[post.id]) {
          hot[post.id] = true;
          this._saySceneCue({
            cueId: `pq019a:monitor:${post.id}`,
            text: `${post.name} has the shipment`,
          });
        }
        this.bus.emit('heist:monitorScan', Object.freeze({
          monitorId: post.id,
          monitorName: post.name,
          scheduleId: data.launchScheduleId || null,
          payloadStableId: data.heistUnitOf || data.heistPayloadStableId,
          payloadEntityId: entity.id,
          pos: Object.freeze({ x: stableNumber(entity.pos.x), z: stableNumber(entity.pos.z) }),
          tick: state.tick | 0,
          source: 'heistFacilities',
        }));
      }
    }
    // Re-arm: a body that left the field scans again on its next pass.
    const postsStillHot = {};
    for (const key of Object.keys(live)) postsStillHot[key.split(':')[0]] = true;
    for (const key of Object.keys(contacts)) {
      if (!live[key]) delete contacts[key];
    }
    const hot = owned.monitorHot;
    if (hot) {
      for (const id of Object.keys(hot)) {
        if (!postsStillHot[id]) delete hot[id];
      }
    }
  },

  /**
   * One spoken line for scene machinery (routine throws, refusals, observations, gate events).
   * Same one-voice seam as `_sayLaunchCue` on the objective channel, under the scene's own id.
   */
  _saySceneCue({ cueId, text }) {
    if (this.state?.mode !== 'flight') return null;
    const receipt = Object.freeze({
      cueId,
      text,
      voiceId: 'pq019a:scene',
      channel: PQ019_LAUNCH_CUE_CHANNEL,
      source: 'heistFacilities',
    });
    const say = this.helpers?.voice?.say;
    if (typeof say === 'function') {
      say({ channel: PQ019_LAUNCH_CUE_CHANNEL, id: 'pq019a:scene', text, kind: 'info', ttl: LAUNCH_CUE_TTL_S });
    }
    this.bus.emit('heist:launchCue', receipt);
    return receipt;
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
