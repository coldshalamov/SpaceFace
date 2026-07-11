// Flyby Focus — exact high-speed threat lease for the First Flyby milestone.
//
// Focus owns one target for a deterministic two-sim-second window, requests 50% slow-time through
// the shared time-effects authority, and reasserts state.player.targetId before tether gameplay runs.
// The 150 wu acquisition envelope is intentionally shared with the M1.3 camera composition packet:
// a wider starting pair cannot reliably fit inside its locked zoom-180 / 10%-margin geometry. Once
// acquired, however, the lease is temporal and survives the target flying beyond that start range.
// Deterministic: only state.simTime, entity kinematics, and stable ids; no RNG or wall clock.
import { createTimeEffects } from '../core/timeEffects.js';
import { isHostileToPlayer } from './scanner.js';

const FOCUS_DURATION_S = 2.0;
const FOCUS_SCALE = 0.5;
const COOLDOWN_S = 5.5;
const MIN_REL_SPEED = 96;
const MIN_CLOSING_SPEED = 25;
const MAX_ACQUIRE_RANGE = 150;
const MAX_TIME_TO_CLOSEST_S = 2.5;
const MAX_SURFACE_MISS = 96;
const LATCH_SCALE = 2.6;
const TIME_EFFECT_SOURCE = 'flyby-focus';
const FOCUS_REQUEST = Object.freeze({ scale: FOCUS_SCALE });

function finite(v, fb = 0) {
  return Number.isFinite(v) ? v : fb;
}

function freshFocus() {
  return {
    active: false,
    latchScale: 1,
    startedAt: 0,
    until: 0,
    cooldownUntil: 0,
    targetId: null,
    zoom: 0,
  };
}

function ensureFocus(state) {
  const player = state.player || (state.player = {});
  if (!player.flybyFocus || typeof player.flybyFocus !== 'object') {
    player.flybyFocus = freshFocus();
  }
  const focus = player.flybyFocus;
  if (typeof focus.active !== 'boolean') focus.active = false;
  if (!Number.isFinite(focus.latchScale)) focus.latchScale = 1;
  if (!Number.isFinite(focus.startedAt)) focus.startedAt = 0;
  if (!Number.isFinite(focus.until)) focus.until = 0;
  if (!Number.isFinite(focus.cooldownUntil)) focus.cooldownUntil = 0;
  if (!Number.isFinite(focus.zoom)) focus.zoom = 0;
  if (focus.targetId == null) focus.targetId = null;
  return focus;
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

function targetsPlayer(ent, playerId) {
  const combat = ent && ent.data && ent.data.combat;
  return !!(combat && (combat.targetId === playerId || combat.lockTarget === playerId));
}

function isArmed(ent) {
  return !!(ent && ent.data && Array.isArray(ent.data.weapons) && ent.data.weapons.length);
}

function compareStableId(a, b) {
  if (a === b) return 0;
  if (Number.isFinite(a) && Number.isFinite(b)) return a < b ? -1 : 1;
  const ak = String(a);
  const bk = String(b);
  return ak < bk ? -1 : 1;
}

function beatsBest(
  direct, timeToClosestS, closestSurfaceMiss, armed, mass, relativeSpeed, distance, id,
  bestDirect, bestTimeToClosestS, bestClosestSurfaceMiss, bestArmed, bestMass,
  bestRelativeSpeed, bestDistance, bestId,
) {
  if (bestId == null) return true;
  if (direct !== bestDirect) return direct;
  if (timeToClosestS !== bestTimeToClosestS) return timeToClosestS < bestTimeToClosestS;
  if (closestSurfaceMiss !== bestClosestSurfaceMiss) return closestSurfaceMiss < bestClosestSurfaceMiss;
  if (armed !== bestArmed) return armed;
  if (mass !== bestMass) return mass > bestMass;
  if (relativeSpeed !== bestRelativeSpeed) return relativeSpeed > bestRelativeSpeed;
  if (distance !== bestDistance) return distance < bestDistance;
  return compareStableId(id, bestId) < 0;
}

/** Pure helper: choose the imminent hostile pass with stable, order-independent tie-breaks. */
export function pickFlybyTarget(state, player, list) {
  if (!player || !player.pos) return null;
  const px = player.pos.x;
  const pz = player.pos.z;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);

  let bestId = null;
  let bestDistance = Infinity;
  let bestRelativeSpeed = -Infinity;
  let bestClosingSpeed = -Infinity;
  let bestTimeToClosestS = Infinity;
  let bestClosestSurfaceMiss = Infinity;
  let bestDirect = false;
  let bestArmed = false;
  let bestMass = -Infinity;
  for (const ent of list || []) {
    if (!isHostileShip(state, ent, player)) continue;
    const dx = ent.pos.x - px;
    const dz = ent.pos.z - pz;
    const distance = Math.hypot(dx, dz);
    if (distance > MAX_ACQUIRE_RANGE || distance < 12) continue;
    const evx = finite(ent.vel && ent.vel.x);
    const evz = finite(ent.vel && ent.vel.z);
    const rvx = evx - pvx;
    const rvz = evz - pvz;
    const relativeSpeedSq = rvx * rvx + rvz * rvz;
    const relativeSpeed = Math.sqrt(relativeSpeedSq);
    if (relativeSpeed < MIN_REL_SPEED) continue;
    const radialDot = dx * rvx + dz * rvz;
    const closingSpeed = -radialDot / Math.max(distance, 1e-6);
    if (closingSpeed < MIN_CLOSING_SPEED) continue;
    const timeToClosestS = -radialDot / Math.max(relativeSpeedSq, 1e-6);
    if (timeToClosestS < 0 || timeToClosestS > MAX_TIME_TO_CLOSEST_S) continue;
    const closestDx = dx + rvx * timeToClosestS;
    const closestDz = dz + rvz * timeToClosestS;
    const closestSurfaceMiss = Math.max(0, Math.hypot(closestDx, closestDz) - Math.max(0, finite(ent.radius)));
    if (closestSurfaceMiss > MAX_SURFACE_MISS) continue;
    const direct = targetsPlayer(ent, player.id);
    const armed = isArmed(ent);
    const mass = Math.max(0, finite(ent.mass, finite(ent.data && ent.data.mass)));
    if (!beatsBest(
      direct, timeToClosestS, closestSurfaceMiss, armed, mass, relativeSpeed, distance, ent.id,
      bestDirect, bestTimeToClosestS, bestClosestSurfaceMiss, bestArmed, bestMass,
      bestRelativeSpeed, bestDistance, bestId,
    )) continue;
    bestId = ent.id;
    bestDistance = distance;
    bestRelativeSpeed = relativeSpeed;
    bestClosingSpeed = closingSpeed;
    bestTimeToClosestS = timeToClosestS;
    bestClosestSurfaceMiss = closestSurfaceMiss;
    bestDirect = direct;
    bestArmed = armed;
    bestMass = mass;
  }
  if (bestId == null) return null;
  return {
    id: bestId,
    dist: bestDistance,
    rel: bestRelativeSpeed,
    distance: bestDistance,
    relativeSpeed: bestRelativeSpeed,
    closingSpeed: bestClosingSpeed,
    timeToClosestS: bestTimeToClosestS,
    closestSurfaceMiss: bestClosestSurfaceMiss,
  };
}

function activeTargetInvalidReason(state, player, targetId) {
  const target = targetId == null || !state.entities || !state.entities.get
    ? null
    : state.entities.get(targetId);
  if (!target || target.alive === false || !target.pos) return 'target-lost';
  if (!isHostileShip(state, target, player)) return 'not-hostile';
  return null;
}

export const flybyFocus = {
  name: 'flybyFocus',

  init(ctx) {
    // A registry/test re-init can reuse this singleton with a different state. Finish through the
    // old references before replacing them so the old time-effects request cannot leak, and any
    // end notification is delivered only to the bus that observed that lease.
    if (this.state && this.timeEffects) this._finish('reinit', true, true, true);
    if (Array.isArray(this._unsubs)) {
      for (const unsub of this._unsubs) if (typeof unsub === 'function') unsub();
    }
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.timeEffects = ctx.timeEffects || createTimeEffects(this.state);
    this._unsubs = [];
    ensureFocus(this.state);
    const resetOn = (event, reason) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      this._unsubs.push(this.bus.on(event, () => this._finish(reason, true, true, true)));
    };
    resetOn('save:restoring', 'load');
    resetOn('save:loaded', 'load');
    resetOn('game:started', 'new-game');
    resetOn('dock:docked', 'docked');
    resetOn('player:death', 'death');
  },

  destroy() {
    this._finish('destroy', true, true, true);
    if (Array.isArray(this._unsubs)) {
      for (const unsub of this._unsubs) if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
  },

  _finish(reason, clearPlayerTarget = false, resetCooldown = false, resetZoom = false) {
    const st = this.state;
    if (!st) return;
    const focus = ensureFocus(st);
    const targetId = focus.targetId;
    const wasActive = focus.active;
    focus.active = false;
    focus.latchScale = 1;
    focus.startedAt = 0;
    focus.until = 0;
    focus.targetId = null;
    if (resetCooldown) focus.cooldownUntil = 0;
    if (resetZoom) focus.zoom = 0;
    if (clearPlayerTarget && st.player && st.player.targetId === targetId) st.player.targetId = null;
    if (this.timeEffects) this.timeEffects.clear(TIME_EFFECT_SOURCE);
    if (wasActive && this.bus) {
      this.bus.emit('flybyFocus:end', {
        targetId,
        endedAt: Number.isFinite(st.simTime) ? st.simTime : 0,
        reason,
      });
    }
  },

  update(dt, state) {
    const st = state || this.state;
    if (!st) return;
    const focus = ensureFocus(st);
    if (st.mode !== 'flight') {
      if (focus.active) this._finish('mode-change', true, false, true);
      return;
    }
    const now = Number.isFinite(st.simTime) ? st.simTime : 0;
    const player = playerEntity(st);
    if (!player || (player.flags && player.flags.docked)) {
      if (focus.active) this._finish(player ? 'docked' : 'target-lost', true, false, true);
      return;
    }

    if (focus.active && now >= focus.until) {
      this._finish('expired', false);
      focus.zoom = Math.max(0, focus.zoom - dt * 2.5);
    }

    if (focus.active) {
      const invalidReason = activeTargetInvalidReason(st, player, focus.targetId);
      if (invalidReason) {
        this._finish(invalidReason, true);
      } else {
        st.player.targetId = focus.targetId;
        if (this.timeEffects) this.timeEffects.set(TIME_EFFECT_SOURCE, FOCUS_REQUEST);
      }
    }

    if (focus.active) {
      focus.latchScale = LATCH_SCALE;
      focus.zoom = Math.min(1, focus.zoom + dt * 4);
      return;
    }

    focus.zoom = Math.max(0, focus.zoom - dt * 2.2);
    if (now < focus.cooldownUntil) return;
    if (st.player && st.player.tether && st.player.tether.active) return;

    const list = st.entityList || (st.entities && typeof st.entities.values === 'function'
      ? [...st.entities.values()]
      : []);
    const pick = pickFlybyTarget(st, player, list);
    if (!pick) return;

    focus.active = true;
    focus.latchScale = LATCH_SCALE;
    focus.startedAt = now;
    focus.until = now + FOCUS_DURATION_S;
    focus.cooldownUntil = now + COOLDOWN_S;
    focus.targetId = pick.id;
    focus.zoom = 0.35;
    st.player.targetId = pick.id;
    if (this.timeEffects) this.timeEffects.set(TIME_EFFECT_SOURCE, FOCUS_REQUEST);
    if (this.bus) {
      this.bus.emit('flybyFocus:start', {
        targetId: pick.id,
        startedAt: now,
        until: focus.until,
        durationS: FOCUS_DURATION_S,
        scale: FOCUS_SCALE,
        relativeSpeed: pick.relativeSpeed,
        closingSpeed: pick.closingSpeed,
        timeToClosestS: pick.timeToClosestS,
        closestSurfaceMiss: pick.closestSurfaceMiss,
      });
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
