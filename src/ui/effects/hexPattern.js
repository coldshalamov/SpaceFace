// hexPattern.js — Hex Sector Lattice. Pattern after Magic UI "hexagon pattern" (reference only).
// SpaceFace meaning: the tessellation of space itself on a strategic surface — territory tiles,
// jurisdiction zones, sensor coverage, claim regions. A hex's fill = who owns / what is known.
//
// Static SVG once drawn; ONLY recolours animate, and only on an ownership/knowledge change, via a
// ≤250 ms CSS `fill` transition (killed under reduced motion). No rAF — nothing moves at rest.
import { ensureFxCss, svgEl, tokenForKind } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'hexPattern',
  screens: ['galaxyMap', 'factions', 'automation'],
  triggers: ['faction:sectorFlipped', 'map:open', 'claim:landed', 'discovery:revealed'],
  maxMs: 250,
  loop: false,
});

const CSS_ID = 'sf-fx-hex-css';
const CSS = `
.sf-fx-hex { display:block; }
.sf-fx-hex__cell {
  stroke: color-mix(in srgb, var(--ink-mute) 55%, transparent);
  stroke-width: 1;
  transition: fill 240ms var(--ease, ease-out);
}
@media (prefers-reduced-motion: reduce) { .sf-fx-hex__cell { transition: none; } }
html.sf-reduce-motion .sf-fx-hex__cell { transition: none; }
`;

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { cols, rows, size, width, height }
 */
export function createHexPattern(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  const size = Math.max(6, opts.size || 20);          // hex circumradius
  const cols = Math.max(1, opts.cols || 8);
  const rows = Math.max(1, opts.rows || 6);
  const w = size * 1.5;                                // horizontal step (pointy-top offset layout)
  const h = Math.sqrt(3) * size;
  const W = Math.max(1, opts.width || Math.ceil(w * cols + size));
  const H = Math.max(1, opts.height || Math.ceil(h * rows + h));

  const svg = svgEl('svg', { class: 'sf-fx-hex', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  mountEl.appendChild(svg);

  // key "c,r" → { el, cell } so update() can recolour a specific hex.
  const cells = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = size + c * w;
      const cy = h * 0.5 + r * h + (c % 2 ? h * 0.5 : 0);
      const poly = svgEl('polygon', { class: 'sf-fx-hex__cell', points: hexPoints(cx, cy, size), fill: 'transparent' });
      svg.appendChild(poly);
      cells.set(c + ',' + r, poly);
    }
  }

  function hexPoints(cx, cy, s) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i);
      pts.push((cx + s * Math.cos(ang)).toFixed(1) + ',' + (cy + s * Math.sin(ang)).toFixed(1));
    }
    return pts.join(' ');
  }

  // Colour a single hex. intensity [0..1] tints the token toward transparent (unknown → dim).
  // Set via the CSS `fill` PROPERTY (not the presentation attribute) so var()/color-mix resolve and
  // the ≤240 ms `fill` transition fires.
  function paint(c, r, kind, intensity) {
    const el = cells.get(c + ',' + r);
    if (!el) return;
    if (kind == null) { el.style.setProperty('fill', 'transparent'); return; }
    const token = tokenForKind(kind);
    const pct = Math.round(Math.max(0, Math.min(1, intensity == null ? 1 : intensity)) * 60);
    el.style.setProperty('fill', `color-mix(in srgb, var(${token}) ${pct}%, transparent)`);
  }

  /**
   * Recolour cells. cellData: array of { col, row, kind, intensity } — only listed cells change.
   */
  function setCells(cellData) {
    if (!Array.isArray(cellData)) return;
    for (const d of cellData) paint(d.col | 0, d.row | 0, d.kind, d.intensity);
  }

  function update(state) {
    if (state && Array.isArray(state.cells)) setCells(state.cells);
  }

  // Static effect: no rAF to gate. setActive is kept for contract uniformity (and to let a caller
  // clear all fills when a board is hidden without tearing the SVG down).
  function setActive(on) {
    if (!on) { for (const el of cells.values()) el.style.setProperty('fill', 'transparent'); }
  }

  function dispose() {
    cells.clear();
    if (svg.parentNode) svg.parentNode.removeChild(svg);
  }

  return { setCells, update, setActive, dispose, svg, cue: CUE };
}
