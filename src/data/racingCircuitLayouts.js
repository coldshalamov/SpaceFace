// Quick-play scenery uses the same authored courses and existing asteroid budget.
// Legs are zero-based; weights describe where each material makes a recognizable bank.
export const RACING_CIRCUIT_LAYOUTS = Object.freeze({
  sector_helios_prime: Object.freeze({
    name: 'Twin-quarry slalom',
    hullRadiusWU: 32,
    shoulderWU: 18,
    edgeDepthWU: 72,
    fields: Object.freeze({
      f_helios_starter: Object.freeze([0, 1, 1, 2, 2, 3, 9, 10]),
      f_helios_outer: Object.freeze([4, 5, 5, 6, 6, 7, 8]),
    }),
  }),
  sector_tethys_junction: Object.freeze({
    name: 'Customs chicane and express return',
    hullRadiusWU: 32,
    shoulderWU: 22,
    edgeDepthWU: 44,
    fields: Object.freeze({
      f_tethys_1: Object.freeze([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]),
    }),
  }),
  sector_veil_nebula: Object.freeze({
    name: 'Shelter islands and exposed burn',
    hullRadiusWU: 32,
    shoulderWU: 28,
    edgeDepthWU: 115,
    fields: Object.freeze({
      f_veil_1: Object.freeze([0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8]),
    }),
  }),
});
