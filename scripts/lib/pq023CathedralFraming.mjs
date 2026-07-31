export const PQ023_CATHEDRAL_SITE_ID = 'world_site_wreck_cathedral';

export function findLivePq023CathedralRoot(state) {
  const entities = Array.isArray(state?.entityList) ? state.entityList : [];
  return entities.find((entity) => entity?.alive !== false
    && entity.data?.worldSiteId === PQ023_CATHEDRAL_SITE_ID
    && entity.data?.role === 'world_site_root') || null;
}

export function pq023CathedralApproachPose(root) {
  if (!root?.pos || !Number.isFinite(root.pos.x) || !Number.isFinite(root.pos.z)) return null;
  const radius = Number(root.data?.placeRadius || root.radius || 360);
  const offset = radius * 1.7;
  return {
    x: root.pos.x - 0.94 * offset,
    z: root.pos.z - 0.34 * offset,
    zoom: Math.min(1400, Math.max(720, radius * 2.6)),
    radius,
  };
}
