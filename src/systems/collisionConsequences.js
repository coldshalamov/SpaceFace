// PQ-009 / SF-09: contact momentum -> combat and control consequences.
//
// Physics owns contact solving and publishes bounded momentum receipts. This system translates
// those receipts into setup/payoff combat without ever writing velocity, hull, heat, economy, or
// save state directly: control crosses physicsAuthority, damage crosses the combat kernel, and
// transient episode/control state stays outside the entity graph.
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { readTumbleStatus } from '../combat/tumbleStatus.js';
import { bodyLife, evidenceForConsequence } from '../combat/stuntEvidence.js';
import {
  HEAVY_AS_TERRAIN_MASS,
  hitstunAttackerMassForCollision,
  isWorldHitstunBody,
  publishHitstunImpulse,
  readRecentImpulseProvenance,
  resolveCollisionConsequence,
  signedHitSide,
} from '../combat/impulseKernel.js';
import { appendCombatTrace } from '../combat/trace.js';
import { combatFlag, massline2Flag } from '../data/featureFlags.js';
import {
  clearPendingSlam,
  closingSpeedFromImpact,
  isSlamFractureCandidate,
  notePendingSlam,
  resetPendingSlams,
} from './hullFracture.js';

export const COLLISION_CONSEQUENCE_PAIR_COOLDOWN_TICKS = 12;

// MASS FLAIL RIG tuning: the flail needs a real load before it reads as one, then pays out
// linearly in towed tonnes. At +400 t the strike is doubled; past +560 t it caps at 2.4 —
// below the ram plate's own clamp, so the two verbs never collapse into one number.
const TOW_FLAIL_MIN_MASS_T = 100;
const TOW_FLAIL_MASS_PER_POINT = 400;
const TOW_FLAIL_MAX_MULT = 2.4;

const DAMAGEABLE_MOTION = new Set(['ship', 'drone']);
const RESOLVE_PENDING_CRAFT_CONTACT_EVENT = 'collisionConsequences:resolvePendingCraftContact';

export const collisionConsequences = {
  id: 'collisionConsequences',
  name: 'collisionConsequences',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._pairTicks = new Map();
    this._pendingCraftContacts = new Map();
    this._applicationEnabled = combatFlag('weaponImpulseConsequences');
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('physics:impact', (payload) => this._onImpact(payload || {})));
      this._unsubs.push(this.bus.on('tether:whipImpact', (payload) => this._onWhipImpact(payload || {})));
      this._unsubs.push(this.bus.on(RESOLVE_PENDING_CRAFT_CONTACT_EVENT,
        (payload) => this._resolvePendingCraftContact(payload || {})));
      this._unsubs.push(this.bus.on('save:loaded', () => this._resetTransientState()));
      this._unsubs.push(this.bus.on('game:started', () => this._resetTransientState()));
      this._unsubs.push(this.bus.on('game:newGame', () => this._resetTransientState()));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetTransientState();
  },

  update(_dt, state) {
    const enabled = combatFlag('weaponImpulseConsequences');
    if (!enabled) {
      if (this._applicationEnabled) this._resetTransientState();
      this._applicationEnabled = false;
      return;
    }
    this._applicationEnabled = true;
    if (!state || state.mode !== 'flight') return;
    this._resolveStrandedCraftContactsBefore(nonNegativeTick(state.tick));
  },

  _onImpact(payload) {
    if (!combatFlag('weaponImpulseConsequences')) return;
    const state = this.state;
    if (!state || state.mode !== 'flight' || payload.consequenceKernelVersion !== 1) return;
    const a = entityById(state, payload.aId);
    const b = entityById(state, payload.bId);
    if (!a || !b || a === b || a.alive === false || b.alive === false) return;
    const tick = nonNegativeTick(Number.isFinite(payload.tick) ? payload.tick : state.tick);
    if (!this._admitPair(a.id, b.id, tick)) return;
    const exchangedMomentum = Math.max(0, finite(payload.impulse, payload.dp));
    if (!(exchangedMomentum > 0)) return;

    // A player-propelled hull carries the cause of the whole contact. Share the freshest causal
    // impulse across both consequence directions so the struck hull does not become an
    // environment-attributed kill merely because the impulse was recorded on the incoming hull.
    const causalProvenance = contactImpulseProvenance(a, b, tick)
      || explicitContactProvenance(payload, tick);
    if (isPotentialMasslineWhipContact(state, a, b)) {
      this._deferCraftContact(a, b, payload, exchangedMomentum, tick, causalProvenance);
      return;
    }

    this._resolveContact(a, b, payload, exchangedMomentum, tick, causalProvenance, false);
  },

  _deferCraftContact(a, b, payload, exchangedMomentum, tick, causalProvenance) {
    const key = craftContactKey(tick, a.id, b.id);
    this._pendingCraftContacts.set(key, {
      key,
      a,
      b,
      payload: snapshotContactPayload(payload, tick),
      exchangedMomentum,
      tick,
      causalProvenance,
    });
    if (this.bus && typeof this.bus.queue === 'function') {
      this.bus.queue(RESOLVE_PENDING_CRAFT_CONTACT_EVENT, { key });
    }
  },

  _onWhipImpact(payload) {
    if (!isDamageBearingWhipReceipt(this.state, payload)) return;
    const key = craftContactKey(payload.tick, payload.targetId, payload.victimId);
    const pending = this._pendingCraftContacts.get(key);
    if (!pending) return;
    this._pendingCraftContacts.delete(key);
    // The authoritative observer has now claimed this exact tick + mass + victim contact. Resolve
    // its control/presentation receipt immediately, before the downstream victim/recoil consumers,
    // while leaving baseline craft damage at zero so there are exactly two authored damage packets.
    //
    // PQ-140.01 — EXCEPT when one of the two bodies is a heavy. A mass-150+ hull is terrain
    // (`HEAVY_AS_TERRAIN_MASS`), and terrain contact is never a suppression case: a hull that meets
    // rock at speed dies whether or not a rope put it there, and a whip-thrown light meeting an
    // Atlas must mean the same thing. Suppressing here is what made the packet's own headline verb
    // — "the player can throw lights into it" — the one route where a heavy stayed soft: the whip's
    // recoil packet on the thrown hull is `momentum x 0.65 / 250`, about 2.5 points on a 260-point
    // Wasp. The two authored whip packets are untouched; the heavy's own side of this contact still
    // computes zero because its Δv sits under the damage threshold, so the only thing this admits is
    // the thrown light's crumple.
    const heavyInvolved = positiveMass(pending.a) >= HEAVY_AS_TERRAIN_MASS
      || positiveMass(pending.b) >= HEAVY_AS_TERRAIN_MASS;
    this._resolveDeferredCraftContact(pending, !heavyInvolved);
  },

  _resolvePendingCraftContact(payload) {
    const key = typeof payload.key === 'string' ? payload.key : '';
    const pending = this._pendingCraftContacts.get(key);
    if (!pending) return;
    this._pendingCraftContacts.delete(key);
    this._resolveDeferredCraftContact(pending, false);
  },

  _resolveStrandedCraftContactsBefore(tick) {
    for (const [key, pending] of this._pendingCraftContacts) {
      if (pending.tick >= tick) continue;
      this._pendingCraftContacts.delete(key);
      this._resolveDeferredCraftContact(pending, false);
    }
  },

  _resolveDeferredCraftContact(pending, suppressCraftDamage) {
    this._resolveContact(
      pending.a,
      pending.b,
      pending.payload,
      pending.exchangedMomentum,
      pending.tick,
      pending.causalProvenance,
      suppressCraftDamage,
    );
  },

  _resolveContact(a, b, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage) {
    this._resolveTarget(a, b, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage);
    this._resolveTarget(b, a, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage);
  },

  _resolveTarget(target, other, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage) {
    const state = this.state;
    if (!DAMAGEABLE_MOTION.has(target.type) || target.id === state.playerId) return;
    const player = entityById(state, state.playerId);
    const targetHostile = isHostileForAI(state, target, player);
    const life = bodyLife(target, state);
    const targetHullMax = life?.hull ?? Math.max(0, Number(target.hullMax) || 0);
    const targetHullBefore = Math.max(0, Number(target.hull) || 0);
    // A ram/flail identity check must read the CONTACT's own causal attribution: while towing
    // (or after any recorded impulse) the rope's freshest provenance would otherwise shadow the
    // direct-contact fact and silently disarm the strike verb.
    const explicitContact = explicitContactProvenance(payload, tick);
    const ramProvenance = explicitContact
      && explicitContact.actorId === state.playerId ? explicitContact : causalProvenance;
    const ramPlate = playerRamPlateImpact(other, state.playerId, tick, ramProvenance, state);
    const observed=evidenceForConsequence({tick,targetId:target.id,otherId:other.id,
      surface:['asteroid','planet'].includes(other.type)?'terrain':other.type==='station'?'structure':'craft',otherMass:positiveMass(other)},state);
    const provenance = ramPlate?.provenance || (observed?{actorId:observed.root.actorId,weaponId:observed.root.weaponId,
      tag:observed.root.kind==='constraint'?'massline':'weapon_hit',tick:observed.root.tick,rootId:observed.root.id}:causalProvenance);
    const receipt = resolveCollisionConsequence({
      target,
      other,
      exchangedMomentum,
      tick,
      provenance,
      craftDamageMultiplier: ramPlate?.damageMultiplier,
      suppressCraftDamage,
      pos: payload.pos,
      normal: payload.normal,
      preSolveClosingSpeed: payload.preSolveClosingSpeed,
    });
    if (!receipt) return;

    publishHitstunImpulse(this.bus, {
      source: 'collision',
      victimId: target.id,
      attackerId: other.id,
      attackerMass: hitstunAttackerMassForCollision(other),
      victimMass: positiveMass(target),
      deltaV: receipt.deltaV,
      dirX: finite(receipt.normal && receipt.normal.x),
      dirZ: finite(receipt.normal && receipt.normal.z),
      hitSide: signedHitSide(target, receipt.normal, { pos: receipt.pos }, target.id),
      worldBody: isWorldHitstunBody(other),
      provenance: receipt.provenance,
      tick,
    });
    const helmLossSeconds = helmLossFromTumbleStatus(readTumbleStatus(state, target), tick);
    const closingSpeed = closingSpeedFromImpact(payload);
    if (isSlamFractureCandidate(target, closingSpeed)) {
      notePendingSlam(target, { closingSpeed, tick });
    }
    const damageResult = receipt.impactDamage > 0 ? this._routeImpactDamage(target, other, receipt) : null;
    if (target.alive !== false) clearPendingSlam(target.id);

    appendCombatTrace(state.combat, tick, 'collision.consequence', {
      actorId: receipt.provenance.actorId,
      targetId: target.id,
      otherId: other.id,
      surface: receipt.surface,
      exchangedMomentum: receipt.exchangedMomentum,
      deltaV: receipt.deltaV,
      control: receipt.control,
      staggerTicks: receipt.staggerTicks,
      impactDamage: receipt.impactDamage,
      damageApplied: damageResult && damageResult.ok === true,
      debrisCount: receipt.debrisCount,
      weaponId: receipt.provenance.weaponId,
      provenance: receipt.provenance.tag,
    });
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('combat:collisionConsequence', Object.freeze({
        ...receipt,
        stuntEvidence: evidenceForConsequence(receipt, state),
        targetName: life?.name,
        victimLife: { lifeId: target.data?.stuntThreat?.lifeId ?? life?.id,
          threatClass: target.data?.stuntThreat?.threatClass ?? 'none', dead: target.alive === false },
        targetHostile,
        targetType: target.type,
        otherType: other.type,
        targetMass: positiveMass(target),
        otherMass: positiveMass(other),
        damageApplied: damageResult && damageResult.ok === true,
        hullDamage: Math.max(0, targetHullBefore - Math.max(0, Number(target.hull) || 0)),
        targetHullMax,
        targetKilled: (damageResult && damageResult.ok === true) && target.alive === false,
        helmLossSeconds,
      }));
      if (receipt.debrisCount > 0) {
        this.bus.emit('combat:collisionDebris', {
          schemaVersion: 1,
          tick,
          targetId: target.id,
          otherId: other.id,
          count: receipt.debrisCount,
          surface: receipt.surface,
          pos: receipt.pos,
          normal: receipt.normal,
          provenance: receipt.provenance,
        });
      }
    }
  },

  _routeImpactDamage(target, other, receipt) {
    const kernel = combatKernel(this);
    if (!kernel || typeof kernel.routeDamage !== 'function') return null;
    const sourceKind = `collision_${receipt.surface}`;
    // routeDamage may synchronously cross the lethal threshold and invoke combat.kill. Snapshot the
    // live body/contact truth before that call so the sole death owner can publish an immutable
    // presentation receipt without querying a retired entity or inventing collision provenance.
    const collisionPresentation = buildCollisionPresentationProvenance(target, other, receipt);
    const packet = scalarHitToDamagePacket({
      damage: receipt.impactDamage,
      damageType: 'kinetic',
      pos: receipt.pos,
      source: {
        kind: sourceKind,
        weaponId: receipt.provenance.weaponId,
        impulseProvenance: receipt.provenance.tag,
        collisionPresentation,
      },
    });
    packet.flags = { allowAnyTarget: true };
    return kernel.routeDamage({
      attackerId: receipt.provenance.actorId,
      targetId: target.id,
      packet,
      origin: {
        kind: 'collision',
        id: receipt.surface,
        weaponId: receipt.provenance.weaponId,
      },
    });
  },

  _admitPair(aId, bId, tick) {
    const key = pairKey(aId, bId);
    const previous = this._pairTicks.get(key);
    if (Number.isFinite(previous) && tick - previous < COLLISION_CONSEQUENCE_PAIR_COOLDOWN_TICKS) return false;
    this._pairTicks.set(key, tick);
    if (this._pairTicks.size > 512) {
      const cutoff = tick - COLLISION_CONSEQUENCE_PAIR_COOLDOWN_TICKS;
      for (const [entryKey, entryTick] of this._pairTicks) {
        if (entryTick < cutoff) this._pairTicks.delete(entryKey);
      }
    }
    return true;
  },

  _resetTransientState() {
    this._pairTicks = new Map();
    this._pendingCraftContacts = new Map();
    resetPendingSlams();
  },
};

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function entityById(state, id) {
  return state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) || null : null;
}

function pairKey(aId, bId) {
  const a = String(aId);
  const b = String(bId);
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function positiveMass(entity) {
  return Math.max(0.1, finite(entity && (entity.physicsBody && entity.physicsBody.mass || entity.mass), 1));
}

function nonNegativeTick(value) {
  return Math.max(0, Math.trunc(finite(value)));
}

function helmLossFromTumbleStatus(status, tick) {
  if (!status || !status.data) return 0;
  if (!Number.isInteger(status.applyTick) || status.applyTick !== tick) return 0;
  return Math.max(0, (status.data.until ?? 0) - (status.data.startedAt ?? 0));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function contactImpulseProvenance(a, b, tick) {
  const aProvenance = readRecentImpulseProvenance(a, tick);
  const bProvenance = readRecentImpulseProvenance(b, tick);
  if (!aProvenance) return bProvenance;
  if (!bProvenance) return aProvenance;
  if (aProvenance.appliedTick !== bProvenance.appliedTick) {
    return aProvenance.appliedTick > bProvenance.appliedTick ? aProvenance : bProvenance;
  }
  if (aProvenance.magnitude !== bProvenance.magnitude) {
    return aProvenance.magnitude > bProvenance.magnitude ? aProvenance : bProvenance;
  }
  return provenanceKey(aProvenance) <= provenanceKey(bProvenance) ? aProvenance : bProvenance;
}

function provenanceKey(value) {
  return [value.actorId ?? '', value.weaponId ?? '', value.tag ?? ''].map(String).join('\u0000');
}

function isPotentialMasslineWhipContact(state, a, b) {
  if (!DAMAGEABLE_MOTION.has(a.type) || !DAMAGEABLE_MOTION.has(b.type)) return false;
  if (!masslineWhipDamageEnabled(state)) return false;
  const playerState = state && state.player;
  const runtime = playerState && playerState.masslineImpacts;
  const tether = playerState && playerState.tether;
  const runtimeMassId = runtime && runtime.tracking ? runtime.massId : null;
  const tetherMassId = tether && tether.active ? tether.targetId : null;
  return contactIncludesId(a, b, runtimeMassId) || contactIncludesId(a, b, tetherMassId);
}

function isDamageBearingWhipReceipt(state, payload) {
  if (!payload || !Number.isFinite(payload.tick)) return false;
  if (payload.targetId == null || payload.victimId == null) return false;
  if (payload.rating !== 'solid' && payload.rating !== 'crushing') return false;
  return masslineWhipDamageEnabled(state);
}

function masslineWhipDamageEnabled(state) {
  const features = state && state.runtime && state.runtime.features;
  return combatFlag('whipDamage', features) || massline2Flag('impactDamage', features);
}

function contactIncludesId(a, b, id) {
  return id != null && (String(a.id) === String(id) || String(b.id) === String(id));
}

function craftContactKey(tick, aId, bId) {
  return `${nonNegativeTick(tick)}\u0001${pairKey(aId, bId)}`;
}

function snapshotContactPayload(payload, tick) {
  const snap = {
    tick,
    pos: Object.freeze({
      x: finite(payload && payload.pos && payload.pos.x),
      z: finite(payload && payload.pos && payload.pos.z),
    }),
    normal: Object.freeze({
      x: finite(payload && payload.normal && payload.normal.x),
      z: finite(payload && payload.normal && payload.normal.z),
    }),
  };
  if (Number.isFinite(payload && payload.preSolveClosingSpeed)) {
    snap.preSolveClosingSpeed = payload.preSolveClosingSpeed;
  }
  return Object.freeze(snap);
}

function explicitContactProvenance(payload, tick) {
  if (!payload || payload.causalActorId == null) return null;
  const actorId = payload.causalActorId;
  if (typeof actorId === 'number' && !Number.isFinite(actorId)) return null;
  if (typeof actorId !== 'number' && (typeof actorId !== 'string' || actorId.length === 0)) return null;
  return Object.freeze({
    actorId,
    weaponId: null,
    tag: 'direct_contact',
    appliedTick: tick,
  });
}

export function playerRamPlateImpact(entity, playerId, tick, provenance, state) {
  if (!entity || entity.id !== playerId) return null;
  if (!provenance || provenance.actorId !== playerId || provenance.tag !== 'direct_contact') return null;
  const derived = entity.data?.derived;
  // MASS FLAIL RIG (derived.towFlail): a player contact while towing a real load carries the
  // load into the strike — the multiplier grows with the tethered body's mass, so what you drag
  // IS the damage. No live tow, no flail; the ram-plate path below keeps its own law.
  if (derived?.towFlail) {
    const tether = state && state.player && state.player.tether;
    const towed = tether && tether.active && tether.targetId != null && state.entities
      && typeof state.entities.get === 'function' ? state.entities.get(tether.targetId) : null;
    const towedMassT = towed && towed.alive !== false ? Math.max(0, Number(towed.mass) || 0) : 0;
    if (towedMassT > TOW_FLAIL_MIN_MASS_T) {
      return {
        damageMultiplier: Math.min(
          TOW_FLAIL_MAX_MULT,
          1 + ((towedMassT - TOW_FLAIL_MIN_MASS_T) / TOW_FLAIL_MASS_PER_POINT),
        ),
        provenance: {
          actorId: playerId,
          weaponId: 'mod_mass_flail_rig',
          tag: 'tow_flail',
          appliedTick: tick,
        },
      };
    }
  }
  const damageMultiplier = clamp(finite(derived?.ramDamageDealtMult), 0, 4);
  if (!(damageMultiplier > 0)) return null;
  return {
    damageMultiplier,
    provenance: {
      actorId: playerId,
      weaponId: 'mod_ram_plate',
      tag: 'ram_plate',
      appliedTick: tick,
    },
  };
}

function buildCollisionPresentationProvenance(target, other, receipt) {
  return Object.freeze({
    position: freezeTransientPoint(receipt && receipt.pos),
    direction: freezeIncomingCollisionDirection(target, other, receipt),
    normal: freezeTransientDirection(receipt && receipt.normal),
    surface: collisionPresentationSurface(receipt && receipt.surface),
    targetVelocity: freezeTransientPoint(target && target.vel),
    impact: Object.freeze({
      deltaV: nonNegativeFinite(receipt && receipt.deltaV),
      exchangedMomentum: nonNegativeFinite(receipt && receipt.exchangedMomentum),
      impactDamage: nonNegativeFinite(receipt && receipt.impactDamage),
    }),
  });
}

function freezeIncomingCollisionDirection(target, other, receipt) {
  // Direction follows the causal body's travel relative to the contacted body. A Ram Plate makes
  // the counterpart causal, so a moving rammer still reads on a stationary victim. Otherwise the
  // consequence target carries the prior impulse provenance and its motion into terrain/structure
  // is causal. The SG-02 normal remains a separate unoriented contact axis; it never supplies sign.
  const counterpartCaused = receipt && receipt.provenance
    && receipt.provenance.actorId === (other && other.id);
  const sourceVelocity = counterpartCaused ? other && other.vel : target && target.vel;
  const contactedVelocity = counterpartCaused ? target && target.vel : other && other.vel;
  return freezeTransientDirectionComponents(
    finite(sourceVelocity && sourceVelocity.x) - finite(contactedVelocity && contactedVelocity.x),
    finite(sourceVelocity && sourceVelocity.z) - finite(contactedVelocity && contactedVelocity.z),
  );
}

function collisionPresentationSurface(value) {
  return value === 'terrain' || value === 'craft' || value === 'structure' ? value : null;
}

function freezeTransientPoint(value) {
  return Object.freeze({ x: finite(value && value.x), z: finite(value && value.z) });
}

function freezeTransientDirection(value) {
  return freezeTransientDirectionComponents(
    finite(value && value.x),
    finite(value && value.z),
  );
}

function freezeTransientDirectionComponents(x, z) {
  const length = Math.hypot(x, z);
  return length > 1e-9 ? Object.freeze({ x: x / length, z: z / length }) : null;
}

function nonNegativeFinite(value) {
  return Math.max(0, finite(value));
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
