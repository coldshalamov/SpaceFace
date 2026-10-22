export const faction = {
  id: 'faction_understory', name: 'The Understory', short: 'Understory', color: '#8FA82E',
  personality: 'saprophyte', startingRep: 0,
  homeSectors: ['sector_charon_expanse', 'sector_eunomia_gulf'],
  controls: ['graveyard salvage', 'post-battle wreck recovery', 'wreckage exchange'],
  fleetClass: 'biological', aggression: 0.3, // BIOLOGICAL/UNDERSTORY presentation (alien-ecology doc 12)
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0,
    faction_pitborn: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#8FA82E', secondary: '#3A2A10', accent: '#3A2A10',
    hull: '#687A28', emissive: '#D0E060', thruster: '#C7D98A',
  },
  shipRoles: [
    { role: 'gardener-skiff', weight: 0.35, hullIds: ['ship_kestrel', 'ship_drifter'], source: 'overgrowthKit' },
    { role: 'rot-frigate', weight: 0.35, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'], source: 'lossLedgerOnly' },
    { role: 'spore-tender', weight: 0.2, hullIds: ['ship_pelican', 'ship_mule', 'ship_drifter'], source: 'lossLedgerOnly' },
    { role: 'bloated-carrier-barge', weight: 0.1, hullIds: ['ship_ironback', 'ship_atlas', 'ship_colossus'], source: 'lossLedgerOnly' },
  ],
  illegalCommodities: [],
  custom: {
    neverFiresFirst: true,
    scavengesAfterBattles: true,
    refliesLedgerHullsOnly: true,
    sporeBloomOnDeath: true,
    buysWreckageAndAsksNothing: true,
    collisionsAbsorbedLowRestitution: true,
    flungMassFeedsGardens: true,
    stickySporeCloudOnAttacked: true,
    gardensPushTideLine: true,
  },
  voiceRegister: 'saprophyte',
};

// ── W-UNDERSTORY (build_map §34.5 row 517, expansion bible 02 §10) ──────────────────────
// The garden is the faction's persistent mark: a wreck-reef that digests dead mass through
// five visible growth stages and pushes the Bloom tide line back once it is big enough.
// The runtime owner is src/systems/faction_understory.js (manifest id 'understoryGardens').

export const UNDERSTORY_GARDEN_STAGES = Object.freeze([
  // Stage is 1-indexed: gardens[0] is stage 1. massFloor is the digested biomass (tonnes)
  // at which a garden reaches that stage.
  Object.freeze({ stage: 1, id: 'seeded',      massFloor: 0,   radius: 90,  label: 'Seeded Wreck' }),
  Object.freeze({ stage: 2, id: 'sprouting',   massFloor: 60,  radius: 140, label: 'Sprouting Reef' }),
  Object.freeze({ stage: 3, id: 'established', massFloor: 180, radius: 200, label: 'Established Garden' }),
  Object.freeze({ stage: 4, id: 'blooming',    massFloor: 420, radius: 280, label: 'Blooming Garden' }),
  Object.freeze({ stage: 5, id: 'reef',        massFloor: 900, radius: 380, label: 'Landmark Reef' }),
]);

// Done-when: "a garden of stage 4 or higher pushes the local tide line" — each qualifying
// garden contributes this much pushback to its sector's tide reading (row 520 reads it).
export const UNDERSTORY_TIDE_PUSHBACK_STAGE = 4;
export const UNDERSTORY_TIDE_PUSHBACK_PER_GARDEN = 0.08;

export const UNDERSTORY_GARDENS = Object.freeze({
  stages: UNDERSTORY_GARDEN_STAGES,
  // Eaten mass pays this fraction into growth (the rest is the reef's own body).
  digestionYield: 0.6,
  // Anything loose inside radius * absorbPadding that the garden can digest is eaten.
  absorbPadding: 1.15,
  // Types the slow rot digests. Ships, stations, machines and living things are not food.
  edibleTypes: Object.freeze(['wreck', 'debris', 'payload', 'asteroid', 'cargo_pod', 'junk']),
  // Understory hull deaths seed a stage-1 garden where they fall (sporeBloomOnDeath).
  deathSeedsGarden: true,
  tidePushbackStage: UNDERSTORY_TIDE_PUSHBACK_STAGE,
  tidePushbackPerGarden: UNDERSTORY_TIDE_PUSHBACK_PER_GARDEN,
});

// E-26 the Compost Run: tow dead mass into a garden ring. A run is per-garden; it completes
// when the garden has digested `targetMass` tonnes credited to the player.
export const UNDERSTORY_COMPOST_RUN = Object.freeze({
  id: 'E-26',
  name: 'The Compost Run',
  homeSectors: Object.freeze(['sector_charon_expanse', 'sector_eunomia_gulf']),
  targetMass: 240,          // tonnes of fed mass to close a run
  repReward: 6,
  creditPerTonne: 12,
  startLine: 'We will take that. We take everything, eventually.',
  completeLine: 'It is becoming something. The garden keeps your name in its rings.',
});

// Signature toy (row 501 head — data here; the module row lands in data/modules.js).
export const UNDERSTORY_SPORE_HEAD = Object.freeze({
  id: 'head_spore',
  name: 'Spore Head',
  growS: 4,                 // seconds on the Line before the rot-skin takes
  heldEffect: Object.freeze({ restitutionMult: 0.15, sticksOnImpact: true }),
  line: 'Leave it. It is becoming something.',
});

export const UNDERSTORY_BARKS = Object.freeze({
  gardenFed: Object.freeze([
    'We will take that. We take everything, eventually.',
    'Leave it. It is becoming something.',
    'Dead things feed the living here.',
  ]),
  stageUp: Object.freeze([
    'The growth leans your way.',
    'It flowers. You fed this.',
  ]),
  tideComing: 'The wild one is coming up the lane. Bring us more dead.',
  runComplete: 'It is becoming something. The garden keeps your name in its rings.',
});

export default faction;
