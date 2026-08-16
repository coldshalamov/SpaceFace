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
import {
  COLLISION_TUMBLE_KIND,
  describeTumbleStatus,
  isTumbling,
  readTumbleStatus,
  resolveTumbleEntry,
  resolveTumbleEntrySpin,
  resolveTumbleInertiaY,
  stableTumbleSpinSign,
  TUMBLE_STATUS_ID,
} from '../combat/tumbleStatus.js';
import { combatFlag, massline2Flag } from '../data/featureFlags.js';
import {
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../core/physicsAuthority.js';

export const COLLISION_CONSEQUENCE_PAIR_COOLDOWN_TICKS = 12;

const ZERO_FORCE = Object.freeze({ x: 0, y: 0, z: 0 });
const CONTROL_PRIORITY = Object.freeze({ none: 0, stagger: 1, tumble: 2 });
const DAMAGEABLE_MOTION = new Set(['ship', 'drone']);
const RESOLVE_PENDING_CRAFT_CONTACT_EVENT = 'collisionConsequences:resolvePendingCraftContact';

export const collisionConsequences = {
  id: 'collisionConsequences',
  name: 'collisionConsequences',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._pairTicks = new Map();
    this._controlStates = new WeakMap();
    this._pendingCraftContacts = new Map();
    // AC-08 chain depth: transient combat truth, never entity or save state. Keyed by live object
    // so a body that no longer exists forgets its chain by construction.
    this._chainDepths = new WeakMap();
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
      // AC-04: a contact tumble's zero-control window belongs to the shared owner (tumbleStates).
      // This local state only survives as the fail-safe for a host with no combat status service,
      // so it stands down the moment the canonical status is live.
      if (control.kind === 'tumble' && isTumbling(state, entity)) {
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
    this._resolveDeferredCraftContact(pending, true);
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
    // AC-08: real PRE-contact truth for both bodies, read exactly once, before either direction
    // below can enter the tumble this same contact causes. A scheduled tumble is visible to the
    // status reader immediately, so resolving `a` first would otherwise make `b`'s death read as a
    // chain off the very collision that killed it.
    const aTumble = describeTumbleStatus(readTumbleStatus(this.state, a));
    const bTumble = describeTumbleStatus(readTumbleStatus(this.state, b));
    const aChainDepth = this._chainDepthOf(a);
    const bChainDepth = this._chainDepthOf(b);
    const towardA = preContactTruth(aTumble, bTumble, bChainDepth);
    const towardB = preContactTruth(bTumble, aTumble, aChainDepth);
    this._resolveTarget(a, b, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage, towardA);
    this._resolveTarget(b, a, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage, towardB);
  },

  _resolveTarget(target, other, payload, exchangedMomentum, tick, causalProvenance, suppressCraftDamage, preContact) {
    const state = this.state;
    if (!DAMAGEABLE_MOTION.has(target.type) || target.id === state.playerId) return;
    const ramPlate = playerRamPlateImpact(other, state.playerId, tick, causalProvenance);
    // The first ram/contact enters a transient tumble status with its real attacker. When that
    // projectile later meets terrain, the original impulse record may already have aged out; the
    // pre-contact tumble episode is the remaining causal truth. Carry it across the payoff contact
    // instead of turning a player-created environment kill into an unattributed accident.
    const provenance = ramPlate?.provenance || causalProvenance
      || tumbleContactProvenance(preContact, tick);
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
    });
    if (!receipt) return;

    // A chain link is the next kill scored by a body that was ALREADY a projectile. Depth counts
    // kills in this chain including this one, so the first bowled swarmer is link 1.
    const chainLinkDepth = receipt.surface === 'craft' && preContact.sourceTumbling
      ? preContact.sourceChainDepth + 1
      : 0;

    // Stagger is a local, lighter loss of authority this system still owns outright. A tumble is the
    // canonical first-class state: it enters the shared status/control owner, and only falls back to
    // the local control state when no combat status service exists to hold it.
    if (receipt.control === 'stagger') this._beginControl(target, receipt);
    const damageResult = receipt.impactDamage > 0
      ? this._routeImpactDamage(target, other, receipt, preContact, chainLinkDepth)
      : null;
    // routeDamage may have crossed the lethal threshold synchronously. A dead body forgets its own
    // chain; a surviving projectile advances one link for each kill it actually scored.
    if (damageResult && target.alive === false) {
      this._chainDepths.delete(target);
      if (chainLinkDepth > 0) this._recordChainDepth(other, chainLinkDepth);
    }
    if (receipt.control === 'tumble' && !this._enterTumble(target, receipt)) this._beginControl(target, receipt);

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
      ? collisionTumbleSpin(target, receipt).impulseY
      : 0;
    this._controlStates.set(target, {
      kind,
      untilTick: Math.max(untilTick, previous && previous.untilTick || 0),
      torqueImpulseY: torqueImpulseY || previous && previous.torqueImpulseY || 0,
      torquePending: kind === 'tumble' && !(previous && previous.kind === 'tumble'),
    });
  },

  _routeImpactDamage(target, other, receipt, preContact, chainLinkDepth) {
    const kernel = combatKernel(this);
    if (!kernel || typeof kernel.routeDamage !== 'function') return null;
    const sourceKind = `collision_${receipt.surface}`;
    // routeDamage may synchronously cross the lethal threshold and invoke combat.kill. Snapshot the
    // live body/contact truth before that call so the sole death owner can publish an immutable
    // presentation receipt without querying a retired entity or inventing collision provenance.
    const collisionPresentation = buildCollisionPresentationProvenance(
      target, other, receipt, preContact, chainLinkDepth,
    );
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

  /**
   * Enter the canonical tumble state from a contact receipt. Contact geometry is only known here, so
   * the entry spin is authored here and delivered as a real angular impulse through the SG-02 command
   * membrane; the bounded zero-control window and recovery belong to tumbleStates.
   * Returns false when the shared owner cannot take it (no status service), so the caller can fall
   * back to this system's local control state rather than leaving the hull fully in control.
   */
  _enterTumble(target, receipt) {
    const entry = resolveTumbleEntry(this.state, target, {
      kind: COLLISION_TUMBLE_KIND,
      durationTicks: Math.max(1, receipt.staggerTicks),
      tick: receipt.tick,
    });
    // Already tumbling from contact: grinding along a rock must not restart the spin every episode.
    if (!entry) return true;
    const spin = collisionTumbleSpin(target, receipt);
    const startedAt = simSeconds(this.state, receipt.tick);
    const scheduled = this._scheduleTumbleStatus(target, receipt, entry, {
      kind: entry.kind,
      source: entry.source,
      // Cause is the surface the hull was overwhelmed by — never relabeled as a Massline cause.
      cause: receipt.surface,
      startedAt,
      until: startedAt + entry.durationTicks / 60,
      spin: Math.abs(spin.omega),
    });
    if (!scheduled) return false;
    queuePhysicsTorqueImpulse(target, { x: 0, y: spin.impulseY, z: 0 });
    return true;
  },

  _scheduleTumbleStatus(target, receipt, entry, data) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.statuses || typeof kernel.statuses.schedule !== 'function' || !kernel.catalog) return false;
    let runtime = null;
    try { runtime = ensureCombatant(this.state, target, kernel.catalog); }
    catch { return false; }
    const result = kernel.statuses.schedule(target, runtime, {
      id: TUMBLE_STATUS_ID,
      stacks: 1,
      durationTicks: entry.durationTicks,
      applyTick: receipt.tick + 1,
      data,
    }, {
      attackerId: receipt.provenance.actorId,
      actionId: null,
    });
    return !!(result && result.ok);
  },

  /**
   * Chain depth this body currently carries as a tumbling projectile, or 0.
   *
   * The stored depth belongs to ONE tumble episode. A hull that recovers and is tumbled again later
   * by a fresh impulse starts a new chain, so a depth whose episode no longer matches is dropped
   * rather than silently compounding an unrelated later kill.
   */
  _chainDepthOf(entity) {
    const record = this._chainDepths.get(entity);
    if (!record) return 0;
    if (record.episode !== tumbleEpisodeKey(this.state, entity)) {
      this._chainDepths.delete(entity);
      return 0;
    }
    return record.depth;
  },

  _recordChainDepth(entity, depth) {
    const episode = tumbleEpisodeKey(this.state, entity);
    // A projectile that is no longer tumbling has nothing to carry the chain forward with.
    if (!episode) {
      this._chainDepths.delete(entity);
      return;
    }
    this._chainDepths.set(entity, { depth, episode });
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
    this._pendingCraftContacts = new Map();
    this._chainDepths = new WeakMap();
  },
};

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

// Entry spin for a contact tumble: a real angular impulse (inertia × Δω) toward a spin inside the
// shared entry band, signed by the contact lever arm. `omega` is the physical target spin — the value
// presentation reads — while `impulseY` is the momentum the physics owner must apply to reach it.
function collisionTumbleSpin(target, receipt) {
  const inertia = resolveTumbleInertiaY(target);
  const targetOmega = resolveTumbleEntrySpin(receipt.deltaV, finite(target.radius, 1));
  const rx = finite(receipt.pos && receipt.pos.x) - finite(target.pos && target.pos.x);
  const rz = finite(receipt.pos && receipt.pos.z) - finite(target.pos && target.pos.z);
  const nx = finite(receipt.normal && receipt.normal.x);
  const nz = finite(receipt.normal && receipt.normal.z);
  const crossY = rz * nx - rx * nz;
  const sign = Math.abs(crossY) > 1e-6 ? Math.sign(crossY) : stableTumbleSpinSign(target.id);
  return { omega: sign * targetOmega, impulseY: sign * inertia * targetOmega };
}

function simSeconds(state, tick) {
  if (state && Number.isFinite(state.simTime)) return state.simTime;
  return nonNegativeTick(tick) / 60;
}

function entityById(state, id) {
  return state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) || null : null;
}

function pairKey(aId, bId) {
  const a = String(aId);
  const b = String(bId);
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function nonNegativeTick(value) {
  return Math.max(0, Math.trunc(finite(value)));
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
  return Object.freeze({
    tick,
    pos: Object.freeze({
      x: finite(payload && payload.pos && payload.pos.x),
      z: finite(payload && payload.pos && payload.pos.z),
    }),
    normal: Object.freeze({
      x: finite(payload && payload.normal && payload.normal.x),
      z: finite(payload && payload.normal && payload.normal.z),
    }),
  });
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

function playerRamPlateImpact(entity, playerId, tick, provenance) {
  if (!entity || entity.id !== playerId) return null;
  // The player hull is itself the direct-contact actor. Physics need not duplicate that causality
  // in an optional causalActorId field; only an explicit contradictory actor may displace it.
  if (provenance && provenance.actorId != null && provenance.actorId !== playerId) return null;
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

function buildCollisionPresentationProvenance(target, other, receipt, preContact, chainLinkDepth) {
  return Object.freeze({
    position: freezeTransientPoint(receipt && receipt.pos),
    direction: freezeIncomingCollisionDirection(target, other, receipt),
    normal: freezeTransientDirection(receipt && receipt.normal),
    surface: collisionPresentationSurface(receipt && receipt.surface),
    targetVelocity: freezeTransientPoint(target && target.vel),
    // AC-08 style truth: who was already a projectile before this contact, and how deep the chain
    // that produced it runs. Snapshotted here because it is unreadable once the contact resolves.
    tumble: Object.freeze({
      victim: !!(preContact && preContact.victimTumbling),
      source: !!(preContact && preContact.sourceTumbling),
    }),
    chainDepth: Math.max(0, Math.trunc(finite(chainLinkDepth))),
    impact: Object.freeze({
      deltaV: nonNegativeFinite(receipt && receipt.deltaV),
      exchangedMomentum: nonNegativeFinite(receipt && receipt.exchangedMomentum),
      impactDamage: nonNegativeFinite(receipt && receipt.impactDamage),
    }),
  });
}

function preContactTruth(victimTumble, sourceTumble, sourceChainDepth) {
  return Object.freeze({
    victimTumbling: !!victimTumble,
    sourceTumbling: !!sourceTumble,
    victimTumble,
    sourceTumble,
    sourceChainDepth,
  });
}

function tumbleContactProvenance(preContact, tick) {
  const status = preContact && (preContact.sourceTumble || preContact.victimTumble);
  if (!status || status.attackerId == null) return null;
  return {
    actorId: status.attackerId,
    weaponId: null,
    tag: `${status.source || 'physical'}_tumble`,
    appliedTick: tick,
  };
}

/**
 * Identity of a body's current tumble episode, or null when it is under its own control. Folding
 * the window bounds in means a takeover or a fresh spin always reads as a different episode.
 */
function tumbleEpisodeKey(state, entity) {
  const status = describeTumbleStatus(readTumbleStatus(state, entity));
  if (!status) return null;
  return [status.kind, status.startedAt, status.until].join('\u0000');
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
