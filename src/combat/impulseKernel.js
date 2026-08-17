// PQ-009 / SF-09: pure weapon-impulse and collision-consequence contracts.
//
// This module computes identity and receipts only. It never mutates entity motion, health, combat
// state, or presentation. Runtime consumers must route its outputs through the physics/combat
// owners. Recent impulse attribution is held in WeakMaps so save/replay entity graphs stay clean.

const RECENT_IMPULSES = new WeakMap();
const RECENT_IMPULSE_HISTORY = new WeakMap();
const EMPTY_IMPULSE_HISTORY = Object.freeze([]);
const IMPULSE_PROVENANCE_HISTORY_LIMIT = 16;

export const IMPULSE_PROVENANCE_MAX_AGE_TICKS = 180;

export const COLLISION_CONSEQUENCE_LIMITS = Object.freeze({
  minMomentum: 1,
  staggerDeltaV: 3,
  tumbleDeltaV: 18,
  // Damage begins once closing speed exceeds this; low enough that medium concussion stacks start
  // accruing terrain payoff before a long multi-hit charge, high enough that gentle scrapes stay soft.
  damageDeltaV: 8,
  maxStaggerTicks: 90,
  // Medium-mass universal ceiling. Lighter hulls scale up via damageMassRef / mass (boosted up to
  // maxDamageMassBoost) so a committed terrain slam can finish them; heavier hulls compress toward
  // maxDamage * maxDamageMassFloor. Craft contact still multiplies by SURFACE_DAMAGE_MULTIPLIER.craft.
  maxDamage: 190,
  damageMassRef: 60,
  maxDamageMassBoost: 2.5,
  maxDamageMassFloor: 0.5,
  // True kinetic-energy scale: impactDamage ≈ energyProxy * energyDamageScale * surfaceMult.
  // U11 WF-15: light (mass ~16) at a committed concussion-stack deltaV (~50) is near-lethal on terrain.
  // Medium first slam at ~28 wu/s needs ~0.011 so post-softener remaining hull dies on the wall
  // rather than on the next concussion tick. Impulse stays at the siege-lance budget (420).
  energyDamageScale: 0.007,
  maxDebris: 18,
});

const SURFACE_DAMAGE_MULTIPLIER = Object.freeze({
  terrain: 1.15,
  structure: 1,
  debris: 0.8,
  craft: 0.6,
  other: 0,
});

export function resolveWeaponImpulseForHit(weapon, damage) {
  if (!weapon || typeof weapon !== 'object') return null;
  const authoredDamage = positive(weapon.dmg, 0);
  const actualDamage = nonNegative(damage);
  const fraction = authoredDamage > 0 ? clamp(actualDamage / authoredDamage, 0, 4) : 0;
  const magnitude = nonNegative(weapon.impulsePerHit) * fraction;
  const tumbleTorque = nonNegative(weapon.tumbleTorque) * fraction;
  const provenance = stableTag(weapon.impulseProvenance);
  if (!provenance || (!(magnitude > 0) && !(tumbleTorque > 0))) return null;
  return Object.freeze({ magnitude, tumbleTorque, provenance });
}

export function recordImpulseProvenance(entity, input = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const tag = stableTag(input.tag || input.provenance);
  if (!tag) return null;
  const record = Object.freeze({
    actorId: input.actorId == null ? null : input.actorId,
    weaponId: input.weaponId == null ? null : String(input.weaponId),
    tag,
    appliedTick: nonNegativeInteger(input.appliedTick),
    magnitude: nonNegative(input.magnitude),
  });
  RECENT_IMPULSES.set(entity, record);
  const history = RECENT_IMPULSE_HISTORY.get(entity) || EMPTY_IMPULSE_HISTORY;
  const next = history.slice(Math.max(0, history.length - IMPULSE_PROVENANCE_HISTORY_LIMIT + 1));
  next.push(record);
  RECENT_IMPULSE_HISTORY.set(entity, Object.freeze(next));
  return record;
}

export function readRecentImpulseProvenance(entity, tick, maxAgeTicks = IMPULSE_PROVENANCE_MAX_AGE_TICKS) {
  if (!entity || typeof entity !== 'object') return null;
  const record = RECENT_IMPULSES.get(entity) || null;
  if (!record) return null;
  const now = nonNegativeInteger(tick);
  const maxAge = nonNegativeInteger(maxAgeTicks);
  const age = now - record.appliedTick;
  if (age < 0 || age > maxAge) {
    clearImpulseProvenance(entity);
    return null;
  }
  return record;
}

// Immutable insertion-order view for consumers that must not lose an earlier same-tick impulse when
// another hit becomes the compatibility/latest record. Filtering is destructive just like the
// latest reader's stale path, but it never changes which record the latest reader returns.
export function readRecentImpulseProvenanceHistory(entity, tick, maxAgeTicks = IMPULSE_PROVENANCE_MAX_AGE_TICKS) {
  if (!entity || typeof entity !== 'object') return EMPTY_IMPULSE_HISTORY;
  const history = RECENT_IMPULSE_HISTORY.get(entity) || EMPTY_IMPULSE_HISTORY;
  if (history.length === 0) return history;
  const now = nonNegativeInteger(tick);
  const maxAge = nonNegativeInteger(maxAgeTicks);
  const recent = history.filter((record) => {
    const age = now - record.appliedTick;
    return age >= 0 && age <= maxAge;
  });
  if (recent.length === history.length) return history;
  if (recent.length === 0) {
    RECENT_IMPULSE_HISTORY.delete(entity);
    return EMPTY_IMPULSE_HISTORY;
  }
  const frozen = Object.freeze(recent);
  RECENT_IMPULSE_HISTORY.set(entity, frozen);
  return frozen;
}

export function clearImpulseProvenance(entity) {
  if (entity && typeof entity === 'object') {
    RECENT_IMPULSES.delete(entity);
    RECENT_IMPULSE_HISTORY.delete(entity);
  }
}

export function resolveCollisionConsequence(input = {}) {
  const target = input.target;
  const other = input.other;
  if (!target || !other || !isConsequenceTarget(target)) return null;
  const exchangedMomentum = nonNegative(input.exchangedMomentum);
  if (exchangedMomentum < COLLISION_CONSEQUENCE_LIMITS.minMomentum) return null;

  const mass = positive(target.mass, 1);
  const deltaV = exchangedMomentum / mass;
  const surface = collisionSurface(other);
  const control = deltaV >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV
    ? 'tumble'
    : deltaV >= COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV ? 'stagger' : 'none';
  const staggerRange = COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV - COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV;
  const stagger01 = clamp((deltaV - COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV) / staggerRange, 0, 1);
  const staggerTicks = control === 'none'
    ? 0
    : Math.max(1, Math.round(stagger01 * COLLISION_CONSEQUENCE_LIMITS.maxStaggerTicks));

  const overDamageSpeed = Math.max(0, deltaV - COLLISION_CONSEQUENCE_LIMITS.damageDeltaV);
  const energyProxy = 0.5 * mass * overDamageSpeed * overDamageSpeed;
  // Craft contact has a real baseline; equipment such as the Ram Plate scales that baseline once
  // rather than replacing it or adding a second collision-damage packet.
  const surfaceDamageMultiplier = surface === 'craft'
    ? (input.suppressCraftDamage === true
      ? 0
      : SURFACE_DAMAGE_MULTIPLIER.craft * positive(input.craftDamageMultiplier, 1))
    : (SURFACE_DAMAGE_MULTIPLIER[surface] || 0);
  const damageTakenMultiplier = clamp(positive(input.damageTakenMultiplier, 1), 0.1, 1);
  // Mass-relative ceiling: thin light hulls can crumple under a committed slam; mass-anchored
  // hulls keep the universal medium-class cap (or lower). Player contact uses this same packet;
  // fitted protection scales the energy result before the shared cap rather than inventing armor.
  const massRelativeCap = COLLISION_CONSEQUENCE_LIMITS.maxDamage * clamp(
    COLLISION_CONSEQUENCE_LIMITS.damageMassRef / mass,
    COLLISION_CONSEQUENCE_LIMITS.maxDamageMassFloor,
    COLLISION_CONSEQUENCE_LIMITS.maxDamageMassBoost,
  );
  const impactDamage = clamp(
    energyProxy * COLLISION_CONSEQUENCE_LIMITS.energyDamageScale
      * surfaceDamageMultiplier * damageTakenMultiplier,
    0,
    massRelativeCap,
  );
  const damage01 = massRelativeCap > 0
    ? impactDamage / massRelativeCap : 0;
  const debrisCount = impactDamage > 0
    ? clamp(Math.ceil(3 + damage01 * (COLLISION_CONSEQUENCE_LIMITS.maxDebris - 3)), 0, COLLISION_CONSEQUENCE_LIMITS.maxDebris)
    : 0;
  const provenance = normalizeProvenance(input.provenance, input.tick);

  return Object.freeze({
    schemaVersion: 1,
    tick: nonNegativeInteger(input.tick),
    targetId: target.id,
    otherId: other.id,
    surface,
    exchangedMomentum,
    deltaV,
    control,
    staggerTicks,
    impactDamage,
    damageTakenMultiplier,
    debrisCount,
    pos: freezePoint(input.pos),
    normal: freezeDirection(input.normal),
    provenance,
  });
}

function isConsequenceTarget(entity) {
  return entity.type === 'ship' || entity.type === 'drone';
}

function collisionSurface(entity) {
  switch (entity && entity.type) {
    case 'asteroid':
    case 'planet': return 'terrain';
    case 'station': return 'structure';
    case 'wreck':
    case 'payload':
    case 'pickup': return 'debris';
    case 'ship':
    case 'drone': return 'craft';
    default: return 'other';
  }
}

function normalizeProvenance(value, tick) {
  if (!value || typeof value !== 'object') {
    return Object.freeze({ actorId: null, weaponId: null, tag: 'environment', appliedTick: nonNegativeInteger(tick) });
  }
  return Object.freeze({
    actorId: value.actorId == null ? null : value.actorId,
    weaponId: value.weaponId == null ? null : String(value.weaponId),
    tag: stableTag(value.tag || value.provenance) || 'environment',
    appliedTick: nonNegativeInteger(value.appliedTick),
  });
}

function freezePoint(value) {
  return Object.freeze({ x: finite(value && value.x), z: finite(value && value.z) });
}

function freezeDirection(value) {
  const x = finite(value && value.x);
  const z = finite(value && value.z);
  const length = Math.hypot(x, z);
  if (!(length > 1e-9)) return Object.freeze({ x: 0, z: 0 });
  return Object.freeze({ x: x / length, z: z / length });
}

function stableTag(value) {
  const text = String(value || '');
  return /^[a-z0-9_]+$/.test(text) ? text : '';
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value));
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.trunc(finite(value)));
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
