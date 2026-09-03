// Swarm supply drops (PQ-135) — the reason an endless mode is survivable at all.
//
// WHY THIS EXISTS
// ---------------
// The authored arc is thirty waves long and ends. A swarm run does not: it ends when you die, and
// with no way to recover hull, "how long can you last" collapses into "how much hull did you start
// with" — a stopwatch, not a game. Skill has to be able to buy back mistakes or there is nothing
// to get better at.
//
// So a cohort kill occasionally leaves a REPAIR CELL. Three things make it a decision rather than
// a handout:
//
//   * It drops WHERE THE BODY DIED, which in a swarm wave is inside the swarm. Taking it means
//     flying back into the thing you were escaping.
//   * It expires. A cell you decide to leave is a cell you lose, so "grab it now or take the fight
//     without it" is a real question with a clock on it.
//   * It never fully heals. It is a top-up, not a reset — attrition still wins eventually, which
//     is what makes a run END rather than stall.
//
// It leans HARDER when you are hurt. That is deliberate and it is not the game playing itself: a
// player at 20% hull is one mistake from over, and a swarm mode that only drops medicine to people
// who do not need it is a mode where every run ends the same way. The rate is a published curve,
// not a hidden hand.
//
// HOW IT IS BUILT
// ---------------
// Entirely on shipped seams. The cell is spawned as an ordinary `type:'pickup'` entity, so mining's
// magnet pulls it and mining's scoop collects it exactly like a credit chip, and physics' contact
// collection works too. It is claimed here on `pickup:collected` by ID from this system's OWN
// ledger — never by reading a field off the payload, because the two publishers of that event
// carry different payload shapes and only one of them fills in `wallet`. That is the same trap
// survivalRewards documents at its `_settleChip`, and the same answer.
//
// Init-order only: event-driven, never ticks.

import { mulberry32 } from '../core/rng.js';
import { validateRunState } from '../core/runState.js';
import { runOwnsReward } from '../combat/rewardEligibility.js';
import { isSwarmRuleset } from './survivalSwarm.js';

export const SWARM_REPAIR_KIND = 'swarm_repair';

/** Fraction of max hull one cell restores. A top-up, never a reset. */
export const SWARM_REPAIR_FRACTION = 0.22;
/** Seconds a cell survives on the board before the ordinary despawn sweep takes it. */
export const SWARM_REPAIR_TTL_S = 16;
/** Kills between cells at full health. */
export const SWARM_REPAIR_INTERVAL_HEALTHY = 14;
/** Kills between cells when the hull is nearly gone. */
export const SWARM_REPAIR_INTERVAL_HURT = 5;
/** Hull fraction at or below which the interval is fully tightened. */
export const SWARM_REPAIR_HURT_AT = 0.3;
/** Hull fraction at or above which the interval is fully relaxed. */
export const SWARM_REPAIR_HEALTHY_AT = 0.85;

/**
 * Kills between supply drops, given how much hull is left. Linear between the two anchors, so the
 * curve is one line a player could be told outright: the more trouble you are in, the sooner the
 * next cell. Pure.
 */
export function swarmRepairInterval(hullFraction) {
  const f = Number.isFinite(hullFraction) ? Math.max(0, Math.min(1, hullFraction)) : 1;
  if (f <= SWARM_REPAIR_HURT_AT) return SWARM_REPAIR_INTERVAL_HURT;
  if (f >= SWARM_REPAIR_HEALTHY_AT) return SWARM_REPAIR_INTERVAL_HEALTHY;
  const t = (f - SWARM_REPAIR_HURT_AT) / (SWARM_REPAIR_HEALTHY_AT - SWARM_REPAIR_HURT_AT);
  const span = SWARM_REPAIR_INTERVAL_HEALTHY - SWARM_REPAIR_INTERVAL_HURT;
  return Math.max(1, Math.round(SWARM_REPAIR_INTERVAL_HURT + t * span));
}

/** How much hull one cell gives a hull of this size. Pure. */
export function swarmRepairAmount(hullMax) {
  const max = Number.isFinite(hullMax) && hullMax > 0 ? hullMax : 0;
  if (max <= 0) return 0;
  return Math.max(1, Math.round(max * SWARM_REPAIR_FRACTION));
}

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

export const swarmSupply = {
  name: 'swarmSupply',
  id: 'swarmSupply',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    this._unsubs.push(this.bus.on('entity:spawned', (p) => this._onSpawned(p)));
    this._unsubs.push(this.bus.on('pickup:collected', (p) => this._onCollected(p)));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onDestroyed(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  /** No per-tick work: everything here hangs off a receipt. */
  update() {},

  /** Kills since the last cell, for tests and the lab overlay. */
  killsSinceDrop() {
    return this._sinceDrop;
  },

  _reset() {
    this._sinceDrop = 0;
    this._dropIndex = 0;
    this._live = new Set();
  },

  _player() {
    const state = this.state;
    if (!state || state.playerId == null || !state.entities) return null;
    return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  },

  _hullFraction(player) {
    if (!player) return 1;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    if (max <= 0) return 1;
    const hull = Number.isFinite(player.hull) ? player.hull : max;
    return Math.max(0, Math.min(1, hull / max));
  },

  _onKilled(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    // Same gate the run economy uses: the cohort mark on the body, never a global "is a run live?"
    // question that would also catch ambient traffic.
    if (!runOwnsReward(victim)) return;

    const player = this._player();
    // A full hull earns nothing — the cell would be litter, and the clock should not start until
    // there is something for it to give back.
    if (!player || this._hullFraction(player) >= 0.999) {
      this._sinceDrop = 0;
      return;
    }

    this._sinceDrop += 1;
    if (this._sinceDrop < swarmRepairInterval(this._hullFraction(player))) return;
    this._sinceDrop = 0;
    this._drop(run, victim, payload);
  },

  _drop(run, victim, payload) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function') return;
    const pos = (victim && victim.pos) || (payload && payload.pos);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const state = this.state;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const index = this._dropIndex++;
    const rng = mulberry32(((run.seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0 || 1);
    const angle = rng() * Math.PI * 2;
    const eject = 12 + rng() * 14;

    const spawned = helpers.spawnEntity({
      type: 'pickup',
      pos: { x: pos.x, z: pos.z },
      vel: {
        x: (victim && victim.vel && Number.isFinite(victim.vel.x) ? victim.vel.x * 0.25 : 0)
          + Math.cos(angle) * eject,
        z: (victim && victim.vel && Number.isFinite(victim.vel.z) ? victim.vel.z * 0.25 : 0)
          + Math.sin(angle) * eject,
      },
      radius: 5,
      mass: 0.1,
      collides: true,
      data: {
        kind: SWARM_REPAIR_KIND,
        // `amount` is what the generic pickup pipeline reads to decide the thing is worth
        // collecting at all; the real figure is computed against the hull at scoop time, because a
        // cell picked up on a bigger hull should not be worth proportionally less.
        amount: 1,
        swarmRepair: true,
        despawnAt: now + SWARM_REPAIR_TTL_S,
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._live.add(id);
    this._emit('swarm:supplyDropped', {
      id, wave: run.wave, pos: { x: pos.x, z: pos.z }, ttl: SWARM_REPAIR_TTL_S,
    });
  },

  _onSpawned(payload) {
    // A cell can also arrive from a reload/replay path that did not go through _drop. Claim any
    // pickup that carries our mark so the ledger is the entity's truth, not this system's memory.
    const entity = payload && payload.entity;
    if (!entity || entity.type !== 'pickup') return;
    if (!entity.data || entity.data.kind !== SWARM_REPAIR_KIND) return;
    this._live.add(entity.id);
  },

  /**
   * The player flew through it (or the magnet pulled it in). Claim it BY ID from our own ledger:
   * the two publishers of `pickup:collected` do not agree on payload shape, and reading a field
   * off the payload is exactly how a chip the ship physically touched once paid nothing.
   */
  _onCollected(payload) {
    const id = payload && payload.pickupId;
    if (id == null || !this._live.has(id)) return;
    this._live.delete(id);
    const run = liveSwarmRun(this.state);
    if (!run) return;
    if (payload.collectorId != null && payload.collectorId !== this.state.playerId) return;
    const player = this._player();
    if (!player || player.alive === false) return;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    if (max <= 0) return;
    const before = Number.isFinite(player.hull) ? player.hull : max;
    const healed = Math.min(max, before + swarmRepairAmount(max));
    if (healed <= before) return;
    // Hull is written directly here for the same reason economy.js:1602 and
    // uniqueLootAbilities.js:343 do: the combat kernel is the single authority on DAMAGE, and
    // there is no healing kernel to route through. The clamp to hullMax is the whole contract.
    player.hull = healed;
    this._emit('swarm:supplyCollected', {
      id,
      wave: run.wave,
      restored: Math.round(healed - before),
      hull: player.hull,
      hullMax: max,
    });
    this._emit('toast', {
      text: `Repair cell — hull ${Math.round((player.hull / max) * 100)}%`,
      kind: 'good',
      ttl: 2.2,
    });
  },

  _onDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null) return;
    this._live.delete(id);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
