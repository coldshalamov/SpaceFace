/** Mobile intent only. No entities, velocity, RNG, DOM, or timers are mutated here. */
export const TUNING = Object.freeze({
  deadzone: 0.12, exponent: 1.35, boostEnter: 1.38, boostExit: 1.16,
  boostDwellMs: 75, brakeDwellMs: 260, flickMaxMs: 210, flickMinRadius: 0.85,
  flickMinSpeed: 0.65, flickStraightness: 0.78, flickPulseS: 0.065,
});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function stickRadius(width, height, scale = 1) {
  return clamp(Math.min(width, height) * 0.19, 54, 86) * clamp(finite(scale, 1), 0.75, 1.35);
}
export function shapeStick(dx, dy, radius, wasBoosting = false) {
  const distance = Math.hypot(finite(dx), finite(dy));
  const raw = distance / Math.max(1, finite(radius, 70));
  const magnitude = Math.pow(clamp((raw - TUNING.deadzone) / (1 - TUNING.deadzone), 0, 1), TUNING.exponent);
  return { x: distance ? dx / distance : 0, y: distance ? dy / distance : 0,
    magnitude, raw, boostCandidate: raw >= (wasBoosting ? TUNING.boostExit : TUNING.boostEnter) };
}
/** A fixed-start floating stick. Extra fingers cannot steal another finger's role. */
export class MobileGestures {
  constructor() {
    this.pointers = new Map(); this.stick = null; this.wheel = null; this.wheelPage = 0;
    this.pulses = []; this.sampled = {}; this.toggle = {}; this.flickS = 0; this.flick = null;
    this.activity = false; this.cancelSerial = 0; this.cancelledRoles = new Set();
  }
  begin(id, role, x, y, ms, radius = 70) {
    if (![x, y, ms, radius].every(Number.isFinite) || this.pointers.has(id)) return false;
    if ([...this.pointers.values()].some(p => p.role === role)) return false;
    const p = { id, role, ox: x, oy: y, x, y, started: ms, last: ms, path: 0,
      radius, boost: false, beyondS: 0, heldS: 0, moved: false };
    this.pointers.set(id, p); if (role === 'stick') this.stick = p;
    this.activity = true; return true;
  }
  move(id, x, y, ms) {
    const p = this.pointers.get(id);
    if (!p || ![x, y, ms].every(Number.isFinite) || ms < p.last) return false;
    p.path += Math.hypot(x - p.x, y - p.y); p.x = x; p.y = y; p.last = ms;
    if (Math.hypot(x - p.ox, y - p.oy) > 10) p.moved = true;
    this.activity = true; return true;
  }
  end(id, x, y, ms, cancel = false) {
    const p = this.pointers.get(id); if (!p) return null;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(ms)) this.move(id, x, y, ms);
    const elapsed = Math.max(1, p.last - p.started);
    const d = Math.hypot(p.x - p.ox, p.y - p.oy);
    if (!cancel && p.role === 'stick' && elapsed <= TUNING.flickMaxMs
      && d >= p.radius * TUNING.flickMinRadius && d / elapsed >= TUNING.flickMinSpeed
      && d / Math.max(d, p.path) >= TUNING.flickStraightness && !p.boost) {
      this.flickS = TUNING.flickPulseS;
      this.flick = shapeStick(p.x - p.ox, p.y - p.oy, p.radius);
    }
    // Sub-frame taps survive one fixed tick; cancellation is NEVER a tap.
    if (!cancel && (p.role === 'fire' || p.role === 'tether') && !p.sampled) this.pulse(p.role);
    if (cancel) { this.cancelledRoles.add(p.role); this.pulses = this.pulses.filter(a => a !== p.role); }
    if (p === this.stick) this.stick = null;
    this.pointers.delete(id); this.activity = true; return p;
  }
  pulse(action) { if (typeof action === 'string' && this.pulses.length < 32) this.pulses.push(action); }
  held(role) { return [...this.pointers.values()].some(p => p.role === role); }
  reset() {
    this.pointers.clear(); this.stick = null; this.wheel = null; this.pulses.length = 0;
    this.sampled = {}; this.toggle = {}; this.flickS = 0; this.flick = null;
    this.cancelSerial++; this.activity = true; this.cancelledRoles.clear();
  }
  sample(dt) {
    const step = clamp(finite(dt), 0, 0.1);
    const actions = Object.create(null);
    // Duplicate requests are serialized with a neutral tick between edges.
    const remaining = [];
    for (const action of this.pulses) {
      if (this.sampled[action] || actions[action]) remaining.push(action); else actions[action] = true;
    }
    this.pulses = remaining;
    for (const p of this.pointers.values()) { actions[p.role] = true; p.sampled = true; }
    this.sampled = actions;
    const p = this.stick;
    let flight = { x: 0, y: 0, magnitude: 0, raw: 0, boost: false, brake: false, active: false };
    if (p) {
      const shaped = shapeStick(p.x - p.ox, p.y - p.oy, p.radius, p.boost);
      p.heldS += step;
      if (shaped.boostCandidate) {
        p.beyondS += step;
        if (p.beyondS * 1000 >= TUNING.boostDwellMs) p.boost = true;
      } else { p.beyondS = 0; p.boost = false; }
      flight = { ...shaped, active: true, boost: p.boost,
        brake: shaped.raw <= TUNING.deadzone && p.heldS * 1000 >= TUNING.brakeDwellMs };
    } else if (this.flickS > 0 && this.flick) {
      flight = { ...this.flick, magnitude: 1, boost: true, brake: false, active: true, flick: true };
      this.flickS = Math.max(0, this.flickS - step);
    }
    const gun = [...this.pointers.values()].find(p => p.role === 'fire');
    const aim = gun && Math.hypot(gun.x - gun.ox, gun.y - gun.oy) > 14
      ? shapeStick(gun.x - gun.ox, gun.y - gun.oy, gun.radius) : null;
    const tether = [...this.pointers.values()].find(p => p.role === 'tether');
    if (tether && Math.abs(tether.y - tether.oy) > 18) actions[tether.y < tether.oy ? 'reelIn' : 'reelOut'] = true;
    const cancelledRoles = new Set(this.cancelledRoles); this.cancelledRoles.clear();
    return { flight, actions, aim, cancelledRoles };
  }
}
/** Project a screen direction through the actual camera. Snapshot scratch ray values. */
export function screenDirection(x, y, helpers, player, width, height) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1e-8) return null;
  if (!helpers?.raycastToPlane || !player?.pos) {
    const d = Math.hypot(x, y); return { x: x / d, z: -y / d };
  }
  const screen = helpers.worldToScreen?.({ ...player.pos, y: 0 });
  const sx = finite(screen?.x, width / 2), sy = finite(screen?.y, height / 2);
  const at = (a, b) => helpers.raycastToPlane({ x: a / width * 2 - 1, y: 1 - b / height * 2 });
  const c = at(sx, sy); if (!Number.isFinite(c?.x) || !Number.isFinite(c?.z)) return null;
  const cx = c.x, cz = c.z;
  const q = at(sx + x * 12, sy + y * 12);
  if (!Number.isFinite(q?.x) || !Number.isFinite(q?.z)) return null;
  const dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
  return d > 1e-8 ? { x: dx / d, z: dz / d } : null;
}
export function steerToward(direction, rot, magnitude) {
  if (!direction) return { turn: 0, thrust: 0 };
  const error = wrap(Math.atan2(direction.z, direction.x) - finite(rot));
  return { turn: Math.abs(error) < 0.012 ? 0 : clamp(error / 0.55, -1, 1),
    // Turn without driving the wrong way. No instantaneous rotation or velocity writes.
    thrust: magnitude * (0.18 + 0.82 * Math.max(0, Math.cos(error))) };
}
/** Right-edge semicircle: top -> left -> bottom. A neutral core cancels selection. */
export function wheelSlot(x, y, cx, cy, radius, count = 6, previous = -1) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (dx > 12 || d < radius * 0.30 || d > radius * 1.30) return -1;
  const angle = Math.atan2(-dx, -dy);
  if (angle < 0 || angle > Math.PI) return -1;
  const sector = Math.PI / count;
  if (previous >= 0 && Math.abs(angle - (previous + 0.5) * sector) < sector * 0.62) return previous;
  return clamp(Math.floor(angle / sector), 0, count - 1);
}
export function canFly(state, documentLike) {
  return !!state && state.mode === 'flight' && state.player?.alive !== false
    && !state.paused && !state.input?.blocked && !state.ui?.screenStack?.length
    && !documentLike?.hidden
    && !documentLike?.body?.classList?.contains('ui-modal-open')
    && !documentLike?.body?.classList?.contains('ui-live-screen');
}
export function shouldEnable(config, width, height, coarse, touchPoints) {
  if (config?.enabled != null) return config.enabled === true;
  return coarse && touchPoints > 0 && Math.min(width, height) >= 280;
}
