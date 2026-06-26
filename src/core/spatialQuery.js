export function hasActiveSpatialHash(hash) {
  return !!(hash && typeof hash.queryRadius === 'function' &&
    hash.diagnostics && hash.diagnostics.activeBuckets > 0);
}

export function queryNearbyEntities(state, pos, radius, out, fallback) {
  out.length = 0;
  if (pos && hasActiveSpatialHash(state && state.spatialHash)) {
    state.spatialHash.queryRadius(pos.x, pos.z, radius, out);
    return out;
  }
  return fallback || (state && state.entityList) || out;
}
