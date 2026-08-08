export const faction = {
  id: 'faction_free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
  personality: 'independent', startingRep: 40,
  homeSectors: ['sector_io_reach', 'sector_veil_nebula'],
  controls: ['scattered neutral waystations'],
  fleetClass: 'independent',
  relations: { faction_scn: 0.0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_choir: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_free"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#4ECBE0', secondary: '#206070', accent: '#A0EEF8',
    hull: '#808090', emissive: '#4ECBE0', thruster: '#60D8EE',
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
