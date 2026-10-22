export const faction = {
  id: 'faction_scn', name: 'Solar Concord Navy', short: 'Concord', color: '#3A78FF',
  personality: 'lawful', startingRep: 0,
  homeSectors: ['sector_helios_prime', 'sector_tethys_junction'],
  controls: ['core sectors', 'jump-gate checkpoints', 'customs scans'],
  fleetClass: 'federation',
  // Relations encode enduring reputation spillover; conditional ROE belongs in factionDoctrines/custom flags.
  relations: { faction_mts: 0.5, faction_dmc: 0.0, faction_reach: -0.6, faction_quiet: 0.0, faction_vael: -0.5, faction_free: 0.0, faction_choir: 0.3, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: -0.6, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_scn"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#3A78FF', secondary: '#1A3A8F', accent: '#A0C4FF',
    hull: '#C8D8F0', emissive: '#3A78FF', thruster: '#88AAFF',
  },
  shipRoles: [
    { role: 'customs-cutter', weight: 0.35, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'patrol-wing', weight: 0.3, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'fleet-auxiliary', weight: 0.2, hullIds: ['ship_mule', 'ship_atlas', 'ship_warden'] },
    // Row 515 additions (02 §1 roster): the commander carries the beacon mast; the tender is
    // flat-hulled with clamp arms; the barge is a weighing deck — terrain and job, not an enemy.
    { role: 'formation-commander', weight: 0.08, hullIds: ['ship_drifter', 'ship_bastion'] },
    { role: 'clamp-tender', weight: 0.04, hullIds: ['ship_mule', 'ship_pelican'] },
    { role: 'scale-barge', weight: 0.03, hullIds: ['ship_bastion', 'ship_warden'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 515 — Concord identity mechanics (02 §1).
    commander: {
      // Formations hold shape around a commander hull. Fling or kill it past this distance
      // from the wing's centroid and the rest lock their last formation and coast rigid —
      // the best bowling-pin set in the game. They never re-form without a new commander.
      lockRadiusWu: 120,
      stamp: { aiKey: 'formationLocked' },
    },
    clampTender: {
      // A Clamp Tender grabs loose CARGO, never ships — it has no rule for a hull.
      grabRadiusWu: 200,
      breakRadiusWu: 320,      // out-pull distance that tears the clamp (E-03 tug-of-war)
      maxClampMassT: 400,
    },
    scaleBarge: {
      scannerProfile: 'scale_barge',  // src/data/massSignature.js (row 513)
      finePerTonneCr: 38,
      toleranceT: 2,
    },
    weighing: {
      encounterId: 'the_weighing',    // src/data/encounters/700-the-weighing.js (E-04)
      deck: 'patrol',
      choiceWindowS: 22,
    },
    // Bowling Pins (E-02): a rigid locked formation is throwable set-dressing — drift it into
    // lane traffic and the traffic problem is the game's.
    evidenceLocker: { seizesOutcome: 'weighing_evaded' },
  },
  voiceRegister: 'lawful',
};

export default faction;
