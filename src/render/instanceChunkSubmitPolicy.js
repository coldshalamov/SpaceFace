// Scene-level authored InstancedMesh chunks sit at the origin and carry world
// matrices on each instance. Three therefore cannot frustum-cull them from the
// source geometry, and they used to keep castShadow on for every opaque pool —
// so far traffic paid a full directional depth pass that could not land in the
// local shadow picture. Policy here is the same visual rule as entity roots:
// only nearby submitted instances cast; far / empty chunks drop out of the
// shadow map and get a real world bound so both cameras can skip them.

import { SHADOW_CAST_RADIUS_SQ } from './shadowCasterPolicy.js';

export function nearestSubmittedInstanceMetrics(chunk, playerX = 0, playerZ = 0) {
  if (!chunk || !chunk.visibleIndices || chunk.visibleIndices.size === 0) {
    return { nearestSq: Infinity, nearestAxis: Infinity };
  }
  const array = chunk.mesh && chunk.mesh.instanceMatrix && chunk.mesh.instanceMatrix.array;
  if (!array) return { nearestSq: Infinity, nearestAxis: Infinity };
  const originX = Number(playerX) || 0;
  const originZ = Number(playerZ) || 0;
  let nearestSq = Infinity;
  let nearestAxis = Infinity;
  for (const index of chunk.visibleIndices) {
    const offset = (index * 16) + 12;
    const dx = (array[offset] || 0) - originX;
    const dz = (array[offset + 2] || 0) - originZ;
    const distSq = (dx * dx) + (dz * dz);
    if (distSq < nearestSq) nearestSq = distSq;
    const axis = Math.max(Math.abs(dx), Math.abs(dz));
    if (axis < nearestAxis) nearestAxis = axis;
  }
  return { nearestSq, nearestAxis };
}

export function nearestSubmittedInstanceAxisDistance(chunk, playerX = 0, playerZ = 0) {
  return nearestSubmittedInstanceMetrics(chunk, playerX, playerZ).nearestAxis;
}

export function nearestSubmittedInstanceDistanceSq(chunk, playerX = 0, playerZ = 0) {
  return nearestSubmittedInstanceMetrics(chunk, playerX, playerZ).nearestSq;
}

// Signed margin between the nearest submitted instance and the cast threshold, in the
// metric shouldInstanceChunkCastShadow will actually apply: axis distance when a finite
// castRadius is supplied (the verdict path that wins), euclidean otherwise.
function castVerdictSlack(nearest, options) {
  const axisRadius = Number(options && options.castRadius);
  if (Number.isFinite(nearest.nearestAxis) && Number.isFinite(axisRadius) && axisRadius > 0) {
    return axisRadius - nearest.nearestAxis;
  }
  const radiusSq = Number(options && options.castRadiusSq);
  const limitSq = Number.isFinite(radiusSq) && radiusSq > 0 ? radiusSq : SHADOW_CAST_RADIUS_SQ;
  return Math.sqrt(limitSq) - Math.sqrt(nearest.nearestSq);
}

// Between chunk matrix writes the verdict can only flip when the player's world-unit
// displacement since the last evaluation exceeds the recorded slack, so clean chunks
// skip the visibleIndices walk until that margin is spent.
function nearestSubmittedInstanceMetricsMemoized(chunk, options, submitted, opaque) {
  const playerX = Number(options && options.playerX) || 0;
  const playerZ = Number(options && options.playerZ) || 0;
  const serial = chunk.matrixSerial || 0;
  const memo = chunk.submitPolicyMemo;
  if (memo
      && memo.serial === serial
      && memo.submitted === submitted
      && memo.opaque === opaque
      && memo.castRadius === (options && options.castRadius)
      && memo.castRadiusSq === (options && options.castRadiusSq)) {
    const dx = playerX - memo.playerX;
    const dz = playerZ - memo.playerZ;
    const moved = Math.sqrt(dx * dx + dz * dz);
    if (moved === 0 || moved < Math.abs(memo.slack)) {
      memo.slack -= Math.sign(memo.slack) * moved;
      memo.playerX = playerX;
      memo.playerZ = playerZ;
      return memo.nearest;
    }
  }
  const nearest = nearestSubmittedInstanceMetrics(chunk, playerX, playerZ);
  chunk.submitPolicyMemo = {
    serial,
    submitted,
    opaque,
    castRadius: options && options.castRadius,
    castRadiusSq: options && options.castRadiusSq,
    playerX,
    playerZ,
    slack: castVerdictSlack(nearest, options),
    nearest,
  };
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
  const axis = Number(options.nearestAxisDistance);
  const axisRadius = Number(options.castRadius);
  if (options.nearestAxisDistance != null && Number.isFinite(axis)
    && Number.isFinite(axisRadius) && axisRadius > 0) {
    return axis <= axisRadius;
  }
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
  const opaque = isOpaqueInstancePoolMaterial(material);
  const nearest = nearestSubmittedInstanceMetricsMemoized(chunk, options, submitted, opaque);
  const nextCast = shouldInstanceChunkCastShadow({
    opaque,
    submittedCount: submitted,
    nearestDistanceSq: nearest.nearestSq,
    nearestAxisDistance: nearest.nearestAxis,
    castRadiusSq: options.castRadiusSq,
    castRadius: options.castRadius,
  });
  if (mesh.castShadow !== nextCast) {
    mesh.castShadow = nextCast;
    changed = true;
  }

  if (!chunk.dynamicBufferOwner && nextCount > 0 && options.refreshBounds === true && typeof mesh.computeBoundingSphere === 'function') {
    mesh.computeBoundingSphere();
    if (mesh.frustumCulled !== true) {
      mesh.frustumCulled = true;
      changed = true;
    }
  } else if ((chunk.dynamicBufferOwner || nextCount <= 0) && mesh.frustumCulled !== false) {
    mesh.frustumCulled = false;
    changed = true;
  }

  return changed;
}
