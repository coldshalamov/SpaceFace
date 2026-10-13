// One planar datum for the Foundry bank's visible slab and native contact faces.
// The former radius26 ball did not cover the authored 96-WU bank segment.
export function foundryPlateShape(source = {}) {
  const stored = source.data?.foundryPlate || source;
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const referenceRadius = positive(stored.referenceRadius, 26);
  const halfWidth = positive(stored.halfWidth, 48);
  const halfDepth = positive(stored.halfDepth, referenceRadius * 0.65);
  const halfHeight = positive(stored.halfHeight, referenceRadius * 0.08);
  const normal = source.normal;
  const rot = normal && Math.hypot(normal.x, normal.z) > 0
    ? Math.atan2(-normal.x, normal.z) : (Number.isFinite(source.rot) ? source.rot : 0);
  return { referenceRadius, halfWidth, halfDepth, halfHeight,
    radius: Math.hypot(halfWidth, halfDepth), rot };
}

export function foundryPlateProxy(shape) {
  return {
    schemaVersion: 1, id: 'foundry:bank-plate', referenceRadius: 'radius',
    flags: { collides: true, renderable: false, targetable: false, radarVisible: false },
    primitives: [{ kind: 'obb', x: 0, z: 0, angleDeg: 0,
      hx: shape.halfWidth / shape.radius, hz: shape.halfDepth / shape.radius }],
  };
}
