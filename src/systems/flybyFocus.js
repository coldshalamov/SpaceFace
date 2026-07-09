// Flyby Focus — overnight B1 signature assist.
// When the player is closing/passing a hostile at high relative speed, open a short window of
// expanded massline latch + camera zoom cue. Sim stays at 60 Hz; latch scale is read by tetherGameplay.
// Deterministic: only uses state.simTime and entity kinematics (no Math.random / wall clock).
import { isHostileToPlayer } from './scanner.js';

const FOCUS_DURATION_S = 1.15;
const COOLDOWN_S = 5.5;
const MIN_REL_SPEED = 72;
const MAX_RANGE = 240;
const LATCH_SCALE = 2.6;
const MIN_FORWARD_DOT = 0.15; // roughly forward hemisphere

function finite(v, fb = 0) {
  return Number.isFinite(v) ? v : fb;
}

function ensureFocus(state) {
  const player = state.player || (state.player = {});
  if (!player.flybyFocus || typeof player.flybyFocus !== 'object') {
    player.flybyFocus = {
      active: false,
      latchScale: 1,
      until: 0,
      cooldownUntil: 0,
      targetId: null,
      zoom: 0,
    };
  }
  return player.flybyFocus;
}

function playerEntity(state) {
  if (!state || !state.entities || state.playerId == null) return null;
  return state.entities.get(state.playerId) || null;
}

function isHostileShip(state, ent, player) {
  if (!ent || !ent.alive || !ent.pos) return false;
  if (ent.type !== 'ship' && ent.type !== 'drone') return false;
  if (ent.id === player.id) return false;
  return isHostileToPlayer(ent, player.team, state);
}

/** Pure helper: pick best flyby candidate. Exported for checks. */
export function pickFlybyTarget(state, player, list) {
  if (!player || !player.pos) return null;
  const px = player.pos.x;
  const pz = player.pos.z;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const pSpeed = Math.hypot(pvx, pvz);
  if (pSpeed < 40) return null;
  const heading = Number.isFinite(player.rot) ? player.rot : Math.atan2(pvz, pvx);
  const hx = Math.cos(heading);
  const hz = Math.sin(heading);

  let best = null;
  let bestScore = -Infinity;
  for (const ent of list || []) {
    if (!isHostileShip(state, ent, player)) continue;
    const dx = ent.pos.x - px;
    const dz = ent.pos.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_RANGE || dist < 12) continue;
    const along = (dx * hx + dz * hz) / Math.max(1e-6, dist);
    if (along < MIN_FORWARD_DOT) continue;
    const evx = finite(ent.vel && ent.vel.x);
    const evz = finite(ent.vel && ent.vel.z);
    const rel = Math.hypot(pvx - evx, pvz - evz);
    if (rel < MIN_REL_SPEED) continue;
    // Prefer close, high relative speed, more ahead.
    const score = rel * 1.2 + along * 40 - dist * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = { id: ent.id, dist, rel, along };
    }
  }
  return best;
}

export const flybyFocus = {
  name: 'flybyFocus',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    ensureFocus(this.state);
  },

  update(dt, state) {
    const st = state || this.state;
    if (!st || st.mode !== 'flight') return;
    const focus = ensureFocus(st);
    const now = Number.isFinite(st.simTime) ? st.simTime : 0;
    const player = playerEntity(st);
    if (!player || (player.flags && player.flags.docked)) {
      focus.active = false;
      focus.latchScale = 1;
      focus.zoom = 0;
      return;
    }

    if (focus.active && now >= focus.until) {
      focus.active = false;
      focus.latchScale = 1;
      focus.zoom = Math.max(0, focus.zoom - dt * 2.5);
      focus.targetId = null;
      if (this.bus) this.bus.emit('flybyFocus:end', {});
    }

    if (focus.active) {
      focus.latchScale = LATCH_SCALE;
      focus.zoom = Math.min(1, focus.zoom + dt * 4);
      return;
    }

    focus.zoom = Math.max(0, focus.zoom - dt * 2.2);
    if (now < focus.cooldownUntil) return;

    const list = st.entityList || (st.entities && typeof st.entities.values === 'function'
      ? [...st.entities.values()]
      : []);
    const pick = pickFlybyTarget(st, player, list);
    if (!pick) return;

    focus.active = true;
    focus.latchScale = LATCH_SCALE;
    focus.until = now + FOCUS_DURATION_S;
    focus.cooldownUntil = now + COOLDOWN_S;
    focus.targetId = pick.id;
    focus.zoom = 0.35;
    if (this.bus) {
      this.bus.emit('flybyFocus:start', { targetId: pick.id, rel: pick.rel, dist: pick.dist });
      this.bus.emit('toast', {
        text: 'FLYBY FOCUS — latch window open',
        kind: 'good',
        ttl: 1.6,
      });
      // Juice: brief camera kiss + audio cue so the window is felt, not only text.
      this.bus.emit('camera:shake', { amount: 0.08 });
      this.bus.emit('audio:cue', { id: 'ui_confirm' });
    }
  },
};

export default flybyFocus;
