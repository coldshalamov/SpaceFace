export const faction = {
  id: 'faction_pitborn', name: 'The Pitborn', short: 'Pitborn', color: '#C8501C',
  personality: 'pitborn_patchwork', startingRep: 40,
  homeSectors: ['sector_ashfall_reach'],
  controls: ['deep-space anchorage', 'salvage yards', 'wreck fences'],
  fleetClass: 'scrapper', aggression: 0.6,
  relations: {
    faction_scn: -0.6, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.5,
    faction_quiet: 0.5, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_archive: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#C8501C', secondary: '#4A3028', accent: '#E8B43A',
    hull: '#6B584F', emissive: '#B06020', thruster: '#D87838',
  },
  shipRoles: [
    { role: 'salvage-tender', weight: 0.5, hullIds: ['ship_mule', 'ship_pelican', 'ship_ironback'] },
    { role: 'yard-defense-gunship', weight: 0.3, hullIds: ['ship_drifter', 'ship_hornet', 'ship_bastion'] },
    { role: 'yardmaster-capital', weight: 0.2, hullIds: ['ship_atlas', 'ship_warden', 'ship_colossus'] },
  ],
  illegalCommodities: [],
  custom: {
    hostileToConcordAlways: true,
    alliedWithReachAndQuiet: true,
    recognizesPlayerAsPitborn: true,
    repStartsPositiveForPlayer: true,
    buysWrecksAtFixedRates: true,
    civilianHullsSacrosanct: true,
  },
  voiceRegister: 'escaped-scrapper',
};

export default faction;
