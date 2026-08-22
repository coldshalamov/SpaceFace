// Event-only sole writer of state.run (PQ-133 / CRU-002).
// Init-order only: never registered in PRODUCTION_UPDATE_ORDER, never ticks.
// Must not emit economy:* events, write state.player.* / state.economy.*, or construct entities.
// Golden-safety: every handler is a strict no-op when state.run is absent or malformed.

import {
  RUN_OUTCOMES,
  canTransition,
  createRunState,
  validateRunState,
} from '../core/runState.js';

const OUTCOME_SET = new Set(RUN_OUTCOMES);

function cloneRun(run) {
  try {
    return JSON.parse(JSON.stringify(run));
  } catch {
    return null;
  }
}

function toFiniteInt(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toReason(value) {
  return typeof value === 'string' ? value : null;
}

export const runSession = {
  name: 'runSession',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:beginRequested', (payload) => this.begin(payload)));
    this._unsubs.push(this.bus.on('run:transitionRequested', (payload) => this.transition(payload)));
    this._unsubs.push(this.bus.on('run:endRequested', (payload) => this.end(payload)));
    this._unsubs.push(this.bus.on('game:exitToMenu', (payload) => this._onExitToMenu(payload)));
    // save:restoring fires first (before save:loaded). Reset here so a loaded Adventure
    // save cannot inherit a live Survival run and suppress campaign autosaves forever.
    this._unsubs.push(this.bus.on('save:restoring', () => this._onSaveLifecycle()));
    this._unsubs.push(this.bus.on('save:loaded', () => this._onSaveLifecycle()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  // Sanctioned reset entry (not a bus handler): repair a present-but-malformed/null run;
  // no-op when the run key is absent entirely so legacy trees stay untouched.
  newGame() {
    if (!this._hasRunField()) return;
    this.state.run = createRunState();
  },

  begin(request) {
    const run = this._liveRun();
    if (!run || run.phase !== 'inactive') return;
    const kind = request && request.kind != null ? request.kind : 'adventure';
    const ruleset = request && request.ruleset != null ? request.ruleset : null;
    const seed = request && request.seed;
    const next = createRunState({ kind, ruleset, seed });
    next.phase = 'loadout';
    if (request && request.arenaId != null) next.arenaId = request.arenaId;
    this._commitRun(next, 'run:started', {
      schemaVersion: next.schemaVersion,
      kind: next.kind,
      ruleset: next.ruleset,
      seed: next.seed,
      phase: next.phase,
    });
  },

  transition(request) {
    const run = this._liveRun();
    if (!run) return;
    const expectedPhase = request && request.expectedPhase;
    const nextPhase = request && request.nextPhase;
    if (run.phase !== expectedPhase) return;
    if (!canTransition(run.phase, nextPhase)) return;
    const previousPhase = run.phase;
    const next = cloneRun(run);
    if (!next) return;
    next.phase = nextPhase;
    this._commitRun(next, 'run:transitioned', {
      previousPhase,
      phase: next.phase,
      reason: request && request.reason != null ? request.reason : null,
      tick: request && request.tick != null ? request.tick : 0,
    });
  },

  end(request) {
    const run = this._liveRun();
    if (!run) return;
    if (run.phase === 'victory' || run.phase === 'ended') return;
    const outcome = request && request.outcome;
    if (!OUTCOME_SET.has(outcome)) return;
    const reason = toReason(request && request.reason);
    const tick = toFiniteInt(request && request.tick, 0);
    const phase = outcome === 'victory' ? 'victory' : 'ended';
    if (!canTransition(run.phase, phase)) return;
    const next = cloneRun(run);
    if (!next) return;
    next.phase = phase;
    next.result = { outcome, reason, tick };
    this._commitRun(next, 'run:ended', {
      outcome,
      reason,
      seed: next.seed,
      phase: next.phase,
    });
  },

  _onExitToMenu(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (run.kind !== 'adventure' && run.phase !== 'inactive') {
      const tick = this.state && Number.isFinite(this.state.tick) ? this.state.tick : 0;
      this.end({
        outcome: 'aborted',
        reason: payload && payload.source != null ? payload.source : 'exit_to_menu',
        tick,
      });
    }
    this.state.run = createRunState();
  },

  _onSaveLifecycle() {
    if (!this.state) return;
    this.state.run = createRunState();
  },

  _commitRun(next, event, payload) {
    const previous = this.state.run;
    this.state.run = next;
    if (!validateRunState(next).ok) {
      this.state.run = previous;
      return false;
    }
    this._emit(event, payload);
    return true;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  _hasRunField() {
    return !!(this.state && Object.prototype.hasOwnProperty.call(this.state, 'run'));
  },

  _liveRun() {
    if (!this.state) return null;
    const run = this.state.run;
    if (!run || typeof run !== 'object') return null;
    if (!validateRunState(run).ok) return null;
    return run;
  },
};
