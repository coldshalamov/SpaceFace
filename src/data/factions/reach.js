export const faction = {
  id: 'faction_reach', name: 'Crimson Reach', short: 'Reach', color: '#D8334A',
  personality: 'pirate', startingRep: -50,
  homeSectors: ['sector_sker_haven', 'sector_ashfall_reach'],
  controls: ['lawless sectors', 'ambush lanes'],
  fleetClass: 'pirate',
  relations: { faction_scn: -0.6, faction_mts: -0.35, faction_dmc: -0.35, faction_quiet: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: -0.35 },
  palette: { primary: '#D8334A' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'pirate',
};

export default faction;
