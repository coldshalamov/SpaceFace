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
 * Programmatically triggers a frame capture on the canvas.
 * @param {HTMLCanvasElement} [targetCanvas] Defaults to document.getElementById('gl-canvas')
 * @param {object} [options]
 * @param {boolean} [options.download=false] Automatically trigger browser JSON download
 * @param {number} [options.timeoutMs=10000] Maximum wait time for frame capture
 * @returns {Promise<object>} The captured frame data
 */
export async function captureSpectorFrame(targetCanvas, options = {}) {
  const spector = await initSpector();
  if (!spector) throw new Error('Spector.js could not be initialized');

  const canvas = targetCanvas || document.getElementById('gl-canvas');
  if (!canvas) throw new Error('Target canvas (#gl-canvas) not found');

  const { download = false, timeoutMs = 10000 } = options;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Spector capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onCaptureListener = (capture) => {
      clearTimeout(timeout);
      try {
        spector.onCapture.remove(onCaptureListener);
      } catch (_) {}

      if (download && typeof document !== 'undefined') {
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

      resolve(capture);
    };

    spector.onCapture.add(onCaptureListener);
    spector.captureCanvas(canvas);
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
