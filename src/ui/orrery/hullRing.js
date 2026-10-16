// ORRERY Hull Ring (design/frontend/ORRERY.md §6 New Game, §4 Arc Gauge).
//
// The chosen hull's numbers read AT the hull: three arcs of one ring round its render -- mass on the
// left, thrust over the top, line on the right -- each filled against the largest of the starters,
// with the other starters as ghost ticks and a thin numeral at the arc's head. The same grammar as
// the flight Cluster: one instrument round one object, not three badges in a column.
//
// It draws into `host` (a layer covering the stage) and measures `anchor` (the hull's render box) once,
// then again only on resize and on layout(): a paint (one per frame of a spin) reads no layout and makes no
// nodes. Bone light: nothing here is a gain or in motion, so there is no ice.
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
.orr-svg text.orr-hullring__num tspan { font-size: 12px; font-weight:500; font-variation-settings:"wght" 500, "wdth" 100; letter-spacing:.08em; fill:rgb(${BONE} / .66); }
.orr-svg text.orr-hullring__label { font-family:var(--dp-face-label, var(--dp-face-display, "Archivo")), sans-serif; font-size: 12px;
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
  if (!host || !anchor || !doc || typeof doc.createElementNS !== 'function' || typeof doc.createTextNode !== 'function' || typeof anchor.getBoundingClientRect !== 'function') {
    return { paint() {}, layout() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const layer = svg('svg', { class: 'orr-svg orr-hullring', 'aria-hidden': 'true', style: '--orr-w-band:9px; --orr-band-a:.1' });
  host.appendChild(layer);
  let stats = null;
  let disposed = false;
  const f = (n) => Math.round(n * 10) / 10;

  // A spin repaints this every frame, so a paint must neither read the page's layout nor make nodes:
  // the two boxes are measured once (and again only when the observer or layout() says they moved) and
  // the elements are made once, then only have their values rewritten.
  let box = null; // { w, h, cx, cy, rx, ry } in the layer's own coordinates, null until a measurable box exists
  const segs = [];

  function measure() {
    const hb = host.getBoundingClientRect();
    const ab = anchor.getBoundingClientRect();
    if (!hb.width || !ab.width) { box = null; return; }
    box = { w: hb.width, h: hb.height, cx: ab.left - hb.left + ab.width / 2, cy: ab.top - hb.top + ab.height / 2, rx: ab.width / 2 + 6, ry: ab.height / 2 + 6 };
  }

  // the setters touch the page only when a value really changed
  const setAttr = (node, name, value) => { const v = String(value); if (node.getAttribute(name) !== v) node.setAttribute(name, v); };
  const setText = (textNode, value) => { const v = String(value); if (textNode.data !== v) textNode.data = v; };
  const shown = (seg, key, on) => {
    if (seg.on[key] === on) return;
    seg.on[key] = on;
    const node = seg[key];
    if (on) node.removeAttribute('display'); else node.setAttribute('display', 'none');
  };

  // one segment's elements, in the paint order the ring always had (the part that is not always on starts hidden)
  function makeSegment() {
    const seg = { on: {}, fracKey: null, ghostKey: null };
    seg.band = svg('path', { d: '', class: 'orr-band' });
    seg.edge = svg('path', { d: '', class: 'orr-edge' });
    seg.ticks = svg('path', { d: '', class: 'orr-tick' });
    seg.major = svg('path', { d: '', class: 'orr-tick orr-tick--major' });
    seg.litBloom = svg('path', { d: '', class: 'orr-lit-bloom', display: 'none' });
    seg.lit = svg('path', { d: '', class: 'orr-lit', display: 'none' });
    seg.beadBloom = svg('circle', { cx: 0, cy: 0, r: 9, class: 'orr-bead-bloom', display: 'none' });
    seg.bead = svg('circle', { cx: 0, cy: 0, r: 4.5, class: 'orr-bead', display: 'none' });
    seg.ghost = svg('path', { d: '', class: 'orr-hullring__ghost', display: 'none' });
    seg.num = svg('text', { class: 'orr-hullring__num' });
    seg.numText = doc.createTextNode('');
    seg.unit = svg('tspan', { dx: '3', display: 'none' });
    seg.unitText = doc.createTextNode('');
    seg.unit.appendChild(seg.unitText);
    seg.num.append(seg.numText, seg.unit);
    seg.label = svg('text', { class: 'orr-hullring__label' });
    seg.labelText = doc.createTextNode('');
    seg.label.appendChild(seg.labelText);
    for (const key of ['litBloom', 'lit', 'beadBloom', 'bead', 'ghost', 'unit']) seg.on[key] = false;
    layer.append(seg.band, seg.edge, seg.ticks, seg.major, seg.litBloom, seg.lit, seg.beadBloom, seg.bead, seg.ghost, seg.num, seg.label);
    return seg;
  }

  function draw() {
    if (disposed || !stats) return;
    if (!box) measure();
    if (!box) return;
    const { cx, cy, rx, ry } = box;
    const pt = (deg, k = 0) => { const t = (deg * Math.PI) / 180; return [cx + (rx + k) * Math.sin(t), cy - (ry + k) * Math.cos(t)]; };
    const arc = (d0, d1, k = 0) => {
      const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 2));
      const pts = [];
      for (let i = 0; i <= n; i += 1) { const [x, y] = pt(d0 + ((d1 - d0) * i) / n, k); pts.push(`${f(x)} ${f(y)}`); }
      return `M ${pts.join(' L ')}`;
    };
    const radial = (deg, k0, k1) => { const [x0, y0] = pt(deg, k0); const [x1, y1] = pt(deg, k1); return `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`; };
    setAttr(layer, 'viewBox', `0 0 ${f(box.w)} ${f(box.h)}`);
    const count = Math.min(stats.length, SEGMENTS.length);
    while (segs.length < count) segs.push(makeSegment());
    // the geometry (track, scale ticks, text places) depends on the box alone: it is rewritten when the box moves
    const key = `${cx} ${cy} ${rx} ${ry}`;
    segs.forEach((seg, i) => {
      if (i >= count) {
        for (const k of ['band', 'edge', 'ticks', 'major', 'litBloom', 'lit', 'beadBloom', 'bead', 'ghost', 'num', 'label']) shown(seg, k, false);
        return;
      }
      const s = stats[i];
      const def = SEGMENTS[i];
      const span = def.to - def.from;
      if (seg.fixed !== key) {
        seg.fixed = key;
        const track = arc(def.from, def.to);
        const ticks = [];
        for (let d = def.from + 4; d < def.to - 1; d += 4) ticks.push(radial(d, 6, (d - def.from) % 16 === 0 ? 12 : 9));
        setAttr(seg.band, 'd', track);
        setAttr(seg.edge, 'd', track);
        setAttr(seg.ticks, 'd', ticks.join(' '));
        setAttr(seg.major, 'd', `${radial(def.from, -7, 12)} ${radial(def.to, -7, 12)}`);
        // the reading at the arc's middle, outside the ring
        const mid = (def.from + def.to) / 2;
        if (def.side === 'top') {
          const [x, y] = pt(mid % 360, 18);
          for (const [node, ny] of [[seg.num, y], [seg.label, y - 30]]) { setAttr(node, 'x', f(x)); setAttr(node, 'y', f(ny)); setAttr(node, 'text-anchor', 'middle'); }
        } else {
          const [x, y] = pt(mid, 20);
          const side = def.side === 'left' ? 'end' : 'start';
          for (const [node, ny] of [[seg.num, y + 6], [seg.label, y + 24]]) { setAttr(node, 'x', f(x)); setAttr(node, 'y', f(ny)); setAttr(node, 'text-anchor', side); }
        }
        seg.fracKey = null;
        seg.ghostKey = null;
      }
      shown(seg, 'band', true); shown(seg, 'edge', true); shown(seg, 'ticks', true); shown(seg, 'major', true);
      shown(seg, 'num', true); shown(seg, 'label', true);
      const frac = Math.max(0, Math.min(1, Number(s.frac) || 0));
      if (frac > 0) {
        // the value: a lit core over its bloom, a bead where it ends
        if (seg.fracKey !== frac) {
          seg.fracKey = frac;
          const d = arc(def.from, def.from + span * frac);
          setAttr(seg.litBloom, 'd', d);
          setAttr(seg.lit, 'd', d);
          const [bx, by] = pt(def.from + span * frac);
          for (const bead of [seg.beadBloom, seg.bead]) { setAttr(bead, 'cx', f(bx)); setAttr(bead, 'cy', f(by)); }
        }
        shown(seg, 'litBloom', true); shown(seg, 'lit', true); shown(seg, 'beadBloom', true); shown(seg, 'bead', true);
      } else {
        seg.fracKey = null;
        shown(seg, 'litBloom', false); shown(seg, 'lit', false); shown(seg, 'beadBloom', false); shown(seg, 'bead', false);
      }
      const ghostKey = (s.ghosts || []).join(',');
      if (ghostKey) {
        if (seg.ghostKey !== ghostKey) {
          seg.ghostKey = ghostKey;
          setAttr(seg.ghost, 'd', s.ghosts.map((g) => radial(def.from + span * Math.max(0, Math.min(1, g)), -8, 4)).join(' '));
        }
        shown(seg, 'ghost', true);
      } else {
        seg.ghostKey = null;
        shown(seg, 'ghost', false);
      }
      setText(seg.numText, s.reading);
      setText(seg.unitText, s.unit || '');
      shown(seg, 'unit', !!s.unit);
      setText(seg.labelText, String(s.name).toUpperCase());
    });
  }

  // the box moved or resized: measure it again, then draw
  function relayout() {
    if (disposed) return;
    measure();
    if (box) draw();
  }

  // layout() is called from the middle of someone else's writes, so it waits for the frame to read
  let frame = 0;
  function layout() {
    if (disposed) return;
    if (typeof requestAnimationFrame !== 'function') { relayout(); return; }
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; relayout(); });
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => relayout());
    ro.observe(host);
    ro.observe(anchor);
  }
  return {
    paint(next) { stats = Array.isArray(next) ? next : null; draw(); },
    layout,
    dispose() {
      disposed = true;
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
      if (ro) ro.disconnect();
      layer.remove();
    },
  };
}
