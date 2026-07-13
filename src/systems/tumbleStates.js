// Tumble states (Wave M2 §3.4, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The payoff that makes flinging matter without requiring kills: a ship whipped past what its
// attitude thrusters can counter enters an uncontrolled spin — can't aim, can't burn — until its
// RCS (modeled by the shipped rapier angularDamping) physically bleeds the rotation off. Scales
// with mass ratio for free (heavy flicks light), and the entry spin is a REAL angular impulse
// through the physics-authority command membrane, never a direct body write.
//
// Player-side only power (design principle 2): tumbles are caused exclusively by the player's
// massline (throw releases and whip impacts). THE PLAYER SHIP NEVER TUMBLES on any path here.
//
// Runs AFTER aiPorts in UPDATE_ORDER so its zero-control overwrite is the last writer before
// physics consumes the command; runs BEFORE weapons so a cleared fire intent gates this tick's
// shots. Not in the sf-sim harness; every path also gates on massline2Flag('tumble').
import { massline2Flag } from '../data/featureFlags.js';
import {
  ensurePhysicsBodySpec,
  measureThrusterAuthority,
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../core/physicsAuthority.js';
import { resolveFlightProfile } from '../core/flightDynamics.js';
import { ensureCombatant } from '../combat/runtime.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const TUMBLE_MIN_S = 1.5;             // duration clamp
const TUMBLE_MAX_S = 6;
const TUMBLE_RECOVER_OMEGA = 1.1;     // rad/s — below this the RCS has "caught" the spin
const TUMBLE_SPIN_MULT = 2.2;         // entry spin as a multiple of the victim's max yaw rate
const TUMBLE_THROW_MIN_SPEED = 60;    // wu/s — a thrown ship below this was not really whipped
const TUMBLE_MASS_RATIO_MIN = 0.5;    // sqrt(player/victim) clamp — heavy victims resist
const TUMBLE_MASS_RATIO_MAX = 2.2;

const TUMBLE_CONTROL = Object.freeze({
  mode: 'tumbling',
  force: Object.freeze({ x: 0, y: 0, z: 0 }),
  torque: Object.freeze({ x: 0, y: 0, z: 0 }),
  source: 'massline_tumble',
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
    if (!massline2Flag('tumble') || state.mode !== 'flight') return;
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;
    const now = finite(state.simTime, state.tick / 60);

    for (const e of entities.values()) {
      const tumble = e && e.data && e.data.tumble;
      if (!tumble) continue;
      if (!e.alive) { delete e.data.tumble; continue; }

      const spin = Math.abs(finite(e.angVel, 0));
      const elapsed = now - finite(tumble.startedAt, now);
      const recovered = elapsed >= TUMBLE_MIN_S && spin <= TUMBLE_RECOVER_OMEGA;
      if (recovered || now >= tumble.until) {
        this._expireTumbleStatus(e);
        delete e.data.tumble;
        if (this.bus) this.bus.emit('massline:tumbleEnd', { victimId: e.id, durationS: elapsed });
        continue;
      }

      // Suppress this tick's control and fire. writePhysicsControl replaces the command aiPorts
      // queued earlier in the tick (last-writer-wins by design of the command membrane), so the
      // hull is genuinely uncontrolled while the spin decays through the body's angularDamping.
      writePhysicsControl(e, TUMBLE_CONTROL);
      if (e.data.intent) {
        e.data.intent.fire = false;
        e.data.intent.moveX = 0;
        e.data.intent.moveZ = 0;
      }
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
    if (victim.data.tumble) return;                                 // already tumbling

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
    queuePhysicsTorqueImpulse(victim, { x: 0, y: inertia * (sign * targetSpin - currentSpin), z: 0 });

    // Duration is a clamp around the physical decay (angularDamping ~0.4/s gives ln(spin/recover)
    // / 0.4 seconds); update() ends the state early the moment the spin is genuinely caught.
    const expected = Math.log(Math.max(1.5, targetSpin / TUMBLE_RECOVER_OMEGA)) / 0.4;
    const until = now + clamp(expected, TUMBLE_MIN_S, TUMBLE_MAX_S);
    victim.data.tumble = { startedAt: now, until, cause, spin: targetSpin };
    // Durable stamp for the pirateDisengage morale window (outlives the tumble itself).
    victim.data.tumbledAt = now;
    this._scheduleTumbleStatus(victim, until - now);

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

  _scheduleTumbleStatus(victim, durationS) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.statuses || !kernel.catalog) return false;
    const runtime = ensureCombatant(this.state, victim, kernel.catalog);
    const durationTicks = Math.max(1, Math.ceil(Math.max(0, durationS) * 60) + 1);
    const result = kernel.statuses.schedule(victim, runtime, {
      id: 'status_tumbling',
      stacks: 1,
      durationTicks,
      applyTick: this.state.tick + 1,
    }, { attackerId: this.state.playerId, actionId: null });
    return !!(result && result.ok);
  },

  _expireTumbleStatus(victim) {
    const kernel = combatKernel(this);
    if (!kernel || !kernel.catalog) return;
    const runtime = ensureCombatant(this.state, victim, kernel.catalog);
    const active = runtime.statuses && runtime.statuses.status_tumbling;
    // actions/prePhysics already ran this tick. Expire at the current tick so the next
    // prePhysics pass removes/recomputes the status before accepting another action request.
    if (active) active.expiresTick = Math.min(active.expiresTick, this.state.tick);
  },
};

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
