// Frame-liveness classifier for Continue / ordinary flight.
//
// A still 3D canvas behind a live HUD is a presentation latch, not a HUD bug. This module only
// classifies samples. Callers must repair the owner (identity, draw exception, context recovery,
// present). Catch-and-continue that leaves lastFrameError repeating is itself a failure.

export const LIVENESS_CLASS = Object.freeze({
  LIVE: 'live',
  HITCH: 'hitch',
  FROZEN_PICTURE: 'frozen-picture',
  CONTEXT_LOST: 'context-lost',
  REPEATING_FRAME_ERROR: 'repeating-frame-error',
  SIM_PAUSED: 'sim-paused',
});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function classifyFrameLiveness(previous, current, options = {}) {
  const hitchMs = Number(options.hitchMs) > 0 ? Number(options.hitchMs) : 32;
  const prev = previous || {};
  const cur = current || {};

  if (cur.contextLost === true) {
    return {
      class: LIVENESS_CLASS.CONTEXT_LOST,
      live: false,
      headline: 'WebGL context is lost and has not recovered.',
    };
  }

  const errorDelta = num(cur.frameErrorCount) - num(prev.frameErrorCount);
  if (errorDelta >= 3 && cur.lastFrameError) {
    return {
      class: LIVENESS_CLASS.REPEATING_FRAME_ERROR,
      live: false,
      headline: `Repeating frame error: ${String(cur.lastFrameError).slice(0, 180)}`,
    };
  }

  if (num(cur.timeScale) === 0 && cur.mode === 'flight') {
    return {
      class: LIVENESS_CLASS.SIM_PAUSED,
      live: false,
      headline: 'Simulation time scale is zero, so the world clock is frozen.',
    };
  }

  const simMoved = num(cur.simTime) > num(prev.simTime) || num(cur.tick) > num(prev.tick);
  const renderMoved = num(cur.rendererFrame) > num(prev.rendererFrame)
    || num(cur.renderUpdates) > num(prev.renderUpdates);
  const canvasMoved = cur.canvasChanged === true
    || (Number.isFinite(num(cur.canvasHash)) && Number.isFinite(num(prev.canvasHash))
      && num(cur.canvasHash) !== num(prev.canvasHash));

  if (simMoved && !renderMoved) {
    return {
      class: LIVENESS_CLASS.FROZEN_PICTURE,
      live: false,
      headline: 'Simulation is advancing but the GPU frame counter is not. Frozen 3D picture with a live HUD.',
    };
  }

  if (simMoved && renderMoved && cur.canvasChanged === false && prev.rendererFrame != null) {
    return {
      class: LIVENESS_CLASS.FROZEN_PICTURE,
      live: false,
      headline: 'Renderer frames increment but canvas pixels are unchanged.',
    };
  }

  const dt = num(cur.frameDtMs);
  if (dt > hitchMs) {
    return {
      class: LIVENESS_CLASS.HITCH,
      live: true,
      headline: `Frame hitched at ${dt.toFixed(1)} ms.`,
    };
  }

  if (simMoved && renderMoved) {
    return {
      class: LIVENESS_CLASS.LIVE,
      live: true,
      headline: 'Simulation, renderer, and presentation are advancing together.',
    };
  }

  return {
    class: LIVENESS_CLASS.LIVE,
    live: true,
    headline: 'Insufficient deltas to declare a latch.',
  };
}

export function summarizeLivenessWindow(samples, options = {}) {
  const rows = Array.isArray(samples) ? samples : [];
  const classes = [];
  let hitches = 0;
  let frozen = 0;
  let live = 0;
  for (let i = 1; i < rows.length; i++) {
    const verdict = classifyFrameLiveness(rows[i - 1], rows[i], options);
    classes.push(verdict.class);
    if (verdict.class === LIVENESS_CLASS.HITCH) hitches += 1;
    if (verdict.live !== true) frozen += 1;
    else live += 1;
  }
  const last = rows[rows.length - 1] || null;
  return Object.freeze({
    sampleCount: rows.length,
    live,
    hitchCount: hitches,
    latchCount: frozen,
    lastClass: classes[classes.length - 1] || null,
    contextLost: last?.contextLost === true,
    lastFrameError: last?.lastFrameError || null,
    repeatingError: classes.includes(LIVENESS_CLASS.REPEATING_FRAME_ERROR),
    frozenPicture: classes.includes(LIVENESS_CLASS.FROZEN_PICTURE),
    ok: frozen === 0 && last?.contextLost !== true,
  });
}

/** Presentation must always reschedule rAF after a thrown frame. */
export function mustRescheduleAfterFrame(flags = {}) {
  if (flags.destroyed === true) return false;
  return true;
}
