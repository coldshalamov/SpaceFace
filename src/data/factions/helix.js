// Paper faction (BP-05): content surfaces only, zero ships. Hostility is never
// inferred from factionId alone; scanner.isHostileToPlayer owns that decision.
export const faction = {
  id: 'faction_helix', name: 'Helix Directorate', short: 'Helix', color: '#8B9CB8',
  personality: 'paper', startingRep: 0,
  homeSectors: [],
  controls: ['contract allocation', 'variance audits', 'dock-deny paperwork'],
  fleetClass: 'none',
  relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: 0.0, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_helix"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#8B9CB8', secondary: '#465066', accent: '#C5CEDD',
    hull: '#667085', emissive: '#8B9CB8', thruster: '#A8B7D0',
  },
  shipRoles: [
    { role: 'directorate-courier', weight: 0.45, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'directorate-security', weight: 0.35, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'directorate-freight', weight: 0.2, hullIds: ['ship_mule', 'ship_atlas', 'ship_ironback'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'paper',
};

export default faction;
