export const faction = {
  id: 'faction_free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
  personality: 'independent', startingRep: 40,
  homeSectors: ['sector_io_reach', 'sector_veil_nebula'],
  controls: ['scattered neutral waystations'],
  fleetClass: 'independent',
  relations: { faction_scn: 0.0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_choir: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  palette: {
    primary: '#4ECBE0', secondary: '#12303A', accent: '#9AE6F2',
    hull: '#4A6E78', emissive: '#5AD8F0', thruster: '#A0E8F5',
  },
  shipRoles: [
    { role: 'frontier-runner', weight: 0.5, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_mule'] },
    { role: 'homestead-guard', weight: 0.3, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'frontier-heavy', weight: 0.2, hullIds: ['ship_pelican', 'ship_ironback', 'ship_atlas'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'independent',
};

export default faction;
