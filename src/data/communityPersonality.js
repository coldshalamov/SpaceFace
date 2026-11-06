// src/data/communityPersonality.js — DUST P1d community personality cards.
//
// One card per named community the DUST program has voiced (design/program/dust/TONE_BIBLE.md §3).
// A card is a promise: every field must eventually be readable on the ordinary route. The first
// readers are the lived 5xx vignettes bound to each community (their color/receipt lines draw
// from `voiceSamples` via sectorLine/stationLine below); barks, radio and station glass follow
// under PULSE-RADIO rows 432/434.
//
// Cards are pure data. No imports, no RNG, no side effects (src/data/AGENTS.md). Every `id` is a
// REAL runtime place — station id or sector id from sectors.js; the anchoring maps below only
// alias real ids, never invent them. Sample lines obey the house brevity caps: ≤12 words and
// ≤90 characters, because any of them can surface in comms (TONE_BIBLE §2 rule 8).

function card(id, bit, wound, institution, obsession, runningGag, voiceSamples, silhouette, radioAccent) {
  return Object.freeze({
    id: Object.freeze(id),
    bit: Object.freeze(bit),
    wound: Object.freeze(wound),
    institution: Object.freeze(institution),
    obsession: Object.freeze(obsession),
    runningGag: Object.freeze(runningGag),
    voiceSamples: Object.freeze(voiceSamples.map(Object.freeze)),
    silhouette: Object.freeze(silhouette),
    radioAccent: Object.freeze(radioAccent),
  });
}

export const COMMUNITY_PERSONALITY = Object.freeze([
  // ── Helios Station — the Concord core's trade hub (sector_helios_prime) ────────────────────
  // Grounded: Bay 7 "still files tickets for" its shelved pad; the Candle Fleet's dark
  // twenty-fifth plinth; the standing iron shortage book; Checkpoint Niner's eleven-month lamp.
  card(
    'station_helios',
    'The mall at the end of the war — still honoring gift cards, still short on iron.',
    'The Candle Fleet’s twenty-fifth plinth is dark on purpose; nobody reads the smear.',
    'Bonded Lost & Found, Bay 7 — every unclaimed item keeps a ticket, a shelf, and a theory.',
    'Provenance paperwork; they can tell you who owned a bolt.',
    'The arrival board is always one war behind.',
    [
      'Lost something? We have it. We have too much of it.',
      'Bay 7 files its own tickets. No action required.',
      'Gift cards honored at face value. Grief is extra.',
      'Iron is short. Questions about iron are shorter.',
      'The dark candle is a record too. Please respect it.',
    ],
    'Warm shopfront practicals; coiled queue ropes; one deliberately dark plinth lamp.',
    'Concierge-calm; reads delays like tasting notes.',
  ),

  // ── Ceres Refinery — the wreck-field company town (sector_ceres_belt) ──────────────────────
  // Grounded: the Wreck Cathedral and Second Measure Shipbreak; the vigil "tally reads only
  // tonnage"; the driller "sold for scrap twice"; the Ash Pin — "the books are what the belt
  // has instead of graves."
  card(
    'station_ceres',
    'A company town whose company is a graveyard, working cathedral hours.',
    'The Second Measure’s first shift never surfaced; the shipbreak tally reads only tonnage.',
    'The wreck registry, grading tragedies like produce since the first staking.',
    'Clean cuts; a neat breakline is a moral act.',
    '“Pre-owned, barely sank.”',
    [
      'The Cathedral keeps the names. The scale keeps the tonnage.',
      'Pre-owned, barely sank. Third owner gets the charm.',
      'Clean cut, clean conscience. Ragged cut, we talk.',
      'Shift one never surfaced. Their hours still run.',
      'Sold twice already. Rock like this finds owners.',
    ],
    'Flare-rack orange on final; chalk tally boards at the scale; an inward-facing worklight.',
    'Shift-call cadence; reads the dead between commodity ticks.',
  ),

  // ── Belt Outpost — the rock camp at the seam (sector_ceres_belt) ───────────────────────────
  // Grounded: the ration skiff that "never lands enough"; the Short-Ration Pod, logged
  // delivered while the mess ate paste — "both records are correct"; the Inbound Weigh Pin's
  // eighteen-minute chalk rows.
  card(
    'station_beltout',
    'A rock-camp outpost that eats same-shift and files same-shift.',
    'The ration skiff never lands enough; the manifest says it did.',
    'The Mess Board, which outranks the Shift Board whenever the pot is open.',
    'Assay tags and berth-minute tallies; eighteen minutes is a good one.',
    'The manifest says delivered.',
    [
      'Manifest says forty bricks. Eat slowly anyway.',
      'Scale’s open. The scale is always open.',
      'Paste again. The manifest disagrees with the pot.',
      'Berth minutes are chalk. Eighteen is a good one.',
      'The mess keeps minutes. The Board keeps the mess.',
    ],
    'One ration lamp over the scale; chalk-dust haze; a patched, apologetic food skiff.',
    'Mess-hall clipper; the menu read like a casualty list.',
  ),

  // ── Tethys Trade Hub — the Meridian exchange (sector_tethys_junction) ──────────────────────
  // Grounded: the live DMC–MTS front board; the Weigh-Slip Buoy; the Split Station the charts
  // will not quote; the DESK register — "your account is standing; his is not."
  card(
    'station_tethys',
    'The exchange that traded through its own funeral; the front board never closed.',
    'The Split Station hums off-lane; the exchange will not quote it.',
    'The Shadow Desk — one certified account eats the minute, and delays are split by hand.',
    'Standing accounts; a delay split to the half-minute is a sacrament.',
    '“Nothing personal” — which is personal.',
    [
      'Your account is standing. That is the bad news.',
      'We split delays, not blame. Blame is single-sourced.',
      '“Nothing personal” is how every fight here starts.',
      'Sealed freight, live board. Do not read both aloud.',
      'The board is live. The war on it is not.',
    ],
    'Amber ticker wash over stacked manifests; one rubber stamp worn to a nub.',
    'Auctioneer-calm; prices first, weather as an afterthought.',
  ),

  // ── Customs Gate — the toll plate at the Junction (sector_tethys_junction) ─────────────────
  // Grounded: "toll plate and a scanner; everything transits, nothing transits unread"; the
  // Tally queue on the Helios approach; Checkpoint Niner's green lamp, eleven months unbroken.
  card(
    'station_customs',
    'A toll booth with a sector’s worth of gravity, weighing everything twice.',
    'The lamp has been green eleven months; nobody remembers who authorizes yellow.',
    'The Toll Plate — a schedule of fees amended hourly, enforced gently and absolutely.',
    'Double-entry scanning; everything transits, nothing transits unread.',
    'Every fee is small; the total is not.',
    [
      'Toll is one credit. Processing the toll is forty.',
      'Green means go. It has meant go for months.',
      'Declare the ore. The ore is declared. Good.',
      'Everything transits. Nothing transits unread. Smile optional.',
      'The queue is the toll. The plate is extra.',
    ],
    'Twin scan arcs closed like a caliper; one green lamp, the only color aboard.',
    'Customs drone; fines read like liturgy, a pause before each number.',
  ),

  // ── Forge Foundry — the baptizing line (sector_vesta_forge) ────────────────────────────────
  // Grounded: the Choir shrine "in the foundry's shadow"; the Refuel Depot that "posts shift
  // work in verses"; Slag-Run Nineteen's dead hauler nobody claims "because claiming her means
  // towing her"; the dumped-reactor glow of the slag field.
  card(
    'station_forge',
    'A foundry that baptizes its plate and sells it by the coil.',
    'Slag-Run Nineteen still parks in the glow; claiming her means towing her.',
    'The first-coil tithe — the shrine is paid before the ledger, in verse, on record.',
    'Plate thickness and honest alloy; the exact temperature of a promise.',
    'The tithe is verse; the verse gets longer.',
    [
      'The line is hot. The verse runs longer. Work.',
      'First coil tithed to the shrine. Invoice the rest.',
      'Alloy is honest here. Poetry costs extra.',
      'Claim the dead hauler? Towing is believing.',
      'Slag glow is ambience. Shielding is a lifestyle.',
    ],
    'Crucible orange through steam; a bell over the shipping door; verse chalked on plate.',
    'Liturgical foundry hymns between crane calls.',
  ),

  // ── Sker Bazaar — the vouched-for market (sector_sker_haven) ───────────────────────────────
  // Grounded: "you're vouched for or you're cargo; rates follow standing"; the Bounty Wreck
  // charts sold "with the warning page stapled on twice"; "unclaimed mass is a rumor with
  // coordinates"; the Skerris Throne on the approach.
  card(
    'station_sker',
    'An open pirate haven with a returns policy.',
    'The gate camp keeps better books than the ships it takes.',
    'The voucher board — standing is currency, rumor is collateral, and both bear interest.',
    'Provenance of stolen goods; nobody honest buys the same mark twice.',
    'The warning page, stapled on twice.',
    [
      'Vouched for, barely. Rates follow standing. Enjoy the market.',
      'We do not steal. We accept unscheduled deliveries.',
      'Chart to the wrecks. Warning page comes stapled twice.',
      'Unclaimed mass is a rumor with coordinates. Buy both.',
      'Returns accepted. Original owner permitting.',
    ],
    'Red market-lamp strings; chained hulls for awnings; one throne welded from scrap.',
    'Fence-pitch patter; every price ends in a laugh with no joke.',
  ),

  // ── Research Station Veil — the reading desk at the anomaly (sector_veil_nebula) ───────────
  // Grounded: "instruments first, hospitality never; sells readings it won't explain"; the
  // Resonance Obelisk whose "pulse interval is shorter than every prior scan record"; the
  // Vael who tighten patrol logs after each pulse; the Blind Nebula's unnervingly good air.
  card(
    'station_veil',
    'A research station that sells readings it will not explain.',
    'The pulse interval keeps shortening; every prior record says it cannot.',
    'The reading desk — findings sold notarized and unexplained, three instruments to a disagreement.',
    'Baseline drift; they archive their own noise and miss it fondly.',
    'The anomaly is named, dated, and denied.',
    [
      'Instruments first. Hospitality is a held-constant zero.',
      'The pulse shortened again. The anomaly denies everything.',
      'Readings for sale. Explanations are not for sale.',
      'Best air out here. Do not breathe the data.',
      'The Vael count our pulses. We count theirs.',
    ],
    'Green instrument practicals; sample racks filed like a morgue; one dead microphone.',
    'Static-poet; long pauses, numbers read like poetry.',
  ),
]);

export const COMMUNITY_BY_ID = Object.freeze(
  new Map(COMMUNITY_PERSONALITY.map((community) => [community.id, community])));

// Anchoring maps: which community's voice owns a surface. Keys are real ids only — the test
// (test/dust-community-personality.test.mjs) proves every key against sectors.js.
export const STATION_COMMUNITY = Object.freeze({
  station_helios: 'station_helios',
  station_coalition: 'station_helios',
  station_ceres: 'station_ceres',
  station_beltout: 'station_beltout',
  station_tethys: 'station_tethys',
  station_customs: 'station_customs',
  station_forge: 'station_forge',
  station_vesta_outlying_yard: 'station_forge',
  station_depot3: 'station_forge',
  station_sker: 'station_sker',
  station_veil: 'station_veil',
});

export const SECTOR_COMMUNITY = Object.freeze({
  sector_helios_prime: 'station_helios',
  sector_ceres_belt: 'station_ceres',
  sector_tethys_junction: 'station_tethys',
  sector_vesta_forge: 'station_forge',
  sector_sker_haven: 'station_sker',
  sector_veil_nebula: 'station_veil',
});

/** The community card for a station/sector/community id, or null. Pure lookup. */
export function communityCard(id) {
  if (typeof id !== 'string') return null;
  if (COMMUNITY_BY_ID.has(id)) return COMMUNITY_BY_ID.get(id);
  const viaStation = STATION_COMMUNITY[id];
  if (viaStation && COMMUNITY_BY_ID.has(viaStation)) return COMMUNITY_BY_ID.get(viaStation);
  const viaSector = SECTOR_COMMUNITY[id];
  if (viaSector && COMMUNITY_BY_ID.has(viaSector)) return COMMUNITY_BY_ID.get(viaSector);
  return null;
}

/**
 * A calibration line in the community's own diction for a station id — the reader the lived
 * vignettes and later station-glass surfaces draw from. `sampleIndex` is a caller-chosen
 * deterministic slot (data files pass a literal; no ambient variety). Null when the station has
 * no card, so callers can keep an authored fallback.
 */
export function stationLine(stationId, sampleIndex = 0) {
  const community = communityCard(stationId);
  if (!community) return null;
  const index = ((sampleIndex | 0) % community.voiceSamples.length + community.voiceSamples.length)
    % community.voiceSamples.length;
  return community.voiceSamples[index];
}

/** Same reader keyed by sector id: the sector's principal community speaks. */
export function sectorLine(sectorId, sampleIndex = 0) {
  const viaSector = SECTOR_COMMUNITY[sectorId];
  return viaSector ? stationLine(viaSector, sampleIndex) : null;
}
