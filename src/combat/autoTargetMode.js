// Pursuit-slot selection/lifecycle plus the independent Massline target scorer.
// Rung 08 (massline auto-target wire): when the player is in MASSLINE MODE (tether out), the
// auto-target picker prefers swing potential over the weapon "hostiles-first/distance" sort.
// pickMasslineAutoTarget() below consumes the pure scorer from masslineTargetScoring.js.
import { isHostileToPlayer } from '../systems/scanner.js';
import { createPursuitSlot } from '../core/flight/pursuitSlotAssist.js';
import { rankMasslineTargets } from './masslineTargetScoring.js';

// Massline candidates include asteroids (mining/slingshot anchors), not just ships/drones — the
// tether latches onto anything physical. Weapons-only targeting stays hostiles-only elsewhere.
const MASSLINE_CANDIDATE_TYPES = new Set(['ship', 'drone', 'asteroid']);

export function createAutoTargetRuntime() {
  return { lastActive: false, lastReason: 'boot' };
}

export function toggleAutoTarget(state, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp) return false;
  // `autoFire` is retained as an inert old-save/default field only. PQ-007 retires its pointer-
  // locked route follower and weapon-aim ownership; G now selects a ship station instead.
  inp.autoFire = false;
  const current = inp.pursuitSlot;
  if (current && current.active) {
    inp.pursuitSlot = {
      ...current,
      active: false,
      reason: 'toggled-off',
      releasedTick: Number.isFinite(state.tick) ? state.tick : null,
    };
    runtime.lastActive = false;
    runtime.lastReason = 'toggled-off';
    if (bus) bus.emit('toast', { text: 'Pursuit assist OFF', kind: 'info', ttl: 2 });
    return false;
  }
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const target = lockedPursuitTarget(state);
  const selected = createPursuitSlot({ host: player, target, source: 'g' });
  inp.pursuitSlot = selected;
  runtime.lastActive = selected.active;
  runtime.lastReason = selected.reason;
  if (bus) {
    bus.emit('toast', {
      text: selected.active
        ? 'Pursuit assist ON · move pointer to adjust slot · movement keys release'
        : 'Pursuit assist needs a selected ship target',
      kind: selected.active ? 'good' : 'info',
      ttl: selected.active ? 3 : 2,
    });
  }
  return selected.active;
}

export function lockedPursuitTarget(state) {
  const id = state && state.player && state.player.targetId;
  if (id == null || !state.entities || !state.entities.get) return null;
  const e = state.entities.get(id);
  if (!e || e.alive === false || !e.pos) return null;
  if (e.type !== 'ship' && e.type !== 'drone') return null;
  return e;
}

export function tickAutoTarget(state, dt, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp) return;
  inp.autoFire = false;
  const slot = inp.pursuitSlot;
  if (!slot || !slot.active) {
    runtime.lastActive = false;
    return;
  }
  const target = lockedPursuitTarget(state);
  const targetChanged = !target || target.id !== slot.targetId;
  const routeBlocked = state.mode !== 'flight'
    || !!(state.ui && state.ui.screenStack && state.ui.screenStack.length);
  if (!targetChanged && !routeBlocked) {
    runtime.lastActive = true;
    runtime.lastReason = 'holding';
    return;
  }
  const reason = targetChanged ? 'target-lost' : 'controls-blocked';
  inp.pursuitSlot = {
    ...slot,
    active: false,
    reason,
    releasedTick: Number.isFinite(state.tick) ? state.tick : null,
  };
  runtime.lastActive = false;
  runtime.lastReason = reason;
  if (bus) bus.emit('toast', { text: 'Pursuit assist released · ' + reason.replace('-', ' '), kind: 'info', ttl: 2 });
}

/**
 * Massline auto-target picker (rung 08). When the player is in MASSLINE MODE (tether is out, i.e.
 * state.player.tether.active), pick the best slingshot/swing anchor via rankMasslineTargets instead
 * of the weapon "hostiles-first/distance" sort. Returns the picked record or null when not in
 * massline mode / no candidates.
 *
 * Hostility is resolved here via scanner.isHostileToPlayer (per AGENTS §6 — never couple to
 * factionId) and passed into the pure scorer as opts.isHostile, keeping the scorer pure.
 *
 * @param {object} state
 * @param {object} [opts]
 * @param {boolean} [opts.masslineMode]    - force massline mode on/off (default: tether.active).
 * @param {number}  [opts.maxRange=390]    - latch range; defaults to the stock tether maxLength.
 * @param {boolean} [opts.applyLock=true]  - write the pick to state.player.targetId.
 * @returns {{targetId, score, rating}|null}  - null when not in massline mode or no candidate.
 */
export function pickMasslineAutoTarget(state, opts = {}) {
  if (!state || !state.entities || !state.player) return null;

  const tether = state.player.tether;
  const masslineMode = opts.masslineMode != null ? !!opts.masslineMode : !!(tether && tether.active);
  if (!masslineMode) return null;

  const maxRange = positiveFinite(opts.maxRange, 390);
  const player = state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;

  // Gather candidate anchors in range. Massline candidates include asteroids (slingshot/mining
  // anchors), unlike weapon targeting. Dead entities and the player are excluded.
  const candidates = [];
  const list = state.entityList || (state.entities ? Array.from(state.entities.values()) : []);
  for (const e of list) {
    if (!e || e.alive === false || e === player || !e.pos) continue;
    if (!MASSLINE_CANDIDATE_TYPES.has(e.type)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    if (dx * dx + dz * dz > maxRange * maxRange) continue;
    candidates.push(e);
  }
  if (!candidates.length) return null;

  const ranked = rankMasslineTargets(player, candidates, {
    maxRange,
    isHostile: (t) => isHostileToPlayer(t, player.team, state),
    isLatched: tether && tether.targetId != null
      ? (t) => t.id === tether.targetId
      : null,
  });
  if (!ranked.length || ranked[0].score <= 0) return null;

  const best = ranked[0];
  if (opts.applyLock !== false) {
    state.player.targetId = best.id;
  }
  return { targetId: best.id, score: best.score, rating: best.rating };
}

function positiveFinite(v, fb) {
  return Number.isFinite(v) && v > 0 ? v : fb;
}
