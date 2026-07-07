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
});

/** Scarcity pay scales with the LIVE modeled pressure (never a constant — the field sets the pay). */
export const SCARCITY_PAY_SCALE = 1.4;

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

/** Fill an offer's cause prose. PURE. */
export function fillCause(template, tokens) {
  return String(template)
    .replace(/\{commodity\}/g, tokens.commodity || 'goods')
    .replace(/\{sector\}/g, tokens.sector || 'this sector')
    .replace(/\{station\}/g, tokens.station || 'the station')
    .replace(/\s+/g, ' ')
    .trim();
}
