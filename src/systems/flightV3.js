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
import { computeFlightTelemetry } from '../core/flight/flightTelemetry.js';

const BANK_RESPONSE = 8.5;
const BANK_RETURN = 11.0;
const DEFAULT_BANK_MAX = 0.68;

// Boost/dash tuning — mirrors src/systems/flight.js so player feel is identical under V3.
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
const NEUTRAL_INPUT = Object.freeze({ moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false });

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
      this.bus.on('save:loaded', () => { this._sanitizeAllRuntime(); this._cancelPlayerBoostOnRestore(); });
      this.bus.on('game:started', () => { this._sanitizeAllRuntime(); this._cancelPlayerBoostOnRestore(); });
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
    const profile = resolvePropulsionProfile(entity, state);
    const runtime = propulsionRuntime(entity, profile);
    let input = normalizeCraftInput(entity, rawInput, runtime, state, isPlayer);

    // Player boost/dash subsystem (port of src/systems/flight.js:118-188). Runs before
    // stepPropulsion so the resource-gated boost state feeds the propulsion kernel's thrust
    // scaling, and so the dash impulse is queued through physics authority this tick.
    let boosting = input.boost;
    if (isPlayer) {
      boosting = this._stepPlayerBoost(entity, input.boost, dt, state);
      input.boost = boosting;
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

    writePhysicsControl(entity, {
      source: isPlayer ? 'player-flight-v3' : 'npc-flight-v3',
      mode: input.assistMode,
      force: result.force,
      torque: result.torque,
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
    updateBank(entity, input.turn, dt, profile);
    emitPropulsionEvents(this.bus, entity, result.events);
  },

  // Player boost/dash state machine. Returns the resource-gated boosting flag to feed back into
  // propulsion. Handles tap=dash / hold=boost, energy drain+regen, hysteresis arming, and the dash
  // impulse (queued via physics authority). Mirrors src/systems/flight.js:118-188 exactly.
  _stepPlayerBoost(e, rawBoostHeld, dt, state) {
    const boost = normalizeBoostResource(e);
    if (boost.dashCdT > 0) boost.dashCdT = Math.max(0, boost.dashCdT - dt);

    const controlsBlocked = !!(state.ui && state.ui.screenStack && state.ui.screenStack.length);
    const suppressBoost = !!this._suppressBoostUntilRelease;
    const boostHeld = !!rawBoostHeld && !suppressBoost;
    const boostWasHeld = !!this._prevBoost;
    if (boostHeld && !boostWasHeld) { boost._boostHoldT = 0; boost._dashCandidate = true; }
    if (boostHeld) {
      boost._boostHoldT = (boost._boostHoldT || 0) + dt;
      if (boost._boostHoldT > DASH_TAP_WINDOW) boost._dashCandidate = false;   // held too long → boost, not dash
    } else if (boostWasHeld) {
      const heldT = boost._boostHoldT || 0;
      if (boost._dashCandidate && heldT <= DASH_TAP_WINDOW) this._triggerDash(e, boost, state);
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
    if (!(boost.dashImpulse > 0) || boost.dashCdT > 0 || boost.energy < boost.dashImpulse * 0.6) return false;
    const cf = Math.cos(finite(e.rot)), sf = Math.sin(finite(e.rot));
    const imp = boost.dashImpulse;
    const mass = positive(e.physicsBody && e.physicsBody.mass, positive(e.mass, 1));
    // Rapier authority path: queue the impulse (mass-scaled so delta-v is `imp` units/s),
    // matching src/systems/flight.js:176-179. The physics owner applies it next solve.
    queuePhysicsImpulse(e, { x: cf * imp * mass, y: 0, z: sf * imp * mass });
    boost.energy = Math.max(0, boost.energy - boost.dashImpulse * 0.6);
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
};

// Alias permits existing `import { flight } ...` call sites after the file switch.
export const flight = flightV3;

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

function normalizeCraftInput(entity, raw = {}, runtime, state, isPlayer) {
  const boost = !!raw.boost;
  const previousBoost = !!runtime.previousBoost;
  let turn = finite(raw.turnIntent ?? raw.turn, 0);
  const throttle = clamp(finite(raw.moveZ ?? raw.throttle, 0), -1, 1);
  const strafe = clamp(finite(raw.moveX ?? raw.strafe, 0), -1, 1);
  if (!isPlayer && Number.isFinite(raw.aimAngle)) {
    turn = clamp(wrapAngle(raw.aimAngle - finite(entity.rot)) / 0.62, -1, 1);
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

function updateBank(entity, turn, dt, profile) {
  const bankMax = positive(profile.bankMax, DEFAULT_BANK_MAX);
  const factor = finite(entity.bankFactor, 0.6);
  const target = clamp(turn * factor * bankMax, -bankMax, bankMax);
  const lambda = Math.abs(target) > 0.001 ? BANK_RESPONSE : BANK_RETURN;
  entity.bank = damp(finite(entity.bank), target, lambda, dt);
  if (Math.abs(entity.bank) < 0.0005 && Math.abs(target) < 0.0005) entity.bank = 0;
}

function settleBank(entity, dt) { updateBank(entity, 0, dt, {}); }
function neutralInput() { return NEUTRAL_INPUT; }
function playerFlightSimActive(state, player) { return !!player && state.mode === 'flight' && !(player.flags && player.flags.docked); }
function playerFlightControlsActive(state, player) { return playerFlightSimActive(state, player) && !(state.ui && state.ui.screenStack && state.ui.screenStack.length); }
function flightCraftCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.shipLike) return index.shipLike;
  return (state && state.entityList) || [];
}
function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
function damp(cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); }
function wrapAngle(v) { let x = finite(v) % (Math.PI * 2); if (x <= -Math.PI) x += Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; return x; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }

function flightAssistStrength(frame, mode) {
  if (mode === 'newtonian') return 0;
  const local = frame && frame.assistLocal;
  if (local && Number.isFinite(local.forward) && Number.isFinite(local.lateral)) {
    return Math.hypot(local.forward, local.lateral);
  }
  return mode === 'drift' ? 0.2 : 1;
}
