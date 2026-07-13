// Single requestAnimationFrame loop with a fixed-timestep accumulator (ARCHITECTURE §2.2).
// Sim runs at 60 Hz; render runs every frame with an interpolation alpha. timeScale gates the
// sim (0 = paused: render/camera/UI keep running). A step cap prevents the spiral of death.
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';

export const LOOP_FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;
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

export function startLoop(state, registry) {
  let last = performance.now();
  const stepResult = { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
  // Reuse one callback rather than closing over registry on every requestAnimationFrame.
  const stepSimulation = (dt) => registry.step(dt);

  function frame(now) {
    const callbackStart = perfNow();
    let perf = null;
    // Monotonic clock is only read at this loop seam for frame pacing — never inside sim systems.
    let frameDt = (now - last) / 1000;
    if (frameDt > 0.25) frameDt = 0.25; // clamp huge stalls (tab switch, breakpoint)
    last = now;

    try {
      perf = ensurePerfRuntime(state);
      perf.beginFrame(frameDt);
      const simFrameStart = perfNow();
      advanceFixedTimestep(state.accumulator, frameDt, state.timeScale, stepSimulation, stepResult);
      state.accumulator = stepResult.accumulator;
      perf.recordSimFrame(perfNow() - simFrameStart);
      perf.recordLoop(stepResult.steps, stepResult.shedBacklog, state.accumulator, stepResult.shedSteps);

      let alpha = state.accumulator / DT;
      if (alpha < 0) alpha = 0; else if (alpha > 1) alpha = 1;
      registry.renderUpdate(alpha, frameDt);
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
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
