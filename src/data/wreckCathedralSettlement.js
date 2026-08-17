// Plan 25 — the lived-in berth inside the already-physical Wreck Cathedral.
//
// This is inert authored truth. World owns the station body, Economy owns every listing and credit
// mutation, frontierRumors owns the paid card, and the existing Ceres salvor/patrol pair owns the
// only combat cast. Nothing here duplicates the Cathedral world-site, Archive evidence, or loot.

export const WRECK_CATHEDRAL_SETTLEMENT = Object.freeze({
  id: 'wreck_cathedral_settlement',
  worldSiteId: 'world_site_wreck_cathedral',
  sectorId: 'sector_ceres_belt',
  stationId: 'station_cathedral_cloister',
  name: 'Bell Cloister',
  type: 'blackmarket',
  factionId: 'faction_dmc',
  size: 'S',
  services: Object.freeze(['black_market']),
  archetypeGlb: 'place_station_blackmarket',
  // The stern breach is inside the Cathedral silhouette while clearing the admitted hull proxy,
  // its fly-through sockets, and both authored local job routes at real body radii.
  localPos: Object.freeze({ x: 424, z: 2740 }),
  embeddedWorldSiteId: 'world_site_wreck_cathedral',
  ambientTraffic: false,
  rngNeutralAuthoredAddition: true,
  chartNote: 'A bonded salvage cloister welded into the Cathedral fly-through: votive lamps, sealed relics, and manifests traded under DMC watch.',
  weirdGoods: Object.freeze([
    'cmdty_luxury_goods',
    'cmdty_art',
    'cmdty_classified_salvage',
    'cmdty_stolen_goods',
  ]),
  // An abundance target, not a private price rule: Economy retains its shared curve and stock
  // authority while these four listings start materially cheaper than a neutral berth.
  marketEquilibriumFactors: Object.freeze({
    cmdty_luxury_goods: 2.8,
    cmdty_art: 3.2,
    cmdty_classified_salvage: 2.6,
    cmdty_stolen_goods: 2.4,
  }),
  rumor: Object.freeze({
    id: 'frontier-rumor:station_cathedral_cloister:black-wake-ledger',
    targetSectorId: 'sector_pallas_drift',
    targetPoiId: 'poi_pwreck',
    targetName: 'Black-Wake manifest carrier',
    radius: 520,
    price: 540,
    kind: 'cache',
    kindLabel: 'Black-Wake Burial Ledger',
    text: 'A cantor copied one burial seal before the wreck was fused into the nave. It matches a pirate hulk in Pallas carrying the Black-Wake manifest: find the hulk inside this narrow ring, then read the physical evidence for whatever it was hiding.',
  }),
});

export default WRECK_CATHEDRAL_SETTLEMENT;
