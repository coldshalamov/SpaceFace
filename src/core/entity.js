// Canonical simulation entity factory + type/mask constants (ARCHITECTURE §3.4.1).
//
// This module is deliberately renderer-free. Simulation vectors are small data objects with the
// handful of vector operations gameplay systems need; no Three.js class crosses the sim boundary.
// Renderer attachments are kept in a WeakMap compatibility membrane, outside the authoritative
// entity graph. Legacy render code may still address entity.mesh/entity.view while it migrates to
// its own id -> view registry, but those references are never enumerable, cloneable, or serializable.

export const EntityTypes = ['ship', 'asteroid', 'station', 'projectile', 'pickup', 'drone', 'payload', 'wreck', 'fx'];

export const Masks = {
  SHIP: 1, ASTEROID: 2, STATION: 4, PROJECTILE: 8, PICKUP: 16, DRONE: 32, WRECK: 64, PAYLOAD: 128,
};

// Default collision mask per type (what each type is broad-phased against).
export const DEFAULT_MASK = {
  ship: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE | Masks.PICKUP,
  asteroid: Masks.SHIP | Masks.PROJECTILE | Masks.DRONE,
  station: Masks.SHIP,
  projectile: Masks.SHIP | Masks.ASTEROID | Masks.STATION,
  pickup: Masks.SHIP | Masks.DRONE,
  drone: Masks.ASTEROID | Masks.PROJECTILE,
  payload: Masks.SHIP | Masks.ASTEROID | Masks.STATION,
  wreck: 0,
  fx: 0,
};

/**
 * Renderer-neutral vector used by authoritative simulation state.
 *
 * It intentionally mirrors only the stable, data-oriented subset gameplay uses. `isVector3` is a
 * non-enumerable compatibility marker for existing save code; it does not imply a Three.js object.
 */
export class SimVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = Number.isFinite(x) ? x : 0;
    this.y = Number.isFinite(y) ? y : 0;
    this.z = Number.isFinite(z) ? z : 0;
  }

  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(v) { this.x = v; this.y = v; this.z = v; return this; }
  setX(v) { this.x = v; return this; }
  setY(v) { this.y = v; return this; }
  setZ(v) { this.z = v; return this; }
  copy(v) { this.x = v.x || 0; this.y = v.y || 0; this.z = v.z || 0; return this; }
  clone() { return new SimVector3(this.x, this.y, this.z); }

  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScalar(v) { this.x += v; this.y += v; this.z += v; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  addScaledVector(v, scale) { this.x += v.x * scale; this.y += v.y * scale; this.z += v.z * scale; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(v) { this.x *= v; this.y *= v; this.z *= v; return this; }
  divideScalar(v) { return this.multiplyScalar(v !== 0 ? 1 / v : 0); }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }

  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { return this.divideScalar(this.length() || 1); }
  setLength(length) { return this.normalize().multiplyScalar(length); }
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
  }

  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  lerpVectors(a, b, alpha) {
    this.x = a.x + (b.x - a.x) * alpha;
    this.y = a.y + (b.y - a.y) * alpha;
    this.z = a.z + (b.z - a.z) * alpha;
    return this;
  }

  equals(v) { return this.x === v.x && this.y === v.y && this.z === v.z; }
  fromArray(a, offset = 0) { this.x = a[offset]; this.y = a[offset + 1]; this.z = a[offset + 2]; return this; }
  toArray(a = [], offset = 0) { a[offset] = this.x; a[offset + 1] = this.y; a[offset + 2] = this.z; return a; }
}
Object.defineProperty(SimVector3.prototype, 'isVector3', { value: true, enumerable: false });

const RENDER_ATTACHMENTS = new WeakMap();

function attachmentFor(entity) {
  let attachment = RENDER_ATTACHMENTS.get(entity);
  if (!attachment) {
    attachment = { mesh: null, view: null };
    RENDER_ATTACHMENTS.set(entity, attachment);
  }
  return attachment;
}

const ENTITY_PROTO = Object.create(Object.prototype, {
  mesh: {
    enumerable: false,
    configurable: false,
    get() { const a = RENDER_ATTACHMENTS.get(this); return a ? a.mesh : null; },
    set(value) { attachmentFor(this).mesh = value || null; },
  },
  view: {
    enumerable: false,
    configurable: false,
    get() { const a = RENDER_ATTACHMENTS.get(this); return a ? a.view : null; },
    set(value) { attachmentFor(this).view = value || null; },
  },
});

/** Remove all render-runtime references associated with an entity. */
export function clearEntityRuntime(entity) {
  if (entity && typeof entity === 'object') RENDER_ATTACHMENTS.delete(entity);
}

function v3(src) {
  return new SimVector3(src && src.x || 0, 0, src && src.z || 0);
}

/** Build a fully-formed simulation entity from a partial spec. Does not assign or insert an id. */
export function makeEntity(spec = {}) {
  const e = Object.assign(Object.create(ENTITY_PROTO), {
    id: 0, type: 'fx', alive: true, factionId: null,
    pos: v3(spec.pos), vel: v3(spec.vel), prevPos: new SimVector3(),
    rot: spec.rot || 0, prevRot: spec.rot || 0, angVel: 0,
    bank: 0, prevBank: 0, bankVel: 0,
    radius: 1, mass: 1,
    hull: 1, hullMax: 1, armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0, shieldRegenRate: 0, shieldRegenDelay: 3, lastDamageT: -1e9,
    cap: 0, capMax: 0, capRegen: 0,
    thrust: 0, turnRate: 0, maxSpeed: 0, drag: 0,
    ttl: Infinity, collides: true, collisionMask: 0,
    team: 0, ownerId: null,
    flags: { boosting: false, docked: false, invuln: false, noInterp: false },
    data: null,
  });
  for (const k in spec) {
    if (k === 'pos' || k === 'vel' || k === 'rot') continue;
    if (k === 'flags' && spec.flags) { Object.assign(e.flags, spec.flags); continue; }
    e[k] = spec[k];
  }
  if (e.collisionMask === 0) e.collisionMask = DEFAULT_MASK[e.type] || 0;
  e.prevPos.copy(e.pos);
  e.prevRot = e.rot;
  e.prevBank = e.bank;
  Object.defineProperty(e, 'hp', {
    get() { return this.hull; }, set(v) { this.hull = v; }, configurable: true, enumerable: false,
  });
  Object.defineProperty(e, 'maxHp', {
    get() { return this.hullMax; }, set(v) { this.hullMax = v; }, configurable: true, enumerable: false,
  });
  return e;
}
