export const faction = {
  id: 'faction_choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
  personality: 'zealot', startingRep: 0,
  homeSectors: ['sector_vesta_forge'],
  controls: ['fortified zealot sectors', 'relic shrines'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.3, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: -0.6, faction_free: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_choir"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#E85FD0', secondary: '#702060', accent: '#F8A0E8',
    hull: '#905080', emissive: '#E85FD0', thruster: '#FF80E8',
  },
  shipRoles: [
    { role: 'chorister-wing', weight: 0.45, hullIds: ['ship_wasp', 'ship_hornet', 'ship_drifter'] },
    { role: 'pilgrim-transport', weight: 0.35, hullIds: ['ship_mule', 'ship_pelican', 'ship_ranger'] },
    { role: 'cathedral-hull', weight: 0.2, hullIds: ['ship_bastion', 'ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'zealot',
};

export default faction;
