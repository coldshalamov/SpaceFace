// Commodity-specific persistent demand profiles.
//
// These are averaged sector conditions, not entity accounting. Deltas are additive inside one
// bounded multiplier so role/stock remains the structural price level and the cycle remains a
// short-term overlay. The profile language is also the canonical source for player-facing causes.

export const DEMAND_MULTIPLIER_BOUNDS = Object.freeze({ min: 0.72, max: 1.45 });

export const ECONOMY_DEMAND_PROFILES = Object.freeze({
  war: Object.freeze({
    id: 'war-footing',
    label: 'War footing',
    defaultDelta: 0,
    categoryDelta: Object.freeze({ military: 0.22, med: 0.14, food: 0.08 }),
    commodityDelta: Object.freeze({ cmdty_fuel_cells: 0.12 }),
  }),
  blockade: Object.freeze({
    id: 'blockade-relief',
    label: 'Blockade pressure',
    // Transport failure raises the cost of keeping any lawful supply moving, while discretionary
    // consumer and luxury demand contracts. Relief goods receive an additional specific premium.
    defaultDelta: 0.04,
    categoryDelta: Object.freeze({ consumer: -0.18, luxury: -0.22 }),
    commodityDelta: Object.freeze({
      cmdty_medical: 0.16,
      cmdty_food: 0.12,
      cmdty_fuel_cells: 0.12,
    }),
  }),
  industrialExpansion: Object.freeze({
    id: 'industrial-expansion',
    label: 'Industrial expansion',
    defaultDelta: 0,
    categoryDelta: Object.freeze({ refined: 0.10, component: 0.14, tech: 0.08 }),
    commodityDelta: Object.freeze({}),
  }),
});
