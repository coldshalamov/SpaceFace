// Flight system: turns intent (player input or AI intent) into thrust/rotation, and owns the
// ship's orientation (yaw + bank). Semi-Newtonian: thrust along the nose + linear drag => soft
// terminal speed; momentum carries so the ship "flies" through space. Updates velocity + rotation;
// physics.integrate moves position (ARCHITECTURE §2.3 step 3). Rotation is OWNED HERE — physics
// no longer integrates e.rot (Phase 1 fix of the prior double-integration bug).
//
// CONTROL MODELS (Phase 1 rework):
//   • PLAYER (new): ↑/W throttle forward, ←→ yaw the nose, mouse aims weapons independently.
//     The ship banks (rolls) into turns for a cinematic, weighty feel.
//   • NPC (unchanged contract): ai.js writes e.data.intent {moveX,moveZ,boost,fire,fireGroup,
//     aimAngle}; flight turns the nose toward aimAngle and thrusts along it. The 6-field intent
//     schema is FROZEN — do not break it or AI dogfighting stops working.
import { wrapAngle } from '../core/rng.js';

// Banking tunables. target bank = turnIntent-scaled angle; a spring+damp eases toward it with a
// slight overshoot so the hull "settles" after a turn instead of snapping flat.
const BANK_MAX = 0.95;        // rad (~54°) max roll for the twitchiest hull at full bankFactor
const BANK_SPRING = 9.0;      // higher = snappier bank response
const BANK_DAMP = 5.5;        // critical-ish damping (BANK_SPRING/2 would be exactly critical)
const BANK_RETURN_SPRING = 4.0; // extra pull back to level when not turning (levels out promptly)
const ANG_VEL_DRAG = 2.2;     // per-second decay of yaw rate for drifting (intent-less) ships
const NPC_TURN = 3.0;         // fallback turn rate if an NPC entity lacks e.turnRate

export const flight = {
  name: 'flight',
  init(ctx) { this.state = ctx.state; this.bus = ctx.bus; },

  update(dt, state) {
    const player = state.entities.get(state.playerId);
    if (player && state.mode === 'flight' && !player.flags.docked) {
      this.applyPlayerIntent(player, dt);
      // Emit boost start/stop on the TRUE transition (applyPlayerIntent already set flags.boosting
      // to the actual sustained-boost state above). The old code re-derived it from raw input.boost,
      // which desynced the audio loop and VFX trails whenever energy cut boost mid-hold.
      const wasBoosting = player._wasBoosting || false;
      if (player.flags.boosting && !wasBoosting) this.bus.emit('ship:boostStart', { shipId: player.id });
      else if (!player.flags.boosting && wasBoosting) this.bus.emit('ship:boostStop', { shipId: player.id });
      player._wasBoosting = player.flags.boosting;
    } else if (player && !player.flags.docked) {
      // Not in active flight (paused/menu): still ease the bank back to level so it doesn't freeze tilted.
      this._settleBank(player, dt);
    }
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      if (intent) this.applyIntent(e, intent, dt);
      else { this.applyDrag(e, dt); this._settleBank(e, dt); }
    }
  },

  // ---- PLAYER: turn-nose + throttle + bank (mouse aims weapons, not the ship) ----
  applyPlayerIntent(e, dt) {
    const inp = this.state.input;
    const turn = e.turnRate || 3;
    const boost = e.boost || (e.boost = { energy: 0, max: 0, drainRate: 40, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 });

    // Yaw the nose from the turn-intent. (turnIntent: +1 right/clockwise, -1 left.) Sign matches
    // the world-rot convention (+rot = +angle = atan2(z,x)), so +turnIntent increases rot.
    const yawStep = inp.turnIntent * turn * dt;
    e.rot = wrapAngle(e.rot + yawStep + this._bankYawFromDrift(e));
    e.angVel = yawStep / dt;            // actual yaw rate (rad/s); physics no longer re-integrates it

    // --- Phase 3 boost/dash ---
    // Tap Shift (rising edge) = DASH: an instant impulse along the nose (or current heading), on its
    // own cooldown, costing a chunk of boost energy. Hold Shift = SUSTAINED BOOST: drains energy
    // continuously for +thrust/+top-speed. Boost cuts out below a threshold and can't restart until
    // it regenerates back above it (anti-flicker hysteresis). A ship with boost.max == 0 can't boost.
    if (boost.dashCdT > 0) boost.dashCdT = Math.max(0, boost.dashCdT - dt);
    const dashJustPressed = inp.boost && !this._prevBoost;
    let didDash = false;
    if (dashJustPressed && boost.dashImpulse > 0 && boost.dashCdT <= 0 && boost.energy >= boost.dashImpulse * 0.6) {
      // dash along the nose; if no throttle held, dash still works (escape move)
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const imp = boost.dashImpulse;
      e.vel.x += cf * imp;
      e.vel.z += sf * imp;
      boost.energy = Math.max(0, boost.energy - boost.dashImpulse * 0.6);
      boost.dashCdT = boost.dashCd;
      didDash = true;
      this.bus.emit('ship:dash', { shipId: e.id, impulse: imp });
    }
    this._prevBoost = !!inp.boost;

    // sustained boost: only while holding Shift (and not just having dashed), with hysteresis gating
    if (!('_boostArmed' in boost)) boost._boostArmed = true;
    let boosting = false;
    if (inp.boost && boost.max > 0) {
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

    // Throttle along the NOSE direction (not strafe). forward axis = (cos, sin).
    const thrust = (e.thrust || 40) * (boosting ? 2.2 : 1);
    const throttle = inp.moveZ || 0;    // +1 forward, -1 reverse
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    let ax = cf * throttle * thrust;
    let az = sf * throttle * thrust;
    if (throttle < 0) { ax *= 0.5; az *= 0.5; }  // reverse thrust is weaker

    const drag = e.drag || 1.2;
    e.vel.x += (ax - drag * e.vel.x) * dt;
    e.vel.z += (az - drag * e.vel.z) * dt;

    const max = (e.maxSpeed || 120) * (boosting ? 2.0 : 1.15);
    const sp = Math.hypot(e.vel.x, e.vel.z);
    if (sp > max) { const s = max / sp; e.vel.x *= s; e.vel.z *= s; }

    // Bank: roll the hull into the turn. Combine the player's turn-intent with the actual yaw rate
    // so even a drifting turn banks realistically. bankFactor (per hull) scales the aggressiveness.
    const bankFactor = e.bankFactor != null ? e.bankFactor : 0.6;
    // Lateral velocity also leaks a little bank — a ship sliding sideways leans, like an aircraft.
    const sf2 = -Math.sin(e.rot), cf2 = Math.cos(e.rot); // right axis = (-sin, cos)
    const lateral = e.vel.x * cf2 + e.vel.z * sf2;
    const lateralBank = (lateral / Math.max(1, e.maxSpeed || 120)) * 0.25;
    const targetBank = (inp.turnIntent * bankFactor + lateralBank) * BANK_MAX;
    this._integrateBank(e, targetBank, dt, /*returnWhenIdle*/ true);
  },

  // small yaw assist from the current bank angle so a banked ship gently carves (a turn feels like
  // it commits, not like flying on rails). Returns radians to add to the yaw step this tick.
  _bankYawFromDrift(e) {
    if (!e.bank) return 0;
    return e.bank * 0.15; // banking right (+bank) carves a gentle right yaw, left carves left
  },

  // ---- NPC: turn toward aimAngle + thrust along ship-relative axes (unchanged contract) ----
  applyIntent(e, intent, dt) {
    const turn = e.turnRate || NPC_TURN;
    const d = wrapAngle((intent.aimAngle || 0) - e.rot);
    const step = Math.max(-turn * dt, Math.min(turn * dt, d));
    e.rot = wrapAngle(e.rot + step);
    e.angVel = step / dt;
    e.flags.boosting = !!intent.boost;

    const thrust = (e.thrust || 40) * (intent.boost ? 2.2 : 1);
    const fwd = intent.moveZ || 0;
    const str = intent.moveX || 0;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    // forward axis = (cos,sin); right axis = (-sin,cos)
    let ax = (cf * fwd + (-sf) * str * 0.6) * thrust;
    let az = (sf * fwd + (cf) * str * 0.6) * thrust;
    if (fwd < 0) { ax *= 0.5; az *= 0.5; }       // reverse is weaker

    const drag = e.drag || 1.2;
    e.vel.x += (ax - drag * e.vel.x) * dt;
    e.vel.z += (az - drag * e.vel.z) * dt;

    const max = (e.maxSpeed || 120) * (intent.boost ? 2.0 : 1.15);
    const sp = Math.hypot(e.vel.x, e.vel.z);
    if (sp > max) { const s = max / sp; e.vel.x *= s; e.vel.z *= s; }

    // NPC banking mirrors the player's: bank into the actual yaw rate so dogfighters lean into jinks.
    const bankFactor = e.bankFactor != null ? e.bankFactor : 0.7;
    const sf2 = -Math.sin(e.rot), cf2 = Math.cos(e.rot);
    const lateral = e.vel.x * cf2 + e.vel.z * sf2;
    const lateralBank = (lateral / Math.max(1, e.maxSpeed || 120)) * 0.25;
    const turnDir = Math.max(-1, Math.min(1, e.angVel / Math.max(0.01, turn))); // -1..1 from yaw rate
    const targetBank = (turnDir * bankFactor + lateralBank) * BANK_MAX;
    this._integrateBank(e, targetBank, dt, /*returnWhenIdle*/ true);
  },

  // Linear-only drag for intent-less drifters. Also decays yaw rate so a ship that lost its pilot
  // stops spinning (the old code never damped angVel — physics kept rotating it forever).
  applyDrag(e, dt) {
    const drag = e.drag || 1.2;
    e.vel.x -= drag * e.vel.x * dt;
    e.vel.z -= drag * e.vel.z * dt;
    e.angVel -= ANG_VEL_DRAG * e.angVel * dt;
    e.rot = wrapAngle(e.rot + e.angVel * dt); // keep applying residual spin as it decays
  },

  // Spring-damper bank toward a target roll angle. Small extra spring pulls to 0 when idle so the
  // ship levels out promptly after releasing the turn. Result stored on e.bank (rad, + = roll right).
  _integrateBank(e, targetBank, dt, returnWhenIdle) {
    if (e.bank == null) e.bank = 0;
    if (e.bankVel == null) e.bankVel = 0;
    let acc = BANK_SPRING * (targetBank - e.bank) - BANK_DAMP * e.bankVel;
    if (returnWhenIdle) acc -= BANK_RETURN_SPRING * e.bank * (1 - Math.min(1, Math.abs(targetBank) / BANK_MAX));
    e.bankVel += acc * dt;
    e.bank += e.bankVel * dt;
    // clamp roll to a sane envelope so it never inverts
    const lim = BANK_MAX * 1.15;
    if (e.bank > lim) { e.bank = lim; e.bankVel = Math.min(0, e.bankVel); }
    else if (e.bank < -lim) { e.bank = -lim; e.bankVel = Math.max(0, e.bankVel); }
  },

  // Ease bank back to level (used when a ship has no active input — paused, menu, drifting NPC).
  _settleBank(e, dt) {
    if (!e.bank) return;
    this._integrateBank(e, 0, dt, true);
  },
};
