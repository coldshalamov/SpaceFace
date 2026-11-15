// Scene-level authored InstancedMesh chunks sit at the origin and carry world
// matrices on each instance. Three therefore cannot frustum-cull them from the
// source geometry, and they used to keep castShadow on for every opaque pool —
// so far traffic paid a full directional depth pass that could not land in the
// local shadow picture. Policy here is the same visual rule as entity roots:
// only nearby submitted instances cast; far / empty chunks drop out of the
// shadow map and get a real world bound so both cameras can skip them.

import { SHADOW_CAST_RADIUS_SQ } from './shadowCasterPolicy.js';

function writeNearestSubmittedInstanceMetrics(chunk, playerX, playerZ, result) {
  if (!chunk || !chunk.visibleIndices || chunk.visibleIndices.size === 0) {
    result.nearestSq = Infinity; result.nearestAxis = Infinity;
    return result;
  }
  const array = chunk.mesh && chunk.mesh.instanceMatrix && chunk.mesh.instanceMatrix.array;
  if (!array) { result.nearestSq = Infinity; result.nearestAxis = Infinity; return result; }
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
  result.nearestSq = nearestSq; result.nearestAxis = nearestAxis;
  return result;
}


export function nearestSubmittedInstanceMetrics(chunk, playerX = 0, playerZ = 0) {
  return writeNearestSubmittedInstanceMetrics(chunk, playerX, playerZ, {});
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
  const keysMatch = !!(memo
      && memo.serial === serial
      && memo.submitted === submitted
      && memo.opaque === opaque
      && memo.castRadius === (options && options.castRadius)
      && memo.castRadiusSq === (options && options.castRadiusSq));
  if (keysMatch) {
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
  // Slack exhausted with matching memo keys — a displacement-driven recompute walks
  // every submitted instance. A large same-frame jump (gate seam, dock, teleport)
  // exhausts every chunk at once; cap these recomputes per call so the whole sector
  // doesn't re-walk inside one presented frame. Skipped chunks retry next frame —
  // verdict slack absorbs a frame of staleness. A mismatched/first memo is a
  // correctness recompute and always runs.
  const budget = options && options.recomputeBudget;
  if (memo && keysMatch && budget && typeof budget.remaining === 'number') {
    if (budget.remaining <= 0) return memo.nearest;
    budget.remaining -= 1;
  }
  const nextMemo = memo || { nearest: {} };
  const nearest = writeNearestSubmittedInstanceMetrics(chunk, playerX, playerZ, nextMemo.nearest);
  nextMemo.serial = serial;
  nextMemo.submitted = submitted;
  nextMemo.opaque = opaque;
  nextMemo.castRadius = options && options.castRadius;
  nextMemo.castRadiusSq = options && options.castRadiusSq;
  nextMemo.playerX = playerX;
  nextMemo.playerZ = playerZ;
  nextMemo.slack = castVerdictSlack(nearest, options);
  chunk.submitPolicyMemo = nextMemo;
  return nearest;
}

export function isOpaqueInstancePoolMaterial(material) {
  if (!material) return false;
  if (material.transparent === true) return false;
  if (material.depthWrite === false) return false;
  if (Number.isFinite(material.opacity) && material.opacity < 1) return false;
  return true;
}

function castShadowVerdict(opaque, submittedCount, nearestDistanceSq, nearestAxisDistance, castRadiusSq, castRadius) {
  if (opaque !== true) return false;
  const submitted = Math.max(0, Math.floor(Number(submittedCount) || 0));
  if (submitted <= 0) return false;
  const axis = Number(nearestAxisDistance);
  const axisRadius = Number(castRadius);
  if (nearestAxisDistance != null && Number.isFinite(axis)
    && Number.isFinite(axisRadius) && axisRadius > 0) {
    return axis <= axisRadius;
  }
  const dist = Number(nearestDistanceSq);
  if (!Number.isFinite(dist)) return false;
  const radiusSq = Number(castRadiusSq);
  const limit = Number.isFinite(radiusSq) && radiusSq > 0 ? radiusSq : SHADOW_CAST_RADIUS_SQ;
  return dist <= limit;
}

export function shouldInstanceChunkCastShadow(options = {}) {
  return castShadowVerdict(options.opaque, options.submittedCount, options.nearestDistanceSq,
    options.nearestAxisDistance, options.castRadiusSq, options.castRadius);
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
  const nextCast = castShadowVerdict(opaque, submitted, nearest.nearestSq, nearest.nearestAxis,
    options.castRadiusSq, options.castRadius);
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
