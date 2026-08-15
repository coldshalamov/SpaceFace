// Scene-level authored InstancedMesh chunks sit at the origin and carry world
// matrices on each instance. Three therefore cannot frustum-cull them from the
// source geometry, and they used to keep castShadow on for every opaque pool —
// so far traffic paid a full directional depth pass that could not land in the
// local shadow picture. Policy here is the same visual rule as entity roots:
// only nearby submitted instances cast; far / empty chunks drop out of the
// shadow map and get a real world bound so both cameras can skip them.

import { SHADOW_CAST_RADIUS_SQ } from './shadowCasterPolicy.js';

export function nearestSubmittedInstanceDistanceSq(chunk, playerX = 0, playerZ = 0) {
  if (!chunk || !chunk.visibleIndices || chunk.visibleIndices.size === 0) return Infinity;
  const array = chunk.mesh && chunk.mesh.instanceMatrix && chunk.mesh.instanceMatrix.array;
  if (!array) return Infinity;
  const originX = Number(playerX) || 0;
  const originZ = Number(playerZ) || 0;
  let nearest = Infinity;
  for (const index of chunk.visibleIndices) {
    const offset = (index * 16) + 12;
    const dx = (array[offset] || 0) - originX;
    const dz = (array[offset + 2] || 0) - originZ;
    const dist = (dx * dx) + (dz * dz);
    if (dist < nearest) nearest = dist;
  }
  return nearest;
}

export function isOpaqueInstancePoolMaterial(material) {
  if (!material) return false;
  if (material.transparent === true) return false;
  if (material.depthWrite === false) return false;
  if (Number.isFinite(material.opacity) && material.opacity < 1) return false;
  return true;
}

export function shouldInstanceChunkCastShadow(options = {}) {
  if (options.opaque !== true) return false;
  const submitted = Math.max(0, Math.floor(Number(options.submittedCount) || 0));
  if (submitted <= 0) return false;
  const dist = Number(options.nearestDistanceSq);
  if (!Number.isFinite(dist)) return false;
  const radiusSq = Number(options.castRadiusSq);
  const limit = Number.isFinite(radiusSq) && radiusSq > 0 ? radiusSq : SHADOW_CAST_RADIUS_SQ;
  return dist <= limit;
}

/**
 * Apply submit-side shadow + frustum policy to one authored instance chunk.
 * Returns true when mesh flags or bounds changed.
 */
export function applyInstanceChunkSubmitPolicy(chunk, options = {}) {
  if (!chunk || !chunk.mesh) return false;
  const mesh = chunk.mesh;
  const submitted = chunk.visibleIndices ? chunk.visibleIndices.size : 0;
  const nextCount = Number.isFinite(Number(options.count))
    ? Math.max(0, Number(options.count))
    : Math.max(0, mesh.count || 0);
  let changed = false;

  const nextVisible = nextCount > 0;
  if (mesh.visible !== nextVisible) {
    mesh.visible = nextVisible;
    changed = true;
  }

  const material = (chunk.pool && chunk.pool.material) || mesh.material;
  const nextCast = shouldInstanceChunkCastShadow({
    opaque: isOpaqueInstancePoolMaterial(material),
    submittedCount: submitted,
    nearestDistanceSq: nearestSubmittedInstanceDistanceSq(
      chunk,
      options.playerX,
      options.playerZ,
    ),
    castRadiusSq: options.castRadiusSq,
  });
  if (mesh.castShadow !== nextCast) {
    mesh.castShadow = nextCast;
    changed = true;
  }

  if (nextCount > 0 && options.refreshBounds === true && typeof mesh.computeBoundingSphere === 'function') {
    mesh.computeBoundingSphere();
    if (mesh.frustumCulled !== true) {
      mesh.frustumCulled = true;
      changed = true;
    }
  } else if (nextCount <= 0 && mesh.frustumCulled !== false) {
    mesh.frustumCulled = false;
    changed = true;
  }

  return changed;
}
