// Main-thread simulation owner. Keeps the authoritative fixed-step policy separate from presentation
// scheduling so a later transport change does not need to rediscover tick, backlog, or ordering rules.
import { createInputCommandSnapshotQueue } from './inputCommandSnapshot.js';

export const LOOP_FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;
// A SLOW FRAME RATE IS NOT A HITCH. Four catch-up steps cover every callback down to 15 fps at
// full realtime (and ~10–12 fps with one shed tick): a 30 fps frame owes two ticks and gets two.
// Capping those frames (the old one-step cap after a late present, two after any frame over
// 33 ms, or treating every soft-GPU ~83 ms callback as a hitch) did not make the picture arrive
// sooner — drawing is the cost on those machines, not the sim — it ran the whole game at
// 40–65 % speed exactly where it was already struggling.
//
// A hitch is a callback that arrives more than HITCH_FRAME_TICKS late (GC, a long task, a blocked
// present): the picture was frozen and the pilot could not steer. Replaying all of that time
// would teleport the ship through whatever was ahead of it, so a hitch resumes the world two
// ticks on and the rest of the debt is shed. Threshold stays above MAX_CATCHUP_STEPS so every
// frame the catch-up ceiling can fully serve is classified as a slow frame, never a hitch.
// 6.5 ticks (~108 ms) keeps soft-GPU sustained ~12 fps (and down through ~10 fps) on the slow
// path; a true spike (120 ms+ in continuity / crucible) still sheds.
export const HITCH_FRAME_TICKS = 6.5;
export const HITCH_CATCHUP_STEPS = 2;

/** True when this callback's frame delta is a hitch rather than a slow-but-steady frame rate. */
export function isHitchFrame(frameDt, fixedDt = LOOP_FIXED_DT) {
  const dt = Number.isFinite(fixedDt) && fixedDt > 0 ? fixedDt : LOOP_FIXED_DT;
  return Number.isFinite(frameDt) && frameDt > dt * HITCH_FRAME_TICKS;
}

/**
 * Step cap for this callback's simulation advance.
 * Steady frames keep the full catch-up ceiling (real-time down to 15 fps); a hitch sheds to two.
 */
export function frameSimStepCap({
  frameDt = 0,
  fixedDt = LOOP_FIXED_DT,
  maxSteps = MAX_CATCHUP_STEPS,
} = {}) {
  const configured = Math.max(1, Math.floor(Number.isFinite(maxSteps) ? maxSteps : MAX_CATCHUP_STEPS));
  return isHitchFrame(frameDt, fixedDt) ? Math.min(configured, HITCH_CATCHUP_STEPS) : configured;
}

const DEFAULT_COMPLETED_TICK_CAPACITY = 8;

export function advanceFixedTimestep(
  accumulator,
  frameDt,
  timeScale,
  step,
  out = null,
  dt = LOOP_FIXED_DT,
  maxSteps = MAX_CATCHUP_STEPS,
) {
  const result = out || { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  result.steps = 0;
  result.shedBacklog = false;
  result.shedSteps = 0;
  result.accumulator = Number.isFinite(accumulator) ? Math.max(0, accumulator) : 0;

  const scale = Number.isFinite(timeScale) ? timeScale : 0;
  const frameSeconds = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
  const fixedDt = Number.isFinite(dt) && dt > 0 ? dt : LOOP_FIXED_DT;
  // Hard cap stays at MAX_CATCHUP_STEPS (4): enough for ~15–30 fps presentation catch-up, not
  // an unbounded spiral. Whole-step debt beyond the cap is shed while keeping sub-step remainder
  // so the next frame can resume at the correct 60 Hz phase without wall-clock/RNG dependence.
  const stepCap = Math.max(1, Math.floor(Number.isFinite(maxSteps) ? maxSteps : MAX_CATCHUP_STEPS));
  if (!(scale > 0)) return result;

  result.accumulator += frameSeconds * scale;
  while (result.accumulator >= fixedDt && result.steps < stepCap) {
    step(fixedDt);
    result.accumulator -= fixedDt;
    result.steps++;
  }

  if (result.accumulator >= fixedDt) {
    // Drop overdue whole ticks but retain the sub-tick phase. Resetting all the way to zero creates
    // an avoidable long interval before the next sim step after a hitch. Accounting is explicit:
    // shedSteps = floor(acc/dt) whole fixed ticks discarded; remainder stays for interpolation.
    const wholeLeft = Math.floor(result.accumulator / fixedDt);
    const remainder = result.accumulator - wholeLeft * fixedDt;
    result.shedSteps = wholeLeft;
    result.accumulator = remainder < 1e-12 || fixedDt - remainder < 1e-12 ? 0 : remainder;
    result.shedBacklog = true;
  }
  return result;
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

function copyCompletedTick(target, source) {
  target.sequence = source.sequence;
  target.tick = source.tick;
  target.simTime = source.simTime;
  target.stateDigestMarker = source.stateDigestMarker;
  target.inputSequence = source.inputSequence;
  target.inputCommandSeq = source.inputCommandSeq;
  target.inputWallMs = source.inputWallMs;
  target.lifecycleGeneration = source.lifecycleGeneration;
  target.journalStart = source.journalStart;
  target.journalEnd = source.journalEnd;
  return target;
}

/**
 * Own the fixed-step accumulator and publish a bounded queue of completed-tick metadata.
 * The registry remains the sole owner of system/event order; this runner only invokes registry.step.
 */
export function createSimulationRunner(state, registry, deps = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('SimulationRunner requires state');
  if (!registry || typeof registry.step !== 'function') {
    throw new TypeError('SimulationRunner requires registry.step');
  }

  const fixedDt = Number.isFinite(deps.fixedDt) && deps.fixedDt > 0
    ? deps.fixedDt
    : LOOP_FIXED_DT;
  const maxSteps = Math.max(1, Math.floor(Number.isFinite(deps.maxSteps)
    ? deps.maxSteps
    : MAX_CATCHUP_STEPS));
  const completedTickCapacity = Math.max(
    maxSteps,
    Math.floor(Number.isFinite(deps.completedTickCapacity)
      ? deps.completedTickCapacity
      : DEFAULT_COMPLETED_TICK_CAPACITY),
  );
  let presentationJournal = deps.presentationJournal || null;
  const inputCommandSnapshotCapacity = Math.max(
    maxSteps,
    Math.floor(Number.isFinite(deps.inputCommandSnapshotCapacity)
      ? deps.inputCommandSnapshotCapacity
      : completedTickCapacity),
  );
  let inputCommandSnapshots = deps.inputCommandSnapshots
    || createInputCommandSnapshotQueue(inputCommandSnapshotCapacity);
  if (typeof inputCommandSnapshots.reserve !== 'function'
    || typeof inputCommandSnapshots.capture !== 'function'
    || typeof inputCommandSnapshots.consume !== 'function'
    || typeof inputCommandSnapshots.cancel !== 'function') {
    throw new TypeError('SimulationRunner requires a bounded InputCommandSnapshot queue');
  }
  const onInputCommandSnapshot = typeof deps.onInputCommandSnapshot === 'function'
    ? deps.onInputCommandSnapshot
    : null;
  const completedTicks = Array.from(
    { length: completedTickCapacity },
    () => createCompletedTickRecord(),
  );
  const advanceResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  let completedRead = 0;
  let completedWrite = 0;
  let completedCount = 0;
  let completedSequence = 0;
  let inputSequence = 0;
  // P7: wall-clock stamp of the newest player input command the current tick consumed, copied
  // verbatim from the input boundary onto the completed tick so presentation can name the first
  // frame that reflects it. Telemetry only — never read by gameplay.
  let pendingInputCommandSeq = 0;
  let pendingInputWallMs = 0;
  let lifecycleGeneration = 0;
  let overflowCount = 0;
  let consumedTickCount = 0;
  let skippedPresentationTicks = 0;
  let inputBoundaryCaptureCount = 0;
  let inputBoundaryErrorCount = 0;
  let inputSnapshotCancelCount = 0;
  let inputObserverErrorCount = 0;
  let lastInputObserverError = null;
  let committedJournalSequence = 0;
  let journalCursorAlignmentCount = 0;
  let recoveryCappedAdvanceCount = 0;
  let lastAdvanceStepCap = maxSteps;
  let closed = false;
  let closeComplete = false;
  let closeCount = 0;
  let closeAttemptCount = 0;
  let closeFailureCount = 0;
  let completedTicksPendingAtClose = 0;
  let completedTicksDiscardedOnClose = 0;
  let inputPendingAtClose = 0;
  let inputResidualPending = 0;
  let inputSnapshotsCancelledOnClose = 0;
  let inputCancellationFailureCount = 0;
  let closedInputCommandSnapshotDiagnostics = null;
  // The step throw that triggered quarantine. Every later frame can only report
  // "SimulationRunner is closed", so the original error must be retained here.
  let closeCauseMessage = null;
  // The stack's first frames name the throwing system — a bare "x is not defined" does not.
  let closeCauseSite = null;

  function assertOpen() {
    if (closed) throw new Error('SimulationRunner is closed');
  }

  const inputTickBoundary = {
    sequence: 0,
    targetTick: 0,
    publishedSequence: 0,
    publishInputCommand(input, actualTick, activityStamp) {
      assertOpen();
      if (this.publishedSequence !== 0) {
        inputBoundaryErrorCount++;
        throw new Error(`InputCommandSnapshot ${this.sequence} published more than once`);
      }
      // seq mirrors the deterministic device-arbitration sequence (_activitySeq), which
      // save/load already restores. wallMs arrives out-of-band from the input system —
      // wall-clock fields may never live inside state.input (serialized + hashed).
      pendingInputCommandSeq = Number.isSafeInteger(input && input._activitySeq)
        ? input._activitySeq : 0;
      pendingInputWallMs = Number.isFinite(activityStamp && activityStamp.wallMs)
        ? activityStamp.wallMs : 0;
      inputCommandSnapshots.capture(this.sequence, input, actualTick);
      this.publishedSequence = this.sequence;
      inputBoundaryCaptureCount++;
    },
  };

  function journalSequence() {
    return presentationJournal && typeof presentationJournal.getWriteSequence === 'function'
      ? presentationJournal.getWriteSequence()
      : 0;
  }

  function initialJournalCursor() {
    if (presentationJournal
      && typeof presentationJournal.getPendingCount === 'function'
      && typeof presentationJournal.getOldestSequence === 'function'
      && presentationJournal.getPendingCount() > 0) {
      const oldestSequence = presentationJournal.getOldestSequence();
      if (Number.isSafeInteger(oldestSequence) && oldestSequence > 0) return oldestSequence - 1;
    }
    return journalSequence();
  }

  committedJournalSequence = initialJournalCursor();

  function reserveCompletedTick() {
    if (completedCount >= completedTickCapacity) {
      overflowCount++;
      throw new Error(`SimulationRunner completed-tick queue overflow (${completedTickCapacity})`);
    }
    return completedTicks[completedWrite];
  }

  function publishCompletedTick(slot, nextInputSequence, journalStart, journalEnd) {
    completedSequence++;
    inputSequence = nextInputSequence;
    slot.sequence = completedSequence;
    slot.tick = Number.isSafeInteger(state.tick) ? state.tick : 0;
    slot.simTime = Number.isFinite(state.simTime) ? state.simTime : 0;
    // This is a cheap boundary marker, not an acceptance digest. PQ-034 remains the hash authority.
    slot.stateDigestMarker = slot.tick;
    slot.inputSequence = inputSequence;
    slot.inputCommandSeq = pendingInputCommandSeq;
    slot.inputWallMs = pendingInputWallMs;
    slot.lifecycleGeneration = lifecycleGeneration;
    slot.journalStart = journalStart;
    slot.journalEnd = journalEnd;
    completedWrite = (completedWrite + 1) % completedTickCapacity;
    completedCount++;
    committedJournalSequence = journalEnd;
  }

  function stepSimulation(dt) {
    assertOpen();
    const commandSnapshots = inputCommandSnapshots;
    // Reserve both publications before advancing authoritative state. Exhaustion therefore fails
    // closed rather than advancing a tick whose command or completion record cannot be represented.
    const slot = reserveCompletedTick();
    const nextInputSequence = inputSequence + 1;
    const currentTick = Number.isSafeInteger(state.tick) && state.tick >= 0
      ? state.tick
      : completedSequence;
    const targetTick = currentTick + 1;
    commandSnapshots.reserve(nextInputSequence, targetTick, lifecycleGeneration);
    inputTickBoundary.sequence = nextInputSequence;
    inputTickBoundary.targetTick = targetTick;
    inputTickBoundary.publishedSequence = 0;
    // The cursor advances only when a completed tick commits. Records published between fixed ticks
    // therefore belong to the next completion instead of disappearing behind a tick-start sample.
    const journalStart = committedJournalSequence;

    try {
      registry.step(dt, inputTickBoundary);
      state.simCatchupIndex = (state.simCatchupIndex | 0) + 1;
      assertOpen();
      if (inputTickBoundary.publishedSequence !== nextInputSequence) {
        inputBoundaryErrorCount++;
        throw new Error(`InputCommandSnapshot ${nextInputSequence} was not published`);
      }
      const observerError = commandSnapshots.consume(
        nextInputSequence,
        onInputCommandSnapshot,
      );
      assertOpen();
      inputSequence = nextInputSequence;
      publishCompletedTick(slot, nextInputSequence, journalStart, journalSequence());
      if (observerError) {
        inputObserverErrorCount++;
        lastInputObserverError = observerError instanceof Error
          ? observerError.message
          : String(observerError);
      }
    } catch (error) {
      if (commandSnapshots.cancel(nextInputSequence)) inputSnapshotCancelCount++;
      // registry.step may have mutated authoritative state before throwing. The accumulator is
      // intentionally not committed on this path, so close the runner before rethrowing to make
      // that uncommitted phase permanently non-retryable. The original error remains the caller's
      // diagnostic; close() retains the existing queue/cancellation diagnostics.
      if (!closed) {
        closeCauseMessage = error && typeof error.message === 'string'
          ? error.message.slice(0, 240)
          : String(error).slice(0, 240);
        const stackLines = error && typeof error.stack === 'string'
          ? error.stack.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('at '))
          : null;
        closeCauseSite = stackLines && stackLines.length
          ? stackLines.slice(0, 4).join(' | ').slice(0, 480)
          : null;
        try {
          close();
        } catch (_) {
          // close() quarantines the runner before reporting residual cleanup work. Preserve the
          // authoritative failure above; getDiagnostics() retains the close failure counters.
        }
      }
      throw error;
    }
  }

  function prepareWithoutAdvance() {
    assertOpen();
    advanceResult.steps = 0;
    advanceResult.shedBacklog = false;
    advanceResult.shedSteps = 0;
    advanceResult.accumulator = Number.isFinite(state.accumulator)
      ? Math.max(0, state.accumulator)
      : 0;
    return advanceResult;
  }

  function close() {
    if (closeComplete) return false;
    closeAttemptCount++;
    if (!closed) {
      closed = true;
      closeCount++;
      completedTicksPendingAtClose = completedCount;
      completedTicksDiscardedOnClose += completedCount;
      completedRead = 0;
      completedWrite = 0;
      completedCount = 0;
      completedTicks.length = 0;
      const initialPending = inputCommandSnapshots?.getPendingCount?.();
      const initialDiagnostics = inputCommandSnapshots?.getDiagnostics?.() || null;
      inputPendingAtClose = Number.isFinite(initialPending)
        ? Math.max(0, Math.floor(initialPending))
        : Math.max(0, Math.floor(Number(initialDiagnostics?.pending) || 0));
      presentationJournal = null;
      inputTickBoundary.sequence = 0;
      inputTickBoundary.targetTick = 0;
      inputTickBoundary.publishedSequence = 0;
    }

    const commandSnapshots = inputCommandSnapshots;
    const before = commandSnapshots?.getDiagnostics?.() || null;
    const currentPending = commandSnapshots?.getPendingCount?.();
    let remaining = Number.isFinite(currentPending)
      ? Math.max(0, Math.floor(currentPending))
      : Math.max(0, Math.floor(Number(before?.pending) || 0));
    let attempts = 0;
    const attemptCap = Math.max(1, Number(commandSnapshots?.capacity) || inputCommandSnapshotCapacity);
    while (remaining > 0 && attempts < attemptCap) {
      const snapshotDiagnostics = commandSnapshots?.getDiagnostics?.() || null;
      const sequence = snapshotDiagnostics?.lastReservedSequence;
      if (!Number.isSafeInteger(sequence)
        || typeof commandSnapshots?.cancel !== 'function'
        || commandSnapshots.cancel(sequence) !== true) {
        inputCancellationFailureCount++;
        break;
      }
      inputSnapshotsCancelledOnClose++;
      attempts++;
      const nextPending = commandSnapshots?.getPendingCount?.();
      remaining = Number.isFinite(nextPending)
        ? Math.max(0, Math.floor(nextPending))
        : Math.max(0, remaining - 1);
    }
    const after = commandSnapshots?.getDiagnostics?.() || before || {};
    const reportedRemaining = commandSnapshots?.getPendingCount?.();
    const diagnosticRemaining = Number(after?.pending);
    inputResidualPending = Number.isFinite(reportedRemaining)
      ? Math.max(0, Math.floor(reportedRemaining))
      : (Number.isFinite(diagnosticRemaining)
        ? Math.max(0, Math.floor(diagnosticRemaining))
        : remaining);
    if (inputResidualPending > 0) {
      closeFailureCount++;
      throw new Error(
        `SimulationRunner close left ${inputResidualPending} input snapshot pending`,
      );
    }
    closedInputCommandSnapshotDiagnostics = {
      ...after,
      closed: true,
      pendingAtClose: inputPendingAtClose,
      pending: 0,
    };
    inputCommandSnapshots = null;
    closeComplete = true;
    return true;
  }

  return {
    fixedDt,
    maxSteps,
    advance(frameDt, timeScale = state.timeScale, perCallStepCap = maxSteps) {
      assertOpen();
      const requestedStepCap = Number.isFinite(perCallStepCap)
        ? Math.floor(perCallStepCap)
        : maxSteps;
      const effectiveStepCap = Math.max(1, Math.min(maxSteps, requestedStepCap));
      lastAdvanceStepCap = effectiveStepCap;
      if (effectiveStepCap < maxSteps) recoveryCappedAdvanceCount++;
      state.simCatchupIndex = 0;
      advanceFixedTimestep(
        state.accumulator,
        frameDt,
        timeScale,
        stepSimulation,
        advanceResult,
        fixedDt,
        effectiveStepCap,
      );
      advanceResult.stepCap = effectiveStepCap;
      advanceResult.catchupPresentationSkips = Math.max(0, (advanceResult.steps | 0) - 1);
      state.accumulator = advanceResult.accumulator;
      return advanceResult;
    },
    // Lab Step is the only caller of stepOnce(). Replay and advance() never invoke it, so
    // check:sim / check:sim:v3 hashes cannot move.
    stepOnce() {
      assertOpen();
      stepSimulation(fixedDt);
      return true;
    },
    prepareWithoutAdvance,
    interpolationAlpha() {
      assertOpen();
      const accumulator = Number.isFinite(state.accumulator) ? state.accumulator : 0;
      const alpha = accumulator / fixedDt;
      return alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
    },
    consumeLatestCompletedTick(out) {
      assertOpen();
      if (!out || typeof out !== 'object') {
        throw new TypeError('consumeLatestCompletedTick requires a caller-owned output object');
      }
      let consumed = 0;
      let earliestJournalStart = 0;
      while (completedCount > 0) {
        const completedTick = completedTicks[completedRead];
        if (consumed === 0) earliestJournalStart = completedTick.journalStart;
        copyCompletedTick(out, completedTick);
        completedRead = (completedRead + 1) % completedTickCapacity;
        completedCount--;
        consumed++;
      }
      if (consumed > 0) out.journalStart = earliestJournalStart;
      if (consumed > 1) skippedPresentationTicks += consumed - 1;
      consumedTickCount += consumed;
      return consumed;
    },
    alignJournalCursor(sequence) {
      assertOpen();
      if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > journalSequence()) {
        throw new RangeError(`SimulationRunner journal cursor is invalid (${sequence})`);
      }
      if (completedCount > 0) {
        throw new Error('SimulationRunner cannot align the journal cursor with pending completed ticks');
      }
      committedJournalSequence = sequence;
      journalCursorAlignmentCount++;
      return committedJournalSequence;
    },
    setLifecycleGeneration(value) {
      assertOpen();
      lifecycleGeneration = Number.isSafeInteger(value) && value >= 0 ? value : lifecycleGeneration;
    },
    close,
    isClosed: () => closed,
    getLifecycleGeneration: () => lifecycleGeneration,
    getPendingCompletedTickCount: () => completedCount,
    getDiagnostics() {
      return {
        closed,
        closeComplete,
        closeCount,
        closeAttemptCount,
        closeFailureCount,
        closeCauseMessage,
        closeCauseSite,
        completedTicksPendingAtClose,
        completedTicksDiscardedOnClose,
        inputPendingAtClose,
        inputResidualPending,
        inputSnapshotsCancelledOnClose,
        inputCancellationFailureCount,
        fixedDt,
        maxSteps,
        completedTickCapacity,
        completedSequence,
        inputSequence,
        inputCommandSnapshotCapacity: inputCommandSnapshots?.capacity
          || inputCommandSnapshotCapacity,
        inputBoundaryCaptureCount,
        inputBoundaryErrorCount,
        inputSnapshotCancelCount,
        inputObserverErrorCount,
        lastInputObserverError,
        inputCommandSnapshots: inputCommandSnapshots?.getDiagnostics?.()
          || closedInputCommandSnapshotDiagnostics,
        pendingCompletedTicks: completedCount,
        retainedCompletedTickCapacity: completedTicks.length,
        consumedTickCount,
        skippedPresentationTicks,
        overflowCount,
        lifecycleGeneration,
        committedJournalSequence,
        journalCursorAlignmentCount,
        recoveryCappedAdvanceCount,
        lastAdvanceStepCap,
      };
    },
  };
}
