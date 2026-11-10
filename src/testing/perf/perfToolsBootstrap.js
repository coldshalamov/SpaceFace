// Runtime performance tools bootstrap.
// Binds stats-gl, spector.js, and renderer.info monitors to window.SF and registers dev keybindings.

import { initStatsGl, toggleStatsGl, beginStatsGl, endStatsGl, isStatsGlActive } from './statsGlIntegration.js';
import { initSpector, displaySpectorUI, captureSpectorFrame, spySpectorCanvas } from './spectorIntegration.js';
import { globalRendererInfoMonitor } from './rendererInfoMonitor.js';

let isBootstrapped = false;

/**
 * Bootstrap performance tools on the running game instance.
 * @param {object} sf - The window.SF context object
 */
export function bootstrapPerfTools(sf) {
  if (typeof window === 'undefined' || isBootstrapped) return;
  isBootstrapped = true;

  const renderer = (sf && sf.state && sf.state.render && sf.state.render.renderer) || null;

  // Expose handles on window.SF
  sf.perf = sf.perf || {};
  sf.perf.statsGl = {
    init: (opts) => initStatsGl(sf.state?.render?.renderer || renderer, opts),
    toggle: () => toggleStatsGl(sf.state?.render?.renderer || renderer),
    isActive: isStatsGlActive,
  };
  sf.perf.spector = {
    init: initSpector,
    displayUI: displaySpectorUI,
    capture: (opts) => captureSpectorFrame(document.getElementById('gl-canvas'), opts),
    spy: () => spySpectorCanvas(document.getElementById('gl-canvas')),
  };
  sf.perf.renderInfo = globalRendererInfoMonitor;

  // Top-level aliases for quick agent and dev console access
  sf.captureSpector = (opts) => sf.perf.spector.capture(opts);
  sf.toggleStatsGl = () => sf.perf.statsGl.toggle();
  sf.getRenderInfo = () => globalRendererInfoMonitor.getSummary();
  sf.dumpRenderInfo = () => globalRendererInfoMonitor.dumpToConsole();

  // Wire per-frame telemetry sample
  if (sf.state && sf.state.render) {
    sf.state.render.onDiagnosticsSample = (info, dt, rend) => {
      globalRendererInfoMonitor.sample(rend, dt);
      if (isStatsGlActive()) {
        import('./statsGlIntegration.js').then((m) => m.updateStatsGl()).catch(() => {});
      }
    };
  }

  // Register dev keyboard shortcuts
  window.addEventListener('keydown', (ev) => {
    // Ctrl + Alt + S or F3: Toggle stats-gl
    if ((ev.ctrlKey && ev.altKey && ev.code === 'KeyS') || ev.key === 'F3') {
      ev.preventDefault();
      sf.perf.statsGl.toggle();
    }
    // Ctrl + Alt + C: Single-frame Spector capture
    if (ev.ctrlKey && ev.altKey && ev.code === 'KeyC') {
      ev.preventDefault();
      console.log('[SpaceFace] Capturing WebGL frame with Spector.js...');
      sf.perf.spector.capture({ download: true }).then(() => {
        console.log('[SpaceFace] Spector frame capture completed and downloaded.');
      }).catch((err) => {
        console.error('[SpaceFace] Spector frame capture failed:', err);
      });
    }
    // Ctrl + Alt + I: Dump renderer.info summary
    if (ev.ctrlKey && ev.altKey && ev.code === 'KeyI') {
      ev.preventDefault();
      globalRendererInfoMonitor.dumpToConsole();
    }
  });

  // Check URL parameters for automated / dev flags
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    if (params.has('stats') || params.has('statsgl')) {
      setTimeout(() => {
        sf.perf.statsGl.init();
      }, 500);
    }
    if (params.has('spector')) {
      setTimeout(() => {
        sf.perf.spector.displayUI();
      }, 500);
    }
    if (params.has('spectorspy')) {
      setTimeout(() => {
        sf.perf.spector.spy();
      }, 500);
    }
  }

  console.info('[SpaceFace] Performance review tools ready:');
  console.info('  - stats-gl: Toggle with F3 or Ctrl+Alt+S (or ?stats=1)');
  console.info('  - Spector.js: Capture with Ctrl+Alt+C, UI with window.SF.perf.spector.displayUI() (or ?spector=1)');
  console.info('  - renderer.info: Dump stats with Ctrl+Alt+I or window.SF.dumpRenderInfo()');
}

export {
  beginStatsGl,
  endStatsGl,
  globalRendererInfoMonitor,
};
