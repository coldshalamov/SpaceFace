// Ticking Survival run phase machine (PQ-133 / CRU-011).
// Requests every phase change through run:transitionRequested; runSession is the sole writer
// of state.run.phase. Wave index is advanced only on a successful transition into wave_intro.
// Strict no-op without a live, valid survival run (absent / malformed / non-survival / inactive).
// Never infers a phase from entity counts. Never writes campaign credits, entities, or fittings.

import { validateRunState } from '../core/runState.js';
import {
  SURVIVAL_ARC_LENGTH,
  SURVIVAL_TEMPLATE_BLOCK,
  actIndexForWave,
  difficultyForWave,
} from '../data/survivalActs.js';
import { SURVIVAL_ENDLESS_WAVE_MAX } from '../data/survivalWaves.js';
import {
  CIRCUIT_DESTINATIONS,
  CIRCUIT_EVENT,
  CIRCUIT_ROUNDS_PER_STAGE,
  CIRCUIT_SERVICES,
  CIRCUIT_STAGE_COUNT,
  CIRCUIT_TOTAL_ROUNDS,
  circuitChoicesFor,
  circuitEntryBlocker,
  circuitFor,
  circuitRoundFor,
  circuitSalvageOffer,
  circuitStateError,
  circuitTreasurePick,
  createCircuitState,
  isBossCircuitRuleset,
  SURVIVAL_BOSS_CIRCUIT_LENGTH,
} from './survivalCircuit.js';
import { isEndlessRuleset } from './survivalEndless.js';
import {
  SWARM_REFIT_EVERY,
  SWARM_WAVE_MAX,
  isSwarmDraftWave,
  isSwarmRefitWave,
  isSwarmRuleset,
} from './survivalSwarm.js';
import { isExtractionWindow, partialBankOffer } from './survivalExtraction.js';
import { summarizeRunBuild } from '../data/runModifiers.js';
import { planWave } from './survivalWavePlanner.js';
import {
  compileChallenge,
  consumeQueuedGhostHash,
  consumeQueuedPractice,
  consumeQueuedWeeklyMutatorId,
  lastQueuedGhostHash,
  normalizeMutators,
  takeQueuedChallenge,
} from './survivalMutators.js';
import {
  armGhostPlayback,
  beginGhostRecording,
  loadCrucibleMeta,
  sampleGhostPoseFromState,
} from './survivalRecords.js';
import { applyHangarToPlayer } from './swarmHangar.js';
import { ownedSwarmLegendaryIds, SWARM_LEGENDARY_RECORD_KIND } from '../data/swarmDraft.js';
import { swarmThreatMutatorIds } from '../data/swarmThreats.js';
import { POWERED_CONVEYOR_RULESET, POWERED_CONVEYOR_DEMO_TICKS } from '../data/survivalMutators.js';

export const SURVIVAL_RUN_WAVE_COUNT = SURVIVAL_ARC_LENGTH;
export const SURVIVAL_REFIT_EVERY = 10;
// FB-025 — real intro beats: two seconds for the arena, a second and a half for each wave.
// survivalAnnounce owns the completion emit at window end; these constants are the machine's
// floor AND its backstop when the announce voice is muted or absent. Never freezes the player.
export const SURVIVAL_ARENA_INTRO_TICKS = 120;
export const SURVIVAL_WAVE_INTRO_TICKS = 90;
export const SURVIVAL_CLEANUP_TICKS = 180;

// PQ-133.04 R4 — the bounded public block (CRU-030/027). One authored ten-wave block — the
// template the thirty-wave arc reuses — ending in wave-ten victory. Same planner owner, same
// recipes, same drafts: `resolvePlanMode` reads ruleset 'block' as the arc path, so waves 1-10
// are BYTE-IDENTICAL to the scored template. The only differences are the ceiling (one block,
// not three) and the shape of the ending (victory at 10, never a refit bench at the top).
export const BLOCK_RULESET = 'block';

export function isBlockRuleset(ruleset) {
  return ruleset === BLOCK_RULESET;
}

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

/**
 * Milliseconds of sim time between a death mark and control regained. Pure, so the retry bar
 * ("death to control on the same seed in under 5 s") is assertable without a DOM or wall clock.
 */
export function retryLatencyMs(deathMark, controlSimTime) {
  const death = deathMark && Number.isFinite(deathMark.simTime) ? deathMark.simTime : 0;
  const control = Number.isFinite(controlSimTime) ? controlSimTime : 0;
  return Math.max(0, Math.round((control - death) * 1000));
}

export const survivalRun = {
  name: 'survivalRun',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._lastControl = null;
    this._launchSeed = null;
    this._resetMachine();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', (payload) => this._onStarted(payload)));
    this._unsubs.push(this.bus.on('run:transitioned', (payload) => this._onTransitioned(payload)));
    this._unsubs.push(this.bus.on('run:ended', () => this._resetMachine()));
    this._unsubs.push(this.bus.on('run:loadoutReady', (payload) => this._onLoadoutReady(payload)));
    this._unsubs.push(this.bus.on('run:openingPrepareRequested', () => this._prepareOpening()));
    this._unsubs.push(this.bus.on('run:arenaIntroComplete', () => this._onArenaIntroComplete()));
    this._unsubs.push(this.bus.on('run:waveIntroComplete', () => this._onWaveIntroComplete()));
    this._unsubs.push(this.bus.on(WAVE_CLEARED_SEAM, (payload) => this._onWaveCleared(payload)));
    this._unsubs.push(this.bus.on('run:draftResolved', () => this._onDraftResolved()));
    this._unsubs.push(this.bus.on('run:modifierChosen', () => this._onDraftResolved()));
    this._unsubs.push(this.bus.on('run:refitClosed', () => this._onRefitClosed()));
    this._unsubs.push(this.bus.on('run:extractionRequested', () => this._onExtractionRequested()));
    this._unsubs.push(this.bus.on('run:partialBankRequested', () => this._onPartialBankRequested()));
    // SWARM-08 B5 — Circuit choices travel the ordinary draft-pick intent, then this internal
    // simulation event. This owner is the sole writer of `run.telemetry.circuit`.
    this._unsubs.push(this.bus.on('run:circuitChoiceRequested', (payload) => this._onCircuitChoiceRequested(payload)));
    // PQ-174.06: stamp the death moment so a same-seed retry is measurable from it. The mark
    // survives the run:ended reset below and is cleared only when the next run begins.
    this._unsubs.push(this.bus.on('player:death', () => this._onPlayerDeath()));
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

  /** The stamped death moment ({ tick, simTime }), or null before the first death. */
  lastDeathMark() {
    return this._lastDeath ? { ...this._lastDeath } : null;
  },

  /** First moment this run entered `active` — the player has control. Null before that. */
  lastControl() {
    return this._lastControl ? { ...this._lastControl } : null;
  },

  update(dt) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase === 'victory' || run.phase === 'ended') return;

    this._runTick += 1;
    this._phaseTicks += 1;
    sampleGhostPoseFromState(this.state);

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
      // Let the expendable workpiece show one powered pulse before any foe can arrive.
      if (run.ruleset === POWERED_CONVEYOR_RULESET && run.wave === 1
        && this._phaseTicks < POWERED_CONVEYOR_DEMO_TICKS) return;
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
      if (circuitStateError(run)) return;
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
    // PQ-133.07: the arc authors TWO system events (wave 20 and the wave-30 finale). The latch is
    // per-event, not one boolean for the whole run, so the finale still fires while a re-plan of an
    // already-fired wave can never double-emit it.
    this._systemEventIds = new Set();
    this._pendingFrom = null;
    this._pendingTo = null;
    this._controlMark = null;
    this._openingLesson = false;
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
    // SWARM-08 B5 — the Circuit entry gate reads this: a queued trial/daily challenge owns the
    // run's contract and may not also steer it through the Circuit.
    this._queuedChallenge = !!queued;
    // A queued/share challenge rewrites the run's mutators and ruleset — its wave contract must
    // stay byte-identical for reproduction, so it never also gets the first-run opening lesson.
    this._openingLesson = !!(payload && payload.openingLesson === true) && !queued;
    this._lastDeath = null;
    const run = liveSurvivalRun(this.state);
    if (run && queued) {
      run.arenaMutators = queued.mutators.slice();
      if (queued.ruleset) run.ruleset = queued.ruleset;
    }
    // SWARM-06: the Threat cards that rewrite the run's rules ride the mutator machinery — the
    // draft/reroll blocks read `run.arenaMutators`, so a No Re-rolls wager is the same contract
    // as the mutator of the same name, stacked honestly on top of any queued challenge.
    if (run && isSwarmRuleset(run.ruleset)) {
      const threatMutators = swarmThreatMutatorIds(run.telemetry && run.telemetry.threats);
      if (threatMutators.length) {
        run.arenaMutators = normalizeMutators([
          ...(Array.isArray(run.arenaMutators) ? run.arenaMutators : []),
          ...threatMutators,
        ]);
      }
    }
    if (run) {
      this._launchSeed = Number.isInteger(run.seed) ? run.seed : null;
      beginGhostRecording({
        seed: run.seed,
        hullId: null,
      });
      armGhostPlayback(lastQueuedGhostHash());
      consumeQueuedGhostHash();
      consumeQueuedWeeklyMutatorId();
      if (consumeQueuedPractice()) run.practice = true;
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

    // EVERY WAVE OPENS THE ARMORY NOW — SWARM_DRAFT_EVERY is 1, so the swarm leg of this latch is
    // dormant. It stays written because `cleanup` may still only lead to draft, refit or victory:
    // if the armory cadence ever thins again, a swarm run passes THROUGH `draft` on the off waves
    // and must resolve it on arrival rather than flash a menu. The legs that still fire today are
    // draftless contracts and the boss circuit.
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
      if (this._controlMark == null) {
        this._controlMark = {
          seed: Number.isInteger(run.seed) ? run.seed : this._launchSeed,
          wave: Number.isInteger(run.wave) ? run.wave : 0,
          tick: this._runTick,
          simTime: this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
        };
        this._lastControl = { ...this._controlMark };
      }
    }
  },

  _onLoadoutReady() {
    const run = liveSurvivalRun(this.state);
    if (!run || run.phase !== 'loadout') return;
    this._loadoutReady = true;
  },

  _prepareOpening() {
    const run = liveSurvivalRun(this.state);
    if (this.state?.mode !== 'loading' || !run || run.phase !== 'loadout' || !this._loadoutReady) return;
    // Populate the real first round before GPU preparation. Intro timers are
    // useful between rounds; at launch they would hide the very hulls and rocks
    // the loading screen needs to prepare, leaving invisible pursuers in flight.
    // The swarm is different: its opening stop is the armory, not the arena. The purse the
    // stake bought lands in the wallet while the load screen is up, the draft card row opens
    // on draft entry, and the tick machine carries draft→wave_intro once flight resumes —
    // so a run can only reach wave one through the shop the way every later wave does.
    if (isSwarmRuleset(run.ruleset)) {
      const entities = this.state && this.state.entities;
      const player = entities && this.state.playerId != null && typeof entities.get === 'function'
        ? entities.get(this.state.playerId)
        : null;
      if (player) {
        const stamped = run.telemetry && run.telemetry.hangar;
        applyHangarToPlayer(this.state, stamped || loadCrucibleMeta().hangar);
      }
      this._requestTransition('loadout', 'draft', REASON_DRAFT_OPEN);
      return;
    }
    this._requestTransition('loadout', 'arena_intro', REASON_READY);
    this._requestTransition('arena_intro', 'wave_intro', REASON_INTRO_DONE);
    if (!this._planFailed && run.ruleset !== POWERED_CONVEYOR_RULESET) {
      this._requestTransition('wave_intro', 'active', REASON_WAVE_START);
    }
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
    this._advanceCircuitOnClear(run);
  },

  /**
   * SWARM-08 B5 — the journey advances exactly once per stage boundary. The wave owner emits one
   * clear receipt per wave, and the cleared-stage guard makes a duplicate replay a no-op.
   */
  _advanceCircuitOnClear(run) {
    const circuit = circuitFor(run);
    if (!circuit) return;
    const wave = Number.isInteger(run.wave) ? run.wave : 0;
    const stageBoundary = wave > 0 && wave % CIRCUIT_ROUNDS_PER_STAGE === 0;
    // RC-CRUCIBLE-DOOR (row 481) — a champion-call stage ends the moment its door-round boss
    // falls: the cleared wave settles the whole stage, and the wave index jumps to where the
    // stage would have ended so the next planned round opens the following stage.
    const clearedRound = stageBoundary ? null : circuitRoundFor(run, wave);
    const championClear = !!clearedRound
      && clearedRound.fight === 'champion'
      && clearedRound.kind === 'boss';
    if (!stageBoundary && !championClear) return;
    const clearedStage = stageBoundary ? wave / CIRCUIT_ROUNDS_PER_STAGE : clearedRound.stage;
    if (clearedStage > CIRCUIT_STAGE_COUNT) return;
    if (circuit.clearedStages >= clearedStage) return;
    circuit.clearedStages = clearedStage;
    circuit.revision += 1;
    if (clearedStage === CIRCUIT_STAGE_COUNT) {
      circuit.status = 'finale';
      circuit.wonAtWave = CIRCUIT_TOTAL_ROUNDS;
    } else {
      circuit.status = 'route';
    }
    if (championClear) run.wave = clearedStage * CIRCUIT_ROUNDS_PER_STAGE;
    run.telemetry.circuit = circuit;
  },

  /**
   * Validate and commit a Circuit choice. The id is matched against the LIVE offered descriptors,
   * so a stale revision, a duplicate, a wrong wave or an out-of-phase request changes nothing.
   * Accepted choices echo through `run:circuitChoiceApplied` for the armory to refresh on.
   */
  _onCircuitChoiceRequested(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run || !isSwarmRuleset(run.ruleset) || run.phase !== 'draft') return;
    const error = circuitStateError(run);
    if (error) {
      this._emit('run:circuitChoiceApplied', { offerId: payload?.offerId, accepted: false, reason: error });
      return;
    }
    const circuit = circuitFor(run);
    const offerId = payload && payload.offerId;
    const choice = circuitChoicesFor(run).find((entry) => entry.id === offerId) || null;
    if (!choice) {
      this._emit('run:circuitChoiceApplied', {
        offerId,
        accepted: false,
        kind: null,
        reason: 'That Circuit choice is no longer available.',
      });
      return;
    }
    if (choice.kind === 'start') {
      const blocker = circuitEntryBlocker(run, { queuedChallenge: this._queuedChallenge === true });
      if (blocker) {
        this._emit('run:circuitChoiceApplied', { offerId, accepted: false, kind: 'start', reason: blocker });
        return;
      }
      if (circuit) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'start', reason: 'The Circuit has already begun.',
        });
        return;
      }
      if (!run.telemetry || typeof run.telemetry !== 'object') run.telemetry = {};
      const next = createCircuitState(run.arenaId, choice.arenaId);
      // Accepting the r1 descriptor moves the revision on, so replaying the same id is stale.
      next.revision = choice.revision + 1;
      run.telemetry.circuit = next;
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'start', circuit: circuitFor(run),
      });
      return;
    }
    if (choice.kind === 'route') {
      if (circuit.status !== 'route' || choice.stage !== circuit.clearedStages + 1) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'route', reason: 'That destination is not on offer.',
        });
        return;
      }
      const routeEntry = { stage: choice.stage, arenaId: choice.arenaId, nodeId: choice.nodeId || choice.arenaId };
      if (choice.fight === 'elite' || choice.fight === 'challenge' || choice.fight === 'champion') {
        routeEntry.fight = choice.fight;
      }
      circuit.route = circuit.route
        .filter((entry) => entry.stage !== choice.stage)
        .concat([routeEntry])
        .sort((a, b) => a.stage - b.stage);
      circuit.status = 'running';
      circuit.revision += 1;
      // The destination must be installed BEFORE the next plan is emitted: survivalArena and
      // swarmArena read the run's own arenaId through their registered slots.
      run.arenaId = choice.arenaId;
      run.telemetry.circuit = circuit;
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'route', arenaId: choice.arenaId, circuit: circuitFor(run),
      });
      return;
    }
    if (choice.kind === 'event') {
      if (circuit.status !== 'route' || circuit.card || choice.stage !== circuit.clearedStages + 1) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'event', reason: 'That event is not on offer.',
        });
        return;
      }
      circuit.card = { id: CIRCUIT_EVENT.id, stage: choice.stage };
      circuit.revision += 1;
      run.telemetry.circuit = circuit;
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'event', circuit: circuitFor(run),
      });
      return;
    }
    if (choice.kind === 'salvage' || choice.kind === 'leave') {
      if (circuit.status !== 'route' || !circuit.card || circuit.card.stage !== choice.stage) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: choice.kind, reason: 'That answer is not on the card.',
        });
        return;
      }
      const stage = circuit.card.stage;
      const dest = (CIRCUIT_DESTINATIONS[stage] || [])[0];
      if (!dest) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: choice.kind, reason: 'That stage has no room.',
        });
        return;
      }
      let salvage = null;
      if (choice.kind === 'salvage') {
        salvage = circuitSalvageOffer(this.state);
        if (!salvage) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'salvage',
            reason: 'The hull has no open hardpoint for that salvage.',
          });
          return;
        }
        const before = Number.isFinite(run.credits) ? run.credits : 0;
        const cost = CIRCUIT_EVENT.salvageCost;
        if (!(before >= cost)) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'salvage',
            reason: 'Not enough run credits to salvage.',
          });
          return;
        }
        this._emit('run:spendRequested', { credits: cost, reason: 'circuit_derelict_salvage' });
        const paid = liveSurvivalRun(this.state);
        if (!paid || paid.credits !== before - cost) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'salvage', reason: 'The purse refused the salvage.',
          });
          return;
        }
        const paidCircuit = circuitFor(paid);
        if (!paidCircuit || !paidCircuit.card) {
          this._emit('run:awardRequested', { credits: cost, reason: 'circuit_derelict_refund' });
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'salvage', reason: 'The card is no longer on the table.',
          });
          return;
        }
        const installed = this._installCircuitRoom(paid, paidCircuit, stage, dest);
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: true, kind: 'salvage', arenaId: installed.arenaId,
          salvage, circuit: circuitFor(paid),
        });
        return;
      }
      const installed = this._installCircuitRoom(run, circuit, stage, dest);
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'leave', arenaId: installed.arenaId, circuit: circuitFor(run),
      });
      return;
    }
    if (choice.kind === 'service') {
      if (circuit.status !== 'route' || circuit.card || circuit.service
        || choice.stage !== circuit.clearedStages + 1) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'service', reason: 'That service is not on offer.',
        });
        return;
      }
      const svc = CIRCUIT_SERVICES.find((entry) => entry.id === choice.serviceId);
      if (!svc) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'service', reason: 'That service is not on offer.',
        });
        return;
      }
      if (svc.id === 'armory') {
        circuit.service = { id: 'armory', stage: choice.stage };
        circuit.revision += 1;
        run.telemetry.circuit = circuit;
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: true, kind: 'service', serviceId: 'armory', circuit: circuitFor(run),
        });
        return;
      }
      if (svc.id === 'repair') {
        const player = this._playerEntity();
        const hullMax = Number(player && player.hullMax);
        const hull = Number(player && player.hull);
        if (!player || !(hullMax > 0) || !(hull < hullMax)) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'repair',
            reason: 'The hull is already sound.',
          });
          return;
        }
        const cost = svc.cost;
        const before = Number.isFinite(run.credits) ? run.credits : 0;
        if (!(before >= cost)) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'repair',
            reason: 'Not enough run credits to repair.',
          });
          return;
        }
        this._emit('run:spendRequested', { credits: cost, reason: 'circuit_repair' });
        const paid = liveSurvivalRun(this.state);
        if (!paid || paid.credits !== before - cost) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'repair',
            reason: 'The purse refused the repair.',
          });
          return;
        }
        const livePlayer = this._playerEntity();
        if (livePlayer) livePlayer.hull = livePlayer.hullMax;
        const paidCircuit = circuitFor(paid);
        if (!paidCircuit || !this._advanceCircuitService(paid, paidCircuit, choice.stage, 'repair')) {
          this._emit('run:awardRequested', { credits: cost, reason: 'circuit_repair_refund' });
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'repair',
            reason: 'The route is no longer on the table.',
          });
          return;
        }
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: true, kind: 'service', serviceId: 'repair', circuit: circuitFor(paid),
        });
        return;
      }
      if (svc.id === 'treasure') {
        const pick = circuitTreasurePick(run.seed, choice.stage, run.wave, ownedSwarmLegendaryIds(run));
        if (!pick) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'treasure',
            reason: 'Nothing in the box is still for sale.',
          });
          return;
        }
        const before = Number.isFinite(run.credits) ? run.credits : 0;
        if (!(before >= pick.price)) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'treasure',
            reason: 'Not enough run credits for that legendary.',
          });
          return;
        }
        this._emit('run:spendRequested', { credits: pick.price, reason: 'circuit_treasure' });
        const paid = liveSurvivalRun(this.state);
        if (!paid || paid.credits !== before - pick.price) {
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'treasure',
            reason: 'The purse refused the treasure.',
          });
          return;
        }
        this._emit('run:modifierRecordRequested', {
          record: {
            kind: SWARM_LEGENDARY_RECORD_KIND,
            offerId: pick.offerId,
            legendaryId: pick.id,
            name: pick.name,
            wave: Math.max(1, paid.wave),
          },
          draft: { wave: paid.wave, offered: [pick.offerId], picked: pick.offerId },
          wave: paid.wave,
        });
        const recorded = liveSurvivalRun(this.state);
        if (!recorded || !ownedSwarmLegendaryIds(recorded).includes(pick.id)) {
          this._emit('run:awardRequested', { credits: pick.price, reason: 'circuit_treasure_refund' });
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'treasure',
            reason: 'That legendary would not stay on the manifest.',
          });
          return;
        }
        const recordedCircuit = circuitFor(recorded);
        if (!recordedCircuit || !this._advanceCircuitService(recorded, recordedCircuit, choice.stage, 'treasure')) {
          this._emit('run:awardRequested', { credits: pick.price, reason: 'circuit_treasure_refund' });
          this._emit('run:circuitChoiceApplied', {
            offerId, accepted: false, kind: 'service', serviceId: 'treasure',
            reason: 'The route is no longer on the table.',
          });
          return;
        }
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: true, kind: 'service', serviceId: 'treasure',
          treasure: pick, circuit: circuitFor(recorded),
        });
        return;
      }
    }
    if (choice.kind === 'service_done') {
      if (circuit.status !== 'route' || !circuit.service || circuit.service.id !== 'armory'
        || circuit.service.stage !== choice.stage) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'service_done', reason: 'The bench is not open.',
        });
        return;
      }
      if (!this._advanceCircuitService(run, circuit, choice.stage, 'armory')) {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'service_done', reason: 'The route is no longer on the table.',
        });
        return;
      }
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'service_done', serviceId: 'armory', circuit: circuitFor(run),
      });
      return;
    }
    if (choice.kind === 'finish') {
      if (circuit.status !== 'finale') {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'finish', reason: 'The Circuit is not finished yet.',
        });
        return;
      }
      circuit.status = 'completed';
      circuit.revision += 1;
      run.telemetry.circuit = circuit;
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'finish', circuit: circuitFor(run),
      });
      // runSession writes the terminal phase; no new run phase is invented.
      this._emit('run:endRequested', { outcome: 'victory', reason: 'circuit_complete', tick: this._runTick });
      return;
    }
    if (choice.kind === 'overtime') {
      if (circuit.status !== 'finale') {
        this._emit('run:circuitChoiceApplied', {
          offerId, accepted: false, kind: 'overtime', reason: 'The Circuit is not finished yet.',
        });
        return;
      }
      circuit.status = 'overtime';
      circuit.revision += 1;
      run.telemetry.circuit = circuit;
      this._emit('run:circuitChoiceApplied', {
        offerId, accepted: true, kind: 'overtime', circuit: circuitFor(run),
      });
      // The build, purse, score and seed are untouched; the armory resolves through its own path.
      return;
    }
  },

  /** Install the stage's first ordinary room and clear the card. The draft stays open. */
  _installCircuitRoom(run, circuit, stage, dest) {
    const routeEntry = { stage, arenaId: dest.arenaId, nodeId: dest.nodeId };
    circuit.route = circuit.route
      .filter((entry) => entry.stage !== stage)
      .concat([routeEntry])
      .sort((a, b) => a.stage - b.stage);
    circuit.status = 'running';
    delete circuit.card;
    circuit.revision += 1;
    run.arenaId = dest.arenaId;
    run.telemetry.circuit = circuit;
    return dest;
  },

  /** The player ship, when the sim has one. Hull writes stay on that entity. */
  _playerEntity() {
    const state = this.state;
    if (!state || state.playerId == null || !state.entities) return null;
    return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  },

  /**
   * Record a service stop and skip its stage. The route grows by one service entry and the
   * next fight, if any, is the following stage. No arena is installed and no wave is planned.
   */
  _advanceCircuitService(run, circuit, stage, serviceId) {
    if (!run || !circuit || !Array.isArray(circuit.route) || !Number.isInteger(stage)) return false;
    const routeEntry = { stage, arenaId: serviceId, nodeId: serviceId, nodeKind: 'service' };
    circuit.route = circuit.route
      .filter((entry) => entry.stage !== stage)
      .concat([routeEntry])
      .sort((a, b) => a.stage - b.stage);
    delete circuit.card;
    delete circuit.service;
    circuit.clearedStages = stage;
    circuit.revision += 1;
    if (circuit.clearedStages >= CIRCUIT_STAGE_COUNT) {
      circuit.status = 'finale';
      circuit.wonAtWave = CIRCUIT_TOTAL_ROUNDS;
    } else {
      circuit.status = 'route';
      circuit.wonAtWave = null;
    }
    run.wave = circuit.clearedStages * CIRCUIT_ROUNDS_PER_STAGE;
    if (!run.telemetry || typeof run.telemetry !== 'object') run.telemetry = {};
    run.telemetry.circuit = circuit;
    return circuitFor(run) != null;
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
    const error = circuitStateError(run);
    if (error) {
      this._planFailed = true;
      this._emit('run:wavePlanFailed', { wave: run.wave + 1, error: 'circuit_invalid', issues: [error], tick: this._runTick });
      return;
    }
    const nextWave = run.wave < 1 ? 1 : run.wave + 1;
    const endless = isEndlessRuleset(run.ruleset);
    const circuit = isBossCircuitRuleset(run.ruleset);
    const swarm = isSwarmRuleset(run.ruleset);
    const block = isBlockRuleset(run.ruleset);
    const waveCap = swarm
      ? SWARM_WAVE_MAX
      : (circuit
        ? SURVIVAL_BOSS_CIRCUIT_LENGTH
        : (endless
          ? SURVIVAL_ENDLESS_WAVE_MAX
          : (block ? SURVIVAL_TEMPLATE_BLOCK : SURVIVAL_RUN_WAVE_COUNT)));
    if (nextWave > waveCap) {
      this._waveIntroHandled = true;
      return;
    }
    const act = (circuit || swarm) ? 0 : actIndexForWave(nextWave);
    // SWARM-08 B5 — the finite journey descriptor for this round, or null for ordinary Swarm,
    // the older Boss Circuit, and Circuit Overtime (waves 17+ plan as ordinary Swarm).
    // The ring belongs to the fight the ship is in. A later stage changes the arena
    // id and does not move the ship, so a catalog spawn would leave the ring behind.
    const entities = this.state && this.state.entities;
    const player = entities && this.state.playerId != null && typeof entities.get === 'function'
      ? entities.get(this.state.playerId)
      : null;
    const origin = player && player.alive !== false && player.pos
      && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z)
      ? { x: player.pos.x, z: player.pos.z }
      : null;
    const journey = swarm && !circuit ? circuitRoundFor(run, nextWave, origin) : null;
    const plan = planWave({
      seed: run.seed,
      arenaId: run.arenaId,
      wave: nextWave,
      act,
      difficulty: endless ? 3 : difficultyForWave(nextWave),
      mutators: normalizeMutators(run.arenaMutators),
      // SF-072: the picks the run has already made tell the next wave what to lean on.
      buildSummary: summarizeRunBuild(run.modifiers),
      mode: swarm ? 'swarm' : (endless ? 'endless' : (circuit ? 'boss_circuit' : undefined)),
      ruleset: run.ruleset,
      // The run's stake is the swarm's pressure/earn contract; the planner scales the block
      // off it. Telemetry holds it because run state is closed schema and stakes never save.
      swarmStake: run.telemetry && typeof run.telemetry.swarmStake === 'string'
        ? run.telemetry.swarmStake
        : null,
      // SWARM-06: the Threat wager rides the same seam — the planner multiplies pressure and
      // trims the purse off it, and the swarm-elites runtime reads the same list for the
      // per-body stamps.
      swarmThreats: swarm && run.telemetry && Array.isArray(run.telemetry.threats)
        ? run.telemetry.threats
        : null,
      // SWARM-08 B5 — objective and boss ownership for a Circuit round. Omitted for every
      // ordinary swarm wave, so its plan stays byte-identical.
      circuitRound: journey,
      // The first-run lesson belongs to the ordinary opening, never to a Circuit round.
      teachOpening: swarm && !journey && nextWave === 1 && this._openingLesson === true,
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
    if (plan.systemEvent && !this._systemEventIds.has(plan.systemEvent.id)) {
      this._systemEventIds.add(plan.systemEvent.id);
      this._emit('run:systemEvent', {
        wave: run.wave,
        id: plan.systemEvent.id,
        tick: this._runTick,
      });
    }
  },

  _requestCleanupExit(run) {
    // A swarm run takes its CARD FIRST on a wave that is both. `draft -> refit` is a legal edge,
    // so a wave-10 stop is draft then bench rather than a bench instead of the draft the player
    // came for. The arc keeps its own shape: there, wave 10 has always been a bench and nothing
    // else, and the two rulesets are not obliged to agree.
    if (isSwarmRuleset(run && run.ruleset) && isSwarmDraftWave(run && run.wave)) {
      this._requestTransition('cleanup', 'draft', REASON_DRAFT_OPEN);
      return;
    }
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
    // The bench comes after the card on a swarm refit wave — see _requestCleanupExit.
    if (isSwarmRuleset(run && run.ruleset) && this._isRefitWave(run)) return 'refit';
    return 'wave_intro';
  },

  _draftReason(run) {
    if (this._isLastWave(run)) return REASON_ACT_COMPLETE;
    if (isSwarmRuleset(run && run.ruleset) && this._isRefitWave(run)) return REASON_REFIT_OPEN;
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
    // PQ-133.04 R4: a block run's whole point is the ten-wave ending — wave ten is victory.
    if (isBlockRuleset(run && run.ruleset)) return wave >= SURVIVAL_TEMPLATE_BLOCK;
    return wave >= SURVIVAL_RUN_WAVE_COUNT;
  },

  _isRefitWave(run) {
    const wave = run && Number.isInteger(run.wave) ? run.wave : 0;
    if (isSwarmRuleset(run && run.ruleset)) return wave > 0 && wave % SWARM_REFIT_EVERY === 0;
    if (isBossCircuitRuleset(run && run.ruleset)) return wave > 0;
    // PQ-133.04 R4: a block run never benches. Without this, the scored refit-at-ten rule
    // would put a refit between the wave-ten clear and the victory the block exists to reach.
    if (isBlockRuleset(run && run.ruleset)) return false;
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

  /**
   * The window's middle seat: bank half the purse and keep flying the rest. The spend moves
   * the banked part out of the run wallet through the ordinary purse owner, and the secured
   * stamp rides telemetry the way the stake, threats and hangar already do — the run state
   * schema is closed to a new top-level field. Settlement reads the stamp in
   * hangarBankInput: banked-now means banked forever, and only the remainder answers to the
   * ending's fraction, so a later death or cash-out can never pay the same salvage twice.
   *
   * The window and phase gates are extraction's own, and the offer's refusal is honest —
   * a purse too thin to halve into a whole credit banks nothing and stamps nothing.
   */
  _onPartialBankRequested() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    if (run.phase !== 'cleanup' && run.phase !== 'refit') return;
    if (!isExtractionWindow(run.wave)) return;
    const offer = partialBankOffer(run);
    if (!offer) return;
    const before = Number.isFinite(run.credits) ? run.credits : 0;
    this._emit('run:spendRequested', { credits: offer.amount, reason: 'partial_bank' });
    const paid = liveSurvivalRun(this.state);
    if (!paid || paid.credits !== before - offer.amount) return;
    if ((paid.phase !== 'cleanup' && paid.phase !== 'refit') || !isExtractionWindow(paid.wave)) {
      // The window closed between the ask and the spend landing — hand the salvage back
      // rather than stamp a bank the run was no longer selling. Same repair the Circuit's
      // salvage uses when the card leaves the table mid-payment.
      this._emit('run:awardRequested', { credits: offer.amount, reason: 'partial_bank_refund' });
      return;
    }
    if (!paid.telemetry || typeof paid.telemetry !== 'object') paid.telemetry = {};
    const secured = (Number.isFinite(paid.telemetry.securedBounty)
      ? Math.trunc(paid.telemetry.securedBounty) : 0) + offer.amount;
    paid.telemetry.securedBounty = secured;
    this._emit('run:partialBanked', {
      credits: offer.amount,
      secured,
      remaining: paid.credits,
      wave: Number.isInteger(paid.wave) ? paid.wave : 0,
      tick: this._runTick,
    });
  },

  _onPlayerDeath() {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._lastDeath = {
      tick: Number.isFinite(this.state.tick) ? this.state.tick | 0 : 0,
      simTime: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
    };
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
