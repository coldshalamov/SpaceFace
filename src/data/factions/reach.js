export const faction = {
  id: 'faction_reach', name: 'Crimson Reach', short: 'Reach', color: '#D8334A',
  personality: 'pirate', startingRep: -50,
  homeSectors: ['sector_sker_haven', 'sector_ashfall_reach'],
  controls: ['lawless sectors', 'ambush lanes'],
  fleetClass: 'pirate',
  relations: { faction_scn: -0.6, faction_mts: -0.35, faction_dmc: -0.35, faction_quiet: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: -0.35, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.5, faction_verge_layers: 0.0 },
  palette: {
    primary: '#D8334A', secondary: '#2A0E14', accent: '#FF6B7A',
    hull: '#4A2A30', emissive: '#FF3A52', thruster: '#FF7A6A',
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
