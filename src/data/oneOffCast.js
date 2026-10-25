// W-ONEOFFS (build_map.md row 505, §34.3; bible: design/expansion/03_PEOPLES_CREATURES_MACHINES.md
// §4.3). The one-offs find a home: every authored one-off — the machine-people and the named set
// pieces — maps to three things so a stranger can find it:
//
//   * A SECTOR. `sectorIds` for residents with a fixed home; `reach` for the roamers whose gate,
//     not a pin, decides where they live (Scissorwake hunts any tier-1+ low-security lane; the
//     Wreck Court convenes wherever a loss promotes a case). `oneOffHomeSectorIds` resolves both.
//   * A BOOK WINDOW. `books: { from, to }` in the campaign Books of
//     design/expansion/06_CAMPAIGN_SCRIPT.md (B0 Cold Start … B7 The Deep Reach). `from` is the
//     Book whose main route first reaches the one-off's home (Helios 0, Tethys/Ceres 1, Charon 2,
//     Vesta 3, Io/Dione 4, Pallas 5, the deep Reach 7; the uncharted rim opens as a ranging window
//     from 4). Residents do not expire, so `to` runs to 7.
//   * A CHART ENTRY. `chart.kind` names the REAL surface the one-off already rides onto the chart;
//     `chart.ref` is the id on that surface, and the census test resolves every ref against the
//     live data so a renamed encounter or a dropped system fails loudly:
//       contact   — a resident physical actor the local chart tracks (ref = the system's name in
//                   the authoritative manifest; `presentVia` when a helper lives under another
//                   registered owner, e.g. memorialThief under uniqueWrecks);
//       encounter — a proximity-gated encounter in the catalog (ref = trigger id in
//                   src/data/encounters/index.generated.js; the chart learns it in-sector);
//       site      — an authored discovery site on the survey chart (ref = siteId);
//       board     — a station board/communicator offer (ref = stationId, or 'wreckCourt' for the
//                   court's entry case on the docket);
//       traffic   — a named lane contact (ref = NAMED_LANE_CONTACTS id);
//       planned   — the twelve Orphaned Shift machines: authored canon in 03 §4.3 and 06 §"The
//                   Orphaned Shift" ("on the chart as names, never as quest markers"), each built
//                   one per sitting by row 506. `implemented: false` until its encounter lands.
//
// The census (test/one-off-census.test.mjs) fails on any one-off missing a mapping and on any
// named sector with no resident — a resident being either a cast member below or a texture
// one-off from worldOneOffs.js, because "every sector has someone in it" counts both the named
// machine-people and the placed set pieces.

import { SECTORS } from './sectors.js';

export const ONE_OFF_CAST_SCHEMA = 'one_off_cast_v1';

export const ONE_OFF_CHART_KINDS = Object.freeze([
  'contact', 'encounter', 'site', 'board', 'traffic', 'planned',
]);

const entry = (body) => Object.freeze({
  reach: null,
  implemented: true,
  ...body,
  sectorIds: body.sectorIds ? Object.freeze([...body.sectorIds]) : null,
  books: Object.freeze({ ...body.books }),
  chart: Object.freeze({ ...body.chart }),
});

export const ONE_OFF_CAST = Object.freeze([

  // ─── The machine-people (03 §4.3, "Existing") ─────────────────────────────────────────────
  entry({
    id: 'morrow', name: 'Morrow R-07 — the momentum-rescue machine',
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'contact', ref: 'morrow', presentVia: 'morrow' },
  }),
  entry({
    id: 'vesper', name: 'Vesper SV-3 — the kinetic choir',
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'contact', ref: 'vesper', presentVia: 'vesper' },
  }),
  entry({
    id: 'bracket', name: 'Bracket BX-9 — the goalkeeper',
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'contact', ref: 'bracket', presentVia: 'bracket' },
  }),
  entry({
    id: 'ruckus', name: 'Ruckus RU-7 — the open work order',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'ruckus', presentVia: 'ruckus' },
  }),
  entry({
    id: 'rubric', name: 'Rubric HM-11 — the hull marker',
    sectorIds: ['sector_tethys_junction'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'rubric', presentVia: 'rubric' },
  }),
  entry({
    id: 'solstice', name: 'Solstice SL-9 — the star lantern',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'solstice', presentVia: 'solstice' },
  }),
  entry({
    id: 'ravel', name: 'Ravel — the precursor gravity loom',
    sectorIds: ['sector_pallas_drift'],
    books: { from: 5, to: 7 },
    chart: { kind: 'contact', ref: 'ravel', presentVia: 'ravel' },
  }),

  // ─── The named set pieces (03 §4.3, "The set pieces include…") ────────────────────────────
  entry({
    id: 'blind_welder', name: 'The Blind Welder — a sensor-dead repair barge',
    sectorIds: ['sector_vesta_forge'],
    books: { from: 3, to: 7 },
    chart: { kind: 'encounter', ref: 'the_blind_welder' },
  }),
  entry({
    id: 'eighth_bell', name: 'The Eighth Bell',
    sectorIds: ['sector_vesta_forge'],
    books: { from: 3, to: 7 },
    chart: { kind: 'encounter', ref: 'the_eighth_bell' },
  }),
  entry({
    id: 'runaway_kiln', name: 'The Runaway Kiln',
    sectorIds: ['sector_vesta_forge'],
    books: { from: 3, to: 7 },
    chart: { kind: 'encounter', ref: 'the_runaway_kiln' },
  }),
  entry({
    id: 'pallet_jack', name: 'Pallet Jack — the yard thief who takes what is not tied down',
    sectorIds: ['sector_ceres_belt', 'sector_tethys_junction'],
    books: { from: 1, to: 7 },
    chart: { kind: 'encounter', ref: 'pallet_jack_intro' },
  }),
  entry({
    id: 'kilnback', name: 'Kilnback — the furnace courier',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'encounter', ref: 'kilnback_intro' },
  }),
  entry({
    id: 'mothlight', name: 'Mothlight — drawn to the running lamps',
    sectorIds: ['sector_io_reach'],
    books: { from: 4, to: 7 },
    chart: { kind: 'encounter', ref: 'mothlight_intro' },
  }),
  entry({
    // A roaming cutter, not a resident: its gate (tier ≥ 1, security ≤ 0.8, from story beat 1)
    // is the honest sector mapping — anywhere an outlaw lane will have it.
    id: 'scissorwake', name: 'Scissorwake — the line-cutting light cutter',
    reach: Object.freeze({ minSectorTier: 1, maxSecurity: 0.8 }),
    books: { from: 1, to: 7 },
    chart: { kind: 'encounter', ref: 'scissorwake_intro' },
  }),
  entry({
    id: 'last_argument', name: 'The Last Argument — a stolen siege ark on passage',
    sectorIds: ['sector_sker_haven', 'sector_charon_expanse', 'sector_ashfall_reach'],
    books: { from: 2, to: 7 },
    chart: { kind: 'encounter', ref: 'last_argument_passage' },
  }),
  entry({
    id: 'latch_nine', name: 'Latch Nine — the latching service at the Tethys hub',
    sectorIds: ['sector_tethys_junction'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'latchNine', presentVia: 'latchNine' },
  }),
  entry({
    id: 'tally_three', name: 'Tally Three — the speed-gate register',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'tallyThree', presentVia: 'tallyThree' },
  }),
  entry({
    id: 'red_kite', name: 'Red Kite — the marked line over the belt',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'redKite', presentVia: 'redKite' },
  }),
  entry({
    id: 'last_shift', name: 'The Last Shift — the tow that was let go',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'site', ref: 'ceres:last-shift:v1', presentVia: 'lastShift' },
  }),
  entry({
    id: 'ilex_ark', name: 'The Ilex Ark — a seed vault crossing Tethys to Ceres',
    sectorIds: ['sector_tethys_junction', 'sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'ilexArk', presentVia: 'ilexArk' },
  }),
  entry({
    id: 'sable_venn', name: 'Sable Venn — the workshop that repairs what is owed',
    sectorIds: ['sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'contact', ref: 'sableVenn', presentVia: 'sableVenn' },
  }),
  entry({
    id: 'hook_left', name: 'Hook-Left (Ruud) — the left-handed punch of the Forge',
    sectorIds: ['sector_vesta_forge'],
    books: { from: 3, to: 7 },
    chart: { kind: 'contact', ref: 'ruud', presentVia: 'ruud' },
  }),
  entry({
    id: 'second_rinse', name: "Hasp's Second Rinse — the sheet-wash skiff off the Helios–Ceres chord",
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'contact', ref: 'secondRinse', presentVia: 'secondRinse' },
  }),
  entry({
    id: 'memorial_thief', name: 'The Memorial Thief — who takes from the Candle Fleet cache',
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'contact', ref: 'memorialThief', presentVia: 'uniqueWrecks' },
  }),
  entry({
    id: 'two_ships_one_mistake', name: 'Two Ships One Mistake — a collision still being argued',
    sectorIds: ['sector_tethys_junction'],
    books: { from: 1, to: 7 },
    chart: { kind: 'encounter', ref: 'two_ships_one_mistake' },
  }),
  entry({
    id: 'drift_auction', name: 'The Drift Auction — salvage sold where it fell',
    sectorIds: ['sector_pallas_drift'],
    books: { from: 5, to: 7 },
    chart: { kind: 'encounter', ref: 'the_drift_auction' },
  }),
  entry({
    id: 'wake_handoff', name: 'Wake Handoff — the crate left in a hauler\'s wake',
    sectorIds: ['sector_pallas_drift'],
    books: { from: 5, to: 7 },
    chart: { kind: 'board', ref: 'station_drift' },
  }),
  entry({
    // The court has no fixed bench: a loss in any sector can promote a case, and the court
    // convenes beside the wreck. reach 'any' is the honest mapping.
    id: 'wreck_court', name: 'Wreck Court — the docket that convenes beside the body',
    reach: 'any',
    books: { from: 0, to: 7 },
    chart: { kind: 'board', ref: 'wreckCourt' },
  }),
  entry({
    id: 'borrowed_voice', name: 'Borrowed Voice — the retained signal in the warm freighter',
    sectorIds: ['sector_charon_expanse'],
    books: { from: 2, to: 7 },
    chart: { kind: 'site', ref: 'warm_freighter', presentVia: 'borrowedVoice' },
  }),
  entry({
    id: 'stormshift', name: 'Stormshift — the Anvil\'s collector shift',
    sectorIds: ['sector_tethys_junction'],
    books: { from: 1, to: 7 },
    chart: { kind: 'site', ref: 'planet_tethys_anvil', presentVia: 'traffic' },
  }),
  entry({
    // The sun's module and berths are shipped (src/systems/borrowedSun.js,
    // BORROWED_SUN_BERTHS), but nothing registers the system yet — the mapping is authored
    // ahead of the wiring, which is exactly what the census is for. `chart.ref` already
    // names the surface it intends to ride when a lane registers it: the borrowedSun
    // contact itself.
    id: 'borrowed_sun', name: 'The Borrowed Sun — the station that is only visiting',
    sectorIds: ['sector_tethys_junction', 'sector_ceres_belt'],
    books: { from: 1, to: 7 },
    chart: { kind: 'planned', ref: 'borrowedSun' },
    implemented: false,
  }),
  entry({
    // "A courier far too fast" — worldOneOffs.js names her a one-off; she is a named lane
    // contact flying the express role out of the start sector.
    id: 'cinder_courier', name: 'The Cinder Run courier — far too fast for her hull',
    sectorIds: ['sector_helios_prime'],
    books: { from: 0, to: 7 },
    chart: { kind: 'traffic', ref: 'lane_cinder_run_courier' },
  }),

  // ─── The Orphaned Shift (03 §4.3 + 06 §"The Orphaned Shift") — authored canon, built one
  // per sitting by row 506. Their sectors, names and payoff lines are already written, so the
  // census carries them as residents-in-waiting; implemented:false until the encounter lands.
  entry({
    id: 'tare', name: 'TARE / WG-2 — the weighing robot on the dead scale deck',
    sectorIds: ['sector_dione_lane'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'tare', presentVia: 'tare' },
    implemented: true,
  }),
  entry({
    id: 'docket', name: 'DOCKET / PX-14 — the parcel drone that wants to be delivered',
    sectorIds: ['sector_io_reach'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'docket', presentVia: 'docket' },
    implemented: true,
  }),
  entry({
    id: 'lamplighter', name: 'LAMPLIGHTER / LL-6 — who relights the dead rim buoys',
    sectorIds: ['sector_sedna_dark'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'lamplighter', presentVia: 'lamplighter' },
    implemented: true,
  }),
  entry({
    id: 'shepherd_12', name: 'SHEPHERD-12 — the broken shepherd herding debris flocks',
    sectorIds: ['sector_orcus_shadow'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'shepherd12', presentVia: 'shepherd12' },
    implemented: true,
  }),
  entry({
    id: 'quill', name: 'QUILL / AR-3 — the deserter page-drone',
    sectorIds: ['sector_triton_wake'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'quill', presentVia: 'quill' },
    implemented: true,
  }),
  entry({
    id: 'holdfast', name: 'HOLDFAST / AN-1 — the ice-anchor holding the rift',
    sectorIds: ['sector_haumea_rift'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'holdfast', presentVia: 'holdfast' },
    implemented: true,
  }),
  entry({
    id: 'bouncer', name: 'BOUNCER / DR-0 — the bazaar\'s door robot',
    sectorIds: ['sector_sker_haven'],
    books: { from: 2, to: 7 },
    chart: { kind: 'contact', ref: 'bouncer', presentVia: 'bouncer' },
    implemented: true,
  }),
  entry({
    id: 'receipt', name: 'RECEIPT / PR-8 — the printer filing every kill',
    sectorIds: ['sector_kepler_scar'],
    books: { from: 3, to: 7 },
    chart: { kind: 'contact', ref: 'receipt', presentVia: 'receipt' },
    implemented: true,
  }),
  entry({
    id: 'mop', name: 'MOP / CL-5 — the clean-up drone that erases evidence',
    sectorIds: ['sector_nyx_march'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'mop', presentVia: 'mop' },
    implemented: true,
  }),
  entry({
    id: 'bellhop', name: 'BELLHOP / CB-9 — the bell-tuning drone',
    sectorIds: ['sector_phoebe_echo'],
    books: { from: 4, to: 7 },
    chart: { kind: 'planned', ref: null },
    implemented: false,
  }),
  entry({
    id: 'gravedigger', name: 'GRAVEDIGGER / UG-4 — the machine that buries wrecks into gardens',
    sectorIds: ['sector_eunomia_gulf'],
    books: { from: 4, to: 7 },
    chart: { kind: 'planned', ref: null },
    implemented: false,
  }),
  entry({
    id: 'tallyho', name: 'TALLYHO / CN-2 — the scoreboard robot looking for a crowd',
    sectorIds: ['sector_rhea_cinder'],
    books: { from: 4, to: 7 },
    chart: { kind: 'contact', ref: 'tallyho', presentVia: 'tallyho' },
    implemented: true,
  }),
]);

/**
 * The sectors a one-off actually lives in. Fixed residents return their authored `sectorIds`;
 * roamers resolve `reach` against the live sector table: 'any' is every named sector, and a
 * `{ minSectorTier, maxSecurity }` gate is the honest reach of an outlaw-lane encounter.
 * Interior hosts (The Bolus materializes its own volume) never host a one-off.
 */
export function oneOffHomeSectorIds(oneOff, sectors = SECTORS) {
  const named = (sectors || SECTORS).filter((s) => s && !s.interiorHost);
  if (Array.isArray(oneOff && oneOff.sectorIds)) return [...oneOff.sectorIds];
  const reach = oneOff && oneOff.reach;
  if (reach === 'any') return named.map((s) => s.id);
  if (reach && typeof reach === 'object') {
    const minTier = Number.isFinite(reach.minSectorTier) ? reach.minSectorTier : -Infinity;
    const maxSec = Number.isFinite(reach.maxSecurity) ? reach.maxSecurity : Infinity;
    return named
      .filter((s) => Number(s.tier) >= minTier && Number(s.security) <= maxSec)
      .map((s) => s.id);
  }
  return [];
}

/** sectorId -> one-off entries that live there (fixed or roaming reach). */
export function oneOffResidentsBySector(census = ONE_OFF_CAST, sectors = SECTORS) {
  const residents = new Map();
  for (const oneOff of census) {
    for (const sectorId of oneOffHomeSectorIds(oneOff, sectors)) {
      if (!residents.has(sectorId)) residents.set(sectorId, []);
      residents.get(sectorId).push(oneOff);
    }
  }
  return residents;
}
