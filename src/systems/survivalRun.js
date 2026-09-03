// Ticking Survival run phase machine (PQ-133 / CRU-011).
// Requests every phase change through run:transitionRequested; runSession is the sole writer
// of state.run.phase. Wave index is advanced only on a successful transition into wave_intro.
// Strict no-op without a live, valid survival run (absent / malformed / non-survival / inactive).
// Never infers a phase from entity counts. Never writes campaign credits, entities, or fittings.

import { validateRunState } from '../core/runState.js';
import { SURVIVAL_ARC_LENGTH, actIndexForWave, difficultyForWave } from '../data/survivalActs.js';
import { SURVIVAL_ENDLESS_WAVE_MAX } from '../data/survivalWaves.js';
import { isBossCircuitRuleset, SURVIVAL_BOSS_CIRCUIT_LENGTH } from './survivalCircuit.js';
import { isEndlessRuleset } from './survivalEndless.js';
import {
  SWARM_REFIT_EVERY,
  SWARM_WAVE_MAX,
  isSwarmDraftWave,
  isSwarmRefitWave,
  isSwarmRuleset,
} from './survivalSwarm.js';
import { isExtractionWindow } from './survivalExtraction.js';
import { planWave } from './survivalWavePlanner.js';
import {
  compileChallenge,
  normalizeMutators,
  takeQueuedChallenge,
} from './survivalMutators.js';

export const SURVIVAL_RUN_WAVE_COUNT = SURVIVAL_ARC_LENGTH;
export const SURVIVAL_REFIT_EVERY = 10;
export const SURVIVAL_ARENA_INTRO_TICKS = 1;
export const SURVIVAL_WAVE_INTRO_TICKS = 1;
export const SURVIVAL_CLEANUP_TICKS = 180;

// Wave-resolution receipt. CRU-012/013 will emit this; until they exist, tests and later
// owners drive it explicitly. Never derive this from state.entityList.
export const WAVE_CLEARED_SEAM = 'run:waveCleared';

const REASON_READY = 'ready';
const REASON_INTRO_DONE = 'intro_done';
const REASON_WAVE_START = 'wave_start';
const REASON_WAVE_CLEAR = 'wave_clear';
const REASON_DRAFT_OPEN = 'draft_open';
const REASON_PICK_DONE = 'pick_done';
const REASON_REFIT_OPEN = 'refit_open';
const REASON_REFIT_DONE = 'refit_done';
const REASON_ACT_COMPLETE = 'act_complete';

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function isPlanError(plan) {
  return !plan || plan.ok === false;
}

export const survivalRun = {
  name: 'survivalRun',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._resetMachine();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', (payload) => this._onStarted(payload)));
    this._unsubs.push(this.bus.on('run:transitioned', (payload) => this._onTransitioned(payload)));
    this._unsubs.push(this.bus.on('run:ended', () => this._resetMachine()));
    this._unsubs.push(this.bus.on('run:loadoutReady', (payload) => this._onLoadoutReady(payload)));
    this._unsubs.push(this.bus.on('run:arenaIntroComplete', () => this._onArenaIntroComplete()));
    this._unsubs.push(this.bus.on('run:waveIntroComplete', () => this._onWaveIntroComplete()));
    this._unsubs.push(this.bus.on(WAVE_CLEARED_SEAM, (payload) => this._onWaveCleared(payload)));
    this._unsubs.push(this.bus.on('run:draftResolved', () => this._onDraftResolved()));
    this._unsubs.push(this.bus.on('run:modifierChosen', () => this._onDraftResolved()));
    this._unsubs.push(this.bus.on('run:refitClosed', () => this._onRefitClosed()));
    this._unsubs.push(this.bus.on('run:extractionRequested', () => this._onExtractionRequested()));
  },

  destroy() {
    for (const off of this._unsubs || []) {
      if (typeof off === 'function') off();
    }
    this._unsubs = [];
  },

  newGame() {
    this._resetMachine();
  },

  update(dt) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase === 'victory' || run.phase === 'ended') return;

    this._runTick += 1;
    this._phaseTicks += 1;

    const phase = run.phase;
    if (phase === 'loadout') {
      if (!this._loadoutReady) return;
      this._requestTransition('loadout', 'arena_intro', REASON_READY);
      return;
    }
    if (phase === 'arena_intro') {
      if (!this._arenaIntroComplete && this._phaseTicks < SURVIVAL_ARENA_INTRO_TICKS) return;
      this._requestTransition('arena_intro', 'wave_intro', REASON_INTRO_DONE);
      return;
    }
    if (phase === 'wave_intro') {
      if (this._planFailed) return;
      if (!this._waveIntroComplete && this._phaseTicks < SURVIVAL_WAVE_INTRO_TICKS) return;
      this._requestTransition('wave_intro', 'active', REASON_WAVE_START);
      return;
    }
    if (phase === 'active') {
      if (!this._waveCleared) return;
      this._requestTransition('active', 'cleanup', REASON_WAVE_CLEAR);
      return;
    }
    if (phase === 'cleanup') {
      if (this._phaseTicks < this._cleanupTicks) return;
      this._requestCleanupExit(run);
      return;
    }
    if (phase === 'draft') {
      if (!this._draftResolved) return;
      this._requestTransition('draft', this._draftNext(run), this._draftReason(run));
      return;
    }
    if (phase === 'refit') {
      if (!this._refitClosed) return;
      this._requestTransition('refit', this._refitNext(run), this._refitReason(run));
    }
  },

  _resetMachine() {
    this._runTick = 0;
    this._phaseTicks = 0;
    this._cleanupTicks = SURVIVAL_CLEANUP_TICKS;
    this._loadoutReady = false;
    this._arenaIntroComplete = false;
    this._waveIntroComplete = false;
    this._waveCleared = false;
    this._draftResolved = false;
    this._refitClosed = false;
    this._planFailed = false;
    this._waveIntroHandled = false;
    this._systemEventFired = false;
    this._pendingFrom = null;
    this._pendingTo = null;
  },

  _clearReceiptLatches() {
    this._loadoutReady = false;
    this._arenaIntroComplete = false;
    this._waveIntroComplete = false;
    this._waveCleared = false;
    this._draftResolved = false;
    this._refitClosed = false;
  },

  _onStarted(payload) {
    this._resetMachine();
    const queued = takeQueuedChallenge();
    const run = liveSurvivalRun(this.state);
    if (run && queued) {
      run.arenaMutators = queued.mutators.slice();
      if (queued.ruleset) run.ruleset = queued.ruleset;
    }
    if (payload && payload.kind === 'survival' && payload.phase === 'loadout') {
      this._phaseTicks = 0;
    }
  },

  _onTransitioned(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const phase = payload && payload.phase;
    const previous = payload && payload.previousPhase;
    if (this._pendingFrom == null || this._pendingTo == null) return;
    if (previous !== this._pendingFrom || phase !== this._pendingTo) return;
    if (run.phase !== phase) return;

    this._pendingFrom = null;
    this._pendingTo = null;
    this._phaseTicks = 0;
    this._clearReceiptLatches();

    // FOUR WAVES OUT OF FIVE, THE SWARM DOES NOT STOP. `cleanup` may only lead to draft, refit or
    // victory, so a swarm run still passes THROUGH `draft` between waves -- it just resolves it on
    // arrival and never opens the surface. The player fights, the wave rolls, nothing is clicked.
    if (phase === 'draft' && (
      compileChallenge(run.seed, run.arenaMutators, run.ruleset).skipDraft
      || isBossCircuitRuleset(run.ruleset)
      || (isSwarmRuleset(run.ruleset) && !isSwarmDraftWave(run.wave) && !isSwarmRefitWave(run.wave))
    )) {
      this._draftResolved = true;
    }

    if (phase === 'wave_intro') {
      this._planCurrentWaveIntro(run);
      return;
    }
    this._waveIntroHandled = false;
    this._planFailed = false;
    if (phase === 'active') {
      this._emit('run:waveStarted', { wave: run.wave, tick: this._runTick });
    }
  },

  _onLoadoutReady() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'loadout') return;
    this._loadoutReady = true;
  },

  _onArenaIntroComplete() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'arena_intro') return;
    this._arenaIntroComplete = true;
  },

  _onWaveIntroComplete() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'wave_intro') return;
    this._waveIntroComplete = true;
  },

  _onWaveCleared(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'active') return;
    if (payload && Number.isInteger(payload.wave) && payload.wave !== run.wave) return;
    this._waveCleared = true;
  },

  _onDraftResolved() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'draft') return;
    this._draftResolved = true;
  },

  _onRefitClosed() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'refit') return;
    this._refitClosed = true;
  },

  _planCurrentWaveIntro(run) {
    if (this._waveIntroHandled) return;
    const nextWave = run.wave < 1 ? 1 : run.wave + 1;
    const endless = isEndlessRuleset(run.ruleset);
    const circuit = isBossCircuitRuleset(run.ruleset);
    const swarm = isSwarmRuleset(run.ruleset);
    const waveCap = swarm
      ? SWARM_WAVE_MAX
      : (circuit
        ? SURVIVAL_BOSS_CIRCUIT_LENGTH
        : (endless ? SURVIVAL_ENDLESS_WAVE_MAX : SURVIVAL_RUN_WAVE_COUNT));
    if (nextWave > waveCap) {
      this._waveIntroHandled = true;
      return;
    }
    const act = (circuit || swarm) ? 0 : actIndexForWave(nextWave);
    const plan = planWave({
      seed: run.seed,
      arenaId: run.arenaId,
      wave: nextWave,
      act,
      difficulty: endless ? 3 : difficultyForWave(nextWave),
      mutators: normalizeMutators(run.arenaMutators),
      buildSummary: null,
      mode: swarm ? 'swarm' : (endless ? 'endless' : (circuit ? 'boss_circuit' : undefined)),
      ruleset: run.ruleset,
    });
    if (isPlanError(plan)) {
      this._planFailed = true;
      this._emit('run:wavePlanFailed', {
        wave: nextWave,
        error: plan && plan.error ? plan.error : 'invalid_input',
        issues: plan && Array.isArray(plan.issues) ? plan.issues : [],
        tick: this._runTick,
      });
      return;
    }
    this._planFailed = false;
    this._waveIntroHandled = true;
    run.wave = nextWave;
    run.act = act;
    run.wavePlanId = typeof plan.id === 'string' ? plan.id : null;
    const rules = plan.completionRules;
    const cleanupTicks = rules && Number.isInteger(rules.cleanupTicks)
      ? rules.cleanupTicks
      : SURVIVAL_CLEANUP_TICKS;
    this._cleanupTicks = cleanupTicks < 0 ? 0 : cleanupTicks;
    this._emit('run:wavePlanned', { wave: run.wave, plan, tick: this._runTick });
    if (plan.systemEvent && !this._systemEventFired) {
      this._systemEventFired = true;
      this._emit('run:systemEvent', {
        wave: run.wave,
        id: plan.systemEvent.id,
        tick: this._runTick,
      });
    }
  },

  _requestCleanupExit(run) {
    if (this._isRefitWave(run)) {
      this._requestTransition('cleanup', 'refit', REASON_REFIT_OPEN);
      return;
    }
    if (this._isLastWave(run)) {
      this._requestTransition('cleanup', 'victory', REASON_ACT_COMPLETE);
      return;
    }
    this._requestTransition('cleanup', 'draft', REASON_DRAFT_OPEN);
  },

  _draftNext(run) {
    if (this._isLastWave(run)) return 'victory';
    return 'wave_intro';
  },

  _draftReason(run) {
    if (this._isLastWave(run)) return REASON_ACT_COMPLETE;
    return REASON_PICK_DONE;
  },

  _refitNext(run) {
    if (this._isLastWave(run)) return 'victory';
    return 'wave_intro';
  },

  _refitReason(run) {
    if (this._isLastWave(run)) return REASON_ACT_COMPLETE;
    return REASON_REFIT_DONE;
  },

  _isLastWave(run) {
    const wave = run && Number.isInteger(run.wave) ? run.wave : 0;
    // A swarm run has no victory screen to reach. It ends when you die, and only then.
    if (isSwarmRuleset(run && run.ruleset)) return wave >= SWARM_WAVE_MAX;
    if (isEndlessRuleset(run && run.ruleset)) return wave >= SURVIVAL_ENDLESS_WAVE_MAX;
    if (isBossCircuitRuleset(run && run.ruleset)) return wave >= SURVIVAL_BOSS_CIRCUIT_LENGTH;
    return wave >= SURVIVAL_RUN_WAVE_COUNT;
  },

  _isRefitWave(run) {
    const wave = run && Number.isInteger(run.wave) ? run.wave : 0;
    if (isSwarmRuleset(run && run.ruleset)) return wave > 0 && wave % SWARM_REFIT_EVERY === 0;
    if (isBossCircuitRuleset(run && run.ruleset)) return wave > 0;
    return wave > 0 && wave % SURVIVAL_REFIT_EVERY === 0;
  },

  _onExtractionRequested() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase !== 'cleanup' && run.phase !== 'refit') return;
    if (!isExtractionWindow(run.wave)) return;
    this._emit('run:endRequested', {
      outcome: 'aborted',
      reason: 'extracted',
      tick: this._runTick,
    });
  },

  _requestTransition(expectedPhase, nextPhase, reason) {
    this._pendingFrom = expectedPhase;
    this._pendingTo = nextPhase;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('run:transitionRequested', {
      expectedPhase,
      nextPhase,
      reason,
      tick: this._runTick,
    });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
