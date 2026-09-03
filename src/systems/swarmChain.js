// The kill chain (PQ-135) — the number a swarm game is actually played for.
//
// WHY THIS EXISTS
// ---------------
// The mode had two figures that moved: a score, which is an accountant's number nobody watches
// mid-fight, and a style multiplier, which quietly rewarded varying HOW you killed things. Neither
// tells you, in the second it happens, that you are doing well. A swarm game lives on that: the
// loop is kill → the number goes up → keep the number alive → take a risk you would not otherwise
// take. Without it the fight is just attrition with a counter on it.
//
// So there is now ONE number, and it is the loudest thing on the readout.
//
// HOW IT WORKS, and why each rule is there
// ----------------------------------------
//   * The chain grows by ONE for a kill, and by TWO when the kill arrived differently from the
//     last one. That second rule is the whole design: the fastest way to a big chain is to kill
//     with the room — throw one into a rock, then shoot one, then let a mine take one — which is
//     exactly the behaviour this mode was built to reward and previously only paid for in a
//     multiplier nobody could see. Style is no longer a separate number competing for attention;
//     it is the thing that makes THIS number climb faster.
//   * It lapses on a CLOCK, not on damage. Breaking a chain because you took a hit sounds
//     disciplined and plays terribly when thirty hulls are shooting at you — it would punish the
//     density the mode exists to create. The only way to lose a chain is to stop killing.
//   * It carries ACROSS waves. Waves already run into each other without a lull, so a chain that
//     reset at a wave boundary would be resetting at a moment the player cannot even see.
//   * It pays SCORE, and the payment is the chain itself. No tuned curve: a kill at chain 30 is
//     worth thirty more points than the same kill at chain zero. A player can read that off the
//     screen and do the arithmetic, which is worth more than a better-shaped formula they cannot.
//
// Ownership: it never writes state.run — every point goes out as a `run:awardRequested`, and
// runSession remains the sole writer of the run envelope. Event-driven except for the lapse check,
// which needs a clock.

import { runOwnsReward } from '../combat/rewardEligibility.js';
import { validateRunState } from '../core/runState.js';
import { styleCauseFromKill } from './survivalStyle.js';
import { isSwarmRuleset } from './survivalSwarm.js';

/** Seconds allowed between kills before the chain lapses. Fixed, so a player can learn it. */
export const SWARM_CHAIN_WINDOW_S = 4;
/** Chain gained by an ordinary kill, and by one that arrived differently from the last. */
export const SWARM_CHAIN_STEP = 1;
export const SWARM_CHAIN_VARIED_STEP = 2;
/** Nothing above this pays more; the number keeps climbing, the score stops running away. */
export const SWARM_CHAIN_SCORE_CAP = 60;

/** Chain values worth saying out loud. Milestones only — a line per kill would be noise. */
export const SWARM_CHAIN_MILESTONES = Object.freeze([10, 25, 50, 100, 200]);

/**
 * Score a kill is worth on top of its ordinary value, at this chain. Pure.
 *
 * The chain itself, capped. Deliberately the plainest possible rule: the player is looking at the
 * number, so the number should be the answer.
 */
export function swarmChainBonus(chain) {
  const n = Number.isFinite(chain) ? Math.max(0, Math.trunc(chain)) : 0;
  return Math.min(SWARM_CHAIN_SCORE_CAP, n);
}

/** How much a kill adds, given whether it arrived differently from the one before it. */
export function swarmChainStep(cause, previousCause) {
  if (!previousCause || cause === previousCause) return SWARM_CHAIN_STEP;
  return SWARM_CHAIN_VARIED_STEP;
}

/** The highest milestone at or below `chain` that is above `previous`, or null. Pure. */
export function swarmChainMilestone(chain, previous) {
  let hit = null;
  for (const mark of SWARM_CHAIN_MILESTONES) {
    if (chain >= mark && previous < mark) hit = mark;
  }
  return hit;
}

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive' || run.phase === 'ended') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function simTimeOf(state) {
  if (Number.isFinite(state && state.simTime)) return state.simTime;
  return Math.max(0, Number(state && state.tick) || 0) / 60;
}

export const swarmChain = {
  name: 'swarmChain',
  id: 'swarmChain',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._onRunEnded()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  /**
   * The lapse check. This is the only reason the system ticks: a chain that ended because the
   * player stopped killing has to notice on its own, with nothing to notify it.
   */
  update(dt, state) {
    const st = state || this.state;
    if (this._chain <= 0) return;
    const run = liveSwarmRun(st);
    if (!run) { this._break('run_over'); return; }
    // The phase machine pauses the world on the draft and refit surfaces, but sim time can still
    // advance around them; a chain must not die because the player was reading three cards.
    if (run.phase !== 'active' && run.phase !== 'cleanup') {
      this._lastKillAt = simTimeOf(st);
      return;
    }
    if (simTimeOf(st) - this._lastKillAt > SWARM_CHAIN_WINDOW_S) this._break('lapsed');
  },

  /** Live chain state, for the readout and for tests. Read-only. */
  chainState() {
    return {
      chain: this._chain,
      best: this._best,
      lastCause: this._lastCause,
      expiresIn: this._chain > 0
        ? Math.max(0, SWARM_CHAIN_WINDOW_S - (simTimeOf(this.state) - this._lastKillAt))
        : 0,
    };
  },

  _reset() {
    this._chain = 0;
    this._best = 0;
    this._lastCause = null;
    this._lastKillAt = 0;
    this._milestone = 0;
  },

  _onKilled(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
    // The cohort mark, exactly as the reward path uses it — and, exactly as there, WHOEVER killed
    // it. A hull the room put through a rock is the player's kill; that is the entire point of the
    // varied-cause rule below.
    if (!runOwnsReward(victim)) return;

    const now = simTimeOf(this.state);
    const cause = styleCauseFromKill(payload);
    const continues = this._chain > 0 && (now - this._lastKillAt) <= SWARM_CHAIN_WINDOW_S;
    const step = continues ? swarmChainStep(cause, this._lastCause) : SWARM_CHAIN_STEP;
    this._chain = continues ? this._chain + step : step;
    this._lastCause = cause;
    this._lastKillAt = now;
    if (this._chain > this._best) this._best = this._chain;

    const bonus = swarmChainBonus(this._chain);
    if (bonus > 0) {
      this._emit('run:awardRequested', { score: bonus, reason: 'chain', wave: run.wave });
    }

    const milestone = swarmChainMilestone(this._chain, this._milestone);
    if (milestone) {
      this._milestone = milestone;
      // Milestones only. A line per kill would bury every other thing the fight has to say.
      this._emit('toast', { text: `CHAIN ${milestone}`, kind: 'good', ttl: 1.8 });
    }
    this._emit('swarm:chain', { chain: this._chain, best: this._best, cause, wave: run.wave });
  },

  _onRunEnded() {
    // Publish the run's best before dropping it — the results plate and the record band both want
    // it, and after this the state is gone.
    if (this._best > 0) this._emit('swarm:chainBest', { best: this._best });
    this._reset();
  },

  _break(reason) {
    if (this._chain <= 0) return;
    const ended = this._chain;
    this._chain = 0;
    this._lastCause = null;
    this._milestone = 0;
    this._emit('swarm:chainBroken', { chain: ended, best: this._best, reason });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};

export default swarmChain;
