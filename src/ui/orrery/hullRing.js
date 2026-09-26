// ORRERY Hull Ring (design/frontend/ORRERY.md §6 New Game, §4 Arc Gauge).
//
// The chosen hull's numbers read AT the hull: three arcs of one ring round its render -- mass on the
// left, thrust over the top, line on the right -- each filled against the largest of the starters,
// with the other starters as ghost ticks and a thin numeral at the arc's head. The same grammar as
// the flight Cluster: one instrument round one object, not three badges in a column.
//
// It draws into `host` (a layer covering the stage) and measures `anchor` (the hull's render box) on
// paint and on resize only. Bone light: nothing here is a gain or in motion, so there is no ice.
import { svg } from './svg.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-hullring-style';
const BONE = '232 226 212';
const CSS = `
.orr-hullring { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-hullring__track { fill:none; stroke:rgb(${BONE} / .26); stroke-width:1.2; }
.orr-hullring__ticks { fill:none; stroke:rgb(${BONE} / .34); stroke-width:1; }
.orr-hullring__end { fill:none; stroke:rgb(${BONE} / .62); stroke-width:1.2; }
.orr-hullring__fill { fill:none; stroke:rgb(246 241 230); stroke-width:2.2; stroke-linecap:round; }
.orr-hullring__bloom { fill:none; stroke:rgb(255 236 200 / .2); stroke-width:7; stroke-linecap:round; }
.orr-hullring__ghost { fill:none; stroke:rgb(${BONE} / .6); stroke-width:2; stroke-linecap:round; }
.orr-svg text.orr-hullring__num { font-family:var(--dp-face-numeral, var(--dp-face-display, "Archivo")), sans-serif; font-size:26px; font-weight:250;
  font-variation-settings:"wght" 250, "wdth" 100; letter-spacing:-.01em; fill:rgb(246 241 230); paint-order:stroke; stroke:rgb(4 6 9 / .7); stroke-width:4px; stroke-linejoin:round; }
.orr-svg text.orr-hullring__num tspan { font-size:11px; font-weight:500; font-variation-settings:"wght" 500, "wdth" 100; letter-spacing:.08em; fill:rgb(${BONE} / .66); }
.orr-svg text.orr-hullring__label { font-family:var(--dp-face-label, var(--dp-face-display, "Archivo")), sans-serif; font-size:10px;
  font-variation-settings:"wght" 600, "wdth" 112; letter-spacing:.24em; text-transform:uppercase; fill:rgb(${BONE} / .66);
  paint-order:stroke; stroke:rgb(4 6 9 / .7); stroke-width:3px; stroke-linejoin:round; }
@media (forced-colors: active) { .orr-hullring { display:none; } }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

// three arcs of one ring (bearing 0 = up, clockwise): each fills clockwise from its start
const SEGMENTS = [
  { from: 238, to: 302, side: 'left' },
  { from: 328, to: 392, side: 'top' },
  { from: 58, to: 122, side: 'right' },
];

/**
 * @param {object} o
 * @param {HTMLElement} o.host    a layer covering the stage (the ring is drawn in its box)
 * @param {HTMLElement} o.anchor  the hull's render box the ring goes round
 * @returns {{ paint(stats: Array<{name:string, unit:string, reading:string, frac:number, ghosts:number[]}>): void, layout(): void, dispose(): void }}
 */
export function createHullRing({ host, anchor } = {}) {
  const doc = (host && host.ownerDocument) || globalThis.document;
  if (!host || !anchor || !doc || typeof doc.createElementNS !== 'function' || typeof anchor.getBoundingClientRect !== 'function') {
    return { paint() {}, layout() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const layer = svg('svg', { class: 'orr-svg orr-hullring', 'aria-hidden': 'true', style: '--orr-w-band:9px; --orr-band-a:.1' });
  host.appendChild(layer);
  let stats = null;
  const f = (n) => Math.round(n * 10) / 10;

  function draw() {
    if (!stats) return;
    const hb = host.getBoundingClientRect();
    const ab = anchor.getBoundingClientRect();
    if (!hb.width || !ab.width) return;
    layer.setAttribute('viewBox', `0 0 ${f(hb.width)} ${f(hb.height)}`);
    layer.textContent = '';
    const cx = ab.left - hb.left + ab.width / 2;
    const cy = ab.top - hb.top + ab.height / 2;
    const rx = ab.width / 2 + 6;
    const ry = ab.height / 2 + 6;
    const pt = (deg, k = 0) => { const t = (deg * Math.PI) / 180; return [cx + (rx + k) * Math.sin(t), cy - (ry + k) * Math.cos(t)]; };
    const arc = (d0, d1, k = 0) => {
      const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 2));
      const pts = [];
      for (let i = 0; i <= n; i += 1) { const [x, y] = pt(d0 + ((d1 - d0) * i) / n, k); pts.push(`${f(x)} ${f(y)}`); }
      return `M ${pts.join(' L ')}`;
    };
    const radial = (deg, k0, k1) => { const [x0, y0] = pt(deg, k0); const [x1, y1] = pt(deg, k1); return `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`; };
    stats.slice(0, SEGMENTS.length).forEach((s, i) => {
      const seg = SEGMENTS[i];
      const span = seg.to - seg.from;
      const frac = Math.max(0, Math.min(1, Number(s.frac) || 0));
      const ticks = [];
      for (let d = seg.from + 4; d < seg.to - 1; d += 4) ticks.push(radial(d, 6, (d - seg.from) % 16 === 0 ? 12 : 9));
      // the track is a luminous band with an edge (weight, not wire); its scale ticks stand outside it
      layer.appendChild(svg('path', { d: arc(seg.from, seg.to), class: 'orr-band' }));
      layer.appendChild(svg('path', { d: arc(seg.from, seg.to), class: 'orr-edge' }));
      layer.appendChild(svg('path', { d: ticks.join(' '), class: 'orr-tick' }));
      layer.appendChild(svg('path', { d: `${radial(seg.from, -7, 12)} ${radial(seg.to, -7, 12)}`, class: 'orr-tick orr-tick--major' }));
      if (frac > 0) {
        // the value: a lit core over its bloom, a bead where it ends
        const d = arc(seg.from, seg.from + span * frac);
        layer.appendChild(svg('path', { d, class: 'orr-lit-bloom' }));
        layer.appendChild(svg('path', { d, class: 'orr-lit' }));
        const [bx, by] = pt(seg.from + span * frac);
        layer.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 9, class: 'orr-bead-bloom' }));
        layer.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 4.5, class: 'orr-bead' }));
      }
      const ghost = (s.ghosts || []).map((g) => radial(seg.from + span * Math.max(0, Math.min(1, g)), -8, 4)).join(' ');
      if (ghost) layer.appendChild(svg('path', { d: ghost, class: 'orr-hullring__ghost' }));
      // the reading at the arc's middle, outside the ring
      const mid = (seg.from + seg.to) / 2;
      const num = svg('text', { class: 'orr-hullring__num' });
      num.textContent = String(s.reading);
      if (s.unit) { const u = svg('tspan', { dx: '3' }); u.textContent = s.unit; num.appendChild(u); }
      const label = svg('text', { class: 'orr-hullring__label' });
      label.textContent = String(s.name).toUpperCase();
      if (seg.side === 'top') {
        const [x, y] = pt(mid % 360, 18);
        Object.entries({ x: f(x), y: f(y), 'text-anchor': 'middle' }).forEach(([k, v]) => num.setAttribute(k, v));
        Object.entries({ x: f(x), y: f(y - 30), 'text-anchor': 'middle' }).forEach(([k, v]) => label.setAttribute(k, v));
      } else {
        const [x, y] = pt(mid, 20);
        const anchorSide = seg.side === 'left' ? 'end' : 'start';
        Object.entries({ x: f(x), y: f(y + 6), 'text-anchor': anchorSide }).forEach(([k, v]) => num.setAttribute(k, v));
        Object.entries({ x: f(x), y: f(y + 24), 'text-anchor': anchorSide }).forEach(([k, v]) => label.setAttribute(k, v));
      }
      layer.append(num, label);
    });
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => draw());
    ro.observe(host);
    ro.observe(anchor);
  }
  return {
    paint(next) { stats = Array.isArray(next) ? next : null; draw(); },
    layout: draw,
    dispose() { if (ro) ro.disconnect(); layer.remove(); },
  };
}
