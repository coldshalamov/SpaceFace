// flickerGrid.js — Scanner Grid. Pattern after Magic UI "flickering grid" (reference, not a dependency).
// SpaceFace meaning: an active sensor field. Cell brightness = signal return at that bearing; a lit
// cell means "something scanned here." Cells light TOWARD detected returns, never randomly.
//
// Bounded: a reveal sweep animates ≤650 ms then HOLDS a static lit grid — it never free-runs (that
// would be "animation at rest"). Canvas + a self-parking rAF driver. Deterministic (seeded flicker),
// token colour only, view-only.
import { clamp01, createRafDriver, makeRng, prefersReducedMotion, resolveToken } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'flickerGrid',
  screens: ['galaxyMap', 'exploration', 'stationHub', 'mainMenu'],
  triggers: ['scan:pulse', 'map:open', 'contact:resolve'],
  maxMs: 650,
  loop: false,
});

const MAX_REVEAL_MS = 650;

/**
 * @param {HTMLElement} mountEl  container the grid <canvas> is appended into
 * @param {object} [opts]  { width, height, cell, gap, seed, token, motionReduce }
 */
export function createFlickerGrid(mountEl, opts = {}) {
  const cell = Math.max(3, opts.cell || 14);
  const gap = Math.max(0, opts.gap == null ? 2 : opts.gap);
  let W = Math.max(1, opts.width || mountEl.clientWidth || 240);
  let H = Math.max(1, opts.height || mountEl.clientHeight || 140);
  const rng = makeRng(opts.seed == null ? 1337 : opts.seed | 0);
  const tokenName = opts.token || '--accent';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'sf-fx-flickergrid';
  canvas.setAttribute('aria-hidden', 'true');
  mountEl.appendChild(canvas);
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;

  let cols = gridCols();
  let rows = gridRows();
  let target = new Float32Array(cols * rows); // steady lit intensity per cell [0..1]
  let phase = seededPhases(cols * rows);      // per-cell flicker phase (deterministic)
  let litColor = 'transparent';               // resolved at reveal/setActive boundary, cached here
  let active = true;
  let revealMs = MAX_REVEAL_MS;

  function gridCols() { return Math.max(1, Math.ceil(W / (cell + gap))); }
  function gridRows() { return Math.max(1, Math.ceil(H / (cell + gap))); }
  function seededPhases(n) {
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) p[i] = rng();
    return p;
  }
  function resolveColors() { litColor = resolveToken(tokenName, 'transparent'); }

  const driver = createRafDriver((elapsed) => {
    const dur = Math.min(revealMs, MAX_REVEAL_MS) || MAX_REVEAL_MS;
    const p = clamp01(elapsed / dur);
    draw(p);
    return p < 1; // park exactly at completion → the final static lit grid remains
  });

  function draw(progress) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const stride = cell + gap;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const t = target[i];
        if (t <= 0) continue;
        let a = t * progress;
        if (progress < 1) a *= 0.55 + 0.45 * flicker(phase[i], progress);
        ctx.globalAlpha = clamp01(a) * 0.9;
        ctx.fillStyle = litColor;
        ctx.fillRect(c * stride, r * stride, cell, cell);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Deterministic pseudo-flicker from the cell's seeded phase; smooths to steady as progress→1.
  function flicker(ph, p) {
    const s = Math.sin((ph * 12.9898 + p * 6.28318) * 3.14159);
    return (1 - p) * (0.5 + 0.5 * s) + p;
  }

  // resolveTo: number (uniform) | array (row-major intensities) | fn(col,row,cols,rows)->[0..1].
  function setTargets(resolveTo) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (typeof resolveTo === 'function') target[i] = clamp01(resolveTo(c, r, cols, rows));
        else if (Array.isArray(resolveTo)) target[i] = clamp01(resolveTo[i] == null ? 0 : resolveTo[i]);
        else if (typeof resolveTo === 'number') target[i] = clamp01(resolveTo);
      }
    }
  }

  /** Run one bounded reveal sweep, then hold static. */
  function reveal(o = {}) {
    if (o.resolveTo != null) setTargets(o.resolveTo);
    resolveColors();
    revealMs = Math.min(MAX_REVEAL_MS, o.durationMs || MAX_REVEAL_MS);
    if (!active || prefersReducedMotion(opts)) { draw(1); return; } // static lit grid, no flicker, no rAF
    driver.stop();
    driver.start();
  }

  /** Re-read returns from state and hold the static lit grid (no implicit animation). */
  function update(state) {
    if (state && state.resolveTo != null) setTargets(state.resolveTo);
    resolveColors();
    draw(1);
  }

  function setActive(on) {
    active = !!on;
    if (!active) { driver.stop(); return; }
    resolveColors();
    draw(1); // resume shows the held static state
  }

  /** Caller opt-in: park while the tab is hidden. Element-level visibility stays the caller's job. */
  function pauseWhenHidden() {
    if (typeof document === 'undefined' || !document.addEventListener) return () => {};
    const onVis = () => setActive(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => { if (document.removeEventListener) document.removeEventListener('visibilitychange', onVis); };
  }

  function resize(w, h) {
    W = Math.max(1, w || W);
    H = Math.max(1, h || H);
    canvas.width = W;
    canvas.height = H;
    cols = gridCols();
    rows = gridRows();
    target = new Float32Array(cols * rows);
    phase = seededPhases(cols * rows);
    draw(1);
  }

  function dispose() {
    driver.stop();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  resolveColors();
  return { reveal, update, setActive, pauseWhenHidden, resize, dispose, canvas, cue: CUE };
}
