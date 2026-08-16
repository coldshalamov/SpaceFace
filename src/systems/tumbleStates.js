// Tumble states (Wave M2 §3.4, design/revamp/MASSLINE_PHYSICS_IDENTITY.md; AC-04).
//
// The payoff that makes flinging matter without requiring kills: a ship whipped past what its
// attitude thrusters can counter enters an uncontrolled spin — can't aim, can't burn — until its
// RCS (modeled by the shipped rapier angularDamping) physically bleeds the rotation off. Scales
// with mass ratio for free (heavy flicks light), and the entry spin is a REAL angular impulse
// through the physics-authority command membrane, never a direct body write.
//
// AC-04: this file owns the Massline *entry*, but it is the single zero-control/recovery owner for
// EVERY canonical tumble source (Massline, physical contact, authored weapon impulse). Producers
// keep their own admission gates and their own entry geometry; each writes a distinct kind into the
// shared `status_tumbling` record, and this loop honors any supported kind while preserving that
// provenance in the physics command it writes. Nothing here relabels a contact or weapon tumble as
// Massline, and nothing here reads a feature flag on a source's behalf — a status that exists was
// already admitted by its own gated producer.
//
// THE PLAYER SHIP NEVER TUMBLES on any path here.
// The same last-writer slot also enforces NPC Drifting when the canonical combat runtime reports a
// destroyed drive: zero continuous authority, with existing velocity and external forces untouched.
//
// Runs AFTER aiPorts in UPDATE_ORDER so its zero-control overwrite is the last writer before
// physics consumes the command; runs BEFORE weapons so a cleared fire intent gates this tick's
// shots. Not in the sf-sim harness; the Massline entry paths gate on massline2Flag('tumble').
import { massline2Flag } from '../data/featureFlags.js';
import {
  ensurePhysicsBodySpec,
  measureThrusterAuthority,
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';
import { ensureCombatant } from '../combat/runtime.js';
import {
  describeTumbleStatus,
  MASSLINE_TUMBLE_KIND,
  readTumbleStatus,
  resolveTumbleEntry,
  TUMBLE_KIND_SOURCES,
  TUMBLE_STATUS_ID,
} from '../combat/tumbleStatus.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const TUMBLE_MIN_S = 1.5;             // duration clamp
const TUMBLE_MAX_S = 6;
const TUMBLE_RECOVER_OMEGA = 1.1;     // rad/s — below this the RCS has "caught" the spin
const TUMBLE_SPIN_MULT = 2.2;         // entry spin as a multiple of the victim's max yaw rate
const TUMBLE_THROW_MIN_SPEED = 60;    // wu/s — a thrown ship below this was not really whipped
const TUMBLE_MASS_RATIO_MIN = 0.5;    // sqrt(player/victim) clamp — heavy victims resist
const TUMBLE_MASS_RATIO_MAX = 2.2;

const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
// One control-loss mode ("tumbling") for every source, one physics-command `source` per source so
// the membrane keeps the provenance instead of attributing every tumble to the Massline.
const TUMBLE_CONTROLS = Object.freeze(Object.fromEntries(
  Object.keys(TUMBLE_KIND_SOURCES).map((kind) => [kind, Object.freeze({
    mode: 'tumbling',
    force: ZERO_VECTOR,
    torque: ZERO_VECTOR,
    source: kind,
  })]),
));
const DRIFT_CONTROL = Object.freeze({
  mode: 'drifting',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'drive_disabled',
});

export const tumbleStates = {
  id: 'tumbleStates',
  name: 'tumbleStates',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:whipImpact', (p) => this._onWhipImpact(p || {})));
      this._unsubs.push(this.bus.on('massline:throw', (p) => this._onThrow(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const now = finite(state.simTime, state.tick / 60);

    for (const e of entities.values()) {
      // Any supported tumble kind — Massline, contact, or authored weapon impulse — lands here.
      const tumble = e ? readTumbleStatus(state, e) : null;
      const drifting = isNpcDrifting(state, e);
      if (!tumble && !drifting) continue;

      let record = tumble ? describeTumbleStatus(tumble) : null;
      if (record && (!e.alive || e.id === state.playerId)) {
        // Hard player immunity, enforced at the shared owner as well as at every producer.
        this._clearTumbleStatus(e, e.alive ? 'player_immune' : 'entity_dead');
        record = null;
      }
      if (!e.alive) continue;

      if (record) {
        // Recovery is real spin decay first (the RCS physically caught the rotation), with the
        // authored window as the outer bound. Clearing the status is the whole recovery: no
        // rotation, angular-velocity, or velocity write ever happens on this path.
        const spin = Math.abs(finite(e.angVel, 0));
        const elapsed = now - finite(record.startedAt, now);
        const recovered = elapsed >= TUMBLE_MIN_S && spin <= TUMBLE_RECOVER_OMEGA;
        if (recovered || now >= finite(record.until, now)) {
          this._clearTumbleStatus(e, recovered ? 'rcs_recovered' : 'duration_elapsed');
          this._emitTumbleEnd(e, record, elapsed, recovered);
          record = null;
        }
      }
      if (!record && !drifting) continue;

      // Suppress this tick's drive authority. writePhysicsControl replaces the command aiPorts
      // queued earlier in the tick (last-writer-wins by design of the command membrane), while
      // leaving collision, field, tether, and other external impulses intact. A destroyed drive
      // therefore drifts ballistically instead of receiving hidden braking or station-keeping.
      writePhysicsControl(e, record ? TUMBLE_CONTROLS[record.kind] : DRIFT_CONTROL);
      if (e.data && e.data.intent) {
        if (record) e.data.intent.fire = false;
        e.data.intent.moveX = 0;
        e.data.intent.moveZ = 0;
        if (drifting) {
          e.data.intent.boost = false;
          e.data.intent.brake = false;
        }
      }
    }
  },

  _emitTumbleEnd(entity, record, durationS, recovered) {
    if (!this.bus) return;
    this.bus.emit('combat:tumbleEnd', {
      victimId: entity.id,
      kind: record.kind,
      source: record.source,
      cause: record.cause,
      durationS,
      recovered,
    });
    // Massline consumers (feel, aceMemory, check-massline2) keep their existing, source-specific
    // event; a contact or weapon-impulse tumble must never arrive on the Massline channel.
    if (record.kind === MASSLINE_TUMBLE_KIND) {
      this.bus.emit('massline:tumbleEnd', { victimId: entity.id, durationS });
    }
  },

  _onThrow(payload) {
    const state = this.state;
    if (!massline2Flag('tumble') || !state) return;
    const victim = state.entities && state.entities.get ? state.entities.get(payload.payloadId) : null;
    if (!Number.isFinite(payload.payloadSpeed) || payload.payloadSpeed < TUMBLE_THROW_MIN_SPEED) return;
    this._beginTumble(victim, 'thrown');
  },

  _onWhipImpact(payload) {
    const state = this.state;
    if (!massline2Flag('tumble') || !state) return;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return;
    const victim = state.entities && state.entities.get ? state.entities.get(payload.victimId) : null;
    this._beginTumble(victim, 'struck');
  },

  _beginTumble(victim, cause) {
    const state = this.state;
    if (!victim || victim.alive === false || !victim.data) return;
    if (victim.id === state.playerId) return;                       // players never tumble
    if (victim.type !== 'ship' && victim.type !== 'drone') return;  // rocks/stations don't flail

    const player = state.entities.get(state.playerId);
    const now = finite(state.simTime, state.tick / 60);

    // "Out-torqued their RCS", made measurable: the entry spin targets a multiple of the victim's
    // own commandable yaw rate, scaled by the mass advantage of the flinger, and it is delivered
    // as a real angular impulse (inertia × Δω) that the ship's angularDamping must bleed off.
    const profile = resolveFlightProfile(victim, state);
    const authority = measureThrusterAuthority(victim);
    const body = ensurePhysicsBodySpec(victim);
    const inertia = Math.max(0.1, finite(body && body.inertiaY, finite(profile.inertia, 1)));
    const massRatio = player
      ? clamp(Math.sqrt(Math.max(0.1, finite(player.mass, 1)) / Math.max(0.1, finite(victim.mass, 1))), TUMBLE_MASS_RATIO_MIN, TUMBLE_MASS_RATIO_MAX)
      : 1;
    const yawAuthority = Math.max(0.15, finite(authority && authority.yaw, 1));
    const targetSpin = TUMBLE_SPIN_MULT * Math.max(0.8, finite(profile.maxYawRate, 3)) * massRatio / yawAuthority;
    const currentSpin = finite(victim.angVel, 0);
    const sign = currentSpin !== 0 ? Math.sign(currentSpin) : (Math.sign(victim.id % 2 === 0 ? 1 : -1));
    // Duration is a clamp around the physical decay (angularDamping ~0.4/s gives ln(spin/recover)
    // / 0.4 seconds); update() ends the state early the moment the spin is genuinely caught.
    const expected = Math.log(Math.max(1.5, targetSpin / TUMBLE_RECOVER_OMEGA)) / 0.4;
    const requestedS = clamp(expected, TUMBLE_MIN_S, TUMBLE_MAX_S);
    // Shared admission: the Massline never restarts its own spin, and taking the state over from a
    // contact/impulse tumble may not shorten the window that hull already owns.
    const entry = resolveTumbleEntry(state, victim, {
      kind: MASSLINE_TUMBLE_KIND,
      durationTicks: Math.max(1, Math.ceil(Math.max(0, requestedS) * 60) + 1),
      tick: state.tick,
    });
    if (!entry) return;
    const durationS = entry.takeoverFromKind
      ? Math.max(requestedS, entry.durationTicks / 60)
      : requestedS;
    const until = now + durationS;
    const scheduled = this._scheduleTumbleStatus(victim, entry.durationTicks, {
      kind: entry.kind,
      source: entry.source,
      startedAt: now,
      until,
      cause,
      spin: targetSpin,
    });
    if (!scheduled) return;

    queuePhysicsTorqueImpulse(victim, { x: 0, y: inertia * (sign * targetSpin - currentSpin), z: 0 });
    // Durable stamp for the pirateDisengage morale window (outlives the tumble itself).
    victim.data.tumbledAt = now;

    if (this.bus) {
      this.bus.emit('massline:tumbled', {
        victimId: victim.id, cause, spin: targetSpin,
        durationS: until - now, tick: state.tick, time: now,
      });
      this.bus.emit('audio:cue', { id: 'massline.tumble', position: { x: victim.pos.x, z: victim.pos.z } });
      this.bus.emit('presentation:vfxCue', {
        id: 'ship.tumble', lane: 'massline_tumble',
        pos: { x: victim.pos.x, z: victim.pos.z },
        particles: 16, lights: 1,
      });
    }
  },

  _scheduleTumbleStatus(victim, durationTicks, data) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.statuses || !kernel.catalog) return false;
    const runtime = ensureCombatant(this.state, victim, kernel.catalog);
    const result = kernel.statuses.schedule(victim, runtime, {
      id: TUMBLE_STATUS_ID,
      stacks: 1,
      durationTicks,
      applyTick: this.state.tick + 1,
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

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
