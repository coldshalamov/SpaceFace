export const faction = {
  id: 'faction_scn', name: 'Solar Concord Navy', short: 'Concord', color: '#3A78FF',
  personality: 'lawful', startingRep: 0,
  homeSectors: ['sector_helios_prime', 'sector_tethys_junction'],
  controls: ['core sectors', 'jump-gate checkpoints', 'customs scans'],
  fleetClass: 'federation',
  relations: { faction_mts: 0.5, faction_dmc: 0.0, faction_reach: -0.6, faction_quiet: 0.0, faction_vael: -0.5, faction_free: 0.0, faction_choir: 0.3 },
  palette: { primary: '#3A78FF' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'lawful',
};

export default faction;
