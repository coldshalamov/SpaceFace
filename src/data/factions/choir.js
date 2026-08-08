export const faction = {
  id: 'faction_choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
  personality: 'zealot', startingRep: 0,
  homeSectors: ['sector_vesta_forge'],
  controls: ['fortified zealot sectors', 'relic shrines'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.3, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: -0.6, faction_free: -0.2, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  palette: {
    primary: '#E85FD0', secondary: '#2E1030', accent: '#FFA8EE',
    hull: '#6A4868', emissive: '#FF6FE0', thruster: '#FFAEEE',
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
