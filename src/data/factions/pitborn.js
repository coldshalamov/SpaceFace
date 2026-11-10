export const faction = {
  id: 'faction_pitborn', name: 'The Pitborn', short: 'Pitborn', color: '#C8501C',
  personality: 'pitborn_patchwork', startingRep: 40,
  homeSectors: ['sector_ashfall_reach'],
  controls: ['deep-space anchorage', 'salvage yards', 'wreck fences'],
  fleetClass: 'scrapper', aggression: 0.6,
  relations: {
    faction_scn: -0.6, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.5,
    faction_quiet: 0.5, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_archive: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#C8501C', secondary: '#4A3028', accent: '#E8B43A',
    hull: '#6B584F', emissive: '#B06020', thruster: '#D87838',
  },
  shipRoles: [
    { role: 'salvage-tender', weight: 0.45, hullIds: ['ship_mule', 'ship_pelican', 'ship_ironback'] },
    { role: 'yard-defense-gunship', weight: 0.3, hullIds: ['ship_drifter', 'ship_hornet', 'ship_bastion'] },
    { role: 'yardmaster-capital', weight: 0.15, hullIds: ['ship_atlas', 'ship_warden', 'ship_colossus'] },
    { role: 'cull-announcer', weight: 0.1, hullIds: ['ship_mule'], source: 'junkKit' },
  ],
  illegalCommodities: [],
  custom: {
    hostileToConcordAlways: true,
    alliedWithReachAndQuiet: true,
    recognizesPlayerAsPitborn: true,
    repStartsPositiveForPlayer: true,
    buysWrecksAtFixedRates: true,
    civilianHullsSacrosanct: true,
    playsKatamariAsSport: true,      // Ballast: a race to the biggest junk ball
    crowdRatesYourStyle: true,       // the Cull meter is the arena's purse
    singsTheCountBack: true,         // "COUNT 'EM!" at every Cull
  },
  voiceRegister: 'escaped-scrapper',
};

// ── W-PITBORN (build_map §34.5 row 519, expansion bible 02 §13) ─────────────────────────
// The Pitborn are the game's joy: loud, musical, generous, rude and built from junk.
// The runtime owner is src/systems/faction_pitborn.js (manifest id 'pitbornCull').

// Ballast balls — junk spheres in five sizes, the arenas' signature throwable (P0).
export const PITBORN_BALLAST_BALLS = Object.freeze([
  Object.freeze({ id: 'ballast_skiff',  size: 1, radius: 10, mass: 18,  label: 'Skiff Ball' }),
  Object.freeze({ id: 'ballast_tender', size: 2, radius: 16, mass: 45,  label: 'Tender Ball' }),
  Object.freeze({ id: 'ballast_yard',   size: 3, radius: 26, mass: 110, label: 'Yard Ball' }),
  Object.freeze({ id: 'ballast_heavy',  size: 4, radius: 40, mass: 240, label: 'Heavy Ball' }),
  Object.freeze({ id: 'ballast_clatter',size: 5, radius: 60, mass: 520, label: 'Clatterball' }),
]);
// A ball accretes contacting junk; this much of each eaten mass adds to the ball.
export const PITBORN_BALLAST_ACCRETE = Object.freeze({
  edibleTypes: Object.freeze(['wreck', 'debris', 'junk', 'cargo_pod', 'payload']),
  yield: 1.0,
  radiusPerMass: 0.035,       // radius growth per accreted tonne — the ball visibly bulks
});

// E-41 Ballast: build the biggest junk ball against Clatter before the horn.
export const PITBORN_BALLAST_MATCH = Object.freeze({
  id: 'E-41',
  rival: 'Clatter',
  matchS: 120,                // seconds to the horn
  clatterAccretePerS: 2.2,    // tonnes/sec Clatter's ball gains — beatable, not trivial
  clatterSeededBonus: 60,     // starting lead — the yard favorite
  hornLine: "HORN! Drop your magnets — we're weighing!",
  winLine: 'The yard names your ball. Heavy is honest!',
  loseLine: "Clatter's ball takes the name this time. Next horn, pilot.",
});

// E-40 the Cull crowd meter: the arena rates your style; the purse scales with it.
export const PITBORN_CULL = Object.freeze({
  id: 'E-40',
  crowdMax: 100,
  decayPerS: 1.5,             // the crowd cools fast — keep feeding it style
  stylePoints: Object.freeze({
    kill: 4,
    impact: 10,               // impact kills read loudest in the yard
    multikill: 14,
    catch: 12,                // a mid-air catch brings the yard down
    ballastFeed: 6,
  }),
  purseBase: 400,
  pursePerPoint: 9,           // credits per crowd point at settle time
  tiers: Object.freeze([
    Object.freeze({ at: 0,  id: 'cold',   label: 'COLD CROWD' }),
    Object.freeze({ at: 25, id: 'warming',label: 'WARMING UP' }),
    Object.freeze({ at: 50, id: 'loud',   label: 'LOUD YARD' }),
    Object.freeze({ at: 75, id: 'roaring',label: 'ROARING YARD' }),
    Object.freeze({ at: 95, id: 'count',  label: "COUNT 'EM!" }),
  ]),
  dressing: Object.freeze({
    crowdLightCount: 48,
    bannerCount: 12,
    scoreboardRefreshS: 0.5,  // the board redraws crowd score + purse live
  }),
});

// The Yardmaster: a mobile scrapyard procedurally accreted from the aftermath pieces
// (WRECK_AFTERMATH_MODELS — 43 at spec time, the catalog has since grown). You dismantle
// it piece by piece and keep the pieces.
export const PITBORN_YARDMASTER = Object.freeze({
  pieceCount: 43,             // the authored colossus: 43 pieces drawn from the catalog
  pieceHull: 80,              // each piece takes its own hits
  stripPerHit: 1,             // damage strips one attached piece at a time
  pieceScatterR: 180,
  name: 'Yardmaster',
  coreLine: "She's all hull and no keel! Strip her, she's yours!",
});

// Signature toy (row 489): the Pitborn make the Magnet Head and the Cull sells it.
export const PITBORN_MAGNET_HEAD = Object.freeze({
  id: 'head_magnet',
  name: 'Magnet Head',
  soldAtCull: true,
  line: 'You break it, it\'s ammunition.',
});

export const PITBORN_BARKS = Object.freeze({
  announcer: 'Ma Sprocket',
  crowdUp: Object.freeze([
    "Heavy's honest!",
    "COUNT 'EM! COUNT 'EM!",
    'You break it, it\'s ammunition!',
    'The yard likes your style, pilot!',
  ]),
  cullOpen: 'Welcome to the Cull! Style pays, pretty dying pays double!',
  ballastStart: 'Balls out! Biggest junk wins the name!',
});

export default faction;
