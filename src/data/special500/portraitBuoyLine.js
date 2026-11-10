// src/data/special500/portraitBuoyLine.js — SP1-193 "The Portrait Buoys" (vendor leg data).
//
// The ratified entry (src/data/special500/entries-visual-b.js): somebody paints hull portraits
// on beacon shrouds up the whole helios → ashfall approach — working pilots, dead pilots, the
// lot — hung along the lanes like saints' cards, in order of fame, with the newest frame
// carrying your hull, half-finished, still wet. Pure data + pure reads. The runtime owner is
// src/systems/special500PortraitBuoys.js.
//
// Honesty note (the followup's own hones): the painted-shroud PORTRAITS ride the authored
// identity each buoy carries — the renderer's story-prop buoy body plus per-buoy scan copy —
// not a new texture pipeline, and no illustratedSurface edit. Pixel paint for the shrouds
// themselves is Forge texture work; until then the gallery is real persistent buoys whose
// scan lines read like the painter's captions, which is the authored fallback the hones name.
//
// Positions are authored sector-local coordinates, verified clear of every live station
// bubble (>= 1200 WU), gate approach (>= 600 WU), asteroid field clusters (>= 450 WU past the
// cluster radius) and hostile-zone spawn centers — see the focused test, which re-checks all
// of it against the live sector tables so a table edit can never strand a buoy inside a berth.

// Sector-local positions, one authored line per corridor sector, in lane order.
export const PORTRAIT_BUOY_SECTORS = Object.freeze([
  Object.freeze({
    sectorId: 'sector_helios_prime',
    // Outbound side of the core, clear of Helios Station's berth bubble and the starter field.
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 2600, z: 0 }),
      Object.freeze({ x: 2400, z: 48 }),
      Object.freeze({ x: 2398, z: 96 }),
    ]),
    baseShrouds: Object.freeze([
      'a hauler who flew the starter lane for forty years and never once dented the toll gate',
      'a short-haul pilot everyone called Second Bell, because she always was',
    ]),
  }),
  Object.freeze({
    sectorId: 'sector_vesta_forge',
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 2200, z: 0 }),
      Object.freeze({ x: 2200, z: 44 }),
      Object.freeze({ x: 2198, z: 88 }),
    ]),
    baseShrouds: Object.freeze([
      'a slag-runner who walked out of a decompression and finished the run on suit air',
      'a rigger whose welds are still holding somewhere out past the Forge',
    ]),
  }),
  Object.freeze({
    sectorId: 'sector_tethys_junction',
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 2200, z: 0 }),
      Object.freeze({ x: 2400, z: 48 }),
      Object.freeze({ x: 2398, z: 96 }),
    ]),
    baseShrouds: Object.freeze([
      'a customs runner who filed every manifest honest and died broke and liked',
      'a toll keeper who waved you through twice and billed you once',
    ]),
  }),
  Object.freeze({
    sectorId: 'sector_charon_expanse',
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 2200, z: 0 }),
      Object.freeze({ x: 2200, z: 44 }),
      Object.freeze({ x: 2198, z: 88 }),
    ]),
    baseShrouds: Object.freeze([
      'a rescue cutter that answered nine maydays in one bad month',
      'a scavenger whose kite came back rigged better than it left',
    ]),
  }),
  Object.freeze({
    sectorId: 'sector_io_reach',
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 2400, z: 0 }),
      Object.freeze({ x: 2400, z: 48 }),
      Object.freeze({ x: 2398, z: 96 }),
    ]),
    baseShrouds: Object.freeze([
      'a pod-jockey who towed strangers home through the veil margin',
      'a miner who gave her seam away when the market broke and the families were hungry',
    ]),
  }),
  Object.freeze({
    sectorId: 'sector_ashfall_reach',
    bearingRad: 0.02,
    buoys: Object.freeze([
      Object.freeze({ x: 1800, z: 0 }),
      Object.freeze({ x: 1800, z: 36 }),
      Object.freeze({ x: 1799, z: 72 }),
    ]),
    baseShrouds: Object.freeze([
      'a pilot who made the ashfall run nineteen times and stopped counting at nineteen',
      'a wrecker who cut the dead free first, every time, and never charged for it',
    ]),
  }),
]);

// The painter: findable, takes commissions, refuses payment in anything but a good story.
// The berth is a working-class free-frontier stop mid-corridor (Reach Station, Io Reach).
export const PORTRAIT_PAINTER = Object.freeze({
  contactKey: 'painter',
  stationId: 'station_reach',
  sectorId: 'sector_io_reach',
  name: 'Vesper',
  role: 'pilot',
  roleLabel: 'Shroud Painter',
  factionId: 'faction_free',
  commissionChoiceId: 'commission',
  // The commission's payoff flag: the half-finished frame gets finished. Plain-named,
  // no special500. prefix — the painter is a world resident, not a catalog trigger.
  commissionFlag: 'portrait_commissioned',
});

// The renderer's story-prop kind for the buoys (visualOverrides treats it like the claim
// beacon: authored body, no override interference).
export const PORTRAIT_BUOY_KIND = 'portrait_buoy';

// Fame: how many deed frames the line can carry per sector. The base line is permanent; the
// deed frames grow with the record and are re-derived every visit (deedRecord is the fame read).
export const PORTRAIT_DEED_FRAME_CAP = 4;

// Every shroud weathers on the same clock — the corridor's own exposure, one world day at a
// time. Same function for your frame as for everyone's; that is the authored payoff.
const WEATHER_WORDS = Object.freeze([
  'still bright', 'holding color', 'faded one shade', 'streaked at the eye', 'flaking at the edge',
]);
export const PORTRAIT_WEATHER_CYCLE_DAYS = WEATHER_WORDS.length;

/** The weather a shroud shows on a given world day. Pure, deterministic, shared by every frame. */
export function shroudWeather(dayIndex) {
  const day = Math.max(0, Math.floor(Number(dayIndex) || 0));
  return WEATHER_WORDS[day % WEATHER_WORDS.length];
}
