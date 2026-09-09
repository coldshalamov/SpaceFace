export const faction = {
  id: 'faction_verge_layers', name: 'The Verge-Layers', short: 'Verge-Layers', color: '#B0A8B8',
  personality: 'nacre_precursor', startingRep: 0,
  homeSectors: ['sector_veil_nebula', 'sector_ashfall_reach'],
  controls: ['jump-gate network', 'priority transit', 'gate-closure audits'],
  fleetClass: 'precursor', aggression: 0.0,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_archive: 0.0, faction_pitborn: 0.0,
  },
  palette: {
    primary: '#B0A8B8', secondary: '#6A6080', accent: '#6A6080',
    hull: '#B0A8B8', emissive: '#C0B8D8', thruster: '#C0B8D8',
  },
  shipRoles: [
    { role: 'surveyor-prism', weight: 0.6, hullIds: ['ship_wasp', 'ship_ranger'] },
    { role: 'revocation-lattice', weight: 0.3, hullIds: ['ship_bastion', 'ship_warden'] },
    { role: 'gate-auditor', weight: 0.1, hullIds: ['ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {
    hostileOnlyToGateClosers: true,
    weaponsDisableNotDestroy: true,
    wakesProgressivelyAsGatesClose: true,
    neutralToEveryoneElse: true,
  },
  voiceRegister: 'precursor-interrogative',
};

export default faction;
