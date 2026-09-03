// Survival wave owner (PQ-133 / CRU-012 + CRU-013).
//
// Turns the pure plan from survivalWavePlanner into live hostiles, then reports when the wave is
// resolved. Two rules shape the whole file:
//
//   * Spawning goes through spawnBudget and makeEnemySpawnSpec only (see waveMaterialization.js).
//     A batch that the cap refuses is still DISPATCHED — waiting on bodies the cap will never
//     allow would strand the player in `active` forever with nothing to shoot.
//   * `run:waveCleared` is bookkeeping over THIS wave's own admitted ids, decremented by
//     entity:destroyed receipts. It is never "are there any hostiles left in the sector?" —
//     no phase is inferred from an entity scan (§27.3).
//
// Never writes state.run (runSession is the sole writer) and never touches campaign economy.

import { mulberry32 } from '../core/rng.js';
import { validateRunState } from '../core/runState.js';
import {
  SWARM_BOSS_ENEMY_ID,
  pickSwarmArchetype,
  swarmGateFor,
  swarmPressureAt,
  swarmReinforceCount,
} from '../data/swarmMode.js';
import { WAVE_CLEARED_SEAM } from './survivalRun.js';
import {
  SURVIVAL_SPAWN_DISTANCE,
  levelForWave,
  materializeWaveBatch,
} from './waveMaterialization.js';

export const SURVIVAL_WAVE_OWNER_PREFIX = 'survival-wave:';

/**
 * SWARM REINFORCEMENT (PQ-135).
 *
 * The arc's wave is a SCHEDULE: every body is named up front, and the wave ends when all of them
 * are dead. That produces the dead air a swarm game cannot have — the last twenty seconds of every
 * wave are spent hunting one straggler in an otherwise empty room.
 *
 * A swarm wave is a STREAM instead. It holds the room at `concurrent` bodies and ends on a KILL
 * QUOTA, so:
 *   * the room never empties while the wave is live — a kill is replaced within a few ticks;
 *   * survivors are never chased. When the quota is met the wave ends with hostiles still on you,
 *     and they roll into the next wave as its opening pressure. There is no lull to cover.
 *   * it self-tapers. The spawn target is `min(concurrent, quota - killed)`, so the last few kills
 *     of a wave do not summon a fresh dozen that the next wave would then have to inherit.
 *
 * Everything still goes through materializeWaveBatch — the same spawnBudget authority and the same
 * makeEnemySpawnSpec builder the arc uses. There is no swarm-only spawn path and no raised cap.
 */
function swarmStreamSeed(seed, wave, index) {
  const label = `swarm-reinforce-v1|w${wave}|n${index}`;
  let h = (seed >>> 0) ^ 0x85ebca6b;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

export function waveOwnerId(wave) {
  return `${SURVIVAL_WAVE_OWNER_PREFIX}${Number.isInteger(wave) ? wave : 0}`;
}

export const survivalWave = {
  name: 'survivalWave',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.ctx = ctx;
    this._unsubs = [];
    this._resetWave();
    this._owners = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._teardown()));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._teardown();
  },

  update() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase !== 'active') return;
    if (!this._active) return;

    this._cursor += 1;
    this._dispatchDue();
    this._reinforceSwarm(run);
    this._checkCleared(run);
  },

  // ---- receipts -------------------------------------------------------------

  _onWavePlanned(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const plan = payload && payload.plan;
    if (!plan || plan.ok === false || !Array.isArray(plan.schedule)) return;
    const wave = Number.isInteger(payload.wave) ? payload.wave : run.wave;
    const swarm = plan.swarm && typeof plan.swarm === 'object' ? plan.swarm : null;
    // A swarm wave INHERITS the survivors of the last one. They were never chased down, they still
    // hold their budget slots, and their deaths still count — so the new wave opens under the
    // pressure the old one left behind instead of in a room that was briefly empty.
    const carried = swarm && this._swarm ? this._cohort : null;
    const carriedBosses = swarm && this._swarm ? this._bossIds : null;
    this._resetWave();
    if (carried && carried.size > 0) this._cohort = carried;
    // A boss that survived its own wave is still a boss. Carrying the ids keeps a later wave from
    // treating it as ordinary chaff if it is somehow still alive.
    if (carriedBosses && carriedBosses.size > 0) this._bossIds = carriedBosses;
    this._wave = wave;
    this._plan = plan;
    this._swarm = swarm;
    this._pending = plan.schedule.map((entry, index) => ({ entry, index }));
    const rules = plan.completionRules || {};
    const roles = Array.isArray(rules.blockingRoles) ? rules.blockingRoles : [];
    this._blockingRoles = new Set(roles);
    if (swarm) {
      // The readout's denominator is the KILL QUOTA, not a body count — that is the number the
      // player is actually working toward, and the only one that can be finished.
      this._quota = Number.isInteger(swarm.quota) && swarm.quota > 0 ? swarm.quota : 10;
      this._concurrent = Number.isInteger(swarm.concurrent) && swarm.concurrent > 0
        ? swarm.concurrent
        : 8;
      this._reinforceGap = Number.isInteger(swarm.reinforceGapTicks) && swarm.reinforceGapTicks > 0
        ? swarm.reinforceGapTicks
        : 24;
      this._reinforceBatch = Number.isInteger(swarm.reinforceBatch) && swarm.reinforceBatch > 0
        ? swarm.reinforceBatch
        : 3;
      this._spawnDistance = Number.isFinite(swarm.spawnDistance) && swarm.spawnDistance > 0
        ? swarm.spawnDistance
        : SURVIVAL_SPAWN_DISTANCE;
      this._requireBoss = swarm.requireBoss === true;
      this._plannedBodies = this._quota;
    } else {
      // Publish the wave's planned body count so a readout can say how many are still out there.
      this._plannedBodies = plan.schedule.reduce(
        (sum, entry) => sum + (Number.isInteger(entry.count) ? entry.count : 0),
        0,
      );
    }
    this._publishThreat();
  },

  _onWaveStarted(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'active') return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    if (this._plan == null || this._wave !== wave) return;
    this._active = true;
    this._admittedTotal = 0;
    this._requestedTotal = 0;
    this._resolved = 0;
    // Dispatch tick-0 batches on the same tick the wave goes active so the fight starts
    // immediately instead of one frame late.
    this._cursor = 0;
    // The opening burst counts as this wave's first reinforcement, so the stream waits one full
    // gap before topping up rather than doubling the arrival on tick 0.
    this._lastReinforceTick = 0;
    this._reinforceIndex = 0;
    this._dispatchDue();
    this._checkCleared(run);
  },

  _onTransitioned(payload) {
    const phase = payload && payload.phase;
    if (phase === 'active') return;
    // Leaving `active` stops dispatch. Live bodies keep their bound budget slots and release
    // themselves through entity:destroyed; this owner is not the entity lifecycle owner.
    this._active = false;
  },

  _onEntityDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null || !this._cohort) return;
    if (!this._cohort.has(id)) return;
    // Same-tick id reuse. core recycles a dead body's id into freeIds immediately but QUEUES its
    // entity:destroyed to the end of the step, so a batch dispatched in the same tick can be
    // handed the id of a body whose death receipt has not been delivered yet. Acting on that
    // receipt would drop a LIVE hostile out of the census — and if it were the last one accounted
    // for, the wave would report itself cleared with an enemy still shooting. If a live cohort
    // body holds this id now, the receipt belongs to its predecessor: keep the entry, which is
    // already the right one for the new occupant.
    const live = this.state && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    if (live && live.alive && live.data && live.data.runCohort === 'survival') return;
    this._cohort.delete(id);
    this._bossIds.delete(id);
    this._resolved += 1;
    this._publishThreat();
  },

  /** Hand the live wave census to runSession, the only writer of state.run. */
  _publishThreat() {
    this._emit('run:threatRequested', {
      threatBudget: this._plannedBodies,
      spawnedThreat: this._admittedTotal,
      resolvedThreat: this._resolved,
    });
  },

  // ---- dispatch -------------------------------------------------------------

  _dispatchDue() {
    if (!this._pending || this._pending.length === 0) return;
    const plan = this._plan;
    if (!plan) return;
    const run = liveSurvivalRun(this.state);
    const seed = run && Number.isInteger(run.seed) ? run.seed : 1;
    const level = levelForWave(this._wave);
    const ownerId = waveOwnerId(this._wave);
    if (!this._owners.includes(ownerId)) this._owners.push(ownerId);

    let write = 0;
    for (let i = 0; i < this._pending.length; i++) {
      const item = this._pending[i];
      const entry = item.entry;
      const atTick = Number.isInteger(entry.atTick) ? entry.atTick : 0;
      if (atTick > this._cursor) {
        this._pending[write++] = item;
        continue;
      }
      // A swarm wave's opening burst is bounded by the SAME concurrency target the stream uses.
      // Without this, a wave inheriting a full room from the last one would stack its own burst on
      // top and hand the whole overflow to the spawn cap to sort out.
      let count = entry.count;
      if (this._swarm) {
        count = Math.min(count, Math.max(0, this._concurrent - this._cohort.size));
        if (count <= 0) continue;
      }
      const receipt = materializeWaveBatch(this.ctx, {
        ownerId,
        enemyId: entry.enemyId,
        level,
        count,
        gateGroup: entry.gateGroup,
        distance: this._spawnDistance,
        seed,
        wave: this._wave,
        packageIndex: Number.isInteger(entry.packageIndex) ? entry.packageIndex : 0,
        batchIndex: item.index,
        role: entry.role,
      });
      this._requestedTotal += receipt.requested;
      this._admittedTotal += receipt.admitted;
      for (const id of receipt.spawnedIds) {
        this._cohort.set(id, entry.role);
        // The boss is the wave's WORK, not one more body in the count. Remember which hulls it is
        // so a kill quota met on chaff cannot end a boss wave with the Dreadnought still flying.
        if (entry.enemyId === SWARM_BOSS_ENEMY_ID) this._bossIds.add(id);
      }
      // A batch the cap refused lowers the wave's real body count, so the readout never asks the
      // player to kill bodies that were never admitted. A SWARM wave's denominator is its kill
      // quota, not a body count, so a refused batch must never shrink it — the stream will simply
      // bring those bodies later.
      if (!this._swarm) {
        this._plannedBodies = Math.max(0, this._plannedBodies - receipt.rejected);
      }
      this._publishThreat();
      this._emit('run:waveMaterialized', {
        wave: this._wave,
        role: entry.role,
        enemyId: entry.enemyId,
        gateGroup: entry.gateGroup,
        atTick,
        requested: receipt.requested,
        admitted: receipt.admitted,
        rejected: receipt.rejected,
        tick: this._cursor,
      });
    }
    this._pending.length = write;
  },

  /**
   * Hold the room at strength. Runs only for a swarm wave; a no-op everywhere else, including on
   * ticks where the room is already full — the common case, and the cheap one.
   */
  _reinforceSwarm(run) {
    if (!this._swarm || this._cleared || !this._active) return;
    if (this._cursor < 0) return;
    // AN EMPTY ROOM IS AN EMERGENCY, NOT A WAIT.
    //
    // The gap timer paces an ordinary top-up so bodies arrive as groups rather than a dribble. It
    // must not apply when there is nothing on the board at all: once the wave opens below its
    // ceiling (the crescendo) a fast player can clear the last survivor of the previous wave in the
    // one beat before the new wave's burst lands, and a live walk caught exactly that — one empty
    // moment in eighty-six. "The room is never empty" is the promise this whole ruleset is built
    // on, so the first body back is never made to queue.
    const roomIsEmpty = this._cohort.size === 0 && this._pendingBodies() === 0;
    if (!roomIsEmpty && this._cursor - this._lastReinforceTick < this._reinforceGap) return;

    // NO TAPER. An earlier version shrank the spawn target toward the end of a wave so the next
    // wave would not inherit a crowd — and that produced exactly the dead air this whole ruleset
    // exists to delete: the last third of every wave played out in a thinning room, and the wave
    // ended with nothing on screen.
    //
    // Holding the room at full strength right through the last kill is the point. Inheriting that
    // crowd is not a cost, it IS the no-lull rule: wave N+1 opens with wave N's survivors already
    // on the player. Growth is bounded by `concurrent` (and, behind that, by the shared spawn cap),
    // so there is nothing here to run away.
    //
    // The only stop is a quota already met with no boss owed — the wave ends on this same tick, so
    // spawning into it would just be litter.
    if (this._resolved >= this._quota && !(this._requireBoss && this._bossIds.size > 0)) return;
    // THE WAVE BUILDS. A flat target for a whole wave makes its first second and its last feel the
    // same; the room now opens at a fraction of its ceiling and closes in as the quota burns down,
    // so every wave has a shape. The ceiling itself never moves mid-wave — only how much of it is
    // being used right now.
    const progress = this._quota > 0 ? this._resolved / this._quota : 1;
    const target = Math.min(this._concurrent, swarmPressureAt(this._wave, progress));
    // COUNT THE BODIES ALREADY ON THEIR WAY. The opening burst is staged over a few ticks so it
    // arrives as groups on different bearings rather than one block; without this the stream sees a
    // thin room, tops it up, and then the rest of the burst lands on top — every wave opened over
    // its own pressure. Pending is what the schedule still owes, not a guess.
    const alive = this._cohort.size + this._pendingBodies();
    if (alive >= target) return;

    // Adaptive: a small hole gets the ordinary batch, a big one gets a surge. See
    // swarmReinforceCount — a fixed batch can always be out-cleared by a fast player, and being
    // out-cleared looks exactly like the dead air this ruleset exists to delete.
    const want = swarmReinforceCount(target - alive);
    if (want <= 0) return;

    this._lastReinforceTick = this._cursor;
    const index = this._reinforceIndex++;
    const seed = run && Number.isInteger(run.seed) ? run.seed : 1;
    const rng = mulberry32(swarmStreamSeed(seed, this._wave, index));
    const archetype = pickSwarmArchetype(this._wave, rng());
    const gateGroup = swarmGateFor(this._wave, index + 4);
    const ownerId = waveOwnerId(this._wave);
    if (!this._owners.includes(ownerId)) this._owners.push(ownerId);

    const receipt = materializeWaveBatch(this.ctx, {
      ownerId,
      enemyId: archetype.enemyId,
      level: levelForWave(this._wave),
      count: want,
      gateGroup,
      distance: this._spawnDistance,
      seed,
      wave: this._wave,
      // Reinforcements live above the opening burst's package indices so their placement stream
      // can never collide with a scheduled batch's.
      packageIndex: 64,
      batchIndex: index,
      role: archetype.role,
    });
    this._requestedTotal += receipt.requested;
    this._admittedTotal += receipt.admitted;
    for (const id of receipt.spawnedIds) this._cohort.set(id, archetype.role);
    if (receipt.admitted > 0) {
      this._publishThreat();
      this._emit('run:waveMaterialized', {
        wave: this._wave,
        role: archetype.role,
        enemyId: archetype.enemyId,
        gateGroup,
        atTick: this._cursor,
        requested: receipt.requested,
        admitted: receipt.admitted,
        rejected: receipt.rejected,
        tick: this._cursor,
        reinforcement: true,
      });
    }
  },

  /** Bodies the schedule still owes but has not dispatched yet. */
  _pendingBodies() {
    if (!this._pending || this._pending.length === 0) return 0;
    let total = 0;
    for (const item of this._pending) {
      const count = item && item.entry && Number.isInteger(item.entry.count) ? item.entry.count : 0;
      if (count > 0) total += count;
    }
    return total;
  },

  _checkCleared(run) {
    if (this._cleared) return;
    if (!this._active) return;
    // A swarm wave clears on KILLS. Survivors are left flying — they become the next wave's
    // opening pressure. Nothing here waits for an empty room, so the wave can never stall on a
    // straggler and there is no lull between waves to cover with a menu.
    if (this._swarm) {
      if (this._resolved < this._quota) return;
      // A boss wave owes BOTH: the quota and the Dreadnought. Until the boss is down the wave
      // keeps running, and the stream keeps its escort coming.
      if (this._requireBoss && this._bossIds.size > 0) return;
      this._cleared = true;
      this._active = false;
      this._emit(WAVE_CLEARED_SEAM, {
        wave: this._wave,
        requested: this._requestedTotal,
        admitted: this._admittedTotal,
        killed: this._resolved,
        quota: this._quota,
        survivors: this._cohort.size,
        starved: this._requestedTotal > 0 && this._admittedTotal === 0,
        tick: this._cursor,
        runWave: run && Number.isInteger(run.wave) ? run.wave : this._wave,
      });
      return;
    }
    if (this._pending && this._pending.length > 0) return;
    for (const role of this._cohort.values()) {
      if (this._blockingRoles.size === 0 || this._blockingRoles.has(role)) return;
    }
    this._cleared = true;
    this._active = false;
    this._emit(WAVE_CLEARED_SEAM, {
      wave: this._wave,
      requested: this._requestedTotal,
      admitted: this._admittedTotal,
      // A wave the cap starved completely resolves rather than deadlocking; the receipt says so
      // instead of leaving a silent empty wave that reads like a cleared one.
      starved: this._requestedTotal > 0 && this._admittedTotal === 0,
      tick: this._cursor,
      runWave: run && Number.isInteger(run.wave) ? run.wave : this._wave,
    });
  },

  // ---- lifecycle ------------------------------------------------------------

  _resetWave() {
    this._plan = null;
    this._wave = 0;
    this._pending = [];
    this._cohort = new Map();
    this._blockingRoles = new Set();
    this._cursor = -1;
    this._active = false;
    this._cleared = false;
    this._admittedTotal = 0;
    this._requestedTotal = 0;
    this._plannedBodies = 0;
    this._resolved = 0;
    this._spawnDistance = SURVIVAL_SPAWN_DISTANCE;
    this._swarm = null;
    this._quota = 0;
    this._concurrent = 0;
    this._reinforceGap = 24;
    this._reinforceBatch = 3;
    this._reinforceIndex = 0;
    this._lastReinforceTick = -9999;
    this._bossIds = new Set();
    this._requireBoss = false;
  },

  _teardown() {
    this._resetWave();
    const budget = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnBudget;
    if (budget && typeof budget.release === 'function') {
      for (const ownerId of this._owners || []) budget.release(ownerId);
    }
    this._owners = [];
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
