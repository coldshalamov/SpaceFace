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

export default buildHeistOffer;
