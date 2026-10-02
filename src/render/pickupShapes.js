// Pickup solids: one bold silhouette per commodity CATEGORY (GFX-16 slice 5).
//
// Every loot pickup used to be the same octahedron in one of 14 tints. The geometry here is authored
// in Blender (tools/blender/forge/pickups/pickup_kit.py, re-runnable headless or through the Blender
// MCP, byte-identical either way) and baked into pickupShapeData.generated.js. Baked, not loaded:
// there is no fetch, no GLB decode and no first-spawn hitch, the same reasoning as
// src/render/vfx/fragmentFamilies.js. Geometry only: the material (dark metal + emissive category
// tint) stays with visualFactory so the Look still owns how pickups answer light.
//
// Every shape fits the unit sphere, so the existing `scale = radius` placement and the pickup hit/
// magnet radii are unchanged. Shapes are flat-shaded (non-indexed triangles, computed normals).
import * as THREE from 'three';
import { COMMODITIES } from '../data/commodities.js';
import { PICKUP_SHAPES } from './pickupShapeData.generated.js';

export { PICKUP_SHAPES };

/** Commodity category (src/data/commodities.js) -> shape name in the baked kit. */
export const PICKUP_SHAPE_BY_CATEGORY = Object.freeze({
  'raw ore': 'raw_ore',
  gas: 'gas',
  crystal: 'crystal',
  exotic: 'exotic',
  salvage: 'salvage',
  bioresource: 'bioresource',
  protocol: 'protocol',
  refined: 'refined',
  component: 'component',
  tech: 'tech',
  consumer: 'consumer',
  luxury: 'luxury',
  food: 'food',
  med: 'med',
  contraband: 'contraband',
  military: 'military',
});

/** Raw ores that are cut stones read as a gem, not as a rock. */
const GEM_COMMODITY_IDS = new Set([
  'cmdty_gem_emerald', 'cmdty_gem_ruby', 'cmdty_gem_diamond', 'cmdty_exotic_amazonite',
]);

const CATEGORY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c.category]));

/**
 * The kit shape for a commodity id, or null when the id is unknown (the caller keeps the original
 * octahedron for modules and anything that is not a commodity).
 */
export function pickupShapeForCommodity(commodityId) {
  if (!commodityId) return null;
  if (GEM_COMMODITY_IDS.has(commodityId)) return 'gem';
  const category = CATEGORY_BY_ID.get(commodityId);
  return (category && PICKUP_SHAPE_BY_CATEGORY[category]) || null;
}

/** Flat-shaded unit-sphere BufferGeometry for a shape name. Callers cache it (visualFactory.getGeometry). */
export function buildPickupGeometry(name) {
  const shape = PICKUP_SHAPES[name];
  if (!shape) return null;
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(shape.positions, 3));
  indexed.setIndex(shape.indices);
  const flat = indexed.toNonIndexed();   // flat shading: one normal per face
  indexed.dispose();
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}
