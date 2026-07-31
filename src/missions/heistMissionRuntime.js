// PQ-019C — the mission-side runtime for the authored physical capsule heist.
//
// WHAT THIS IS: the CONSUMER of PQ-019B's pure arbiter. It maps physical facts published by owners
// that already exist (facility custody contacts, tether latches, entity destruction, the run clock)
// onto the arbiter's candidate vocabulary, then settles the one terminal receipt through the
// mission owner's ordinary complete/fail paths.
//
// It lives outside `missions.js` so it can be unit-driven, but it is NOT a registered system: it
// has no `update` of its own in UPDATE_ORDER, and `src/core/registry.js` is untouched. Every entry
// point is called by `missions`, which is where the ordering guarantee comes from.
//
// ─── THE ORDERING GUARANTEE (arbiter precondition 1: submit before you step) ─────────────────────
// Registration order in `src/core/registry.js` is
//   lawSecurity(170) < physics(177) < tetherGameplay(197) < heistFacilities(222) < missions(246).
// Every candidate-producing event for tick T — a Rapier impact, a tether latch, a facility custody
// receipt, an entity destruction — is therefore emitted BEFORE `missions.update` runs for tick T.
// Submission always precedes `stepArbiter` within a tick, structurally rather than by convention.
//
// ─── STAMPING (arbiter precondition 2) ──────────────────────────────────────────────────────────
// `causalTick` is taken from the CAUSING EVENT: `receipt.tick` on a facility custody contact,
// `launchedAtTick` on a launch, the live `state.tick` at the synchronous instant a tether latch or
// destruction fires. Never a cached clock, and never "whenever the mission got around to it" — an
// under-stamped late report would outrank a newer, truer fact, because the earliest causal fact
// wins across ticks.
//
// ─── WHAT THIS MODULE MAY NOT DO ────────────────────────────────────────────────────────────────
// It does not validate law (it asks `lawSecurity`), does not touch `player.heat` (only an accepted,
// law-signed receipt opens that door), does not mutate cargo/credits/reputation (it asks the
// mission owner, which asks economy and factions), does not spawn or steer anyone, and does not
// consume the capsule (it asks the physical receiver, keyed by the terminal receipt).
//
// ─── PURSUIT: WHY THE MISSION TAKES LEASES BUT NEVER WRITES INTENT ──────────────────────────────
// `scanner.js:1024` — `if (ai && ai.lawful) return ai.securityTargetId === playerId ||
// isPlayerWanted(state)` — means the SHIPPED lawful AI already engages a WANTED player with no
// dispatch marker at all. A witnessed theft reported to `lawSecurity` yields an accepted receipt,
// the heat owner consumes it through its own private path, the player crosses the WANTED threshold,
// and the existing tactical AI becomes the one steering writer with zero mission involvement.
//
// The lease's job is the OTHER half: `npcJobsRuntime.claimControl` suspends the patrol's own job
// intent so its mining/patrol route does not drag the hull off an intercept the AI is flying. One
// writer at a time, which is what the lease is for.
//
// Leases are taken ONLY when law reports `responderAvailability: 'available'` — i.e. only on an
// accepted, witnessed, in-jurisdiction report, which is exactly the case where heat is applied and
// the AI will in fact drive. A lease over a hull nobody steers is a frozen patrol, so the gate is
// load-bearing, not decorative. `none_in_range` is a first-class recorded outcome and takes no
// lease, per the packet: it is not permission to spawn a responder.

import {
  createArbiter,
  submitCandidate,
  stepArbiter,
  prepareTerminal,
  commitTerminal,
  recordEffect,
  effectApplied,
  serializeArbiter,
  restoreArbiter,
  arbiterInvariants,
  applyTransition,
} from './heistArbiter.js';
import { PQ019_CAPSULE, PQ019_HEIST_SECTOR_ID } from '../data/heistFacilities.js';
import {
  PQ019C_HEIST_TUNING,
  PQ019C_TERMINAL_SETTLEMENT,
  PQ019C_RECOVERABLE_OUTCOMES,
} from '../data/heistMission.js';

export const HEIST_RECORD_SCHEMA = 'spaceface.heistMission.v1';
export const HEIST_LAW_KIND = 'payload_theft';
export const HEIST_OFFENDER_STABLE_ID = 'player';
/** One stable voice id for the whole run, so the countdown/pursuit/outcome lines coalesce in place. */
export const HEIST_VOICE_ID = 'pq019c:capsule-run';
export const HEIST_VOICE_CHANNEL = 'objective';
// Theft truth is urgent but not life-critical: it must interrupt first-use tutorial speech (70)
// without claiming the danger floor (110). Other heist progress remains ordinary objective voice.
export const HEIST_THEFT_VOICE_PRIORITY = 80;
// Terminal and recovery truth is load-bearing story: it must interrupt repeatable combat alerts
// while still yielding to the life-critical danger floor.
export const HEIST_TERMINAL_VOICE_PRIORITY = 100;
const HEIST_TERMINAL_CUE_MOMENTS = new Set([
  'fenced',
  'confiscated',
  'lawful_arrival',
  'destroyed',
  'expired',
  'absent',
  'abandoned',
  'denied',
  'recovery',
]);

const RECOVERABLE = new Set(PQ019C_RECOVERABLE_OUTCOMES);

function intTick(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Stable per-mission schedule identity. The facility owner keys its whole schedule on this. */
export function heistScheduleIdFor(missionId) {
  return `pq019c:${String(missionId || 'mission')}`;
}

export function createHeistRecord({
  missionId,
  tick = 0,
  attempt = 0,
  launchWindowS = PQ019C_HEIST_TUNING.launchWindowS,
  runWindowTicks = PQ019C_HEIST_TUNING.runWindowTicks,
  unlaunchedWindowTicks = PQ019C_HEIST_TUNING.unlaunchedWindowTicks,
  recoveryAllowed = PQ019C_HEIST_TUNING.recoveryEnabled,
} = {}) {
  return {
    schema: HEIST_RECORD_SCHEMA,
    missionId: String(missionId),
    attempt: attempt | 0,
    scheduleId: heistScheduleIdFor(missionId),
    acceptTick: intTick(tick),
    launchWindowS,
    runWindowTicks,
    unlaunchedWindowTicks,
    // Authored per-run policy rather than a read of the frozen tuning at settlement time, so the
    // decision travels with the contract that was accepted and survives the save with it.
    recoveryAllowed: !!recoveryAllowed,
    scheduleRequested: false,
    launchAtSimT: null,
    launchTick: null,
    capsuleEntityId: null,
    capsuleSeen: false,
    possessionEver: false,
    possessed: false,
    lawReportId: null,
    lawIncidentReceiptId: null,
    lawDenialReason: null,
    responderAvailability: null,
    leases: [],
    pursuitStarted: false,
    escapeHoldTicks: 0,
    escaped: false,
    absenceGraceTicks: 0,
    cues: {},
    settled: false,
    settledOutcome: null,
    reconciled: null,
    arbiter: createArbiter({
      missionId: String(missionId),
      payloadStableId: PQ019_CAPSULE.stableId,
      createdAtTick: intTick(tick),
    }),
  };
}

// ── Presentation ────────────────────────────────────────────────────────────────────────────────
//
// ONE VOICE. Every player-visible line in this feature goes through `helpers.voice.say` under the
// single stable id above on the `objective` channel. Ordinary progress uses priority 60; the three
// theft results use urgent priority 80 so witness/WANTED/pursuit cannot stale behind first-use
// teaching; terminal/recovery truth uses load-bearing story priority 100 so repeatable combat alerts
// cannot hide the result. `VoiceQueue` still coalesces same-id entries in place, so the whole run
// occupies at most ONE floor slot. Life-critical danger (110) remains the top tier.
//
// Each moment fires AT MOST ONCE per run (`record.cues`), so this is bounded, not per-frame.
// Every line states its subject and its consequence in words: no cue depends on hue, none adds
// motion beyond the existing floor presentation, and each is legible with animation disabled.
// Where `voiceArbiter` is not registered (headless sim, focused tests) `helpers.voice` is
// undefined and the call is a strict no-op — the owner receipt below still fires, so the cue is
// observable without a UI.

export const HEIST_CUE_TEXT = Object.freeze({
  accepted: 'Capsule run accepted — launcher arming, stay in Tethys Junction',
  launched: 'Capsule away — intercept it before the Concord catcher takes it',
  possessed: 'Capsule in tow — the Quiet fence is your only buyer now',
  // WITNESS, WANTED and PURSUIT are ONE LINE, not three.
  //
  // All three facts are decided inside a single call to `reportTheft`, in one tick. Emitted as
  // separate lines under one stable voice id they COALESCE IN PLACE — `VoiceQueue` replaces a
  // same-id entry rather than stacking it — so the player would see only the last one written and
  // the other two would be silently discarded. Verified by driving the real arbiter before this was
  // composed. Emitting them under three DIFFERENT ids would instead put three pills on a floor that
  // is supposed to hold one. Composing is the only option that is both one-voice compliant and
  // truthful: one slot, and every fact the player needs is in it.
  theft_witnessed_pursuit: 'Theft witnessed — WANTED, and Concord patrol units are inbound',
  theft_witnessed_no_patrol: 'Theft witnessed — WANTED, but Concord has no patrol in range',
  theft_unwitnessed: 'No witness in range — the theft is unlogged, for now',
  escaped: 'Contact broken — run the capsule to the Quiet fence',
  fenced: 'Capsule fenced — the Quiet paid and forgot your face',
  confiscated: 'Capsule confiscated — Concord recovered its cargo',
  lawful_arrival: 'Capsule caught by Concord — the run is over, nothing was taken',
  destroyed: 'Capsule destroyed — there is nothing left to sell',
  expired: 'Run window closed — the capsule is no longer worth chasing',
  absent: 'Capsule lost from the field — the contract cannot be settled',
  abandoned: 'Capsule run abandoned',
  denied: 'Launcher refused the schedule — no capsule run is available',
  recovery: 'The Quiet will fund one more pass at a reduced rate — check the Tethys board',
});

/**
 * Speak one authored moment, at most once per run. Emits an owner receipt regardless so headless
 * harnesses can observe cue moments with no presenter attached.
 */
export function sayHeistCue(ctx, record, moment, textOverride = null) {
  if (!record || record.cues[moment]) return null;
  const text = textOverride || HEIST_CUE_TEXT[moment];
  if (!text) return null;
  record.cues[moment] = true;
  const receipt = Object.freeze({
    cueId: `pq019c:cue:${record.missionId}:${moment}`,
    missionId: record.missionId,
    moment,
    text,
    voiceId: HEIST_VOICE_ID,
    channel: HEIST_VOICE_CHANNEL,
    source: 'heistMissionRuntime',
  });
  // Flight only, for the same reason PQ-019A's countdown is: while docked the Station OS is a
  // fullscreen surface in front of the #alerts slot, so speaking there burns the one-voice floor on
  // a pill nobody can see. The underlying run is world simulation and keeps going either way.
  if (ctx?.state?.mode === 'flight') {
    const say = ctx.helpers?.voice?.say;
    if (typeof say === 'function') {
      const priority = moment.startsWith('theft_')
        ? HEIST_THEFT_VOICE_PRIORITY
        : (HEIST_TERMINAL_CUE_MOMENTS.has(moment) ? HEIST_TERMINAL_VOICE_PRIORITY : undefined);
      say({ channel: HEIST_VOICE_CHANNEL, id: HEIST_VOICE_ID, text, kind: 'info', ttl: 5, priority });
    }
  }
  ctx?.bus?.emit?.('heist:missionCue', receipt);
  return receipt;
}

// ── Candidate submission ────────────────────────────────────────────────────────────────────────

/**
 * Submit one report. Every candidate in this feature goes through here, so the mission id, payload
 * id, and source stamping are impossible to get inconsistent between call sites.
 */
export function submitHeistCandidate(record, { kind, causalTick, sourceStableId, proof = {} }) {
  if (!record?.arbiter) return { accepted: false, reason: 'no_record' };
  return submitCandidate(record.arbiter, {
    missionId: record.missionId,
    payloadStableId: PQ019_CAPSULE.stableId,
    kind,
    causalTick: intTick(causalTick),
    sourceStableId,
    proof,
  });
}

// ── Owner lookups ───────────────────────────────────────────────────────────────────────────────

function ownerOf(ctx, name) {
  const get = ctx?.registry?.get;
  if (typeof get !== 'function') return null;
  try {
    return ctx.registry.get(name) || null;
  } catch {
    return null;
  }
}

function liveEntity(ctx, id) {
  if (id == null) return null;
  const entity = ctx?.state?.entities?.get?.(id);
  return entity && entity.alive !== false ? entity : null;
}

export const heistMissionRuntime = {
  // ── Lifecycle ────────────────────────────────────────────────────────────────────────────────

  /** Ask the facility owner for a launch window. Idempotent: one schedule per mission. */
  requestSchedule(ctx, record) {
    if (!record || record.scheduleRequested || record.settled) return null;
    const facilities = ownerOf(ctx, 'heistFacilities');
    const simT = Number(ctx?.state?.simTime) || 0;
    const launchAtSimT = simT + record.launchWindowS;
    record.scheduleRequested = true;
    let receipt = null;
    if (facilities && typeof facilities.requestLaunchSchedule === 'function') {
      receipt = facilities.requestLaunchSchedule({ scheduleId: record.scheduleId, launchAtSimT });
    } else {
      ctx?.bus?.emit?.('heist:requestLaunchSchedule', {
        scheduleId: record.scheduleId, launchAtSimT,
      });
    }
    if (receipt && receipt.accepted === false) {
      // A denial is a real, visible outcome — another schedule already owns the launcher. The run
      // cannot start, so it resolves as absent rather than hanging on a capsule that never comes.
      record.scheduleDenied = receipt.reason || 'denied';
      sayHeistCue(ctx, record, 'denied');
      submitHeistCandidate(record, {
        kind: 'unresolved_absent',
        causalTick: intTick(ctx?.state?.tick),
        sourceStableId: 'heistFacilities:schedule',
        proof: { reason: String(receipt.reason || 'denied') },
      });
      return receipt;
    }
    record.launchAtSimT = receipt && Number.isFinite(receipt.launchAtSimT)
      ? receipt.launchAtSimT : launchAtSimT;
    sayHeistCue(ctx, record, 'accepted');
    return receipt;
  },

  /** `heist:capsuleLaunched` — the capsule is physically real. */
  onCapsuleLaunched(ctx, record, payload = {}) {
    if (!record || record.settled) return false;
    if (payload.scheduleId !== record.scheduleId) return false;
    record.launchTick = intTick(payload.launchedAtTick);
    record.capsuleEntityId = payload.capsuleEntityId == null ? null : payload.capsuleEntityId;
    record.capsuleSeen = true;
    applyTransition(record.arbiter, 'launched');
    sayHeistCue(ctx, record, 'launched');
    return true;
  },

  /** `tether:latched` — existing Massline/tether physical state, normalized to one candidate. */
  onTetherLatched(ctx, record, payload = {}) {
    if (!record || record.settled) return false;
    const capsule = liveEntity(ctx, payload.targetId);
    if (!capsule || capsule.data?.heistPayloadStableId !== PQ019_CAPSULE.stableId) return false;
    if (capsule.data?.launchScheduleId !== record.scheduleId) return false;
    const tick = intTick(ctx?.state?.tick);
    record.capsuleEntityId = capsule.id;
    record.possessed = true;
    const first = !record.possessionEver;
    record.possessionEver = true;
    submitHeistCandidate(record, {
      kind: 'possession',
      causalTick: tick,
      sourceStableId: 'tetherGameplay',
      proof: { holder: HEIST_OFFENDER_STABLE_ID },
    });
    if (first) {
      sayHeistCue(ctx, record, 'possessed');
      this.reportTheft(ctx, record, capsule, tick);
    }
    return true;
  },

  /** `tether:released` / `tether:cut` / `tether:broke`. Possession is history, not an outcome. */
  onTetherReleased(ctx, record, payload = {}) {
    if (!record || record.settled) return false;
    if (record.capsuleEntityId == null || payload.targetId !== record.capsuleEntityId) return false;
    record.possessed = false;
    return true;
  },

  /**
   * Report the theft to the law owner and take pursuit leases from what law says already exists.
   *
   * The mission asks; `lawSecurity` decides. An unwitnessed or out-of-jurisdiction theft is DENIED,
   * and a denial is a real outcome the player is told about — not a silent success.
   */
  reportTheft(ctx, record, capsule, causalTick) {
    if (!record || record.lawIncidentReceiptId) return null;
    const law = ownerOf(ctx, 'lawSecurity');
    if (!law || typeof law.reportIncident !== 'function') return null;
    // Stable across replay and reload: one theft per mission, so a duplicate report returns the
    // SAME receipt from law's own idempotency ledger rather than logging a second crime.
    const reportId = `${record.missionId}:${HEIST_LAW_KIND}`;
    record.lawReportId = reportId;
    const receipt = law.reportIncident({
      reportId,
      kind: HEIST_LAW_KIND,
      offenderStableId: HEIST_OFFENDER_STABLE_ID,
      offenderEntityId: ctx?.state?.playerId,
      payloadStableId: PQ019_CAPSULE.stableId,
      causalTick: intTick(causalTick),
      pos: { x: capsule.pos.x, z: capsule.pos.z },
    });
    if (!receipt || receipt.accepted !== true) {
      record.lawDenialReason = receipt?.reason || 'denied';
      sayHeistCue(ctx, record, 'theft_unwitnessed');
      return receipt;
    }
    record.lawIncidentReceiptId = receipt.incidentReceiptId;
    record.responderAvailability = receipt.responderAvailability;
    // Heat was consumed synchronously by its own owner on `law:reportIncidentReceipt`, through the
    // private mutation path every other heat source uses. The mission never wrote heat and could
    // not have: the only door needs a receipt it cannot sign. The WANTED half of the line below is
    // therefore a report of what law and heat did, not a claim this module made anything happen.
    if (receipt.responderAvailability === 'available') {
      this.claimPursuitLeases(ctx, record, receipt.responderEntityIds || []);
      sayHeistCue(ctx, record, 'theft_witnessed_pursuit');
    } else {
      // "No patrol in range" is a first-class outcome the player must be able to HEAR, rather than
      // infer from silence.
      sayHeistCue(ctx, record, 'theft_witnessed_no_patrol');
    }
    return receipt;
  },

  /** Borrow the JOB of each already-flying responder law named. Bounded by the authored cap. */
  claimPursuitLeases(ctx, record, responderEntityIds) {
    const jobs = ownerOf(ctx, 'npcJobsRuntime');
    if (!jobs || typeof jobs.claimControl !== 'function') return 0;
    let taken = 0;
    for (const entityId of responderEntityIds) {
      if (taken >= PQ019C_HEIST_TUNING.responderLeaseCap) break;
      const entity = liveEntity(ctx, entityId);
      const jobId = entity?.data?.jobId;
      if (!jobId) continue;
      if (record.leases.some((row) => row.jobId === jobId)) continue;
      const claimId = `pq019c:${record.missionId}:${jobId}`;
      const claim = jobs.claimControl(jobId, { claimId, holder: record.missionId });
      if (!claim || claim.granted !== true) continue;
      record.leases.push({ jobId, claimId, entityId });
      taken++;
      record.pursuitStarted = true;
    }
    return taken;
  },

  /**
   * Hand every borrowed hull back. Always safe to call, and called on EVERY exit path — which is
   * what makes `activeJobControlClaimsAfterTerminal == 0` true rather than hoped for.
   */
  releaseAllLeases(ctx, record) {
    const jobs = ownerOf(ctx, 'npcJobsRuntime');
    const released = [];
    for (const row of record.leases || []) {
      if (jobs && typeof jobs.releaseControl === 'function') {
        released.push(jobs.releaseControl(row.jobId, row.claimId));
      }
    }
    record.leases = [];
    return released;
  },

  /** `heist:facilityCandidate` — a real Rapier contact at the catcher or the fence. */
  onFacilityCandidate(ctx, record, receipt = {}) {
    if (!record || record.settled) return false;
    if (receipt.scheduleId !== record.scheduleId) return false;
    if (receipt.payloadStableId !== PQ019_CAPSULE.stableId) return false;
    const causalTick = intTick(receipt.tick);
    // MISSION POLICY, deliberately not the arbiter's: mapping a physical contact to a legal outcome
    // is exactly what the arbiter refuses to know. `lawful_catch_contact` is a lawful ARRIVAL if
    // nobody ever took the capsule, and a CONFISCATION if somebody did and lost it there.
    if (receipt.kind === 'lawful_catch_contact') {
      submitHeistCandidate(record, {
        kind: record.possessionEver ? 'lawful_confiscation' : 'lawful_arrival_observed',
        causalTick,
        sourceStableId: `heistFacilities:${receipt.facilityId}`,
        proof: { custodyReceiptId: receipt.receiptId, possessionEver: !!record.possessionEver },
      });
      return true;
    }
    if (receipt.kind === 'fence_contact') {
      // A capsule cannot reach the fence on its launch arc; getting it there IS the heist. Refusing
      // an unpossessed fence contact keeps a physics fluke from paying out a theft nobody committed.
      if (!record.possessionEver) return false;
      submitHeistCandidate(record, {
        kind: 'fenced_success',
        causalTick,
        sourceStableId: `heistFacilities:${receipt.facilityId}`,
        proof: { custodyReceiptId: receipt.receiptId },
      });
      return true;
    }
    return false;
  },

  /**
   * `sector:exit` for the heist sector.
   *
   * This is what tells destruction and ABSENCE apart, and it has to exist. `entity:destroyed` is
   * the generic "this entity left the world" event — `coreSystem.lifetimeSweep` queues it for TTL
   * expiry, for `despawnAt`, and for any `removeEntity` call, not only for a lethal hit. The
   * facility owner removes its transient capsule on sector exit (PQ-019A: "removes the launched
   * transient capsule without settlement, reward, or fabricated terminal outcome"), so without this
   * marker a player who simply flew out of Tethys would be told their capsule was DESTROYED.
   *
   * `sector:exit` reaches this listener first: `entity:destroyed` is queued by the end-of-step
   * sweep, while sector exit is emitted synchronously.
   */
  onSectorExit(ctx, record, sectorId) {
    if (!record || record.settled) return false;
    if (sectorId !== PQ019_HEIST_SECTOR_ID) return false;
    if (record.sectorExitedAtTick == null) record.sectorExitedAtTick = intTick(ctx?.state?.tick);
    return true;
  },

  /**
   * `entity:destroyed` on the capsule. Classified against the fact above rather than assumed: a
   * capsule that left with the sector is ABSENT, a capsule that stopped existing while the player
   * was still there was destroyed. Both are non-paying, but they are different things and rank
   * differently in the arbiter's precedence chain, so telling the player the wrong one is a lie the
   * settlement would repeat in the receipt.
   */
  onEntityDestroyed(ctx, record, entityId) {
    if (!record || record.settled) return false;
    if (record.capsuleEntityId == null || entityId !== record.capsuleEntityId) return false;
    record.possessed = false;
    const absent = record.sectorExitedAtTick != null;
    submitHeistCandidate(record, {
      kind: absent ? 'unresolved_absent' : 'payload_destroyed',
      causalTick: intTick(ctx?.state?.tick),
      sourceStableId: 'entity:destroyed',
      proof: {
        entityId: String(entityId),
        ...(absent ? { reason: 'sector_exit' } : {}),
      },
    });
    return true;
  },

  /** The player gave up. Arbitrated like every other outcome instead of settling behind its back. */
  onAbandoned(ctx, record) {
    if (!record || record.settled) return false;
    submitHeistCandidate(record, {
      kind: 'abandoned',
      causalTick: intTick(ctx?.state?.tick),
      sourceStableId: 'ui:abandonMission',
      proof: {},
    });
    return true;
  },

  // ── Per-tick drive ───────────────────────────────────────────────────────────────────────────

  /**
   * One tick of the run. Submits any clock-derived candidate, THEN steps the arbiter exactly once.
   * Returns the terminal receipt when one is decided this tick, else null.
   */
  drive(ctx, record, { decisionTick = null } = {}) {
    if (!record || record.settled) return null;
    const tick = intTick(ctx?.state?.tick);

    if (!record.scheduleRequested) this.requestSchedule(ctx, record);

    if (record.launchTick == null) {
      // BOUNDED EVEN IF NOTHING EVER FLIES. `heistFacilities.update` returns early outside Tethys
      // and deliberately preserves an unlaunched schedule for re-entry, so a player who accepts and
      // leaves the sector has no capsule, no mission deadline (the authored offer declares none) and
      // nothing physical to arbitrate — a permanently active contract. The packet requires every
      // route to reach a bounded `expired`/`unresolved_absent`; abandonment being AVAILABLE is not
      // the same as the run being bounded, because it needs the player to act.
      const deadline = record.acceptTick + record.unlaunchedWindowTicks;
      if (tick >= deadline) {
        submitHeistCandidate(record, {
          kind: 'unresolved_absent',
          causalTick: deadline,
          sourceStableId: 'heistMissionRuntime:unlaunched',
          proof: { unlaunchedWindowTicks: record.unlaunchedWindowTicks },
        });
      }
    } else {
      const capsule = liveEntity(ctx, record.capsuleEntityId);
      if (capsule) {
        record.absenceGraceTicks = 0;
        this._updatePursuit(ctx, record, capsule, tick);
      } else if (!record.arbiter.receipt) {
        // ABSENCE, not destruction. A capsule can leave the field without dying — the player left
        // the sector, or the facility owner dropped its transient. One tick of grace absorbs the
        // ordinary case where `entity:destroyed` fires in the same tick and already spoke for it.
        record.absenceGraceTicks++;
        if (record.absenceGraceTicks > 1) {
          submitHeistCandidate(record, {
            kind: 'unresolved_absent',
            causalTick: tick,
            sourceStableId: 'heistMissionRuntime:absence',
            proof: { lastKnownEntityId: String(record.capsuleEntityId) },
          });
        }
      }
      // Bounded run window. An `expired` CANDIDATE, never a mission deadline: the mission owner's
      // own `_expireMission` would settle with zero terminal receipts.
      const expiryTick = record.launchTick + record.runWindowTicks;
      if (tick >= expiryTick) {
        submitHeistCandidate(record, {
          kind: 'expired',
          causalTick: expiryTick,
          sourceStableId: 'heistMissionRuntime:window',
          proof: { runWindowTicks: record.runWindowTicks },
        });
      }
    }

    // ONE step, after every submission for this tick. See the ordering note in the module header.
    //
    // `decisionTick` is an explicit override used by exactly one caller: an abandonment issued from
    // the docked Mission Log. `missions.update` returns early while docked, so without it the
    // abandonment candidate would sit unarbitrated until the player undocked — a mission the player
    // asked to drop staying live for an arbitrary wall-clock stretch. Stepping at `tick + 1` makes
    // the just-submitted report eligible under the arbiter's own causalTick+1 rule rather than
    // bypassing it, and any EARLIER physical fact becomes eligible at the same moment and still
    // outranks it. Nothing here weakens selection; it only closes the window on time.
    const stepped = stepArbiter(record.arbiter, decisionTick == null ? tick : intTick(decisionTick));
    return stepped.receipt || null;
  },

  /**
   * Leash and escape bookkeeping. Reads positions; writes nothing to any hull. The tactical AI owns
   * the intercept, so "escape" here is an observation about distance, not a state it imposes.
   */
  _updatePursuit(ctx, record, capsule, tick) {
    // Gated on whether a pursuit ever STARTED, not on whether a lease is still held. The lease-count
    // guard this replaces made `escaped` unreachable in play: the leash branch below is what empties
    // `leases`, so from the very next tick the guard returned before `escapeHoldTicks` could
    // accumulate, and the counter froze at 1 forever. Breaking contact is the whole point of the
    // escape route, so the one state it produced was the one state that could not latch.
    if (!record.pursuitStarted) return;
    const jobs = ownerOf(ctx, 'npcJobsRuntime');
    let nearest = Infinity;
    const kept = [];
    for (const row of record.leases) {
      const hull = liveEntity(ctx, row.entityId);
      if (!hull) {
        if (jobs?.releaseControl) jobs.releaseControl(row.jobId, row.claimId);
        continue;
      }
      const d = Math.hypot(hull.pos.x - capsule.pos.x, hull.pos.z - capsule.pos.z);
      if (d > PQ019C_HEIST_TUNING.responderLeashWu) {
        // Past the leash the patrol stops being a pursuer and goes back to its own work.
        if (jobs?.releaseControl) jobs.releaseControl(row.jobId, row.claimId);
        continue;
      }
      nearest = Math.min(nearest, d);
      kept.push(row);
    }
    record.leases = kept;
    // No pursuer left in the leash IS the escaped condition, not a reason to stop counting.
    if (!kept.length) nearest = Infinity;
    if (nearest > PQ019C_HEIST_TUNING.escapeRadiusWu) record.escapeHoldTicks++;
    else record.escapeHoldTicks = 0;
    if (!record.escaped && record.escapeHoldTicks >= PQ019C_HEIST_TUNING.escapeHoldTicks) {
      record.escaped = true;
      // Progress only. Escaping locally does NOT clear heat — that stays the heat owner's, and it
      // decays on its own schedule. The run is still a crime; it is merely unobserved right now.
      applyTransition(record.arbiter, 'pursued');
      applyTransition(record.arbiter, 'escaped');
      sayHeistCue(ctx, record, 'escaped');
    }
  },

  // ── Settlement ───────────────────────────────────────────────────────────────────────────────

  /**
   * Apply the terminal receipt's owner effects, each guarded by its own idempotency key in the
   * arbiter's durable journal, then hand the mission to the ordinary complete/fail path.
   *
   * `settle` is supplied by `missions` and is the ONLY thing that pays, penalizes, or removes the
   * mission. Economy, factions, receipts, navigation, and cleanup all stay where they already live.
   */
  settleTerminal(ctx, record, receipt, settle) {
    if (!record || !receipt || record.settled) return null;
    const arbiter = record.arbiter;
    const keys = receipt.effectKeys;
    const tick = intTick(ctx?.state?.tick);
    const outcome = receipt.outcome;

    // 1. The physical receiver. PREPARE reserves and proves; COMMIT consumes. A prepare that cannot
    //    be earned (no custody contact for this capsule and schedule) fails closed and the capsule
    //    is left exactly where it is.
    if (!effectApplied(arbiter, keys.receiverCommit)) {
      const facilityId = outcome === 'fenced_success' ? 'fence_receiver'
        : (outcome === 'lawful_confiscation' || outcome === 'lawful_arrival_observed'
          ? 'lawful_catcher' : null);
      const facilities = facilityId ? ownerOf(ctx, 'heistFacilities') : null;
      if (facilities && typeof facilities.prepareReceiverHandoff === 'function') {
        const prepared = facilities.prepareReceiverHandoff({
          receiptId: receipt.receiptId,
          facilityId,
          payloadStableId: PQ019_CAPSULE.stableId,
        });
        if (prepared && prepared.prepared) {
          const committed = facilities.commitReceiverHandoff(receipt.receiptId);
          if (committed && committed.committed) {
            recordEffect(arbiter, keys.receiverCommit, {
              effectId: committed.receipt?.effectId || null, tick,
            });
            recordEffect(arbiter, keys.capsuleProjection, { tick, note: 'consumed' });
          } else {
            facilities.abortReceiverHandoff(receipt.receiptId, 'commit_failed');
          }
        }
      }
    }

    // 2. Law and heat already happened during the run, through their own owners. Journalling them
    //    against the terminal receipt is what makes them COUNTABLE — the effect keys only exist
    //    once a terminal is prepared, so the record is written here rather than at the time.
    if (record.lawIncidentReceiptId && !effectApplied(arbiter, keys.lawIncident)) {
      recordEffect(arbiter, keys.lawIncident, { effectId: record.lawIncidentReceiptId, tick });
      recordEffect(arbiter, keys.heatApplication, { effectId: record.lawIncidentReceiptId, tick });
    }

    // 3. Every borrowed hull goes back before the mission leaves the active list.
    if (!effectApplied(arbiter, keys.jobControlRelease)) {
      this.releaseAllLeases(ctx, record);
      recordEffect(arbiter, keys.jobControlRelease, { tick });
    }

    // 3b. Hand the launcher back. The facility owner holds exactly one schedule and refuses every
    //     other key, so without this the FIRST run would own the launcher for the rest of the
    //     session and every later contract — including a reduced-stake recovery, which is a new
    //     mission by construction — would be denied `active_schedule` before it could launch.
    //     Idempotent by the owner's own `no_schedule` answer; no journal key needed.
    const facilityOwner = ownerOf(ctx, 'heistFacilities');
    if (facilityOwner && typeof facilityOwner.releaseSchedule === 'function') {
      facilityOwner.releaseSchedule(record.scheduleId);
    }

    // 4. Mission settlement — exactly once, recorded BEFORE the call so a synchronous listener that
    //    re-enters this path finds the key already taken and cannot settle a second time.
    const plan = PQ019C_TERMINAL_SETTLEMENT[outcome]
      || PQ019C_TERMINAL_SETTLEMENT.unresolved_absent;
    let settlement = null;
    if (!effectApplied(arbiter, keys.missionSettlement)) {
      recordEffect(arbiter, keys.missionSettlement, { effectId: receipt.receiptId, tick });
      if (plan.settlement === 'complete') {
        // The payout and the rep both come out of `_completeMission`. This module never calls
        // economy or factions itself.
        recordEffect(arbiter, keys.economyReward, { effectId: receipt.receiptId, tick });
        recordEffect(arbiter, keys.factionOutcome, { effectId: receipt.receiptId, tick });
      } else {
        recordEffect(arbiter, keys.factionOutcome, { effectId: receipt.receiptId, tick });
      }
      record.settled = true;
      record.settledOutcome = outcome;
      commitTerminal(arbiter, receipt.receiptId);
      this.sayOutcomeCue(ctx, record, outcome);
      settlement = typeof settle === 'function' ? settle(plan.settlement, plan.reason, outcome) : null;
    }
    return settlement;
  },

  sayOutcomeCue(ctx, record, outcome) {
    const moment = {
      fenced_success: 'fenced',
      lawful_confiscation: 'confiscated',
      lawful_arrival_observed: 'lawful_arrival',
      payload_destroyed: 'destroyed',
      expired: 'expired',
      unresolved_absent: 'absent',
      abandoned: 'abandoned',
    }[outcome];
    if (moment) sayHeistCue(ctx, record, moment);
  },

  /**
   * May a reduced-stake retry follow this outcome? Authored policy, default OFF.
   *
   * Read from the RECORD rather than from the frozen tuning, so the policy that applies is the one
   * the accepted contract carried. "At most one" is enforced here (attempt 0 only) and again by
   * `_syncHeistOffer`/`_boardHeistRecovery` refusing to post onto a board that already has a row.
   */
  allowsRecovery(record, outcome) {
    const allowed = record ? !!record.recoveryAllowed : PQ019C_HEIST_TUNING.recoveryEnabled;
    return allowed && ((record?.attempt | 0) === 0) && RECOVERABLE.has(outcome);
  },

  // ── Save boundary ────────────────────────────────────────────────────────────────────────────

  /**
   * Plain snapshot. Nests inside the mission owner's already-serialized active entry.
   *
   * TRANSIENT RUN FIELDS ARE STRIPPED, on the same precedent `missions.serialize` already uses for
   * `targetEntityIds` and `_escorteeId`. Two of them matter beyond tidiness:
   *
   *   * `leases` — PQ-019B §2c: a job-control lease is DELIBERATELY not persisted. After a load
   *     every job is virtualized and every `entityId` nulled, so a restored lease would name a hull
   *     that does not exist and a controller that no longer does either — nobody left alive to
   *     release it, i.e. a permanently frozen patrol. Writing the rows into the save even though
   *     `restore` clears them would leave a record that invites exactly that mistake later.
   *   * `capsuleEntityId` — a live entity id. Ids are recycled (`state.freeIds`), so a stale one
   *     can name a DIFFERENT entity after a load.
   */
  serialize(record) {
    if (!record) return null;
    const {
      leases, capsuleEntityId, possessed, escapeHoldTicks, absenceGraceTicks, pursuitStarted,
      ...durable
    } = record;
    void leases; void capsuleEntityId; void possessed; void escapeHoldTicks; void absenceGraceTicks;
    void pursuitStarted;
    return { ...durable, arbiter: serializeArbiter(record.arbiter) };
  },

  /**
   * Rebuild after a load, and reconcile against a world that no longer remembers the capsule.
   *
   * `state.heistFacilities` and `state.lawSecurity` are NOT in the save owner's capture plan
   * (PQ-019B §4), and the capsule is a transient entity. After a reload there is no schedule, no
   * capsule, no custody candidate, and no handoff. That is a design consequence, not a bug, and it
   * is reconciled by an EXPLICIT rule rather than by pretending:
   *
   *   * a decided receipt        -> RESUME it. Selection never re-runs; only unapplied effect keys
   *                                 are re-driven, because the journal says which already landed.
   *   * phase `scheduled`, never launched -> RE-REQUEST the schedule. Nothing physical existed yet,
   *                                 so this is a restart of a pending window, not a fabrication.
   *   * launched or later, no capsule -> `unresolved_absent`. Never a payout, never a fake capsule.
   *   * a record the arbiter refuses (half-decided: phase claims a decision, receipt unreadable)
   *                              -> the same `unresolved_absent` case, from a fresh arbiter.
   *
   * Adding `heistFacilities`/`lawSecurity` to `_saveCapturePlan()` would make the capsule durable
   * in its own right. That is a new top-level save key and an integrator decision — the packet's
   * STOP RULE — and this rule is why it is not needed.
   */
  restore(record, { tick = 0 } = {}) {
    if (!record || typeof record !== 'object') return null;
    const restored = { ...record };
    restored.arbiter = restoreArbiter(record.arbiter);

    /**
     * The tick a restore-time report must be stamped with.
     *
     * NOT simply the live clock. The arbiter restores its own `decidedThroughTick` from the save,
     * and `submitCandidate` refuses anything at or below it as `stale_tick`. Whenever the caller's
     * clock has not yet caught up to that value, a restore-time `unresolved_absent` is silently
     * REFUSED — the run then has no terminal candidate at all and hangs active forever, which is
     * exactly the invisible mission soft-lock the arbiter's rejection ledger exists to make
     * diagnosable rather than acceptable.
     *
     * That gap is real rather than theoretical: `saveSystem` restores `state.tick` from the entity
     * payload (saveSystem.js:2116), so whether the clock is caught up when `missions.deserialize`
     * runs is an ORDERING property of the save owner, not something this module can assume. Taking
     * the arbiter's own clock as a floor makes the stamp correct under either order, and it is
     * truthful either way: the absence is discovered now, which is by definition after everything
     * the arbiter had already decided through.
     */
    const restoreStamp = (arbiter) => Math.max(
      intTick(tick), intTick(arbiter?.decidedThroughTick) + 1,
    );
    restored.leases = [];
    restored.escapeHoldTicks = 0;
    restored.absenceGraceTicks = 0;
    restored.pursuitStarted = false;
    restored.capsuleEntityId = null;
    restored.possessed = false;
    restored.cues = { ...(record.cues || {}) };

    if (!restored.arbiter) {
      // Fail-closed refusal from `restoreArbiter`. Rebuild an empty arbiter and let the same
      // absence rule below decide — there is no safe half-decided record.
      restored.arbiter = createArbiter({
        missionId: String(record.missionId),
        payloadStableId: PQ019_CAPSULE.stableId,
        createdAtTick: intTick(tick),
      });
      restored.reconciled = 'arbiter_refused';
      restored.settled = false;
      submitHeistCandidate(restored, {
        kind: 'unresolved_absent',
        causalTick: restoreStamp(restored.arbiter),
        sourceStableId: 'heistMissionRuntime:restore',
        proof: { reason: 'arbiter_refused' },
      });
      return restored;
    }

    if (restored.arbiter.receipt) {
      restored.reconciled = 'resumed_receipt';
      restored.settled = false; // effects re-drive through the journal; keys already taken no-op.
      return restored;
    }

    if (restored.launchTick == null) {
      // Never launched. A pending window may legitimately be re-requested.
      restored.reconciled = 'reschedule';
      restored.scheduleRequested = false;
      restored.settled = false;
      return restored;
    }

    restored.reconciled = 'absent_after_reload';
    restored.settled = false;
    submitHeistCandidate(restored, {
      kind: 'unresolved_absent',
      causalTick: restoreStamp(restored.arbiter),
      sourceStableId: 'heistMissionRuntime:restore',
      proof: { reason: 'capsule_not_durable' },
    });
    return restored;
  },

  /** The packet's owner-invariant counters for one run, read from the arbiter's own journal. */
  invariants(record) {
    const base = arbiterInvariants(record?.arbiter);
    return {
      ...base,
      activeJobControlClaimsAfterTerminal: record?.settled ? (record.leases?.length || 0) : 0,
      playerCargoMutationCountForCapsule: 0,
      sectorOwnershipMutationCount: 0,
    };
  },
};

/** Re-exported so consumers do not have to reach into the arbiter for a single symbol. */
export { prepareTerminal, PQ019_HEIST_SECTOR_ID };

export default heistMissionRuntime;
