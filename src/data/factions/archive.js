export const faction = {
  id: 'faction_archive', name: 'The Archive', short: 'Archive', color: '#3A2A5A',
  personality: 'archivist', startingRep: 0,
  homeSectors: ['sector_pallas_drift'],
  controls: ['the Severed Codex', 'reading-room stations', 'document exchange'],
  fleetClass: 'monastic', aggression: 0.1,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_pitborn: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#3A2A5A', secondary: '#1A0A2A', accent: '#B88830',
    hull: '#3A2A5A', emissive: '#B88830', thruster: '#8060C0',
  },
  shipRoles: [
    { role: 'censor-frigate', weight: 0.6, hullIds: ['ship_ranger', 'ship_bastion'] },
    { role: 'abbot-cruiser', weight: 0.3, hullIds: ['ship_warden', 'ship_colossus'] },
    { role: 'indexer-capital', weight: 0.1, hullIds: ['ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {
    tradesOnlyInSecrets: true,
    neutralToAll: true,
    redactionEMP: true,
    burningAnArchiveUnitesTheGalaxyAgainstYou: true,
  },
  voiceRegister: 'silent-script',
};

export default faction;
