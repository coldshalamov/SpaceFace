// Asteroid collider radii — data-driven fit between the rendered rock and the ball collider.
//
// The render mesh is a noise-displaced icosphere whose outermost bumps exceed entity.radius.
// These per-type factors are the measured outer bounds (~p90 across the five displacement
// variants in visualFactory astDisplacedGeometry): rock 1.16, metallic 1.37, icy 1.35,
// crystalline 1.55, gas 1.49, exotic 1.39. The ball collider takes radius × factor so hulls
// stop on real rock instead of passing into spikes — while keeping the dent-side dead band
// inside ~0.2R rather than doubling it. Gas clouds stay soft: the puff is meant to be entered,
// so it deliberately takes a much smaller factor than its visual bloom.
//
// entity.radius stays the visual/reference radius; only physicsBody.radius takes the scale.

export const ASTEROID_COLLIDER_SCALE = Object.freeze({
  ast_common_rock: 1.16,
  ast_metallic: 1.37,
  ast_icy: 1.35,
  ast_crystalline: 1.55,
  ast_gas_cloud: 1.10,
  ast_rare_exotic: 1.39,
});

/** Ball-collider radius for an asteroid entity. Unknown typeIds inherit the common-rock
 * scale — the same fallback the render layer draws. */
export function asteroidColliderRadius(typeId, radius) {
  const scale = ASTEROID_COLLIDER_SCALE[typeId] || ASTEROID_COLLIDER_SCALE.ast_common_rock;
  const r = Number(radius);
  return Number.isFinite(r) && r > 0 ? r * scale : 1;
}
