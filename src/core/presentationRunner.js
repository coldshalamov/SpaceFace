// Presentation owner: requestAnimationFrame, interpolation, Browser/Electron lifecycle, and restore.
// Each rAF advances simulation by the time that passed, then presents that newest moment. The
// order never changes while the game runs: a loop that simulates first on some frames and draws
// first on others shows the world at a moment it has already shown, then leaps.
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';
import { createRuntimeWitness, collectRuntimeWitnessSample } from './runtimeWitness.js';
import {
  HITCH_CATCHUP_STEPS,
  LOOP_FIXED_DT,
  frameSimStepCap,
} from './simulationRunner.js';
import { mustRescheduleAfterFrame } from './frameLiveness.js';
import { collectJournalPresentationEntities, collectJournalPresentationEntitiesChunked } from '../world/presentationSources.js';
import { resolveFrameCap, stepFrameCapDebtInto } from '../render/adaptiveQuality.js';
import { shouldSkipFullTickSystems } from './presentationFreeze.js';
import { PRESENTATION_LISTENER_DRAIN_BUDGET, SECTOR_ENTER_DRAIN_BUDGET, SECTOR_ENTER_LISTENER_BUDGET } from './eventBus.js';
import { syncFocusLossHold } from './focusLossHold.js';
import { createTimeEffects } from './timeEffects.js';

// Consecutive failing frames before the loop calls the picture dead. 30 is half a second at 60 Hz:
// long enough that a single hitch, a context blip or one bad entity cannot trip it, short enough
// that a player who is looking at a frozen world has not been looking at it for long.
const PRESENTATION_STALL_FRAMES = 30;

const _stepCapArgs = { frameDt: 0, fixedDt: LOOP_FIXED_DT, maxSteps: 0 };
const _frameCapArgs = { cap: 0, vsync: true, displayHz: 60 };
const _capStepArgs = { cap: 0, displayHz: 60, debt: 0 };
const _capStepScratch = { present: true, debt: 0 };
const _drainCompileArg = { leftoverMs: 0, late: false };
export const LOOP_LIFECYCLE_STATES = Object.freeze({
  FOREGROUND_VISIBLE: 'foreground-visible',
  FOREGROUND_OCCLUDED: 'foreground-occluded',
  HIDDEN_OR_MINIMIZED: 'hidden-or-minimized',
  SYSTEM_SUSPENDED: 'system-suspended',
  RESTORING: 'restoring',
});

function isPresentingState(state) {
  return state === LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE
    || state === LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
    || state === LOOP_LIFECYCLE_STATES.RESTORING;
}

function isShellState(state) {
  return state === LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE
    || state === LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
    || state === LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED
    || state === LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED;
}

function createCompletedTickRecord() {
  return {
    sequence: 0,
    tick: 0,
    simTime: 0,
    stateDigestMarker: 0,
    inputSequence: 0,
    inputCommandSeq: 0,
    inputWallMs: 0,
    lifecycleGeneration: 0,
    journalStart: 0,
    journalEnd: 0,
  };
}

function teardownMessage(error) {
  if (error instanceof Error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * Build the one-shot runtime shutdown transaction used by main.js. Each phase is attempted once in
 * strict ownership order, and failures are returned as scalar receipts so navigation teardown never
 * has to retain or rethrow foreign Error objects.
 */
export function createPresentationRuntimeCloser({
  stopPresentation = null,
  detachProducers = null,
  closeSimulation = null,
  closeJournal = null,
} = {}) {
  let finalReceipt = null;
  let activeReceipt = null;
  let closing = false;
  let stopAttempted = false;
  let detachAttempted = false;
  let presentationStopped = false;
  let producersDetached = false;
  let simulationClosed = false;
  let journalClosed = false;
  const permanentErrors = [];

  return function closePresentationRuntime() {
    if (finalReceipt) return finalReceipt;
    if (closing) return activeReceipt;

    const result = {
      closed: false,
      presentationStopped,
      producersDetached,
      simulationClosed,
      journalClosed,
      errorCount: 0,
      errors: [...permanentErrors],
    };

    // Publish the in-flight receipt before invoking callbacks so a reentrant close observes the
    // same transaction. Only a fully closed receipt is cached permanently; bounded transport
    // phases may need a later retry after an in-flight lease settles.
    activeReceipt = result;
    closing = true;

    function attempt(stage, callback, onSuccess, { persistent = false } = {}) {
      try {
        if (typeof callback === 'function') callback();
        onSuccess();
      } catch (error) {
        const receiptError = Object.freeze({ stage, message: teardownMessage(error) });
        result.errors.push(receiptError);
        if (persistent) permanentErrors.push(receiptError);
      }
    }

    if (!stopAttempted) {
      stopAttempted = true;
      attempt('stopPresentation', stopPresentation, () => {
        presentationStopped = true;
      }, { persistent: true });
    }
    if (!detachAttempted) {
      detachAttempted = true;
      attempt('detachProducers', detachProducers, () => {
        producersDetached = true;
      }, { persistent: true });
    }
    if (!simulationClosed) {
      attempt('closeSimulation', closeSimulation, () => {
        simulationClosed = true;
      });
    }
    if (simulationClosed && !journalClosed) {
      attempt('closeJournal', closeJournal, () => {
        journalClosed = true;
      });
    }

    result.presentationStopped = presentationStopped;
    result.producersDetached = producersDetached;
    result.simulationClosed = simulationClosed;
    result.journalClosed = journalClosed;
    result.errorCount = result.errors.length;
    result.closed = simulationClosed && journalClosed;
    Object.freeze(result.errors);
    Object.freeze(result);
    closing = false;
    if (result.closed) finalReceipt = result;
    return result;
  };
}

/**
 * Start presentation scheduling around one explicit SimulationRunner.
 * Dependencies are injectable so lifecycle policy can be verified without real timers or DOM work.
 */
export function createPresentationRunner(state, registry, simulationRunner, deps = {}) {
  if (!simulationRunner || typeof simulationRunner.advance !== 'function') {
    throw new TypeError('PresentationRunner requires a SimulationRunner');
  }
  const requestFrame = deps.requestFrame
    || globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = deps.cancelFrame
    || globalThis.cancelAnimationFrame?.bind(globalThis);
  const visibilityTarget = Object.prototype.hasOwnProperty.call(deps, 'visibilityTarget')
    ? deps.visibilityTarget
    : globalThis.document;
  const focusTarget = Object.prototype.hasOwnProperty.call(deps, 'focusTarget')
    ? deps.focusTarget
    : (typeof globalThis.window !== 'undefined' ? globalThis.window : null);
  const lifecyclePort = Object.prototype.hasOwnProperty.call(deps, 'lifecyclePort')
    ? deps.lifecyclePort
    : globalThis.window?.spacefaceLifecycle;
  const inputResumeTarget = Object.prototype.hasOwnProperty.call(deps, 'inputResumeTarget')
    ? deps.inputResumeTarget
    : globalThis.window;
  const nowMs = deps.nowMs
    || (() => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()));
  const onSimulationFailure = typeof deps.onSimulationFailure === 'function'
    ? deps.onSimulationFailure
    : null;
  const measureNow = deps.perfNow || perfNow;
  const presentationJournal = deps.presentationJournal
    || registry?.ctx?.presentationJournal
    || null;
  const bus = registry?.ctx?.bus || null;
  if (bus && typeof bus.setEmitSliceBudget === 'function') {
    bus.setEmitSliceBudget('sector:enter', SECTOR_ENTER_LISTENER_BUDGET);
  }
  // The frame pump owns the presentation-tier listener drain — burst-event presentation
  // tails (kill/despawn vfx, toasts, mesh unbinds) slice across frames instead of running
  // inside the emit that fired them.
  if (bus && typeof bus.claimPresentationDrain === 'function') {
    bus.claimPresentationDrain();
  }
  if (state && state.world) state.world.sliceArrival = true;

  if (typeof requestFrame !== 'function') {
    throw new Error('PresentationRunner requires requestAnimationFrame');
  }

  let shellState = LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  let shellSequence = -1;
  let documentHidden = visibilityTarget?.visibilityState === 'hidden';

  function requestedState() {
    if (shellState === LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED) {
      return LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED;
    }
    // Electron publishes real window state. Chromium `document.hidden` can stick true on Windows
    // while that window is still on screen (occlusion, show:false→show, alt-tab return). Trusting
    // the stuck flag used to cancel rAF forever: 3D and movement died, HTML HUD/pause stayed live.
    if (shellSequence > 0) {
      if (shellState === LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED) {
        return LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED;
      }
      return shellState === LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
        ? LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
        : LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
    }
    if (documentHidden || shellState === LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED) {
      return LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED;
    }
    return shellState === LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
      ? LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
      : LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  }

  let destroyed = false;
  let transportClosed = false;
  let frameHandle = null;
  let last = nowMs();
  let lifecycleState = requestedState();
  let restoreTarget = LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  let suspended = !isPresentingState(lifecycleState);
  // Sliced emits exist to bound work inside a presented frame — while nothing is
  // presenting (boot, loading, hidden) that bound only delays listener work past
  // its window. Suspension makes emits deliver inline and flushes any parked
  // tail at the transition; the first call covers a runner minted mid-suspension.
  const syncEmitSliceSuspension = () => {
    if (bus && typeof bus.setEmitSliceSuspended === 'function') {
      bus.setEmitSliceSuspended(suspended);
    }
  };
  syncEmitSliceSuspension();
  let unsubscribeLifecycle = null;
  let lifecycleGeneration = 0;
  let hasCompletedTick = false;
  // P7 input-to-photon: highest input-command sequence a presented frame has reflected so far.
  let lastPhotonInputSeq = 0;
  let hasPendingJournal = false;
  let pendingJournalStart = 0;
  let pendingJournalEnd = 0;
  let pendingJournalFullRebuild = false;
  let pendingJournalRebuildGeneration = 0;
  let postRestoreFramePending = false;
  let lastPresentedMoment = NaN;
  let acknowledgedJournalSequence = presentationJournal
    && presentationJournal.getPendingCount?.() > 0
    && presentationJournal.getOldestSequence?.() > 0
    ? presentationJournal.getOldestSequence() - 1
    : (presentationJournal?.getWriteSequence?.() || 0);

  const latestCompletedTick = createCompletedTickRecord();
  const presentationFrame = {
    sequence: 0,
    frameDt: 0,
    alpha: 0,
    lifecycleState,
    lifecycleGeneration,
    completedTickCount: 0,
    completedTick: null,
    journal: presentationJournal,
    journalStart: 0,
    journalEnd: 0,
    journalRecordCount: 0,
    journalFullRebuild: false,
    journalRebuildGeneration: 0,
    journalValid: presentationJournal !== null,
  };
  const diagnostics = {
    lifecycleState,
    requestedLifecycleState: lifecycleState,
    restoreTarget: null,
    suspended,
    visibilityState: visibilityTarget?.visibilityState || 'unavailable',
    shellState,
    shellSequence,
    lifecycleGeneration,
    lastLifecycleReason: 'startup',
    requestedFrames: 0,
    executedFrames: 0,
    renderUpdates: 0,
    completedTicksConsumed: 0,
    skippedPresentationTicks: 0,
    suspendCount: 0,
    resumeCount: 0,
    lifecycleTransitionCount: 0,
    staleShellCommandCount: 0,
    duplicateShellCommandCount: 0,
    invalidShellCommandCount: 0,
    timestampResetCount: 0,
    restoreFrameCount: 0,
    postRestoreFrameCount: 0,
    postRestoreShedBacklogCount: 0,
    postRestoreMaxStepsObserved: 0,
    lastPostRestoreFrameDt: 0,
    stepsThisFrame: 0,
    maxStepsObserved: 0,
    shedBacklogFrames: 0,
    // Callbacks that arrived as a hitch and resumed the world two ticks on instead of replaying it.
    hitchCappedFrameCount: 0,
    // Presents that showed the same simulated moment as the present before them while time was
    // passing. The pilot reads each one as the ship losing its place; the count must stay zero.
    duplicateMomentPresents: 0,
    presentFirst: 'restore-only',
    lastPresentMs: 0,
    frameCapSkips: 0,
    frameCapDebt: 0,
    lastLeftoverMs: 0,
    lastLeftoverStepCap: 0,
    journalAvailable: presentationJournal !== null,
    journalRangeMergeCount: 0,
    journalRangeErrorCount: 0,
    journalAcknowledgementCount: 0,
    journalRecordsAcknowledged: 0,
    journalRetainedFrameCount: 0,
    journalRebuildAttemptCount: 0,
    journalRebuildCount: 0,
    journalRebuildFailureCount: 0,
    acknowledgedJournalSequence,
    destroyed: false,
    transportClosed: false,
    stopCount: 0,
    transportCloseAttemptCount: 0,
    transportCloseCount: 0,
    teardownErrorCount: 0,
    lastTeardownErrorStage: null,
    lastTeardownErrorMessage: null,
    lastFrameError: null,
    frameErrorCount: 0,
    simulationFailureNotified: false,
    simulationFailure: null,
    // frameErrorCount is cumulative history: it answers "did this session ever throw".
    // consecutiveFrameErrors is state: it answers "is the canvas dead right now". Those are
    // different questions and one counter cannot carry both, which is why a renderer that threw
    // on every frame for ten minutes used to be indistinguishable from one that hiccupped once.
    consecutiveFrameErrors: 0,
    presentationStalled: false,
    presentationStallCount: 0,
  };

  const readWitnessSample = (into) => collectRuntimeWitnessSample(state, {
    diagnostics,
    lifecycleState,
    suspended,
    into,
  }, nowMs());
  const witness = createRuntimeWitness({ nowMs, readSample: readWitnessSample });
  state.runtimeWitness = witness;
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.__SF_WITNESS__ = witness;
  }
  function captureWitness() {
    try {
      witness.observe(state, {
        diagnostics,
        lifecycleState,
        suspended,
        wallMs: nowMs(),
      });
    } catch (_) { /* witness must never abort the loop */ }
  }

  simulationRunner.setLifecycleGeneration?.(lifecycleGeneration);

  function schedule() {
    if (destroyed || suspended || frameHandle !== null) return;
    frameHandle = requestFrame(frame);
    diagnostics.requestedFrames++;
  }

  function cancelScheduledFrame() {
    if (frameHandle === null) return;
    if (typeof cancelFrame === 'function') cancelFrame(frameHandle);
    frameHandle = null;
  }

  function recordTeardownError(stage, error, errors) {
    diagnostics.teardownErrorCount++;
    diagnostics.lastTeardownErrorStage = stage;
    diagnostics.lastTeardownErrorMessage = teardownMessage(error);
    errors.push(error);
  }

  function stop() {
    if (destroyed) return false;
    destroyed = true;
    diagnostics.destroyed = true;
    diagnostics.stopCount++;
    witness.stop();
    const errors = [];

    const handle = frameHandle;
    frameHandle = null;
    if (handle !== null && typeof cancelFrame === 'function') {
      try {
        cancelFrame(handle);
      } catch (error) {
        recordTeardownError('cancelFrame', error, errors);
      }
    }
    if (visibilityTarget && typeof visibilityTarget.removeEventListener === 'function') {
      try {
        visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
      } catch (error) {
        recordTeardownError('removeVisibilityListener', error, errors);
      }
    }
    if (focusTarget && typeof focusTarget.removeEventListener === 'function') {
      try {
        focusTarget.removeEventListener('blur', onWindowBlur);
        focusTarget.removeEventListener('focus', onWindowFocus);
      } catch (error) {
        recordTeardownError('removeFocusListener', error, errors);
      }
    }
    if (inputResumeTarget && typeof inputResumeTarget.removeEventListener === 'function') {
      try {
        inputResumeTarget.removeEventListener('pointerdown', onInputResume, true);
        inputResumeTarget.removeEventListener('keydown', onInputResume, true);
      } catch (error) {
        recordTeardownError('removeInputResumeListener', error, errors);
      }
    }
    const unsubscribe = unsubscribeLifecycle;
    unsubscribeLifecycle = null;
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        recordTeardownError('unsubscribeLifecycle', error, errors);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'PresentationRunner stop failed');
    }
    return true;
  }

  function close() {
    if (transportClosed) return false;
    diagnostics.transportCloseAttemptCount++;
    const errors = [];
    try {
      stop();
    } catch (error) {
      errors.push(error);
    }
    let simulationClosed = false;
    try {
      simulationRunner.close?.();
      simulationClosed = true;
    } catch (error) {
      recordTeardownError('closeSimulation', error, errors);
    }
    if (simulationClosed) {
      transportClosed = true;
      diagnostics.transportClosed = true;
      diagnostics.transportCloseCount++;
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'PresentationRunner close failed');
    }
    return true;
  }

  function recordState(next, reason) {
    if (next !== lifecycleState) diagnostics.lifecycleTransitionCount++;
    lifecycleState = next;
    diagnostics.lifecycleState = next;
    diagnostics.lastLifecycleReason = reason;
  }

  function releaseHeldControls(reason) {
    const inputOwner = typeof registry.get === 'function' ? registry.get('input') : null;
    if (!inputOwner || typeof inputOwner.releaseHeldControls !== 'function') return;
    try {
      inputOwner.releaseHeldControls(reason);
    } catch (error) {
      console.error('[loop] failed to release held controls:', error);
    }
  }

  function setAudioLifecycle(method, reason) {
    const audioOwner = typeof registry.get === 'function' ? registry.get('audio') : null;
    if (!audioOwner || typeof audioOwner[method] !== 'function') return;
    try {
      audioOwner[method](reason);
    } catch (error) {
      console.error(`[loop] failed to ${method} audio:`, error);
    }
  }

  function enterNonPresenting(next, reason) {
    const wasSuspended = suspended;
    suspended = true;
    syncEmitSliceSuspension();
    diagnostics.suspended = true;
    diagnostics.restoreTarget = null;
    diagnostics.stepsThisFrame = 0;
    postRestoreFramePending = false;
    recordState(next, reason);
    cancelScheduledFrame();
    if (!wasSuspended) {
      diagnostics.suspendCount++;
      releaseHeldControls(reason);
      setAudioLifecycle('suspendForLifecycle', reason);
    }
  }

  function normalizeAccumulator() {
    const accumulator = Number(state.accumulator);
    const fixedDt = Number.isFinite(simulationRunner.fixedDt) && simulationRunner.fixedDt > 0
      ? simulationRunner.fixedDt
      : LOOP_FIXED_DT;
    state.accumulator = Number.isFinite(accumulator)
      ? Math.max(0, Math.min(accumulator, fixedDt - Number.EPSILON))
      : 0;
  }

  function enterRestoring(target, reason) {
    restoreTarget = target;
    diagnostics.restoreTarget = target;
    if (lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING) {
      diagnostics.lastLifecycleReason = reason;
      schedule();
      return;
    }

    const wasSuspended = suspended;
    suspended = false;
    syncEmitSliceSuspension();
    diagnostics.suspended = false;
    recordState(LOOP_LIFECYCLE_STATES.RESTORING, reason);
    if (wasSuspended) diagnostics.resumeCount++;
    lifecycleGeneration++;
    diagnostics.lifecycleGeneration = lifecycleGeneration;
    simulationRunner.setLifecycleGeneration?.(lifecycleGeneration);
    normalizeAccumulator();
    last = nowMs();
    diagnostics.timestampResetCount++;
    diagnostics.stepsThisFrame = 0;
    schedule();
  }

  function synchronizeLifecycle(reason) {
    const next = requestedState();
    diagnostics.requestedLifecycleState = next;
    if (!isPresentingState(next)) {
      if (suspended && lifecycleState === next) {
        diagnostics.lastLifecycleReason = reason;
        return;
      }
      enterNonPresenting(next, reason);
      return;
    }

    if (suspended || lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING) {
      enterRestoring(next, reason);
      return;
    }

    diagnostics.restoreTarget = null;
    recordState(next, reason);
    schedule();
  }

  function onVisibilityChange() {
    if (destroyed) return;
    diagnostics.visibilityState = visibilityTarget?.visibilityState || 'unavailable';
    documentHidden = diagnostics.visibilityState === 'hidden';
    synchronizeLifecycle('document-visibility');
  }

  function onWindowBlur() {
    if (destroyed) return;
    try { syncFocusLossHold(state, true); } catch (_) { /* the clock owner reports its own errors */ }
  }

  function onWindowFocus() {
    if (destroyed) return;
    try { syncFocusLossHold(state, false); } catch (_) { /* resume is idempotent */ }
  }

  function onInputResume() {
    if (destroyed || !suspended) return;
    if (shellState === LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED) return;
    documentHidden = false;
    diagnostics.visibilityState = 'visible';
    synchronizeLifecycle('input-resume');
  }

  function onShellLifecycle(command) {
    if (destroyed) return;
    if (!command || !isShellState(command.state)
      || !Number.isSafeInteger(command.sequence) || command.sequence <= 0) {
      diagnostics.invalidShellCommandCount++;
      return;
    }
    if (command.sequence < shellSequence) {
      diagnostics.staleShellCommandCount++;
      return;
    }
    if (command.sequence === shellSequence) {
      diagnostics.duplicateShellCommandCount++;
      return;
    }

    shellSequence = command.sequence;
    shellState = command.state;
    diagnostics.shellSequence = shellSequence;
    diagnostics.shellState = shellState;
    synchronizeLifecycle(typeof command.reason === 'string' && command.reason
      ? command.reason
      : 'shell');
  }

  function notifySimulationFailure() {
    if (diagnostics.simulationFailureNotified) return;
    const simDiagnostics = simulationRunner.getDiagnostics?.() || null;
    if (!simDiagnostics || simDiagnostics.closed !== true) return;
    const message = typeof simDiagnostics.closeCauseMessage === 'string'
      && simDiagnostics.closeCauseMessage.length > 0
      ? simDiagnostics.closeCauseMessage
      : null;
    if (!message) return;
    diagnostics.simulationFailureNotified = true;
    const failure = Object.freeze({
      message,
      site: typeof simDiagnostics.closeCauseSite === 'string' && simDiagnostics.closeCauseSite
        ? simDiagnostics.closeCauseSite
        : null,
      tick: state.tick,
      simTime: state.simTime,
    });
    diagnostics.simulationFailure = failure;
    try {
      stop();
    } catch (error) {
      console.error('[loop] presentation stop after simulation failure:', error);
    }
    if (onSimulationFailure) {
      try {
        onSimulationFailure(failure);
      } catch (error) {
        console.error('[loop] onSimulationFailure callback failed:', error);
      }
    }
  }

  function requestJournalRebuild(reason) {
    if (!presentationJournal || typeof presentationJournal.requestRebuild !== 'function') return;
    try { presentationJournal.requestRebuild(reason); } catch (_) { /* derived channel only */ }
  }

  function resetPendingJournal() {
    hasPendingJournal = false;
    pendingJournalStart = acknowledgedJournalSequence;
    pendingJournalEnd = acknowledgedJournalSequence;
    pendingJournalFullRebuild = false;
    pendingJournalRebuildGeneration = 0;
  }

  function mergeJournalRange(start, end) {
    if (!presentationJournal || start === end) return true;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start
      || (typeof presentationJournal.hasRange === 'function'
        && !presentationJournal.hasRange(start, end))) {
      diagnostics.journalRangeErrorCount++;
      requestJournalRebuild('presentation-range-invalid');
      return false;
    }
    if (hasPendingJournal && start > pendingJournalEnd) {
      diagnostics.journalRangeErrorCount++;
      requestJournalRebuild('presentation-range-gap');
      return false;
    }
    if (!hasPendingJournal) {
      pendingJournalStart = start;
      pendingJournalEnd = end;
      hasPendingJournal = true;
    } else {
      pendingJournalStart = Math.min(pendingJournalStart, start);
      pendingJournalEnd = Math.max(pendingJournalEnd, end);
    }
    diagnostics.journalRangeMergeCount++;
    return true;
  }

  // A journal rebuild used to collect + republish every journal row inside one
  // presented frame. Both legs advance bounded work per call: the collect walks the
  // chunked twin on a wall-clock deadline (per-row steps are ~sub-µs, so a fixed row
  // cap would drag the O(entities) consume() fallback across many presents), and
  // rebuildFromSteps publishes rows against the same per-present budget. needsRebuild
  // stays set across the suspension, so the commit below only lands when the stepped
  // generator actually finishes — a mid-suspension journal write invalidates the
  // attempt and the next call re-collects. Consecutive invalidated attempts escalate
  // to one synchronous drain, which no foreign write can interleave mid-flight.
  const JOURNAL_REBUILD_COLLECT_MS = 4;
  const JOURNAL_REBUILD_INVALIDATED_MAX = 3;
  let steppedJournalRebuild = null;
  let journalRebuildInvalidations = 0;

  function commitJournalRebuild() {
    const start = presentationJournal.getLastRebuildStart?.() || 0;
    const end = presentationJournal.getLastRebuildEnd?.() || start;
    simulationRunner.alignJournalCursor?.(end);
    pendingJournalStart = start;
    pendingJournalEnd = end;
    pendingJournalFullRebuild = true;
    pendingJournalRebuildGeneration = presentationJournal.getRebuildGeneration?.() || 0;
    hasPendingJournal = true;
    diagnostics.journalRebuildCount++;
    journalRebuildInvalidations = 0;
    return true;
  }

  function syncJournalRebuildEscalation(tick) {
    const rebuildTick = Number.isSafeInteger(tick) && tick >= 0
      ? tick
      : (Number.isSafeInteger(state.tick) && state.tick >= 0 ? state.tick : 0);
    const entities = collectJournalPresentationEntities(state);
    if (typeof presentationJournal.rebuildFrom !== 'function'
        || presentationJournal.rebuildFrom(entities, rebuildTick) !== true) {
      diagnostics.journalRebuildFailureCount++;
      return false;
    }
    return commitJournalRebuild();
  }

  function rebuildJournalIfNeeded() {
    if (!presentationJournal || typeof presentationJournal.needsRebuild !== 'function') return false;
    if (!steppedJournalRebuild && !presentationJournal.needsRebuild()) return false;
    try {
      if (!steppedJournalRebuild) {
        diagnostics.journalRebuildAttemptCount++;
        presentationJournal.clearSuppressedDestroyIds?.();
        const collectOut = [];
        steppedJournalRebuild = {
          collectIter: collectJournalPresentationEntitiesChunked(state, collectOut),
          collectOut,
          tick: Number.isSafeInteger(state.tick) && state.tick >= 0 ? state.tick : 0,
          publishIter: null,
        };
      }
      const job = steppedJournalRebuild;
      if (!job.publishIter) {
        const collectDeadline = nowMs() + JOURNAL_REBUILD_COLLECT_MS;
        let step = job.collectIter.next();
        while (!step.done && nowMs() < collectDeadline) step = job.collectIter.next();
        if (!step.done) return false;
        // Collect-phase writes are suppressed without flagging the attempt — most
        // classes self-heal (the publish re-reads live pose for members; a write for
        // a non-member trips *-without-spawn after commit), but a suppressed destroy
        // naming a collected id would commit a zombie spawn that never re-writes.
        // Doom on exactly that class instead of any suppression, or every busy
        // collect falls through to the atomic escalation the stepped twin replaced.
        const suppressedDestroys = presentationJournal.getSuppressedDestroyIds?.();
        if (suppressedDestroys && suppressedDestroys.size > 0) {
          const entities = step.value || [];
          const collectedIds = new Set();
          for (const entity of entities) {
            if (entity && Number.isSafeInteger(entity.id)) collectedIds.add(entity.id);
          }
          let doomed = false;
          for (const entityId of suppressedDestroys) {
            if (collectedIds.has(entityId)) { doomed = true; break; }
          }
          if (doomed) {
            const tick = job.tick;
            steppedJournalRebuild = null;
            if (++journalRebuildInvalidations >= JOURNAL_REBUILD_INVALIDATED_MAX) {
              return syncJournalRebuildEscalation(tick);
            }
            return false;
          }
        }
        presentationJournal.clearSuppressedDestroyIds?.();
        const entities = step.value || [];
        if (typeof presentationJournal.rebuildFromSteps !== 'function') {
          if (presentationJournal.rebuildFrom(entities, job.tick) !== true) {
            steppedJournalRebuild = null;
            diagnostics.journalRebuildFailureCount++;
            return false;
          }
        } else {
          // The completed collect doubles as the consume() fallback's world sample
          // while the publish leg is still in flight — populateJournalFrame hands
          // it to the publisher so a tick-consuming present doesn't re-pay the
          // whole-set sync collect against the same GameState.
          job.entities = entities;
          job.publishIter = presentationJournal.rebuildFromSteps(entities, job.tick);
        }
      }
      if (job.publishIter) {
        // publishSpawn is a cheap ring append — debit the same wall-clock window the
        // collect leg uses so most rebuilds commit inside a single present.
        const publishDeadline = nowMs() + JOURNAL_REBUILD_COLLECT_MS;
        let step = job.publishIter.next();
        while (!step.done && nowMs() < publishDeadline) step = job.publishIter.next();
        if (!step.done) return false;
        const result = step.value;
        const tick = job.tick;
        steppedJournalRebuild = null;
        if (result !== true) {
          // 'invalidated' already re-requested the rebuild — needsRebuild still set, so the
          // next present starts a fresh collect. Anything else is a genuine failure the
          // journal also reported via its own requestRebuild.
          if (result === 'invalidated') {
            if (++journalRebuildInvalidations >= JOURNAL_REBUILD_INVALIDATED_MAX) {
              return syncJournalRebuildEscalation(tick);
            }
          } else {
            diagnostics.journalRebuildFailureCount++;
          }
          return false;
        }
      }
      steppedJournalRebuild = null;
      return commitJournalRebuild();
    } catch (_) {
      steppedJournalRebuild = null;
      diagnostics.journalRebuildFailureCount++;
      requestJournalRebuild('presentation-rebuild-error');
      return false;
    }
  }

  function populateJournalFrame() {
    const valid = presentationJournal !== null
      && !(presentationJournal.needsRebuild?.() === true);
    presentationFrame.journalStart = hasPendingJournal
      ? pendingJournalStart
      : acknowledgedJournalSequence;
    presentationFrame.journalEnd = hasPendingJournal
      ? pendingJournalEnd
      : acknowledgedJournalSequence;
    presentationFrame.journalRecordCount = hasPendingJournal
      ? Math.max(0, pendingJournalEnd - pendingJournalStart)
      : 0;
    presentationFrame.journalFullRebuild = pendingJournalFullRebuild;
    presentationFrame.journalRebuildGeneration = pendingJournalRebuildGeneration;
    presentationFrame.journalValid = valid;
    // While a stepped rebuild is mid-publish its completed collect is the
    // canonical live-GameState sample — the publisher's fallback mirrors it
    // instead of re-collecting the whole set inside the presented frame.
    presentationFrame.rebuildCollectedEntities = steppedJournalRebuild
        && steppedJournalRebuild.publishIter
        && Array.isArray(steppedJournalRebuild.entities)
      ? steppedJournalRebuild.entities : null;
    // While the collect leg is still pacing, its accumulating prefix is a
    // strictly-fresher live sample than the fallback's whole-set sync collect.
    // The publisher applies it with retire suppressed — the retire sweep is
    // what makes a partial sample dangerous, and the flag kills it.
    presentationFrame.rebuildCollectPrefix = steppedJournalRebuild
        && !steppedJournalRebuild.publishIter
        && Array.isArray(steppedJournalRebuild.collectOut)
      ? steppedJournalRebuild.collectOut : null;
  }

  function acknowledgePresentedJournal() {
    if (!hasPendingJournal || !presentationJournal
      || presentationJournal.needsRebuild?.() === true) return;
    const recordCount = Math.max(0, pendingJournalEnd - pendingJournalStart);
    presentationJournal.discardThrough?.(pendingJournalEnd);
    acknowledgedJournalSequence = pendingJournalEnd;
    diagnostics.acknowledgedJournalSequence = acknowledgedJournalSequence;
    diagnostics.journalAcknowledgementCount++;
    diagnostics.journalRecordsAcknowledged += recordCount;
    resetPendingJournal();
  }

  function presentLastCompletedSnapshot(frameDt, restoring, perf, fixedDt) {
    const completedTickCount = simulationRunner.consumeLatestCompletedTick(latestCompletedTick);
    if (completedTickCount > 0) hasCompletedTick = true;
    diagnostics.completedTicksConsumed += completedTickCount;
    if (completedTickCount > 1) diagnostics.skippedPresentationTicks += completedTickCount - 1;

    const rebuiltJournal = rebuildJournalIfNeeded();
    if (!rebuiltJournal && presentationJournal?.needsRebuild?.() !== true
      && completedTickCount > 0) {
      mergeJournalRange(latestCompletedTick.journalStart, latestCompletedTick.journalEnd);
    }

    const alpha = simulationRunner.interpolationAlpha();
    // The drawn moment is simTime + accumulator − fixedDt. While the clock runs and time passed,
    // two presents in a row at one moment is a frozen world under a moving camera.
    const presentedMoment = (Number(state.simTime) || 0) + (Number(state.accumulator) || 0);
    if (!restoring && frameDt > 0 && Number(state.timeScale) > 0
      && presentedMoment === lastPresentedMoment) {
      diagnostics.duplicateMomentPresents++;
    }
    lastPresentedMoment = presentedMoment;
    presentationFrame.sequence++;
    presentationFrame.frameDt = frameDt;
    if (state && state.render) state.render.lastPresentDtMs = frameDt * 1000;
    presentationFrame.alpha = alpha;
    presentationFrame.lifecycleState = lifecycleState;
    presentationFrame.lifecycleGeneration = lifecycleGeneration;
    presentationFrame.completedTickCount = completedTickCount;
    presentationFrame.completedTick = hasCompletedTick ? latestCompletedTick : null;
    populateJournalFrame();
    const presentationStart = measureNow();
    let presentationAccepted = false;
    let presentationMs = 0;
    try {
      presentationAccepted = registry.renderUpdate(alpha, frameDt, presentationFrame) !== false;
    } finally {
      presentationMs = measureNow() - presentationStart;
      diagnostics.lastPresentMs = presentationMs;
      perf.recordPresentationFrame?.(presentationMs);
    }
    if (presentationAccepted && typeof deps.onPresented === 'function') {
      try { deps.onPresented(); } catch { /* the paint-freshness hook is best-effort */ }
    }
    // P7: the first presented frame whose completed tick consumed a newer input command is that
    // command's photon. The stamp arrived wall-timed at the input boundary; the subtraction is
    // measurement only and never enters sim state.
    if (presentationAccepted && completedTickCount > 0
      && latestCompletedTick.inputCommandSeq > lastPhotonInputSeq
      && latestCompletedTick.inputWallMs > 0) {
      perf.recordInputToPhoton?.(Math.max(0, measureNow() - latestCompletedTick.inputWallMs),
        latestCompletedTick.inputWallMs);
      lastPhotonInputSeq = latestCompletedTick.inputCommandSeq;
    }
    diagnostics.renderUpdates++;
    diagnostics.consecutiveFrameErrors = 0;
    if (diagnostics.presentationStalled) {
      diagnostics.presentationStalled = false;
      console.warn('[loop] presentation recovered after '
        + `${diagnostics.presentationStallFrames || 0} frozen frame(s)`);
      diagnostics.presentationStallFrames = 0;
      frame._errs = 0;
    }
    if (presentationJournal?.isClosed?.() === true) resetPendingJournal();
    else if (presentationAccepted) acknowledgePresentedJournal();
    else if (hasPendingJournal) diagnostics.journalRetainedFrameCount++;
    return presentationMs;
  }

  function advanceSimulation(frameDt, restoring, stepCap, perf) {
    const simFrameStart = measureNow();
    const stepResult = restoring
      ? simulationRunner.prepareWithoutAdvance()
      : simulationRunner.advance(frameDt, state.timeScale, stepCap);
    if (!restoring && stepCap === HITCH_CATCHUP_STEPS) diagnostics.hitchCappedFrameCount++;

    if (!restoring && postRestoreFramePending) {
      diagnostics.postRestoreFrameCount++;
      diagnostics.lastPostRestoreFrameDt = frameDt;
      diagnostics.postRestoreMaxStepsObserved = Math.max(
        diagnostics.postRestoreMaxStepsObserved,
        stepResult.steps,
      );
      if (stepResult.shedBacklog) diagnostics.postRestoreShedBacklogCount++;
      postRestoreFramePending = false;
    }

    diagnostics.stepsThisFrame = stepResult.steps;
    diagnostics.maxStepsObserved = Math.max(diagnostics.maxStepsObserved, stepResult.steps);
    if (stepResult.shedBacklog) diagnostics.shedBacklogFrames++;
    perf.recordSimFrame(measureNow() - simFrameStart);
    perf.recordLoop(stepResult.steps, stepResult.shedBacklog, state.accumulator, stepResult.shedSteps);
    perf.tier1?.recordStepsThisFrame(stepResult.steps);
    return stepResult;
  }

  function frame(now) {
    frameHandle = null;
    if (destroyed || suspended || !isPresentingState(lifecycleState)) return;

    diagnostics.executedFrames++;
    const restoring = lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING;
    const callbackStart = measureNow();
    let perf = null;
    let renderedSnapshot = false;
    let frameDt = restoring ? 0 : (now - last) / 1000;
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
    if (frameDt > 0.25) frameDt = 0.25;
    last = now;

    try {
      perf = ensurePerfRuntime(state);
      // Tier-1 counter frame boundary. Presentation-side by construction: this is the rAF callback,
      // not a sim step, so it cannot perturb sim state, ordering or RNG draw counts, and it adds
      // nothing to PRODUCTION_UPDATE_ORDER or the manifest hash (invariants #2 and #3).
      perf.tier1?.beginFrame();
      // G — one heap sample per frame, at the counter frame boundary. Nondeterministic by
      // construction (GC scheduling is the VM's), so sampleHeap feeds the segregated
      // snapshot().nondeterministic.allocation block and can never enter DETERMINISTIC_FIELDS.
      // performance.memory is Chromium-only: every link in this chain is optional so the absent
      // case is a no-op — a throw here would escape into the rAF loop's catch and be logged
      // every frame (handoff §9 trap 8).
      // The getter is not free in Chromium (it builds a MemoryInfo from V8 heap statistics —
      // ~50–90 µs per frame on the quiet VM profile), and sampleHeap discards the value while
      // Tier-1 counters are off (the production default). Read it only when a capture is live.
      const tier1 = perf.tier1;
      if (tier1 && (typeof tier1.isEnabled !== 'function' || tier1.isEnabled())) {
        tier1.sampleHeap(globalThis.performance?.memory?.usedJSHeapSize);
      }
      const fixedDt = Number.isFinite(simulationRunner.fixedDt)
        ? simulationRunner.fixedDt
        : LOOP_FIXED_DT;
      const frameBudgetMs = fixedDt * 1000;
      perf.beginFrame(
        frameDt,
        callbackStart,
        now,
        frameBudgetMs,
      );

      if (shouldSkipFullTickSystems(state) && !(Number(state.timeScale) > 0)
        && typeof registry.keepalive === 'function') {
        registry.keepalive(0, frameDt);
      }

      // Ordering policy: ONE order. The sim advances by the time that passed, then the picture
      // presents that newest moment, so a keypress reaches the photon in the same callback and
      // the drawn world always moves by exactly the time that elapsed.
      //
      // The order used to flip: simulate-first on a healthy frame, draw-first on any frame over
      // 33.3 ms or after a present over 33.3 ms. A draw-first frame has no new tick and an
      // unchanged accumulator, so it redrew the previous moment while the camera, VFX and HUD
      // all advanced a full frame; the next frame then leapt two frames at once. 33.3 ms is
      // exactly one frame at 30 fps on a 60 Hz display, so below 60 fps the flip was a coin toss
      // per frame: 14 % of presents at 45 fps and 26 % at 30 fps held the hull still and then
      // snapped it ~5 WU at fighting speed. That is the ship "jigging back and forth like it
      // doesn't know its own location". A frozen duplicate is not a picture arriving sooner;
      // it is the full cost of a draw spent on showing nothing new.
      //
      // Only a restore frame presents without advancing: its picture must go out before the
      // clock restarts. A draw throw must not undo the sim that already ran this callback.
      let presentationMs = 0;
      let presentationError = null;
      _stepCapArgs.frameDt = frameDt;
      _stepCapArgs.fixedDt = fixedDt;
      _stepCapArgs.maxSteps = simulationRunner.maxSteps;
      const stepCap = restoring
        ? undefined
        : frameSimStepCap(_stepCapArgs);
      if (!restoring && !destroyed && !suspended) {
        advanceSimulation(frameDt, false, stepCap, perf);
      }
      const skipPresentation = destroyed || suspended
        || (!restoring && lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING);
      // Player frame-cap (Settings → Video). Sim keeps its 60 Hz leftover; only the GPU present
      // is gated. Debt is fractional so 30 fps on 60 Hz and 120 fps on 144 Hz both land on rAF
      // beats instead of trying to present off vsync.
      const video = (state && state.settings && state.settings.video) || {};
      const dtMs = frameDt * 1000;
      if (!restoring && dtMs > 1 && dtMs < 80) {
        const prev = Number(state.render && state.render.displayHzEmaMs) || 16.67;
        const ema = prev * 0.9 + dtMs * 0.1;
        if (!state.render) state.render = {};
        state.render.displayHzEmaMs = ema;
        // Learn the panel's refresh only from a cadence the loop is not itself producing:
        // a saturated machine reports its own throughput — a starved 60 Hz display reading
        // ~31 Hz then clamps a user frameCap (60/45) to the ghost rate. Count a streak of
        // intervals hugging the EMA; any hitch or saturation jitter resets it, so only a
        // genuinely vsync-locked stretch writes displayHz.
        const jitter = Math.abs(dtMs - ema);
        const locked = jitter <= Math.max(0.9, ema * 0.05);
        state.render.displayHzLockedFrames = locked
          ? (state.render.displayHzLockedFrames | 0) + 1
          : 0;
        if (diagnostics.executedFrames > 45 && state.render.displayHzLockedFrames >= 30) {
          const hz = Math.round(1000 / ema);
          if (hz >= 30 && hz <= 360) state.render.displayHz = hz;
        }
      }
      const displayHz = Number(state.render && state.render.displayHz) || 60;
      _frameCapArgs.cap = video.frameCap;
      _frameCapArgs.vsync = video.vsync !== false;
      _frameCapArgs.displayHz = displayHz;
      const effectiveCap = restoring
        ? 0
        : resolveFrameCap(_frameCapArgs);
      if (state && state.render) state.render.frameCap = effectiveCap;
      let capStep = _capStepScratch;
      if (skipPresentation) {
        capStep.present = false;
        capStep.debt = diagnostics.frameCapDebt;
      } else if (diagnostics.executedFrames <= 1) {
        capStep.present = true;
        capStep.debt = 0;
      } else {
        _capStepArgs.cap = effectiveCap;
        _capStepArgs.displayHz = displayHz;
        _capStepArgs.debt = diagnostics.frameCapDebt;
        capStep = stepFrameCapDebtInto(_capStepArgs, _capStepScratch);
      }
      diagnostics.frameCapDebt = capStep.debt;
      const capSkip = !skipPresentation && !capStep.present;
      if (capSkip) diagnostics.frameCapSkips++;
      if (!skipPresentation && !capSkip) {
        try {
          presentationMs = presentLastCompletedSnapshot(frameDt, restoring, perf, fixedDt);
          renderedSnapshot = true;
        } catch (error) {
          presentationError = error;
          presentationMs = diagnostics.lastPresentMs || 0;
        }
      }

      // A restore frame's picture is out; settle its accumulator without advancing the clock.
      if (restoring && !destroyed && !suspended) advanceSimulation(frameDt, true, undefined, perf);
      // Sim and picture are both done. The compile drain is offered what TRULY remains of this
      // callback — the frame budget less everything already spent, sim included — on every frame.
      // Budgeting against the present alone ignored two or three catch-up steps, so a 40 ms swarm
      // frame that had already spent 24 ms was still offered six more for shader admission: the
      // band the owner's iGPU lives in during a fight, and the cost its worst freezes are made of.
      const remainMs = Math.max(0, frameBudgetMs - (measureNow() - callbackStart));
      diagnostics.lastLeftoverMs = remainMs;
      if (!skipPresentation && !capSkip && remainMs >= 2
          && presentationMs < frameBudgetMs && presentationMs <= fixedDt * 2000) {
        const drain = state.render && state.render.drainAfterPresentCompile;
        if (typeof drain === 'function') {
          _drainCompileArg.leftoverMs = remainMs;
          _drainCompileArg.late = false;
          drain(_drainCompileArg);
        }
      }
      const sliceBus = registry?.ctx?.bus;
      if (sliceBus && typeof sliceBus.drainEmitSlice === 'function') {
        // The compile drain already spent from the same window — re-measure so the slice
        // budget is the honest remainder, floored so a burst frame still makes progress.
        const sliceMs = Math.max(0, frameBudgetMs - (measureNow() - callbackStart));
        sliceBus.drainEmitSlice(SECTOR_ENTER_DRAIN_BUDGET, Math.min(4, Math.max(0.5, sliceMs)));
      }
      if (sliceBus && typeof sliceBus.drainPresentationTail === 'function') {
        // Fresh measure again (the emit slice spent too): remainMs=0 must not hand the tail
        // an unbounded window — a scaled backlog would drain unbounded inside the frame that
        // already missed budget. The 0.5 ms floor keeps the queue moving at ~1 listener —
        // but a kill clump or sector teardown enqueues ~10+ tails per entity at 1–4 ms each,
        // so a spent frame at the floor trails real choreography for tens of frames. Scale
        // the floor (not the ceiling) with the backlog, bounded at 2 ms: the queue drains
        // ~4x faster while an overrun never spends more than that bounded fraction extra.
        const tailMs = Math.max(0, frameBudgetMs - (measureNow() - callbackStart));
        const tailPending = typeof sliceBus.pendingPresentationCount === 'function'
          ? sliceBus.pendingPresentationCount() : 0;
        const tailFloorMs = Math.min(2, 0.5 + Math.max(0, tailPending - 32) / 64);
        sliceBus.drainPresentationTail(PRESENTATION_LISTENER_DRAIN_BUDGET, Math.min(4, Math.max(tailFloorMs, tailMs)));
      }
      _stepCapArgs.frameDt = 0;
      _stepCapArgs.fixedDt = LOOP_FIXED_DT;
      diagnostics.lastLeftoverStepCap = stepCap ?? frameSimStepCap(_stepCapArgs);
      if (presentationError) throw presentationError;
    } catch (err) {
      if (hasPendingJournal) diagnostics.journalRetainedFrameCount++;
      // One bad frame must never kill the whole loop; log a bounded number and keep running.
      frame._errs = (frame._errs || 0) + 1;
      diagnostics.frameErrorCount = (diagnostics.frameErrorCount || 0) + 1;
      diagnostics.lastFrameError = err && typeof err.message === 'string' && err.message
        ? err.message.slice(0, 240)
        : String(err).slice(0, 240);
      diagnostics.consecutiveFrameErrors = (diagnostics.consecutiveFrameErrors || 0) + 1;
      diagnostics.presentationStallFrames = diagnostics.consecutiveFrameErrors;
      if (frame._errs <= 20) console.error('[loop] frame error:', err);
      else if (frame._errs === 21) console.error('[loop] further frame errors suppressed');
      // Half a second of consecutive failures at 60 Hz. Below this it is a blip and suppressing the
      // log is right; at or above it the 3D picture is frozen while the HUD keeps animating, and
      // silence is the bug. Report the transition once, loudly, and keep the flag readable so the
      // owner that can actually repair the latch — context restore, presentation scheduling — can
      // see it. Never stop the loop and never skip work to keep the HUD alive: that hides the
      // freeze instead of fixing it.
      if (!diagnostics.presentationStalled
        && diagnostics.consecutiveFrameErrors >= PRESENTATION_STALL_FRAMES) {
        diagnostics.presentationStalled = true;
        diagnostics.presentationStallCount++;
        // D111: a frozen-picture report is only actionable with the frozen moment's evidence
        // attached — the loop diagnostics, the simulation closeCauseSite (null while the sim
        // is merely unschedulable rather than dead), the time-effects request ledger (a
        // 'window-focus-loss' scale-0 hold reads identical to a freeze on a screenshot), and
        // the graphics-context state — so the report discriminates a stopped scheduler, a
        // simulation exception, a native stall and an intentional pause.
        const simDiagnostics = simulationRunner.getDiagnostics?.() || null;
        let timeEffectRequests = null;
        try {
          timeEffectRequests = createTimeEffects(state).describeRequests();
        } catch (_) { timeEffectRequests = null; }
        let glContextLost = null;
        try {
          const gl = state && state.render && state.render.renderer
            && typeof state.render.renderer.getContext === 'function'
            ? state.render.renderer.getContext() : null;
          glContextLost = gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() : null;
        } catch (_) { glContextLost = null; }
        diagnostics.presentationStallEvidence = Object.freeze({
          loop: { ...diagnostics },
          simulation: simDiagnostics,
          closeCauseSite: simDiagnostics && typeof simDiagnostics.closeCauseSite === 'string'
            ? simDiagnostics.closeCauseSite : null,
          timeEffectRequests,
          graphicsContext: {
            glContextLost,
            renderContextLost: state && state.render ? state.render.contextLost === true : null,
            contextRecoveryPending: !!(state && state.render && state.render.contextRecovery
              && state.render.contextRecovery.pending === true),
          },
        });
        console.error('[loop] PRESENTATION STALLED: '
          + `${diagnostics.consecutiveFrameErrors} consecutive frame errors — the 3D canvas is `
          + 'frozen while the loop and HUD keep running. Last error: '
          + `${diagnostics.lastFrameError}`,
          diagnostics.presentationStallEvidence);
      }
      notifySimulationFailure();
    } finally {
      if (perf && typeof perf.recordFrameCallback === 'function') {
        perf.recordFrameCallback(measureNow() - callbackStart);
      }
      // In the same `finally` as recordFrameCallback so a frame that threw still closes its counter
      // frame. Without this an error would fold two frames' counts into one and silently understate
      // the per-frame peak, which is the number the zero-budgets are actually about.
      if (perf) {
        // Renderer diagnostics publish the completed multipass frame after renderUpdate. Sampling
        // here binds draw/triangle and residency facts to this presentation frame; sampling at the
        // opening boundary would silently report the preceding frame instead.
        perf.tier1?.sampleRendererFrame(renderedSnapshot ? state.render?.diagnostics?.info : null);
        perf.tier1?.endFrame();
      }
      captureWitness();
    }

    // renderUpdate may synchronously trigger the full terminal closer. Never complete a restore
    // transition after its audio/listener/transport owners have already been destroyed.
    if (!mustRescheduleAfterFrame({ destroyed })) return;
    if (destroyed) return;
    if (restoring && renderedSnapshot && lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING) {
      diagnostics.restoreFrameCount++;
      diagnostics.restoreTarget = null;
      setAudioLifecycle('resumeFromLifecycle', 'restore-frame-complete');
      recordState(restoreTarget, 'restore-frame-complete');
      // Restore rendering and synchronous owner wake-up are presentation work, not elapsed
      // foreground simulation time. Start the ordinary fixed-step clock after that work commits.
      last = nowMs();
      diagnostics.timestampResetCount++;
      postRestoreFramePending = true;
    }
    schedule();
  }

  if (visibilityTarget && typeof visibilityTarget.addEventListener === 'function') {
    visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (focusTarget && typeof focusTarget.addEventListener === 'function') {
    focusTarget.addEventListener('blur', onWindowBlur);
    focusTarget.addEventListener('focus', onWindowFocus);
  }
  if (inputResumeTarget && typeof inputResumeTarget.addEventListener === 'function') {
    inputResumeTarget.addEventListener('pointerdown', onInputResume, true);
    inputResumeTarget.addEventListener('keydown', onInputResume, true);
  }
  if (lifecyclePort && typeof lifecyclePort.subscribe === 'function') {
    const unsubscribe = lifecyclePort.subscribe(onShellLifecycle);
    if (typeof unsubscribe === 'function') unsubscribeLifecycle = unsubscribe;
  }
  if (suspended && diagnostics.suspendCount === 0) {
    setAudioLifecycle('suspendForLifecycle', 'startup');
  }
  if (typeof globalThis.window !== 'undefined') {
    witness.startClock(captureWitness, globalThis.window);
  }
  schedule();

  return {
    simulationRunner,
    stop,
    close,
    destroy: close,
    isSuspended: () => suspended,
    getLifecycleState: () => lifecycleState,
    getPresentationFrame: () => presentationFrame,
    getWitness: () => witness,
    getDiagnostics: () => ({
      ...diagnostics,
      simulation: simulationRunner.getDiagnostics?.() || null,
    }),
    stepOnce: () => simulationRunner.stepOnce?.(),
  };
}
