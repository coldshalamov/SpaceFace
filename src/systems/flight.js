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
const DASH_TAP_WINDOW = 0.32;  // Shift taps up to this duration become dash; longer holds boost.
const AUTOPILOT_TURN_SOFT_ANGLE = 0.62;
const AUTOPILOT_ARRIVAL_RADIUS = 38;
const AUTOPILOT_MAX_LOOKAHEAD = 760;
const AUTOPILOT_MIN_LOOKAHEAD = 180;
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
      const autopilotInput = controlsActive ? this._autopilotInput(player, dt) : null;
      this.applyPlayerIntent(player, dt, controlsActive ? autopilotInput : NEUTRAL_PLAYER_INPUT, { physicsAuthority: dynamicAuthority });
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
    for (const e of flightCraftCandidates(state)) {
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
    const frame = stepPlayerFlight(e, inp, dt, profile, { boosting, physicsAuthority: opts.physicsAuthority, source: 'player-flight' });
    this._emitThrustCue(e, inp, frame);
    return frame;
  },

  _triggerDash(e, boost, opts = {}) {
    if (!(boost.dashImpulse > 0) || boost.dashCdT > 0 || boost.energy < boost.dashCost) return false;
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
    boost.energy = Math.max(0, boost.energy - boost.dashCost);
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
    const frame = stepNpcFlight(e, intent, dt, resolveFlightProfile(e, this.state), {
      physicsAuthority: opts.physicsAuthority,
      source: 'npc-flight',
    });
    this._emitThrustCue(e, intent, frame);
    return frame;
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

  _autopilotInput(player, dt) {
    const state = this.state;
    const nav = state && state.nav;
    const autopilot = nav && nav.autopilot;
    if (!autopilot || autopilot.active !== true) return null;
    const raw = state.input || {};
    if (hasManualFlightInput(raw)) {
      this._stopAutopilot('manual');
      return null;
    }

    const target = resolveAutopilotTarget(state, autopilot);
    if (!target) {
      this._stopAutopilot('lost-target');
      return null;
    }

    const px = player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
    const pz = player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
    const dx = target.x - px;
    const dz = target.z - pz;
    const dist = Math.hypot(dx, dz);
    const arrivalRadius = Math.max(AUTOPILOT_ARRIVAL_RADIUS, autopilot.arrivalRadius || 0, (player.radius || 0) + (target.radius || 0) + 18);
    const speed = Math.hypot((player.vel && player.vel.x) || 0, (player.vel && player.vel.z) || 0);
    if (dist <= arrivalRadius && speed < 11) {
      this._stopAutopilot('arrived');
      return {
        ...raw,
        moveX: 0,
        moveZ: 0,
        turnIntent: 0,
        boost: false,
        brake: false,
        controlsBlocked: false,
        _autopilot: true,
      };
    }

    if (!Number.isFinite(autopilot.initialDistance) || autopilot.initialDistance < dist) {
      autopilot.initialDistance = Math.max(dist, arrivalRadius);
    }

    const profile = resolveFlightProfile(player, state);
    const guidance = computeAutopilotGuidance(state, player, target, dist, arrivalRadius);
    const desiredAngle = Math.atan2(guidance.z, guidance.x);
    const turnError = wrapAngle(desiredAngle - (player.rot || 0));
    const turnIntent = clampUnit(turnError / AUTOPILOT_TURN_SOFT_ANGLE);
    const tx = dist > 0.0001 ? dx / dist : Math.cos(player.rot || 0);
    const tz = dist > 0.0001 ? dz / dist : Math.sin(player.rot || 0);
    const vx = (player.vel && player.vel.x) || 0;
    const vz = (player.vel && player.vel.z) || 0;
    const closingSpeed = vx * tx + vz * tz;
    const lateralSpeed = Math.abs(vx * -tz + vz * tx);
    const brakeAccel = Math.max(profile.reverseAccel || 0, (profile.mainAccel || 0) * 0.72, 1);
    const desiredSpeed = Math.sqrt(Math.max(0, 2 * brakeAccel * Math.max(0, dist - arrivalRadius)));
    const stoppingDistance = closingSpeed > 0 ? (closingSpeed * closingSpeed) / (2 * brakeAccel) : 0;
    const halfway = Number.isFinite(autopilot.initialDistance) && dist <= autopilot.initialDistance * 0.52;
    const shouldBrake = closingSpeed > 4 && (
      dist <= stoppingDistance + arrivalRadius + 45 + lateralSpeed * 1.4 ||
      (halfway && closingSpeed > desiredSpeed * 0.92)
    );

    let moveX = 0;
    let moveZ = 0;
    let brake = false;
    let boost = false;
    if (shouldBrake) {
      const counter = counterVelocityInput(player);
      moveX = counter.moveX;
      moveZ = counter.moveZ;
      brake = true;
    } else {
      const cf = Math.cos(player.rot || 0), sf = Math.sin(player.rot || 0);
      const rightX = -sf, rightZ = cf;
      const facingDot = Math.cos(turnError);
      moveZ = facingDot > -0.25 ? clampUnit(0.35 + facingDot * 0.78) : 0;
      moveX = clampUnit((guidance.x * rightX + guidance.z * rightZ) * 0.72);
      const cruiseClear = !guidance.avoiding && Math.abs(turnError) < 0.34;
      boost = cruiseClear && dist > Math.max(arrivalRadius * 5, stoppingDistance * 1.25 + 220) && speed < (profile.maxSpeed || 120) * 1.85;
    }

    const result = {
      ...raw,
      moveX,
      moveZ,
      turnIntent,
      boost,
      brake,
      controlsBlocked: false,
      _autopilot: true,
    };
    this._syncAutopilotInput(result, { dist, arrivalRadius, braking: brake, avoiding: guidance.avoiding, target });
    autopilot.status = brake ? 'braking' : guidance.avoiding ? 'avoiding' : boost ? 'boosting' : 'cruising';
    autopilot.distance = dist;
    return result;
  },

  _syncAutopilotInput(input, telemetry) {
    const stateInput = this.state && this.state.input;
    if (!stateInput || !input) return;
    stateInput.moveX = input.moveX;
    stateInput.moveZ = input.moveZ;
    stateInput.turnIntent = input.turnIntent;
    stateInput.boost = input.boost;
    stateInput.brake = input.brake;
    stateInput.autopilot = telemetry || true;
    const actions = stateInput.actions || (stateInput.actions = {});
    actions.brake = !!input.brake;
  },

  _stopAutopilot(reason) {
    const nav = this.state && this.state.nav;
    const autopilot = nav && nav.autopilot;
    if (!autopilot || autopilot.active !== true) return;
    autopilot.active = false;
    autopilot.status = reason || 'idle';
    if (this.state && this.state.input) {
      this.state.input.autopilot = false;
      if (this.state.input.actions) this.state.input.actions.brake = false;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('nav:autopilot', autopilot);
      this.bus.emit('toast', {
        text: reason === 'arrived' ? 'Autopilot arrived' : 'Autopilot disengaged',
        kind: reason === 'arrived' ? 'good' : 'info',
        ttl: 2,
      });
    }
  },

  _emitThrustCue(e, input, frame) {
    if (!this.bus || typeof this.bus.emit !== 'function' || !e) return;
    if (this.state && e.id !== this.state.playerId) return;
    const throttle = clampUnit((input && input.moveZ) || 0);
    const strafe = clampUnit((input && input.moveX) || 0);
    const manual = Math.abs(throttle) > 0.025 || Math.abs(strafe) > 0.025;
    const speed = frame && Number.isFinite(frame.speed) ? frame.speed : Math.hypot((e.vel && e.vel.x) || 0, (e.vel && e.vel.z) || 0);
    const neutralAssistBrake = frame && frame.neutralCounterThrust && frame.mode === 'assisted' && !manual && speed > 1.2;
    const brake = !!(input && input.brake) || throttle < -0.025 || neutralAssistBrake;
    if (!manual && !brake && !(e.flags && e.flags.boosting)) return;
    this.bus.emit('ship:thrust', {
      id: e.id,
      shipId: e.id,
      throttle: Math.max(0, throttle),
      reverse: brake ? Math.max(0.25, Math.min(1, speed / Math.max(30, (e.maxSpeed || 120) * 0.5))) : 0,
      strafe,
      boost: !!(e.flags && e.flags.boosting),
      nozzles: thrustNozzles(throttle, strafe, brake),
    });
  },
};

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function flightCraftCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.shipLike) return index.shipLike;
  return (state && state.entityList) || [];
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

function hasManualFlightInput(input) {
  if (!input) return false;
  return Math.abs(input.moveX || 0) > 0.08 ||
    Math.abs(input.moveZ || 0) > 0.08 ||
    Math.abs(input.turnIntent || 0) > 0.08 ||
    !!input.boost ||
    !!input.brake;
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

function computeAutopilotGuidance(state, player, target, distance, arrivalRadius) {
  const px = player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const pz = player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  const baseX = distance > 0.0001 ? (target.x - px) / distance : Math.cos(player.rot || 0);
  const baseZ = distance > 0.0001 ? (target.z - pz) / distance : Math.sin(player.rot || 0);
  const perpX = -baseZ;
  const perpZ = baseX;
  const speed = Math.hypot((player.vel && player.vel.x) || 0, (player.vel && player.vel.z) || 0);
  const lookAhead = Math.max(AUTOPILOT_MIN_LOOKAHEAD, Math.min(AUTOPILOT_MAX_LOOKAHEAD, speed * 3.2 + distance * 0.24));
  let steerX = baseX;
  let steerZ = baseZ;
  let avoiding = false;
  const maxProjection = Math.max(0, Math.min(distance - arrivalRadius, lookAhead));
  if (maxProjection > 0) {
    for (const obstacle of autopilotObstacles(state, player, target)) {
      const ox = obstacle.pos.x - px;
      const oz = obstacle.pos.z - pz;
      const projection = ox * baseX + oz * baseZ;
      if (projection <= 0 || projection > maxProjection) continue;
      const lateral = ox * perpX + oz * perpZ;
      const clearance = (player.radius || 0) + (obstacle.radius || 0) + 58 + Math.min(70, speed * 0.22);
      const absLateral = Math.abs(lateral);
      if (absLateral >= clearance) continue;
      const side = absLateral > 0.01 ? -Math.sign(lateral) : (((state && state.tick) || 0) % 2 ? 1 : -1);
      const depth = 1 - projection / Math.max(1, maxProjection);
      const strength = (1 - absLateral / Math.max(1, clearance)) * (0.7 + depth * 0.8);
      steerX += perpX * side * strength * 1.65;
      steerZ += perpZ * side * strength * 1.65;
      avoiding = true;
    }
  }
  const len = Math.hypot(steerX, steerZ) || 1;
  return { x: steerX / len, z: steerZ / len, avoiding };
}

function autopilotObstacles(state, player, target) {
  const out = [];
  const list = state && state.entityList ? state.entityList : [];
  for (const e of list) {
    if (!e || e === player || e === target.entity || e.alive === false || !e.pos) continue;
    if (e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    const radius = Number.isFinite(e.radius) ? e.radius : 0;
    if (radius <= 0 && e.type !== 'station' && e.type !== 'asteroid' && e.type !== 'wreck' && e.type !== 'ship') continue;
    out.push(e);
  }
  return out;
}

function counterVelocityInput(player) {
  const vx = player.vel && Number.isFinite(player.vel.x) ? player.vel.x : 0;
  const vz = player.vel && Number.isFinite(player.vel.z) ? player.vel.z : 0;
  const speed = Math.hypot(vx, vz);
  if (!(speed > 0.001)) return { moveX: 0, moveZ: 0 };
  const nx = -vx / speed;
  const nz = -vz / speed;
  const cf = Math.cos(player.rot || 0);
  const sf = Math.sin(player.rot || 0);
  return {
    moveZ: clampUnit(nx * cf + nz * sf),
    moveX: clampUnit(nx * -sf + nz * cf),
  };
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

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < -1 ? -1 : n > 1 ? 1 : n;
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
  const dashCostFallback = boost.dashImpulse > 0 ? max * 0.9 : DEFAULT_BOOST_RESOURCE.dashCost;
  boost.dashCost = finiteNonNegative(boost.dashCost, dashCostFallback);
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
