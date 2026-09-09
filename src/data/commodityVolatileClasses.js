// src/data/commodityVolatileClasses.js — PQ-148.01 Volatile cargo classes.
//
// Volatile cargo classes define physical behavior when cargo pods are jettisoned,
// spilled, or shoved as dynamic bodies (CANONICAL_BUILD_MAP §15, PQ-148.01).
// Pure data catalog and lookup helpers: deterministic, no UI, no ambient randomness.

export const VOLATILE_CLASSES = Object.freeze({
  explosive: Object.freeze({
    id: 'explosive',
    lamp: 'amber',
    silhouetteNote: 'Ribbed pressurized canister with warning collars and radial vent seams',
    slam: 'radial_impulse',
    fieldPull: false,
    throwRangeMult: 1.0,
  }),
  corrosive: Object.freeze({
    id: 'corrosive',
    lamp: 'green',
    silhouetteNote: 'Reinforced containment flask with chemical wash seals and drip collars',
    slam: 'hull_tick',
    fieldPull: false,
    throwRangeMult: 1.0,
  }),
  superdense: Object.freeze({
    id: 'superdense',
    lamp: 'violet',
    silhouetteNote: 'Compact heavy-mass ingot frame with magnetic anchor lugs and dense core ballast',
    slam: null,
    fieldPull: true,
    throwRangeMult: 0.5,
  }),
});

export const VOLATILE_BY_COMMODITY = Object.freeze({
  cmdty_fuel_cells: 'explosive',
  cmdty_volatiles: 'corrosive',
  cmdty_ore_platinoid: 'superdense',
});

/**
 * Resolve the volatile class entry for a commodity ID or record.
 * Returns the frozen entry from VOLATILE_CLASSES, or null if the commodity is not volatile.
 *
 * @param {string|object} commodityId - Commodity ID string or entity/object containing id
 * @returns {object|null}
 */
export function volatileClassOf(commodityId) {
  if (!commodityId) return null;
  const id = typeof commodityId === 'object' ? (commodityId.commodityId || commodityId.id) : commodityId;
  if (!id || typeof id !== 'string') return null;

  const classId = VOLATILE_BY_COMMODITY[id];
  if (classId && VOLATILE_CLASSES[classId]) {
    return VOLATILE_CLASSES[classId];
  }
  if (VOLATILE_CLASSES[id]) {
    return VOLATILE_CLASSES[id];
  }
  return null;
}

export default {
  VOLATILE_CLASSES,
  VOLATILE_BY_COMMODITY,
  volatileClassOf,
};
