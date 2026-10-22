export const faction = {
  id: 'faction_dmc', name: 'Drift Miners Collective', short: 'Drift', color: '#C9772E',
  personality: 'blue-collar', startingRep: 0,
  homeSectors: ['sector_ceres_belt', 'sector_vesta_forge', 'sector_charon_expanse'],
  controls: ['asteroid-rich sectors', 'refineries', 'ore prices'],
  fleetClass: 'independent',
  relations: { faction_scn: 0.0, faction_mts: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.35, faction_choir: 0.0, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_dmc"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#C9772E', secondary: '#7A4010', accent: '#E8A060',
    hull: '#A08050', emissive: '#C9772E', thruster: '#FF8844',
  },
  shipRoles: [
    { role: 'claim-barge', weight: 0.44, hullIds: ['ship_pelican', 'ship_ironback', 'ship_mule'] },
    { role: 'field-guard', weight: 0.28, hullIds: ['ship_wasp', 'ship_drifter', 'ship_hornet'] },
    { role: 'deep-survey', weight: 0.18, hullIds: ['ship_ranger', 'ship_kestrel', 'ship_atlas'] },
    // Row 530 additions (02 §3 roster): the pylon-lobber stakes claims by throwing them;
    // derby crews race to split the biggest rock on the field.
    { role: 'pylon-lobber', weight: 0.06, hullIds: ['ship_pelican', 'ship_mule'] },
    { role: 'derby-breaker', weight: 0.04, hullIds: ['ship_ironback', 'ship_pelican'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 530 — Drift identity mechanics (02 §3).
    claimPylon: {
      // Pylons that stake a claim and can be THROWN. One lands, settles, and every rock
      // inside its radius flies the stake. Throw it somewhere else and the claim moves.
      // A contested rock goes to the freshest stake.
      claimRadiusWu: 220,
      settleSpeed: 8,            // wu/s — under this the pylon has "landed"
      stamp: 'claimedBy',
    },
    claimJump: {
      encounterId: 'claim_jump',  // src/data/encounters/704-claim-jump.js (E-06)
      braceHoldS: 3,           // hold the keystone this long and the shaft holds
      chargeFlingWu: 700,      // the charge is safe once it's this far from the keystone
      chargeFlightS: 14,       // the saboteur's charge drifts in on this timer
    },
    breakerDerby: {
      encounterId: 'breaker_derby', // src/data/encounters/706-breaker-derby.js (E-39)
      slamIntervalS: 4,        // a breaker's work rhythm between slams
      chunkCount: [3, 5],      // the biggest rock splits into this many throwable chunks
      deedName: 'DERBY ROCK',
    },
    breakerHead: {
      // The signature toy is row 501's — this is the Drift rule it plays by:
      // a held rock slammed into anything hard splits into 3–5 throwable chunks.
      chunkCount: [3, 5],
      minImpactSpeed: 40,
    },
  },
  voiceRegister: 'blue-collar',
};

export default faction;
