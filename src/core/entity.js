// Canonical Entity factory + type/mask constants (ARCHITECTURE §3.4.1).
// EVERY world object (ship/asteroid/station/projectile/pickup/drone/wreck/fx) shares this shape.
// `hp` is an alias of `hull` (§0.7). Positions live on the XZ plane (y held at 0).
import * as THREE from 'three';

export const EntityTypes = ['ship', 'asteroid', 'station', 'projectile', 'pickup', 'drone', 'wreck', 'fx'];

export const Masks = {
  SHIP: 1, ASTEROID: 2, STATION: 4, PROJECTILE: 8, PICKUP: 16, DRONE: 32, WRECK: 64,
};

// Default collision mask per type (what each type is broad-phased against).
export const DEFAULT_MASK = {
  ship: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE | Masks.PICKUP,
  asteroid: Masks.SHIP | Masks.PROJECTILE | Masks.DRONE,
  station: Masks.SHIP,
  projectile: Masks.SHIP | Masks.ASTEROID | Masks.STATION,
  pickup: Masks.SHIP | Masks.DRONE,
  drone: Masks.ASTEROID | Masks.PROJECTILE,
  wreck: 0,
  fx: 0,
};

function v3(src) {
  const v = new THREE.Vector3();
  if (src) v.set(src.x || 0, 0, src.z || 0);
  return v;
}

/** Build a fully-formed entity from a partial spec. Does NOT assign an id or insert it
 *  into the world — that is done by ctx.helpers.spawnEntity (core). */
export function makeEntity(spec = {}) {
  const e = {
    id: 0, type: 'fx', alive: true, factionId: null,
    pos: v3(spec.pos), vel: v3(spec.vel), prevPos: new THREE.Vector3(),
    rot: spec.rot || 0, prevRot: spec.rot || 0, angVel: 0,
    radius: 1, mass: 1,
    hull: 1, hullMax: 1, armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0, shieldRegenRate: 0, shieldRegenDelay: 3, lastDamageT: -1e9,
    cap: 0, capMax: 0, capRegen: 0,
    thrust: 0, turnRate: 0, maxSpeed: 0, drag: 0,
    ttl: Infinity, collides: true, collisionMask: 0,
    team: 0, ownerId: null,
    mesh: null, view: null,
    flags: { boosting: false, docked: false, invuln: false, noInterp: false },
    data: null,
  };
  for (const k in spec) {
    if (k === 'pos' || k === 'vel' || k === 'rot') continue; // handled above
    if (k === 'flags' && spec.flags) { Object.assign(e.flags, spec.flags); continue; }
    e[k] = spec[k];
  }
  if (e.collisionMask === 0) e.collisionMask = DEFAULT_MASK[e.type] || 0;
  e.prevPos.copy(e.pos);
  e.prevRot = e.rot;
  // hp / maxHp alias hull / hullMax (non-enumerable so save serialization ignores them)
  Object.defineProperty(e, 'hp', {
    get() { return this.hull; }, set(v) { this.hull = v; }, configurable: true, enumerable: false,
  });
  Object.defineProperty(e, 'maxHp', {
    get() { return this.hullMax; }, set(v) { this.hullMax = v; }, configurable: true, enumerable: false,
  });
  return e;
}
