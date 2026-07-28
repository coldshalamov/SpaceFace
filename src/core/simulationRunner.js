// Main-thread simulation owner. Keeps the authoritative fixed-step policy separate from presentation
// scheduling so a later transport change does not need to rediscover tick, backlog, or ordering rules.

export const LOOP_FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;

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
  const presentationJournal = deps.presentationJournal || null;
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
  let lifecycleGeneration = 0;
  let overflowCount = 0;
  let consumedTickCount = 0;
  let skippedPresentationTicks = 0;

  function journalSequence() {
    return presentationJournal && typeof presentationJournal.getWriteSequence === 'function'
      ? presentationJournal.getWriteSequence()
      : 0;
  }

  function reserveCompletedTick() {
    if (completedCount >= completedTickCapacity) {
      overflowCount++;
      throw new Error(`SimulationRunner completed-tick queue overflow (${completedTickCapacity})`);
    }
    return completedTicks[completedWrite];
  }

  function publishCompletedTick(slot, nextInputSequence, journalStart) {
    completedSequence++;
    inputSequence = nextInputSequence;
    slot.sequence = completedSequence;
    slot.tick = Number.isSafeInteger(state.tick) ? state.tick : 0;
    slot.simTime = Number.isFinite(state.simTime) ? state.simTime : 0;
    // This is a cheap boundary marker, not an acceptance digest. PQ-034 remains the hash authority.
    slot.stateDigestMarker = slot.tick;
    slot.inputSequence = inputSequence;
    slot.lifecycleGeneration = lifecycleGeneration;
    slot.journalStart = journalStart;
    slot.journalEnd = journalSequence();
    completedWrite = (completedWrite + 1) % completedTickCapacity;
    completedCount++;
  }

  function stepSimulation(dt) {
    // Reserve before advancing authoritative state so queue exhaustion fails closed rather than
    // advancing a tick that presentation can never observe.
    const slot = reserveCompletedTick();
    const nextInputSequence = inputSequence + 1;
    const journalStart = journalSequence();
    registry.step(dt);
    publishCompletedTick(slot, nextInputSequence, journalStart);
  }

  function prepareWithoutAdvance() {
    advanceResult.steps = 0;
    advanceResult.shedBacklog = false;
    advanceResult.shedSteps = 0;
    advanceResult.accumulator = Number.isFinite(state.accumulator)
      ? Math.max(0, state.accumulator)
      : 0;
    return advanceResult;
  }

  return {
    fixedDt,
    maxSteps,
    advance(frameDt, timeScale = state.timeScale) {
      advanceFixedTimestep(
        state.accumulator,
        frameDt,
        timeScale,
        stepSimulation,
        advanceResult,
        fixedDt,
        maxSteps,
      );
      state.accumulator = advanceResult.accumulator;
      return advanceResult;
    },
    prepareWithoutAdvance,
    interpolationAlpha() {
      const accumulator = Number.isFinite(state.accumulator) ? state.accumulator : 0;
      const alpha = accumulator / fixedDt;
      return alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
    },
    consumeLatestCompletedTick(out) {
      if (!out || typeof out !== 'object') {
        throw new TypeError('consumeLatestCompletedTick requires a caller-owned output object');
      }
      let consumed = 0;
      while (completedCount > 0) {
        copyCompletedTick(out, completedTicks[completedRead]);
        completedRead = (completedRead + 1) % completedTickCapacity;
        completedCount--;
        consumed++;
      }
      if (consumed > 1) skippedPresentationTicks += consumed - 1;
      consumedTickCount += consumed;
      return consumed;
    },
    setLifecycleGeneration(value) {
      lifecycleGeneration = Number.isSafeInteger(value) && value >= 0 ? value : lifecycleGeneration;
    },
    getLifecycleGeneration: () => lifecycleGeneration,
    getPendingCompletedTickCount: () => completedCount,
    getDiagnostics() {
      return {
        fixedDt,
        maxSteps,
        completedTickCapacity,
        completedSequence,
        inputSequence,
        pendingCompletedTicks: completedCount,
        consumedTickCount,
        skippedPresentationTicks,
        overflowCount,
        lifecycleGeneration,
      };
    },
  };
}
