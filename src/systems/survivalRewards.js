// Survival run economy (PQ-133 / CRU-014).
//
// The run has its OWN wallet and its own XP. Nothing here touches the campaign: no
// economy:grantCredits, no economy:chargeCredits, no write to state.player.*, no station stock,
// no reputation, no research. Every figure lands in state.run through runSession, which stays the
// sole writer of that envelope.
//
// Init-order only: event-driven, never registered in PRODUCTION_UPDATE_ORDER, never ticks.
// Strict no-op without a live survival run.

import { runOwnsReward } from '../combat/rewardEligibility.js';
import { validateRunState } from '../core/runState.js';

/** XP a single cohort kill is worth. Small and level-scaled so the bar visibly moves in a fight. */
export const KILL_XP_BASE = 2;
/** Score a single cohort kill is worth, before any style multiplier. */
export const KILL_SCORE_PER_LEVEL = 10;
/** Score for surviving a wave, on top of the authored XP purse. */
export const WAVE_CLEAR_SCORE = 25;

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
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
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
  },

  _onWavePlanned(payload) {
    const plan = payload && payload.plan;
    if (!plan || plan.ok === false) return;
    this._plan = plan;
    this._planWave = Number.isInteger(payload.wave) ? payload.wave : 0;
  },

  _onEntityKilled(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    if (payload.killerId !== this.state.playerId) return;
    const victim = this._entity(id);
    // The marker rides on the victim, so ambient traffic the player happens to shoot inside an
    // arena still settles through the campaign path and never pays the run.
    if (!runOwnsReward(victim)) return;
    const level = this._levelOf(victim);
    this._emit('run:awardRequested', {
      xp: killXpFor(level),
      score: killScoreFor(level),
      reason: 'kill',
      wave: run.wave,
    });
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
