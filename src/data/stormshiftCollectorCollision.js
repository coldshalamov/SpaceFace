// Stormshift's planar solids, authored against tools/blender/forge/ships/stormshift_collector.py.
// The Forge whole-object convex envelope is NOT the collision authority: it closes the mouth.
// The existing physicsBody.collisionProxyManifest seam consumes this bounded compound unchanged.
// Source coordinates are Blender (+X forward,+Y port); glTF/runtime maps port to -Z. Whole ships
// mount at origin with targetLength 1.72, then entity.radius, with no bounds-center translation.
// Cheeks MUST remain in harvest rest pose in every runtime clip until physics-owned articulation
// exists. Raised 0.14m radiator leaves are visual-only planar appendages; their fixed hubs collide.
// Dorsal removable canisters are carried inside the body's plan footprint, not independent solids.
export const STORMSHIFT_SOURCE_LENGTH = 18.091591119766235;
export const STORMSHIFT_SOURCE_SCALE = 1.72 / STORMSHIFT_SOURCE_LENGTH;
export const STORMSHIFT_CHEEK_OUTLINE = Object.freeze([
  [.7, 2.9], [2.4, 2.5], [7.7, 3.8], [8.9, 4.7],
  [8.6, 6.1], [6.3, 6.7], [2, 5.5], [.6, 4.2],
].map(Object.freeze));
const BODY = [[-5.7, 2.5], [-4.4, 3.8], [-.6, 3.9], [2.1, 2.9], [3, 2.1]];
const K = STORMSHIFT_SOURCE_SCALE;
const primitives = [];
const box = (id, x, port, hx, hz) => primitives.push(Object.freeze({
  kind: 'obb', id, x: x * K, z: -port * K, hx: hx * K, hz: hz * K, angleDeg: 0,
}));
// Midpoint stair approximation bounds surface error to 0.71 source units (0.068 body radii).
// It never spans either cheek or the central open mouth. Sixteen body/cheek cross-section changes
// are represented by 28 boxes; four fixed engine/hub solids keep the entire compound <=32.
for (let i = 1; i < BODY.length; i++) {
  const [a, wa] = BODY[i - 1], [b, wb] = BODY[i];
  for (let j = 0; j < 2; j++) {
    const x = a + (b - a) * (j + .5) / 2;
    box(`body-${i}-${j}`, x, 0, (b - a) / 4, wa + (wb - wa) * (j + .5) / 2);
  }
}
const cuts = [.6, .7, 2, 2.4, 3.7, 5, 6.3, 7.7, 8.3, 8.6, 8.9];
for (const sign of [-1, 1]) {
  for (let i = 1; i < cuts.length; i++) {
    const x = (cuts[i - 1] + cuts[i]) / 2;
    const ys = [];
    for (let j = 0; j < STORMSHIFT_CHEEK_OUTLINE.length; j++) {
      const [ax, ay] = STORMSHIFT_CHEEK_OUTLINE[j];
      const [bx, by] = STORMSHIFT_CHEEK_OUTLINE[(j + 1) % STORMSHIFT_CHEEK_OUTLINE.length];
      if (x > Math.min(ax, bx) && x < Math.max(ax, bx)) ys.push(ay + (by - ay) * (x - ax) / (bx - ax));
    }
    const lo = Math.min(...ys), hi = Math.max(...ys);
    box(`cheek-${sign}-${i}`, x, sign * (lo + hi) / 2, (cuts[i] - cuts[i - 1]) / 2, (hi - lo) / 2);
  }
  box(`drive-${sign}`, -5.95, sign * 1.65, 1.25, .96);
  primitives.push(Object.freeze({ kind: 'circle', id: `fan-hub-${sign}`, x: -3.9 * K, z: -sign * 3.55 * K, r: .6 * K }));
}
export const STORMSHIFT_COLLECTOR_COLLISION = Object.freeze({
  schemaVersion: 1,
  id: 'stormshift-collector:fixed-cheeks:v1',
  referenceRadius: 'radius',
  flags: Object.freeze({ collides: true, renderable: false, targetable: false, radarVisible: false }),
  articulationPolicy: 'fixed-cheeks; six raised radiator leaves visual-only',
  sourceSurfaceTolerance: .71,
  primitives: Object.freeze(primitives),
});
