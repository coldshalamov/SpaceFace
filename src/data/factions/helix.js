// Paper faction (BP-05): content surfaces only, zero ships. Hostility is never
// inferred from factionId alone; scanner.isHostileToPlayer owns that decision.
export const faction = {
  id: 'faction_helix', name: 'Helix Directorate', short: 'Helix', color: '#8B9CB8',
  personality: 'paper', startingRep: 0,
  homeSectors: [],
  controls: ['contract allocation', 'variance audits', 'dock-deny paperwork'],
  fleetClass: 'none',
  relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0 },
  palette: { primary: '#8B9CB8' },
  shipRoles: [],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'paper',
};

export default faction;
