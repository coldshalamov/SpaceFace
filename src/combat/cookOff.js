// AC-12 Ember cook-off: a bounded, damage-free radial impulse routed through SG-02's combat
// physics membrane. This module owns neither motion nor damage; it describes the impulse, records
// transient attribution for collisionConsequences, and publishes one immutable death receipt.
import { recordImpulseProvenance } from './impulseKernel.js';
import { hash32 } from '../core/rng.js';
import { Masks } from '../core/entity.js';
import { ensurePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { EMBER_COOK_OFF } from '../data/swarmerFamily.js';

const EXCLUDED_BODY_TYPES = new Set(['fx', 'pickup', 'projectile']);
const EMPTY_AFFECTED = Object.freeze([]);
const HEAVY_DEBRIS_MASK = Masks.SHIP | Masks.DRONE | Masks.ASTEROID | Masks.STATION
  | Masks.PROJECTILE | Masks.PAYLOAD | Masks.WRECK;

// Plan 31 mechanics tier. Presentation may dress these immutable phase receipts later, but Combat
// owns the physical event: four secondary pressure pulses walk the hull, the main burst shoves live
// bodies, and six above-threshold chunks enter Rapier as ordinary mass-bearing wreck bodies.
export const HEAVY_COOK_OFF = Object.freeze({
  secondaryAtS: Object.freeze([0.18, 0.68, 1.18, 1.68]),
  mainAtS: 2.1,
  retireAtS: 3,
  radiusWu: 132,
  secondaryImpulse: 54,
  mainImpulse: 360,
  maxAffected: 8,
  debrisCount: 6,
  debrisRadiusThresholdWu: 4,
  maxLiveDebris: 36,
  maxDebrisPerUpdate: 12,
  maxActiveCookOffs: 8,
  provenance: 'heavy_cook_off',
});

/**
 * Transient scheduler for the non-capital Heavy death tier.
 *
 * The scheduler never kills, rewards, or writes motion. Combat calls begin once from its canonical
 * lethal edge; every physical write then crosses spawnEntity or SG-02's combat-physics membrane.
 */
export function createHeavyCookOffRuntime({ state, bus, helpers } = {}) {
  const active = [];
  const started = new WeakSet();
  const liveDebrisIds = [];

  return Object.freeze({ begin, update, reset, inspect });

  function begin(source, killerId = null, lethal = null) {
    if (!isNonCapitalHeavy(source) || started.has(source)) return null;
    started.add(source);
    if (active.length >= HEAVY_COOK_OFF.maxActiveCookOffs) return null;
    const tick = nonNegativeTick(state && state.tick);
    const actorId = lethalActorId(killerId, lethal);
    const weaponId = lethalWeaponId(lethal);
    const record = {
      sourceId: source.id,
      sourceRadius: Math.max(1, finite(source.radius, 1)),
      sourceRot: finite(source.rot),
      position: { x: finite(source.pos && source.pos.x), z: finite(source.pos && source.pos.z) },
      velocity: { x: finite(source.vel && source.vel.x), z: finite(source.vel && source.vel.z) },
      actorId,
      weaponId,
      startedTick: tick,
      currentTick: tick,
      ageS: 0,
      nextSecondary: 0,
      mainResolved: false,
    };
    active.push(record);
    const receipt = freezeHeavyReceipt(record, 'started', null, null);
    bus?.emit?.('combat:heavyCookOffStarted', receipt);
    return receipt;
  }

  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    let debrisBudget = HEAVY_COOK_OFF.maxDebrisPerUpdate;
    for (let index = active.length - 1; index >= 0; index--) {
      const record = active[index];
      record.currentTick = nonNegativeTick(state && state.tick);
      record.ageS += step;
      while (record.nextSecondary < HEAVY_COOK_OFF.secondaryAtS.length
        && record.ageS >= HEAVY_COOK_OFF.secondaryAtS[record.nextSecondary]) {
        const secondaryIndex = record.nextSecondary++;
        const point = secondaryPoint(record, secondaryIndex);
        const affected = applyHeavyPulse(record, point, HEAVY_COOK_OFF.secondaryImpulse, 'secondary');
        bus?.emit?.('combat:heavyCookOffPhase', freezeHeavyReceipt(
          record, 'secondary', secondaryIndex, affected, point,
        ));
      }
      if (!record.mainResolved && record.ageS >= HEAVY_COOK_OFF.mainAtS
        && debrisBudget >= HEAVY_COOK_OFF.debrisCount) {
        record.mainResolved = true;
        const affected = applyHeavyPulse(
          record, record.position, HEAVY_COOK_OFF.mainImpulse, 'main',
        );
        const debris = spawnHeavyDebris(record);
        debrisBudget -= debris.length;
        bus?.emit?.('combat:heavyCookOffPhase', freezeHeavyReceipt(
          record, 'main', null, affected, record.position, debris,
        ));
      }
      if (record.mainResolved && record.ageS >= HEAVY_COOK_OFF.retireAtS) active.splice(index, 1);
    }
  }

  function reset() {
    active.length = 0;
    pruneDebrisIds();
  }

  function inspect() {
    pruneDebrisIds();
    return Object.freeze({ active: active.length, liveDebris: liveDebrisIds.length });
  }

  function applyHeavyPulse(record, point, peakImpulse, phase) {
    const physics = helpers && helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return EMPTY_AFFECTED;
    const candidates = collectCandidates(state, { id: record.sourceId }, point, HEAVY_COOK_OFF.radiusWu);
    const affected = [];
    for (const candidate of candidates) {
      if (affected.length >= HEAVY_COOK_OFF.maxAffected) break;
      const direction = radialDirection(
        record.sourceId, candidate.entity.id, candidate.dx, candidate.dz, candidate.distance,
      );
      const falloff = 1 - candidate.distance / HEAVY_COOK_OFF.radiusWu;
      const magnitude = peakImpulse * Math.max(0, falloff);
      if (!(magnitude > 0)) continue;
      const provenance = {
        actorId: record.actorId,
        weaponId: record.weaponId,
        tag: phase === 'main' ? HEAVY_COOK_OFF.provenance : 'heavy_cook_off_secondary',
        appliedTick: nonNegativeTick(state && state.tick),
      };
      const accepted = physics.applyImpulse({
        entityId: candidate.entity.id,
        impulse: { x: direction.x * magnitude, z: direction.z * magnitude },
        point: null,
        reason: provenance.tag,
        tick: provenance.appliedTick,
        provenance,
      });
      if (accepted !== true) continue;
      recordImpulseProvenance(candidate.entity, { ...provenance, magnitude });
      affected.push(Object.freeze({
        entityId: candidate.entity.id,
        distanceWu: candidate.distance,
        impulse: magnitude,
        direction: Object.freeze(direction),
      }));
    }
    return affected.length ? Object.freeze(affected) : EMPTY_AFFECTED;
  }

  function spawnHeavyDebris(record) {
    const spawnEntity = helpers && helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return EMPTY_AFFECTED;
    pruneDebrisIds();
    const spawned = [];
    for (let index = 0; index < HEAVY_COOK_OFF.debrisCount; index++) {
      while (liveDebrisIds.length >= HEAVY_COOK_OFF.maxLiveDebris) retireOldestDebris();
      const angle = record.sourceRot + index * (Math.PI * 2 / HEAVY_COOK_OFF.debrisCount);
      const variation = hash32(record.sourceId, index, 'heavy-cook-off-debris') / 0x100000000;
      const radius = HEAVY_COOK_OFF.debrisRadiusThresholdWu + 0.75 + (index % 3) * 0.9;
      const mass = 18 + index * 4;
      const speed = 42 + variation * 18;
      const offset = record.sourceRadius * 0.38 + radius + 2;
      const direction = { x: Math.cos(angle), z: Math.sin(angle) };
      const entity = spawnEntity({
        type: 'wreck',
        team: 2,
        ownerId: record.sourceId,
        pos: {
          x: record.position.x + direction.x * offset,
          z: record.position.z + direction.z * offset,
        },
        vel: {
          x: record.velocity.x * 0.35 + direction.x * speed,
          z: record.velocity.z * 0.35 + direction.z * speed,
        },
        rot: angle,
        angVel: (index % 2 ? -1 : 1) * (0.8 + variation * 1.4),
        radius,
        mass,
        hull: 1,
        hullMax: 1,
        ttl: Infinity,
        collides: true,
        collisionMask: HEAVY_DEBRIS_MASK,
        physicsBody: {
          dynamic: true,
          ccd: true,
          radius,
          mass,
          inertiaY: 0.5 * mass * radius * radius,
          material: 'debris',
          shape: 'ball',
          revision: 1,
        },
        data: {
          kind: 'heavy_cook_off_debris',
          parentType: 'heavy_ship',
          sourceId: record.sourceId,
          causalActorId: record.actorId,
          majorDebris: true,
          vacuumImmune: true,
          physicalRadiusThresholdWu: HEAVY_COOK_OFF.debrisRadiusThresholdWu,
          debrisIndex: index,
        },
      });
      if (!entity) continue;
      ensurePhysicsBodySpec(entity);
      helpers.refreshEntityIndex?.(entity);
      recordImpulseProvenance(entity, {
        actorId: record.actorId,
        weaponId: record.weaponId,
        tag: 'heavy_cook_off_debris',
        appliedTick: nonNegativeTick(state && state.tick),
        magnitude: mass * speed,
      });
      liveDebrisIds.push(entity.id);
      spawned.push(Object.freeze({
        entityId: entity.id,
        radiusWu: radius,
        mass,
        direction: Object.freeze(direction),
      }));
    }
    return spawned.length ? Object.freeze(spawned) : EMPTY_AFFECTED;
  }

  function pruneDebrisIds() {
    for (let index = liveDebrisIds.length - 1; index >= 0; index--) {
      const entity = state && state.entities && state.entities.get(liveDebrisIds[index]);
      if (!entity || entity.alive === false || entity.data?.kind !== 'heavy_cook_off_debris') {
        liveDebrisIds.splice(index, 1);
      }
    }
  }

  function retireOldestDebris() {
    const entityId = liveDebrisIds.shift();
    const entity = state && state.entities && state.entities.get(entityId);
    if (entity && entity.data?.kind === 'heavy_cook_off_debris') entity.alive = false;
  }
}

// Plan 31 physics rule: "Explosion impulses are real: point-blank ships get shoved. Small, honest,
// and it makes kill-dives spicy." Ember and Heavy already author their own bigger pulses, so this is
// the ordinary tier - every other death still moves what is standing next to it. Reach and peak both
// scale off the victim's real radius, the same authority the size ladder reads, so the shove and the
// spectacle agree by construction. The caps are deliberately below both authored cook-offs: this
// fires on nearly every kill, where those fire on a chosen few.
export const DEATH_BLAST = Object.freeze({
  /** Blast reach = victim radius x this, clamped. Well inside Ember's 130 and Heavy's 132. */
  reachPerRadius: 3,
  minReachWu: 30,
  maxReachWu: 90,
  /** Peak impulse at the centre, falling linearly to zero at the rim. Below Ember's 340. */
  impulsePerRadius: 7,
  minImpulse: 45,
  maxImpulse: 190,
  /** Bodies moved by one ordinary death. Below Ember's 12 and Heavy's 8 - this one is common. */
  maxAffected: 6,
  provenance: 'death_blast',
  /** Zero, always. Combat remains the sole health writer; collisionConsequences owns any impact. */
  hullDamage: 0,
});

/**
 * Apply one ordinary death blast.
 *
 * Impulse only: this never kills, damages, rewards, or writes motion directly - every physical write
 * crosses SG-02's combat-physics membrane, exactly as the Ember and Heavy tiers do. Returns null
 * when a richer authored cook-off already owns the shove for this corpse, so no body is ever pushed
 * twice for one death.
 */
export function triggerDeathBlastImpulse({ state, bus, helpers, source, killerId = null, lethal = null } = {}) {
  if (!state || !source || !source.pos) return null;
  if (deathShoveOwnedElsewhere(source)) return null;

  const sourceRadius = Math.max(0, finite(source.radius));
  if (!(sourceRadius > 0)) return null;
  const radiusWu = clampRange(
    sourceRadius * DEATH_BLAST.reachPerRadius, DEATH_BLAST.minReachWu, DEATH_BLAST.maxReachWu,
  );
  const peakImpulse = clampRange(
    sourceRadius * DEATH_BLAST.impulsePerRadius, DEATH_BLAST.minImpulse, DEATH_BLAST.maxImpulse,
  );

  const tick = nonNegativeTick(state.tick);
  const position = Object.freeze({ x: finite(source.pos.x), z: finite(source.pos.z) });
  const actorId = lethalActorId(killerId, lethal);
  const weaponId = lethalWeaponId(lethal);
  const physics = helpers && helpers.combatPhysics;
  const affected = [];

  if (physics && typeof physics.applyImpulse === 'function') {
    const candidates = collectCandidates(state, source, position, radiusWu);
    for (const candidate of candidates) {
      if (affected.length >= DEATH_BLAST.maxAffected) break;
      const direction = radialDirection(
        source.id, candidate.entity.id, candidate.dx, candidate.dz, candidate.distance,
      );
      const magnitude = peakImpulse * (1 - candidate.distance / radiusWu);
      if (!(magnitude > 0)) continue;
      const provenance = {
        actorId, weaponId, tag: DEATH_BLAST.provenance, appliedTick: tick,
      };
      const accepted = physics.applyImpulse({
        entityId: candidate.entity.id,
        impulse: { x: direction.x * magnitude, z: direction.z * magnitude },
        point: null,
        reason: DEATH_BLAST.provenance,
        tick,
        provenance,
      });
      if (accepted !== true) continue;
      recordImpulseProvenance(candidate.entity, { ...provenance, magnitude });
      affected.push(Object.freeze({
        entityId: candidate.entity.id,
        distanceWu: candidate.distance,
        impulse: magnitude,
        direction: Object.freeze(direction),
      }));
    }
  }

  const receipt = Object.freeze({
    schemaVersion: 1,
    tick,
    sourceId: source.id,
    sourceRadius,
    actorId,
    weaponId,
    provenance: DEATH_BLAST.provenance,
    position,
    radiusWu,
    peakImpulse,
    maxAffected: DEATH_BLAST.maxAffected,
    affected: affected.length ? Object.freeze(affected) : EMPTY_AFFECTED,
  });

  // No cue is emitted here on purpose. The death this rides already draws its own explosion through
  // the size ladder, and 10's flash/particle budget should not be charged twice for one event.
  if (bus && typeof bus.emit === 'function') bus.emit('combat:deathBlast', receipt);
  return receipt;
}

/**
 * True when a richer authored cook-off already shoves for this death.
 *
 * Checked on the victim's identity rather than on whether the other tier's scheduler accepted the
 * work, so a corpse never gets a second, smaller pulse merely because a concurrency cap was full.
 */
function deathShoveOwnedElsewhere(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  if (data.deathCookOff || (data.derived && data.derived.deathCookOff)) return true;
  return data.killRewardTier === 'heavy' && data.shipClass !== 'capital';
}

function clampRange(value, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return low;
  return Math.min(Math.max(number, low), high);
}

/**
 * Resolve and apply one Ember death cook-off.
 *
 * The authored entity record may be save-derived, so every tuning value is constrained by the
 * canonical Ember budget. The hard target cap is counted on accepted physics commands, not merely
 * candidates, and rejected/non-dynamic bodies cannot crowd a real body out of the pulse.
 */
export function triggerEmberCookOff({ state, bus, helpers, source, killerId = null, lethal = null } = {}) {
  // Named enemies author this directly; fitted Dead-Man hardware reaches the same bounded combat
  // owner through ships-derived data. Both routes share the Ember caps and physics receipt.
  const authored = source && source.data && (
    source.data.deathCookOff
    || (source.data.derived && source.data.derived.deathCookOff)
  );
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

function isNonCapitalHeavy(entity) {
  const data = entity && entity.data;
  return !!(entity && entity.type === 'ship' && data
    && data.killRewardTier === 'heavy' && data.shipClass !== 'capital');
}

function secondaryPoint(record, index) {
  // Walk from stern to bow along the authored facing. Alternating lateral offsets make the
  // multi-point receipt spatially distinct without drawing simulation RNG.
  const count = HEAVY_COOK_OFF.secondaryAtS.length;
  const along = ((index + 0.5) / count - 0.5) * record.sourceRadius * 1.35;
  const across = (index % 2 ? 1 : -1) * record.sourceRadius * 0.22;
  const forwardX = Math.cos(record.sourceRot);
  const forwardZ = Math.sin(record.sourceRot);
  return Object.freeze({
    x: record.position.x + forwardX * along - forwardZ * across,
    z: record.position.z + forwardZ * along + forwardX * across,
  });
}

function freezeHeavyReceipt(record, phase, secondaryIndex, affected, point = record.position, debris = null) {
  return Object.freeze({
    schemaVersion: 1,
    tier: 'heavy',
    sourceId: record.sourceId,
    actorId: record.actorId,
    weaponId: record.weaponId,
    phase,
    secondaryIndex,
    tick: record.currentTick,
    ageS: record.ageS,
    position: Object.freeze({ x: finite(point && point.x), z: finite(point && point.z) }),
    radiusWu: HEAVY_COOK_OFF.radiusWu,
    affected: affected || EMPTY_AFFECTED,
    debris: debris || EMPTY_AFFECTED,
  });
}
