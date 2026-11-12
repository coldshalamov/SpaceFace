// Developer and agent runtime integration for Spector.js.
// Enables WebGL pipeline, shader program, draw call, and uniform state inspection.

let spectorInstance = null;
let isScriptLoading = null;

/**
 * Ensures the Spector.js bundle is loaded into the browser environment.
 * @returns {Promise<any>}
 */
export async function loadSpectorScript() {
  if (typeof window === 'undefined') return null;
  if (window.SPECTOR) return window.SPECTOR;
  if (isScriptLoading) return isScriptLoading;

  isScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './node_modules/spectorjs/dist/spector.bundle.js';
    script.async = true;
    script.onload = () => {
      if (window.SPECTOR) {
        resolve(window.SPECTOR);
      } else {
        reject(new Error('SPECTOR global not found after loading bundle'));
      }
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return isScriptLoading;
}

/**
 * Initializes the Spector.js instance.
 * @returns {Promise<any>}
 */
export async function initSpector() {
  if (spectorInstance) return spectorInstance;
  const SPECTOR = await loadSpectorScript();
  if (!SPECTOR) return null;

  spectorInstance = new SPECTOR.Spector();
  console.info('[SpaceFace] Spector.js initialized.');
  return spectorInstance;
}

/**
 * Displays the built-in Spector UI overlay (record button & inspection panel).
 * @returns {Promise<any>}
 */
export async function displaySpectorUI() {
  const spector = await initSpector();
  if (spector && typeof spector.displayUI === 'function') {
    spector.displayUI();
    console.info('[SpaceFace] Spector.js UI displayed.');
  }
  return spector;
}

/**
 * Resolves the renderer that owns the real game submission boundary.
 *
 * Spector's frame mode listens to requestAnimationFrame. SpaceFace's render
 * scheduler can keep that callback alive while the world submission is stale,
 * so diagnostics must be bound to the renderer's own successful draw instead.
 * @returns {object|null}
 */
function getLiveRenderOwner() {
  const sf = typeof window !== 'undefined' ? window.SF : null;
  const owner = sf?.registry?.get?.('render');
  return owner && typeof owner.drawPreparedFrame === 'function' ? owner : null;
}

/**
 * Stop a Spector command capture and clear the retry state used by Spector.js
 * 0.9.x. Its public stopCapture() retries a zero-command capture through the
 * frame spy, which would otherwise keep a timed-out diagnostic alive.
 * @param {any} spector
 */
function abortSpectorCapture(spector) {
  try {
    if (typeof spector?.stopCapture === 'function') spector.stopCapture();
  } catch (_) {
    // Diagnostic cleanup must never change the game path.
  }

  // These are Spector.js 0.9.30 fields. Guard each write so this remains
  // harmless if a future version changes its internal representation.
  try {
    if (spector && 'noFrameTimeout' in spector) {
      if (spector.noFrameTimeout !== -1 && spector.noFrameTimeout != null) {
        clearTimeout(spector.noFrameTimeout);
      }
      spector.noFrameTimeout = -1;
    }
  } catch (_) {}
  for (const [key, value] of [
    ['capturingContext', undefined],
    ['captureNextFrames', 0],
    ['captureNextCommands', 0],
  ]) {
    try {
      if (spector && key in spector) spector[key] = value;
    } catch (_) {}
  }
}

/**
 * Save a capture as JSON when the opt-in caller requested a download.
 * @param {object} capture
 * @param {boolean} download
 */
function downloadCapture(capture, download) {
  if (!download || typeof document === 'undefined') return;
  try {
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spector-capture-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn('[SpaceFace] Failed to auto-download Spector JSON:', e);
  }
}

/**
 * Programmatically captures the next successful real renderer submission.
 *
 * This deliberately wraps render.drawPreparedFrame rather than asking
 * Spector to discover a requestAnimationFrame callback. A false/failed draw
 * leaves the diagnostic armed for the next owner call; only a true return is
 * allowed to settle the capture. No synthetic draw is issued.
 * @param {HTMLCanvasElement} [targetCanvas] Defaults to document.getElementById('gl-canvas')
 * @param {object} [options]
 * @param {boolean} [options.download=false] Automatically trigger browser JSON download
 * @param {number} [options.timeoutMs=10000] Maximum wait time for frame capture
 * @param {number} [options.commandCount=10000] Maximum GL commands to record
 * @param {boolean} [options.quickCapture=false] Spector quick-capture mode
 * @param {boolean} [options.fullCapture=false] Spector full-capture mode
 * @returns {Promise<object>} The captured frame data
 */
export async function captureSpectorFrame(targetCanvas, options = {}) {
  const spector = await initSpector();
  if (!spector) throw new Error('Spector.js could not be initialized');

  const canvas = targetCanvas || document.getElementById('gl-canvas');
  if (!canvas) throw new Error('Target canvas (#gl-canvas) not found');

  const owner = getLiveRenderOwner();
  if (!owner) {
    throw new Error('Live render owner (window.SF.registry.get("render")) is unavailable');
  }
  if (typeof spector.startCapture !== 'function' || typeof spector.stopCapture !== 'function') {
    throw new Error('Spector.js command capture API is unavailable');
  }
  if (!spector.onCapture || typeof spector.onCapture.add !== 'function'
      || typeof spector.onCapture.remove !== 'function') {
    throw new Error('Spector.js capture event API is unavailable');
  }

  const {
    download = false,
    timeoutMs = 10000,
    commandCount: requestedCommandCount = 10000,
    quickCapture = false,
    fullCapture = false,
  } = options;
  const waitMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
  const commandCount = Number.isFinite(requestedCommandCount)
    ? Math.min(10000, Math.max(1, Math.floor(requestedCommandCount)))
    : 10000;

  return new Promise((resolve, reject) => {
    const original = owner.drawPreparedFrame;
    let wrapped;
    let timeout = null;
    let settled = false;
    let activeCapture = false;
    let successfulDraw = false;
    let pendingCapture = null;

    const removeListeners = () => {
      try { spector.onCapture.remove(onCaptureListener); } catch (_) {}
      try { spector.onError?.remove?.(onErrorListener); } catch (_) {}
    };

    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      removeListeners();
      if (owner.drawPreparedFrame === wrapped) owner.drawPreparedFrame = original;
      activeCapture = false;
      successfulDraw = false;
      pendingCapture = null;
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      abortSpectorCapture(spector);
      reject(error instanceof Error ? error : new Error(String(error || 'Spector capture failed')));
    };

    const succeed = (capture) => {
      if (settled) return;
      if (!capture) {
        fail(new Error('Spector returned no capture for the successful renderer draw'));
        return;
      }
      settled = true;
      capture.spacefaceBoundary = {
        successfulWorldDraw: true,
        commandLimit: commandCount,
        truncated: capture.commands?.length >= commandCount,
      };
      cleanup();
      downloadCapture(capture, download);
      resolve(capture);
    };

    const onCaptureListener = (capture) => {
      if (settled || !activeCapture) return;
      pendingCapture = capture;
      // Spector can finish synchronously at its command limit while the draw
      // owner is still executing. Do not accept a skipped/partial owner call.
      if (successfulDraw) succeed(capture);
    };

    const onErrorListener = (error) => {
      fail(error instanceof Error ? error : new Error(String(error || 'Spector reported an error')));
    };

    const beginCapture = () => {
      if (activeCapture || settled) return !settled;
      activeCapture = true;
      successfulDraw = false;
      pendingCapture = null;
      try {
        spector.startCapture(canvas, commandCount, quickCapture, fullCapture);
      } catch (error) {
        fail(error);
        // The render owner still runs below; diagnostics must not gate gameplay.
      }
      return !settled;
    };

    wrapped = function (...args) {
      const captureReady = beginCapture();
      let result;
      try {
        // Always forward the original owner call, including after a diagnostic
        // setup error, so capture cannot change gameplay behavior.
        result = original.apply(this, args);
      } catch (error) {
        fail(error);
        throw error;
      }

      if (!captureReady || settled) return result;
      if (result !== true) {
        // A skipped call can still warm resources. Discard those commands and
        // arm a fresh capture for the next owner call, never merge two draws.
        successfulDraw = false;
        abortSpectorCapture(spector);
        pendingCapture = null;
        activeCapture = false;
        return result;
      }

      successfulDraw = true;
      if (pendingCapture) {
        succeed(pendingCapture);
        return result;
      }

      let stoppedCapture;
      try {
        stoppedCapture = spector.stopCapture();
      } catch (error) {
        fail(error);
        return result;
      }
      // Spector 0.9.x emits onCapture synchronously from stopCapture and also
      // returns the same capture. Accept either form for API compatibility.
      if (!settled) {
        if (stoppedCapture) succeed(stoppedCapture);
        else fail(new Error('Spector returned no capture for the successful renderer draw'));
      }
      return result;
    };

    try {
      spector.onCapture.add(onCaptureListener);
      if (spector.onError?.add) spector.onError.add(onErrorListener);
      owner.drawPreparedFrame = wrapped;
      timeout = setTimeout(() => {
        fail(new Error(`Spector capture timed out after ${waitMs}ms`));
      }, waitMs);
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Spy on canvas to track resources even before frame capture.
 * @param {HTMLCanvasElement} [targetCanvas]
 */
export async function spySpectorCanvas(targetCanvas) {
  const spector = await initSpector();
  if (!spector) return;
  const canvas = targetCanvas || document.getElementById('gl-canvas');
  if (canvas && typeof spector.spyCanvas === 'function') {
    spector.spyCanvas(canvas);
  }
}
