export const faction = {
  id: 'faction_mts', name: 'Meridian Trade Syndicate', short: 'Meridian', color: '#F2B233',
  personality: 'corporate', startingRep: 0,
  homeSectors: ['sector_tethys_junction', 'sector_pallas_drift'],
  controls: ['trade-hub sectors', 'commodity exchanges', 'tolls'],
  fleetClass: 'syndicate',
  relations: { faction_scn: 0.5, faction_dmc: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.2, faction_choir: 0.0, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_mts"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#F2B233', secondary: '#8B6020', accent: '#FFE09A',
    hull: '#E8D8A0', emissive: '#F2B233', thruster: '#FFCC66',
  },
  shipRoles: [
    { role: 'contract-hauler', weight: 0.42, hullIds: ['ship_mule', 'ship_atlas', 'ship_ironback'] },
    { role: 'retained-escort', weight: 0.32, hullIds: ['ship_wasp', 'ship_hornet', 'ship_drifter'] },
    { role: 'syndicate-flag', weight: 0.14, hullIds: ['ship_bastion', 'ship_warden', 'ship_colossus'] },
    // Row 516 additions (02 §2 roster): the spine tug pulls containers on rigid couplers;
    // the broker's yacht follows the load at a safe distance and prices the rescue.
    { role: 'spine-tug', weight: 0.07, hullIds: ['ship_mule', 'ship_ironback'] },
    { role: 'broker-yacht', weight: 0.05, hullIds: ['ship_drifter', 'ship_ranger'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 516 — Meridian identity mechanics (02 §2).
    cargoSpine: {
      // A tug pulls 4–12 containers on rigid couplers — a flail you can steal. A hard
      // enough lateral hit on a joint snaps it: every container behind the break becomes
      // loose mass. Latch the lead tug and you are towing a train.
      containerCount: [4, 12],
      couplerSnapSpeed: 55,      // relative speed (wu/s) across a joint that snaps it
      couplerStretchWu: 90,      // a joint stretched past this lets go
      linkGapWu: 46,             // authored spacing between spine bodies
      recoupleWu: 38,            // a loose container drifted back this close re-links
    },
    hullTicker: {
      // Flank light-strips scroll the live price of the cargo inside. While a container
      // drifts loose the ticker counts its value DOWN — a salvage lot on a countdown.
      valueBleedPerS: 90,        // cr/s stripped off a drifting container
      salvageFloorCr: 400,       // the floor: wreck price of a bare container
    },
    tollPylon: {
      // The lane-straddling arch: toll collected on transit, priced on manifest mass.
      archWidthWu: 240,
      tollPerTonneCr: 4,
      minTollCr: 25,
    },
    spineBreak: {
      encounterId: 'spine_break',   // src/data/encounters/701-spine-break.js (E-05)
      recoupleFeePerContainerCr: 120,
      recoupleGoal: 3,
      pitbornPriceFrac: 0.35,       // Pitborn pay this fraction of remaining ticker value
    },
  },
  voiceRegister: 'corporate',
};

export default faction;
