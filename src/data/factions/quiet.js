export const faction = {
  id: 'faction_quiet', name: 'The Quiet', short: 'Quiet', color: '#7A5FB0',
  personality: 'smuggler', startingRep: 0,
  homeSectors: ['sector_pallas_drift', 'sector_io_reach'],
  controls: ['black markets', 'contraband routes'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.5, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_quiet"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#7A5FB0', secondary: '#3A2060', accent: '#B090E8',
    hull: '#706080', emissive: '#9070D0', thruster: '#A080D0',
  },
  shipRoles: [
    { role: 'contracted-lance', weight: 0.4, hullIds: ['ship_hornet', 'ship_wasp', 'ship_bastion'] },
    { role: 'quiet-transport', weight: 0.32, hullIds: ['ship_drifter', 'ship_mule', 'ship_ranger'] },
    { role: 'retained-heavy', weight: 0.18, hullIds: ['ship_warden', 'ship_atlas', 'ship_colossus'] },
    // Row 525 additions (02 §5 roster): runners juggle sealed crates between hulls; the
    // relay buoy-ship sells what it saw.
    { role: 'runner', weight: 0.07, hullIds: ['ship_drifter', 'ship_kestrel'] },
    { role: 'relay-buoy', weight: 0.03, hullIds: ['ship_ranger'] },
  ],
  illegalCommodities: [],
  custom: {
    // §34 row 525 — Quiet identity mechanics (02 §5).
    juggling: {
      // Two runners toss a sealed crate between hulls to break your lock — catching it
      // mid-air with the Line is the game's cleanest skill shot.
      windupS: 2.2,               // telegraphed crouch before the throw
      handoffFlightS: 4.5,        // crate airtime, runner to runner
      catchRadiusWu: 60,          // a runner's catch volume
      throws: 2,                  // the SECOND throw carries the real crate (E-07 twist)
    },
    decoyPods: {
      // Dropped to break a lock or fake a manifest — reads as a fat hull on any scale.
      spoofMassT: 220,
      scanLabel: 'QUIET DECOY — READS 220 T',
    },
    hushHead: {
      // While your Line holds an object its mass does not show on any scale — built for
      // the Weighing. Row 513's signature model reads data.signatureHidden; the head
      // writes it onto held bodies.
      hidesMass: true,
      heldStamp: 'signatureHidden',
    },
    soldRoutes: {
      // The mark they leave: a route you used gets sold — next time it is patrolled.
      // The encounter stamps state.story.flags[markFlag]; patrol planners read it.
      markFlag: 'quiet_sold_route',
    },
    theSwap: {
      encounterId: 'the_swap',    // src/data/encounters/702-the-swap.js (E-07)
      realCrateValueCr: 2600,
    },
  },
  voiceRegister: 'smuggler',
};

export default faction;
