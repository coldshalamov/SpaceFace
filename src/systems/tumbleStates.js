// Tumble states — one helm-override writer for delivered impulses (PQ-137.04).
//
// Duration and entry spin are the hitstun law in impulseKernel. Recovery uses the victim's
// actual yaw/thruster authority through the physics command membrane, never a hidden gyro.
// The player ship never tumbles. RCS disruption is a named non-impulse exception with its
// authored ~1.6 s drift semantics, still written here so there is one control owner.
import { massline2Flag, combatFlag } from '../data/featureFlags.js';
import { WEAPONS } from '../data/weapons.js';
import {
  ensurePhysicsBodySpec,
  measureThrusterAuthority,
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';
import { resolveGovernedCombatSpeed, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { ensureCombatant } from '../combat/runtime.js';
import {
  COLLISION_TUMBLE_KIND,
  MASSLINE_TUMBLE_KIND,
  WEAPON_TUMBLE_KIND,
  WELL_TUMBLE_KIND,
  readTumbleStatus,
  TUMBLE_STATUS_ID,
} from '../combat/tumbleStatus.js';
import {
  HITSTUN_IMPULSE_EVENT,
  readRecentImpulseProvenance,
  resolveHitstunLaw,
} from '../combat/impulseKernel.js';

const RCS_TRIGGER_MAXAGE_TICKS = 8;
const RCS_DEFAULT_S = 1.6;
const RCS_PROVENANCE = 'rcs_disruptor_spike';
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

const DRIFT_CONTROL = Object.freeze({
  mode: 'drifting',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'drive_disabled',
});
const RCS_CONTROL = Object.freeze({
  mode: 'rcs_disrupted',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'rcs_disruptor',
});

export const tumbleStates = {
  id: 'tumbleStates',
  name: 'tumbleStates',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._rcsDisrupt = new WeakMap();
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:whipImpact', (p) => this._onWhipImpact(p || {})));
      this._unsubs.push(this.bus.on('massline:throw', (p) => this._onThrow(p || {})));
      this._unsubs.push(this.bus.on(HITSTUN_IMPULSE_EVENT, (p) => this._onHitstunImpulse(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
    this._rcsDisrupt = new WeakMap();
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const now = finite(state.simTime, state.tick / 60);
    this._tickRcsLatches(state);

    for (const e of entities.values()) {
      const tumble = e ? readTumbleStatus(state, e) : null;
      const drifting = isNpcDrifting(state, e);
      const rcs = e ? this._rcsDisrupt.get(e) : null;
      if (!tumble && !drifting && !rcs) continue;

      let tumbleActive = !!tumble;
      if (tumbleActive && (!e.alive || e.id === state.playerId)) {
        this._clearTumbleStatus(e, e.alive ? 'player_immune' : 'entity_dead');
        tumbleActive = false;
      }
      if (!e.alive) continue;

      if (tumbleActive) {
        const elapsed = now - finite(tumble.data && tumble.data.startedAt, now);
        if (now >= finite(tumble.data && tumble.data.until, now)) {
          this._clearTumbleStatus(e, 'duration_elapsed');
          if (this.bus) this.bus.emit('massline:tumbleEnd', { victimId: e.id, durationS: elapsed });
          tumbleActive = false;
        }
      }
      if (!tumbleActive && !drifting && !rcs) continue;

      if (tumbleActive) {
        writePhysicsControl(e, recoveryControl(e, dt, tumble.data && tumble.data.kind));
        if (e.data && e.data.intent) {
          e.data.intent.fire = false;
          e.data.intent.moveX = 0;
          e.data.intent.moveZ = 0;
        }
        continue;
      }
      if (rcs) {
        writePhysicsControl(e, RCS_CONTROL);
        if (e.data && e.data.intent) {
          e.data.intent.fire = false;
          e.data.intent.moveX = 0;
          e.data.intent.moveZ = 0;
        }
        continue;
      }
      writePhysicsControl(e, DRIFT_CONTROL);
      if (e.data && e.data.intent) {
        e.data.intent.moveX = 0;
        e.data.intent.moveZ = 0;
        e.data.intent.boost = false;
        e.data.intent.brake = false;
      }
    }
  },

  _onThrow(payload) {
    const state = this.state;
    if (!massline2Flag('tumble') || !state) return;
    const victim = entityById(state, payload.payloadId);
    this._beginFromImpulse(victim, {
      source: 'rope_throw',
      kind: MASSLINE_TUMBLE_KIND,
      cause: 'thrown',
      deltaV: finite(payload.payloadSpeed),
      attackerId: state.playerId,
      attackerMass: massOf(entityById(state, state.playerId)),
      hitSide: numericParity(payload.payloadId) ? 1 : -1,
      requireMassline: true,
      provenance: Object.freeze({
        schemaVersion: 1,
        kind: 'massline',
        source: 'throw',
        tag: 'massline_throw',
        payloadId: payload.payloadId == null ? null : payload.payloadId,
      }),
    });
  },

  _onWhipImpact(payload) {
    const state = this.state;
    if (!massline2Flag('tumble') || !state) return;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return;
    const victim = entityById(state, payload.victimId);
    this._beginFromImpulse(victim, {
      source: 'rope_whip',
      kind: MASSLINE_TUMBLE_KIND,
      cause: 'struck',
      deltaV: finite(payload.relSpeed, finite(payload.massSpeed)),
      attackerId: payload.targetId,
      attackerMass: positive(payload.mass, massOf(entityById(state, payload.targetId))),
      hitSide: numericParity(payload.victimId) ? 1 : -1,
      requireMassline: true,
      provenance: Object.freeze({
        schemaVersion: 1,
        kind: 'massline',
        source: 'whip',
        tag: 'massline_whip',
        rating: payload.rating || null,
        targetId: payload.targetId == null ? null : payload.targetId,
        victimId: payload.victimId == null ? null : payload.victimId,
      }),
    });
  },

  _onHitstunImpulse(payload) {
    const state = this.state;
    if (!state || !combatFlag('weaponImpulseConsequences')) return;
    const source = payload && payload.source;
    if (source === 'rope_throw' || source === 'rope_whip') return;
    const victim = entityById(state, payload.victimId);
    const kind = source === 'well'
      ? WELL_TUMBLE_KIND
      : source === 'collision' ? COLLISION_TUMBLE_KIND : WEAPON_TUMBLE_KIND;
    this._beginFromImpulse(victim, {
      source: source || 'weapon',
      kind,
      cause: source || 'weapon',
      deltaV: finite(payload.deltaV),
      attackerId: payload.attackerId,
      attackerMass: payload.attackerMass,
      hitSide: payload.hitSide === -1 ? -1 : 1,
      worldBody: payload.worldBody === true,
      requireMassline: false,
      provenance: payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : null,
    });
  },

  _beginFromImpulse(victim, input) {
    const state = this.state;
    if (!victim || victim.alive === false || !victim.data) return;
    if (victim.id === state.playerId) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;
    if (input.requireMassline && !massline2Flag('tumble')) return;
    if (!input.requireMassline && !combatFlag('weaponImpulseConsequences')) return;

    const cruise = resolveGovernedCombatSpeed(victim, state, 0);
    const law = resolveHitstunLaw({
      deltaV: input.deltaV,
      victimCruise: cruise,
      attackerMass: input.attackerMass,
      victimMass: massOf(victim),
      worldBody: input.worldBody === true,
    });
    if (!(law.durationS > 0)) return;

    const now = finite(state.simTime, state.tick / 60);
    const existing = readTumbleStatus(state, victim);
    const existingUntil = existing && existing.data ? finite(existing.data.until, 0) : 0;
    const startedAt = existing && existing.data && Number.isFinite(existing.data.startedAt)
      ? existing.data.startedAt
      : now;
    const until = Math.max(existingUntil, now + law.durationS);
    const scheduled = this._scheduleTumbleStatus(victim, until - now, {
      kind: input.kind,
      startedAt,
      until,
      cause: input.cause,
      source: input.source,
      spin: law.entrySpin,
      u: law.u,
      k: law.k,
      mF: law.mF,
    });
    if (!scheduled) return;

    const profile = resolveFlightProfile(victim, state);
    const body = ensurePhysicsBodySpec(victim);
    const inertia = Math.max(0.1, finite(body && body.inertiaY, finite(profile.inertia, 1)));
    const currentSpin = finite(victim.angVel, 0);
    const sign = input.hitSide === -1 ? -1 : 1;
    queuePhysicsTorqueImpulse(victim, { x: 0, y: inertia * (sign * law.entrySpin - currentSpin), z: 0 });
    writePhysicsControl(victim, recoveryControl(victim, 1 / 60, input.kind));
    if (victim.data.intent) {
      victim.data.intent.fire = false;
      victim.data.intent.moveX = 0;
      victim.data.intent.moveZ = 0;
    }
    victim.data.tumbledAt = now;

    if (this.bus) {
      const announcement = freezeTumbleAnnouncement({
        victimId: victim.id,
        attackerId: input.attackerId == null ? null : input.attackerId,
        source: input.source,
        cause: input.cause,
        deltaV: finite(input.deltaV),
        hitSide: input.hitSide === -1 ? -1 : 1,
        worldBody: input.worldBody === true,
        k: law.k,
        mF: law.mF,
        u: law.u,
        spin: law.entrySpin,
        durationS: until - startedAt,
        startedAt,
        until,
        provenance: input.provenance,
        tick: state.tick,
        time: now,
      });
      this.bus.emit('combat:tumbled', announcement);
      if (input.kind === MASSLINE_TUMBLE_KIND) this.bus.emit('massline:tumbled', announcement);
      this.bus.emit('audio:cue', { id: 'massline.tumble', position: { x: victim.pos.x, z: victim.pos.z } });
      this.bus.emit('presentation:vfxCue', {
        id: 'ship.tumble',
        lane: input.kind === MASSLINE_TUMBLE_KIND ? 'massline_tumble' : 'hitstun_tumble',
        pos: { x: victim.pos.x, z: victim.pos.z },
        particles: 16,
        lights: 1,
      });
    }
  },

  _tickRcsLatches(state) {
    if (!combatFlag('weaponImpulseConsequences')) {
      this._rcsDisrupt = new WeakMap();
      return;
    }
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    if (!ships) return;
    const tick = state.tick || 0;
    for (const s of ships) {
      if (!s || s.type !== 'ship' || !s.alive || s.id === state.playerId) continue;
      const prov = readRecentImpulseProvenance(s, tick);
      if (prov && prov.tag === RCS_PROVENANCE && (tick - prov.appliedTick) <= RCS_TRIGGER_MAXAGE_TICKS) {
        const def = WEAPON_BY_ID.get(prov.weaponId);
        const windowTicks = Math.max(1, Math.round((def && def.rcsDisruptS != null ? def.rcsDisruptS : RCS_DEFAULT_S) * 60));
        const until = prov.appliedTick + windowTicks;
        const cur = this._rcsDisrupt.get(s);
        if (!cur || until > cur.until) {
          this._rcsDisrupt.set(s, { until });
          if (!cur && this.bus) {
            this.bus.emit('presentation:vfxCue', {
              id: 'ship.rcsDisrupt', lane: 'combat', position: { x: s.pos.x, z: s.pos.z },
              particles: 14, lights: 1, magnitude: 1, material: 'ion', targetId: s.id, flashReduced: false,
            });
            this.bus.emit('audio:cue', { id: 'sfx_rcs_disrupt', position: { x: s.pos.x, z: s.pos.z }, gain: 0.5 });
          }
        }
      }
      const latch = this._rcsDisrupt.get(s);
      if (latch && tick > latch.until) this._rcsDisrupt.delete(s);
    }
  },

  _scheduleTumbleStatus(victim, durationS, data) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.statuses || !kernel.catalog) return false;
    const runtime = ensureCombatant(this.state, victim, kernel.catalog);
    const durationTicks = Math.max(1, Math.ceil(Math.max(0, durationS) * 60));
    const result = kernel.statuses.schedule(victim, runtime, {
      id: TUMBLE_STATUS_ID,
      stacks: 1,
      durationTicks,
      applyTick: this.state.tick,
      data,
    }, { attackerId: this.state.playerId, actionId: null });
    return !!(result && result.ok);
  },

  _clearTumbleStatus(victim, reason) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.catalog || !kernel.statuses || typeof kernel.statuses.clear !== 'function') return false;
    const runtime = ensureCombatant(this.state, victim, kernel.catalog);
    return kernel.statuses.clear(victim, runtime, TUMBLE_STATUS_ID, reason);
  },
};

function freezeTumbleAnnouncement(payload) {
  const provenance = payload.provenance && typeof payload.provenance === 'object'
    ? Object.freeze({ ...payload.provenance })
    : null;
  return Object.freeze({
    schemaVersion: 1,
    victimId: payload.victimId,
    attackerId: payload.attackerId == null ? null : payload.attackerId,
    source: payload.source,
    cause: payload.cause,
    deltaV: finite(payload.deltaV),
    hitSide: payload.hitSide === -1 ? -1 : 1,
    worldBody: payload.worldBody === true,
    k: finite(payload.k),
    mF: finite(payload.mF),
    u: finite(payload.u),
    spin: finite(payload.spin),
    durationS: finite(payload.durationS),
    startedAt: finite(payload.startedAt),
    until: finite(payload.until),
    provenance,
    tick: finite(payload.tick),
    time: finite(payload.time),
  });
}

function recoveryControl(entity, dt, kind) {
  const profile = resolveFlightProfile(entity);
  const propulsion = resolvePropulsionProfile(entity);
  const body = ensurePhysicsBodySpec(entity);
  const inertia = Math.max(0.1, finite(body && body.inertiaY, finite(profile.inertia, 1)));
  const authority = measureThrusterAuthority(entity);
  const yaw = clamp(finite(authority && authority.yaw, 1), 0, 1);
  const maxAlpha = positive(propulsion && propulsion.yawBrake, finite(profile.angularBrake, 8)) * Math.max(0.05, yaw);
  const error = -finite(entity.angVel, 0);
  const alpha = clamp(error / Math.max(dt, 1 / 120), -maxAlpha, maxAlpha);
  return {
    mode: 'tumbling',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0 + alpha * inertia, z: 0 },
    source: kind === MASSLINE_TUMBLE_KIND ? 'massline_tumble' : 'hitstun',
  };
}

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function isNpcDrifting(state, entity) {
  if (!entity || entity.alive === false || entity.id === state.playerId) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(entity.id)];
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

function entityById(state, id) {
  return state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) || null : null;
}

function massOf(entity) {
  return positive(entity && (entity.physicsBody && entity.physicsBody.mass || entity.mass), 1);
}

function numericParity(value) {
  if (Number.isFinite(value)) return Math.abs(Math.trunc(value)) % 2;
  const text = String(value == null ? '' : value);
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  return sum % 2;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
function positive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
