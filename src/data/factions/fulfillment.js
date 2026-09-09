export const faction = {
  id: 'faction_fulfillment', name: 'The Fulfillment', short: 'Fulfillment', color: '#F0F0E8',
  personality: 'clinical_automaton', startingRep: 0,
  homeSectors: [],
  controls: ['fixed shipping routes', 'holding-pattern waypoints', 'administrative boarding'],
  fleetClass: 'automaton', aggression: 0.2,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_archive: 0.0,
    faction_pitborn: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#F0F0E8', secondary: '#C0C8C8', accent: '#40B8E0',
    hull: '#D8D8D0', emissive: '#40B8E0', thruster: '#A0E0F0',
  },
  shipRoles: [
    { role: 're-router-hauler', weight: 0.7, hullIds: ['ship_mule', 'ship_pelican', 'ship_atlas'] },
    { role: 'escort-frigate', weight: 0.2, hullIds: ['ship_bastion', 'ship_warden'] },
    { role: 'routing-clerk-capital', weight: 0.1, hullIds: ['ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {
    interdictsAndBoards: true,
    neverFiresFirst: true,
    fliesFixedRoutesOnly: true,
    boardingIsAdministrativeRoutingEvent: true,
    repStartsNeutralCannotImprove: true,
  },
  voiceRegister: 'administrative-automaton',
};

export default faction;
