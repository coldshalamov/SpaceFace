/**
 * Live shield shell radius. `createShieldBubble` scales the unit shell by
 * `entity.radius`. `shouldPresentShieldBubble` presents that shell only while
 * the current shield is above zero (or a collapse is in progress). `shieldMax`
 * is the pool, not a raised shell. Def shield HP is not this geometry.
 */
export function liveShieldGeometryRadius(entity) {
  if (!entity) return null;
  const now = Number(entity.shield);
  if (!(Number.isFinite(now) && now > 0)) return null;
  const radius = Number(entity.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}
