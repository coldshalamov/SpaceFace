// PQ-142.01 — real impact receipts -> one compact, deterministic scar record.
//
// `design/VISION.md` Part II: "The ship accumulates history — scars, repairs, odd fittings, a
// reputation by hull — until it is my fucking ship." A scar is therefore never decorative: it is
// derived from a receipt the simulation already published, and from nothing else.
//
// The two receipts a PLAYER hull actually takes:
//   • `combat:damage` with `isPlayer` — a shot that got past the shield and armour into the hull.
//   • `physics:impact` with `playerInvolved` — a real contact. The player never takes contact
//     hull DAMAGE (src/systems/masslineImpactDamage.js keeps that invariant, and the owner ruling
//     "MY SHIP NEVER KNOCKED AROUND" is why), but the hull is still what hit the rock. The mark is
//     the consequence the collision has always been missing.
//
// Pure module: no state, no bus, no allocation until a receipt is actually admitted.
import { COLLISION_CONSEQUENCE_LIMITS, TERRAIN_CRUMPLE_LAW, collisionSurface } from './impulseKernel.js';
import { LIVING_HULL_SCAR_FACINGS } from '../core/livingHull.js';

/**
 * Contact severity is read off the SAME law the collision consequence uses, never off invented
 * numbers: stagger/tumble/damage thresholds from COLLISION_CONSEQUENCE_LIMITS and the terrain
 * crumple threshold from TERRAIN_CRUMPLE_LAW.
 *
 *   graze     damageDeltaV (8)   .. tumbleDeltaV (18)     the contact that cost something
 *   hard      tumbleDeltaV (18)  .. crumple threshold (30) the contact that took the helm
 *   heavy     crumple (30)       .. 2x crumple (60)        the contact that deforms plate
 *   crushing  >= 2x crumple (60)                           the one you tell people about
 */
export const SCAR_CONTACT_FLOOR_SPEED = COLLISION_CONSEQUENCE_LIMITS.damageDeltaV;
export const SCAR_CONTACT_HARD_SPEED = COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV;
export const SCAR_CONTACT_HEAVY_SPEED = TERRAIN_CRUMPLE_LAW.threshold;
export const SCAR_CONTACT_CRUSHING_SPEED = TERRAIN_CRUMPLE_LAW.threshold * 2;

/** Weapon severity is the share of TOTAL protection (hull + armour max) the shot removed. */
export const SCAR_WEAPON_HARD_SHARE = 0.02;
export const SCAR_WEAPON_HEAVY_SHARE = 0.06;
export const SCAR_WEAPON_CRUSHING_SHARE = 0.15;

/**
 * A firefight is not a hundred scars. One admitted mark per half second per cause, unless the new
 * mark is WORSE than the last one admitted — the crushing slam always lands even inside the window.
 */
export const SCAR_ADMIT_COOLDOWN_TICKS = 30;

const BAND_RANK = Object.freeze({ graze: 0, hard: 1, heavy: 2, crushing: 3 });
const QUARTER_TURN = Math.PI / 4;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function scarBandForClosingSpeed(closingSpeed) {
  const speed = Math.abs(finite(closingSpeed, 0));
  if (speed >= SCAR_CONTACT_CRUSHING_SPEED) return 'crushing';
  if (speed >= SCAR_CONTACT_HEAVY_SPEED) return 'heavy';
  if (speed >= SCAR_CONTACT_HARD_SPEED) return 'hard';
  return 'graze';
}

export function scarBandForProtectionShare(share) {
  const fraction = Math.max(0, finite(share, 0));
  if (fraction >= SCAR_WEAPON_CRUSHING_SHARE) return 'crushing';
  if (fraction >= SCAR_WEAPON_HEAVY_SHARE) return 'heavy';
  if (fraction >= SCAR_WEAPON_HARD_SHARE) return 'hard';
  return 'graze';
}

/**
 * Where the mark sits, in the HULL frame, as one of eight octants.
 *
 * Convention, stated rather than inferred: forward is (cos rot, sin rot) — the same forward
 * `signedHitSide()` in impulseKernel.js uses — and the perpendicular (-sin rot, cos rot) is taken
 * as STARBOARD. Octant 0 is dead ahead and the index advances toward starboard, matching the order
 * of LIVING_HULL_SCAR_FACINGS. A zero-length direction cannot name a side, so it reports the bow.
 */
export function scarFacingFromDirection(rot, dirX, dirZ) {
  const dx = finite(dirX, 0);
  const dz = finite(dirZ, 0);
  if (Math.hypot(dx, dz) < 1e-9) return LIVING_HULL_SCAR_FACINGS[0];
  const heading = finite(rot, 0);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const along = dx * cos + dz * sin;
  const lateral = dx * -sin + dz * cos;
  const octant = ((Math.round(Math.atan2(lateral, along) / QUARTER_TURN) % 8) + 8) % 8;
  return LIVING_HULL_SCAR_FACINGS[octant];
}

/**
 * A `combat:damage` receipt the player hull took. Returns null unless the shot reached HULL —
 * shields and armour exist precisely so that most hits leave nothing behind.
 */
export function scarFromPlayerDamage(payload, playerEntity, tick) {
  if (!payload || payload.isPlayer !== true) return null;
  const hullDamage = Math.max(0, finite(payload.hullDamage, 0));
  if (!(hullDamage > 0)) return null;
  const armorDamage = Math.max(0, finite(payload.armorDamage, 0));
  const before = payload.before && typeof payload.before === 'object' ? payload.before : null;
  const protection = Math.max(1, finite(before && before.hullMax, 0) + finite(before && before.armorMax, 0));
  const at = nonNegativeTick(tick);
  const facing = scarFacingFromDirection(
    playerEntity && playerEntity.rot,
    ...damageDirection(payload, playerEntity),
  );
  return {
    id: `weapon:${at}:${facing}`,
    cause: 'weapon',
    surface: 'weapon',
    band: scarBandForProtectionShare((hullDamage + armorDamage) / protection),
    facing,
    tick: at,
  };
}

/**
 * A `physics:impact` receipt the player hull was part of. Returns null below the closing speed at
 * which a contact costs anything, so ordinary docking and formation nudges leave the hull clean.
 */
export function scarFromPlayerContact(payload, playerEntity, otherEntity, tick) {
  if (!payload || payload.playerInvolved !== true || !playerEntity) return null;
  const closingSpeed = contactClosingSpeed(payload);
  if (!(closingSpeed >= SCAR_CONTACT_FLOOR_SPEED)) return null;
  const at = nonNegativeTick(tick);
  // The solver pushes body `b` along +normal, so the contact sits in +normal from `a` and in
  // -normal from `b`. Reading the wrong end would file a bow slam as a stern slam.
  const towardContact = payload.bId === playerEntity.id ? -1 : 1;
  const normal = payload.normal && typeof payload.normal === 'object' ? payload.normal : null;
  const facing = scarFacingFromDirection(
    playerEntity.rot,
    finite(normal && normal.x, 0) * towardContact,
    finite(normal && normal.z, 0) * towardContact,
  );
  return {
    id: `slam:${at}:${facing}`,
    cause: 'slam',
    surface: collisionSurface(otherEntity),
    band: scarBandForClosingSpeed(closingSpeed),
    facing,
    tick: at,
  };
}

/** The closing speed a contact receipt measured; a missing measurement is a hole, not a zero. */
export function contactClosingSpeed(payload) {
  if (!payload) return 0;
  if (Number.isFinite(payload.preSolveClosingSpeed)) return Math.abs(payload.preSolveClosingSpeed);
  if (Number.isFinite(payload.appliedPlayerDeltaV)) return Math.abs(payload.appliedPlayerDeltaV);
  return Math.abs(finite(payload.playerDeltaV, 0));
}

/**
 * The admission gate. `last` is the previously admitted scar of the SAME cause (or null).
 * Inside the cooldown only a worse band gets through.
 */
export function shouldAdmitScar(last, scar) {
  if (!scar) return false;
  if (!last) return true;
  if (nonNegativeTick(scar.tick) - nonNegativeTick(last.tick) >= SCAR_ADMIT_COOLDOWN_TICKS) return true;
  return (BAND_RANK[scar.band] || 0) > (BAND_RANK[last.band] || 0);
}

export function scarBandRank(band) {
  return BAND_RANK[band] || 0;
}

function damageDirection(payload, playerEntity) {
  const pos = payload.pos && typeof payload.pos === 'object' ? payload.pos : null;
  const origin = playerEntity && playerEntity.pos;
  if (pos && origin) {
    const dx = finite(pos.x, 0) - finite(origin.x, 0);
    const dz = finite(pos.z, 0) - finite(origin.z, 0);
    if (Math.hypot(dx, dz) > 1e-9) return [dx, dz];
  }
  const normal = payload.normal && typeof payload.normal === 'object' ? payload.normal : null;
  if (normal) return [finite(normal.x, 0), finite(normal.z, 0)];
  return [0, 0];
}

function nonNegativeTick(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}
