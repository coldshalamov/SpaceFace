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
  // LIVE-SOLIDITY NOTE (Rapier SG-02): wreck: 0 stays 0 — DO NOT change. The custom-backend
  // mask path is compatibility-only and NOT live; a wreck is solid because its spawn site
  // stamps physicsBody:{shape:'capsule'} and the live body resolves to material debris,
  // dynamic, non-sensor (see physicsAuthority defaultDynamic/defaultMaterial +
  // MODEL_SUBSTANCE_TABLE in src/data/modelTruth.js). Raising this mask would touch the
  // custom-backend broad-phase and its goldens for zero live effect, so it stays 0 for the
  // lane-owner's judgment even if a focused test proves it golden-safe.
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
  if (!entity || typeof entity !== 'object') return;
  // Delete the WeakMap record first: proto entities read mesh/view through it, so after the
  // delete their getters already return null. Ledger rows (dressing/far/field) are plain
  // objects whose mesh/view are own enumerable fields — the guards below clear those.
  // Stale module scratches and deferred closures retain torn-down rows across save/load;
  // without this, one retained row pins its entire disposed boundary tree.
  RENDER_ATTACHMENTS.delete(entity);
  if (entity.mesh) entity.mesh = null;
  if (entity.view) entity.view = null;
}

// Far actor, dressing and field rows keep their id while they exist; the allocator must never
// hand a ledger-held id to a live entity (see coreSystem._removeEntityAtIndex for the recycle side).
function ledgerTableHoldsId(table, id) {
  return !!(table && table.byId instanceof Map && table.byId.has(id));
}

export function worldLedgerHoldsId(world, id) {
  return !!world && (ledgerTableHoldsId(world.farActors, id)
    || ledgerTableHoldsId(world.dressing, id)
    || ledgerTableHoldsId(world.asteroidField, id));
}

/** Consume one id from the authoritative simulation allocator. */
export function allocateEntityId(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('allocateEntityId requires simulation state');
  }
  const entities = state.entities instanceof Map ? state.entities : null;
  while (Array.isArray(state.freeIds) && state.freeIds.length > 0) {
    const recycled = state.freeIds.pop();
    // A recycled id is only free when it is a usable positive integer that no live entity
    // or world-ledger row still addresses; anything else is consumed and skipped.
    if (!Number.isSafeInteger(recycled) || recycled < 1) continue;
    if (worldLedgerHoldsId(state.world, recycled)) continue;
    if (entities && entities.has(recycled)) continue;
    return recycled;
  }
  if (!Number.isSafeInteger(state.nextEntityId) || state.nextEntityId < 1) {
    throw new TypeError('allocateEntityId requires a positive integer nextEntityId');
  }
  let id = state.nextEntityId;
  while (worldLedgerHoldsId(state.world, id) || (entities && entities.has(id))) {
    id += 1;
    // An occupied MAX_SAFE_INTEGER must fail closed: past 2^53 an increment stops moving and
    // every publish would alias onto an unsafe integer.
    if (!Number.isSafeInteger(id)) {
      throw new RangeError('allocateEntityId exhausted the safe entity id range');
    }
  }
  state.nextEntityId = id + 1;
  return id;
}

/**
 * Bind a fresh occupant token after the id is assigned. allocateEntityId only
 * returns a number, and that number is reused, so the token has to live on the
 * body. Non-enumerable so a for-in save of the corpse does not keep it.
 */
export function stampOccupantGeneration(state, entity) {
  if (!state || typeof state !== 'object' || !entity || typeof entity !== 'object') return null;
  let next = state.nextOccupantGeneration;
  if (!Number.isSafeInteger(next) || next < 1) next = 1;
  if (Object.prototype.hasOwnProperty.call(entity, 'occupantGeneration')) delete entity.occupantGeneration;
  Object.defineProperty(entity, 'occupantGeneration', {
    value: next,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  state.nextOccupantGeneration = next + 1;
  return next;
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
    pitch: 0, prevPitch: 0,
    radius: 1, mass: defaultEntityMass(spec.type),
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
  e.prevPitch = e.pitch;
  Object.defineProperty(e, 'hp', {
    get() { return this.hull; }, set(v) { this.hull = v; }, configurable: true, enumerable: false,
  });
  Object.defineProperty(e, 'maxHp', {
    get() { return this.hullMax; }, set(v) { this.hullMax = v; }, configurable: true, enumerable: false,
  });
  return e;
}

function defaultEntityMass(type) {
  return type === 'pickup' ? 0.1 : 1;
}
