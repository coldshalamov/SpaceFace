// Hauler origin-chain content (isolated M3 candidate).
// Pure data + copy. No Math.random, no wall clock, no shared registry writes.
// Taste: terse working-space freight voice (spec2/00 MASTER_TASTE §5).

export const HAULER_CAREER_ID = 'hauler';
export const HAULER_ORIGIN_ID = 'origin.hauler.v1';
export const HAULER_SCHEMA_VERSION = 1;

/** Non-binding: completing or declining never locks other origin careers. */
export const HAULER_EXCLUSIVITY = Object.freeze({
  exclusive: false,
  blocksOtherOrigins: false,
  allowsParallel: true,
  peerCareers: Object.freeze(['hunter', 'prospector']),
});

/** Reward is modest and career-flavored; does not dominate combat or mining paths. */
export const HAULER_COMPLETION_REWARD = Object.freeze({
  careerId: HAULER_CAREER_ID,
  credits: 420,
  reason: 'career:hauler:origin_complete',
  rep: Object.freeze([
    Object.freeze({ factionId: 'faction_mts', delta: 5, reason: 'hauler_origin_complete' }),
  ]),
  // Integration seam: ships/outfitting may surface this as a purchase hint — never auto-fit here.
  unlockHints: Object.freeze(['mod_cargo_hold_s', 'mod_engine_ion_m']),
  exclusivity: HAULER_EXCLUSIVITY,
});

export const HAULER_REOFFER_COOLDOWN_S = 45;
export const HAULER_FAIL_RETRY_COOLDOWN_S = 12;
export const HAULER_MAX_FAILURES_PER_STEP = 3;

/**
 * Three meaningful freight steps:
 * 1) Manifest truth — posted mid vs real bid/ask, short legal haul.
 * 2) Route risk — timer + collateral; loss is recoverable, not career-ending.
 * 3) Market spread — buy cheap at producer role, sell dear at consumer role.
 */
export const HAULER_STEPS = Object.freeze([
  Object.freeze({
    index: 0,
    id: 'manifest_truth',
    title: 'Yard Manifest Trial',
    missionType: 'cargo_delivery',
    riskTier: 0,
    commodityId: 'cmdty_food',
    qty: 8,
    originStationId: 'station_helios',
    originSectorId: 'sector_helios_prime',
    destStationId: 'station_coalition',
    destSectorId: 'sector_helios_prime',
    baseRewardCr: 180,
    collateralCr: 0,
    deadlineSlackS: 240,
    teach: 'Posted mid is not the hold price. Bid and ask are the truth.',
    acceptLine: 'Load provisions. Short hop to Coalition HQ.',
    successLine: 'Manifest closed. Numbers matched the dock board.',
    failLine: 'Manifest voided. Rebook when the hold is free.',
    recoveryLine: 'Retry the yard trial. Same route, thinner pay.',
  }),
  Object.freeze({
    index: 1,
    id: 'route_risk',
    title: 'Timed Spur Run',
    missionType: 'cargo_delivery',
    riskTier: 1,
    commodityId: 'cmdty_fuel_cells',
    qty: 6,
    originStationId: 'station_helios',
    originSectorId: 'sector_helios_prime',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    baseRewardCr: 320,
    collateralCr: 80,
    deadlineSlackS: 180,
    teach: 'Freight risk is time and collateral. Late means the bond stays with the yard.',
    acceptLine: 'Fuel cells under bond. Clock starts at undock.',
    successLine: 'Bond returned. Spur cleared on the clock.',
    failLine: 'Bond burned. Route still open after cooldown.',
    recoveryLine: 'Re-run the spur. Bond is smaller; so is the cut.',
  }),
  Object.freeze({
    index: 2,
    id: 'market_spread',
    title: 'Spread Proof',
    missionType: 'bulk_trade',
    riskTier: 1,
    commodityId: 'cmdty_ore_iron',
    qty: 10,
    // Buy where mining produces (cheap), sell where refinery consumes (dear).
    originStationId: 'station_beltout',
    originSectorId: 'sector_ceres_belt',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    baseRewardCr: 260,
    collateralCr: 0,
    deadlineSlackS: 360,
    teach: 'Profit is the spread you actually trade, not the chart fantasy mid.',
    acceptLine: 'Buy iron at Belt Outpost. Sell at Ceres Refinery.',
    successLine: 'Spread proved. Yard stamps your hauler ticket.',
    failLine: 'Spread not closed. Rebuy when stock allows.',
    recoveryLine: 'Same legs. Count the real buy and sell tickets.',
  }),
]);

export const HAULER_STEP_BY_ID = Object.freeze(
  Object.fromEntries(HAULER_STEPS.map((s) => [s.id, s])),
);

/** Board-facing copy for the first-dock non-binding offer. */
export const HAULER_ORIGIN_OFFER_COPY = Object.freeze({
  title: 'Hauler Origin',
  subtitle: 'Non-binding freight path',
  body: 'Three yard runs. Risk, bond, and real market numbers. Decline freely.',
  acceptLabel: 'Take hauler path',
  declineLabel: 'Not now',
  toastOffer: 'Hauler origin posted at dock. Optional.',
  toastDecline: 'Hauler path declined. Still open later.',
  toastComplete: 'Hauler origin complete. Freight ticket stamped.',
});

/**
 * Per-failure reward decay (deterministic). Attempt 0 = full, then 0.85, 0.7 floor.
 * Keeps recovery meaningful without invalidating hunter/prospector payout bands.
 */
export function haulerRewardMultiplier(attempt) {
  const a = Math.max(0, Math.floor(Number(attempt) || 0));
  if (a <= 0) return 1;
  if (a === 1) return 0.85;
  return 0.7;
}

export function haulerCollateralMultiplier(attempt) {
  const a = Math.max(0, Math.floor(Number(attempt) || 0));
  if (a <= 0) return 1;
  if (a === 1) return 0.75;
  return 0.5;
}
