export const faction = {
  id: 'faction_choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
  personality: 'zealot', startingRep: 0,
  homeSectors: ['sector_vesta_forge'],
  controls: ['fortified zealot sectors', 'relic shrines'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.3, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: -0.6, faction_free: -0.2 },
  palette: { primary: '#E85FD0' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'zealot',
};

export default faction;
