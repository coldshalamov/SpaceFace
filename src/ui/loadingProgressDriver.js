import { createLoadingProgressModel } from './loadingProgressModel.js';

/** Main-thread, DOM-independent fallback for lightweight shells/probes that have the original
 * percentage/bar hooks but no SVG-capable instrument row. The full instrument owns its own driver.
 */
export function createLoadingProgressDriver(host = globalThis) {
  const model = createLoadingProgressModel(), listeners = new Set();
  let running = false, frame = null, logicalNow = 0;
  const paint = () => { for (const fn of listeners) fn(model.snapshot().shown, model.format()); };
  const loop = (time) => {
    frame = null; if (!running) return;
    logicalNow = Number.isFinite(time) ? time : logicalNow;
    model.tick(logicalNow); paint();
    frame = host.requestAnimationFrame?.(loop) ?? null;
  };
  const api = {
    mounted: false, ready: Promise.resolve(false),
    report(stage, { reset = false } = {}) {
      // A minimal shell begins at its first verified step; it has no earlier instrument to inherit.
      if (reset) model.reset(logicalNow, Number(stage.progress) || 0);
      model.report(stage, logicalNow);
      if (!host.requestAnimationFrame) { model.setReduced(true); model.tick(logicalNow); }
      paint();
    },
    mark() {}, set(value) { model.adopt(value); paint(); },
    start() { running = true; if (frame === null && host.requestAnimationFrame) frame = host.requestAnimationFrame(loop); },
    stop() { running = false; if (frame !== null) host.cancelAnimationFrame?.(frame); frame = null; },
    finish() { model.finish(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot: model.snapshot,
    destroy() { api.stop(); listeners.clear(); },
  };
  return api;
}
