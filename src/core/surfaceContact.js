// Authoritative surface-contact receipt (PQ-133.04 / CRU-025).
// Physics owns this shape. Combat may consume a receipt; it must never invent one.
// Pure: no Rapier, bus, DOM, or renderer. Same numbers always yield the same receipt
// and the same reflected velocity.

export const SURFACE_CONTACT_SCHEMA_VERSION = 1;
export const SURFACE_CONTACT_QUANTUM = 1e-6;

export const SURFACE_RESPONSE = Object.freeze({
  reflect: "reflect",
  absorb: "absorb",
  none: "none",
});

// Surface identity for bounce law — not the Rapier friction table. Unknown ids do neither.
const MATERIAL_RESPONSE = Object.freeze({
  reflective: SURFACE_RESPONSE.reflect,
  mirror: SURFACE_RESPONSE.reflect,
  plate: SURFACE_RESPONSE.reflect,
  absorbent: SURFACE_RESPONSE.absorb,
  furnace: SURFACE_RESPONSE.absorb,
  slag: SURFACE_RESPONSE.absorb,
  rock: SURFACE_RESPONSE.absorb,
  ship: SURFACE_RESPONSE.none,
  projectile: SURFACE_RESPONSE.none,
  station: SURFACE_RESPONSE.none,
  debris: SURFACE_RESPONSE.none,
  payload: SURFACE_RESPONSE.none,
  sensor: SURFACE_RESPONSE.none,
  massline_sensor: SURFACE_RESPONSE.none,
  default: SURFACE_RESPONSE.none,
});

const ISSUED = new WeakSet();

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function quantizeSurface(value) {
  const n = finite(value);
  const rounded = Math.round(n / SURFACE_CONTACT_QUANTUM) * SURFACE_CONTACT_QUANTUM;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vec2(value) {
  return {
    x: quantizeSurface(value && value.x),
    z: quantizeSurface(value && (value.z != null ? value.z : value.y)),
  };
}

export function unitSurfaceNormal(normal) {
  const raw = vec2(normal);
  const length = Math.hypot(raw.x, raw.z);
  if (!(length > SURFACE_CONTACT_QUANTUM)) return { x: 0, z: 1 };
  return {
    x: quantizeSurface(raw.x / length),
    z: quantizeSurface(raw.z / length),
  };
}

export function surfaceResponseFor(material) {
  const id = typeof material === "string" && material ? material : "default";
  return MATERIAL_RESPONSE[id] || SURFACE_RESPONSE.none;
}

export function isSurfaceContactReceipt(value) {
  return !!(value && ISSUED.has(value));
}

function surfaceKindOf(entity) {
  if (!entity || typeof entity !== "object") return "default";
  const body = entity.physicsBody;
  return entity.surfaceMaterial
    || entity.surfaceKind
    || (entity.data && (entity.data.surfaceMaterial || entity.data.surfaceKind))
    || (body && (body.surfaceMaterial || body.surfaceKind || body.material))
    || "default";
}

/**
 * Build the only legal surface-contact receipt. Callers must be physics (sweep or solver).
 * A renderer-shaped object with the same fields is not a receipt.
 */
export function createSurfaceContactReceipt(input = {}) {
  const point = vec2(input.point);
  const velocity = vec2(input.velocity);
  const normal = unitSurfaceNormal(input.normal);
  const incoming = velocity.x * normal.x + velocity.z * normal.z;
  const facing = incoming > 0
    ? { x: quantizeSurface(-normal.x), z: quantizeSurface(-normal.z) }
    : normal;
  const material = typeof input.material === "string" && input.material
    ? input.material
    : "default";
  const receipt = Object.freeze({
    schemaVersion: SURFACE_CONTACT_SCHEMA_VERSION,
    source: "physics",
    tick: Number.isInteger(input.tick) && input.tick >= 0 ? input.tick : 0,
    point: Object.freeze(point),
    normal: Object.freeze(facing),
    material,
    response: surfaceResponseFor(material),
    velocity: Object.freeze(velocity),
    projectileId: input.projectileId != null ? input.projectileId : null,
    surfaceId: input.surfaceId != null ? input.surfaceId : null,
  });
  ISSUED.add(receipt);
  return receipt;
}

export function surfaceContactFromBodies(projectile, surface, hit = {}, tick = 0) {
  const vel = hit.velocity || (projectile && projectile.vel);
  return createSurfaceContactReceipt({
    point: hit.point || (projectile && projectile.pos),
    normal: hit.normal,
    material: hit.material || surfaceKindOf(surface),
    velocity: vel,
    tick,
    projectileId: projectile && projectile.id,
    surfaceId: surface && surface.id,
  });
}

/**
 * Elastic planar reflection. Same incident velocity + same normal -> same outgoing.
 * Does not spawn a body; the caller writes this onto the existing projectile.
 */
export function reflectVelocity(velocity, normal) {
  const v = vec2(velocity);
  let n = unitSurfaceNormal(normal);
  const incoming = v.x * n.x + v.z * n.z;
  if (incoming > 0) n = { x: quantizeSurface(-n.x), z: quantizeSurface(-n.z) };
  const dot = v.x * n.x + v.z * n.z;
  return {
    x: quantizeSurface(v.x - 2 * n.x * dot),
    z: quantizeSurface(v.z - 2 * n.z * dot),
  };
}

/** Continue the same body. Never allocates a replacement projectile. */
export function applyReflectedVelocity(body, velocity) {
  if (!body || typeof body !== "object") return null;
  const outgoing = vec2(velocity);
  if (body.vel && typeof body.vel === "object") {
    body.vel.x = outgoing.x;
    body.vel.z = outgoing.z;
  } else {
    body.vel = { x: outgoing.x, z: outgoing.z };
  }
  body.rot = Math.atan2(outgoing.z, outgoing.x);
  return body;
}
