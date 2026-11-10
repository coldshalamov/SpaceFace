import CATALOG from '../../../assets/wreck-court/variants.json' with { type: 'json' };

const byId = Object.create(null);
for (const variant of CATALOG.variants) byId[variant.id] = Object.freeze({ ...variant, vertices: Object.freeze(variant.vertices.map((pair) => Object.freeze(pair.slice()))) });

export const WRECK_COURT_VARIANT_NOTE = CATALOG.note;
export const WRECK_COURT_VARIANTS = Object.freeze(byId);
export const WRECK_COURT_VARIANT_IDS = Object.freeze(CATALOG.variants.map((v) => v.id));

export function wreckCourtVariant(id) {
  return WRECK_COURT_VARIANTS[id] || null;
}
