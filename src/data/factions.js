// src/data/factions.js – 8 canonical factions.
// IDs use faction_ prefix per ARCHITECTURE §0.4.
// homeSectors use sector_ prefix. Rep scale: -1000..+1000.
// Pure data, no imports.

export const FACTION_META = [
  {
    id: 'faction_scn', name: 'Solar Concord Navy', short: 'Concord', color: '#3A78FF',
    personality: 'lawful', startingRep: 0,
    homeSectors: ['sector_helios_prime', 'sector_tethys_junction'],
    controls: ['core sectors', 'jump-gate checkpoints', 'customs scans'],
    fleetClass: 'federation',
    relations: { faction_mts: 0.5, faction_dmc: 0.0, faction_reach: -0.6, faction_quiet: 0.0, faction_vael: -0.5, faction_free: 0.0, faction_choir: 0.3 },
  },
  {
    id: 'faction_mts', name: 'Meridian Trade Syndicate', short: 'Meridian', color: '#F2B233',
    personality: 'corporate', startingRep: 0,
    homeSectors: ['sector_tethys_junction', 'sector_pallas_drift'],
    controls: ['trade-hub sectors', 'commodity exchanges', 'tolls'],
    fleetClass: 'syndicate',
    relations: { faction_scn: 0.5, faction_dmc: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.2, faction_choir: 0.0 },
  },
  {
    id: 'faction_dmc', name: 'Drift Miners Collective', short: 'Drift', color: '#C9772E',
    personality: 'blue-collar', startingRep: 0,
    homeSectors: ['sector_ceres_belt', 'sector_vesta_forge', 'sector_charon_expanse'],
    controls: ['asteroid-rich sectors', 'refineries', 'ore prices'],
    fleetClass: 'independent',
    relations: { faction_scn: 0.0, faction_mts: -0.2, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.35, faction_choir: 0.0 },
  },
  {
    id: 'faction_reach', name: 'Crimson Reach', short: 'Reach', color: '#D8334A',
    personality: 'pirate', startingRep: -50,
    homeSectors: ['sector_sker_haven', 'sector_ashfall_reach'],
    controls: ['lawless sectors', 'ambush lanes'],
    fleetClass: 'pirate',
    relations: { faction_scn: -0.6, faction_mts: -0.35, faction_dmc: -0.35, faction_quiet: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: -0.35 },
  },
  {
    id: 'faction_quiet', name: 'The Quiet', short: 'Quiet', color: '#7A5FB0',
    personality: 'smuggler', startingRep: 0,
    homeSectors: ['sector_pallas_drift', 'sector_io_reach'],
    controls: ['black markets', 'contraband routes'],
    fleetClass: 'mercenary',
    relations: { faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.2, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0 },
  },
  {
    id: 'faction_vael', name: 'The Vael', short: 'Vael', color: '#2FCFA0',
    personality: 'xenophobic', startingRep: -120,
    homeSectors: ['sector_veil_nebula', 'sector_ashfall_reach'],
    controls: ['far-rim sectors', 'exotic tech', 'unique commodities'],
    fleetClass: 'alien',
    relations: { faction_scn: -0.5, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0, faction_quiet: 0.0, faction_free: 0.0, faction_choir: -0.6 },
  },
  {
    id: 'faction_free', name: 'Free Frontier', short: 'Frontier', color: '#4ECBE0',
    personality: 'independent', startingRep: 40,
    homeSectors: ['sector_io_reach', 'sector_veil_nebula'],
    controls: ['scattered neutral waystations'],
    fleetClass: 'independent',
    relations: { faction_scn: 0.0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0.0, faction_quiet: 0.0, faction_vael: 0.0, faction_choir: -0.2 },
  },
  {
    id: 'faction_choir', name: 'Ascendant Choir', short: 'Choir', color: '#E85FD0',
    personality: 'zealot', startingRep: 0,
    homeSectors: ['sector_vesta_forge'],
    controls: ['fortified zealot sectors', 'relic shrines'],
    fleetClass: 'mercenary',
    relations: { faction_scn: 0.3, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: -0.35, faction_quiet: 0.0, faction_vael: -0.6, faction_free: -0.2 },
  },
];
