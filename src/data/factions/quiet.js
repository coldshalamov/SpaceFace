export const faction = {
  id: 'faction_quiet', name: 'The Quiet', short: 'Quiet', color: '#7A5FB0',
  personality: 'smuggler', startingRep: 0,
  homeSectors: ['sector_pallas_drift', 'sector_io_reach'],
  controls: ['black markets', 'contraband routes'],
  fleetClass: 'mercenary',
  relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0 },
  palette: { primary: '#7A5FB0' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'smuggler',
};

export default faction;
