// Presentation owner: requestAnimationFrame, interpolation, Browser/Electron lifecycle, and restore.
// Simulation remains on the main thread, but presentation no longer owns fixed-step advancement.
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';
import { createRuntimeWitness, collectRuntimeWitnessSample } from './runtimeWitness.js';
import { LOOP_FIXED_DT } from './simulationRunner.js';
import { mustRescheduleAfterFrame } from './frameLiveness.js';

// Consecutive failing frames before the loop calls the picture dead. 30 is half a second at 60 Hz:
// long enough that a single hitch, a context blip or one bad entity cannot trip it, short enough
// that a player who is looking at a frozen world has not been looking at it for long.
const PRESENTATION_STALL_FRAMES = 30;
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
  const measureNow = deps.perfNow || perfNow;
  const presentationJournal = deps.presentationJournal
    || registry?.ctx?.presentationJournal
    || null;

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
  let unsubscribeLifecycle = null;
  let lifecycleGeneration = 0;
  let hasCompletedTick = false;
  let hasPendingJournal = false;
  let pendingJournalStart = 0;
  let pendingJournalEnd = 0;
  let pendingJournalFullRebuild = false;
  let pendingJournalRebuildGeneration = 0;
  let postRestoreFramePending = false;
  let previousPresentationOverrun = false;
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
    recoveryCappedFrameCount: 0,
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

  function rebuildJournalIfNeeded() {
    if (!presentationJournal || typeof presentationJournal.needsRebuild !== 'function'
      || !presentationJournal.needsRebuild()) return false;
    diagnostics.journalRebuildAttemptCount++;
    try {
      const entities = Array.isArray(state.entityList) ? state.entityList : [];
      const tick = Number.isSafeInteger(state.tick) && state.tick >= 0 ? state.tick : 0;
      if (typeof presentationJournal.rebuildFrom !== 'function'
        || presentationJournal.rebuildFrom(entities, tick) !== true) {
        diagnostics.journalRebuildFailureCount++;
        return false;
      }
      const start = presentationJournal.getLastRebuildStart?.() || 0;
      const end = presentationJournal.getLastRebuildEnd?.() || start;
      simulationRunner.alignJournalCursor?.(end);
      pendingJournalStart = start;
      pendingJournalEnd = end;
      pendingJournalFullRebuild = true;
      pendingJournalRebuildGeneration = presentationJournal.getRebuildGeneration?.() || 0;
      hasPendingJournal = true;
      diagnostics.journalRebuildCount++;
      return true;
    } catch (_) {
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

  function frame(now) {
    frameHandle = null;
    if (destroyed || suspended || !isPresentingState(lifecycleState)) return;

    diagnostics.executedFrames++;
    const restoring = lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING;
    const recoverFromPresentationOverrun = !restoring && previousPresentationOverrun;
    previousPresentationOverrun = false;
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
      perf.tier1?.sampleHeap(globalThis.performance?.memory?.usedJSHeapSize);
      perf.beginFrame(
        frameDt,
        callbackStart,
        now,
        (Number.isFinite(simulationRunner.fixedDt) ? simulationRunner.fixedDt : LOOP_FIXED_DT) * 1000,
      );
      const simFrameStart = measureNow();
      const fixedDt = Number.isFinite(simulationRunner.fixedDt)
        ? simulationRunner.fixedDt
        : LOOP_FIXED_DT;
      const recoveryStepCap = recoverFromPresentationOverrun && frameDt > fixedDt * 2
        ? 1
        : undefined;
      const stepResult = restoring
        ? simulationRunner.prepareWithoutAdvance()
        : simulationRunner.advance(frameDt, state.timeScale, recoveryStepCap);
      if (recoveryStepCap === 1) diagnostics.recoveryCappedFrameCount++;

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
      // perfRuntime keeps a max and a multi-step frame count; a histogram is what distinguishes
      // "occasionally 2 steps" from "routinely 4", and only the latter means the sim is starving
      // everything downstream.
      perf.tier1?.recordStepsThisFrame(stepResult.steps);

      // A lifecycle event may synchronously fire from a system step. Do not submit a frame after it
      // has transferred ownership to a non-presenting state or a newly scheduled restore callback.
      // Do not `return` here: that used to skip the trailing schedule() and leave the 3D canvas
      // frozen on the last picture while the HTML HUD still accepted input.
      const skipPresentation = destroyed || suspended
        || (!restoring && lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING);
      if (!skipPresentation) {
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
        try {
          presentationAccepted = registry.renderUpdate(alpha, frameDt, presentationFrame) !== false;
        } finally {
          const presentationMs = measureNow() - presentationStart;
          perf.recordPresentationFrame?.(presentationMs);
          previousPresentationOverrun = !restoring && presentationMs > fixedDt * 2000;
        }
        diagnostics.renderUpdates++;
        renderedSnapshot = true;
        // A frame reached the canvas, so whatever was wrong is not wrong now. Clear the run and
        // the stall; leave the cumulative count alone, because it is the record that it happened.
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
      }
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
        console.error('[loop] PRESENTATION STALLED: '
          + `${diagnostics.consecutiveFrameErrors} consecutive frame errors — the 3D canvas is `
          + 'frozen while the loop and HUD keep running. Last error: '
          + `${diagnostics.lastFrameError}`);
      }
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
  };
}
