// newsTemplates.js — flavor-themed headline templates for the market news ticker + dock event cards.
// Pure data + a couple of tiny pure helpers. NO imports of live systems, NO DOM, NO Math.random.
//
// The economy (economy.js / economyCycles.js) is already deep but invisible: stations run hidden
// price cycles (stable/volatile/rising/falling/turbulent) and spontaneous events fire on markets
// (shortage / boom / blockade / piracy). This module turns those raw signals into short in-fiction
// headlines, themed to SpaceFace's atmospheric-economy lore:
//   • Silt        — refined atmospheric slurry; the substrate that keeps sectors breathable.
//   • air/canisters — breathable air is a traded scarcity; The Quiet run unmarked canisters.
//   • MTS         — Meridian Trade Syndicate, the trade guild that shorts failing sectors.
//   • Concord     — the atmospheric-viability authority (allocation notices, atmo-debt).
//   • The Quiet   — smuggler network that moves what the syndicates won't.
//
// Templates use {tokens} substituted by the generator in marketNews.js. Every event kind has an
// array of variants; the generator picks one deterministically from a seed hash so the same event
// always reads the same. Keep variants short (one line) — this is a ticker, not prose.

/** Category-level flavor tags so headlines can lean on the atmospheric fiction where it fits. */
export const COMMODITY_FLAVOR = Object.freeze({
  // atmospheric-core goods get bespoke scarcity language
  cmdty_ice_water:    { air: true,  noun: 'water ice' },
  cmdty_volatiles:    { air: true,  noun: 'ice volatiles' },
  cmdty_gas_hydrogen: { air: true,  noun: 'hydrogen feedstock' },
  cmdty_gas_helium3:  { air: true,  noun: 'helium-3' },
  cmdty_fuel_cells:   { air: true,  noun: 'fuel cells' },
  cmdty_medical:      { relief: true, noun: 'medical supplies' },
  cmdty_food:         { relief: true, noun: 'provisions' },
});

// {name}    -> commodity display name (e.g. "Water Ice")
// {station} -> station display name / id
// {noun}    -> lowercased good noun for prose
export const HEADLINE_TEMPLATES = Object.freeze({
  shortage: [
    '{station}: {name} runs dry — Concord flags atmo-debt review',
    'Silt lines thin at {station}; {noun} shortage bites',
    'MTS shorts {station} as {noun} stocks collapse',
    '{station} rations {noun} — canister prices spike',
    'Scarcity alert: {name} unavailable across {station}',
  ],
  boom: [
    '{station} floods the lanes with {noun} — prices crater',
    'Surplus {name} glut at {station}; buyers move in',
    '{station}: {noun} overstock, MTS dumps below cost',
    'Bumper {noun} run into {station} tanks the spread',
    '{name} boom at {station} — the syndicate is selling',
  ],
  blockade: [
    '{station} sealed — {noun} traffic frozen under blockade',
    'Blockade at {station}: MTS withholds {noun}, spreads widen',
    '{station} locked down; The Quiet quote canister rates',
    'Concord embargo strangles {noun} into {station}',
    'Choke at {station} — {name} stops moving',
    'Customs net tightens at {station}; {noun} manifests triple-checked',
  ],
  piracy: [
    'Raiders work the {station} approach — {noun} convoys thin',
    '{station}: {noun} shipments hit; escorts scarce',
    'Piracy spike near {station} rattles the {noun} trade',
    'The Reach bleeds {station} of {noun}; premiums climb',
    'Ambushes off {station} — insurers flag {name}',
    'Mine-wake warnings near {station}; {noun} haulers divert',
    'PD curtain reported over a {station} convoy — {name} still moving',
    'Quiet sniper contact on the {station} bearing; {noun} premiums jump',
  ],
  // ECON-P2 freight embodiment — live hauler loss / arrival (cause-tagged)
  freight_loss: [
    'Freighter lost near {station} — {noun} runs thin',
    '{station}: inbound {noun} freighter destroyed; shelves tighten',
    'Lane kill: {name} shipment never reaches {station}',
    'Hauler down off {station}; insurers flag {noun}',
    '{station} scarcity spike after {noun} freighter loss',
  ],
  freight_arrival: [
    '{station} takes delivery of {noun}',
    'Inbound freighter offloads {name} at {station}',
    '{noun} lands at {station} — stocks ease',
    'Hauler docked at {station}; {name} hits the floor',
    '{station}: freight arrival softens {noun} prices',
  ],
  // generic fallback for unknown event types
  event: [
    '{station}: {name} market unsettled',
    'Movement in {noun} at {station}',
    '{station} price regime shifts on {name}',
  ],
});

// Regime-change chatter (from economyCycles): a station commodity's hidden formula flipped.
export const REGIME_TEMPLATES = Object.freeze({
  rising:    ['{station}: {noun} demand climbing', 'Buyers circle {name} at {station}'],
  falling:   ['{station}: {noun} demand cooling', '{name} softens at {station}'],
  volatile:  ['{station} {noun} turns choppy', 'Wild swings in {name} at {station}'],
  turbulent: ['{station}: {noun} market turbulent', 'No floor on {name} at {station} yet'],
  stable:    ['{station} {noun} settles', '{name} steadies at {station}'],
  sine:      ['{station} {noun} enters a cycle', '{name} finds a rhythm at {station}'],
  quadratic: ['{station}: {noun} curve bends', '{name} traces a new arc at {station}'],
  cubic:     ['{station}: {noun} market inflects', 'An inflection hits {name} at {station}'],
  sqrt:      ['{station}: {noun} eases into a new path', '{name} flattens after a burst at {station}'],
  log:       ['{station}: {noun} demand saturates', '{name} climbs then settles at {station}'],
});

// Dock event-card copy (title + body) keyed by event kind. Body uses the same {tokens}.
export const CARD_TEMPLATES = Object.freeze({
  shortage: { badge: 'SHORTAGE', tone: 'warn',
    title: '{name} Shortage', body: '{station} is short on {noun}. Buy elsewhere and sell high here.' },
  boom:     { badge: 'SURPLUS', tone: 'good',
    title: '{name} Surplus', body: '{station} is flush with {noun}. Cheap to buy, thin margins to sell.' },
  blockade: { badge: 'BLOCKADE', tone: 'danger',
    title: '{name} Blockade', body: '{noun} is frozen at {station}. Spreads are punishing until it lifts.' },
  piracy:   { badge: 'PIRACY', tone: 'danger',
    title: 'Piracy: {name}', body: 'Raiders are hitting {noun} runs near {station}. Escort or reroute.' },
  freight_loss: { badge: 'FREIGHT LOSS', tone: 'danger',
    title: 'Freighter Lost: {name}', body: 'A hauler carrying {noun} was destroyed near {station}. Expect tighter stock.' },
  freight_arrival: { badge: 'ARRIVAL', tone: 'good',
    title: 'Freight Arrival: {name}', body: '{noun} just landed at {station}. Live traffic moved the market.' },
  event:    { badge: 'NOTICE', tone: 'info',
    title: '{name} Advisory', body: '{noun} market is unsettled at {station}.' },
});

/** Normalize an arbitrary economy event type string to a known template key. */
export function normalizeKind(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'shortage') return 'shortage';
  if (t === 'boom' || t === 'surplus') return 'boom';
  if (t === 'blockade' || t === 'embargo') return 'blockade';
  if (t === 'piracy' || t === 'piracy_spike' || t === 'raid') return 'piracy';
  if (t === 'freight_loss' || t === 'freight_destroyed' || t === 'hauler_lost') return 'freight_loss';
  if (t === 'freight_arrival' || t === 'hauler_arrival') return 'freight_arrival';
  return 'event';
}

/** Substitute {tokens} in a template string from a flat token map. Missing tokens collapse to ''. */
export function fillTemplate(tpl, tokens) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = tokens && tokens[k];
    return v == null ? '' : String(v);
  });
}
