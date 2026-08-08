export const faction = {
  id: 'faction_scn', name: 'Solar Concord Navy', short: 'Concord', color: '#3A78FF',
  personality: 'lawful', startingRep: 0,
  homeSectors: ['sector_helios_prime', 'sector_tethys_junction'],
  controls: ['core sectors', 'jump-gate checkpoints', 'customs scans'],
  fleetClass: 'federation',
  // Relations encode enduring reputation spillover; conditional ROE belongs in factionDoctrines/custom flags.
  relations: { faction_mts: 0.5, faction_dmc: 0.0, faction_reach: -0.6, faction_quiet: 0.0, faction_vael: -0.5, faction_free: 0.0, faction_choir: 0.3, faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0, faction_archive: 0.0, faction_pitborn: -0.6, faction_verge_layers: 0.0 },
  // Mirrors FACTION_PALETTES["faction_scn"] in src/data/palettes.js, which is what the
  // renderer actually reads. Two six-key palettes for one faction would drift silently.
  palette: {
    primary: '#3A78FF', secondary: '#1A3A8F', accent: '#A0C4FF',
    hull: '#C8D8F0', emissive: '#3A78FF', thruster: '#88AAFF',
  },
  shipRoles: [
    { role: 'customs-cutter', weight: 0.4, hullIds: ['ship_kestrel', 'ship_drifter', 'ship_ranger'] },
    { role: 'patrol-wing', weight: 0.35, hullIds: ['ship_wasp', 'ship_hornet', 'ship_bastion'] },
    { role: 'fleet-auxiliary', weight: 0.25, hullIds: ['ship_mule', 'ship_atlas', 'ship_warden'] },
  ],
  illegalCommodities: [],
  custom: {},
  voiceRegister: 'lawful',
};

export default faction;
