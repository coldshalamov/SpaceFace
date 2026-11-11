/** Mobile intent only. No entities, velocity, RNG, DOM, or timers are mutated here. */
export const TUNING = Object.freeze({
  deadzone: 0.12, exponent: 1.35, boostEnter: 1.38, boostExit: 1.16,
  boostDwellMs: 75, brakeDwellMs: 260, flickMaxMs: 210, flickMinRadius: 0.85,
  flickMinSpeed: 0.65, flickStraightness: 0.78, flickPulseS: 0.065,
});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** How far the two open-space contacts' separation must change before they pinch the camera. */
export const PINCH_GESTURE_MIN_PX = 12;
export function stickRadius(width, height, scale = 1) {
  return clamp(Math.min(width, height) * 0.19, 54, 86) * clamp(finite(scale, 1), 0.75, 1.6);
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
    // Two open-space thumbs ('stick' plus the 'pinch' candidate) armed by their landing distance;
    // once they change that distance past PINCH_GESTURE_MIN_PX the pair owns the camera's zoom.
    this.pinch = null;     // { a, b, d0 } — the live gesture: pointer ids and the armed distance
    this.pinchBase = null; // { a, b, d0 } — the candidate pair's baseline distance at landing
  }
  begin(id, role, x, y, ms, radius = 70) {
    if (![x, y, ms, radius].every(Number.isFinite) || this.pointers.has(id)) return false;
    if ([...this.pointers.values()].some(p => p.role === role)) return false;
    const p = { id, role, ox: x, oy: y, x, y, started: ms, last: ms, path: 0,
      radius, boost: false, beyondS: 0, heldS: 0, moved: false, suppressed: false };
    this.pointers.set(id, p); if (role === 'stick') this.stick = p;
    if (role === 'stick' || role === 'pinch') {
      const mate = [...this.pointers.values()].find(q => q !== p && (q.role === 'stick' || q.role === 'pinch'));
      if (mate) this.pinchBase = { a: mate.id, b: p.id, d0: Math.hypot(p.x - mate.x, p.y - mate.y) };
    }
    this.activity = true; return true;
  }
  move(id, x, y, ms) {
    const p = this.pointers.get(id);
    if (!p || ![x, y, ms].every(Number.isFinite) || ms < p.last) return false;
    p.path += Math.hypot(x - p.x, y - p.y); p.x = x; p.y = y; p.last = ms;
    if (Math.hypot(x - p.ox, y - p.oy) > 10) p.moved = true;
    if (this.pinchBase && !this.pinch && (id === this.pinchBase.a || id === this.pinchBase.b)) {
      const a = this.pointers.get(this.pinchBase.a), b = this.pointers.get(this.pinchBase.b);
      if (!a || !b) this.pinchBase = null;
      else {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (Math.abs(d - this.pinchBase.d0) > PINCH_GESTURE_MIN_PX) {
          this.pinch = { a: a.id, b: b.id, d0: d };
          // Gun contacts already down are suppressed for the rest of their hold: the release a
          // pinch leaves behind is "without firing", not a last shot as the stick re-arms.
          for (const q of this.pointers.values()) if (q.role === 'fire') q.suppressed = true;
        }
      }
    }
    this.activity = true; return true;
  }
  end(id, x, y, ms, cancel = false) {
    const p = this.pointers.get(id); if (!p) return null;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(ms)) this.move(id, x, y, ms);
    const wasPinch = !!(this.pinch && (this.pinch.a === id || this.pinch.b === id));
    if (wasPinch) this.pinch = null;
    const elapsed = Math.max(1, p.last - p.started);
    const d = Math.hypot(p.x - p.ox, p.y - p.oy);
    if (!cancel && !wasPinch && !p.suppressed && p.role === 'stick' && elapsed <= TUNING.flickMaxMs
      && d >= p.radius * TUNING.flickMinRadius && d / elapsed >= TUNING.flickMinSpeed
      && d / Math.max(d, p.path) >= TUNING.flickStraightness && !p.boost) {
      this.flickS = TUNING.flickPulseS;
      this.flick = shapeStick(p.x - p.ox, p.y - p.oy, p.radius);
    }
    // Sub-frame taps survive one fixed tick; cancellation is NEVER a tap.
    if (!cancel && !p.suppressed && (p.role === 'fire' || p.role === 'tether') && !p.sampled) this.pulse(p.role);
    if (cancel) { this.cancelledRoles.add(p.role); this.pulses = this.pulses.filter(a => a !== p.role); }
    if (p === this.stick) this.stick = null;
    this.pointers.delete(id);
    if (wasPinch || p.role === 'stick' || p.role === 'pinch') this.seatOpenThumb(wasPinch);
    this.activity = true; return p;
  }
  /** A thumb that outlives its open-space mate takes the stick where it rests; a thumb released
   *  from an active pinch re-anchors — it travelled with the gesture, so its old origin would
   *  read as a huge false deflection. A resting pair that never pinched keeps the stick's origin. */
  seatOpenThumb(wasPinch) {
    this.pinchBase = null;
    let s = this.stick;
    if (!s) {
      s = [...this.pointers.values()].find(q => q.role === 'stick' || q.role === 'pinch');
      if (!s) return;
      s.role = 'stick'; this.stick = s;
    } else if (!wasPinch) return;
    s.ox = s.x; s.oy = s.y; s.path = 0; s.moved = true;
    s.boost = false; s.beyondS = 0; s.heldS = 0;
  }
  pulse(action) { if (typeof action === 'string' && this.pulses.length < 32) this.pulses.push(action); }
  held(role) { return [...this.pointers.values()].some(p => p.role === role); }
  /** Live finger separation of the active pinch pair; null unless a pinch is live. */
  pinchDistance() {
    const g = this.pinch; if (!g) return null;
    const a = this.pointers.get(g.a), b = this.pointers.get(g.b);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null;
  }
  reset() {
    this.pointers.clear(); this.stick = null; this.wheel = null; this.pulses.length = 0;
    this.sampled = {}; this.toggle = {}; this.flickS = 0; this.flick = null;
    this.pinch = null; this.pinchBase = null;
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
    for (const p of this.pointers.values()) {
      // The stick and fire roles do not fire while a pinch owns the camera; suppressed contacts
      // stay dead until they lift so the release after a pinch is not a shot.
      if (!p.suppressed && !(this.pinch && p.role === 'fire')) actions[p.role] = true;
      p.sampled = true;
    }
    this.sampled = actions;
    const p = this.stick;
    let flight = { x: 0, y: 0, magnitude: 0, raw: 0, boost: false, brake: false, active: false };
    if (p && !this.pinch) {
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
    const gun = this.pinch ? null : [...this.pointers.values()].find(p => p.role === 'fire' && !p.suppressed);
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
const _nose0 = { x: 0, y: 0, z: 0 }, _nose1 = { x: 0, y: 0, z: 0 };
/**
 * Where the hull stands on screen (CSS px) and where its nose points there, as a dial angle (0 = up,
 * clockwise). The joystick draws this beside the stick's own direction so a pilot sees the hull catch up.
 * Null when there is no camera or the projection is degenerate. Reuses scratch points: no per-tick allocation.
 */
export function shipOnScreen(helpers, player) {
  if (!helpers?.worldToScreen || !player?.pos || !Number.isFinite(player.rot)) return null;
  _nose0.x = player.pos.x; _nose0.z = player.pos.z;
  _nose1.x = _nose0.x + Math.cos(player.rot) * 60; _nose1.z = _nose0.z + Math.sin(player.rot) * 60;
  const a = helpers.worldToScreen(_nose0), b = helpers.worldToScreen(_nose1);
  if (![a?.x, a?.y, b?.x, b?.y].every(Number.isFinite)) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-3) return null;
  return { x: a.x, y: a.y, headingDeg: Math.atan2(dx, -dy) * 180 / Math.PI };
}
export function steerToward(direction, rot, magnitude) {
  if (!direction) return { turn: 0, thrust: 0 };
  const error = wrap(Math.atan2(direction.z, direction.x) - finite(rot));
  return { turn: Math.abs(error) < 0.012 ? 0 : clamp(error / 0.55, -1, 1),
    // Turn without driving the wrong way. No instantaneous rotation or velocity writes.
    thrust: magnitude * (0.18 + 0.82 * Math.max(0, Math.cos(error))) };
}
/** Distance from a point to a rectangle. 0 when the point is inside. */
export function distanceToRect(x, y, rect) {
  if (!rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return Infinity;
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}
/** Inward arc in landscape, full orbit in portrait; both mirror for the other hand. */
export function wheelSlot(x, y, cx, cy, radius, count = 6, previous = -1, side = 'right', span = 180) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  const outward = side === 'left' ? -dx : dx;
  if ((span < 360 && outward > 12) || d < radius * 0.30 || d > radius * 1.30) return -1;
  let angle = Math.atan2(side === 'left' ? dx : -dx, -dy);
  if (span === 360 && angle < 0) angle += Math.PI * 2;
  const arc = span * Math.PI / 180;
  if (angle < 0 || angle > arc) return -1;
  const sector = arc / count;
  const delta = Math.abs(angle - (previous + 0.5) * sector);
  if (previous >= 0 && previous < count && Math.min(delta, span === 360 ? arc - delta : delta) < sector * 0.62) return previous;
  return clamp(Math.floor(angle / sector), 0, count - 1);
}
export function canFly(state, documentLike) {
  return !!state && state.mode === 'flight' && state.player?.alive !== false
    && !state.paused && !state.input?.blocked && !state.ui?.screenStack?.length
    && !documentLike?.hidden
    && !documentLike?.body?.classList?.contains('ui-modal-open')
    && !documentLike?.body?.classList?.contains('ui-live-screen');
}
/**
 * A phone-shaped screen: the touch deck is on and the short side is under tablet width. Screens that have a
 * desktop-scale composition (the title's dial) ask this to choose their phone composition instead.
 */
export function isPhoneLayout(documentLike = globalThis.document, win = globalThis.window) {
  const on = documentLike?.documentElement?.dataset?.sfMobile === '1';
  return on && Math.min(win?.innerWidth || 0, win?.innerHeight || 0) <= 600;
}
export function shouldEnable(config, width, height, coarse, touchPoints) {
  if (config?.enabled != null) return config.enabled === true;
  return coarse && touchPoints > 0 && Math.min(width, height) >= 280;
}
