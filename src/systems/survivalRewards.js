// Survival run economy (PQ-133 / CRU-014 + CRU-015).
//
// The run has its OWN wallet and its own XP. Nothing here touches the campaign: no
// economy:grantCredits, no economy:chargeCredits, no write to state.player.*, no station stock,
// no reputation, no research. Every figure lands in state.run through runSession, which stays the
// sole writer of that envelope.
//
// Credits are PHYSICAL (CRU-015): a cohort kill drops a chip through the shipped `loot:drop` seam,
// and mining spawns and magnetises it exactly like every other pickup. It is stamped
// `wallet: 'run'` at the drop, so routing is a property of the ITEM and not of a global "is a run
// live?" question. Nothing here spawns a second pickup pipeline.
//
// Scooping one pays it through mining. Anything else that removes it pays it here, on the destroy
// receipt — see _onEntityDestroyed for why that seam and not a phase boundary.
//
// Init-order only: event-driven, never registered in PRODUCTION_UPDATE_ORDER, never ticks.
// Strict no-op without a live survival run.

import { runOwnsReward } from '../combat/rewardEligibility.js';
import { validateRunState } from '../core/runState.js';
import { CREDIT_CHIP_KIND } from '../data/killRewards.js';
import { peakConcurrentDemand } from '../data/survivalWaves.js';
import { applyStyleKill, scoreWithStyle, styleCauseFromKill } from './survivalStyle.js';

/** XP a single cohort kill is worth. Small and level-scaled so the bar visibly moves in a fight. */
export const KILL_XP_BASE = 2;
/** Score a single cohort kill is worth, before any style multiplier. */
export const KILL_SCORE_PER_LEVEL = 10;
/** Score for surviving a wave, on top of the authored XP purse. */
export const WAVE_CLEAR_SCORE = 25;
/** Wallet tag stamped on every Survival credit chip. */
export const RUN_WALLET = 'run';

/**
 * One body's share of a wave's authored credit purse. The purse is split across the bodies the
 * plan actually schedules, so a wave pays out roughly what the recipe says however the fight goes.
 */
export function chipValueForPlan(plan) {
  const rewards = plan && plan.rewards;
  const credits = rewards && Number.isInteger(rewards.credits) ? rewards.credits : 0;
  if (credits <= 0) return 0;
  // A swarm wave's packages are only its OPENING burst; the bodies that actually die over the wave
  // are its kill quota. Splitting the purse by the burst would pay two or three times the authored
  // figure, so the swarm divides by the number the wave is really asking for.
  const swarm = plan && plan.swarm;
  const bodies = swarm && Number.isInteger(swarm.quota) && swarm.quota > 0
    ? swarm.quota
    : peakConcurrentDemand(plan && plan.packages);
  if (bodies <= 0) return credits;
  return Math.max(1, Math.round(credits / bodies));
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

export function killXpFor(level) {
  const l = Number.isInteger(level) && level >= 1 ? level : 1;
  return KILL_XP_BASE + l;
}

export function killScoreFor(level) {
  const l = Number.isInteger(level) && level >= 1 ? level : 1;
  return KILL_SCORE_PER_LEVEL * l;
}

export const survivalRewards = {
  name: 'survivalRewards',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.ctx = ctx;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onEntityKilled(p)));
    this._unsubs.push(this.bus.on('run:waveCleared', (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('entity:spawned', (p) => this._onEntitySpawned(p)));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p)));
    this._unsubs.push(this.bus.on('pickup:collected', (p) => this._onPickupCollected(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => {
      this.sweepChips('run_ended');
      this._reset();
    }));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  _reset() {
    this._plan = null;
    this._planWave = 0;
    this._chipValue = 0;
    this._liveChips = new Map();
  },

  _onWavePlanned(payload) {
    const plan = payload && payload.plan;
    if (!plan || plan.ok === false) return;
    this._plan = plan;
    this._planWave = Number.isInteger(payload.wave) ? payload.wave : 0;
    this._chipValue = chipValueForPlan(plan);
  },

  _onEntityKilled(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    const victim = this._entity(id);
    // The marker rides on the victim, so ambient traffic the player happens to shoot inside an
    // arena still settles through the campaign path and never pays the run.
    if (!runOwnsReward(victim)) return;
    // THE ROOM'S KILLS PAY TOO.
    //
    // This used to require `killerId === playerId`, which quietly made the environment the WORST
    // way to kill anything: a hostile that wandered into an arena mine, or that another hostile
    // shot, or that the room's current put through a rock, dropped no chip, paid no XP and moved
    // no score. A live browser walk found 7 of 113 kills in that hole. In a mode whose whole
    // premise is that the arena is a weapon, "the wall got it, so you get nothing" is exactly
    // backwards — and the style multiplier below is built to reward precisely those causes.
    //
    // Everything on the board is here because the run put it here, so everything on the board
    // pays the run when it dies. `runOwnsReward` above is still the only gate: ambient traffic
    // carries no cohort mark and is untouched.
    const level = this._levelOf(victim);
    const cause = styleCauseFromKill(payload);
    const style = run.style && typeof run.style === 'object'
      ? run.style
      : { multiplier: 1, recentCauses: [] };
    const multiplier = Number.isFinite(style.multiplier) ? style.multiplier : 1;
    const base = killScoreFor(level);
    run.style = applyStyleKill(style, cause);
    this._emit('run:awardRequested', {
      xp: killXpFor(level),
      score: scoreWithStyle(base, multiplier, cause),
      reason: 'kill',
      wave: run.wave,
    });
    this._dropRunChip(victim, payload);
  },

  /**
   * Drop one physical credit chip for a cohort kill. Goes through the shipped `loot:drop` seam so
   * mining owns the spawn, the magnet pull and the scoop — there is no Survival pickup pipeline.
   * Nothing is credited at the moment of death: the chip has to leave the board first.
   */
  _dropRunChip(victim, payload) {
    const credits = this._chipValue;
    if (!(credits > 0)) return;
    const pos = (victim && victim.pos) || (payload && payload.pos);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const vel = victim && victim.vel && typeof victim.vel === 'object'
      ? {
        x: Number.isFinite(victim.vel.x) ? victim.vel.x : 0,
        z: Number.isFinite(victim.vel.z) ? victim.vel.z : 0,
      }
      : { x: 0, z: 0 };
    this._emit('loot:drop', {
      pos: { x: pos.x, z: pos.z },
      vel,
      source: 'kill_burst',
      items: [{
        kind: CREDIT_CHIP_KIND,
        credits,
        amount: credits,
        wallet: RUN_WALLET,
        grantReason: `crucible:wave${this._planWave}:chip`,
      }],
    });
  },

  _onEntitySpawned(payload) {
    const entity = payload && payload.entity;
    if (!entity || entity.type !== 'pickup') return;
    const data = entity.data;
    if (!data || data.wallet !== RUN_WALLET) return;
    // Remember the VALUE, not just the id: at entity:destroyed the body is already gone from
    // state.entities, so a ledger of ids alone cannot say what it was worth.
    const credits = Number.isFinite(data.credits) ? Math.trunc(data.credits) : 0;
    this._liveChips.set(entity.id, credits > 0 ? credits : 0);
  },

  /** The player flew through it. Settle it here — this owner is the only payer of run chips. */
  _onPickupCollected(payload) {
    const id = payload && payload.pickupId;
    if (id == null) return;
    this._settleChip(id, 'chip_scooped');
  },

  /**
   * Pay one tracked chip and drop it from the ledger. Every route a chip can leave the board by
   * funnels through here, so a chip is worth its face value exactly once.
   *
   * This being the SOLE payer is the point. Two publishers emit pickup:collected and only one of
   * them carries a `wallet` field — mining's does, physics' contact-collect does not — so routing
   * on that field meant a chip the player flew into behaved differently from one the magnet pulled
   * in. A live route capture showed it: six kills dropped six chips worth twelve credits, the
   * player was paid eight, and the two the ship physically touched paid nothing at all. No headless
   * check could ever see it, because a headless player never moves.
   */
  _settleChip(id, reason) {
    if (!this._liveChips || !this._liveChips.has(id)) return 0;
    const credits = this._liveChips.get(id) || 0;
    this._liveChips.delete(id);
    if (!(credits > 0)) return 0;
    const run = liveSurvivalRun(this.state);
    if (!run) return 0;
    this._emit('run:awardRequested', { credits, reason, wave: run.wave });
    return credits;
  },

  /**
   * A tracked chip left the board without being scooped — despawn, cull, or the cleanup sweep.
   *
   * This, not a phase boundary, is the seam that guarantees earnings. The first version credited
   * uncollected chips only on the way out of cleanup, and a live route capture showed two of six
   * chips already destroyed by that moment: the player killed six enemies and was paid for four.
   */
  _onEntityDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null) return;
    this._settleChip(id, 'chip_settled');
  },

  _onTransitioned(payload) {
    // Clear the board on the way out of cleanup so the player is not asked to chase scrap around
    // an empty arena while the draft waits. Marking a chip dead routes it through the settlement
    // above, so clearing the board and being paid for it are the same act.
    if (payload && payload.previousPhase === 'cleanup') this.sweepChips('cleanup');
  },

  /**
   * Clear every uncollected run chip off the board and settle it, in one act.
   *
   * The settlement is SYNCHRONOUS on purpose. An earlier version marked the bodies dead and let
   * the destroy receipt pay them — but entity:destroyed is QUEUED and flushed at the end of the
   * sim step, and on the last wave the refit→victory transition freezes the results inside that
   * same step. The player who won the run saw a Salvage figure lower than what they had earned.
   * Paying here and dropping the ledger entry means no ordering between this owner, core's sweep
   * and the results owner can change the total.
   */
  sweepChips(reason) {
    const run = liveSurvivalRun(this.state);
    if (!run || !this._liveChips || this._liveChips.size === 0) return 0;
    let outstanding = 0;
    for (const [id, credits] of [...this._liveChips.entries()]) {
      const entity = this._entity(id);
      // This owner is not the entity lifecycle owner; marking dead hands the body to core's sweep.
      if (entity && entity.alive) entity.alive = false;
      if (entity && entity.data) entity.data.creditGranted = true;
      outstanding += credits || 0;
      this._liveChips.delete(id);
    }
    if (outstanding > 0) {
      this._emit('run:awardRequested', {
        credits: outstanding,
        reason: `sweep:${reason || 'cleanup'}`,
        wave: run.wave,
      });
    }
    return outstanding;
  },

  _onWaveCleared(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    const rewards = this._plan && this._planWave === wave ? this._plan.rewards : null;
    const xp = rewards && Number.isInteger(rewards.xp) ? rewards.xp : 0;
    this._emit('run:awardRequested', {
      xp,
      score: WAVE_CLEAR_SCORE * wave,
      reason: 'wave_cleared',
      wave,
    });
  },

  _levelOf(victim) {
    const level = victim && victim.data && victim.data.level;
    if (Number.isInteger(level) && level >= 1) return level;
    const wave = victim && victim.data && victim.data.runWave;
    return Number.isInteger(wave) && wave >= 1 ? 1 + Math.floor((wave - 1) / 3) : 1;
  },

  _entity(id) {
    const state = this.state;
    if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
    return state.entities.get(id) || null;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
