export const faction = {
  id: 'faction_mts', name: 'Meridian Trade Syndicate', short: 'Meridian', color: '#F2B233',
  personality: 'corporate', startingRep: 0,
  homeSectors: ['sector_tethys_junction', 'sector_pallas_drift'],
  controls: ['trade-hub sectors', 'commodity exchanges', 'tolls'],
  fleetClass: 'syndicate',
  relations: { faction_scn: 0.5, faction_dmc: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.2, faction_choir: 0.0, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  palette: {
    primary: '#F2B233', secondary: '#3D2E12', accent: '#FFD98A',
    hull: '#8A7550', emissive: '#FFC84A', thruster: '#FFE0A0',
  },
  shipRoles: [
    { role: 'contract-hauler', weight: 0.5, hullIds: ['ship_mule', 'ship_atlas', 'ship_ironback'] },
    { role: 'retained-escort', weight: 0.35, hullIds: ['ship_wasp', 'ship_hornet', 'ship_drifter'] },
    { role: 'syndicate-flag', weight: 0.15, hullIds: ['ship_bastion', 'ship_warden', 'ship_colossus'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'corporate',
};

export default faction;
