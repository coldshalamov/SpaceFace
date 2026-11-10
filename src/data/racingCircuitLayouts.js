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

  // ── AL-RACE-2 — one layout per sector circuit. Legs are zero-based over the
  // frozen gate chain (leg i runs gates[i]→gates[i+1]); each field banks the legs
  // beside its own material. hullRadiusWU stays 32 for the fitted starter hull.
  sector_pallas_drift: Object.freeze({
    name: 'Reef surge crossing and ice return',
    hullRadiusWU: 32,
    shoulderWU: 24,
    edgeDepthWU: 80,
    fields: Object.freeze({
      f_pallas_1: Object.freeze([2, 3, 3, 4, 4]),
      f_pallas_2: Object.freeze([6, 6, 7]),
      f_pallas_3: Object.freeze([8, 9, 9, 10]),
    }),
  }),
  sector_vesta_forge: Object.freeze({
    name: 'Belt gather and storm sheet',
    hullRadiusWU: 32,
    shoulderWU: 22,
    edgeDepthWU: 72,
    fields: Object.freeze({
      f_vesta_1: Object.freeze([4, 4, 5, 5]),
      f_vesta_2: Object.freeze([7, 7, 8]),
      f_vesta_3: Object.freeze([8, 9, 9]),
    }),
  }),
  sector_ceres_belt: Object.freeze({
    name: 'Sluice mouth crossings',
    hullRadiusWU: 32,
    shoulderWU: 26,
    edgeDepthWU: 96,
    fields: Object.freeze({
      f_ceres_1: Object.freeze([3, 3, 4]),
      f_ceres_2: Object.freeze([2, 2, 3]),
      f_ceres_3: Object.freeze([8, 8, 9]),
    }),
  }),
  sector_haumea_rift: Object.freeze({
    name: 'Fissure ice arc',
    hullRadiusWU: 32,
    shoulderWU: 24,
    edgeDepthWU: 88,
    fields: Object.freeze({
      f_haumea_1: Object.freeze([1, 2, 2, 3, 3, 4]),
      f_haumea_2: Object.freeze([6, 6, 7]),
    }),
  }),
  sector_kepler_scar: Object.freeze({
    name: 'Scar descent and debris arc',
    hullRadiusWU: 32,
    shoulderWU: 20,
    edgeDepthWU: 72,
    fields: Object.freeze({
      f_kepler_1: Object.freeze([6, 6, 7, 7]),
      f_kepler_2: Object.freeze([1, 2, 2, 3]),
    }),
  }),
  sector_sker_haven: Object.freeze({
    name: 'Throne pass and bazaar cut',
    hullRadiusWU: 32,
    shoulderWU: 28,
    edgeDepthWU: 110,
    fields: Object.freeze({
      f_sker_1: Object.freeze([5, 6, 6, 7, 7, 8]),
    }),
  }),
});
