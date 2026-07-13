export const faction = {
  id: 'faction_free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
  personality: 'independent', startingRep: 40,
  homeSectors: ['sector_io_reach', 'sector_veil_nebula'],
  controls: ['scattered neutral waystations'],
  fleetClass: 'independent',
  relations: { faction_scn: 0.0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_choir: -0.2 },
  palette: { primary: '#4ECBE0' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'independent',
};

export default faction;
