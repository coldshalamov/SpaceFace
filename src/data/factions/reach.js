export const faction = {
  id: 'faction_reach', name: 'Crimson Reach', short: 'Reach', color: '#D8334A',
  personality: 'pirate', startingRep: -50,
  homeSectors: ['sector_sker_haven', 'sector_ashfall_reach'],
  controls: ['lawless sectors', 'ambush lanes'],
  fleetClass: 'pirate',
  relations: { faction_scn: -0.6, faction_mts: -0.35, faction_dmc: -0.35, faction_quiet: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: -0.35, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.5, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_reach"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#D8334A', secondary: '#7A1020', accent: '#FF6680',
    hull: '#C06070', emissive: '#D8334A', thruster: '#FF4466',
  },
  shipRoles: [
    { role: 'raid-pack', weight: 0.46, hullIds: ['ship_hornet', 'ship_wasp', 'ship_drifter'] },
    { role: 'prize-crew', weight: 0.26, hullIds: ['ship_mule', 'ship_pelican', 'ship_atlas'] },
    { role: 'reach-heavy', weight: 0.18, hullIds: ['ship_bastion', 'ship_warden', 'ship_colossus'] },
    // Row 531 additions (02 §4 roster): the Nest Carrier launches wasp packs from its
    // belly; the trophy barge carries the clan's plates.
    { role: 'nest-carrier', weight: 0.07, hullIds: ['ship_atlas', 'ship_colossus'] },
    { role: 'trophy-barge', weight: 0.03, hullIds: ['ship_mule', 'ship_atlas'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 531 — Reach identity mechanics (02 §4).
    nestCarrier: {
      // A gutted freighter launching wasp packs from its belly — a dismantle-able
      // mini-boss (E-08). Pull a belly door off and the nest spills; at half-stripped it
      // vents the whole nest at once. Throw its own wasps back in to gut it.
      doorCount: 2,
      nestSize: 6,
      launchIntervalS: 5,      // wasps out the bay on this rhythm while a door holds
      tearWu: 120,             // a latched door dragged this far from its socket rips free
      waspReturnHits: 3,       // wasp-kills returned through the bays to gut the hull
      ventAtDoorsTorn: 1,      // half-stripped = one door gone → the nest vents all at once
    },
    trophyWall: {
      // Trophy plates of ships the clan killed — and ships YOU killed — hang at Sker
      // Haven. Steal yours back.
      stationId: 'sker_haven',
      ledger: 'trophyWall',    // state.trophyWall.plates — written by encounters
    },
    gateCamps: {
      // E-42 camps: a gate blockade of CHAINED rocks with turrets — cut the chain links
      // with throws and the blockade drifts apart.
      chainLinkHp: 60,
      rocksPerCamp: [4, 6],
      turretArchetype: 'mine_layer_jackal',
      chainTetherable: true,
    },
    theNest: {
      encounterId: 'the_nest',  // src/data/encounters/705-the-nest.js (E-08)
    },
  },
  voiceRegister: 'pirate',
};

export default faction;
