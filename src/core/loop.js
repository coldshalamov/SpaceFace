// Single requestAnimationFrame loop with a fixed-timestep accumulator (ARCHITECTURE §2.2).
// Sim runs at 60 Hz; render runs every frame with an interpolation alpha. timeScale gates the
// sim (0 = paused: render/camera/UI keep running). A step cap prevents the spiral of death.
const DT = 1 / 60;
const MAX_STEPS = 8;

export function startLoop(state, registry) {
  let last = performance.now();

  function frame(now) {
    let frameDt = (now - last) / 1000;
    if (frameDt > 0.25) frameDt = 0.25; // clamp huge stalls (tab switch, breakpoint)
    last = now;

    try {
      if (state.timeScale > 0) {
        state.accumulator += frameDt * state.timeScale;
        let steps = 0;
        while (state.accumulator >= DT && steps < MAX_STEPS) {
          registry.step(DT);
          state.accumulator -= DT;
          steps++;
        }
        if (steps >= MAX_STEPS) state.accumulator = 0; // shed backlog, stay responsive
      }

      let alpha = state.accumulator / DT;
      if (alpha < 0) alpha = 0; else if (alpha > 1) alpha = 1;
      registry.renderUpdate(alpha, frameDt);
    } catch (err) {
      // One bad frame must never kill the whole loop; log a bounded number and keep running.
      frame._errs = (frame._errs || 0) + 1;
      if (frame._errs <= 20) console.error('[loop] frame error:', err);
      else if (frame._errs === 21) console.error('[loop] further frame errors suppressed');
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
