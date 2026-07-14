// SpaceFace Flight V3 — production adapter.
//
// Drop-in intent: replace the registry's import of src/systems/flight.js with this
// module after `rapier-dynamic` is the migrated default. This adapter never writes
// entity position, velocity, rotation or angular velocity. It writes force/torque/
// impulse commands through the SG-02 physics authority membrane.
//
// The player boost/dash subsystem (resource energy, tap-vs-hold, hysteresis arming, dash impulse,
// ship:boostStart/Stop + ship:dash events) is ported from src/systems/flight.js so the V3 swap does
// not drop the dash mechanic, HUD boost bar, VFX/audio, or save parity. NPCs use only the boolean
// intent.boost (no resource model), exactly as in the legacy controller — AI never used e.boost.

import { queuePhysicsImpulse, writePhysicsControl } from '../core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../core/flight/propulsionKernel.js';
import { computeFlightTelemetry, solveIntercept } from '../core/flight/flightTelemetry.js';
import { massline2Flag } from '../data/featureFlags.js';

// Coordinated banking: roll follows the ACTUAL turn state (yaw rate × forward speed), not the
// stick. A ship carving at speed rolls into the turn like an aircraft; the same ship pivoting
// at a standstill is an RCS rotation and barely rolls. Roll-in is slower than roll-out so the
// hull reads as a mass being levered over, not a sprite flipping.
// Overnight B1: standstill RCS pivots barely roll (was reading as pin-spin). Carve bank is
// smoother and caps lower so top-down reads as lean, not secondary spin axis.
const BANK_RESPONSE = 5.2;       // rad/s ease-in while rolling into a turn
const BANK_RETURN = 10.5;        // rad/s ease-out back to wings-level
const DEFAULT_BANK_MAX = 0.42;
const BANK_SPEED_REF = 100;      // forward wu/s at which the carve gets full roll authority
const BANK_RATE_GAIN = 0.22;     // rad of roll per rad/s of yaw at full authority
const BANK_STANDSTILL = 0.06;    // fraction of roll authority left for standstill RCS pivots
export const FLIGHT_BANK_TUNING = Object.freeze({
  BANK_RESPONSE, BANK_RETURN, DEFAULT_BANK_MAX, BANK_SPEED_REF, BANK_RATE_GAIN, BANK_STANDSTILL,
});

// NPC actuator lag: AI intents are desires, but throttle plates and fuel pumps take real time to
// swing. Slewing the commanded translation inputs (~0.4 s for a full flip) is what turns the old
// stop-zip-stop twitch into inertial, machine-like motion — without touching any AI logic.
// Turn stays sharp: NPC yaw already goes through the torque-limited yaw controller.
const NPC_INPUT_SLEW = 2.6;      // per second, throttle and strafe
const AUTOPURSUIT_TURN_SOFT_ANGLE = 0.48;
const AUTOPURSUIT_FOLLOW_MIN = 180;
const AUTOPURSUIT_FOLLOW_MAX = 320;
const AUTOPURSUIT_FOLLOW_DIST = 250;
// Falling far behind the tail slot latches auto-boost (hysteresis so it never flickers);
// the kernel's governor lifts the assisted speed cap by boostSpeedMult while boost is held,
// which is what lets pursuit actually run down a fleeing, boosting target.
const AUTOPURSUIT_BOOST_ENGAGE = 520;
const AUTOPURSUIT_BOOST_RELEASE = 400;
const AUTOPURSUIT_CLOSE_GAIN = 0.82;
const AUTOPURSUIT_MATCH_GAIN = 0.90;
const AUTOPURSUIT_PROJECTILE_HINT = 360;
const AUTOPURSUIT_MANUAL_STRAFE_BLEND = 0.65;
const AUTOPILOT_TURN_SOFT_ANGLE = 0.62;
const AUTOPILOT_ARRIVAL_RADIUS = 38;
const AUTOPILOT_MAX_LOOKAHEAD = 760;
const AUTOPILOT_MIN_LOOKAHEAD = 180;
const AUTOPILOT_CAPTURE_SPEED_FRACTION = 0.72;
const AUTOPILOT_CAPTURE_ALIGNMENT = 0.58;
const TETHER_HELM_MAX_YAW_RATE_MULT = 1.14;
const TETHER_HELM_STRAIN_MULT = 1.75;
const TETHER_HELM_PHASE_MULT = Object.freeze({
  capture: 4.2,
  loaded: 6.0,
  overload: 7.4,
});

// MASSLINE flight-lane handoff. A sling tag does not grant speed: it only tells the assisted
// governor that the current overspeed came from an external physics verb, so the governor may
// spend it slowly instead of treating it as ordinary thruster overspeed. Cloaking similarly
// weakens neutral counter-thrust only while the pilot is genuinely coasting; explicit brake and
// any translation input keep full authority.
const MASSLINE_SLING_TAG_S = 1.0;
const MASSLINE_SLING_DECAY_TAU_S = 6.0;
const MASSLINE_EARNED_ASSIST_SCALE = 0.24;
const CLOAK_COAST_ASSIST_SCALE = 0.28;
export const MASSLINE_FLIGHT_TUNING = Object.freeze({
  MASSLINE_SLING_TAG_S,
  MASSLINE_SLING_DECAY_TAU_S,
  MASSLINE_EARNED_ASSIST_SCALE,
  CLOAK_COAST_ASSIST_SCALE,
});

// Boost/dash tuning — mirrors src/systems/flight.js so player feel is identical under V3.
const DASH_TAP_WINDOW = 0.32;  // Shift taps up to this duration become dash; longer holds boost.
const DEFAULT_BOOST_RESOURCE = Object.freeze({
  energy: 0,
  max: 0,
  drainRate: 40,
  regenRate: 18,
  dashImpulse: 0,
  dashCost: 28,
  dashCd: 3,
  dashCdT: 0,
});
const NEUTRAL_INPUT = Object.freeze({ moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false });
const SG02_INPUT_DT = 1 / 60;   // fixed-step fallback for normalizeCraftInput's slew

export const flightV3 = {
  name: 'flight',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._warnedBackend = false;
    // Boost gesture tracking (player only). `_prevBoost`/`_suppressBoostUntilRelease` mirror
    // src/systems/flight.js so a held key does not re-boost immediately after a menu dismiss.
    this._prevBoost = false;
    this._suppressBoostUntilRelease = false;
    this._masslineSlingUntil = 0;
    this._diag = {
      version: 3,
      shipId: null,
      driveId: null,
      family: null,
      mode: 'assisted',
      assistMode: 'assisted',
      assistStrength: 0,
      speed: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      driftAngle: 0,
      stopDistance: 0,
      stopTimeS: 0,
      tickMs: 0,
      physicsBackend: null,
    };

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('save:loaded', () => { this._masslineSlingUntil = 0; this._sanitizeAllRuntime(); this._cancelPlayerBoostOnRestore(); this._setFlightMode('manual', 'load'); });
      this.bus.on('game:started', () => { this._masslineSlingUntil = 0; this._sanitizeAllRuntime(); this._cancelPlayerBoostOnRestore(); this._setFlightMode('manual', 'new-game'); });
      this.bus.on('tether:latched', () => this._setFlightMode('manual', 'tether'));
      this.bus.on('massline:selfSling', () => {
        if (!massline2Flag('throw')) return;
        const now = finite(this.state && this.state.simTime, 0);
        this._masslineSlingUntil = Math.max(this._masslineSlingUntil, now + MASSLINE_SLING_TAG_S);
      });
    }
    if (typeof window !== 'undefined') {
      window.__SF_FLIGHT_V3__ = {
        snapshot: this._diag,
        getReport: () => ({ ...this._diag }),
      };
    }
  },

  update(dt, state) {
    const t0 = nowMs();
    const backend = state.settings && state.settings.gameplay && state.settings.gameplay.physicsBackend;
    this._diag.physicsBackend = backend || 'custom';

    if (backend !== 'rapier-dynamic') {
      // Do not silently fall back to velocity edits: that would destroy the single-
      // authority contract this system exists to establish.
      if (!this._warnedBackend) {
        this._warnedBackend = true;
        console.warn('[flight-v3] waiting for rapier-dynamic physics authority; no craft motion commands emitted');
      }
      this._settleAllBanks(dt, state);
      this._diag.tickMs = Math.max(0, nowMs() - t0);
      return;
    }
    this._warnedBackend = false;

    const player = state.entities && state.entities.get(state.playerId);
    if (player && playerFlightSimActive(state, player)) {
      const active = playerFlightControlsActive(state, player);
      if (!active) this._cancelPlayerBoost(player);
      const raw = active ? state.input : neutralInput();
      this._stepCraft(player, raw, dt, state, true);
      // Emit boost start/stop on the TRUE transition. _stepCraft set flags.boosting to the
      // resource-gated value; re-deriving it from raw input would desync audio/VFX when energy
      // cuts boost mid-hold (same fix as the legacy controller, src/systems/flight.js:95-101).
      const wasBoosting = player._wasBoosting || false;
      if (player.flags.boosting && !wasBoosting) this.bus.emit('ship:boostStart', { shipId: player.id });
      else if (!player.flags.boosting && wasBoosting) this.bus.emit('ship:boostStop', { shipId: player.id });
      player._wasBoosting = player.flags.boosting;
    } else if (player) {
      settleBank(player, dt);
      this._cancelPlayerBoost(player);
    }

    for (const entity of flightCraftCandidates(state)) {
      if (!entity || entity.id === state.playerId || entity.alive === false) continue;
      if (entity.type !== 'ship' && entity.type !== 'drone') continue;
      const intent = entity.data && entity.data.intent;
      if (intent) this._stepCraft(entity, intent, dt, state, false);
      else this._stepCraft(entity, neutralInput(), dt, state, false);
    }

    this._diag.tickMs = Math.max(0, nowMs() - t0);
    if (player) this._publishPlayerDiagnostics(player, state);
  },

  _stepCraft(entity, rawInput, dt, state, isPlayer) {
    const baseProfile = resolvePropulsionProfile(entity, state);
    const runtime = propulsionRuntime(entity, baseProfile);
    let input = normalizeCraftInput(entity, rawInput, runtime, state, isPlayer, dt);
    const helm = tetherHelmAuthority(state, isPlayer);
    const profile = helm.mult > 1 ? applyTetherHelmProfile(baseProfile, helm) : baseProfile;
    let pursuit = null;
    let autopilot = null;
    if (isPlayer) {
      autopilot = resolveAutopilotInput(this, entity, rawInput, input, dt, state, profile);
      if (autopilot && autopilot.input) {
        input = autopilot.input;
      } else {
        pursuit = resolveAutopursuitInput(entity, input, dt, state, profile);
        if (pursuit && pursuit.input) input = pursuit.input;
      }
      if (!(autopilot && autopilot.active) && !(pursuit && pursuit.active)) {
        input = applyTetherNoseAssist(entity, input, state);
        if (state.flight) state.flight.pursuitBoostLatch = false;   // latch dies with the pursuit
      }
      this._syncPlayerFlightMode(state, pursuit, autopilot);
    }

    // Player boost/dash subsystem (port of src/systems/flight.js:118-188). Runs before
    // stepPropulsion so the resource-gated boost state feeds the propulsion kernel's thrust
    // scaling, and so the dash impulse is queued through physics authority this tick.
    // While the flight computer owns the boost key (pursuit auto-boost / autopilot cruise),
    // tap-dash detection is suppressed: a machine "tapping" Shift must never fire a dash.
    let boosting = input.boost;
    if (isPlayer) {
      const autoBoost = !!((pursuit && pursuit.active) || (autopilot && autopilot.active));
      boosting = this._stepPlayerBoost(entity, input.boost, dt, state, { suppressDash: autoBoost });
      input.boost = boosting;
      applyMasslineFlightModifiers(input, state, this._masslineSlingUntil);
    }

    const body = bodySnapshot(entity, profile);
    const result = stepPropulsion({
      dt,
      body,
      input,
      profile,
      runtime,
      environment: resolveFlightEnvironment(entity, state),
    });
    const tetherAssistTorque = isPlayer ? tetherNoseAssistTorque(body, input, profile) : 0;
    const torque = tetherAssistTorque
      ? { ...result.torque, y: finite(result.torque && result.torque.y) + tetherAssistTorque }
      : result.torque;

    writePhysicsControl(entity, {
      source: isPlayer ? 'player-flight-v3' : 'npc-flight-v3',
      mode: input.assistMode,
      force: result.force,
      torque,
      maxSpeed: result.maxSpeed,
    });
    if (result.impulse) queuePhysicsImpulse(entity, result.impulse);

    entity.data = entity.data || {};
    assignPropulsionRuntime(entity, result.runtime, input.boost);
    entity.flags = entity.flags || {};
    // Player: use the resource-gated boost flag. NPC: raw intent.boost (no resource model),
    // matching the legacy controller (src/systems/flight.js:216 — AI never used e.boost).
    entity.flags.boosting = isPlayer ? boosting : !!input.boost;
    assignFlightFrame(entity, result, input.assistMode);

    applyResourceDelta(entity, result.resourceDelta);
    updateBank(entity, dt, profile);
    if (isPlayer) {
      const frame = entity._flightFrame || (entity._flightFrame = {});
      frame.tetherHelmAuthority = helm.mult;
      frame.tetherHelmPhase = helm.phase;
      frame.autopursuit = pursuit && pursuit.active ? pursuit.telemetry : null;
      frame.autopilot = autopilot && autopilot.active ? autopilot.telemetry : null;
      frame.tetherNoseAssist = !!input.tetherNoseAssist;
      frame.tetherNoseAssistTorque = tetherAssistTorque;
      emitThrustCue(this.bus, state, entity, input, result.telemetry);
    }
    emitPropulsionEvents(this.bus, entity, result.events);
  },

  // Player boost/dash state machine. Returns the resource-gated boosting flag to feed back into
  // propulsion. Handles tap=dash / hold=boost, energy drain+regen, hysteresis arming, and the dash
  // impulse (queued via physics authority). Mirrors src/systems/flight.js:118-188 exactly.
  _stepPlayerBoost(e, rawBoostHeld, dt, state, opts = {}) {
    const boost = normalizeBoostResource(e);
    if (boost.dashCdT > 0) boost.dashCdT = Math.max(0, boost.dashCdT - dt);

    const controlsBlocked = !!(state.ui && state.ui.screenStack && state.ui.screenStack.length);
    const suppressBoost = !!this._suppressBoostUntilRelease;
    const boostHeld = !!rawBoostHeld && !suppressBoost;
    const boostWasHeld = !!this._prevBoost;
    const boostGestureActive = boostWasHeld || !!boost._dashCandidate || (boost._boostHoldT > 0);
    if (boostHeld && (!boostWasHeld || !(boost._boostHoldT > 0))) {
      boost._boostHoldT = 0;
      boost._dashCandidate = !opts.suppressDash;
    }
    if (boostHeld) {
      boost._boostHoldT = (boost._boostHoldT || 0) + dt;
      if (opts.suppressDash) boost._dashCandidate = false;
      if (boost._boostHoldT > DASH_TAP_WINDOW) boost._dashCandidate = false;   // held too long → boost, not dash
    } else if (boostGestureActive) {
      const heldT = boost._boostHoldT || 0;
      if (!opts.suppressDash && boost._dashCandidate && heldT <= DASH_TAP_WINDOW) this._triggerDash(e, boost, state);
      boost._boostHoldT = 0;
      boost._dashCandidate = false;
    }
    if (!rawBoostHeld && suppressBoost && !controlsBlocked) this._suppressBoostUntilRelease = false;
    this._prevBoost = boostHeld;

    // Sustained boost with hysteresis gating (cut-out at 0, re-arm at 35%).
    if (!('_boostArmed' in boost)) boost._boostArmed = true;
    let boosting = false;
    if (boostHeld && boost.max > 0) {
      if (boost._boostArmed && boost.energy > 1) {
        boosting = true;
        boost.energy = Math.max(0, boost.energy - boost.drainRate * dt);
        if (boost.energy <= 0) boost._boostArmed = false;   // cut out; must regen to re-arm
      }
    } else if (boost.energy > boost.max * 0.35) {
      boost._boostArmed = true;
    }
    if (!boosting) boost.energy = Math.min(boost.max, boost.energy + boost.regenRate * dt);
    return boosting;
  },

  _triggerDash(e, boost, state) {
    if (!(boost.dashImpulse > 0) || boost.dashCdT > 0 || boost.energy < boost.dashCost) return false;
    const cf = Math.cos(finite(e.rot)), sf = Math.sin(finite(e.rot));
    const imp = boost.dashImpulse;
    const mass = positive(e.physicsBody && e.physicsBody.mass, positive(e.mass, 1));
    // Rapier authority path: queue the impulse (mass-scaled so delta-v is `imp` units/s),
    // matching src/systems/flight.js:176-179. The physics owner applies it next solve.
    queuePhysicsImpulse(e, { x: cf * imp * mass, y: 0, z: sf * imp * mass });
    boost.energy = Math.max(0, boost.energy - boost.dashCost);
    boost.dashCdT = boost.dashCd;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ship:dash', { shipId: e.id, impulse: imp });
    }
    return true;
  },

  // Called when controls go inactive (menu/docked) or on save:loaded/game:started. Suppresses an
  // immediate re-boost from a held key and emits the stop event if boost was active.
  _cancelPlayerBoost(e) {
    if (!e || !e.boost) { this._prevBoost = false; return; }
    const boost = e.boost;
    const hadGesture = !!(this._prevBoost || (boost._dashCandidate) || (boost._boostHoldT > 0)
      || (e.flags && e.flags.boosting));
    if (hadGesture) this._suppressBoostUntilRelease = true;
    this._prevBoost = false;
    boost._boostHoldT = 0;
    boost._dashCandidate = false;
    if (!e.flags) e.flags = {};
    const wasBoosting = !!(e.flags.boosting || e._wasBoosting);
    e.flags.boosting = false;
    e._wasBoosting = false;
    if (wasBoosting && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ship:boostStop', { shipId: e.id });
    }
  },

  _cancelPlayerBoostOnRestore() {
    const state = this.state;
    const player = state && state.entities && state.playerId
      ? state.entities.get(state.playerId) : null;
    this._cancelPlayerBoost(player);
  },

  _publishPlayerDiagnostics(player, state) {
    const profile = resolvePropulsionProfile(player, state);
    const frame = player._flightFrame || {};
    const telemetry = computeFlightTelemetry({ body: bodySnapshot(player, profile), profile, control: { telemetry: player._flightFrame } });
    const stop = telemetry.braking;
    const mode = frame.mode || 'assisted';
    Object.assign(this._diag, {
      shipId: player.id,
      driveId: profile.id,
      family: profile.family,
      mode,
      assistMode: mode,
      assistStrength: flightAssistStrength(frame, mode),
      speed: telemetry.speed,
      forwardSpeed: telemetry.forwardSpeed,
      lateralSpeed: telemetry.lateralSpeed,
      driftAngle: telemetry.driftAngle,
      stopDistance: Math.min(stop.directDistance, stop.flipBurnDistance),
      stopTimeS: Math.min(stop.directTimeS, stop.flipBurnTimeS),
    });
    state.flightRuntime = state.flightRuntime || {};
    state.flightRuntime.diagnostics = this._diag;
    state.flightRuntime.telemetry = telemetry;
  },

  _sanitizeAllRuntime() {
    const state = this.state;
    if (!state || !state.entityList) return;
    for (const entity of flightCraftCandidates(state)) {
      if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) continue;
      const profile = resolvePropulsionProfile(entity, state);
      entity.data = entity.data || {};
      entity.data.propulsionRuntime = {
        ...createPropulsionRuntime(profile),
        ...(entity.data.propulsionRuntime || {}),
        previousBoost: false,
      };
    }
  },

  _settleAllBanks(dt, state) {
    for (const entity of flightCraftCandidates(state)) {
      if (entity && (entity.type === 'ship' || entity.type === 'drone')) settleBank(entity, dt);
    }
  },

  _syncPlayerFlightMode(state, pursuit, autopilot) {
    const cruise = state && state.player && state.player.cruise;
    if (cruise && (cruise.phase === 'charging' || cruise.phase === 'cruising')) {
      this._setFlightMode('cruise', cruise.phase);
      return;
    }
    if (pursuit && pursuit.active) {
      this._setFlightMode('autopursuit', 'held');
      return;
    }
    if (autopilot && autopilot.active) {
      this._setFlightMode('lane', autopilot.telemetry && autopilot.telemetry.status || 'autopilot');
      return;
    }
    const current = state && state.flight && state.flight.mode;
    this._setFlightMode('manual', current === 'autopursuit' || current === 'lane' ? 'released' : 'manual');
  },

  _setFlightMode(mode, reason = 'manual') {
    const state = this.state;
    if (!state) return;
    const flight = state.flight || (state.flight = { mode: 'manual', previousMode: 'manual', modeReason: 'boot', modeChangedTick: 0 });
    const next = normalizeFlightComputerMode(mode);
    const prev = normalizeFlightComputerMode(flight.mode);
    if (prev === next) {
      flight.mode = next;
      flight.modeReason = reason;
      return;
    }
    flight.previousMode = prev;
    flight.mode = next;
    flight.modeReason = reason;
    flight.modeChangedTick = Number.isFinite(state.tick) ? state.tick : 0;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('flight:modeChanged', { from: prev, to: next, reason });
    }
  },
};

// Alias permits existing `import { flight } ...` call sites after the file switch.
export const flight = flightV3;

/** Annotate the already-allocated player input packet with optional MASSLINE flight modifiers.
 * The kernel stays state-agnostic; feature flags and player-only reachability stay at this adapter.
 * Mutating the packet avoids adding a new allocation to the 60 Hz craft update. */
export function applyMasslineFlightModifiers(input, state, eventSlingUntil = 0) {
  if (!input || typeof input !== 'object') return input;
  const now = finite(state && state.simTime, 0);
  const tether = state && state.player && state.player.tether;
  const tetherTagged = !!(tether && (tether.slingshot || finite(tether.slingshotT, 0) > 0));
  input.physicsEarnedMomentum = massline2Flag('throw')
    && (tetherTagged || finite(eventSlingUntil, 0) > now);
  input.earnedMomentumDecayTauS = MASSLINE_SLING_DECAY_TAU_S;
  input.earnedMomentumAssistScale = input.physicsEarnedMomentum ? MASSLINE_EARNED_ASSIST_SCALE : 1;

  const cloak = state && state.massline2 && state.massline2.cloak;
  const coasting = Math.abs(finite(input.throttle, 0)) <= 0.025
    && Math.abs(finite(input.strafe, 0)) <= 0.025
    && !input.boost
    && !input.brake;
  input.coastAssistScale = massline2Flag('cloak') && cloak && cloak.active && coasting
    ? CLOAK_COAST_ASSIST_SCALE
    : 1;
  return input;
}

// Idempotent boost-resource normalizer (port of src/systems/flight.js:306-329). Guarantees the
// player's `e.boost` block is well-formed every tick and after save load. Saves are validated
// defensively by saveSystem, so this only repairs in-memory drift — it never rejects a save.
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
  boost.drainRate = finiteNonNeg(boost.drainRate, DEFAULT_BOOST_RESOURCE.drainRate);
  boost.regenRate = finiteNonNeg(boost.regenRate, DEFAULT_BOOST_RESOURCE.regenRate);
  boost.dashImpulse = finiteNonNeg(boost.dashImpulse, DEFAULT_BOOST_RESOURCE.dashImpulse);
  boost.dashCost = finiteNonNeg(boost.dashCost, DEFAULT_BOOST_RESOURCE.dashCost);
  boost.dashCd = finiteNonNeg(boost.dashCd, DEFAULT_BOOST_RESOURCE.dashCd);
  boost.dashCdT = Math.min(boost.dashCd, finiteNonNeg(boost.dashCdT, DEFAULT_BOOST_RESOURCE.dashCdT));
  if ('_boostHoldT' in boost && !Number.isFinite(boost._boostHoldT)) boost._boostHoldT = 0;
  if ('_dashCandidate' in boost && typeof boost._dashCandidate !== 'boolean') boost._dashCandidate = false;
  if ('_boostArmed' in boost && typeof boost._boostArmed !== 'boolean') boost._boostArmed = true;
  return boost;
}

function finiteNonNeg(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeCraftInput(entity, raw = {}, runtime, state, isPlayer, dt = SG02_INPUT_DT) {
  const boost = !!raw.boost;
  const previousBoost = !!runtime.previousBoost;
  let turn = finite(raw.turnIntent ?? raw.turn, 0);
  let throttle = clamp(finite(raw.moveZ ?? raw.throttle, 0), -1, 1);
  let strafe = clamp(finite(raw.moveX ?? raw.strafe, 0), -1, 1);
  if (!isPlayer && Number.isFinite(raw.aimAngle)) {
    turn = clamp(wrapAngle(raw.aimAngle - finite(entity.rot)) / 0.62, -1, 1);
  }
  if (!isPlayer && entity.data) {
    // Actuator lag (NPC_INPUT_SLEW): the brain may flip its desire instantly; the engines can't.
    // Slew state rides on propulsionRuntime (save-additive; assignPropulsionRuntime preserves
    // extra keys), so replays and save/reload stay deterministic.
    const rt = entity.data.propulsionRuntime || (entity.data.propulsionRuntime = {});
    const maxDelta = NPC_INPUT_SLEW * Math.max(0, finite(dt, SG02_INPUT_DT));
    throttle = approachScalar(clamp(finite(rt.cmdThrottle, 0), -1, 1), throttle, maxDelta);
    strafe = approachScalar(clamp(finite(rt.cmdStrafe, 0), -1, 1), strafe, maxDelta);
    rt.cmdThrottle = throttle;
    rt.cmdStrafe = strafe;
  }
  return {
    throttle,
    strafe,
    turn: clamp(turn, -1, 1),
    boost,
    boostPressed: boost && !previousBoost,
    boostReleased: !boost && previousBoost,
    brake: !!(raw.brake || raw.fullStop || raw.flipBurn || (isPlayer && throttle < -0.55)),
    assistMode: resolveAssistMode(entity, state, raw),
  };
}

function approachScalar(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function resolveAutopilotInput(host, entity, rawInput, input, dt, state, profile) {
  const nav = state && state.nav;
  const autopilot = nav && nav.autopilot;
  if (!autopilot) return null;
  if (autopilot.active !== true) {
    clearAutopilotAvoidance(autopilot, true);
    return null;
  }
  if (!playerFlightControlsActive(state, entity)) return null;
  if (hasManualFlightInput(rawInput)) {
    stopAutopilot(host, state, 'manual');
    return null;
  }

  const target = resolveAutopilotTarget(state, autopilot);
  if (!target) {
    stopAutopilot(host, state, 'lost-target');
    return null;
  }

  const pos = entity.pos || { x: 0, z: 0 };
  const vel = entity.vel || { x: 0, z: 0 };
  const dx = finite(target.x) - finite(pos.x);
  const dz = finite(target.z) - finite(pos.z);
  const dist = Math.hypot(dx, dz);
  const arrivalRadius = Math.max(
    AUTOPILOT_ARRIVAL_RADIUS,
    finite(autopilot.arrivalRadius, 0),
    positive(entity.radius, 0) + positive(target.radius, 0) + 18
  );
  const speed = Math.hypot(finite(vel.x), finite(vel.z));
  if (dist <= arrivalRadius && speed < 11) {
    stopAutopilot(host, state, 'arrived');
    const arrivedInput = { ...input, throttle: 0, strafe: 0, turn: 0, boost: false, brake: false };
    syncAutopilotInput(state, arrivedInput, { dist, arrivalRadius, braking: false, avoiding: false, target, status: 'arrived' });
    return { active: true, input: arrivedInput, telemetry: { dist, arrivalRadius, status: 'arrived', target } };
  }

  if (!Number.isFinite(autopilot.initialDistance) || autopilot.initialDistance < dist) {
    autopilot.initialDistance = Math.max(dist, arrivalRadius);
  }

  syncAutopilotAvoidanceContext(autopilot, target);
  const guidance = computeAutopilotGuidance(state, entity, target, dist, arrivalRadius, autopilot);
  const desiredAngle = Math.atan2(guidance.z, guidance.x);
  const turnError = wrapAngle(desiredAngle - finite(entity.rot));
  const turn = clamp(turnError / AUTOPILOT_TURN_SOFT_ANGLE, -1, 1);
  const targetX = dist > 0.0001 ? dx / dist : Math.cos(finite(entity.rot));
  const targetZ = dist > 0.0001 ? dz / dist : Math.sin(finite(entity.rot));
  const closingSpeed = finite(vel.x) * targetX + finite(vel.z) * targetZ;
  const lateralSpeed = Math.abs(finite(vel.x) * -targetZ + finite(vel.z) * targetX);
  const brakeAccel = Math.max(positive(profile.reverseAccel, 0), positive(profile.mainAccel, 0) * 0.72, 1);
  const desiredSpeed = Math.sqrt(Math.max(0, 2 * brakeAccel * Math.max(0, dist - arrivalRadius)));
  const stoppingDistance = closingSpeed > 0 ? (closingSpeed * closingSpeed) / (2 * brakeAccel) : 0;
  const halfway = Number.isFinite(autopilot.initialDistance) && dist <= autopilot.initialDistance * 0.52;
  const terminalBrake = closingSpeed > 4 && (
    dist <= stoppingDistance + arrivalRadius + 45 + lateralSpeed * 1.4 ||
    (halfway && closingSpeed > desiredSpeed * 0.92)
  );
  // Obstacle avoidance can ask a fast Newtonian hull to make a large heading change. Once the
  // craft has committed momentum across or away from the new guidance vector, adding forward
  // thrust produces a kilometer-wide orbit instead of capturing the course. Brake through the
  // ordinary propulsion/physics authority until velocity is aligned again. This is deliberately
  // inside active autopilot only. Entity-target resolution remains upstream, and obstacle guidance
  // still owns the desired heading; capture braking only replaces forward thrust while momentum
  // is misaligned with that resolved guidance.
  const guidanceClosingSpeed = finite(vel.x) * guidance.x + finite(vel.z) * guidance.z;
  const captureSpeed = Math.max(42, positive(profile.precisionSpeed, 72) * AUTOPILOT_CAPTURE_SPEED_FRACTION);
  const guidanceMisaligned = guidanceClosingSpeed < speed * AUTOPILOT_CAPTURE_ALIGNMENT;
  const headingCapture = speed > captureSpeed && guidanceMisaligned;
  const shouldBrake = terminalBrake || headingCapture;

  let throttle = 0;
  let strafe = 0;
  let brake = false;
  let boost = false;
  if (shouldBrake) {
    const counter = counterVelocityInput(entity);
    throttle = counter.throttle;
    strafe = counter.strafe;
    brake = true;
  } else {
    const rot = finite(entity.rot);
    const rightX = -Math.sin(rot);
    const rightZ = Math.cos(rot);
    const facingDot = Math.cos(turnError);
    throttle = facingDot > -0.25 ? clamp(0.35 + facingDot * 0.78, -1, 1) : 0;
    strafe = clamp((guidance.x * rightX + guidance.z * rightZ) * 0.72, -1, 1);
    const cruiseClear = !guidance.avoiding && Math.abs(turnError) < 0.34;
    boost = cruiseClear &&
      dist > Math.max(arrivalRadius * 5, stoppingDistance * 1.25 + 220) &&
      speed < positive(profile.maxSpeed, 120) * 1.85;
  }

  const nextInput = {
    ...input,
    throttle,
    strafe,
    turn,
    boost,
    brake,
  };
  const status = brake ? 'braking' : guidance.avoiding ? 'avoiding' : boost ? 'boosting' : 'cruising';
  autopilot.status = status;
  autopilot.distance = dist;
  const telemetry = {
    dist,
    arrivalRadius,
    braking: brake,
    captureBraking: headingCapture,
    avoiding: guidance.avoiding,
    target,
    status,
    turnError,
  };
  syncAutopilotInput(state, nextInput, telemetry);
  return { active: true, input: nextInput, telemetry };
}

function hasManualFlightInput(input) {
  if (!input) return false;
  return Math.abs(finite(input.moveX ?? input.strafe, 0)) > 0.08 ||
    Math.abs(finite(input.moveZ ?? input.throttle, 0)) > 0.08 ||
    Math.abs(finite(input.turnIntent ?? input.turn, 0)) > 0.08 ||
    !!input.boost ||
    !!input.brake;
}

function syncAutopilotInput(state, input, telemetry) {
  const stateInput = state && state.input;
  if (!stateInput || !input) return;
  stateInput.moveX = finite(input.strafe, 0);
  stateInput.moveZ = finite(input.throttle, 0);
  stateInput.turnIntent = finite(input.turn, 0);
  stateInput.boost = !!input.boost;
  stateInput.brake = !!input.brake;
  stateInput.autopilot = telemetry || true;
  const actions = stateInput.actions || (stateInput.actions = {});
  actions.brake = !!input.brake;
}

function stopAutopilot(host, state, reason) {
  const nav = state && state.nav;
  const autopilot = nav && nav.autopilot;
  if (!autopilot || autopilot.active !== true) return;
  clearAutopilotAvoidance(autopilot, true);
  autopilot.active = false;
  autopilot.status = reason || 'idle';
  if (state && state.input) {
    state.input.autopilot = false;
    if (state.input.actions) state.input.actions.brake = false;
  }
  const bus = host && host.bus;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('nav:autopilot', autopilot);
    bus.emit('toast', {
      text: reason === 'arrived' ? 'Autopilot arrived' : 'Autopilot disengaged',
      kind: reason === 'arrived' ? 'good' : 'info',
      ttl: 2,
    });
  }
}

function resolveAutopilotTarget(state, autopilot) {
  if (!state || !autopilot) return null;
  const id = autopilot.targetEntityId;
  let entity = null;
  if (id != null && state.entities && typeof state.entities.get === 'function') {
    entity = state.entities.get(id);
    if (!entity && typeof id === 'string') {
      const numeric = Number(id);
      if (Number.isFinite(numeric)) entity = state.entities.get(numeric);
    }
  }
  if (entity && entity.alive !== false && entity.pos) {
    return {
      x: entity.pos.x,
      z: entity.pos.z,
      radius: entity.radius || 0,
      entity,
      label: autopilot.label || entity.name || (entity.data && entity.data.name) || entity.type || 'Autopilot target',
    };
  }
  const target = autopilot.target;
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  return { x: target.x, z: target.z, radius: 0, entity: null, label: autopilot.label || 'Autopilot target' };
}

function computeAutopilotGuidance(state, player, target, distance, arrivalRadius, autopilot) {
  const px = finite(player.pos && player.pos.x);
  const pz = finite(player.pos && player.pos.z);
  const baseX = distance > 0.0001 ? (target.x - px) / distance : Math.cos(finite(player.rot));
  const baseZ = distance > 0.0001 ? (target.z - pz) / distance : Math.sin(finite(player.rot));
  const perpX = -baseZ;
  const perpZ = baseX;
  const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
  const lookAhead = Math.max(AUTOPILOT_MIN_LOOKAHEAD, Math.min(AUTOPILOT_MAX_LOOKAHEAD, speed * 3.2 + distance * 0.24));
  let steerX = baseX;
  let steerZ = baseZ;
  let avoiding = false;
  const maxProjection = Math.max(0, Math.min(distance - arrivalRadius, lookAhead));
  if (maxProjection > 0) {
    const obstacles = autopilotObstacles(state, player, target);
    let weightedLateral = 0;
    let totalStrength = 0;
    for (const obstacle of obstacles) {
      const ox = finite(obstacle.pos && obstacle.pos.x) - px;
      const oz = finite(obstacle.pos && obstacle.pos.z) - pz;
      const projection = ox * baseX + oz * baseZ;
      if (projection <= 0 || projection > maxProjection) continue;
      const lateral = ox * perpX + oz * perpZ;
      const clearance = positive(player.radius, 0) + positive(obstacle.radius, 0) + 58 + Math.min(70, speed * 0.22);
      const absLateral = Math.abs(lateral);
      if (absLateral >= clearance) continue;
      const depth = 1 - projection / Math.max(1, maxProjection);
      const strength = (1 - absLateral / Math.max(1, clearance)) * (0.7 + depth * 0.8);
      weightedLateral += lateral * strength;
      totalStrength += strength;
    }

    if (totalStrength > 0) {
      let side = finite(autopilot && autopilot._avoidanceSide, 0);
      if (side !== -1 && side !== 1) {
        const lateralCenter = weightedLateral / totalStrength;
        side = Math.abs(lateralCenter) > 0.01
          ? -Math.sign(lateralCenter)
          : deterministicAvoidanceSide(baseX, baseZ);
        if (autopilot) autopilot._avoidanceSide = side;
      }

      for (const obstacle of obstacles) {
        const ox = finite(obstacle.pos && obstacle.pos.x) - px;
        const oz = finite(obstacle.pos && obstacle.pos.z) - pz;
        const projection = ox * baseX + oz * baseZ;
        if (projection <= 0 || projection > maxProjection) continue;
        const lateral = ox * perpX + oz * perpZ;
        const clearance = positive(player.radius, 0) + positive(obstacle.radius, 0) + 58 + Math.min(70, speed * 0.22);
        const absLateral = Math.abs(lateral);
        if (absLateral >= clearance) continue;
        const depth = 1 - projection / Math.max(1, maxProjection);
        const strength = (1 - absLateral / Math.max(1, clearance)) * (0.7 + depth * 0.8);
        steerX += perpX * side * strength * 1.65;
        steerZ += perpZ * side * strength * 1.65;
      }
      avoiding = true;
    } else {
      clearAutopilotAvoidance(autopilot, false);
    }
  } else {
    clearAutopilotAvoidance(autopilot, false);
  }
  const len = Math.hypot(steerX, steerZ) || 1;
  return { x: steerX / len, z: steerZ / len, avoiding };
}

function syncAutopilotAvoidanceContext(autopilot, target) {
  if (!autopilot || !target) return;
  // Pass commitment lives only on the active nav object. Its JSON-safe private primitives are
  // deliberately omitted by saveSystem's nav sanitizer, so a load always makes a fresh choice.
  const entityId = target.entity && target.entity.id != null ? String(target.entity.id) : '';
  const pointX = entityId ? null : finite(target.x);
  const pointZ = entityId ? null : finite(target.z);
  const changed = autopilot._avoidanceTargetEntityId !== entityId ||
    (!entityId && (autopilot._avoidanceTargetX !== pointX || autopilot._avoidanceTargetZ !== pointZ));
  if (changed) clearAutopilotAvoidance(autopilot, false);
  autopilot._avoidanceTargetEntityId = entityId;
  autopilot._avoidanceTargetX = pointX;
  autopilot._avoidanceTargetZ = pointZ;
}

function clearAutopilotAvoidance(autopilot, resetContext) {
  if (!autopilot) return;
  autopilot._avoidanceSide = 0;
  if (!resetContext) return;
  autopilot._avoidanceTargetEntityId = '';
  autopilot._avoidanceTargetX = null;
  autopilot._avoidanceTargetZ = null;
}

function deterministicAvoidanceSide(baseX, baseZ) {
  return Math.abs(baseX) >= Math.abs(baseZ)
    ? (baseX >= 0 ? 1 : -1)
    : (baseZ >= 0 ? 1 : -1);
}

function autopilotObstacles(state, player, target) {
  const out = [];
  const list = state && state.entityList ? state.entityList : [];
  for (const e of list) {
    if (!e || e === player || e === target.entity || e.alive === false || e.collides === false || !e.pos) continue;
    if (e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    const radius = Number.isFinite(e.radius) ? e.radius : 0;
    if (radius <= 0 && e.type !== 'station' && e.type !== 'asteroid' && e.type !== 'wreck' && e.type !== 'ship') continue;
    out.push(e);
  }
  return out;
}

function counterVelocityInput(entity) {
  const vx = finite(entity.vel && entity.vel.x);
  const vz = finite(entity.vel && entity.vel.z);
  const speed = Math.hypot(vx, vz);
  if (!(speed > 0.001)) return { throttle: 0, strafe: 0 };
  const nx = -vx / speed;
  const nz = -vz / speed;
  const rot = finite(entity.rot);
  const cf = Math.cos(rot);
  const sf = Math.sin(rot);
  return {
    throttle: clamp(nx * cf + nz * sf, -1, 1),
    strafe: clamp(nx * -sf + nz * cf, -1, 1),
  };
}

function resolveAutopursuitInput(entity, input, dt, state, profile) {
  if (!entity || !state || !state.input || !state.input.actions) return null;
  if (!state.input.actions.autopursuit) return null;
  const cruise = state.player && state.player.cruise;
  if (cruise && (cruise.phase === 'charging' || cruise.phase === 'cruising')) return null;
  const tether = state.player && state.player.tether;
  if (tether && tether.active) return null;
  const target = resolvePursuitTarget(state);
  if (!target) return null;

  const pos = entity.pos || { x: 0, z: 0 };
  const vel = entity.vel || { x: 0, z: 0 };
  const targetPos = target.pos || { x: 0, z: 0 };
  const targetVel = target.vel || { x: 0, z: 0 };
  const lead = solveIntercept(
    pos,
    vel,
    targetPos,
    targetVel,
    positive(profile.projectileSpeedHint, AUTOPURSUIT_PROJECTILE_HINT),
    8
  );
  const aim = lead && lead.aimPoint ? lead.aimPoint : targetPos;
  const turnErr = wrapAngle(Math.atan2(finite(aim.z) - finite(pos.z), finite(aim.x) - finite(pos.x)) - finite(entity.rot));
  const turn = clamp(turnErr / AUTOPURSUIT_TURN_SOFT_ANGLE, -1, 1);

  const followPoint = pursuitFollowPoint(target);
  const desiredVel = desiredPursuitVelocity(pos, vel, followPoint, targetVel, profile, dt);
  const local = worldVelocityErrorToInput(entity, desiredVel, profile, input);

  // Auto-boost latch: engage when the tail slot is running away, release once we are back in
  // reach. The latch lives on state.flight (reset on pursuit end / load) and the distance
  // hysteresis band guarantees multi-second hold periods, so it reads as a committed burn.
  const followDistance = distance2(pos, targetPos);
  const flight = state.flight || (state.flight = { mode: 'manual', previousMode: 'manual', modeReason: 'boot', modeChangedTick: 0 });
  let boostLatch = !!flight.pursuitBoostLatch;
  if (followDistance > AUTOPURSUIT_BOOST_ENGAGE) boostLatch = true;
  else if (followDistance < AUTOPURSUIT_BOOST_RELEASE) boostLatch = false;
  flight.pursuitBoostLatch = boostLatch;

  return {
    active: true,
    input: {
      ...input,
      turn,
      throttle: local.throttle,
      strafe: clamp(local.strafe + finite(input.strafe) * AUTOPURSUIT_MANUAL_STRAFE_BLEND, -1, 1),
      brake: local.brake,
      boost: boostLatch,
    },
    telemetry: {
      targetId: target.id,
      followDistance,
      turnError: turnErr,
      desiredVelocity: desiredVel,
      followPoint,
      boosting: boostLatch,
    },
  };
}

function applyTetherNoseAssist(entity, input, state) {
  const tether = state && state.player && state.player.tether;
  if (!tether || !tether.active || tether.targetId == null) return input;
  const phase = String(tether.phase || 'slack');
  if (phase === 'slack') return input;
  if (!input || (!input.brake && Math.abs(finite(input.throttle, 0)) < 0.05 && Math.abs(finite(input.strafe, 0)) < 0.05)) return input;
  if (Math.abs(finite(input && input.turn, 0)) > 0.05) return input;
  const target = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(tether.targetId)
    : null;
  if (!entity || !entity.pos || !target || target.alive === false || !target.pos) return input;
  const desired = Math.atan2(finite(target.pos.z) - finite(entity.pos.z), finite(target.pos.x) - finite(entity.pos.x));
  const turnErr = wrapAngle(desired - finite(entity.rot));
  return {
    ...input,
    tetherNoseTurnError: turnErr,
    tetherNoseAssist: true,
  };
}

function tetherNoseAssistTorque(body, input, profile) {
  // SG-02 owns loaded-line nose-in torque from the forward tether anchor. The flight layer only
  // annotates telemetry; injecting a second yaw controller here makes reverse/thrust fight the line.
  return 0;
}

function resolvePursuitTarget(state) {
  const player = state && state.player;
  const id = player && player.targetId;
  if (id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  const target = state.entities.get(id);
  if (!target || target.alive === false || !target.pos) return null;
  return target;
}

function pursuitFollowPoint(target) {
  const pos = target.pos || { x: 0, z: 0 };
  const vel = target.vel || { x: 0, z: 0 };
  const speed = Math.hypot(finite(vel.x), finite(vel.z));
  const forward = speed > 1
    ? { x: finite(vel.x) / speed, z: finite(vel.z) / speed }
    : { x: Math.cos(finite(target.rot)), z: Math.sin(finite(target.rot)) };
  return {
    x: finite(pos.x) - forward.x * AUTOPURSUIT_FOLLOW_DIST,
    z: finite(pos.z) - forward.z * AUTOPURSUIT_FOLLOW_DIST,
  };
}

function desiredPursuitVelocity(pos, vel, followPoint, targetVel, profile, dt) {
  const dx = finite(followPoint.x) - finite(pos.x);
  const dz = finite(followPoint.z) - finite(pos.z);
  const dist = Math.hypot(dx, dz);
  const close = dist > 1 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 0 };
  const bandError = dist < AUTOPURSUIT_FOLLOW_MIN
    ? dist - AUTOPURSUIT_FOLLOW_MIN
    : dist > AUTOPURSUIT_FOLLOW_MAX
      ? dist - AUTOPURSUIT_FOLLOW_MAX
      : 0;
  const combatSpeed = positive(profile.combatSpeed, positive(profile.maxSpeed, 210));
  const closeSpeed = clamp(Math.abs(bandError) * AUTOPURSUIT_CLOSE_GAIN, 0, combatSpeed);
  const sign = bandError >= 0 ? 1 : -1;
  return {
    x: finite(targetVel.x) + close.x * closeSpeed * sign + (finite(targetVel.x) - finite(vel.x)) * 0.08,
    z: finite(targetVel.z) + close.z * closeSpeed * sign + (finite(targetVel.z) - finite(vel.z)) * 0.08,
  };
}

function worldVelocityErrorToInput(entity, desiredVel, profile, input) {
  const vel = entity.vel || { x: 0, z: 0 };
  const err = {
    x: (finite(desiredVel.x) - finite(vel.x)) * AUTOPURSUIT_MATCH_GAIN,
    z: (finite(desiredVel.z) - finite(vel.z)) * AUTOPURSUIT_MATCH_GAIN,
  };
  const rot = finite(entity.rot);
  const fx = Math.cos(rot), fz = Math.sin(rot);
  const rx = -fz, rz = fx;
  const localForward = err.x * fx + err.z * fz;
  const localStrafe = err.x * rx + err.z * rz;
  const forwardLimit = localForward >= 0
    ? positive(profile.mainAccel, 40)
    : positive(profile.reverseAccel, positive(profile.mainAccel, 40) * 0.5);
  const strafeLimit = positive(profile.strafeAccel, positive(profile.mainAccel, 40) * 0.45);
  const throttle = clamp(localForward / Math.max(1, forwardLimit), -1, 1);
  const strafe = clamp(localStrafe / Math.max(1, strafeLimit), -1, 1);
  const closingFast = Math.hypot(finite(vel.x), finite(vel.z)) > positive(profile.combatSpeed, 210) * 1.2
    && Math.abs(throttle) < 0.2
    && (input && input.brake);
  return { throttle, strafe, brake: closingFast };
}

function distance2(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function tetherHelmAuthority(state, isPlayer) {
  if (!isPlayer) return { mult: 1, phase: 'none' };
  const tether = state && state.player && state.player.tether;
  if (!tether || !tether.active) return { mult: 1, phase: 'none' };
  const phase = String(tether.phase || 'slack');
  const base = TETHER_HELM_PHASE_MULT[phase] || 1;
  if (!(base > 1)) return { mult: 1, phase };
  const strain = clamp(finite(tether.strain, 0), 0, 1.2);
  return { mult: base + strain * TETHER_HELM_STRAIN_MULT, phase };
}

function applyTetherHelmProfile(profile, helm) {
  const mult = positive(helm && helm.mult, 1);
  return {
    ...profile,
    maxYawRate: Number.isFinite(profile.maxYawRate)
      ? profile.maxYawRate * TETHER_HELM_MAX_YAW_RATE_MULT
      : profile.maxYawRate,
    yawAccel: Number.isFinite(profile.yawAccel) ? profile.yawAccel * mult : profile.yawAccel,
    yawBrake: Number.isFinite(profile.yawBrake) ? profile.yawBrake * (mult + 0.65) : profile.yawBrake,
  };
}

function resolveAssistMode(entity, state, raw) {
  const explicit = raw.assistMode || raw.flightMode || entity.flightAssistMode;
  if (explicit === 'assisted' || explicit === 'drift' || explicit === 'newtonian') return explicit;
  const controls = state.settings && state.settings.controls;
  return controls && ['assisted', 'drift', 'newtonian'].includes(controls.flightMode)
    ? controls.flightMode
    : 'assisted';
}

function propulsionRuntime(entity, profile) {
  entity.data = entity.data || {};
  return entity.data.propulsionRuntime || createPropulsionRuntime(profile);
}

function assignPropulsionRuntime(entity, runtime, boost) {
  const target = entity.data.propulsionRuntime || (entity.data.propulsionRuntime = {});
  Object.assign(target, runtime);
  target.previousBoost = !!boost;
  return target;
}

function assignFlightFrame(entity, result, mode) {
  const frame = entity._flightFrame || (entity._flightFrame = {});
  Object.assign(frame, result.telemetry);
  frame.mode = mode;
  frame.driveId = result.driveId;
  frame.family = result.family;
  return frame;
}

function bodySnapshot(entity, profile) {
  const physicsBody = entity.physicsBody || {};
  const derived = entity.data && entity.data.derived && entity.data.derived.flightModel;
  return {
    pos: entity.pos,
    vel: entity.vel,
    rot: entity.rot,
    angVel: entity.angVel,
    mass: positive(physicsBody.mass, positive(entity.mass, positive(profile.mass, 1))),
    inertia: positive(physicsBody.inertiaY, positive(entity.flightModel && entity.flightModel.inertia, positive(derived && derived.inertia, 1))),
    radius: positive(entity.radius, positive(physicsBody.radius, 0)),
  };
}

function resolveFlightEnvironment(entity, state) {
  const sector = state.world && state.world.currentSector;
  const hazard = state.flightEnvironment || {};
  return {
    particulateDensity: Math.max(0, finite(hazard.particulateDensity, sector && sector.particulateDensity || 0)),
    dragCoefficient: Math.max(0, finite(hazard.dragCoefficient, 0.00002)),
    fieldDirection: hazard.fieldDirection || (sector && sector.fieldDirection) || { x: 1, z: 0 },
    fieldStrength: Math.max(0, finite(hazard.fieldStrength, sector && sector.fieldStrength || 0)),
  };
}

function applyResourceDelta(entity, delta) {
  if (!delta) return;
  // Integration seam: canonical ship energy/heat/fuel systems should consume these
  // deltas. This fallback is save-safe and keeps the generated module testable.
  entity.data = entity.data || {};
  const ledger = entity.data.propulsionResources = entity.data.propulsionResources || { energySpent: 0, heat: 0, fuelSpent: 0 };
  ledger.energySpent += Math.max(0, -finite(delta.energy));
  ledger.heat = Math.max(0, ledger.heat + Math.max(0, finite(delta.heat)));
  ledger.fuelSpent += Math.max(0, -finite(delta.fuel));
  if (Number.isFinite(entity.energy)) entity.energy = Math.max(0, entity.energy + finite(delta.energy));
  if (Number.isFinite(entity.heat)) entity.heat = Math.max(0, entity.heat + finite(delta.heat));
  if (Number.isFinite(entity.fuel)) entity.fuel = Math.max(0, entity.fuel + finite(delta.fuel));
}

function emitPropulsionEvents(bus, entity, events) {
  if (!bus || typeof bus.emit !== 'function') return;
  for (const event of events || []) bus.emit(event.type, { ...event, shipId: entity.id });
}

function updateBank(entity, dt, profile) {
  const bankMax = positive(profile.bankMax, DEFAULT_BANK_MAX);
  const wy = finite(entity.angVel);
  const rot = finite(entity.rot);
  const forwardSpeed = finite(entity.vel && entity.vel.x) * Math.cos(rot)
    + finite(entity.vel && entity.vel.z) * Math.sin(rot);
  const authority = BANK_STANDSTILL
    + (1 - BANK_STANDSTILL) * clamp(Math.abs(forwardSpeed) / BANK_SPEED_REF, 0, 1);
  const style = finite(entity.bankFactor, 0.6) / 0.6;   // authored bankFactor keeps its meaning
  const target = clamp(wy * BANK_RATE_GAIN * authority * style, -bankMax, bankMax);
  const rollingIn = Math.abs(target) > Math.abs(finite(entity.bank));
  entity.bank = damp(finite(entity.bank), target, rollingIn ? BANK_RESPONSE : BANK_RETURN, dt);
  if (Math.abs(entity.bank) < 0.0005 && Math.abs(target) < 0.0005) entity.bank = 0;
}

function settleBank(entity, dt) {
  entity.bank = damp(finite(entity.bank), 0, BANK_RETURN, dt);
  if (Math.abs(entity.bank) < 0.0005) entity.bank = 0;
}
function neutralInput() { return NEUTRAL_INPUT; }
function playerFlightSimActive(state, player) { return !!player && state.mode === 'flight' && !(player.flags && player.flags.docked); }
function playerFlightControlsActive(state, player) { return playerFlightSimActive(state, player) && !(state.ui && state.ui.screenStack && state.ui.screenStack.length); }
function flightCraftCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.shipLike) return index.shipLike;
  return (state && state.entityList) || [];
}
function normalizeFlightComputerMode(mode) {
  return mode === 'autopursuit' || mode === 'cruise' || mode === 'lane' ? mode : 'manual';
}
function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
function damp(cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); }
function wrapAngle(v) { let x = finite(v) % (Math.PI * 2); if (x <= -Math.PI) x += Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; return x; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }

function emitThrustCue(bus, state, entity, input, frame) {
  if (!bus || typeof bus.emit !== 'function' || !state || !entity || entity.id !== state.playerId) return;
  const throttle = clamp(finite(input && input.throttle, 0), -1, 1);
  const strafe = clamp(finite(input && input.strafe, 0), -1, 1);
  const manual = Math.abs(throttle) > 0.025 || Math.abs(strafe) > 0.025;
  const speed = frame && Number.isFinite(frame.speed)
    ? frame.speed
    : Math.hypot(finite(entity.vel && entity.vel.x), finite(entity.vel && entity.vel.z));
  const neutralAssistBrake = frame &&
    frame.assistReason === 'neutral-counterthrust' &&
    frame.assistMode === 'assisted' &&
    !manual &&
    speed > 1.2;
  const brake = !!(input && input.brake) || throttle < -0.025 || neutralAssistBrake;
  if (!manual && !brake && !(entity.flags && entity.flags.boosting)) return;
  bus.emit('ship:thrust', {
    id: entity.id,
    shipId: entity.id,
    throttle: Math.max(0, throttle),
    reverse: brake ? Math.max(0.25, Math.min(1, speed / Math.max(30, positive(entity.maxSpeed, 120) * 0.5))) : 0,
    strafe,
    boost: !!(entity.flags && entity.flags.boosting),
    nozzles: thrustNozzles(throttle, strafe, brake),
  });
}

function thrustNozzles(throttle, strafe, brake) {
  const nozzles = [];
  if (throttle > 0.025) nozzles.push({ role: 'main', strength: Math.min(1, throttle), angle: 0 });
  if (brake) {
    nozzles.push({ role: 'reverse-left', strength: 1, angle: Math.PI * 0.75 });
    nozzles.push({ role: 'reverse-right', strength: 1, angle: -Math.PI * 0.75 });
  }
  if (strafe > 0.025) nozzles.push({ role: 'strafe-right', strength: Math.min(1, strafe), angle: -Math.PI / 2 });
  else if (strafe < -0.025) nozzles.push({ role: 'strafe-left', strength: Math.min(1, -strafe), angle: Math.PI / 2 });
  return nozzles;
}

function flightAssistStrength(frame, mode) {
  if (mode === 'newtonian') return 0;
  const local = frame && frame.assistLocal;
  if (local && Number.isFinite(local.forward) && Number.isFinite(local.lateral)) {
    return Math.hypot(local.forward, local.lateral);
  }
  return mode === 'drift' ? 0.2 : 1;
}
