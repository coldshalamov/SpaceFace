// economyContractTemplates.js — BP-12 packet ECONOMY_BORN_MISSIONS (design/revamp/detail/
// E_salvage_economy_contracts.md). Pure data + pure selection: the driver→offer-shape map that
// turns a live sector-field condition into ONE contract shape, with prose that names the commodity
// AND the cause.
//
// The map is spec-literal (the packet's five arrows):
//   route_surplus            → cargo_delivery (haul the surplus OUT to the neighbor that needs it)
//   route_scarcity           → high-pay cargo_delivery fuel run (bring fuel IN to this station)
//   rising danger            → escort / patrol_clear
//   reach_pressure           → bounty_hunt
//   infrastructure_disruption (station loss) → salvage_retrieval
//
// Selection is keyed to the FIELD DRIVER, never a free roll: `selectEconContract` scores each
// template against the local signal deterministically and returns the dominant one (ties break by
// authored order). RNG is used downstream only for qty/destination variety, from the packet's
// seeded stream mulberry32(hash32(seed, stationId, epoch, 'econContract')).
//
// No new tuning duplication: commodities come from the shipped catalog (fuel run = cmdty_fuel_cells
// by definition; surplus picks are seeded from the legal-trade catalog; salvage pools mirror
// missions.js's own salvage_retrieval commodity pair).

/** Field thresholds that gate an offer at all (a calm field offers NOTHING — golden-sim safe). */
export const ECON_CONTRACT_THRESHOLDS = Object.freeze({
  scarcityPressure: 0.25,   // pricePressure above → scarcity fuel run (the packet's acceptance bar)
  surplusPressure: -0.12,   // pricePressure below → surplus haul-out (kernel's route_surplus band)
  dangerTrendRising: 0.0015, // trend.danger above (kernel's own rising band) → escort/patrol
  dangerFloor: 0.45,        // rising danger must also be materially dangerous before we sell escorts
  // BP-12 BLOCKADE_RELIEF: infrastructure_disruption + scarcity this severe → a relief run. Above
  // the plain scarcity band so a relief run only posts when a station is genuinely besieged, and high
  // enough that the relief template beats station_loss_salvage (the field is BOTH disrupted AND starving).
  blockadeScarcity: 0.45,
});

/** Scarcity pay scales with the LIVE modeled pressure (never a constant — the field sets the pay). */
export const SCARCITY_PAY_SCALE = 1.4;

/**
 * BP-12 BLOCKADE_RELIEF_CONTRACTS: relief-run pay scales with the LIVE modeled scarcity (never a
 * constant — the failureMode is a payout untethered from the field). +0% at the blockade threshold
 * up to ~+140% at full pressure. Higher than SCARCITY_PAY_SCALE because running a blockade is the
 * war-profiteer premium.
 */
export const BLOCKADE_PAY_SCALE = 2.0;

/** BP-12 BLOCKADE_RELIEF: the commodities a besieged station is starving for (relief cargo pool). */
export const BLOCKADE_RELIEF_CMDTYS = Object.freeze(['cmdty_medical', 'cmdty_food', 'cmdty_fuel_cells']);

/**
 * The template bank, in authored priority order (used as the deterministic tie-break).
 * Each entry:
 *   key       — stable template id (also the offer's cause key)
 *   offerType — a shipped missions.js type (routes through the existing accept path unchanged)
 *   causeTag(signal)  — the enumerated driver tag this offer traces to (axis-qualified)
 *   strength(signal)  — dominance score; 0/negative = not applicable to this field state
 *   cause     — prose template naming the commodity + the cause ({commodity}/{sector}/{station})
 */
export const ECON_CONTRACT_TEMPLATES = Object.freeze([
  // ── BP-12 BLOCKADE_RELIEF_CONTRACTS — first so it wins the authored-order tie-break when a
  // sector is BOTH infrastructure-disrupted AND deeply scarce (the besieged-station condition).
  // The relief run is a cargo_delivery whose pay scales with the LIVE scarcity and whose card names
  // the blockade cause. The danger tag is real: the field is disrupted, so the escort/patrol template
  // fires alongside on the same driver (the escort leg is the existing patrol_clear/escort path). ──
  Object.freeze({
    key: 'blockade_relief',
    offerType: 'cargo_delivery',
    causeAxis: 'pricePressure',
    appliesTag: 'infrastructure_disruption',
    strength(signal) {
      const disrupted = signal.driver.pricePressure === 'infrastructure_disruption'
        || signal.driver.danger === 'infrastructure_disruption';
      // Only fires when the station is BOTH disrupted AND starving past the blockade threshold — a
      // disrupted-but-fed station posts salvage (station_loss_salvage), not a relief run.
      const starving = signal.pricePressure > ECON_CONTRACT_THRESHOLDS.blockadeScarcity;
      return (disrupted && starving) ? 4 + signal.pricePressure : 0;
    },
    cause: '{station} is besieged — blockade has {commodity} running dry. Run relief cargo in past the interdiction and the station pays war-prices to keep breathing.',
  }),
  Object.freeze({
    key: 'station_loss_salvage',
    offerType: 'salvage_retrieval',
    causeAxis: 'pricePressure',
    appliesTag: 'infrastructure_disruption',
    strength(signal) {
      const tagged = signal.driver.pricePressure === 'infrastructure_disruption'
        || signal.driver.danger === 'infrastructure_disruption';
      return tagged ? 3 + Math.abs(signal.pricePressure) : 0;
    },
    cause: 'Station infrastructure was lost near {sector} — recover {commodity} from the debris before the scrappers do.',
  }),
  Object.freeze({
    key: 'scarcity_fuel_run',
    offerType: 'cargo_delivery',
    causeAxis: 'pricePressure',
    appliesTag: 'route_scarcity',
    strength(signal) {
      return (signal.driver.pricePressure === 'route_scarcity'
        && signal.pricePressure > ECON_CONTRACT_THRESHOLDS.scarcityPressure)
        ? 2 + signal.pricePressure : 0;
    },
    cause: 'Route scarcity has {station} short of {commodity} — supply lanes into {sector} are failing to deliver, and the station pays a premium to cover the gap.',
  }),
  Object.freeze({
    key: 'surplus_haul_out',
    offerType: 'cargo_delivery',
    causeAxis: 'pricePressure',
    appliesTag: 'route_surplus',
    strength(signal) {
      return (signal.driver.pricePressure === 'route_surplus'
        && signal.pricePressure < ECON_CONTRACT_THRESHOLDS.surplusPressure)
        ? 2 + Math.abs(signal.pricePressure) : 0;
    },
    cause: 'A local surplus has {commodity} stacking up at {station} — haul it out of {sector} to a market that still pays.',
  }),
  Object.freeze({
    key: 'reach_bounty',
    offerType: 'bounty_hunt',
    causeAxis: 'danger',
    appliesTag: 'reach_pressure',
    strength(signal) {
      return signal.driver.danger === 'reach_pressure' ? 1.5 + signal.danger : 0;
    },
    cause: 'Crimson Reach raiders are pushing into {sector} — a bounty is posted on the wing working the lanes.',
  }),
  Object.freeze({
    key: 'rising_danger_escort',
    offerType: 'escort', // resolved to patrol_clear for contested_space by the planner
    causeAxis: 'danger',
    appliesTag: 'rising_danger',
    strength(signal) {
      const rising = (signal.trend.danger || 0) > ECON_CONTRACT_THRESHOLDS.dangerTrendRising;
      const tagged = signal.driver.danger === 'contested_space'
        || signal.driver.danger === 'interdiction_wave'
        || signal.driver.danger === 'graph_flow';
      return (rising && tagged && signal.danger > ECON_CONTRACT_THRESHOLDS.dangerFloor)
        ? 1 + signal.danger : 0;
    },
    cause: 'Danger on the {sector} lanes is rising — traffic out of {station} wants guns alongside until it clears.',
  }),
]);

/**
 * selectEconContract(signal) -> { template, strength, causeTag } | null. PURE + deterministic:
 * scores every template against the local signal; the dominant driver wins; ties break by authored
 * order. A calm field selects nothing.
 */
export function selectEconContract(signal) {
  if (!signal || !signal.driver || !signal.trend) return null;
  let best = null;
  for (const template of ECON_CONTRACT_TEMPLATES) {
    const strength = template.strength(signal);
    if (!(strength > 0)) continue;
    if (!best || strength > best.strength) {
      const causeTag = template.appliesTag === 'rising_danger' ? signal.driver.danger : template.appliesTag;
      best = { template, strength, causeTag };
    }
  }
  return best;
}

/**
 * isCalmField(signal) -> boolean. PURE: true when no field-contract template fires.
 * Used by checks and preflight adapters that need a strict silent no-op on quiet sectors.
 */
export function isCalmField(signal) {
  return selectEconContract(signal) == null;
}

/**
 * thresholdGate(signal, key) -> boolean. PURE diagnostic for the named ECON_CONTRACT_THRESHOLDS
 * gate (scarcity / surplus / dangerFloor / blockadeScarcity). Does not select a template.
 */
export function thresholdGate(signal, key) {
  if (!signal) return false;
  const t = ECON_CONTRACT_THRESHOLDS;
  switch (key) {
    case 'scarcity':
      return signal.driver
        && signal.driver.pricePressure === 'route_scarcity'
        && signal.pricePressure > t.scarcityPressure;
    case 'surplus':
      return signal.driver
        && signal.driver.pricePressure === 'route_surplus'
        && signal.pricePressure < t.surplusPressure;
    case 'blockade': {
      const disrupted = signal.driver
        && (signal.driver.pricePressure === 'infrastructure_disruption'
          || signal.driver.danger === 'infrastructure_disruption');
      return !!(disrupted && signal.pricePressure > t.blockadeScarcity);
    }
    case 'risingDanger': {
      const rising = (signal.trend && signal.trend.danger || 0) > t.dangerTrendRising;
      const tagged = signal.driver && (
        signal.driver.danger === 'contested_space'
        || signal.driver.danger === 'interdiction_wave'
        || signal.driver.danger === 'graph_flow'
      );
      return !!(rising && tagged && signal.danger > t.dangerFloor);
    }
    default:
      return false;
  }
}

// ── G06 first-trade teaching contract (authored, seed-stable) ───────────────────────────────
// One corridor-facing board-shaped offer that teaches accept → cargo → deliver → receipt.
// Offered at Helios Station on/after first dock; consumption uses existing missions accept,
// cargo writer, delivery, economy grant, and mission receipt seams.

export const FIRST_TRADE_CONTRACT_KEY = 'first_trade_loop';
export const FIRST_TRADE_CONTRACT_SOURCE = 'firstTradeContract';
export const FIRST_TRADE_CONTRACT_STATION_ID = 'station_helios';
export const FIRST_TRADE_CONTRACT_DEST_STATION_ID = 'station_ceres';
export const FIRST_TRADE_CONTRACT_DEST_SECTOR_ID = 'sector_ceres_belt';

/**
 * Authored first trade contract template.
 * Fields: reason (why this job exists), terms (pays/clock/risk/stake/miss), cargo manifest,
 * and receipt shape expectations for completion.
 */
export const FIRST_TRADE_CONTRACT = Object.freeze({
  key: FIRST_TRADE_CONTRACT_KEY,
  source: FIRST_TRADE_CONTRACT_SOURCE,
  offerType: 'cargo_delivery',
  stationId: FIRST_TRADE_CONTRACT_STATION_ID,
  factionId: 'faction_scn',
  destStationId: FIRST_TRADE_CONTRACT_DEST_STATION_ID,
  destSectorId: FIRST_TRADE_CONTRACT_DEST_SECTOR_ID,
  distance: 1800,
  title: 'First trade: 8u Fuel Cells to Ceres',
  brief: 'Sealed fuel for Ceres Refinery. Accept, hold the manifest, dock, collect payment.',
  reason: 'Helios logistics needs one reliable corridor haul — deliver sealed Fuel Cells to Ceres Refinery so the first trade ledger closes cleanly.',
  preloadedCargo: true,
  terms: Object.freeze({
    paysCr: 420,
    clockS: 1200,
    riskTier: 0,
    stakeCr: 0,
    miss: 'Board closes the file without payment if the deadline lapses or the run is abandoned.',
  }),
  cargo: Object.freeze({
    cmdtyId: 'cmdty_fuel_cells',
    qty: 8,
    preloaded: true,
    label: 'Fuel Cells',
  }),
  receipt: Object.freeze({
    outcome: 'completed',
    requiredFields: Object.freeze([
      'id', 'missionId', 'title', 'type', 'outcome', 'reason', 'at_s',
      'rewardCr', 'collateralRefundCr', 'collateralLostCr', 'stationId', 'destStationId',
    ]),
  }),
});

/**
 * Build a deterministic board-shaped first-trade offer.
 * Same seed ⇒ same offer id and terms (generation determinism).
 * Pure: does not mutate state.
 */
export function buildFirstTradeOffer(seed = 1, options = {}) {
  const template = FIRST_TRADE_CONTRACT;
  const seedN = (Number(seed) || 1) >>> 0;
  const nonce = options && options.nonce != null ? String(options.nonce) : '0';
  // Stable id: first_trade_<seed> — independent of simTime so re-docks do not re-roll terms.
  const id = `first_trade_${seedN.toString(16)}_${nonce}`;
  const qty = template.cargo.qty;
  const cmdtyId = template.cargo.cmdtyId;
  const unitVal = 50; // Fuel Cells catalog baseline; value is cosmetic for preflight cargoValue
  const cargoValue = unitVal * qty;
  const reward_cr = template.terms.paysCr;
  const time_limit_s = template.terms.clockS;
  const collateral_cr = template.terms.stakeCr;
  const riskTier = template.terms.riskTier;
  const reason = template.reason;
  return {
    id,
    source: template.source,
    type: template.offerType,
    stationId: template.stationId,
    factionId: template.factionId,
    reward_cr,
    time_limit_s,
    // Instance path reads duration_s for deadline_s; keep both aligned.
    duration_s: time_limit_s,
    collateral_cr,
    riskTier,
    destStationId: template.destStationId,
    destSectorId: template.destSectorId,
    distance: template.distance,
    preloadedCargo: template.preloadedCargo,
    params: {
      cmdtyId,
      qty,
      cargoValue,
      fValue: 1 + cargoValue / 8000,
      taskTime: 20,
      passengers: 0,
    },
    title: template.title,
    brief: template.brief,
    summary: reason,
    description: reason,
    cause: {
      tag: template.key,
      axis: 'corridor_first_trade',
      line: reason,
      fingerprint: `first_trade:${seedN}:${nonce}`,
    },
    terms: {
      paysCr: reward_cr,
      clockS: time_limit_s,
      riskTier,
      stakeCr: collateral_cr,
      miss: template.terms.miss,
    },
    cargo: {
      cmdtyId,
      qty,
      preloaded: true,
      label: template.cargo.label,
    },
    receipt: {
      outcome: template.receipt.outcome,
      requiredFields: [...template.receipt.requiredFields],
    },
    teach: 'Accept → hold sealed cargo → dock Ceres → collect receipt and payment.',
    storyTag: null,
    expiresAtEpoch: Number.isFinite(Number(options.expiresAtEpoch))
      ? Math.floor(Number(options.expiresAtEpoch))
      : 999999,
  };
}

/** Fill an offer's cause prose. PURE. */
export function fillCause(template, tokens) {
  return String(template)
    .replace(/\{commodity\}/g, tokens.commodity || 'goods')
    .replace(/\{sector\}/g, tokens.sector || 'this sector')
    .replace(/\{station\}/g, tokens.station || 'the station')
    .replace(/\s+/g, ' ')
    .trim();
}
