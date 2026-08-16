// Jammer radar presentation policy.
//
// This module is deliberately read-only: it derives a bounded display position from live entity
// truth without mutating contacts, target locks, weapon solutions, AI sensor frames, or saves.
// Stable ids and the simulation tick are the only animation inputs, so the same frame always
// produces the same smear and reduced-motion can hold a completely still (but still legible) offset.

export const JAMMER_ENEMY_ID = 'jammer_specialist';
export const JAMMER_ZONE_RADIUS_WU = 1450;
export const JAMMER_TRUTH_RADIUS_WU = 280;
export const JAMMER_MAX_SMEAR_WU = 240;

const JAMMER_FADE_START_WU = 920;
const CLOSE_TRUTH_FADE_END_WU = 620;
const SMEAR_PHASE_TICKS = 18;
const MIN_ENVIRONMENT_RADIUS_WU = 120;
const MAX_ENVIRONMENT_RADIUS_WU = 2400;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  if (!(edge1 > edge0)) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function stableHash(value) {
  const text = String(value == null ? '' : value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function enemyTypeOf(entity) {
  const data = entity && entity.data;
  return String(data && (data.lootTableId || data.enemyTypeId || data.typeId) || '');
}

export function isLiveRadarJammer(entity) {
  return !!radarJammingProfile(entity);
}

/**
 * Read the bounded presentation profile for an enemy Jammer or an environmental source.
 * Environmental values are authored by the anomaly adapter, but this owner alone decides how
 * radar contacts are distorted. The stable source id deliberately excludes numeric spawn ids.
 */
export function radarJammingProfile(entity) {
  if (!(entity
    && entity.alive !== false
    && entity.pos
    && Number.isFinite(entity.pos.x)
    && Number.isFinite(entity.pos.z))) return null;
  if (enemyTypeOf(entity) === JAMMER_ENEMY_ID) {
    return {
      sourceId: entity.id,
      radiusWU: JAMMER_ZONE_RADIUS_WU,
      maxSmearWU: JAMMER_MAX_SMEAR_WU,
      truthRadiusWU: JAMMER_TRUTH_RADIUS_WU,
      fadeStartWU: JAMMER_FADE_START_WU,
    };
  }
  const authored = entity.data && entity.data.radarJamming;
  if (!authored || authored.environmental !== true || !authored.sourceId) return null;
  const radiusWU = Math.max(MIN_ENVIRONMENT_RADIUS_WU, Math.min(
    MAX_ENVIRONMENT_RADIUS_WU,
    Number(authored.radiusWU) || 0,
  ));
  const maxSmearWU = Math.max(0, Math.min(JAMMER_MAX_SMEAR_WU, Number(authored.maxSmearWU) || 0));
  const truthRadiusWU = Math.max(0, Math.min(radiusWU * 0.8, Number(authored.truthRadiusWU) || 0));
  if (!(maxSmearWU > 0) || !(truthRadiusWU > 0)) return null;
  return {
    sourceId: String(authored.sourceId),
    radiusWU,
    maxSmearWU,
    truthRadiusWU,
    fadeStartWU: radiusWU * (JAMMER_FADE_START_WU / JAMMER_ZONE_RADIUS_WU),
  };
}

export function collectActiveRadarJammers(contacts, out = []) {
  out.length = 0;
  if (!contacts) return out;
  for (let i = 0; i < contacts.length; i++) {
    const entity = contacts[i];
    if (isLiveRadarJammer(entity)) out.push(entity);
  }
  // Stable ordering makes equal-strength overlap independent of entity insertion order.
  out.sort((a, b) => {
    const left = String(a.id);
    const right = String(b.id);
    return left < right ? -1 : (left > right ? 1 : 0);
  });
  return out;
}

function canSmearContact(contact) {
  return contact && (contact.type === 'ship' || contact.type === 'drone' || contact.type === 'wreck');
}

function writeExact(out, contact) {
  out.x = contact && contact.pos && Number.isFinite(contact.pos.x) ? contact.pos.x : 0;
  out.z = contact && contact.pos && Number.isFinite(contact.pos.z) ? contact.pos.z : 0;
  out.jammed = false;
  out.strength = 0;
  out.offsetX = 0;
  out.offsetZ = 0;
  out.jammerId = null;
  return out;
}

/**
 * Write the radar-only world position for one contact into `out`.
 *
 * Contacts within the jammer's authored field smear most strongly near its antenna hull. Closing
 * to the contact collapses the error continuously and becomes exactly truthful at 280 wu. A dead
 * or absent jammer produces the exact contact position on the very next draw.
 */
export function writeRadarJammedContactPosition(
  out,
  contact,
  player,
  jammers,
  tick = 0,
  motionReduce = false,
) {
  const target = out || {};
  writeExact(target, contact);
  if (!canSmearContact(contact) || !player || !player.pos || !Array.isArray(jammers) || jammers.length === 0) {
    return target;
  }

  const playerDx = contact.pos.x - player.pos.x;
  const playerDz = contact.pos.z - player.pos.z;
  const playerDistance = Math.hypot(playerDx, playerDz);

  let source = null;
  let sourceProfile = null;
  let sourceStrength = 0;
  for (let i = 0; i < jammers.length; i++) {
    const jammer = jammers[i];
    const profile = radarJammingProfile(jammer);
    if (!profile || playerDistance <= profile.truthRadiusWU) continue;
    const dx = contact.pos.x - jammer.pos.x;
    const dz = contact.pos.z - jammer.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= profile.radiusWU) continue;
    const zoneStrength = 1 - smoothstep(profile.fadeStartWU, profile.radiusWU, distance);
    const closeTruthFadeEnd = Math.max(profile.truthRadiusWU + 1,
      profile.truthRadiusWU * (CLOSE_TRUTH_FADE_END_WU / JAMMER_TRUTH_RADIUS_WU));
    const closeTruth = smoothstep(profile.truthRadiusWU, closeTruthFadeEnd, playerDistance);
    const strength = zoneStrength * closeTruth;
    if (strength > sourceStrength) {
      sourceStrength = strength;
      source = jammer;
      sourceProfile = profile;
    }
  }
  if (!source || !sourceProfile || sourceStrength <= 0) return target;

  const phase = motionReduce ? 0 : Math.floor(Math.max(0, Number(tick) || 0) / SMEAR_PHASE_TICKS);
  let seed = stableHash(sourceProfile.sourceId);
  seed = Math.imul(seed ^ stableHash(contact.id), 16777619) >>> 0;
  seed = Math.imul(seed ^ (phase >>> 0), 16777619) >>> 0;
  const angle = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
  // A nonzero floor makes the authored field visibly noisy while the strength term keeps the
  // transition and close-range counter smooth. The maximum is a hard world-unit bound.
  const amplitude = sourceProfile.maxSmearWU * sourceStrength
    * (0.58 + ((seed >>> 16) & 0xff) / 612);
  target.offsetX = Math.cos(angle) * amplitude;
  target.offsetZ = Math.sin(angle) * amplitude;
  target.x = contact.pos.x + target.offsetX;
  target.z = contact.pos.z + target.offsetZ;
  target.jammed = true;
  target.strength = sourceStrength;
  target.jammerId = sourceProfile.sourceId;
  return target;
}
