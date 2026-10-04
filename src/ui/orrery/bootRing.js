// The existing ORRERY face, with a small worker-owned progress layer. The cinematic is untouched.
import { createLoadingProgressModel } from '../loadingProgressModel.js';
import { createBootRingWorker } from './bootRingWorker.js';
const mounted = new WeakMap();
const NS = 'http://www.w3.org/2000/svg';
const noop = () => {};
const EMPTY = { set: noop, mark: noop, report: noop, start: noop, stop: noop, finish: noop,
  destroy: noop, subscribe: () => noop, snapshot: () => ({ shown: 0 }), ready: Promise.resolve(false) };
const clock = () => globalThis.performance?.now?.() ?? Date.now();
function element(doc, name, attrs) {
  const el = doc.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function point(r, degrees) {
  const a = degrees * Math.PI / 180;
  return [88 + r * Math.sin(a), 88 - r * Math.cos(a)];
}
function arc(r, a, b) {
  const p = point(r, a), q = point(r, b);
  return `M${p.join(' ')}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${q.join(' ')}`;
}

/** One instance is shared by the lightweight entry and the full loading presenter. */
export function mountBootRing(document, overlay) {
  if (!overlay || typeof document?.createElementNS !== 'function') return EMPTY;
  if (mounted.has(overlay)) return mounted.get(overlay);
  const row = overlay.querySelector?.('.boot-progress-row');
  if (!row || typeof document.createElement !== 'function') return EMPTY;
  overlay.classList.add('boot-overlay--orrery');
  row.removeAttribute('aria-hidden');
  const host = document.defaultView || globalThis;
  const model = createLoadingProgressModel();
  const listeners = new Set(), marked = new Set();
  const shell = document.createElement('div');
  shell.className = 'boot-instrument';
  shell.setAttribute('role', 'progressbar');
  shell.setAttribute('aria-label', 'Startup progress, estimated within each loading stage');
  shell.setAttribute('aria-valuemin', '0'); shell.setAttribute('aria-valuemax', '100');
  const svg = element(document, 'svg', { class: 'boot-ring', viewBox: '0 0 176 208', 'aria-hidden': 'true' });
  const emblem = element(document, 'image', { x: 38, y: 38, width: 100, height: 100, class: 'boot-ring__emblem' });
  try { emblem.setAttribute('href', new URL('assets/ui/generated/emblem/emblem.thumb.webp', document.baseURI).href); } catch { /* probes */ }
  const engraving = [];
  for (let i = 0; i < 96; i++) {
    const a = i * 3.75, major = i % 8 === 0;
    engraving.push(`M${point(major ? 72 : 74, a).join(' ')}L${point(major ? 79 : 77, a).join(' ')}`);
  }
  const grad = element(document, 'path', { class: 'boot-ring__grad', d: engraving.join(' ') });
  const filigree = element(document, 'g', { class: 'boot-ring__filigree' });
  for (let i = 0; i < 4; i++) {
    filigree.append(element(document, 'path', { d: arc(82, i * 90 + 9, i * 90 + 65) }),
      element(document, 'path', { d: arc(53, i * 90 + 5, i * 90 + 73) }));
    const [x, y] = point(82, i * 90);
    filigree.append(element(document, 'path', { d: `M${x} ${y - 2.4}l2.4 2.4 -2.4 2.4 -2.4 -2.4Z` }));
  }
  const track = element(document, 'circle', { cx: 88, cy: 88, r: 60, class: 'boot-ring__track' });
  const live = element(document, 'g', { class: 'boot-ring__fallback' });
  const attrs = { cx: 88, cy: 88, r: 60, pathLength: 1, transform: 'rotate(-90 88 88)', 'stroke-dasharray': '0 1' };
  const bloom = element(document, 'circle', { ...attrs, class: 'boot-ring__bloom' });
  const fill = element(document, 'circle', { ...attrs, class: 'boot-ring__fill' });
  const marks = element(document, 'g', { class: 'boot-ring__marks' });
  const head = element(document, 'circle', { r: 2.2, cx: 88, cy: 24, class: 'boot-ring__head' });
  const percent = element(document, 'text', { x: 88, y: 195, class: 'boot-ring__percent', 'text-anchor': 'middle' });
  percent.textContent = '0.0%';
  live.append(bloom, fill, marks, head, percent);
  svg.append(emblem, grad, filigree, track, live);
  const canvas = document.createElement('canvas');
  canvas.className = 'boot-ring-layer'; canvas.setAttribute('aria-hidden', 'true');
  shell.append(svg, canvas); row.insertBefore(shell, row.firstChild);
  let worker = null, workerReady = false, running = false, disposed = false;
  let frame = null, lastNotify = -Infinity, lastAria = -Infinity, lastPaint = -1, lastSample = null;
  let epoch = 0;
  let stage = { id: 'boot-modules', progress: 0, ceiling: .14 };
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  let motionQuery = null, contrastQuery = null, observer = null, motion = null;
  try { motionQuery = host.matchMedia?.('(prefers-reduced-motion: reduce)');
    contrastQuery = host.matchMedia?.('(forced-colors: active)'); } catch { /* optional */ }
  const readMotion = () => !!(motionQuery?.matches || document.documentElement?.classList?.contains('sf-reduce-motion'));
  const updateMotion = () => {
    const next = readMotion(); if (next === motion) return;
    motion = next; model.setReduced(motion); worker?.post({ type: 'motion', reduced: motion });
  };
  function fallback() {
    workerReady = false; shell.classList.remove('boot-instrument--worker');
    // Never touch the transferred canvas context; SVG is an independent, already-painted fallback.
    worker?.destroy(); worker = null; lastPaint = -1; paint(clock()); resolveReady(false);
  }
  function paint(t) {
    const f = model.tick(t);
    if (!workerReady && Math.abs(f - lastPaint) > .00005) {
      lastPaint = f;
      const dash = `${f.toFixed(5)} 1`;
      fill.setAttribute('stroke-dasharray', dash); bloom.setAttribute('stroke-dasharray', dash);
      bloom.style.opacity = String(.25 + .75 * f * f);
      const [x, y] = point(64, f * 360);
      head.setAttribute('cx', x.toFixed(3)); head.setAttribute('cy', y.toFixed(3));
      percent.textContent = model.format();
    }
    if (t - lastAria >= 500) {
      lastAria = t;
      const value = Math.floor(f * 1000) / 10;
      shell.setAttribute('aria-valuenow', String(value));
      shell.setAttribute('aria-valuetext', `${model.format()} — ${stage.label || 'Loading'}`);
    }
    if (t - lastNotify >= 100) {
      lastNotify = t;
      for (const listener of listeners) { try { listener(f, model.format()); } catch { /* decoration */ } }
    }
  }
  function loop(t) {
    frame = null;
    if (disposed || !running || document.hidden) return;
    paint(t);
    // Forward the vsync beat: the worker paints in-step with presentation instead
    // of free-running on its own timer, so the needle sweeps without visible hops.
    if (workerReady) worker?.post({ type: 'frame' });
    frame = host.requestAnimationFrame?.(loop) ?? null;
  }
  function pauseClock() {
    if (frame !== null) host.cancelAnimationFrame?.(frame);
    frame = null; worker?.post({ type: 'pause' });
  }
  function startClock() {
    if (disposed || !running || document.hidden) return;
    worker?.post({ type: 'resume' });
    if (frame === null && host.requestAnimationFrame) frame = host.requestAnimationFrame(loop);
  }
  function mark(value, forward = true) {
    const key = Math.round(Math.max(0, Math.min(.997, Number(value) || 0)) * 200);
    if (!key || marked.has(key)) return;
    marked.add(key);
    if (forward) worker?.post({ type: 'mark', value });
    const a = key / 200 * 360;
    marks.append(element(document, 'path', { d: `M${point(57, a).join(' ')}L${point(69, a).join(' ')}` }));
  }
  const visibility = () => { if (document.hidden) pauseClock(); else startClock(); };
  const contrastChanged = () => { if (contrastQuery?.matches) fallback(); };
  const api = {
    mounted: true,
    ready,
    report(next = {}, { reset = false } = {}) {
      if (disposed) return;
      if (reset) { epoch++; marked.clear(); marks.replaceChildren(); lastPaint = -1; lastSample = null; }
      stage = next; model.report(next, clock(), reset); updateMotion(); mark(next.progress, false);
      worker?.post({ type: 'stage', stage: next, reset, epoch });
      if (!running || document.hidden) worker?.post({ type: 'pause' });
      if (!host.requestAnimationFrame) model.adopt(Number(next.progress) || 0);
      paint(clock());
    },
    set(value) { model.adopt(Number(value)); worker?.post({ type: 'set', value }); paint(clock()); }, // legacy hooks
    mark,
    finish() { model.finish(); worker?.post({ type: 'finish' }); },
    start() { if (!disposed) { running = true; updateMotion(); startClock(); } },
    stop() { running = false; pauseClock(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot() { return { ...model.snapshot(), workerReady, running, workerSample: lastSample }; },
    destroy() {
      if (disposed) return; api.stop(); disposed = true;
      worker?.destroy(); worker = null; resolveReady(false); listeners.clear();
      document.removeEventListener?.('visibilitychange', visibility);
      motionQuery?.removeEventListener?.('change', updateMotion);
      contrastQuery?.removeEventListener?.('change', contrastChanged);
      observer?.disconnect(); shell.remove(); mounted.delete(overlay);
    },
  };
  mounted.set(overlay, api);
  updateMotion(); model.report(stage, clock()); paint(clock());
  if (!contrastQuery?.matches) {
    worker = createBootRingWorker(canvas, { stage, reduced: motion,
      onReady() {
        if (disposed) return;
        workerReady = true; shell.classList.add('boot-instrument--worker'); resolveReady(true);
        if (!running || document.hidden) worker?.post({ type: 'pause' });
      },
      onSample(sample) { if (sample.epoch !== epoch) return; lastSample = sample; model.adopt(sample.shown); },
      onFailure: fallback,
    });
  }
  if (!worker) resolveReady(false);
  document.addEventListener?.('visibilitychange', visibility);
  motionQuery?.addEventListener?.('change', updateMotion);
  contrastQuery?.addEventListener?.('change', contrastChanged);
  if (typeof host.MutationObserver === 'function' && document.documentElement) {
    observer = new host.MutationObserver(updateMotion);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return api;
}
