// Single requestAnimationFrame loop with a fixed-timestep accumulator (ARCHITECTURE §2.2).
// Sim runs at 60 Hz; render runs every frame with an interpolation alpha. timeScale gates the
// sim (0 = paused: render/camera/UI keep running). A step cap prevents the spiral of death.
// Hidden/minimized/suspended states own no frame callback; restore presents before simulation resumes.
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';

export const LOOP_FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;
export const LOOP_LIFECYCLE_STATES = Object.freeze({
  FOREGROUND_VISIBLE: 'foreground-visible',
  FOREGROUND_OCCLUDED: 'foreground-occluded',
  HIDDEN_OR_MINIMIZED: 'hidden-or-minimized',
  SYSTEM_SUSPENDED: 'system-suspended',
  RESTORING: 'restoring',
});

const DT = LOOP_FIXED_DT;

export function advanceFixedTimestep(accumulator, frameDt, timeScale, step, out = null, dt = DT, maxSteps = MAX_CATCHUP_STEPS) {
  const result = out || { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  result.steps = 0;
  result.shedBacklog = false;
  result.shedSteps = 0;
  result.accumulator = Number.isFinite(accumulator) ? Math.max(0, accumulator) : 0;

  const scale = Number.isFinite(timeScale) ? timeScale : 0;
  const frameSeconds = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
  const fixedDt = Number.isFinite(dt) && dt > 0 ? dt : DT;
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

/**
 * Start the fixed-step/presentation loop and return its single lifecycle owner.
 * Dependencies are injectable so lifecycle policy can be verified without real timers or DOM work.
 */
export function startLoop(state, registry, deps = {}) {
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
  const nowMs = deps.nowMs
    || (() => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()));

  if (typeof requestFrame !== 'function') {
    throw new Error('startLoop requires requestAnimationFrame');
  }

  let shellState = LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  let shellSequence = -1;
  let documentHidden = visibilityTarget?.visibilityState === 'hidden';

  function requestedState() {
    if (shellState === LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED) {
      return LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED;
    }
    if (documentHidden || shellState === LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED) {
      return LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED;
    }
    return shellState === LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
      ? LOOP_LIFECYCLE_STATES.FOREGROUND_OCCLUDED
      : LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  }

  let destroyed = false;
  let frameHandle = null;
  let last = nowMs();
  let lifecycleState = requestedState();
  let restoreTarget = LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE;
  let suspended = !isPresentingState(lifecycleState);
  let unsubscribeLifecycle = null;

  const diagnostics = {
    lifecycleState,
    requestedLifecycleState: lifecycleState,
    restoreTarget: null,
    suspended,
    visibilityState: visibilityTarget?.visibilityState || 'unavailable',
    shellState,
    shellSequence,
    lastLifecycleReason: 'startup',
    requestedFrames: 0,
    executedFrames: 0,
    renderUpdates: 0,
    suspendCount: 0,
    resumeCount: 0,
    lifecycleTransitionCount: 0,
    staleShellCommandCount: 0,
    duplicateShellCommandCount: 0,
    invalidShellCommandCount: 0,
    timestampResetCount: 0,
    restoreFrameCount: 0,
    stepsThisFrame: 0,
    maxStepsObserved: 0,
    shedBacklogFrames: 0,
  };

  const stepResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  // Reuse one fixed-step callback rather than closing over registry on every simulation step.
  const stepSimulation = (dt) => registry.step(dt);

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
    state.accumulator = Number.isFinite(accumulator)
      ? Math.max(0, Math.min(accumulator, DT - Number.EPSILON))
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
    diagnostics.visibilityState = visibilityTarget?.visibilityState || 'unavailable';
    documentHidden = diagnostics.visibilityState === 'hidden';
    synchronizeLifecycle('document-visibility');
  }

  function onShellLifecycle(command) {
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

  function frame(now) {
    frameHandle = null;
    if (destroyed || suspended || !isPresentingState(lifecycleState)) return;

    diagnostics.executedFrames++;
    const restoring = lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING;
    const callbackStart = perfNow();
    let perf = null;
    let renderedSnapshot = false;
    let frameDt = restoring ? 0 : (now - last) / 1000;
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
    if (frameDt > 0.25) frameDt = 0.25;
    last = now;

    try {
      perf = ensurePerfRuntime(state);
      perf.beginFrame(frameDt);
      const simFrameStart = perfNow();

      if (restoring) {
        stepResult.steps = 0;
        stepResult.shedBacklog = false;
        stepResult.shedSteps = 0;
        stepResult.accumulator = state.accumulator;
      } else {
        advanceFixedTimestep(state.accumulator, frameDt, state.timeScale, stepSimulation, stepResult);
        state.accumulator = stepResult.accumulator;
      }

      diagnostics.stepsThisFrame = stepResult.steps;
      diagnostics.maxStepsObserved = Math.max(diagnostics.maxStepsObserved, stepResult.steps);
      if (stepResult.shedBacklog) diagnostics.shedBacklogFrames++;
      perf.recordSimFrame(perfNow() - simFrameStart);
      perf.recordLoop(stepResult.steps, stepResult.shedBacklog, state.accumulator, stepResult.shedSteps);

      // A lifecycle event may synchronously fire from a system step. Do not submit a frame after it
      // has transferred ownership to a non-presenting state or a newly scheduled restore callback.
      if (destroyed || suspended || (!restoring && lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING)) return;

      let alpha = state.accumulator / DT;
      if (alpha < 0) alpha = 0; else if (alpha > 1) alpha = 1;
      registry.renderUpdate(alpha, frameDt);
      diagnostics.renderUpdates++;
      renderedSnapshot = true;
    } catch (err) {
      // One bad frame must never kill the whole loop; log a bounded number and keep running.
      frame._errs = (frame._errs || 0) + 1;
      if (frame._errs <= 20) console.error('[loop] frame error:', err);
      else if (frame._errs === 21) console.error('[loop] further frame errors suppressed');
    } finally {
      if (perf && typeof perf.recordFrameCallback === 'function') {
        perf.recordFrameCallback(perfNow() - callbackStart);
      }
    }

    if (restoring && renderedSnapshot && lifecycleState === LOOP_LIFECYCLE_STATES.RESTORING) {
      diagnostics.restoreFrameCount++;
      diagnostics.restoreTarget = null;
      setAudioLifecycle('resumeFromLifecycle', 'restore-frame-complete');
      recordState(restoreTarget, 'restore-frame-complete');
      // Restore rendering and synchronous owner wake-up are presentation work, not elapsed
      // foreground simulation time. Start the ordinary fixed-step clock after that work commits.
      last = nowMs();
      diagnostics.timestampResetCount++;
    }
    schedule();
  }

  if (visibilityTarget && typeof visibilityTarget.addEventListener === 'function') {
    visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (lifecyclePort && typeof lifecyclePort.subscribe === 'function') {
    const unsubscribe = lifecyclePort.subscribe(onShellLifecycle);
    if (typeof unsubscribe === 'function') unsubscribeLifecycle = unsubscribe;
  }
  if (suspended && diagnostics.suspendCount === 0) {
    setAudioLifecycle('suspendForLifecycle', 'startup');
  }
  schedule();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelScheduledFrame();
      if (visibilityTarget && typeof visibilityTarget.removeEventListener === 'function') {
        visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (unsubscribeLifecycle) {
        try { unsubscribeLifecycle(); } catch (_) { /* teardown stays best-effort */ }
        unsubscribeLifecycle = null;
      }
    },
    isSuspended: () => suspended,
    getLifecycleState: () => lifecycleState,
    getDiagnostics: () => ({ ...diagnostics }),
  };
}
