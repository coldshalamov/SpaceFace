/**
 * Recipe/quality-driven segmented plume plane geometry.
 * Axial UV.x must have real samples so the shared axial width envelope is not a flat card.
 */

/**
 * @param {object} recipe
 * @param {'high'|'medium'|'low'} qualityTier
 * @returns {number} width-segment count for PlaneGeometry
 */
export function resolveSegmentCount(recipe, qualityTier = 'high') {
  const tier = qualityTier === 'medium' || qualityTier === 'low' ? qualityTier : 'high';
  const fromQuality = recipe?.quality?.[tier]?.segments;
  if (Number.isInteger(fromQuality) && fromQuality >= 1) {
    return Math.min(64, fromQuality);
  }
  const fromGeo = recipe?.geometry?.segmentCount;
  if (Number.isInteger(fromGeo) && fromGeo >= 1) {
    return Math.min(64, fromGeo);
  }
  return 1;
}

/**
 * Vertex count for a plane with `segments` along length and 1 across width.
 * Three.js PlaneGeometry: (widthSegments+1) * (heightSegments+1).
 */
export function segmentedVertexCount(segments) {
  const s = Math.max(1, segments | 0);
  return (s + 1) * 2;
}

/**
 * Index count (triangle list) for the same plane.
 */
export function segmentedIndexCount(segments) {
  const s = Math.max(1, segments | 0);
  return s * 1 * 6;
}

/**
 * Build a unit plane pivoted at the nozzle (x=0) extending to +x (exhaust along local +x
 * before instance axis remap). `segments` samples the axial envelope along length.
 *
 * @param {typeof import('three')} THREE
 * @param {number} segments
 * @returns {import('three').PlaneGeometry}
 */
export function createSegmentedPlumeGeometry(THREE, segments) {
  const segs = Math.max(1, Math.min(64, segments | 0));
  const geo = new THREE.PlaneGeometry(1, 1, segs, 1);
  geo.translate(0.5, 0, 0);
  geo.userData.plumeSegments = segs;
  geo.userData.plumeVertexCount = segmentedVertexCount(segs);
  geo.userData.plumeIndexCount = segmentedIndexCount(segs);
  return geo;
}

/**
 * Prebuild high/medium/low geometries for a recipe. Call once at system construction.
 * @returns {{ high: object, medium: object, low: object, dispose: Function }}
 */
export function createQualityGeometrySet(THREE, recipe) {
  const high = createSegmentedPlumeGeometry(THREE, resolveSegmentCount(recipe, 'high'));
  const medium = createSegmentedPlumeGeometry(THREE, resolveSegmentCount(recipe, 'medium'));
  const low = createSegmentedPlumeGeometry(THREE, resolveSegmentCount(recipe, 'low'));
  return {
    high,
    medium,
    low,
    dispose() {
      if (high.dispose) high.dispose();
      if (medium.dispose) medium.dispose();
      if (low.dispose) low.dispose();
    },
  };
}
