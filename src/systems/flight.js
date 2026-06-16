// Flight system: turns intent (player input or AI intent) into thrust/rotation. Semi-Newtonian:
// thrust + linear drag => soft terminal speed; turn-toward-aim rotation; boost; strafe.
// Updates velocity + rotation; physics.integrate moves position (ARCHITECTURE §2.3 step 3).
import { wrapAngle } from '../core/rng.js';

export const flight = {
  name: 'flight',
  init(ctx) { this.state = ctx.state; this.bus = ctx.bus; },

  update(dt, state) {
    const player = state.entities.get(state.playerId);
    if (player && state.mode === 'flight' && !player.flags.docked) {
      const inp = state.input;
      this.applyIntent(player, { moveX: inp.moveX, moveZ: inp.moveZ, boost: inp.boost, aimAngle: inp.aimAngle }, dt);
      if (inp.boost && !player.flags.boosting) { player.flags.boosting = true; this.bus.emit('ship:boostStart', { shipId: player.id }); }
      else if (!inp.boost && player.flags.boosting) { player.flags.boosting = false; this.bus.emit('ship:boostStop', { shipId: player.id }); }
    }
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive || e.id === state.playerId) continue;
      const intent = e.data && e.data.intent;
      if (intent) this.applyIntent(e, intent, dt);
      else this.applyDrag(e, dt);
    }
  },

  applyIntent(e, intent, dt) {
    const turn = e.turnRate || 3;
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
  },

  applyDrag(e, dt) {
    const drag = e.drag || 1.2;
    e.vel.x -= drag * e.vel.x * dt;
    e.vel.z -= drag * e.vel.z * dt;
  },
};
