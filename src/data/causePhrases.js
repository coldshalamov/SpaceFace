// causePhrases.js — BP-12 packet CAUSE_LEDGER_TOOLTIP (design/revamp/detail/E_salvage_economy_contracts.md).
//
// THE tag→template bank, ONE source of truth for the cause ledger's prose. Pure data: no DOM, no
// bus, no imports of live systems. Each key below is an ENUMERATED driver tag produced by
// dangerModel.classifyDrivers (src/systems/dangerModel.js) — the only causes the ledger may
// surface. The packet's gate rule ("no economy change without cause") is enforced structurally:
// a tag with no entry here renders NOTHING (never invented free text), and the check script
// (scripts/check-cause-ledger.mjs) pins this bank to the kernel's literal tag set in BOTH
// directions — a kernel tag missing here fails, and an entry here the kernel can't produce fails.
//
// Template tokens (filled by causeLedger.driverPhrase, all optional per template):
//   {dir}     — per-axis direction word from the signal's trend sign (DIRECTION_WORDS below)
//   {faction} — the sector's dominant faction short name (from FACTION_META)
//   {sector}  — the sector display name
//
// Prose notes: "Meridian" / "Concord" / "Reach" / "Vael" appear verbatim where the tag itself
// names the faction (meridian_transmission is BY DEFINITION the MTS trade network) — that is the
// tag's meaning, not invention.

/** Per-axis direction words, chosen by the sign of trend[axis]. */
export const DIRECTION_WORDS = Object.freeze({
  danger: Object.freeze({ up: 'rising', down: 'easing', flat: 'holding steady' }),
  pricePressure: Object.freeze({ up: 'climbing', down: 'falling', flat: 'holding steady' }),
  influence: Object.freeze({ up: 'consolidating', down: 'slipping', flat: 'holding' }),
});

/** Trend magnitudes below this (per day) read as "flat" — matches the kernel's own ~0.002 bands. */
export const TREND_EPSILON = 1e-4;

export const CAUSE_PHRASES = Object.freeze({
  // ── danger axis: why hostile exposure is what it is ──────────────────────────────────────────
  danger: Object.freeze({
    graph_flow: 'Trouble is bleeding in along the lanes from sectors neighboring {sector} — danger {dir}.',
    structural_baseline: 'Quiet by this sector’s own standard — no unusual hostile pressure.',
    vael_frontier: 'This is Vael frontier — the territory itself is hostile, and it is not receding.',
    concord_patrols: 'Concord patrols are responding in force — hostile activity {dir}.',
    reach_pressure: 'Crimson Reach raiders are pushing into these lanes — danger {dir}.',
    contested_space: 'Rival powers contest this space — expect crossfire on the lanes.',
    combat_suppression: 'Recent kills thinned the hostiles operating here — danger {dir}.',
    combat_disruption: 'A lawful ship was destroyed here — local security is unsettled.',
    infrastructure_disruption: 'Station infrastructure was destroyed here — the lanes are exposed.',
    interdiction_wave: 'An interdiction wave swept this sector’s trade lanes.',
    transit_incident: 'A transit ambush was reported on the approach lanes.',
  }),

  // ── pricePressure axis: why prices moved (the "why prices changed" tooltip) ──────────────────
  pricePressure: Object.freeze({
    market_balance: 'Prices near equilibrium — supply is meeting demand.',
    meridian_transmission: 'Meridian trade routes are transmitting the swing — prices {dir} with the network.',
    route_scarcity: 'Route scarcity — supply lanes are failing to deliver, and prices are {dir}.',
    route_surplus: 'Local surplus — goods are stacking up, and prices are {dir}.',
    trade_shock: 'A heavy trade just moved this market — prices {dir} on the volume.',
    infrastructure_disruption: 'Lost infrastructure choked local supply — prices {dir}.',
  }),

  // ── influence axis: why control looks the way it does ────────────────────────────────────────
  influence: Object.freeze({
    territorial_anchor: '{faction} holds {sector} uncontested.',
    territorial_shift: 'Control is shifting — {faction} now holds the dominant position.',
    contested_influence: 'Influence here is contested — {faction} leads by a thin margin.',
    territory_flip: 'The sector changed hands — {faction} took control.',
    combat_attrition: 'Combat losses are eroding the standing powers’ grip here.',
  }),
});

/** The three signal axes, in display order. */
export const CAUSE_AXES = Object.freeze(['danger', 'pricePressure', 'influence']);
