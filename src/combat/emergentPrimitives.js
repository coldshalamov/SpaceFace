// Pure physical rules for the emergent combat primitives.
// No Three.js. No scenario branches. Same inputs, same impulses.

import { compileAttackSpec } from './attackSpec.js';
import { EMERGENT_LIMITS } from '../data/emergentPrimitives.js';

const CONDUCTIVE = Object.freeze({
  metal: 1,
  structure: 0.85,
  conductive: 1,
  ore: 0.5,
  composite: 0.42,
  explosive: 0.25,
  rock: 0.08,
  ice: 0.12,
  debris: 0.7,
});

const FRACTURE_MATERIALS = new Set(['rock', 'ice', 'ore']);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pos(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function residualFuel(entity) {
  const dead = entity.alive === false
    || entity.type === 'wreck'
    || (num(entity.hull, 1) <= 0 && entity.type !== 'asteroid');
  if (!dead) return 0;
  const cap = pos(entity.capMax, pos(entity.data && entity.data.derived && entity.data.derived.cap, 0));
  if (cap > 0) return Math.min(1, cap / 180);
  if (entity.type === 'wreck' || entity.type === 'ship' || entity.type === 'drone') return 0.55;
  return 0;
}

function materialOf(entity) {
  const explicit = entity.material || (entity.data && entity.data.material);
  if (typeof explicit === 'string' && explicit) return explicit;
  const type = entity.type;
  if (type === 'asteroid') return 'rock';
  if (type === 'pickup' || type === 'payload' || type === 'cargo_pod') return 'composite';
  if (type === 'mine') return 'explosive';
  if (type === 'station' || type === 'structure') return 'structure';
  if (type === 'wreck') return 'debris';
  return 'metal';
}

/**
 * Physical profile read from the body. Explicit fields always win over type defaults.
 * Type supplies only the material a body of that class is already made of.
 */
export function physicalProfile(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const material = materialOf(entity);
  const explicitFuel = entity.fuelVolatile != null
    ? entity.fuelVolatile
    : (entity.data && entity.data.fuelVolatile != null ? entity.data.fuelVolatile : null);
  const fuelVolatile = explicitFuel == null ? residualFuel(entity) : num(explicitFuel, 0);
  const conductivity = entity.conductivity != null
    ? num(entity.conductivity, 0)
    : (entity.data && entity.data.conductivity != null
      ? num(entity.data.conductivity, 0)
      : num(CONDUCTIVE[material], 0.15));
  const reflectivity = entity.reflectivity != null
    ? num(entity.reflectivity, 0)
    : num(entity.data && entity.data.reflectivity, 0);
  let magazine = 0;
  const weapons = entity.data && entity.data.weapons;
  if (Array.isArray(weapons)) {
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      magazine += Math.max(0, num(w && w._heat, 0));
      magazine += Math.max(0, num(w && w.ammo, 0)) * 4;
    }
  }
  const mass = pos(entity.physicsBody && entity.physicsBody.mass, pos(entity.mass, 1));
  return {
    mass,
    heat: num(entity.heat, num(entity.data && entity.data.heat, 0)),
    fuelVolatile,
    material,
    conductivity,
    reflectivity,
    charge: num(entity.magneticCharge, num(entity.data && entity.data.magneticCharge, 0)),
    thrust: pos(entity.thrust, pos(entity.data && entity.data.derived && entity.data.derived.thrust, 0)),
    turnRate: pos(entity.turnRate, pos(entity.data && entity.data.derived && entity.data.derived.turnRate, 0.8)),
    radius: pos(entity.radius, 1),
    shield: num(entity.shield, 0),
    magazine,
    fractures: FRACTURE_MATERIALS.has(material),
    dead: entity.alive === false || entity.type === 'wreck' || num(entity.hull, 1) <= 0,
    reactor: pos(entity.capMax, 0) > 0 || !!(entity.data && entity.data.reactor) || entity.type === 'ship' || entity.type === 'drone',
  };
}

/** Two-body Hooke impulse. Equal-opposite force, so acceleration scales as 1/mass. */
export function springImpulse(ax, az, bx, bz, rest, k, dt) {
  let dx = bx - ax;
  let dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1e-4) || !(dt > 0) || !(k > 0)) return null;
  const extension = dist - rest;
  const j = k * extension * dt;
  const nx = dx / dist;
  const nz = dz / dist;
  return {
    jax: nx * j,
    jaz: nz * j,
    jbx: -nx * j,
    jbz: -nz * j,
    dist,
    extension,
  };
}

/** Inverse-square magnetic dipole. Same sign repels, opposite sign attracts. */
export function dipoleImpulse(ax, az, bx, bz, q1, q2, k, dt, eps = 36) {
  if (!(q1 * q2) || !(dt > 0) || !(k > 0)) return null;
  let dx = bx - ax;
  let dz = bz - az;
  const dist2 = dx * dx + dz * dz;
  const dist = Math.sqrt(dist2) || 1e-3;
  const force = (k * q1 * q2) / (dist2 + eps);
  const j = force * dt;
  const nx = dx / dist;
  const nz = dz / dist;
  return {
    jax: -nx * j,
    jaz: -nz * j,
    jbx: nx * j,
    jbz: nz * j,
    dist,
    attract: force < 0,
    magnitude: Math.abs(j),
  };
}

/** Directional viscous drag. Parallel and perpendicular coefficients differ. */
export function viscousImpulse(vx, vz, axisX, axisZ, mass, parallel, perp, dt) {
  const m = pos(mass, 1);
  if (!(dt > 0)) return { jx: 0, jz: 0, power: 0 };
  const along = vx * axisX + vz * axisZ;
  const px = along * axisX;
  const pz = along * axisZ;
  const ox = vx - px;
  const oz = vz - pz;
  const jx = -m * (parallel * px + perp * ox) * dt;
  const jz = -m * (parallel * pz + perp * oz) * dt;
  const power = Math.abs((jx * vx + jz * vz) / dt);
  return { jx, jz, power };
}

/** 100% of the slug's linear momentum. No explosive term. */
export function slugMomentum(mass, vx, vz) {
  const m = pos(mass, 0);
  return { jx: m * num(vx), jz: m * num(vz) };
}

/** Perfect reflection. `gain` multiplies speed after the bounce. */
export function reflectVelocity(vx, vz, nx, nz, gain = 1) {
  const nlen = Math.hypot(nx, nz) || 1;
  const nnx = nx / nlen;
  const nnz = nz / nlen;
  const dot = vx * nnx + vz * nnz;
  let rx = vx - 2 * dot * nnx;
  let rz = vz - 2 * dot * nnz;
  const incoming = Math.hypot(vx, vz);
  const outgoing = Math.hypot(rx, rz) || 1;
  const speed = incoming * (gain > 0 ? gain : 1);
  return { x: (rx / outgoing) * speed, z: (rz / outgoing) * speed, nx: nnx, nz: nnz };
}

/** One radial shock impulse. Amplitude is already mass-scaled by the caller. */
export function shockImpulse(sx, sz, tx, tz, amplitude, radius) {
  let dx = tx - sx;
  let dz = tz - sz;
  const dist = Math.hypot(dx, dz) || 1;
  const r = pos(radius, 1);
  const fall = 1 / (1 + (dist / r) * (dist / r));
  const j = amplitude * fall;
  return { jx: (dx / dist) * j, jz: (dz / dist) * j, dist, fall };
}

export function shrapnelDirections(rng, count) {
  const n = Math.max(0, count | 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    out[i] = { x: Math.cos(a), z: Math.sin(a) };
  }
  return out;
}

/**
 * Compile the weapon through the shared AttackSpec compiler.
 * Branching weapons carry a chain/split/bounce budget whose generation cap is <= 4.
 */
export function compileEmergentAttack(weaponOrId) {
  const result = compileAttackSpec({ weapon: weaponOrId, weaponId: weaponOrId });
  if (!result.ok || !result.spec) return result;
  const gen = result.spec.constraints && result.spec.constraints.generationMax;
  if (gen > EMERGENT_LIMITS.generationMax) {
    return { ok: false, spec: null, issues: [{ path: 'constraints.generationMax', message: 'depth cap exceeded' }], stacks: [] };
  }
  return result;
}

export function reducedMass(a, b) {
  const ma = pos(a, 1);
  const mb = pos(b, 1);
  return (ma * mb) / (ma + mb);
}

export function speedOf(vx, vz) {
  return Math.hypot(num(vx), num(vz));
}
