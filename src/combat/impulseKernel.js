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

// Ordinary flight bumps (player/NPC vs rock, two ships clipping) must not steal the helm.
// Craft contact takes the helm only with a fresh combat-attributed impulse record on the victim;
// the tags below are the ordinary-flight provenances that never count. Terrain and structure are
// provenance-blind in BOTH directions: a hard slam (deltaV at or above tumbleDeltaV) tumbles the
// ship no matter who or what caused it — the rock does the work (design/VISION.md: "slam them into
// asteroids", "discover an asteroid at several hundred meters per second") — and a scrape below
// that threshold stays helm-neutral even when the victim carries a fresh weapon tag, so a post-shot
// graze never reads as a concussion. Debris contact never takes the helm.
const HELM_NEUTRAL_COLLISION_TAGS = Object.freeze(new Set(['environment', 'direct_contact']));

export const HITSTUN_IMPULSE_EVENT = 'combat:hitstunImpulse';

// PQ-137.04 — one helm-loss duration and entry-spin law for every delivered impulse.
// u = (ΔV / cruise) * clamp(sqrt(attacker/victim), 0.5, 2.2). T is tick-quantized so a light
// hull at k = 0.30 (u = 0.30 when massFactor is 1) is exactly 1.00 s. The heavy gun-scale case
// (k=0.06, mF=2.2, u=0.132) stays exactly 0.
export const HITSTUN_LAW = Object.freeze({
  uFloor: 0.14,
  // T(u=0.30)=1.00 s so a light hull at k>=0.30 loses the helm for a full second even when
  // massFactor is 1 (world-body collision). The Kestrel/Wasp gun reference u~=0.3182 is slightly longer.
  slope: 6.25,
  durationMaxS: 3.5,
  massFactorMin: 0.5,
  massFactorMax: 2.2,
  spinPerExcessU: 12,
  spinMin: 0.4,
  spinMax: 6,
  // Static terrain/structure is not a combatant. Mapping the rock's collider mass (often huge
  // or infinite) into attackerMass clamps every hull to mF=2.2 and stuns an Atlas that B6
  // requires keep its helm at the same speed a Wasp loses it. The world strikes as a light
  // combatant; heavies shrug through an unclamped mass factor.
  worldRefMass: 16,
});

// The shove beat (owner direction 2026-09-21). A concussion-class hit already bleeds a light
// hull's speed, but two seconds later it is back on its line and back on the trigger. A
// shove-class hit must knock the victim about one visible screen — 126 WU, FEEL_CONTRACT B3,
// the same frame the inertial shunt tunes in — off the line it was flying, and the helm stays
// lost for the coast that does it: beat = screenWu / deltaV. A harder shove finishes the same
// displacement sooner, so the beat narrows as the shove grows and the base law's own duration
// (capped at durationMaxS) overtakes it in the upper band. The beat only ever EXTENDS a stun
// the base law already delivered — minU keeps it off hulls whose mass-weighted shove is not
// shove-class, so heavies keep the helm exactly where the base law gives it — and it never
// touches damage, spin, or the player.
export const SHOVE_BEAT_LAW = Object.freeze({
  minU: 0.3,
  screenWu: 126,
  maxS: 4.5,
});

// The delivered-impulse weapon family: hits whose payload is momentum (concussion slugs, vector
// mines, bomb blasts, impulse charges). Rope throws, well flings, terrain collisions and tether
// shares have their own tuned helm economies and keep the base law alone.
const SHOVE_CLASS_HITSTUN_SOURCES = Object.freeze(new Set(['gun', 'weapon', 'bomb', 'impulse_charge']));

export function isShoveClassHitstunSource(source) {
  return SHOVE_CLASS_HITSTUN_SOURCES.has(source);
}

export function hitstunMassFactor(attackerMass, victimMass, opts = {}) {
  const min = Number.isFinite(opts.min) ? opts.min : HITSTUN_LAW.massFactorMin;
  const max = Number.isFinite(opts.max) ? opts.max : HITSTUN_LAW.massFactorMax;
  const ratio = Math.max(0.1, positive(attackerMass, 1)) / Math.max(0.1, positive(victimMass, 1));
  return clamp(Math.sqrt(ratio), min, max);
}

export function isWorldHitstunBody(entity) {
  const surface = collisionSurface(entity);
  return surface === 'terrain' || surface === 'structure';
}

export function hitstunAttackerMassForCollision(other) {
  if (isWorldHitstunBody(other)) return HITSTUN_LAW.worldRefMass;
  return positive(other && (other.physicsBody && other.physicsBody.mass || other.mass), 1);
}

export function resolveHitstunLaw(input = {}) {
  const deltaV = nonNegative(input.deltaV);
  const cruise = positive(input.victimCruise, 0);
  const k = cruise > 0 ? deltaV / cruise : 0;
  const worldBody = input.worldBody === true;
  const attackerMass = worldBody ? HITSTUN_LAW.worldRefMass : input.attackerMass;
  const mF = hitstunMassFactor(attackerMass, input.victimMass, worldBody ? { min: 0 } : {});
  const u = k * mF;
  const rawDuration = u <= HITSTUN_LAW.uFloor
    ? 0
    : HITSTUN_LAW.slope * (u - HITSTUN_LAW.uFloor);
  const baseDurationS = rawDuration <= 0
    ? 0
    : Math.min(HITSTUN_LAW.durationMaxS, Math.ceil(rawDuration * 60 - 1e-12) / 60);
  // The shove beat: extend a delivered stun to the coast that carries the victim about one
  // screen off the line it was flying. It never starts a stun — no base stun, no beat — and
  // never shortens one (consumers take max(existing, now + durationS)). `shoveBeatS` reports
  // only a beat that actually set the duration; a base law already past the screen reads 0.
  let durationS = baseDurationS;
  let shoveBeatS = 0;
  if (input.shove === true && baseDurationS > 0 && u >= SHOVE_BEAT_LAW.minU && deltaV > 0) {
    const beatS = Math.min(
      SHOVE_BEAT_LAW.maxS,
      Math.ceil((SHOVE_BEAT_LAW.screenWu / deltaV) * 60 - 1e-12) / 60,
    );
    if (beatS > durationS) {
      durationS = beatS;
      shoveBeatS = beatS;
    }
  }
  const entrySpin = durationS > 0
    ? clamp(HITSTUN_LAW.spinPerExcessU * (u - HITSTUN_LAW.uFloor), HITSTUN_LAW.spinMin, HITSTUN_LAW.spinMax)
    : 0;
  return Object.freeze({ k, mF, u, durationS, entrySpin, shoveBeatS, worldBody });
}

export function signedHitSide(target, impulse, hit, fallbackId) {
  const ix = finite(impulse && (impulse.x != null ? impulse.x : impulse.dirX));
  const iz = finite(impulse && (impulse.z != null ? impulse.z : impulse.dirZ));
  const mag = Math.hypot(ix, iz);
  if (hit && hit.pos && target && target.pos && mag > 1e-9) {
    const rx = finite(hit.pos.x) - finite(target.pos && target.pos.x);
    const rz = finite(hit.pos.z) - finite(target.pos && target.pos.z);
    const cross = rz * ix - rx * iz;
    if (Math.abs(cross) > 1e-6) return Math.sign(cross);
  }
  if (target && mag > 1e-9) {
    const rot = finite(target.rot);
    const fx = Math.cos(rot);
    const fz = Math.sin(rot);
    const headingCross = fz * ix - fx * iz;
    if (Math.abs(headingCross) > 1e-6) return Math.sign(headingCross);
  }
  return numericParity(fallbackId) ? 1 : -1;
}

export function publishHitstunImpulse(bus, payload = {}) {
  if (!bus || typeof bus.emit !== 'function') return false;
  if (payload.victimId == null) return false;
  const dirX = finite(payload.dirX);
  const dirZ = finite(payload.dirZ);
  const length = Math.hypot(dirX, dirZ);
  bus.emit(HITSTUN_IMPULSE_EVENT, Object.freeze({
    schemaVersion: 1,
    source: stableTag(payload.source) || 'unknown',
    victimId: payload.victimId,
    attackerId: payload.attackerId == null ? null : payload.attackerId,
    attackerMass: positive(payload.attackerMass, 1),
    victimMass: positive(payload.victimMass, 1),
    deltaV: nonNegative(payload.deltaV),
    dirX: length > 1e-9 ? dirX / length : 0,
    dirZ: length > 1e-9 ? dirZ / length : 0,
    hitSide: payload.hitSide === -1 ? -1 : 1,
    worldBody: payload.worldBody === true,
    provenance: payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : null,
    tick: nonNegativeInteger(payload.tick),
  }));
  return true;
}

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
  energyDamageScale: 0.011,
  maxDebris: 18,
});

// PQ-137.06 — terrain/structure damage from pre-solve closing speed. The solver bound stays a
// rate limit; this law is the story. Finite 0 is real (a sub-threshold scrape). Missing values
// keep the exchanged-dV energy path below so legacy/manual receipts stay bit-stable.
export const TERRAIN_CRUMPLE_LAW = Object.freeze({
  threshold: 30,
  refMass: 16,
  maxDamage: 400,
  massFloor: 0.27,
});

// PQ-140.01 — "a heavy is moving terrain". A hull this massive IS the wall for anything that meets
// it, so the same pre-solve closing-speed law decides what a light loses when it is thrown into
// one. 150 is the roster's own heavy boundary: `src/data/ships.js` gives every mass-150+ hull a
// `heavyMotion` turn-carry profile and nothing lighter has one.
//
// This is not a second damage rule and it is not hit-point scaling. Before it, craft contact used
// the exchanged-momentum energy proxy, and the solver's per-contact bound
// (`sg02DynamicBodyOwner.MAX_CONTACT_DV`) capped the input at 40 WU/s no matter how hard the throw
// was — the identical erasure PQ-137.06 removed for rock. The bound stays exactly what it was, a
// rate limit on the solver; only the DAMAGE reads the speed the hulls actually met at. The law is
// inverse in the victim's mass, so the heavy on the other side of the same contact still takes
// almost nothing: it is terrain, not a mutual grinder.
export const HEAVY_AS_TERRAIN_MASS = 150;

// §22 B5 — spall energy axis. Shares the feel/audio 8→150 WU/s ramp: below the touch speed a
// contact cannot throw chips at all, at the reference slam the chip count saturates.
export const COLLISION_DEBRIS_SPEED_TOUCH = 8;
export const COLLISION_DEBRIS_SPEED_SLAM = 150;
export const COLLISION_DEBRIS_MIN_SEVERITY = 0.08;

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
  const provenance = normalizeProvenance(input.provenance, input.tick);
  let control = deltaV >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV
    ? 'tumble'
    : deltaV >= COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV ? 'stagger' : 'none';
  if (!collisionAllowsHelmLoss(surface, provenance, deltaV)) control = 'none';
  const staggerRange = COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV - COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV;
  const stagger01 = clamp((deltaV - COLLISION_CONSEQUENCE_LIMITS.staggerDeltaV) / staggerRange, 0, 1);
  const staggerTicks = control === 'none'
    ? 0
    : Math.max(1, Math.round(stagger01 * COLLISION_CONSEQUENCE_LIMITS.maxStaggerTicks));

  // Craft contact has a real baseline; equipment such as the Ram Plate scales that baseline once
  // rather than replacing it or adding a second collision-damage packet.
  const surfaceDamageMultiplier = surface === 'craft'
    ? (input.suppressCraftDamage === true
      ? 0
      : SURFACE_DAMAGE_MULTIPLIER.craft * positive(input.craftDamageMultiplier, 1))
    : (SURFACE_DAMAGE_MULTIPLIER[surface] || 0);
  // Mass-relative ceiling: thin light hulls can crumple under a committed slam; mass-anchored
  // hulls keep the universal medium-class cap (or lower). The player never consumes this path —
  // collisionConsequences skips state.playerId before routing impactDamage.
  const massRelativeCap = COLLISION_CONSEQUENCE_LIMITS.maxDamage * clamp(
    COLLISION_CONSEQUENCE_LIMITS.damageMassRef / mass,
    COLLISION_CONSEQUENCE_LIMITS.maxDamageMassFloor,
    COLLISION_CONSEQUENCE_LIMITS.maxDamageMassBoost,
  );
  const worldSurface = surface === 'terrain' || surface === 'structure';
  // PQ-140.01: a mass-150+ craft is terrain for whatever hits it (see HEAVY_AS_TERRAIN_MASS).
  const heavyAsTerrain = surface === 'craft'
    && positive(other.mass, 0) >= HEAVY_AS_TERRAIN_MASS;
  const useCrumple = (worldSurface || heavyAsTerrain) && Number.isFinite(input.preSolveClosingSpeed);
  let impactDamage;
  let damageCap = massRelativeCap;
  if (useCrumple) {
    const crumple = Math.max(0, input.preSolveClosingSpeed - TERRAIN_CRUMPLE_LAW.threshold);
    const massScale = TERRAIN_CRUMPLE_LAW.refMass / mass;
    const uncapped = 0.5 * crumple * crumple * massScale * surfaceDamageMultiplier;
    damageCap = TERRAIN_CRUMPLE_LAW.maxDamage * clamp(massScale, TERRAIN_CRUMPLE_LAW.massFloor, 1);
    impactDamage = Math.min(uncapped, damageCap);
  } else {
    const overDamageSpeed = Math.max(0, deltaV - COLLISION_CONSEQUENCE_LIMITS.damageDeltaV);
    const energyProxy = 0.5 * mass * overDamageSpeed * overDamageSpeed;
    impactDamage = clamp(
      energyProxy * COLLISION_CONSEQUENCE_LIMITS.energyDamageScale * surfaceDamageMultiplier,
      0,
      massRelativeCap,
    );
  }
  const damage01 = damageCap > 0
    ? impactDamage / damageCap : 0;
  // §22 B5 — spall is moved mass: it reads the impact's energy, not only its damage packet. The
  // receipt's deltaV is solver-capped near mass·40 WU/s, so a damage-only count would paint a
  // 150 WU/s slam with a 40 WU/s nudge's chips — the same erasure the crumple law removed for
  // terrain hull damage. The energy axis shares the feel/audio 8→150 ramp; material surfaces
  // only ('other' has nothing to chip off, and a sub-threshold brush still throws nothing).
  const energy01 = Number.isFinite(input.preSolveClosingSpeed)
    ? clamp(
      (input.preSolveClosingSpeed - COLLISION_DEBRIS_SPEED_TOUCH)
        / (COLLISION_DEBRIS_SPEED_SLAM - COLLISION_DEBRIS_SPEED_TOUCH),
      0, 1)
    : 0;
  const materialSurface = (SURFACE_DAMAGE_MULTIPLIER[surface] || 0) > 0;
  const spall01 = Math.max(damage01, energy01);
  const debrisCount = materialSurface && (impactDamage > 0 || energy01 > COLLISION_DEBRIS_MIN_SEVERITY)
    ? clamp(Math.ceil(3 + spall01 * (COLLISION_CONSEQUENCE_LIMITS.maxDebris - 3)), 0, COLLISION_CONSEQUENCE_LIMITS.maxDebris)
    : 0;

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
    debrisCount,
    pos: freezePoint(input.pos),
    normal: freezeDirection(input.normal),
    // C2 (Gap Report): presentation-only channel — the pre-solve closing speed, never the
    // solver-clamped receipt deltaV. feel.js's hitstop/FOV/trauma curve reads this; damage and
    // control semantics keep `deltaV` exactly as before.
    feelDeltaV: Number.isFinite(input.preSolveClosingSpeed)
      ? Math.max(0, input.preSolveClosingSpeed)
      : null,
    provenance,
  });
}

function isConsequenceTarget(entity) {
  return entity.type === 'ship' || entity.type === 'drone';
}

function collisionAllowsHelmLoss(surface, provenance, deltaV) {
  if (surface === 'craft') {
    const tag = provenance && provenance.tag;
    return !!tag && !HELM_NEUTRAL_COLLISION_TAGS.has(tag);
  }
  if (surface === 'terrain' || surface === 'structure') {
    return nonNegative(deltaV) >= COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV;
  }
  return false;
}

/**
 * The surface classification every collision consequence is written against. Exported so the
 * durable ship-history reader (src/combat/hullScars.js) records the same word the consequence
 * receipt uses — a station scrape must not become a rock scrape in the ledger.
 */
export function collisionSurface(entity) {
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

function numericParity(value) {
  if (Number.isFinite(value)) return Math.abs(Math.trunc(value)) % 2;
  const text = String(value == null ? '' : value);
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return sum % 2;
}
