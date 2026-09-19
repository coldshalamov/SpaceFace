// PQ-019C — the authored Tethys capsule-run heist offer and its selected tuning.
//
// WHAT THIS IS: one authored contract, and the numbers it runs on. Side-effect free — it owns
// identity, copy, and tuned scalars. It never touches the bus, the world, or any owner.
//
// PROCEDURAL WEIGHT ZERO, STRUCTURALLY. `heist_intercept` is appended to `MISSION_TYPES` and is
// therefore the 11th entry, while every `OFFER_MIX` row is 10 long. `missions._pickType` reads
// `weights[i] || 0`, so this type's weight is 0 in every station type without editing the mix table
// at all — and because 0 does not change the weight total, the procedural RNG stream is untouched.
// The offer reaches a board only through `missions._syncHeistOffer`, which posts it on ONE authored
// station board and nowhere else.
//
// WHY THE OFFER CARRIES NO DEADLINE. `missions.update` calls `_expireMission` directly the moment
// `deadline_s` passes, and `abandonMission` calls `_failMission` directly. Both settle a mission
// with ZERO terminal receipts, which breaks `terminalReceiptCount == 1`. This offer therefore
// declares no `duration_s`; the heist's own bounded window is an `expired` CANDIDATE raised by the
// runtime and arbitrated like every other outcome.
//
// WHY COLLATERAL IS ZERO. `missions._completeMission` refunds `collateral_cr` as a SECOND
// `economy:grantCredits` call. Any non-zero collateral would make `economyRewardCount` read 2 on a
// fenced success. The contract's stake is physical (the capsule, the heat, the patrol) rather than
// a deposit.

import {
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  HEIST_CAPSULE_RUN_VARIANT_ID,
} from './heistFacilities.js';

export const PQ019C_HEIST_TYPE = 'heist_intercept';
export const PQ019C_HEIST_SOURCE = 'heistContract';
export const PQ019C_HEIST_TAG = 'pq019c:tethys-capsule-run';
export const PQ019C_HEIST_STATION_ID = 'station_tethys';
export const PQ019C_HEIST_SECTOR_ID = 'sector_tethys_junction';
/** The Quiet keep the fence. They are the offering faction, so they own the rep outcome. */
export const PQ019C_HEIST_FACTION_ID = 'faction_quiet';

/**
 * Selected tuning.
 *
 * Every value here was selected ONCE by `scripts/tune-pq019c-heist.mjs` from the fixed-seed matrix
 * in `test/fixtures/pq019c-tuning-matrix.json`, which was committed BEFORE the runner existed so the
 * search space could not be back-fitted to numbers somebody already liked. Each dimension's
 * objective is stated in the matrix; the runner prints the rationale it applied. The values are
 * pinned by `test/pq019c-heist-tuning.test.mjs`. Changing a number without re-running the matrix and
 * re-recording the selection is exactly what this file exists to prevent.
 *
 * The matrix moved five of these off their hand-authored starting values (launch window 45->30, run
 * window 9000->6000, escape hold 180->60, payout 2400->1800, recovery 1100->900) and confirmed three
 * (responder cap 2, leash 2600, escape radius 1800). It also moved PQ-019A's authored capsule launch
 * speed 120->100 and CONFIRMED its mass at 180.
 *
 * ONE SELECTION IS DELIBERATELY NOT APPLIED - see `witnessRadiusMirror` below.
 */
export const PQ019C_HEIST_TUNING = Object.freeze({
  /**
   * Seconds from accept to launch. SELECTED 30: the measured Tethys-station-to-launcher-head
   * distance is 2433 WU, which is 17.4 s at the live `MISSION_TUNING.cruiseSpeedRef` of 140 WU/s,
   * and 30 is the smallest candidate clearing that with the objective's 25% margin.
   */
  launchWindowS: 30,
  /**
   * Ticks after launch before the run is called off. SELECTED 6000: the full authored route
   * (launcher->catcher 2040 WU plus catcher->fence 1921 WU) is 40 s at the selected 100 WU/s launch
   * speed, so the objective's 2x margin needs at least 4754 ticks and 6000 is the smallest candidate
   * above it. The window can therefore never expire a run the player was still flying.
   */
  runWindowTicks: 6000,
  /**
   * Ticks after ACCEPT before a run that never launched is called off. Derived, not chosen: the
   * selected 30 s launch window is 1800 ticks, plus 35% margin, rounded up to 600. A player who
   * accepts and leaves Tethys still reaches a bounded terminal.
   */
  unlaunchedWindowTicks: 3000,
  /**
   * THE ONE MATRIX SELECTION THAT IS DELIBERATELY NOT APPLIED.
   *
   * The matrix's stated objective ("largest candidate that still leaves an unwitnessed annulus,
   * never reaching 600") selects 550. This packet does not apply it, and the mirror stays at
   * PQ-019B's live 450, for a reason about OWNERSHIP rather than balance: `lawSecurity` owns
   * `LAW_INCIDENT_WITNESS_RADIUS`. PQ-019B chose 450 deliberately after finding the witness gate was
   * VACUOUS above the 600 WU lawful-station protection floor, and its annulus test pins the band
   * where a theft is inside the law's ring but genuinely unseen. Raising an owner's constant from a
   * consumer packet is a shared-change request, not a tuning edit - so 550 is RECORDED as the
   * matrix's answer and 450 is what ships. The receipt carries the delta as an open row.
   *
   * The mirror is asserted against the live constant, so if either moves without the other the
   * tuning test fails loudly instead of drifting.
   */
  witnessRadiusMirror: 450,
  /** What the matrix selected under its own objective. Recorded, not applied. See above. */
  witnessRadiusMatrixSelection: 550,
  /** Hard ceiling the mirror may never reach. The lawful-station protection floor. */
  witnessRadiusCeiling: 600,
  /** Simultaneous job-control leases. CONFIRMED 2 = the live authority policy's own responderCap. */
  responderLeaseCap: 2,
  /**
   * WU beyond which a leased responder gives up and the lease is released. CONFIRMED 2600: the
   * smallest candidate at least 600 WU above the selected escape radius, so the leash can never
   * release before escape can latch - which would make pursuit decorative.
   */
  responderLeashWu: 2600,
  /**
   * WU from the nearest live responder at which the run counts as escaped. CONFIRMED 1800: the
   * largest candidate under 95% of the 2040 WU launcher-to-catcher leg, so breaking contact happens
   * inside the route rather than only far outside it.
   */
  escapeRadiusWu: 1800,
  /**
   * Consecutive ticks the player must hold `escapeRadiusWu` before `escaped` latches. SELECTED 60:
   * the smallest candidate that is at least one full second, so a single lucky frame is not an
   * escape, and that still latches well inside the selected run window from a standing start.
   */
  escapeHoldTicks: 60,
  /**
   * Fence payout, credits. SELECTED 1800: the highest ordinary risk-tier-3 board contract computes
   * to 1320 cr from the live `MISSION_TUNING` (best BASE times RISK_MULT[3]), and the objective's
   * band is (1320, 2640] - above the best honest work, because this run costs heat, a WANTED flag
   * and a real chance of losing the capsule, but not so far above that every other contract becomes
   * pointless. 1800 is the smallest candidate in the band.
   */
  payoutCr: 1800,
  /** Reduced-stake recovery payout. SELECTED 900: the candidate nearest half the selected payout. */
  recoveryPayoutCr: 900,
  /**
   * Authored recovery policy. DEFAULT OFF: the packet's balance section mandates nothing, and
   * "at most one" is satisfied most cheaply by not posting one at all. The mechanism is
   * implemented and tested with the flag on; shipping it off is the authored choice.
   */
  recoveryEnabled: false,
  /** Risk band. Drives `missionSpecRep` and the preflight rep gate's default. */
  riskTier: 3,
  /** The Quiet do not check standing before handing over a fence job. */
  minRep: -40,
});

/** Terminal outcome -> how the mission owner settles it. `fenced_success` is the only payday. */
export const PQ019C_TERMINAL_SETTLEMENT = Object.freeze({
  fenced_success: Object.freeze({ settlement: 'complete', reason: null }),
  lawful_arrival_observed: Object.freeze({ settlement: 'fail', reason: 'lawful_arrival' }),
  lawful_confiscation: Object.freeze({ settlement: 'fail', reason: 'confiscated' }),
  payload_destroyed: Object.freeze({ settlement: 'fail', reason: 'payload_destroyed' }),
  expired: Object.freeze({ settlement: 'fail', reason: 'window_expired' }),
  unresolved_absent: Object.freeze({ settlement: 'fail', reason: 'payload_absent' }),
  abandoned: Object.freeze({ settlement: 'fail', reason: 'abandoned' }),
});

/** Outcomes a reduced-stake retry may follow. A completed fence run is never "recovered". */
export const PQ019C_RECOVERABLE_OUTCOMES = Object.freeze([
  'payload_destroyed',
  'lawful_confiscation',
  'expired',
  'unresolved_absent',
]);

const BASE_TITLE = 'Capsule Run — Tethys Surface Launcher';
const RECOVERY_TITLE = 'Capsule Run — Second Pass';

/**
 * Build the authored offer. Deterministic: the same arguments always produce the same row, so a
 * board refresh, a save round-trip, and a fresh boot all agree on its identity.
 *
 * `attempt` 0 is the standing contract; `attempt` 1 is the reduced-stake recovery row.
 */
export function buildHeistOffer({ epoch = 0, attempt = 0, sourceMissionId = null } = {}) {
  const isRecovery = attempt > 0;
  const payout = isRecovery ? PQ019C_HEIST_TUNING.recoveryPayoutCr : PQ019C_HEIST_TUNING.payoutCr;
  const id = isRecovery
    ? `heist_tethys_capsule_run_recovery_${attempt}_${sourceMissionId || 'x'}`
    : 'heist_tethys_capsule_run';
  return {
    id,
    type: PQ019C_HEIST_TYPE,
    source: PQ019C_HEIST_SOURCE,
    stationId: PQ019C_HEIST_STATION_ID,
    factionId: PQ019C_HEIST_FACTION_ID,
    heistTag: isRecovery ? `${PQ019C_HEIST_TAG}:recovery:${attempt}` : PQ019C_HEIST_TAG,
    heistAttempt: attempt,
    reward_cr: payout,
    // See the header: a refunded collateral is a second economy grant.
    collateral_cr: 0,
    riskTier: PQ019C_HEIST_TUNING.riskTier,
    minRep: PQ019C_HEIST_TUNING.minRep,
    destStationId: PQ019C_HEIST_STATION_ID,
    destSectorId: PQ019C_HEIST_SECTOR_ID,
    distance: 0,
    // No `duration_s`: the run window is arbitrated, not expired by the mission clock.
    params: {
      heistTag: isRecovery ? `${PQ019C_HEIST_TAG}:recovery:${attempt}` : PQ019C_HEIST_TAG,
      heistAttempt: attempt,
      launchWindowS: PQ019C_HEIST_TUNING.launchWindowS,
      runWindowTicks: PQ019C_HEIST_TUNING.runWindowTicks,
      unlaunchedWindowTicks: PQ019C_HEIST_TUNING.unlaunchedWindowTicks,
      // Authored per-contract policy. A recovery row never grants another recovery.
      recoveryEnabled: isRecovery ? false : PQ019C_HEIST_TUNING.recoveryEnabled,
      fValue: 1,
    },
    title: isRecovery ? RECOVERY_TITLE : BASE_TITLE,
    brief: isRecovery
      ? 'One more capsule, half the purse. Same launcher, same catcher, shorter patience.'
      : 'A surface launcher throws a sealed capsule to the Concord catcher. Meet it in the open, '
        + 'carry it to the Quiet fence, and be somewhere else when the log reconciles.',
    summary: isRecovery
      ? 'Reduced-stake second pass on the Tethys capsule run.'
      : 'Intercept a lawful cargo capsule in flight and deliver it to the Quiet fence.',
    description: isRecovery
      ? 'The Quiet will fund one more attempt at a reduced rate. There is no third.'
      : 'Tethys Surface Launcher throws a sealed capsule on a fixed arc to the Concord Lawful '
        + 'Catcher. The Quiet want it at their own receiver instead. Nothing about the flight is '
        + 'scripted: it is mass on a trajectory, and it is yours if you can hold it.',
    authorization: 'QUIET — UNLOGGED',
    adminField: 'NO MANIFEST · NO RECOURSE',
    expiresAtEpoch: null,
    storyTag: null,
    // The offer is authored progress, not an epoch reroll. `_syncHeistOffer` re-posts it; this
    // marker is what makes the board's own retention logic leave it alone.
    epochPosted: epoch,
    ...(sourceMissionId ? { recoveryFromMissionId: sourceMissionId } : {}),
  };
}

// ── BREAKAWAY: The Third Shift ──────────────────────────────────────────────────────────────────
//
// A second POLICY over the same launcher, arbiter and receiver machinery — not a second mission
// engine. The Tethys launcher throws the SP-07 flywheel assembly off the catcher line; Concord pays
// for its lawful recovery into the catcher's capture fork. Possession is not theft here: the contract
// is the permission, so a latch never reports an incident and never raises WANTED.
//
// The Capsule Run's matrix-selected tuning above is untouched and still pinned by its own test.
// Every number below is a CANDIDATE, not a matrix selection, and says why it was chosen.

export const BREAKAWAY_RECOVERY_TYPE = 'breakaway_recovery';
export const BREAKAWAY_RECOVERY_SOURCE = 'breakawayContract';
export const BREAKAWAY_THIRD_SHIFT_TAG = 'breakaway:tethys-third-shift';
/** Concord runs the receiving catcher and logs the recovery, so Concord pays and owns the rep. */
export const BREAKAWAY_THIRD_SHIFT_FACTION_ID = 'faction_scn';

export const BREAKAWAY_HEIST_TUNING = Object.freeze({
  /** Same measured station-to-launcher leg as the capsule run, so the same selected window. */
  launchWindowS: PQ019C_HEIST_TUNING.launchWindowS,
  /**
   * CANDIDATE 4 minutes. The capsule's 100 s window was selected for a 100 WU/s capsule on a
   * straight 2 km line. The SP-07 leaves at 60 WU/s off-line and keeps drifting; the player must
   * catch it, bring roughly 2 km of heavy load back, enter the fork under 100 WU/s and let it
   * settle. A shorter window would be a soft-lock wearing a timer.
   */
  runWindowTicks: 14400,
  /** Derived from the launch window exactly as the capsule run's is. */
  unlaunchedWindowTicks: PQ019C_HEIST_TUNING.unlaunchedWindowTicks,
  /**
   * CANDIDATE 960 cr. Below the best honest tier-3 board contract (1320 cr) because this job carries
   * no heat, no WANTED and no patrol; well above an ordinary tier-2 tow at this distance (~580 cr)
   * because the load is heavy, tumbling and must be delivered into a machine, not merely docked.
   */
  rewardCr: 960,
  /** Packet ceiling for the careful-handling bonus: at most 15% of base, scaled by condition. */
  qualityBonusFraction: 0.15,
  /**
   * CANDIDATE 1200 cr. The Quiet's flat price for the SAME assembly: cash, no condition grading, no
   * Concord rep. A premium over the lawful base (960) because they want the machine, and below the
   * best honest tier-3 board contract (1320) so the illicit lane is not strictly dominant. This is a
   * NEW variant policy over one physical object (02_ENGINEERING §8), not a rewrite of the terminal
   * matrix — the Capsule Run's own `fenced_success` row and payout are untouched.
   */
  fencePayoutCr: 1200,
  riskTier: 2,
  /** Concord will not hand a logged recovery to a pilot it considers hostile. */
  minRep: -10,
  /** No reduced-stake retry in this slice: a failed recovery is simply over. */
  recoveryEnabled: false,
});

/**
 * PQ-195.05 — Someone else wants it. The bounded pressure element a live Third Shift run draws:
 * at most two pursuing light hulls plus ONE optional specialist, through the ordinary spawn-budget
 * arbiter (01_FEATURE_SPEC §11). Composition is authored here, not rolled: the third grant — when
 * the sector's budget can afford it — is the tether-control specialist that contests the line.
 * Pressure is spawned ONCE per run at launch, never in proportion to how efficiently the player
 * clears it, and its slots are released when the run settles or the sector is left.
 */
export const BREAKAWAY_PRESSURE = Object.freeze({
  /** Light raider archetypes, reused as shipped (ENEMY catalog ids). */
  lightPool: Object.freeze(['wasp_swarmer', 'reaver_pirate']),
  lightCount: 2,
  lightLevel: 3,
  /** The ONE optional specialist: a tether-control raider that can threaten the player's line. */
  specialistTypeId: 'tether_control_raider',
  specialistLevel: 5,
  /** Spawn ring around the launched assembly — close enough to read, far enough to intercept. */
  spawnDistanceWu: 720,
  /** Motive read by the tactical owner and any inspector of the spawned hull. */
  motive: 'contested_recovery',
});

/**
 * PQ-195.06 — Losing it leaves something to do. A genuinely destroyed SP-07 assembly leaves ONE
 * bounded reduced-value recovery: its wreck, recorded by the ordinary aftermath owner and
 * salvageable through the shipped scanner/salvage path (01_FEATURE_SPEC §104). The pool is a
 * rotor's worth of scrap and electronics — a fraction of the lawful delivery, never a second
 * full reward, and never a resurrection of the original payload. The Capsule Run keeps its
 * historical "nothing left to sell" semantics and is deliberately NOT covered here.
 */
export const BREAKAWAY_WRECK_RECOVERY = Object.freeze({
  /** The reduced-value pool the wreck carries — commodity salvage, not credits. */
  salvagePool: Object.freeze({ cmdty_scrap_metal: 4, cmdty_salvage_electronics: 2 }),
  /** Fresh, not battlefield: it just died here and the hull is still largely intact. */
  wreckClass: 'fresh',
  /** Scan/provenance label the materialized wreck reads as. */
  victimLabel: 'SP-07 Assembly',
});

/** Terminal outcome -> settlement for the lawful recovery. A settled arrival is the only payday. */
export const BREAKAWAY_TERMINAL_SETTLEMENT = Object.freeze({
  lawful_arrival_observed: Object.freeze({ settlement: 'complete', reason: null }),
  // PQ-195.03: the Quiet fence is a REAL second destination for the SAME physical assembly — the
  // lawful run logs Concord's machine at the fork, the illicit handoff sells it to the fence at the
  // fence's own flat terms. A variant POLICY over one arbiter, one receiver family and one object,
  // not a matrix rewrite; `PQ019C_TERMINAL_SETTLEMENT` is deliberately unchanged.
  fenced_success: Object.freeze({ settlement: 'complete', reason: 'fenced' }),
  lawful_confiscation: Object.freeze({ settlement: 'fail', reason: 'confiscated' }),
  payload_destroyed: Object.freeze({ settlement: 'fail', reason: 'payload_destroyed' }),
  expired: Object.freeze({ settlement: 'fail', reason: 'window_expired' }),
  unresolved_absent: Object.freeze({ settlement: 'fail', reason: 'payload_absent' }),
  abandoned: Object.freeze({ settlement: 'fail', reason: 'abandoned' }),
});

/**
 * Player-facing lines for the recovery. Same rules as the capsule run's: each line names its subject
 * and its consequence in words, never a colour, and reads with animation disabled. The `capture_*`
 * lines are the fork's own truth, spoken on real physical attempts rather than once per run.
 */
export const BREAKAWAY_CUE_TEXT = Object.freeze({
  accepted: 'Third Shift accepted — the SP-07 assembly releases from the Tethys launcher shortly',
  launched: 'SP-07 assembly broke away off the catcher line — recover it before it drifts out of reach',
  possessed: 'Assembly on your line — bring it through the Concord catcher fork under 100 WU/s',
  lawful_arrival: 'Assembly settled in the Concord catcher fork — recovery logged and paid',
  fenced: 'The Quiet took the SP-07 at their fence — cash paid on the spot, Concord\'s logged recovery left open',
  destroyed: 'SP-07 assembly destroyed — there is nothing left to deliver',
  expired: 'Recovery window closed — the assembly drifted out of reach',
  absent: 'Assembly lost from the field — the recovery cannot be settled',
  abandoned: 'Third Shift recovery abandoned',
  denied: 'Launcher refused the schedule — the recovery run is not available right now',
  receiver_refused: 'Catcher fork could not take the assembly — no delivery, so nothing is paid',
  capture_acquired: 'Fork rails have the assembly — let it come to rest',
  capture_lost: 'Assembly slipped out of the fork — bring it around again',
  capture_refused_too_fast: 'Too fast for the catcher fork — come in under 100 WU/s',
  capture_refused_too_sideways: 'Too much sideways drift for the fork rails — straighten the approach',
  capture_refused_outside_mouth: 'Off-centre for the fork — line the assembly up with the open end',
});

/**
 * Build the Third Shift offer. Deterministic, like `buildHeistOffer`, so a board refresh, a save
 * round-trip and a fresh boot all agree on its identity.
 */
export function buildBreakawayOffer({ epoch = 0 } = {}) {
  return {
    id: 'breakaway_tethys_third_shift',
    type: BREAKAWAY_RECOVERY_TYPE,
    source: BREAKAWAY_RECOVERY_SOURCE,
    stationId: PQ019C_HEIST_STATION_ID,
    factionId: BREAKAWAY_THIRD_SHIFT_FACTION_ID,
    heistTag: BREAKAWAY_THIRD_SHIFT_TAG,
    heistAttempt: 0,
    reward_cr: BREAKAWAY_HEIST_TUNING.rewardCr,
    // A refunded collateral is a second economy grant; see the capsule run header.
    collateral_cr: 0,
    riskTier: BREAKAWAY_HEIST_TUNING.riskTier,
    minRep: BREAKAWAY_HEIST_TUNING.minRep,
    destStationId: PQ019C_HEIST_STATION_ID,
    destSectorId: PQ019C_HEIST_SECTOR_ID,
    distance: 0,
    // No `duration_s`: the run window is arbitrated, not expired by the mission clock.
    params: {
      heistTag: BREAKAWAY_THIRD_SHIFT_TAG,
      heistAttempt: 0,
      heistVariantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
      launchWindowS: BREAKAWAY_HEIST_TUNING.launchWindowS,
      runWindowTicks: BREAKAWAY_HEIST_TUNING.runWindowTicks,
      unlaunchedWindowTicks: BREAKAWAY_HEIST_TUNING.unlaunchedWindowTicks,
      recoveryEnabled: BREAKAWAY_HEIST_TUNING.recoveryEnabled,
      fValue: 1,
    },
    title: 'The Third Shift — SP-07 Recovery',
    brief: 'A flywheel assembly broke away from the Tethys launcher. Bring it home through the Concord catcher fork.',
    summary: 'Recover a drifting industrial flywheel assembly and deliver it into the Concord catcher fork.',
    description: 'The SP-07 flywheel assembly left the Tethys Surface Launcher off its line and is tumbling '
      + 'toward open space. Latch it, tow it or shove it home, and bring it through the open end of the '
      + 'Concord Lawful Catcher fork under 100 WU/s. The fork brakes the load itself; custody passes only '
      + 'once it comes to rest. Deliver it in good condition and Concord adds a bonus. The Quiet want the '
      + 'same assembly at their own receiver and pay cash off the books, but the lawful contract logs the '
      + 'recovery — their money leaves that log open.',
    authorization: 'CONCORD — LOGGED RECOVERY',
    adminField: 'MANIFEST SP-07 · LAWFUL SALVAGE',
    expiresAtEpoch: null,
    storyTag: null,
    epochPosted: epoch,
  };
}

/**
 * Mission policy per launch variant: which settlement table applies, whether first possession is a
 * reportable theft, which copy is spoken, and the bounded quality bonus. Absent or unknown variant
 * ids are the historical Capsule Run.
 */
export const HEIST_MISSION_POLICIES = Object.freeze({
  [HEIST_CAPSULE_RUN_VARIANT_ID]: Object.freeze({
    variantId: HEIST_CAPSULE_RUN_VARIANT_ID,
    settlement: PQ019C_TERMINAL_SETTLEMENT,
    reportsTheft: true,
    cueText: null,
    qualityBonusFraction: 0,
    // The Capsule Run's fence payout is its matrix-selected `reward_cr`, carried by the offer; this
    // variant-policy override stays off for it.
    fencePayoutCr: 0,
  }),
  [BREAKAWAY_THIRD_SHIFT_VARIANT_ID]: Object.freeze({
    variantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
    settlement: BREAKAWAY_TERMINAL_SETTLEMENT,
    reportsTheft: false,
    cueText: BREAKAWAY_CUE_TEXT,
    qualityBonusFraction: BREAKAWAY_HEIST_TUNING.qualityBonusFraction,
    fencePayoutCr: BREAKAWAY_HEIST_TUNING.fencePayoutCr,
  }),
});

export function heistMissionPolicy(variantId) {
  return (typeof variantId === 'string' && HEIST_MISSION_POLICIES[variantId])
    || HEIST_MISSION_POLICIES[HEIST_CAPSULE_RUN_VARIANT_ID];
}

export default buildHeistOffer;
