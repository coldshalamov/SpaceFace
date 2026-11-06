// Normalized geometry from buildFoundryToy: renderer and contact footprints share
// these dimensions. Plates keep their existing foundryPlate datum unchanged.
export const FOUNDRY_FURNITURE_GEOMETRY = Object.freeze({
  gate: Object.freeze({ radiusTop: 0.16, radiusBottom: 0.2, height: 1.5, radialSegments: 6 }),
  furnace: Object.freeze({ width: 1.15, height: 0.72, depth: 0.95 }),
  shutter: Object.freeze({ width: 1.5, height: 0.32, depth: 0.42 }),
  mouth: Object.freeze({ width: 0.22, height: 0.14, depth: 0.05, offsetY: 0.04, offsetZ: 0.5 }),
});

export function foundryFurnitureShape(source = {}) {
  const kind = source.data?.roomKind || source.kind;
  if (kind !== 'gate' && kind !== 'furnace' && kind !== 'shutter') return null;
  const referenceRadius = Number.isFinite(source.radius) && source.radius > 0 ? source.radius : 16;
  return { kind, referenceRadius, scale: Math.max(6, referenceRadius),
    body: FOUNDRY_FURNITURE_GEOMETRY[kind],
    mouth: kind === 'furnace' ? FOUNDRY_FURNITURE_GEOMETRY.mouth : null };
}

const PROXY_CACHE = new WeakMap();

/** Collision-only planar silhouettes. The gate's six corners follow CylinderGeometry's
 * sin/cos ordering; the furnace mouth extends beyond the main box and stays solid.
 * Existing native/query owners retain yaw, planar support depth and body motion. */
export function foundryFurnitureProxy(source = {}) {
  const shape = foundryFurnitureShape(source);
  if (!shape) return null;
  const cached = PROXY_CACHE.get(source);
  if (cached?.kind === shape.kind && cached.radius === shape.referenceRadius) return cached.manifest;
  const { kind, body, mouth } = shape;
  const scale = shape.scale / shape.referenceRadius;
  const box = (id, dimensions, z = 0) => ({ kind: 'obb', id, x: 0, z: z * scale,
    angleDeg: 0, hx: dimensions.width * scale / 2, hz: dimensions.depth * scale / 2 });
  const manifest = { schemaVersion: 1, id: `foundry:furniture-${kind}`, referenceRadius: 'radius',
    flags: { collides: true, renderable: false, targetable: false, radarVisible: false },
    primitives: [] };
  if (kind === 'gate') {
    const radius = Math.max(body.radiusTop, body.radiusBottom) * scale;
    manifest.compactHull = Array.from({ length: body.radialSegments }, (_, i) => {
      const theta = i * Math.PI * 2 / body.radialSegments;
      return { x: Math.sin(theta) * radius, z: Math.cos(theta) * radius };
    });
    // Bounded envelope for conservative layout/LOS readers. Native contacts and
    // projectile sweeps both consume compactHull, preserving the hex's corners.
    manifest.primitives.push({ kind: 'obb', id: 'post-envelope', x: 0, z: 0,
      angleDeg: 0, hx: Math.sqrt(3) * radius / 2, hz: radius });
  } else {
    manifest.primitives.push(box('body', body));
    if (mouth) manifest.primitives.push(box('mouth', mouth, mouth.offsetZ));
  }
  PROXY_CACHE.set(source, { kind, radius: shape.referenceRadius, manifest });
  return manifest;
}
