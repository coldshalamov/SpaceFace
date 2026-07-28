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
 * Selected tuning. Every value here was chosen ONCE from the predeclared fixed-seed matrix in
 * `test/fixtures/pq019c-tuning-matrix.json` and is pinned by `test/pq019c-heist-tuning.test.mjs`.
 * Changing a number without re-running the matrix and re-recording the selection is the thing this
 * file exists to prevent.
 */
export const PQ019C_HEIST_TUNING = Object.freeze({
  /** Seconds from accept to launch. Long enough to fly launcher-side; short enough to feel timed. */
  launchWindowS: 45,
  /** Ticks after launch before the run is called off. 60 Hz sim: 150 s of capsule life. */
  runWindowTicks: 9000,
  /**
   * Witness radius the mission ASKS law to use is not a knob it owns — `lawSecurity` owns
   * `LAW_INCIDENT_WITNESS_RADIUS`. This mirror exists so the matrix can record the interaction and
   * so a future raise above the lawful-station protection floor fails here too. PQ-019B set 450
   * deliberately UNDER the 600 WU floor; above it the witness gate goes vacuous and B's annulus
   * test goes red.
   */
  witnessRadiusMirror: 450,
  /** Hard ceiling the mirror may never reach. The lawful-station protection floor. */
  witnessRadiusCeiling: 600,
  /** Maximum simultaneous job-control leases taken from real, already-flying patrols. */
  responderLeaseCap: 2,
  /** WU beyond which a leased responder gives up and the lease is released. */
  responderLeashWu: 2600,
  /** WU from the nearest live responder at which the run counts as escaped. */
  escapeRadiusWu: 1800,
  /** Consecutive ticks the player must hold `escapeRadiusWu` before `escaped` latches. */
  escapeHoldTicks: 180,
  /** Fence payout, credits. Settled by `_completeMission` through `economy:grantCredits`. */
  payoutCr: 2400,
  /** Reduced-stake recovery payout when the recovery offer is enabled and taken. */
  recoveryPayoutCr: 1100,
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
