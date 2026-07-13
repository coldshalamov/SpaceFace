export const faction = {
  id: 'faction_mts', name: 'Meridian Trade Syndicate', short: 'Meridian', color: '#F2B233',
  personality: 'corporate', startingRep: 0,
  homeSectors: ['sector_tethys_junction', 'sector_pallas_drift'],
  controls: ['trade-hub sectors', 'commodity exchanges', 'tolls'],
  fleetClass: 'syndicate',
  relations: { faction_scn: 0.5, faction_dmc: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.2, faction_choir: 0.0 },
  palette: { primary: '#F2B233' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'corporate',
};

export default faction;
