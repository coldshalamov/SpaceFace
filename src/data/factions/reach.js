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
    { role: 'raid-pack', weight: 0.5, hullIds: ['ship_hornet', 'ship_wasp', 'ship_drifter'] },
    { role: 'prize-crew', weight: 0.3, hullIds: ['ship_mule', 'ship_pelican', 'ship_atlas'] },
    { role: 'reach-heavy', weight: 0.2, hullIds: ['ship_bastion', 'ship_warden', 'ship_colossus'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'pirate',
};

export default faction;
