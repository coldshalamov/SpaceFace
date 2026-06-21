// Flight system: turns intent (player input or AI intent) into thrust/rotation, and owns the
// ship's orientation (yaw + bank). Semi-Newtonian: thrust along the nose + linear drag => soft
// terminal speed; momentum carries so the ship "flies" through space. Updates velocity + rotation;
// physics.integrate moves position (ARCHITECTURE §2.3 step 3). Rotation is OWNED HERE — physics
// no longer integrates e.rot (Phase 1 fix of the prior double-integration bug).
//
// CONTROL MODELS:
//   • PLAYER (new): ↑/W throttle forward, ←→ yaw the nose, mouse aims weapons independently.
//     The ship banks (rolls) into turns for a cinematic, weighty feel.
//   • NPC (unchanged contract): ai.js writes e.data.intent {moveX,moveZ,boost,fire,fireGroup,
//     aimAngle}; flight turns the nose toward aimAngle and thrusts along it. The 6-field intent
//     schema is FROZEN — do not break it or AI dogfighting stops working.
import {
  computeFlightFrame,
  resolveFlightProfile,
  settleBankPose,
  stepPhysicsDamping,
  stepNpcFlight,
  stepPlayerFlight,
} from '../core/flightDynamics.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { wrapAngle } from '../core/rng.js';

const ANG_VEL_DRAG = 2.2;     // per-second decay of yaw rate for drifting (intent-less) ships
const DASH_TAP_WINDOW = 0.18;  // Shift taps up to this duration become dash; longer holds boost.
const DEFAULT_BOOST_RESOURCE = Object.freeze({
  energy: 0,
  max: 0,
  drainRate: 40,
  regenRate: 18,
  dashImpulse: 0,
  dashCd: 3,
  dashCdT: 0,
});
const NEUTRAL_PLAYER_INPUT = Object.freeze({
  turnIntent: 0,
  moveX: 0,
  moveZ: 0,
  boost: false,
  controlsBlocked: true,
});

export const flight = {
  name: 'flight',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._resetRuntime();
    this._debugFlight = debugFlightEnabled();
    this._diag = {
      enabled: this._debugFlight,
      shipId: null,
      mode: 'assisted',
      flightClass: 'scout',
      speed: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      slipAngle: 0,
      yawRate: 0,
      targetYawRate: 0,
      assistStrength: 0,
      bank: 0,
      mass: 0,
      inertia: 0,
      physicsBackend: 'custom',
      tickMs: 0,
    };
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('save:loaded', () => {
        const player = this.state && this.state.entities && this.state.entities.get(this.state.playerId);
        this._cancelPlayerBoost(player);
      });
      this.bus.on('game:started', () => {
        const player = this.state && this.state.entities && this.state.entities.get(this.state.playerId);
        this._cancelPlayerBoost(player);
        this._resetRuntime();
      });
    }
    if (this._debugFlight && typeof window !== 'undefined') {
      window.__SF_FLIGHT_DIAGNOSTICS__ = {
        getReport: () => this._diag,
        snapshot: this._diag,
      };
    }
  },

  update(dt, state) {
    const t0 = nowMs();
    const player = state.entities.get(state.playerId);
    const dynamicAuthority = usesSg02DynamicAuthority(state);
    if (player && playerFlightSimActive(state, player)) {
      const controlsActive = playerFlightControlsActive(state, player);
      if (!controlsActive) this._cancelPlayerBoost(player);
      this.applyPlayerIntent(player, dt, controlsActive ? null : NEUTRAL_PLAYER_INPUT, { physicsAuthority: dynamicAuthority });
      // Emit boost start/stop on the TRUE transition (applyPlayerIntent already set flags.boosting
      // to the actual sustained-boost state above). The old code re-derived it from raw input.boost,
      // which desynced the audio loop and VFX trails whenever energy cut boost mid-hold.
      const wasBoosting = player._wasBoosting || false;
      if (player.flags.boosting && !wasBoosting) this.bus.emit('ship:boostStart', { shipId: player.id });
      else if (!player.flags.boosting && wasBoosting) this.bus.emit('ship:boostStop', { shipId: player.id });
      player._wasBoosting = player.flags.boosting;
    } else if (player) {
      // Not in active flight (paused/menu): still ease the bank back to level so it doesn't freeze tilted.
      settleBankPose(player, dt);
      this._cancelPlayerBoost(player);
    }
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      if (intent) this.applyIntent(e, intent, dt, { physicsAuthority: dynamicAuthority });
      else this.applyDrag(e, dt, { physicsAuthority: dynamicAuthority });
    }
    this._diag.tickMs = Math.max(0, nowMs() - t0);
    if (player) this._publishDiagnostics(player);
  },

  // ---- PLAYER: turn-nose + throttle + bank (mouse aims weapons, not the ship) ----
  applyPlayerIntent(e, dt, inputOverride = null, opts = {}) {
    normalizeFlightRuntime(e);
    const inp = inputOverride || this.state.input;
    const boost = normalizeBoostResource(e);

    // --- Phase 3 boost/dash ---
    // Tap Shift = DASH: an instant impulse along the nose on its own cooldown, costing a chunk of
    // boost energy. Hold Shift = SUSTAINED BOOST: drains energy continuously for +thrust/+top-speed.
    // The tap/hold split is important: a held boost must not spend most of its energy on the dash.
    // Boost cuts out below a threshold and can't restart until it regenerates back above it
    // (anti-flicker hysteresis). A ship with boost.max == 0 can't boost.
    if (boost.dashCdT > 0) boost.dashCdT = Math.max(0, boost.dashCdT - dt);
    const rawBoostHeld = !!inp.boost;
    const controlsBlocked = !!inp.controlsBlocked;
    const suppressBoost = !!this._suppressBoostUntilRelease;
    const boostHeld = rawBoostHeld && !suppressBoost;
    const boostWasHeld = !!this._prevBoost;
    if (boostHeld && !boostWasHeld) {
      boost._boostHoldT = 0;
      boost._dashCandidate = true;
    }
    if (boostHeld) {
      boost._boostHoldT = (boost._boostHoldT || 0) + dt;
      if (boost._boostHoldT > DASH_TAP_WINDOW) boost._dashCandidate = false;
    } else if (boostWasHeld) {
      const heldT = boost._boostHoldT || 0;
      if (boost._dashCandidate && heldT <= DASH_TAP_WINDOW) {
        this._triggerDash(e, boost, opts);
      }
      boost._boostHoldT = 0;
      boost._dashCandidate = false;
    }
    if (!rawBoostHeld && suppressBoost && !controlsBlocked) this._suppressBoostUntilRelease = false;
    this._prevBoost = boostHeld;

    // sustained boost: only while holding Shift (and not just having dashed), with hysteresis gating
    if (!('_boostArmed' in boost)) boost._boostArmed = true;
    let boosting = false;
    if (boostHeld && boost.max > 0) {
      if (boost._boostArmed && boost.energy > 1) {
        boosting = true;
        boost.energy = Math.max(0, boost.energy - boost.drainRate * dt);
        if (boost.energy <= 0) boost._boostArmed = false;   // cut out; must regen to re-arm
      }
    } else if (boost.energy > boost.max * 0.35) {
      boost._boostArmed = true;                              // re-arm threshold (hysteresis)
    }
    if (!boosting) boost.energy = Math.min(boost.max, boost.energy + boost.regenRate * dt);
    e.flags.boosting = boosting;

    const profile = resolveFlightProfile(e, this.state);
    stepPlayerFlight(e, inp, dt, profile, { boosting, physicsAuthority: opts.physicsAuthority, source: 'player-flight' });
  },

  _triggerDash(e, boost, opts = {}) {
    if (!(boost.dashImpulse > 0) || boost.dashCdT > 0 || boost.energy < boost.dashImpulse * 0.6) return false;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const imp = boost.dashImpulse;
    if (opts.physicsAuthority) {
      const mass = positiveMass(e);
      queuePhysicsImpulse(e, { x: cf * imp * mass, y: 0, z: sf * imp * mass });
    }
    else {
      e.vel.x += cf * imp;
      e.vel.z += sf * imp;
    }
    boost.energy = Math.max(0, boost.energy - boost.dashImpulse * 0.6);
    boost.dashCdT = boost.dashCd;
    this.bus.emit('ship:dash', { shipId: e.id, impulse: imp });
    return true;
  },

  _resetRuntime() {
    this._prevBoost = false;
    this._suppressBoostUntilRelease = false;
  },

  _cancelPlayerBoost(e) {
    const boost = e && e.boost;
    const hadGesture = !!(this._prevBoost || (boost && (boost._dashCandidate || boost._boostHoldT > 0)) || (e && e.flags && e.flags.boosting));
    if (hadGesture) this._suppressBoostUntilRelease = true;
    this._prevBoost = false;
    if (boost) {
      boost._boostHoldT = 0;
      boost._dashCandidate = false;
    }
    if (!e || !e.flags) return;
    const wasBoosting = !!(e.flags.boosting || e._wasBoosting);
    e.flags.boosting = false;
    e._wasBoosting = false;
    if (wasBoosting && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ship:boostStop', { shipId: e.id });
    }
  },

  // ---- NPC: turn toward aimAngle + thrust along ship-relative axes (unchanged contract) ----
  applyIntent(e, intent, dt, opts = {}) {
    normalizeFlightRuntime(e);
    e.flags.boosting = !!intent.boost;
    stepNpcFlight(e, intent, dt, resolveFlightProfile(e, this.state), {
      physicsAuthority: opts.physicsAuthority,
      source: 'npc-flight',
    });
  },

  // Linear-only drag for intent-less drifters. Also decays yaw rate so a ship that lost its pilot
  // stops spinning (the old code never damped angVel — physics kept rotating it forever).
  applyDrag(e, dt, opts = {}) {
    normalizeFlightRuntime(e);
    if (opts.physicsAuthority) {
      stepPhysicsDamping(e, dt, resolveFlightProfile(e, this.state), {
        source: 'flight-drift-damping',
        angularDrag: ANG_VEL_DRAG,
      });
      return;
    }
    const drag = e.drag || 1.2;
    e.vel.x -= drag * e.vel.x * dt;
    e.vel.z -= drag * e.vel.z * dt;
    e.angVel -= ANG_VEL_DRAG * e.angVel * dt;
    e.rot = wrapAngle(e.rot + e.angVel * dt); // keep applying residual spin as it decays
    this._settleBank(e, dt);
  },

  // Ease bank back to level (used when a ship has no active input — paused, menu, drifting NPC).
  _settleBank(e, dt) {
    settleBankPose(e, dt);
  },

  _publishDiagnostics(player) {
    const frame = player._flightFrame || computeFlightFrame(player, resolveFlightProfile(player, this.state));
    const gameplay = (this.state.settings && this.state.settings.gameplay) || {};
    Object.assign(this._diag, {
      shipId: player.id,
      mode: frame.mode || 'assisted',
      flightClass: frame.flightClass || 'scout',
      speed: frame.speed || 0,
      forwardSpeed: frame.forwardSpeed || 0,
      lateralSpeed: frame.lateralSpeed || 0,
      slipAngle: frame.slipAngle || 0,
      yawRate: frame.yawRate || player.angVel || 0,
      targetYawRate: frame.targetYawRate || 0,
      assistStrength: frame.assistStrength || 0,
      bank: frame.bank || player.bank || 0,
      mass: frame.mass || 0,
      inertia: frame.inertia || 0,
      physicsBackend: gameplay.physicsBackend || 'custom',
    });
    this.state.flightRuntime = this.state.flightRuntime || {};
    this.state.flightRuntime.diagnostics = this._diag;
  },
};

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function debugFlightEnabled() {
  if (typeof location === 'undefined') return false;
  try { return new URLSearchParams(location.search).get('debug') === 'flight'; }
  catch (_) { return false; }
}

function playerFlightSimActive(state, player) {
  if (!player || state.mode !== 'flight') return false;
  if (player.flags && player.flags.docked) return false;
  return true;
}

function playerFlightControlsActive(state, player) {
  if (!playerFlightSimActive(state, player)) return false;
  const ui = state.ui || {};
  const stack = Array.isArray(ui.screenStack) ? ui.screenStack : (Array.isArray(ui.screens) ? ui.screens : []);
  return !ui.docked && stack.length === 0;
}

function usesSg02DynamicAuthority(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  return gameplay && gameplay.physicsBackend === 'rapier-dynamic';
}

function normalizeFlightRuntime(e) {
  if (!e.flags || typeof e.flags !== 'object') e.flags = {};
  if (!e.vel || typeof e.vel !== 'object') e.vel = { x: 0, z: 0 };
  if (!Number.isFinite(e.vel.x)) e.vel.x = 0;
  if (!Number.isFinite(e.vel.z)) e.vel.z = 0;
}

function normalizeBoostResource(e) {
  let boost = e.boost;
  if (!boost || typeof boost !== 'object' || Array.isArray(boost)) {
    boost = Object.assign({}, DEFAULT_BOOST_RESOURCE);
    e.boost = boost;
    return boost;
  }

  const energyHint = Number.isFinite(boost.energy) ? Math.max(0, boost.energy) : null;
  const maxHint = Number.isFinite(boost.max) ? Math.max(0, boost.max) : null;
  const max = maxHint != null ? maxHint : (energyHint != null ? energyHint : DEFAULT_BOOST_RESOURCE.max);

  boost.max = max;
  boost.energy = Math.min(max, energyHint != null ? energyHint : max);
  boost.drainRate = finiteNonNegative(boost.drainRate, DEFAULT_BOOST_RESOURCE.drainRate);
  boost.regenRate = finiteNonNegative(boost.regenRate, DEFAULT_BOOST_RESOURCE.regenRate);
  boost.dashImpulse = finiteNonNegative(boost.dashImpulse, DEFAULT_BOOST_RESOURCE.dashImpulse);
  boost.dashCd = finiteNonNegative(boost.dashCd, DEFAULT_BOOST_RESOURCE.dashCd);
  boost.dashCdT = Math.min(boost.dashCd, finiteNonNegative(boost.dashCdT, DEFAULT_BOOST_RESOURCE.dashCdT));
  if ('_boostHoldT' in boost && !Number.isFinite(boost._boostHoldT)) boost._boostHoldT = 0;
  if ('_dashCandidate' in boost && typeof boost._dashCandidate !== 'boolean') boost._dashCandidate = false;
  if ('_boostArmed' in boost && typeof boost._boostArmed !== 'boolean') boost._boostArmed = true;
  return boost;
}

function finiteNonNegative(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function positiveMass(e) {
  const authored = e && e.physicsBody && e.physicsBody.mass;
  if (Number.isFinite(authored) && authored > 0) return authored;
  if (Number.isFinite(e && e.mass) && e.mass > 0) return e.mass;
  return 1;
}
