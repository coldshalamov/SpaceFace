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
    { role: 'contracted-lance', weight: 0.45, hullIds: ['ship_hornet', 'ship_wasp', 'ship_bastion'] },
    { role: 'quiet-transport', weight: 0.35, hullIds: ['ship_drifter', 'ship_mule', 'ship_ranger'] },
    { role: 'retained-heavy', weight: 0.2, hullIds: ['ship_warden', 'ship_atlas', 'ship_colossus'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'smuggler',
};

export default faction;
