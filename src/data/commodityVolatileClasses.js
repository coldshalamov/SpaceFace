// src/data/commodityVolatileClasses.js — PQ-148.01 Volatile cargo classes.
//
// Volatile cargo classes define physical behavior when cargo pods are jettisoned,
// spilled, or shoved as dynamic bodies (build_map §15, PQ-148.01).
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
  cryogenic: Object.freeze({
    id: 'cryogenic',
    lamp: 'cyan',
    silhouetteNote: 'Double-jacketed cryo flask with frost venting and thermal isolation bands',
    slam: 'cryo_flash',
    fieldPull: false,
    throwRangeMult: 1.0,
  }),
});

export const VOLATILE_BY_COMMODITY = Object.freeze({
  // Explosive: high-energy fuel cells, pressurized combustible gas, military munitions, and impulse charges
  cmdty_fuel_cells: 'explosive',
  cmdty_munitions: 'explosive',
  cmdty_impulse_charge: 'explosive',
  cmdty_gas_hydrogen: 'explosive',

  // Corrosive: volatile ice, reactive exotic compounds
  cmdty_volatiles: 'corrosive',
  cmdty_exotic_xenium: 'corrosive',

  // Superdense: dense heavy ballast ores and relativistic core elements
  cmdty_ore_platinoid: 'superdense',
  cmdty_ore_platinium: 'superdense',
  cmdty_ore_goldium: 'superdense',
  cmdty_ore_einsteinium: 'superdense',

  // Cryogenic: sub-zero coolant ice and supercooled liquid gas
  cmdty_ice_water: 'cryogenic',
  cmdty_gas_helium3: 'cryogenic',
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
