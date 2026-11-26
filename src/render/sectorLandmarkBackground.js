import { getSectorWayOfLife } from '../data/sectorWayOfLife.js';

const recipes = new WeakMap();

// Record the sector's way-of-life landmark identity on the frozen background recipe without
// injecting top-down ship-scale cutout cards into the sky. The backdrop stays sky, planets and glow.
export function withSectorLandmark(recipe, sectorId) {
  const identity = getSectorWayOfLife(sectorId);
  if (!recipe || !identity?.landmark) return recipe;
  let bySector = recipes.get(recipe);
  if (!bySector) recipes.set(recipe, bySector = new Map());
  if (bySector.has(sectorId)) return bySector.get(sectorId);
  const result = Object.freeze({
    ...recipe,
    id: `${recipe.id}:${sectorId}:landmark`,
    landmarkSource: identity.landmark,
    structures: Object.freeze([]),
  });
  bySector.set(sectorId, result);
  return result;
}
