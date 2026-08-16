// AC-12 Ember cook-off: a bounded, damage-free radial impulse routed through SG-02's combat
// physics membrane. This module owns neither motion nor damage; it describes the impulse, records
// transient attribution for collisionConsequences, and publishes one immutable death receipt.
import { recordImpulseProvenance } from './impulseKernel.js';
import { hash32 } from '../core/rng.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { EMBER_COOK_OFF } from '../data/swarmerFamily.js';

const EXCLUDED_BODY_TYPES = new Set(['fx', 'pickup', 'projectile']);
const EMPTY_AFFECTED = Object.freeze([]);

/**
 * Resolve and apply one Ember death cook-off.
 *
 * The authored entity record may be save-derived, so every tuning value is constrained by the
 * canonical Ember budget. The hard target cap is counted on accepted physics commands, not merely
 * candidates, and rejected/non-dynamic bodies cannot crowd a real body out of the pulse.
 */
export function triggerEmberCookOff({ state, bus, helpers, source, killerId = null, lethal = null } = {}) {
  const authored = source && source.data && source.data.deathCookOff;
  if (!state || !source || !authored || !source.pos) return null;

  const radiusWu = clampPositive(authored.radiusWu, EMBER_COOK_OFF.radiusWu);
  const peakImpulse = clampPositive(authored.impulse, EMBER_COOK_OFF.impulse);
  const maxAffected = clampWhole(authored.maxAffected, EMBER_COOK_OFF.maxAffected);
  if (!(radiusWu > 0) || !(peakImpulse > 0) || maxAffected < 1) return null;

  const tick = nonNegativeTick(state.tick);
  const position = Object.freeze({ x: finite(source.pos.x), z: finite(source.pos.z) });
  const actorId = lethalActorId(killerId, lethal);
  const weaponId = lethalWeaponId(lethal);
  const provenance = stableTag(authored.provenance) || EMBER_COOK_OFF.provenance;
  const candidates = collectCandidates(state, source, position, radiusWu);
  const physics = helpers && helpers.combatPhysics;
  const affected = [];

  if (physics && typeof physics.applyImpulse === 'function') {
    for (const candidate of candidates) {
      if (affected.length >= maxAffected) break;
      const direction = radialDirection(source.id, candidate.entity.id, candidate.dx, candidate.dz, candidate.distance);
      const magnitude = peakImpulse * (1 - candidate.distance / radiusWu);
      if (!(magnitude > 0)) continue;
      const impulse = { x: direction.x * magnitude, z: direction.z * magnitude };
      const accepted = physics.applyImpulse({
        entityId: candidate.entity.id,
        impulse,
        point: null,
        reason: provenance,
        tick,
        provenance: { actorId, weaponId, tag: provenance, appliedTick: tick },
      });
      if (accepted !== true) continue;

      recordImpulseProvenance(candidate.entity, {
        actorId,
        weaponId,
        tag: provenance,
        appliedTick: tick,
        magnitude,
      });
      affected.push(Object.freeze({
        entityId: candidate.entity.id,
        distanceWu: candidate.distance,
        impulse: magnitude,
        direction: Object.freeze(direction),
      }));
    }
  }

  const cueId = stableTag(authored.cueId) || 'swarmer_ember_cook_off';
  const receipt = Object.freeze({
    schemaVersion: 1,
    tick,
    sourceId: source.id,
    actorId,
    weaponId,
    provenance,
    cueId,
    position,
    radiusWu,
    peakImpulse,
    maxAffected,
    affected: affected.length ? Object.freeze(affected) : EMPTY_AFFECTED,
  });

  if (bus && typeof bus.emit === 'function') {
    bus.emit('combat:emberCookOff', receipt);
    bus.emit('presentation:vfxCue', {
      id: cueId,
      lane: 'combat',
      particles: 28,
      lights: 1,
      magnitude: 1,
      radius: radiusWu,
      position,
      material: 'explosive',
      sourceId: source.id,
      flashReduced: false,
    });
    // Reuse the shipped kinetic-shunt voice. A dedicated visual/audio craft pass may replace the
    // presentation recipe later without changing this combat receipt or physics behavior.
    bus.emit('audio:cue', { id: 'sfx_vector_mine', position, gain: 0.68, rate: 0.78 });
  }
  return receipt;
}

function collectCandidates(state, source, position, radiusWu) {
  const queried = queryNearbyEntities(state, position, radiusWu, [], state.entityList);
  const radiusSq = radiusWu * radiusWu;
  const candidates = [];
  const seenIds = new Set();
  for (const entity of queried || []) {
    if (!eligibleBody(entity, source)) continue;
    if (seenIds.has(entity.id)) continue;
    seenIds.add(entity.id);
    const dx = finite(entity.pos.x) - position.x;
    const dz = finite(entity.pos.z) - position.z;
    const distanceSq = dx * dx + dz * dz;
    if (!(distanceSq < radiusSq)) continue;
    candidates.push({ entity, dx, dz, distanceSq, distance: Math.sqrt(distanceSq) });
  }
  candidates.sort((a, b) => a.distanceSq - b.distanceSq || compareStableIds(a.entity.id, b.entity.id));
  return candidates;
}

function eligibleBody(entity, source) {
  return !!(entity && entity !== source && entity.id !== source.id && entity.alive !== false && entity.pos
    && !EXCLUDED_BODY_TYPES.has(entity.type) && isDynamicPhysicsBodyEntity(entity));
}

function radialDirection(sourceId, targetId, dx, dz, distance) {
  if (distance > 1e-9) return { x: dx / distance, z: dz / distance };
  const angle = (hash32(sourceId, targetId, 'ember-cook-off-overlap') / 0x100000000) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function lethalActorId(killerId, lethal) {
  if (killerId != null) return killerId;
  const actorId = lethal && lethal.result && lethal.result.attackerId;
  return actorId == null ? null : actorId;
}

function lethalWeaponId(lethal) {
  const origin = lethal && lethal.origin;
  const source = lethal && lethal.packet && lethal.packet.source;
  const originWeaponId = origin
    ? (origin.weaponId ?? (origin.kind === 'weapon' ? origin.id : null))
    : null;
  const value = originWeaponId ?? (source && source.weaponId);
  return value == null ? null : String(value);
}

function compareStableIds(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function clampPositive(value, ceiling) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(0, number), ceiling) : 0;
}

function clampWhole(value, ceiling) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(0, Math.trunc(number)), ceiling) : 0;
}

function nonNegativeTick(value) {
  return Math.max(0, Math.trunc(finite(value)));
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function stableTag(value) {
  return value == null ? '' : String(value).trim();
}
