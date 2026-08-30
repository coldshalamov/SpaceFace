// Presentation-frame owner for render / VFX / feel / HUD.
//
// A VFX or draw failure used to abort before feel.frame and ui.frame. That froze the overlay on
// the last successful paint (Massline still reading LOCKED after MASSLINE BROKEN) even though the
// sim kept running. Cosmetic lanes must not strand the HUD or hit-stop clock.

const VFX_ERROR_LOG_CAP = 20;
let vfxErrorLogCount = 0;

export function runRenderUpdatePhase({
  state,
  render,
  vfx,
  feel,
  ui,
  alpha,
  frameDt,
  presentationFrame = null,
  recordPhase,
  now,
} = {}) {
  const record = typeof recordPhase === 'function' ? recordPhase : noopPhase;
  const clock = typeof now === 'function' ? now : defaultNow;

  if (state && state.ui && state.ui.docked === true) {
    record('render', 0);
    record('vfx', 0);
    record('feel', 0);
    runFeelAndUi({ feel, ui, frameDt, state, record, clock });
    return false;
  }

  let t = clock();
  let renderMs = 0;
  let renderedPreparedScene = false;
  const splitRender = !!(render
    && typeof render.prepareFrame === 'function'
    && typeof render.drawPreparedFrame === 'function');
  let renderError = null;
  try {
    if (splitRender) renderedPreparedScene = render.prepareFrame(alpha, frameDt, presentationFrame) !== false;
    else if (render && typeof render.renderFrame === 'function') {
      render.renderFrame(alpha, frameDt, presentationFrame);
    }
  } catch (err) {
    renderError = reportRenderError(render, splitRender ? 'render.prepare' : 'render.frame', err);
  } finally {
    renderMs += clock() - t;
  }

  let vfxError = null;
  if (vfx && typeof vfx.update === 'function') {
    t = clock();
    try { vfx.update(frameDt, state); }
    catch (err) { vfxError = err; }
    finally { record('vfx', clock() - t); }
  } else {
    record('vfx', 0);
  }

  let drawError = null;
  if (splitRender) {
    t = clock();
    try {
      if (!renderError && renderedPreparedScene) render.drawPreparedFrame();
    } catch (err) {
      drawError = reportRenderError(render, 'render.draw', err);
    } finally {
      renderMs += clock() - t;
      record('render', renderMs);
    }
  } else {
    record('render', renderMs);
  }

  let feelError = null;
  let uiError = null;
  const overlayErrors = runFeelAndUi({ feel, ui, frameDt, state, record, clock });
  feelError = overlayErrors.feelError;
  uiError = overlayErrors.uiError;

  // HUD/feel already ran. World-lane failures still throw so the loop logger sees them. A VFX-only
  // failure returns true so the presentation journal can advance: prepare already consumed the range.
  const worldError = renderError || drawError;
  if (worldError) throw worldError;
  if (feelError) throw feelError;
  if (uiError) throw uiError;
  if (vfxError) {
    vfxErrorLogCount++;
    if (vfxErrorLogCount <= VFX_ERROR_LOG_CAP) console.error('[loop] vfx error:', vfxError);
    else if (vfxErrorLogCount === VFX_ERROR_LOG_CAP + 1) console.error('[loop] further vfx errors suppressed');
    return true;
  }
  return true;
}

function runFeelAndUi({ feel, ui, frameDt, state, record, clock }) {
  let feelError = null;
  let uiError = null;
  if (feel && typeof feel.frame === 'function') {
    const t = clock();
    try { feel.frame(frameDt, state); }
    catch (err) { feelError = err; }
    finally { record('feel', clock() - t); }
  } else {
    record('feel', 0);
  }
  if (ui && typeof ui.frame === 'function') {
    const t = clock();
    try { ui.frame(frameDt, state); }
    catch (err) { uiError = err; }
    finally { record('ui', clock() - t); }
  } else {
    record('ui', 0);
  }
  return { feelError, uiError };
}

function noopPhase() {}

function defaultNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

function reportRenderError(render, stage, error) {
  try {
    if (render && typeof render.recordRenderError === 'function') {
      render.recordRenderError(stage, error);
    }
  } catch (_) {
    // Error reporting must not turn a contained render fault into a loop-killing diagnostic fault.
  }
  if (error && typeof error === 'object') {
    try {
      if (!error.renderStage) {
        Object.defineProperty(error, 'renderStage', {
          configurable: true,
          enumerable: false,
          value: stage,
          writable: true,
        });
      }
      const message = typeof error.message === 'string' ? error.message : String(error);
      const prefix = `[${stage}]`;
      if (!message.startsWith(prefix)) error.message = `${prefix} ${message}`;
      return error;
    } catch (_) {
      // Some host errors are non-extensible; return the original object and preserve identity.
      return error;
    }
  }
  return new Error(`[${stage}] ${String(error)}`);
}
