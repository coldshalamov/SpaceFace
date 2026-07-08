// glyphMatrix.js — Anomaly Glyph Matrix. Pattern after Magic UI "glyph/icon matrix" (reference only).
// SpaceFace meaning: encoded, partially-decoded information — an anomaly signature, a cargo manifest,
// a contact-code roster, an assay readout. Glyphs resolve scrambled → legible as the player EARNS the
// read (scan / decode / board).
//
// The settle is bounded (≤600 ms, staggered) then PARKS — perpetual scramble as "sci-fi flavor" is
// the juice-inflation trap and is forbidden. A continuous mutation mode is opt-in (setMutationRate)
// and tied to active data; pause() and setActive(false) both park it. Deterministic scramble (seeded),
// token colour, canvas + a self-parking rAF driver. Reduced motion → final glyphs immediately.
import { createRafDriver, makeRng, prefersReducedMotion, resolveToken } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'glyphMatrix',
  screens: ['exploration', 'codex', 'market', 'cargo', 'salvage', 'factions'],
  triggers: ['anomaly:decodeStep', 'scan:resolved', 'salvage:boarded', 'manifest:revealed'],
  maxMs: 600,
  loop: false,
});

const MAX_SETTLE_MS = 600;
const REST_GLYPH = '░'; // ░ — the quiet unresolved state
const SCRAMBLE = '░▒▓◈◇■✦✧⧡⧢⬡⬢'.split('');

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { cols, rows, cell, seed, token, motionReduce, width, height }
 */
export function createGlyphMatrix(mountEl, opts = {}) {
  const cols = Math.max(1, opts.cols || 12);
  const rows = Math.max(1, opts.rows || 4);
  const cell = Math.max(8, opts.cell || 16);
  const W = Math.max(1, opts.width || cols * cell);
  const H = Math.max(1, opts.height || rows * cell);
  const rng = makeRng(opts.seed == null ? 4242 : opts.seed | 0);
  const tokenName = opts.token || '--accent-3';
  const n = cols * rows;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'sf-fx-glyphmatrix';
  canvas.setAttribute('aria-hidden', 'true');
  mountEl.appendChild(canvas);
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;

  const targetChars = new Array(n).fill(' ');    // legible target per cell (' ' = permanently blank)
  const resolveAt = new Float32Array(n);         // per-cell settle deadline (ms into the settle)
  const scrambleIdx = new Int16Array(n);         // per-cell seeded scramble seed
  for (let i = 0; i < n; i++) scrambleIdx[i] = (rng() * SCRAMBLE.length) | 0;

  let glyphColor = 'transparent';
  let active = true;
  let settleMs = 0;         // >0 while a bounded settle is in flight
  let mutationRate = 0;     // Hz; 0 = no continuous mutation (the default, non-flavor state)

  function resolveColors() { glyphColor = resolveToken(tokenName, 'transparent'); }

  const driver = createRafDriver((elapsed) => {
    const settling = settleMs > 0 && elapsed <= settleMs;
    const step = mutationRate > 0 ? Math.floor(elapsed / (1000 / mutationRate)) : 0;
    draw(elapsed, step);
    // keep running while settling, OR while an explicit mutation rate is set AND we're active
    return settling || (mutationRate > 0 && active);
  });

  function draw(elapsed, step) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = glyphColor;
    ctx.font = Math.floor(cell * 0.8) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const target = targetChars[i];
        const resolved = settleMs <= 0 || elapsed >= resolveAt[i];
        let ch;
        if (resolved) ch = target;
        else if (target === ' ') ch = REST_GLYPH; // blanks stay quiet, never scramble
        else ch = SCRAMBLE[(scrambleIdx[i] + step + (elapsed | 0)) % SCRAMBLE.length];
        if (ch === ' ') continue;
        ctx.globalAlpha = resolved ? 0.95 : 0.6;
        ctx.fillText(ch, c * cell + cell / 2, r * cell + cell / 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function setTarget(toText) {
    const s = String(toText == null ? '' : toText);
    for (let i = 0; i < n; i++) targetChars[i] = i < s.length ? s[i] : ' ';
  }

  /**
   * Settle the matrix scrambled → legible over a bounded window.
   * @param {object} [o]  { toText, durationMs, mutationRate }
   */
  function resolve(o = {}) {
    if (o.toText != null) setTarget(o.toText);
    resolveColors();
    const dur = Math.min(MAX_SETTLE_MS, Math.max(80, o.durationMs || MAX_SETTLE_MS));
    // stagger per-cell deadlines across the window (seeded → deterministic)
    for (let i = 0; i < n; i++) resolveAt[i] = dur * (0.25 + 0.75 * ((scrambleIdx[i] + i) % 97) / 97);
    if (typeof o.mutationRate === 'number') mutationRate = Math.max(0, o.mutationRate);
    if (!active || prefersReducedMotion(opts)) { settleMs = 0; draw(1e9, 0); return; } // final glyphs now
    settleMs = dur;
    driver.stop();
    driver.start();
  }

  /** Opt-in continuous mutation (Hz) for LIVE encoded data. 0 parks it. Never on by default. */
  function setMutationRate(hz) {
    mutationRate = Math.max(0, hz || 0);
    if (mutationRate > 0 && active && !prefersReducedMotion(opts)) { if (!driver.running) driver.start(); }
    else if (mutationRate <= 0 && settleMs <= 0) driver.stop();
  }

  /** Stop any continuous mutation and hold the current resolved glyphs. */
  function pause() {
    mutationRate = 0;
    settleMs = 0;
    driver.stop();
    draw(1e9, 0);
  }

  function update(state) {
    if (!state) return;
    if (state.toText != null) resolve(state);
  }

  function setActive(on) {
    active = !!on;
    if (!active) { driver.stop(); return; }
    resolveColors();
    if (mutationRate > 0 && !prefersReducedMotion(opts)) driver.start();
    else draw(1e9, 0);
  }

  function pauseWhenHidden() {
    if (typeof document === 'undefined' || !document.addEventListener) return () => {};
    const onVis = () => setActive(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => { if (document.removeEventListener) document.removeEventListener('visibilitychange', onVis); };
  }

  function dispose() {
    driver.stop();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  resolveColors();
  return { resolve, setMutationRate, pause, update, setActive, pauseWhenHidden, dispose, canvas, cue: CUE };
}
