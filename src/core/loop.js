// Single requestAnimationFrame loop with a fixed-timestep accumulator (ARCHITECTURE §2.2).
// Sim runs at 60 Hz; render runs every frame with an interpolation alpha. timeScale gates the
// sim (0 = paused: render/camera/UI keep running). A step cap prevents the spiral of death.
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';

export const LOOP_FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;
const DT = LOOP_FIXED_DT;

export function advanceFixedTimestep(accumulator, frameDt, timeScale, step, out = null, dt = DT, maxSteps = MAX_CATCHUP_STEPS) {
  const result = out || { steps: 0, shedBacklog: false, accumulator: 0 };
  result.steps = 0;
  result.shedBacklog = false;
  result.accumulator = Number.isFinite(accumulator) ? Math.max(0, accumulator) : 0;

  const scale = Number.isFinite(timeScale) ? timeScale : 0;
  const frameSeconds = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
  const fixedDt = Number.isFinite(dt) && dt > 0 ? dt : DT;
  const stepCap = Math.max(1, Math.floor(Number.isFinite(maxSteps) ? maxSteps : MAX_CATCHUP_STEPS));
  if (!(scale > 0)) return result;

  result.accumulator += frameSeconds * scale;
  while (result.accumulator >= fixedDt && result.steps < stepCap) {
    step(fixedDt);
    result.accumulator -= fixedDt;
    result.steps++;
  }

  if (result.accumulator >= fixedDt) {
    result.accumulator = 0;
    result.shedBacklog = true;
  }
  return result;
}

export function startLoop(state, registry) {
  let last = performance.now();
  const stepResult = { steps: 0, shedBacklog: false, accumulator: 0 };

  function frame(now) {
    const callbackStart = perfNow();
    let perf = null;
    let frameDt = (now - last) / 1000;
    if (frameDt > 0.25) frameDt = 0.25; // clamp huge stalls (tab switch, breakpoint)
    last = now;

    try {
      perf = ensurePerfRuntime(state);
      perf.beginFrame(frameDt);
      const simFrameStart = perfNow();
      advanceFixedTimestep(state.accumulator, frameDt, state.timeScale, (dt) => registry.step(dt), stepResult);
      state.accumulator = stepResult.accumulator;
      perf.recordSimFrame(perfNow() - simFrameStart);
      perf.recordLoop(stepResult.steps, stepResult.shedBacklog, state.accumulator);

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
