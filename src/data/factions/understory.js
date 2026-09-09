export const faction = {
  id: 'faction_understory', name: 'The Understory', short: 'Understory', color: '#8FA82E',
  personality: 'saprophyte', startingRep: 0,
  homeSectors: ['sector_charon_expanse'],
  controls: ['graveyard salvage', 'post-battle wreck recovery', 'wreckage exchange'],
  fleetClass: 'xenomorphic', aggression: 0.3,
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
    { role: 'rot-frigate', weight: 0.6, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'], source: 'lossLedgerOnly' },
    { role: 'spore-tender', weight: 0.3, hullIds: ['ship_pelican', 'ship_mule', 'ship_drifter'], source: 'lossLedgerOnly' },
    { role: 'bloated-carrier-barge', weight: 0.1, hullIds: ['ship_ironback', 'ship_atlas', 'ship_colossus'], source: 'lossLedgerOnly' },
  ],
  illegalCommodities: [],
  custom: {
    neverFiresFirst: true,
    scavengesAfterBattles: true,
    refliesLedgerHullsOnly: true,
    sporeBloomOnDeath: true,
    buysWreckageAndAsksNothing: true,
  },
  voiceRegister: 'saprophyte',
};

export default faction;
