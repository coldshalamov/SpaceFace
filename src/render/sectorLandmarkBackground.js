import { getSectorWayOfLife } from '../data/sectorWayOfLife.js';
import { DEEP_FIELD_STRUCTURE_RECIPES } from './deepFieldStructureRecipes.js';

const recipes = new WeakMap();

// The distant structure uses the same landmark identity the sector's jobs and glossary name.
// Reuse the established authored structure art and its depth/coverage/disposal path.
export function withSectorLandmark(recipe, sectorId) {
  const identity = getSectorWayOfLife(sectorId);
  if (!recipe || !identity?.landmark) return recipe;
  let bySector = recipes.get(recipe);
  if (!bySector) recipes.set(recipe, bySector = new Map());
  if (bySector.has(sectorId)) return bySector.get(sectorId);
  const art = DEEP_FIELD_STRUCTURE_RECIPES.helios_orbital_void.structures;
  const hull = /wreck|cathedral|funnel|rib|shard/i.test(identity.landmark);
  const source = art.find(row => row.art.kind === (hull ? 'derelict_hauler' : 'relay_mast'));
  const result = Object.freeze({ ...recipe, id: `${recipe.id}:${sectorId}:landmark`,
    landmarkSource: identity.landmark,
    structures: Object.freeze([...(recipe.structures || []), Object.freeze({ ...source, id: `way-of-life:${sectorId}`,
      landmarkSource: identity.landmark, scale: hull ? 0.16 : 0.18,
      offset: Object.freeze([0.92, -0.14]) })]),
  });
  bySector.set(sectorId, result);
  return result;
}
