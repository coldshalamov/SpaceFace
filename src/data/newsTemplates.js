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

/** Category-level flavor tags so headlines can lean on the atmospheric fiction where it fits.
 *  `noun` is the lowercased prose noun substituted for {noun}; the flags mark which goods get
 *  bespoke scarcity language (air = atmospheric-core, relief = relief cargo). */
export const COMMODITY_FLAVOR = Object.freeze({
  // atmospheric-core goods get bespoke scarcity language
  cmdty_ice_water:    { air: true,  noun: 'water ice' },
  cmdty_volatiles:    { air: true,  noun: 'ice volatiles' },
  cmdty_gas_hydrogen: { air: true,  noun: 'hydrogen feedstock' },
  cmdty_gas_helium3:  { air: true,  noun: 'helium-3' },
  cmdty_fuel_cells:   { air: true,  noun: 'fuel cells' },
  cmdty_medical:      { relief: true, noun: 'medical supplies' },
  cmdty_food:         { relief: true, noun: 'provisions' },
  // --- raw ore ---
  cmdty_ore_iron:          { noun: 'iron ore' },
  cmdty_ore_copper:        { noun: 'copper ore' },
  cmdty_ore_titanium:      { noun: 'titanium ore' },
  cmdty_silicate:          { noun: 'silicate rock' },
  cmdty_ore_platinoid:     { noun: 'platinoid ore' },
  cmdty_ore_bronzium:      { noun: 'nickel ore' },
  cmdty_ore_silverium:     { noun: 'silver ore' },
  cmdty_ore_goldium:       { noun: 'gold ore' },
  cmdty_ore_platinium:     { noun: 'platinum ore' },
  cmdty_ore_einsteinium:   { noun: 'stellarite ore' },
  cmdty_gem_emerald:       { noun: 'raw emerald' },
  cmdty_gem_ruby:          { noun: 'raw ruby' },
  cmdty_gem_diamond:       { noun: 'raw diamond' },
  cmdty_exotic_amazonite:  { noun: 'prism shards' },
  // --- gas / crystal / exotic ---
  cmdty_crystal_silica:    { noun: 'silica crystal' },
  cmdty_crystal_lumin:     { noun: 'phosphor crystal' },
  cmdty_exotic_xenium:     { noun: 'xenium' },
  cmdty_filament_sample:   { noun: 'filament samples' },
  cmdty_live_specimen:     { noun: 'cradled specimens' },
  cmdty_dmc_black_box:     { noun: 'flight recorders' },
  // --- contaminated-salvage bioresources ---
  cmdty_calcified_filament:  { noun: 'calcified filament' },
  cmdty_conductive_fiber:    { noun: 'conductive fiber' },
  cmdty_relay_nodule:        { noun: 'relay nodules' },
  cmdty_membrane_laminate:   { noun: 'membrane laminate' },
  cmdty_cyst_resin:          { noun: 'cyst resin' },
  cmdty_nerve_glass:         { noun: 'nerve glass' },
  cmdty_host_archive_sample: { noun: 'archive samples' },
  cmdty_sterile_shell:       { noun: 'sterile shells' },
  cmdty_spore_chimney_core:  { noun: 'chimney cores' },
  cmdty_interface_tissue:    { noun: 'interface tissue' },
  cmdty_glass_back_scale:    { noun: 'glassback scales' },
  cmdty_spore_catalyst:      { noun: 'spore catalyst' },
  // --- lattice protocol credentials ---
  cmdty_gate_handshake:      { noun: 'handshake tokens' },
  cmdty_inertial_datum:      { noun: 'inertial datums' },
  cmdty_revocation_beacon:   { noun: 'revocation beacons' },
  cmdty_unbroken_lens:       { noun: 'unbroken lenses' },
  // --- refined / site industry / component ---
  cmdty_refined_metals:   { noun: 'refined metals' },
  cmdty_alloys:           { noun: 'composite alloys' },
  cmdty_polymers:         { noun: 'polymers' },
  cmdty_purified_silica:  { noun: 'purified silica' },
  cmdty_regocrete:        { noun: 'regocrete' },
  cmdty_control_unit:     { noun: 'control units' },
  cmdty_comp_hullplate:   { noun: 'hull plate' },
  cmdty_comp_circuitry:   { noun: 'circuitry' },
  // --- tech ---
  cmdty_microchips:       { noun: 'microchips' },
  cmdty_electronics:      { noun: 'electronics' },
  cmdty_quantum_cores:    { noun: 'quantum cores' },
  // --- consumer / luxury ---
  cmdty_consumer_goods:   { noun: 'consumer goods' },
  cmdty_textiles:         { noun: 'textiles' },
  cmdty_luxury_goods:     { noun: 'luxury goods' },
  cmdty_art:              { noun: 'art and antiques' },
  // --- salvage ---
  cmdty_scrap_metal:         { noun: 'scrap metal' },
  cmdty_salvage_electronics: { noun: 'salvage electronics' },
  cmdty_classified_salvage:  { noun: 'classified salvage' },
  // --- contraband ---
  cmdty_narcotics:        { noun: 'contraband narcotics' },
  cmdty_stolen_goods:     { noun: 'stolen goods' },
  // --- military ---
  cmdty_weapons:          { noun: 'weapon systems' },
  cmdty_munitions:        { noun: 'munitions' },
  cmdty_impulse_charge:   { noun: 'impulse charges' },
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
    '{station} intake desk stops quoting {noun}; the queue keeps counting anyway',
    'Concord allocation notice: {name} reserved for {station} core wards only',
    'The Quiet quote triple on {noun} into {station} — no receipt offered',
    '{station} posts atmo-debt interest on every {noun} drum still docked',
    'Auditors find {station} {noun} ledger three shifts short of physical',
    '{name} shelves bare at {station}; the resupply manifest calls it a delay',
    '{station} rations continue: {noun} allotment stamped for crew only',
    'Broker desks at {station} stop printing {noun} quotes at all',
    'Two manifests claim the last {noun} at {station}; neither lifts cargo',
    'Dock crews at {station} turn away {noun} buyers at the gate line',
  ],
  boom: [
    '{station} floods the lanes with {noun} — prices crater',
    'Surplus {name} glut at {station}; buyers move in',
    '{station}: {noun} overstock, MTS dumps below cost',
    'Bumper {noun} run into {station} tanks the spread',
    '{name} boom at {station} — the syndicate is selling',
    'Dock cranes stack {noun} to the ceiling at {station} — buyers wanted',
    '{station} auction ring cannot clear the {noun} floor — lots roll to next cycle',
    'MTS marks {name} a loss-leader at {station}; the ledger argues',
    '{noun} stacks above the safety line at {station}; stewards bill the air',
    'Every berth at {station} wants to sell you {noun}; nobody wants to store it',
    '{station} deep-storage report: {name} aged past its invoice date',
    'Freight clerks at {station} pay unload fees in {noun} again',
    'The spread on {name} at {station} narrows to the width of a filing error',
    'Buyers at {station} haul {noun} by the skip and still owe nothing',
    '{station} inventory notice: {noun} counted twice to make the number honest',
  ],
  blockade: [
    '{station} sealed — {noun} traffic frozen under blockade',
    'Blockade at {station}: MTS withholds {noun}, spreads widen',
    '{station} locked down; The Quiet quote canister rates',
    'Concord embargo strangles {noun} into {station}',
    'Choke at {station} — {name} stops moving',
    'Customs net tightens at {station}; {noun} manifests triple-checked',
    'Cordon at {station} cites {noun} manifest irregularities; lane traffic holds',
    '{station} gate queue runs to the marker buoys — {name} permits required',
    'Concord inspectors repack every {noun} pallet at {station} by hand',
    'The embargo ledger at {station} lists {name} under "temporarily theoretical"',
    '{station} customs floor: {noun} declarations read aloud in full, twice',
    'Patrol net at {station} boards {noun} haulers before the beacon',
    '{name} throughput at {station} drops to courier weight only',
    '{station} blockade desk sells exemptions; it does not honor them',
    'Watch ships paint the {station} approach — {noun} runners reroute',
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
    'Escort boards at {station} charge triple after the {noun} convoy went quiet',
    'A {noun} hauler out of {station} answered one too many hails',
    '{station} insurers stop writing {name} coverage until the lane clears',
    'Reach colors over the {station} lane — {noun} haulers fly in packs',
    'Distress buoy off {station} repeats a {noun} manifest with no ship attached',
    'The ransom desk at {station} posts standard {noun} rates by the drum',
    '{name} convoy out of {station} jumps early; one hull misses the window',
  ],
  // ECON-P2 freight embodiment — live hauler loss / arrival (cause-tagged)
  freight_loss: [
    'Freighter lost near {station} — {noun} runs thin',
    '{station}: inbound {noun} freighter destroyed; shelves tighten',
    'Lane kill: {name} shipment never reaches {station}',
    'Hauler down off {station}; insurers flag {noun}',
    '{station} scarcity spike after {noun} freighter loss',
    '{station} mourns a {noun} manifest; the lane keeps the wreck',
    'Transponder silence off {station} — {name} cargo joins the debris census',
    'The {noun} hull that missed {station} is listed as late, then not listed',
    'Recovery claim filed: {name} freighter outside {station} is a total loss',
    'Beacon logs show the {noun} freighter braking late for {station} — once',
    '{station} dock schedule still holds a slot for the lost {name} hauler',
    'Insurers at {station} settle the {noun} loss in salvage rights only',
    'A {noun} spill drifts the {station} lane; cleanup billed to the estate',
    'The wreck off {station} still squawks {name} under a dead crew code',
    '{station} cargo desk marks the lost {noun} run "weather-related"',
  ],
  freight_arrival: [
    '{station} takes delivery of {noun}',
    'Inbound freighter offloads {name} at {station}',
    '{noun} lands at {station} — stocks ease',
    'Hauler docked at {station}; {name} hits the floor',
    '{station}: freight arrival softens {noun} prices',
    'A tired hauler noses into {station} — {noun} hits the tally sheet',
    '{station} cranes swing for the {name} berth; unloading before the ink dries',
    'Dock bell at {station}: {noun} lot cleared customs without comment',
    'The {station} queue finally moves — a {noun} freighter docked',
    '{name} arrives at {station} under a registry the desk chose not to read',
    'Overnight delivery at {station}: {noun} drums cold-stacked and sealed',
    '{station} posts one fresh {noun} lot; the queue forms itself',
    'Freight office at {station} stamps the {name} arrival three days late',
    'The {noun} hauler at {station} wants out by first bell — stock moves fast',
    '{station} manifest desk calls the {name} arrival "routine"; the prices disagree',
  ],
  // INF: a contracted feeder died before its handoff and the delivery run came back empty. The
  // shortfall is world evidence, never a player accusation — the miner may have died to anything.
  // Every variant names the broken link (the empty shelf / the lost feeder), not just generic
  // variance, or the line reads as ordinary noise instead of a remembered consequence.
  freight_short: [
    'Belt run docks empty at {station} — its feeder never made the handoff',
    '{station} intake short: the feeder hauler found an empty shelf',
    'A feeder run came up light at {station} — the miner shelf was bare',
    '{station} reports its ore run delivered nothing — feeder lost upstream',
    '{station} weighs the ore run light again — the belt feeder never docked',
    'The {station} intake log reads: feeder missing, shelf empty, excuse pending',
    'No feeder at the {station} handoff; the hauler took home what it brought',
    '{station} counts a shortfall where the feeder run used to be',
    'Feeder transponder dark off {station}; the delivery shelf stays empty',
    '{station} pit boss files the third empty ore dock this cycle',
    'The belt handoff failed upstream of {station} — intake quiet all shift',
    '{station} feeder roster shows one name scratched out in two inks',
    'Empty shelf at {station}: the miner run is officially delayed, unofficially gone',
    '{station} tallies the feeder loss as weather. The belt disagrees.',
    'The ore line into {station} stopped at the middle — feeder lost upstream',
  ],
  // generic fallback for unknown event types
  event: [
    '{station}: {name} market unsettled',
    'Movement in {noun} at {station}',
    '{station} price regime shifts on {name}',
    '{station}: {name} desk posts a new number and a new excuse',
    'Quiet movement in {noun} at {station} — the board pretends not to watch',
    '{station} market notice: {name} repriced by hands unseen',
    'The {noun} tape at {station} flickers between two honest numbers',
    '{station} closes the {name} book early; the clerk cites staffing',
    'Ledger clerks at {station} debate {noun} in a corridor, quietly',
    '{name} at {station} holds the price of a rumor until confirm',
    'Two brokers at {station} disagree on {noun}; both are probably right',
    '{station} market board: {name} under review, under count, underpriced',
    'The {noun} spread at {station} moved before anyone admitted moving it',
    '{station} filing: {name} volume "unusual, within tolerance"',
    '{noun} quotes stall at {station} while the desk checks the last three',
  ],
});

// Regime-change chatter (from economyCycles): a station commodity's hidden formula flipped.
export const REGIME_TEMPLATES = Object.freeze({
  rising: [
    '{station}: {noun} demand climbing', 'Buyers circle {name} at {station}',
    '{station} posts a {noun} premium nobody admits setting',
    'Demand memo: {name} at {station} upgraded from stocked to sought',
    '{noun} buyers queue at {station} before the desk opens',
    '{station} ledger shows {name} climbing the chart twice',
  ],
  falling: [
    '{station}: {noun} demand cooling', '{name} softens at {station}',
    '{noun} bids at {station} thin to the polite ones',
    '{station} writes {name} down one grade, quietly',
    'Sell-side desks leave {station}; {noun} follows them out',
    '{name} stalls at {station} — the floor is a rumor now',
  ],
  volatile: [
    '{station} {noun} turns choppy', 'Wild swings in {name} at {station}',
    '{station} {noun} quote changes between the desk and the dock',
    'No two {name} quotes agree at {station} today',
    '{noun} tape at {station} skips a beat, then three',
    '{station} boards flash {name} in two inks',
  ],
  turbulent: [
    '{station}: {noun} market turbulent', 'No floor on {name} at {station} yet',
    '{noun} at {station} trades like a dice cup',
    '{station} halts {name} repricing twice in one shift',
    'The {noun} book at {station} is being rewritten mid-page',
    '{name} floor collapses at {station}; ceiling pending review',
  ],
  stable: [
    '{station} {noun} settles', '{name} steadies at {station}',
    '{noun} at {station} holds the same number three audits running',
    '{station} posts {name} flat; the desk calls it healthy',
    'Boring week for {noun} at {station}; the auditors approve',
    '{name} at {station} finds its level and keeps it',
  ],
  sine: [
    '{station} {noun} enters a cycle', '{name} finds a rhythm at {station}',
    '{noun} at {station} swings on schedule; the desk sells the calendar',
    '{station} {name} cycle confirmed — the chart draws a wave',
    'Watch the {noun} tide at {station}; it keeps its own tide table',
    '{name} at {station} rises and falls on a rhythm nobody owns',
  ],
  quadratic: [
    '{station}: {noun} curve bends', '{name} traces a new arc at {station}',
    '{station} {noun} curve steepens; the desk pretends it saw this',
    '{name} accelerates at {station} along a bend no model filed',
    'The {noun} trend at {station} is curving toward a verdict',
    '{station} plots {name}: the line refuses to stay straight',
  ],
  cubic: [
    '{station}: {noun} market inflects', 'An inflection hits {name} at {station}',
    '{station} {noun} chart turns twice; brokers take sides',
    '{name} at {station} inflects — the curve remembers a past',
    'The {noun} line at {station} bends, straightens, bends again',
    '{station} logs a {name} inflection; both tails are live',
  ],
  sqrt: [
    '{station}: {noun} eases into a new path', '{name} flattens after a burst at {station}',
    '{name} at {station} bursts then levels — the flat part is the news',
    '{noun} surge at {station} decays into a plateau',
    '{station} {name} flattens after the early run',
    'The {noun} climb at {station} runs out of ladder politely',
  ],
  log: [
    '{station}: {noun} demand saturates', '{name} climbs then settles at {station}',
    '{name} demand at {station} saturates; growth files for retirement',
    '{noun} climbs then holds at {station} — saturation confirmed',
    '{station} {name} curve tops out; the desk bills the ceiling',
    'The {noun} ramp at {station} ends in a long flat answer',
  ],
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
