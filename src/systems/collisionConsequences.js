// PQ-009 / SF-09: contact momentum -> combat and control consequences.
//
// Physics owns contact solving and publishes bounded momentum receipts. This system translates
// those receipts into setup/payoff combat without ever writing velocity, hull, heat, economy, or
// save state directly: control crosses physicsAuthority, damage crosses the combat kernel, and
// transient episode/control state stays outside the entity graph.
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  readRecentImpulseProvenance,
  resolveCollisionConsequence,
} from '../combat/impulseKernel.js';
import { ensureCombatant } from '../combat/runtime.js';
import { appendCombatTrace } from '../combat/trace.js';
import { COLLISION_TUMBLE_KIND, TUMBLE_STATUS_ID } from '../combat/tumbleStatus.js';
import { combatFlag } from '../data/featureFlags.js';
import {
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../core/physicsAuthority.js';

export const COLLISION_CONSEQUENCE_PAIR_COOLDOWN_TICKS = 12;

const ZERO_FORCE = Object.freeze({ x: 0, y: 0, z: 0 });
const CONTROL_PRIORITY = Object.freeze({ none: 0, stagger: 1, tumble: 2 });
const DAMAGEABLE_MOTION = new Set(['ship', 'drone']);

export const collisionConsequences = {
  id: 'collisionConsequences',
  name: 'collisionConsequences',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._pairTicks = new Map();
    this._controlStates = new WeakMap();
    this._applicationEnabled = combatFlag('weaponImpulseConsequences');
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('physics:impact', (payload) => this._onImpact(payload || {})));
      this._unsubs.push(this.bus.on('save:loaded', () => this._resetTransientState()));
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
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const tick = nonNegativeTick(state.tick);
    for (const entity of entities.values()) {
      const control = entity && this._controlStates.get(entity);
      if (!control) continue;
      if (entity.alive === false || tick > control.untilTick) {
        this._controlStates.delete(entity);
        continue;
      }
      writePhysicsControl(entity, {
        mode: control.kind === 'tumble' ? 'collision_tumble' : 'collision_stagger',
        force: ZERO_FORCE,
        torque: ZERO_FORCE,
        source: 'collision_consequence',
      });
      if (control.torquePending && control.torqueImpulseY !== 0) {
        queuePhysicsTorqueImpulse(entity, { x: 0, y: control.torqueImpulseY, z: 0 });
        control.torquePending = false;
      }
      const intent = entity.data && entity.data.intent;
      if (intent) {
        intent.fire = false;
        intent.moveX = 0;
        intent.moveZ = 0;
      }
    }
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

    this._resolveTarget(a, b, payload, exchangedMomentum, tick);
    this._resolveTarget(b, a, payload, exchangedMomentum, tick);
  },

  _resolveTarget(target, other, payload, exchangedMomentum, tick) {
    const state = this.state;
    if (!DAMAGEABLE_MOTION.has(target.type) || target.id === state.playerId) return;
    const ramPlate = playerRamPlateImpact(other, state.playerId, tick);
    const provenance = ramPlate?.provenance || readRecentImpulseProvenance(target, tick);
    const receipt = resolveCollisionConsequence({
      target,
      other,
      exchangedMomentum,
      tick,
      provenance,
      craftDamageMultiplier: ramPlate?.damageMultiplier || 0,
      pos: payload.pos,
      normal: payload.normal,
    });
    if (!receipt) return;

    if (receipt.control !== 'none') this._beginControl(target, receipt);
    const damageResult = receipt.impactDamage > 0 ? this._routeImpactDamage(target, other, receipt) : null;
    if (receipt.control === 'tumble') this._scheduleTumbleStatus(target, receipt);

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
      this.bus.emit('combat:collisionConsequence', receipt);
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

  _beginControl(target, receipt) {
    const previous = this._controlStates.get(target);
    const untilTick = receipt.tick + Math.max(1, receipt.staggerTicks);
    const kind = previous && CONTROL_PRIORITY[previous.kind] > CONTROL_PRIORITY[receipt.control]
      ? previous.kind : receipt.control;
    const torqueImpulseY = kind === 'tumble'
      ? collisionTumbleImpulse(target, receipt)
      : 0;
    this._controlStates.set(target, {
      kind,
      untilTick: Math.max(untilTick, previous && previous.untilTick || 0),
      torqueImpulseY: torqueImpulseY || previous && previous.torqueImpulseY || 0,
      torquePending: kind === 'tumble' && !(previous && previous.kind === 'tumble'),
    });
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

  _scheduleTumbleStatus(target, receipt) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.statuses || typeof kernel.statuses.schedule !== 'function' || !kernel.catalog) return false;
    let runtime = null;
    try { runtime = ensureCombatant(this.state, target, kernel.catalog); }
    catch { return false; }
    const result = kernel.statuses.schedule(target, runtime, {
      id: TUMBLE_STATUS_ID,
      stacks: 1,
      durationTicks: Math.max(1, receipt.staggerTicks),
      applyTick: receipt.tick + 1,
      data: { kind: COLLISION_TUMBLE_KIND },
    }, {
      attackerId: receipt.provenance.actorId,
      actionId: null,
    });
    return !!(result && result.ok);
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
    this._controlStates = new WeakMap();
  },
};

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function collisionTumbleImpulse(target, receipt) {
  const radius = Math.max(0.1, finite(target.radius, 1));
  const mass = Math.max(0.1, finite(target.mass, 1));
  const authoredInertia = target.data && target.data.physicsBody && target.data.physicsBody.inertiaY;
  const inertia = Math.max(0.1, finite(authoredInertia, 0.5 * mass * radius * radius));
  const targetOmega = clamp(receipt.deltaV / radius, 0.8, 4);
  const rx = finite(receipt.pos && receipt.pos.x) - finite(target.pos && target.pos.x);
  const rz = finite(receipt.pos && receipt.pos.z) - finite(target.pos && target.pos.z);
  const nx = finite(receipt.normal && receipt.normal.x);
  const nz = finite(receipt.normal && receipt.normal.z);
  const crossY = rz * nx - rx * nz;
  const sign = Math.abs(crossY) > 1e-6 ? Math.sign(crossY) : (numericParity(target.id) ? 1 : -1);
  return sign * inertia * targetOmega;
}

function entityById(state, id) {
  return state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) || null : null;
}

function pairKey(aId, bId) {
  const a = String(aId);
  const b = String(bId);
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function numericParity(value) {
  if (Number.isFinite(value)) return Math.abs(Math.trunc(value)) % 2;
  const text = String(value);
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return sum % 2;
}

function nonNegativeTick(value) {
  return Math.max(0, Math.trunc(finite(value)));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function playerRamPlateImpact(entity, playerId, tick) {
  if (!entity || entity.id !== playerId) return null;
  const damageMultiplier = clamp(finite(entity.data?.derived?.ramDamageDealtMult), 0, 4);
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
