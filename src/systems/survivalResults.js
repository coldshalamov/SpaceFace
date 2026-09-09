// Survival results owner (PQ-133 / CRU-018).
//
// Watches a run so the end of it can be EXPLAINED: how far it got, what it earned, and — when the
// player dies — what killed them, from the receipts combat already builds. It ends the run on the
// player's death, and assembles the summary the results surface reads.
//
// It never writes state.run (runSession owns that), never spawns, and never ticks.

import { runOwnsReward } from '../combat/rewardEligibility.js';
import { attackerLabel } from '../combat/playerDefeat.js';
import { validateRunState } from '../core/runState.js';
import { SWARM_RULESET } from '../data/swarmMode.js';
import { SURVIVAL_ARC_LENGTH } from '../data/survivalActs.js';
import { settleCrucibleRun } from './survivalRecords.js';
import { challengeFromRun } from './survivalMutators.js';

/** How many recent hits on the player the summary keeps. Bounded: this is a ring, not a log. */
export const DAMAGE_TRAIL_LENGTH = 8;

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

/**
 * Turn the defeat receipt combat already builds into one plain sentence a player can act on.
 * Exported so a check can assert the wording without a DOM or a live run.
 */
export function deathSentence(receipt, context = {}) {
  if (!receipt) return 'The run ended.';
  const attacker = receipt.attacker || (receipt.source && receipt.source.label) || 'Something';
  const weapon = receipt.weapon ? ` with its ${receipt.weapon}` : '';
  const direction = receipt.direction ? ` from ${receipt.direction}` : '';
  const layer = receipt.dominantLayer === 'hull'
    ? 'through the hull'
    : `through your ${receipt.dominantLayer || 'hull'}`;
  const wave = Number.isInteger(context.wave) && context.wave > 0 ? ` on wave ${context.wave}` : '';
  return `${attacker} killed you${wave}${direction}${weapon}, ${layer}.`;
}

/** Structured stop reason (PQ-133.02 shared-change #6): `aborted` alone cannot tell a
 * player quitting from the arena failing to build a wave. Resolved in two places: from
 * the `run:ended` payload in `_onRunEnded`, then again from `run.result.reason` in
 * `_publish` with the owner's latch as fallback — the publish-time resolution is what
 * survives a stale latch, and its tests pin the precedence.
 *
 * Returns null only when nothing recorded any cause (an ended run with no reason and no
 * prior latch). Null is legal: consumers must treat it as "ended, cause unrecorded",
 * never as a specific exit. A known specific cause (`wave_plan_failed`, `player_death`)
 * always wins over the generic 'player_exit' default, whether it arrives as `reason` or
 * as `fallback` — but a stale terminal latch (`victory`, `extracted`) never overrides a
 * contradictory outcome, and an unknown fallback string degrades to 'player_exit' rather
 * than leaking into the closed union. */
export function stopReasonFor(outcome, reason, fallback = null) {
  if (outcome === 'victory') return 'victory';
  if (outcome === 'extracted') return 'extracted';
  const specific = reason === 'wave_plan_failed' || reason === 'player_death' ? reason
    : (fallback === 'wave_plan_failed' || fallback === 'player_death' ? fallback : null);
  if (specific) return specific;
  // An 'extracted' reason on a defeat is a contradictory payload, not an extraction —
  // the outcome wins and the reason degrades to a generic exit.
  if (reason === 'extracted' && outcome !== 'defeat') return 'extracted';
  if (typeof reason === 'string' && reason.length > 0) return 'player_exit';
  if (typeof fallback === 'string' && fallback.length > 0) return 'player_exit';
  return null;
}

/** The one-line reason a run ended when nothing killed the player. */
export function outcomeSentence(outcome, context = {}) {
  const wave = Number.isInteger(context.wave) && context.wave > 0 ? context.wave : 0;
  if (outcome === 'victory') return `All ${wave || SURVIVAL_ARC_LENGTH} waves cleared. The arena is empty.`;
  if (outcome === 'extracted') {
    return wave
      ? `You extracted at wave ${wave} with the haul you had.`
      : 'You extracted with the haul you had.';
  }
  if (outcome === 'aborted') return 'You left the arena before the run finished.';
  return wave ? `The run ended on wave ${wave}.` : 'The run ended.';
}

export const survivalResults = {
  name: 'survivalResults',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onEntityKilled(p)));
    this._unsubs.push(this.bus.on('run:waveCleared', (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('combat:damage', (p) => this._onDamage(p)));
    this._unsubs.push(this.bus.on('player:death', (p) => this._onPlayerDeath(p)));
    this._unsubs.push(this.bus.on('run:wavePlanFailed', (p) => this._onPlanFailed(p)));
    // The chain publishes its peak as it goes. Tracked live rather than read at the end, because
    // swarmChain drops its own state on run:ended and the two receipts race.
    this._unsubs.push(this.bus.on('swarm:chain', (p) => {
      const best = p && Number.isFinite(p.best) ? p.best : 0;
      if (best > this._bestChain) this._bestChain = best;
    }));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', (p) => this._onRunEnded(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
    this._result = null;
  },

  /** The finished run's summary, or null before one has ended. Read by the results surface. */
  lastResult() {
    return this._result ? JSON.parse(JSON.stringify(this._result)) : null;
  },

  _reset() {
    this._planFailure = null;
    this._stopReason = null;
    this._result = null;
    this._kills = 0;
    this._bestChain = 0;
    this._wavesCleared = 0;
    this._deepestWave = 0;
    this._damageTrail = [];
    this._defeatReceipt = null;
  },

  _onEntityKilled(payload) {
    if (!liveSurvivalRun(this.state)) return;
    if (!payload || payload.killerId !== this.state.playerId) return;
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(payload.id)
      : null;
    if (!runOwnsReward(victim)) return;
    this._kills += 1;
  },

  _onWaveCleared(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._wavesCleared += 1;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    if (wave > this._deepestWave) this._deepestWave = wave;
  },

  _onDamage(payload) {
    if (!payload || payload.targetId !== this.state.playerId) return;
    if (!liveSurvivalRun(this.state)) return;
    // Best-effort annotation: attackerLabel is a pure function of the inputs it is
    // handed, but this is a bus handler and must never throw mid-dispatch — a label
    // failure must not cost the damage entry it annotates.
    let label = null;
    try {
      label = attackerLabel(this.state, payload.attackerId);
    } catch {
      label = null;
    }
    this._damageTrail.push({
      attackerId: payload.attackerId == null ? null : payload.attackerId,
      attackerLabel: typeof label === 'string' && label.length > 0 ? label : null,
      weaponId: payload.weaponId || null,
      amount: Number.isFinite(payload.applied) ? payload.applied : (Number(payload.amount) || 0),
      type: payload.type || null,
    });
    if (this._damageTrail.length > DAMAGE_TRAIL_LENGTH) this._damageTrail.shift();
  },

  _onPlayerDeath(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._defeatReceipt = payload || null;
    this._stopReason = 'player_death';
    // A Crucible death is the end of the run — there is no recovery berth in an arena.
    this._emit('run:endRequested', {
      outcome: 'defeat',
      reason: 'player_death',
      tick: Number.isFinite(this.state.tick) ? this.state.tick : 0,
    });
  },

  /**
   * The phase machine emits run:wavePlanFailed and then STOPS: it will not retry the plan and
   * nothing else was listening, so the player sat in an empty arena in phase `wave_intro` forever
   * — sim running, no enemies, no draft, no results, no message, exit-to-menu the only way out.
   *
   * The normal launch path cannot trip this today (the seed is normalised and every authored wave
   * validates), which is exactly why it needed an owner: it is a softlock armed by the next data
   * regression, and a regression that ends the run loudly is one somebody will notice and fix.
   */
  _onPlanFailed(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._planFailure = {
      wave: payload && Number.isInteger(payload.wave) ? payload.wave : run.wave,
      error: (payload && payload.error) || 'invalid_input',
    };
    this._stopReason = 'wave_plan_failed';
    this._emit('run:endRequested', {
      outcome: 'aborted',
      reason: 'wave_plan_failed',
      tick: Number.isFinite(this.state.tick) ? this.state.tick : 0,
    });
  },

  _onTransitioned(payload) {
    // `victory` is a terminal phase reached by transition, so no run:ended follows it.
    if (payload && payload.phase === 'victory') {
      this._stopReason = 'victory';
      this._publish('victory');
    }
  },

  _onRunEnded(payload) {
    const reason = payload && payload.reason;
    const outcome = reason === 'extracted'
      ? 'extracted'
      : ((payload && payload.outcome) || 'defeat');
    this._stopReason = stopReasonFor(outcome, reason, this._stopReason);
    this._publish(outcome);
  },

  _publish(outcome) {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival') return;
    const wave = Number.isInteger(run.wave) ? run.wave : 0;
    const receipt = this._defeatReceipt;
    const result = {
      outcome,
      seed: Number.isInteger(run.seed) ? run.seed : 0,
      arenaId: run.arenaId || null,
      wave,
      deepestWave: Math.max(this._deepestWave, wave),
      wavesCleared: this._wavesCleared,
      kills: this._kills,
      // The longest kill chain the run held. In a swarm run this is the figure the player was
      // actually playing for, so the plate has to carry it out.
      bestChain: this._bestChain,
      score: Number.isInteger(run.score) ? run.score : 0,
      credits: Number.isInteger(run.credits) ? run.credits : 0,
      xp: Number.isInteger(run.xp) ? run.xp : 0,
      level: Number.isInteger(run.level) ? run.level : 1,
      picks: Array.isArray(run.modifiers)
        ? run.modifiers.map((entry) => ({
          verb: (entry && entry.verb) || null,
          defId: (entry && entry.defId) || null,
          wave: Number.isInteger(entry && entry.wave) ? entry.wave : null,
        }))
        : [],
      headline: this._planFailure
        ? `The arena could not build wave ${this._planFailure.wave}. The run was stopped.`
        : (outcome === 'defeat' && receipt
          ? deathSentence(receipt, { wave })
          : outcomeSentence(outcome, { wave })),
      defeat: outcome === 'defeat' && receipt
        ? {
          attacker: receipt.attacker || null,
          faction: receipt.faction || null,
          weapon: receipt.weapon || null,
          direction: receipt.direction || null,
          dominantLayer: receipt.dominantLayer || null,
          cause: receipt.cause || null,
          fatalSummary: receipt.fatalSummary || null,
          vitalsPct: receipt.vitalsPct || null,
        }
        : null,
      // The last hits before the end, so "what actually took me apart" is answerable even when the
      // killing blow was not the interesting one.
      damageTrail: this._damageTrail.slice(),
      style: {
        multiplier: run.style && Number.isFinite(run.style.multiplier) ? run.style.multiplier : 1,
        recentCauses: run.style && Array.isArray(run.style.recentCauses) ? run.style.recentCauses.slice() : [],
      },
    };
    const challenge = challengeFromRun(run);
    result.ruleset = challenge.ruleset;
    result.trialId = challenge.trialId;
    result.mutators = challenge.mutators.slice();
    result.stopReason = stopReasonFor(
      outcome,
      run.result && run.result.reason,
      this._stopReason,
    );
    result.extracted = outcome === 'extracted';
    result.mode = challenge.ruleset === 'endless'
      || challenge.ruleset === 'boss_circuit'
      || challenge.ruleset === SWARM_RULESET
      ? challenge.ruleset
      : 'arc';
    result.unlocksEarned = [];
    try {
      const settled = settleCrucibleRun({ result, run });
      result.unlocksEarned = settled.unlocksEarned.slice();
    } catch {
      // A local-record failure must not swallow the results the player is owed.
    }
    this._result = result;
    this._emit('run:resultsReady', result);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
