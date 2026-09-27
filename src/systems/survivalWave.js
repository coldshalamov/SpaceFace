// Survival wave owner (PQ-133 / CRU-012 + CRU-013).
//
// Turns the pure plan from survivalWavePlanner into live hostiles, then reports when the wave is
// resolved. Two rules shape the whole file:
//
//   * Spawning goes through spawnBudget and makeEnemySpawnSpec only (see waveMaterialization.js).
//     A batch that the cap refuses is still DISPATCHED — waiting on bodies the cap will never
//     allow would strand the player in `active` forever with nothing to shoot.
//   * `run:waveCleared` is bookkeeping over THIS wave's own admitted ids. A member resolves on
//     its entity:killed receipt; entity:destroyed stays the backstop for bodies removed without
//     dying (sweeps, carry-overs gone stale). A corpse that lingers as a wreck — or a member
//     whose destroy receipt never arrives — cannot hold its wave open, and a recycled id cannot
//     drop the live body that now carries it. It is never "are there any hostiles left in the
//     sector?" — no phase is inferred from an entity scan (§27.3).
//
// Never writes state.run (runSession is the sole writer) and never touches campaign economy.

import { mulberry32 } from '../core/rng.js';
import { validateRunState } from '../core/runState.js';
import { catalogQuestionIssues } from '../data/survivalWaves.js';
import {
  SWARM_BOSS_ENEMY_ID,
  SWARM_WAVE_DURATION_TICKS,
  pickSwarmArchetype,
  swarmCatalogIssues,
  swarmGateFor,
  swarmLevel,
  swarmPressureAt,
  swarmPressureIsHolding,
  swarmReinforceCount,
} from '../data/swarmMode.js';
import { validateCombatChoreography } from '../presentation/combatChoreography.js';
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
 * The arc names its batches up front. Swarm fills a finite round quota in paced groups,
 * maintaining concurrency until that quota has arrived. All survivors must be defeated;
 * then the player spends, refits or saves and explicitly starts the next round.
 * Both use materializeWaveBatch and the same physical enemy/weapon builders. Legacy timed
 * plans remain readable, but the current ruleset never ends a round over a living champion.
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

/**
 * One startup audit over every content catalog this system's pipeline consumes — arc wave
 * recipes plus the catalog-level ids they lean on (question props, role problems, endless
 * overlays — catalogQuestionIssues already runs catalogEnemyIdIssues internally), the swarm
 * roster + boss rotation, and the combat choreography grammars.
 *
 * These validators used to be test-only, so a typo'd enemyId survived until spawn time and
 * surfaced only as a silent wasp fallback from makeEnemySpawnSpec. init() runs this once on
 * the default route's system init and reports every issue. `opts.recipes` exists so the
 * focused test can drive the same collector over a deliberately broken recipe list.
 */
export function collectContentCatalogIssues(opts = {}) {
  const issues = [];
  const pushAll = (source, list) => {
    for (const item of list || []) {
      if (!item) continue;
      issues.push(typeof item === 'string'
        ? { source, path: '', message: item }
        : { source, path: item.path || '', message: item.message || String(item) });
    }
  };
  pushAll('survivalWaves', catalogQuestionIssues(opts.recipes));
  pushAll('swarmMode', swarmCatalogIssues());
  const choreography = validateCombatChoreography();
  if (choreography && choreography.ok === false) {
    pushAll('combatChoreography', choreography.issues);
  }
  return issues;
}

function playerIsAlive(state) {
  if (!state || state.playerId == null || !state.entities || typeof state.entities.get !== 'function') {
    return false;
  }
  const player = state.entities.get(state.playerId);
  return !!(player && player.alive !== false);
}

const TRANSITIONAL_PHASES = new Set(['cleanup', 'wave_intro', 'arena_intro', 'draft', 'refit']);

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
    this._reportContentIssues();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._teardown()));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p)));
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onEntityKilled(p)));
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
    // Across cleanup / introduction / auto-draft the clock is frozen, but an empty board is
    // still an emergency. Use the carried cohort and the current plan through the same
    // materializer so a sixty-second boundary cannot disable the refill.
    if (this._swarm && !this._swarm.killTarget && this._plan && TRANSITIONAL_PHASES.has(run.phase)) {
      this._reinforceSwarm(run, { emergencyOnly: true });
      return;
    }
    if (run.phase !== 'active') return;
    if (!this._active) return;

    this._cursor += 1;
    this._dispatchDue();
    this._reinforceSwarm(run);
    this._publishWaveProgress();
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
    const carried = swarm && !swarm.killTarget && this._swarm ? this._cohort : null;
    const carriedBosses = swarm && !swarm.killTarget && this._swarm ? this._bossIds : null;
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
      const rulesDuration = Number.isInteger(rules.durationTicks) && rules.durationTicks > 0
        ? rules.durationTicks
        : 0;
      const swarmDuration = Number.isInteger(swarm.durationTicks) && swarm.durationTicks > 0
        ? swarm.durationTicks
        : 0;
      this._durationTicks = rulesDuration || swarmDuration || SWARM_WAVE_DURATION_TICKS;
      const reference = Number.isInteger(swarm.rewardReferenceKills) && swarm.rewardReferenceKills > 0
        ? swarm.rewardReferenceKills
        : (Number.isInteger(swarm.quota) && swarm.quota > 0 ? swarm.quota : 10);
      this._rewardReferenceKills = reference;
      this._plannedBodies = Number.isInteger(swarm.killTarget) && swarm.killTarget > 0
        ? swarm.killTarget : reference;
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
    this._waveStartedSimTime = this.state && Number.isFinite(this.state.simTime)
      ? this.state.simTime
      : 0;
    this._lastProgressSecond = null;
    // Dispatch tick-0 batches on the same tick the wave goes active so the fight starts
    // immediately instead of one frame late.
    this._cursor = 0;
    // The opening burst counts as this wave's first reinforcement, so the stream waits one full
    // gap before topping up rather than doubling the arrival on tick 0.
    this._lastReinforceTick = 0;
    this._reinforceIndex = 0;
    this._dispatchDue();
    this._publishWaveProgress({ force: true });
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
    const entry = this._cohort.get(id);
    if (!entry) return;
    // Same-tick id reuse, decided by IDENTITY. core recycles a dead body's id into freeIds
    // immediately but QUEUES its entity:destroyed to the end of the step, so a batch dispatched
    // in the same tick can be handed the id of a body whose removal receipt has not been
    // delivered yet. The single-removal path stamps the destroyed object on the receipt — if
    // that object is not the member this id currently names, the receipt belongs to a recycled
    // predecessor and must not drop the live occupant. (spawnBudget's binding applies the same
    // generation check; the batch sweep omits the ref, so the live-occupant guard below stays
    // as the fallback for ref-less receipts.)
    if (payload.entity != null && entry.entity != null && payload.entity !== entry.entity) return;
    const live = this.state && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    if (live && live !== entry.entity && live.alive !== false
      && live.data && live.data.runCohort === 'survival') return;
    this._resolveCohort(id);
  },

  /**
   * Death resolves a cohort slot at the kill, not at corpse disposal. Combat emits
   * entity:killed synchronously while the body is still in the entity map; a hull that then
   * lingers as a wreck — or is reaped by a path that never emits entity:destroyed — can no
   * longer hold its wave open on a dead entry. entity:destroyed remains the backstop for
   * removals that never went through a kill.
   */
  _onEntityKilled(payload) {
    const id = payload && payload.id;
    if (id == null || !this._cohort) return;
    const entry = this._cohort.get(id);
    if (!entry) return;
    // Stale-receipt guard, same generation rule as the destroyed path: if the id already
    // reports a different occupant, this receipt belongs to a predecessor and the live member
    // keeps its entry. With no recorded ref, only a demonstrably dead (or gone) holder resolves.
    const holder = this.state && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    if (entry.entity && holder && holder !== entry.entity) return;
    if (!entry.entity && holder && holder.alive !== false) return;
    this._resolveCohort(id);
  },

  _resolveCohort(id) {
    if (!this._cohort || !this._cohort.delete(id)) return;
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
    // The swarm always materializes at swarmLevel 1 so scaleCombatant cannot inflate hull.
    const level = this._swarm ? swarmLevel(this._wave) : levelForWave(this._wave);
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
      const holding = this._swarm && swarmPressureIsHolding();
      const emptyBoard = this._cohort.size === 0;
      // A carried reservoir hold is a protected hole. Ordinary opening packages must not refill
      // it. Champions stay owed — they defer until the hold finishes rather than being dropped.
      // An empty board is the emergency exception.
      if (this._swarm && holding && !emptyBoard) {
        if (entry.champion === true || entry.enemyId === SWARM_BOSS_ENEMY_ID) {
          this._pending[write++] = item;
          continue;
        }
        continue;
      }
      // A swarm wave's opening burst is bounded by the SAME concurrency target the stream uses.
      // Without this, a wave inheriting a full room from the last one would stack its own burst on
      // top and hand the whole overflow to the spawn cap to sort out.
      //
      // A CHAMPION IS NEVER CLAMPED. Note what the clamp does when it bites: `continue` without
      // re-queueing, so the batch is DROPPED, not deferred. That is right for chaff — the room is
      // already full and the stream will bring more when it thins. It is catastrophic for a boss.
      // Waves now run at concurrency 20 with no taper and clear with that many survivors, while a
      // boss wave's own ceiling is 18 — so the Dreadnought's batch computed min(1, 18 - 20) = 0 and
      // was thrown away. `requireBoss` then had nothing to require and the boss wave cleared on
      // chaff, with no boss ever fielded. The spawn budget (raised to 38 for the run) is the real
      // authority on whether there is room, and it has plenty.
      let count = entry.count;
      if (this._swarm && entry.champion !== true) {
        count = Math.min(count, Math.max(0, this._concurrent - this._cohort.size));
        if (count <= 0) continue;
      }
      const receipt = materializeWaveBatch(this.ctx, {
        ownerId,
        enemyId: entry.enemyId,
        level,
        count,
        gateGroup: entry.gateGroup,
        seed,
        wave: this._wave,
        packageIndex: Number.isInteger(entry.packageIndex) ? entry.packageIndex : 0,
        batchIndex: item.index,
        role: entry.role,
        swarm: !!this._swarm,
        champion: entry.champion === true,
        distance: Number.isFinite(entry.distance) ? entry.distance : this._spawnDistance,
        // PQ-133.08: law arenas stamp their wave-10 boss's dressing kind off this id.
        arenaId: run && run.arenaId,
      });
      this._requestedTotal += receipt.requested;
      this._admittedTotal += receipt.admitted;
      for (const id of receipt.spawnedIds) {
        // Record the spawned OBJECT, not just the id: entity ids recycle through freeIds inside
        // a step, so the kill/destroy seams resolve membership by identity, never by id alone.
        this._cohort.set(id, {
          role: entry.role,
          entity: this.state && this.state.entities && typeof this.state.entities.get === 'function'
            ? this.state.entities.get(id) || null
            : null,
        });
        // The champion is the wave's WORK, not one more body in the count. Remembering which hulls
        // they are means a kill quota met on chaff cannot end a boss wave with the boss still
        // flying — and because the marker is a FLAG rather than an enemy id, a wave can owe a wing
        // of three raiders exactly as easily as it owes one Dreadnought.
        if (entry.champion === true || entry.enemyId === SWARM_BOSS_ENEMY_ID) this._bossIds.add(id);
      }
      // A champion refused by the budget is still owed; ordinary reinforcements cannot replace it.
      if (this._swarm?.killTarget && entry.champion === true && receipt.admitted < count) {
        this._pending[write++] = { ...item, entry: { ...entry, count: count - receipt.admitted } };
      }
      // A refused swarm batch must never shrink the planned figure — the stream will bring
      // those bodies later, up to the finite quota.
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
  _reinforceSwarm(run, opts = {}) {
    if (!this._swarm || !this._plan) return;
    const lesson = this._plan.openingLesson;
    if (lesson && Number.isFinite(lesson.holdTicks) && this._cursor < lesson.holdTicks) return;
    const emergencyOnly = opts.emergencyOnly === true;
    if (!emergencyOnly && (this._cleared || !this._active)) return;
    if (!emergencyOnly && this._cursor < 0) return;
    // Refill an empty active fight promptly while the quota is still owed. The finite
    // remainder below stops arrivals after the earned clear; the armory owns that breathing room.
    const roomIsEmpty = this._cohort.size === 0 && this._pendingBodies() === 0;
    if (emergencyOnly && !roomIsEmpty) return;
    if (!emergencyOnly && !roomIsEmpty && this._cursor - this._lastReinforceTick < this._reinforceGap) return;

    // Current rounds build pressure with resolved quota progress. Timed plans use elapsed
    // time only for compatibility with older saved/replay plans.
    const durationSeconds = this._durationSeconds();
    const progress = this._swarm.killTarget
      ? this._resolved / Math.max(1, this._plannedBodies)
      : (durationSeconds > 0 ? Math.max(0, Math.min(1, this._elapsedSeconds() / durationSeconds)) : 1);
    const target = Math.min(this._concurrent, swarmPressureAt(this._wave, progress));
    const alive = this._cohort.size + this._pendingBodies();
    if (alive >= target) return;

    const remaining = this._swarm.killTarget
      ? Math.max(0, this._plannedBodies - this._admittedTotal - this._pendingBodies())
      : target;
    if (remaining <= 0) return;
    const want = Math.min(remaining, swarmReinforceCount(target - alive));
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
      level: swarmLevel(this._wave),
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
      swarm: true,
      champion: false,
      arenaId: run && run.arenaId,
    });
    this._requestedTotal += receipt.requested;
    this._admittedTotal += receipt.admitted;
    for (const id of receipt.spawnedIds) {
      this._cohort.set(id, {
        role: archetype.role,
        entity: this.state && this.state.entities && typeof this.state.entities.get === 'function'
          ? this.state.entities.get(id) || null
          : null,
      });
    }
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
    // Swarm waves clear one of two ways. A kill-target round ends when every body it admitted
    // has RESOLVED — kills count at the kill, corpses that linger no longer stall the check.
    // A legacy timed round clears on the duration clock: survivors are left flying and become
    // the next wave's opening pressure. Either way a living champion keeps the wave open, and
    // death at the boundary is a death, not a surviving-wave award.
    if (this._swarm) {
      if (run.phase !== 'active') return;
      if (!playerIsAlive(this.state)) return;
      const durationSeconds = this._durationSeconds();
      if (this._swarm.killTarget) {
        if (this._admittedTotal < this._plannedBodies || this._pending.length || this._cohort.size) return;
      } else if (this._elapsedSeconds() < durationSeconds) return;
      this._cleared = true;
      this._active = false;
      this._publishWaveProgress({ force: true });
      this._emit(WAVE_CLEARED_SEAM, {
        wave: this._wave,
        completionKind: this._swarm.killTarget ? 'cohort' : 'duration',
        durationTicks: this._durationTicks,
        requested: this._requestedTotal,
        admitted: this._admittedTotal,
        killed: this._resolved,
        survivors: this._cohort.size,
        starved: this._requestedTotal > 0 && this._admittedTotal === 0,
        tick: this._cursor,
        runWave: run && Number.isInteger(run.wave) ? run.wave : this._wave,
      });
      return;
    }
    if (this._pending && this._pending.length > 0) return;
    for (const member of this._cohort.values()) {
      if (this._blockingRoles.size === 0 || this._blockingRoles.has(member && member.role)) return;
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
    this._rewardReferenceKills = 0;
    this._durationTicks = 0;
    this._waveStartedSimTime = null;
    this._lastProgressSecond = null;
    this._concurrent = 0;
    this._reinforceGap = 24;
    this._reinforceBatch = 3;
    this._reinforceIndex = 0;
    this._lastReinforceTick = -9999;
    this._bossIds = new Set();
  },

  _teardown() {
    this._resetWave();
    const budget = this.ctx && this.ctx.helpers && this.ctx.helpers.spawnBudget;
    if (budget && typeof budget.release === 'function') {
      for (const ownerId of this._owners || []) budget.release(ownerId);
    }
    this._owners = [];
  },

  /**
   * Startup content audit — runs once per system init (the default route's boot). Reports are
   * loud but NEVER thrown: a typo'd catalog row must light up the log, not kill the route.
   * Channels: one console.error summary, one console.warn per issue (systems-style warn), and
   * a `survival:contentIssues` bus event for observers/diagnostics.
   */
  _reportContentIssues() {
    let issues = null;
    try {
      issues = collectContentCatalogIssues();
    } catch (err) {
      try {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[survivalWave] content catalog audit failed to run', err);
        }
      } catch { /* reporting must never throw */ }
      return;
    }
    if (!issues || issues.length === 0) return;
    try {
      if (typeof console !== 'undefined' && console.error) {
        console.error(`[survivalWave] content catalog audit: ${issues.length} issue(s)`);
      }
      if (typeof console !== 'undefined' && console.warn) {
        for (const item of issues) {
          const where = item.path ? `${item.source}.${item.path}` : item.source;
          console.warn(`[survivalWave] content issue ${where}: ${item.message}`);
        }
      }
      this._emit('survival:contentIssues', { issues });
    } catch { /* reporting must never throw */ }
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  _elapsedSeconds() {
    const start = this._waveStartedSimTime;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (Number.isFinite(start)) {
      const fromSim = now - start;
      if (fromSim > 0) return fromSim;
    }
    // Focused harnesses that do not tick core still advance `_cursor` during active combat.
    return this._cursor > 0 ? this._cursor / 60 : 0;
  },

  _durationSeconds() {
    const ticks = Number.isInteger(this._durationTicks) && this._durationTicks > 0
      ? this._durationTicks
      : SWARM_WAVE_DURATION_TICKS;
    return ticks / 60;
  },

  _elapsedTicks() {
    return Math.max(0, Math.floor(this._elapsedSeconds() * 60 + 1e-9));
  },

  _publishWaveProgress({ force = false } = {}) {
    if (!this._swarm) return;
    if (this._plan?.swarm?.killTarget > 0) {
      const remaining = Math.max(0, this._plannedBodies - this._resolved);
      if (!force && remaining === this._lastProgressSecond) return;
      this._lastProgressSecond = remaining;
      this._emit('run:waveProgress', { wave: this._wave, remaining, total: this._plannedBodies, completionKind: 'cohort' });
      return;
    }
    const durationTicks = Number.isInteger(this._durationTicks) && this._durationTicks > 0
      ? this._durationTicks
      : SWARM_WAVE_DURATION_TICKS;
    const remainingTicks = Math.max(0, durationTicks - this._elapsedTicks());
    const displaySecond = Math.ceil(remainingTicks / 60);
    if (!force && displaySecond === this._lastProgressSecond) return;
    this._lastProgressSecond = displaySecond;
    this._emit('run:waveProgress', {
      wave: this._wave,
      remainingTicks,
      durationTicks,
    });
  },
};
