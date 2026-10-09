// Shared broad bound for physics-owned articulated compounds. The historical cache key is
// retained for collector diagnostics; both articulated owners invalidate it on accepted motion.
// Radius about the rigid body origin, not the entity's gameplay radius. Compound offsets,
// long capsules and authored convex hulls must all fit. Unknown shapes deliberately fail open
// to the exact intersection test. Shapes only change with record replacement in this owner;
// cheek local-offset changes invalidate the cache below.
export function articulatedColliderRadius(rec) {
  if (rec.collectorSweepRadius != null) return rec.collectorSweepRadius;
  let bound = 0;
  for (const collider of rec.colliders) {
    const shape = collider.shape;
    let radius = Infinity;
    if (shape.halfExtents) {
      const h = shape.halfExtents;
      radius = Math.hypot(h.x, h.y, h.z);
    } else if (Number.isFinite(shape.radius)) {
      radius = shape.radius + (Number.isFinite(shape.halfHeight) ? shape.halfHeight : 0);
    } else if (shape.vertices?.length >= 3) {
      radius = 0;
      for (let i = 0; i + 2 < shape.vertices.length; i += 3) {
        radius = Math.max(radius, Math.hypot(shape.vertices[i], shape.vertices[i + 1], shape.vertices[i + 2]));
      }
    }
    radius += Number.isFinite(shape.borderRadius) ? shape.borderRadius : 0;
    const offset = collider.translationWrtParent();
    bound = Math.max(bound, Math.hypot(offset.x, offset.y, offset.z) + radius);
  }
  return (rec.collectorSweepRadius = bound + 1e-4);
}
