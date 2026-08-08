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
    { role: 'claim-barge', weight: 0.5, hullIds: ['ship_pelican', 'ship_ironback', 'ship_mule'] },
    { role: 'field-guard', weight: 0.3, hullIds: ['ship_wasp', 'ship_drifter', 'ship_hornet'] },
    { role: 'deep-survey', weight: 0.2, hullIds: ['ship_ranger', 'ship_kestrel', 'ship_atlas'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'blue-collar',
};

export default faction;
