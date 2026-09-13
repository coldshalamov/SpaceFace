// Developer and agent runtime integration for stats-gl.
// Provides real-time GPU/CPU frame-time and draw-call performance overlay.
// Lazy-loads stats-gl on demand — zero overhead during normal gameplay.

let statsInstance = null;
let statsActive = false;
let isInitializing = false;

/**
 * Check whether stats-gl is currently running.
 * @returns {boolean}
 */
export function isStatsGlActive() {
  return statsActive && statsInstance !== null;
}

/**
 * Get the underlying stats-gl instance if initialized.
 * @returns {object|null}
 */
export function getStatsGlInstance() {
  return statsInstance;
}

/**
 * Initialize and show stats-gl overlay on the target renderer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} [options]
 * @param {boolean} [options.minimal=false]
 * @param {boolean} [options.horizontal=true]
 * @param {boolean} [options.trackGPU=true]
 * @param {string} [options.position='top-right'] 'top-right' | 'top-left' | 'bottom-right'
 * @returns {Promise<object|null>}
 */
export async function initStatsGl(renderer, options = {}) {
  if (statsInstance) {
    showStatsGl();
    return statsInstance;
  }
  if (isInitializing) return null;
  isInitializing = true;

  try {
    const StatsModule = await import('stats-gl');
    const Stats = StatsModule.default || StatsModule;

    const {
      minimal = false,
      horizontal = true,
      trackGPU = true,
      trackCPT = false,
      precision = 2,
      position = 'top-right',
    } = options;

    const stats = new Stats({
      trackGPU,
      trackCPT,
      trackFPS: true,
      minimal,
      horizontal,
      precision,
    });

    if (renderer) {
      await stats.init(renderer);
    } else {
      const canvas = typeof document !== 'undefined' ? document.getElementById('gl-canvas') : null;
      if (canvas) await stats.init(canvas);
    }

    if (typeof document !== 'undefined' && stats.dom) {
      stats.dom.id = 'sf-stats-gl';
      stats.dom.style.position = 'fixed';
      stats.dom.style.zIndex = '99998';
      stats.dom.style.opacity = '0.92';
      stats.dom.style.pointerEvents = minimal ? 'auto' : 'none';

      if (position === 'top-right') {
        stats.dom.style.top = '10px';
        stats.dom.style.right = '10px';
        stats.dom.style.left = 'auto';
      } else if (position === 'top-left') {
        stats.dom.style.top = '10px';
        stats.dom.style.left = '10px';
        stats.dom.style.right = 'auto';
      } else if (position === 'bottom-right') {
        stats.dom.style.bottom = '10px';
        stats.dom.style.right = '10px';
        stats.dom.style.top = 'auto';
        stats.dom.style.left = 'auto';
      }

      document.body.appendChild(stats.dom);
    }

    statsInstance = stats;
    statsActive = true;
    console.info('[SpaceFace] stats-gl performance monitor activated.');
    return stats;
  } catch (err) {
    console.warn('[SpaceFace] Failed to initialize stats-gl:', err);
    return null;
  } finally {
    isInitializing = false;
  }
}

/**
 * Call immediately before rendering the frame.
 */
export function beginStatsGl() {
  if (statsActive && statsInstance && typeof statsInstance.begin === 'function') {
    statsInstance.begin();
  }
}

/**
 * Call immediately after rendering the frame.
 */
export function endStatsGl() {
  if (statsActive && statsInstance && typeof statsInstance.end === 'function') {
    statsInstance.end();
  }
}

/**
 * Update stats-gl frame if not using begin/end pairs.
 */
export function updateStatsGl() {
  if (statsActive && statsInstance && typeof statsInstance.update === 'function') {
    statsInstance.update();
  }
}

/**
 * Hide the stats-gl overlay DOM.
 */
export function hideStatsGl() {
  if (statsInstance && statsInstance.dom) {
    statsInstance.dom.style.display = 'none';
  }
  statsActive = false;
}

/**
 * Show the stats-gl overlay DOM.
 */
export function showStatsGl() {
  if (statsInstance && statsInstance.dom) {
    statsInstance.dom.style.display = 'block';
  }
  statsActive = true;
}

/**
 * Toggle stats-gl overlay on/off.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<boolean>}
 */
export async function toggleStatsGl(renderer) {
  if (!statsInstance) {
    await initStatsGl(renderer);
    return true;
  }
  if (statsActive) {
    hideStatsGl();
    return false;
  }
  showStatsGl();
  return true;
}

/**
 * Teardown and clean up DOM nodes.
 */
export function disposeStatsGl() {
  if (statsInstance && statsInstance.dom && statsInstance.dom.parentNode) {
    statsInstance.dom.parentNode.removeChild(statsInstance.dom);
  }
  statsInstance = null;
  statsActive = false;
}
