export const faction = {
  id: 'faction_vael', name: 'The Vael', short: 'Vael', color: '#2FCFA0',
  personality: 'xenophobic', startingRep: -120,
  homeSectors: ['sector_veil_nebula', 'sector_ashfall_reach'],
  controls: ['far-rim sectors', 'exotic tech', 'unique commodities'],
  fleetClass: 'alien',
  relations: { faction_scn: -0.5, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_free: 0.0, faction_choir: -0.6, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  palette: {
    primary: '#2FCFA0', secondary: '#0E2A24', accent: '#7FE8C8',
    hull: '#3A6656', emissive: '#3FF0B8', thruster: '#8AF0D0',
  },
  shipRoles: [
    { role: 'vael-skiff', weight: 0.45, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'vael-lance', weight: 0.35, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'vael-ark', weight: 0.2, hullIds: ['ship_atlas', 'ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'xenophobic',
};

export default faction;
