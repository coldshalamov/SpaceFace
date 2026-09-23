// src/ui/orrery/slotJig.js — where a purchase goes (design/frontend/ORRERY.md §6, the Crucible armory).
//
// The run's ship as its bone line drawing (the same plan drawing the refit jig uses), every hardpoint
// a small node on its real socket, and the one the reading is about lit: the amber node, a ring of
// light round it, and a leader out to its words ("Hardpoint 3 · empty", "replaces Bank Shot"). It is
// the refit's instrument at reading size, so the armory and the refit point at the same places.
//
// No layout or no SVG (node tests): it stands down and the reading carries the words alone.

import { svg, polar, arcD, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { hullPosterUrl } from '../hullPosters.js';
import { loadHullPosterManifest, markForSlot, SLOT_MARKS } from '../ship/hullPoster.js';

const STYLE_ID = 'orr-slot-jig-style';

const CSS = `
.orr-slotjig { position:relative; pointer-events:none; }
.orr-slotjig__art { position:absolute; object-fit:contain; opacity:.95; }
.orr-slotjig__svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.orr-slotjig .orr-slotjig__node { fill:rgb(4 6 9 / .88); stroke:rgb(236 230 216 / .6); stroke-width:1.2; }
.orr-slotjig .orr-slotjig__node.is-open { stroke-dasharray:2.4 1.8; }
.orr-slotjig .orr-slotjig__lit { fill:rgb(4 6 9 / .9); stroke:var(--dp-hand-hot, #ffd98c); stroke-width:2; }
.orr-slotjig .orr-slotjig__halo { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:1; opacity:.55;
  transform-box:fill-box; transform-origin:center; animation:orr-slotjig-halo 1.8s ease-out infinite; }
@keyframes orr-slotjig-halo { from { transform:scale(.6); opacity:.7; } to { transform:scale(1.9); opacity:0; } }
html.sf-reduce-motion .orr-slotjig .orr-slotjig__halo { animation:none; }
.orr-slotjig .orr-slotjig__word { font-size:10.5px; font-weight:650; letter-spacing:.18em; fill:var(--dp-hand-hot, #ffd98c);
  paint-order:stroke; stroke:rgb(4 6 9 / .9); stroke-width:4px; stroke-linejoin:round; }
.orr-slotjig .orr-slotjig__sub { font-size:10.5px; font-weight:600; letter-spacing:.04em; fill:rgb(236 230 216 / .82);
  paint-order:stroke; stroke:rgb(4 6 9 / .9); stroke-width:4px; stroke-linejoin:round; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const INERT = Object.freeze({ show() {}, dispose() {} });

/** @param {{host: HTMLElement}} o a square-ish box the drawing fills */
export function createSlotJig({ host } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-slotjig');
  const art = doc.createElement('img');
  art.className = 'orr-slotjig__art';
  art.alt = '';
  art.decoding = 'async';
  const layer = svg('svg', { class: 'orr-svg orr-slotjig__svg' });
  for (const n of [art, layer]) n.setAttribute('aria-hidden', 'true');
  host.append(art, layer);

  let manifest = null;
  let spec = null;
  let frame = 0;
  loadHullPosterManifest().then((m) => { manifest = m; schedule(); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
  if (ro) ro.observe(host);

  function schedule() {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') { draw(); return; }
    frame = raf(() => { frame = 0; draw(); });
  }

  function draw() {
    layer.textContent = '';
    if (!spec) return;
    const url = hullPosterUrl(spec.hullId, 'jig');
    const info = manifest && manifest.hulls && manifest.hulls[spec.hullId] && manifest.hulls[spec.hullId].top;
    host.hidden = !url;
    if (!url) return;
    if (art.getAttribute('src') !== url) art.src = url;
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!info || !info.marks || W < 80 || H < 80) return;
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // object-fit: contain on a square frame
    const side = Math.min(W, H);
    const ox = (W - side) / 2; const oy = (H - side) / 2;
    const slots = spec.slots || [];
    const totals = {};
    const ordinals = slots.map((t) => { totals[t] = (totals[t] || 0) + 1; return totals[t] - 1; });
    const uvs = slots.map((t, i) => markForSlot(info.marks, t, ordinals[i], totals[t]) || [0.5, 0.5]);
    // shared sockets spread as the refit spreads them
    for (const type of Object.keys(totals)) {
      if (totals[type] < 2 || (SLOT_MARKS[type] || []).length > 1) continue;
      const members = slots.map((t, i) => i).filter((i) => slots[i] === type);
      const base = members.reduce((s, i) => s + uvs[i][0], 0) / members.length;
      members.forEach((i, k) => { uvs[i] = [base + (k - (members.length - 1) / 2) * 0.062, uvs[i][1]]; });
    }
    // the dial: the refit's ring round the ship, its ticks, and room outside it for the words
    const cxd = W / 2; const cyd = H / 2;
    const R = side / 2 - 34;
    const inner = R * 2 - 16;
    const frame = inner / 0.86;
    const fx = cxd - frame / 2; const fy = cyd - frame / 2;
    art.style.left = `${fx}px`; art.style.top = `${fy}px`; art.style.width = `${frame}px`; art.style.height = `${frame}px`;
    art.style.inset = 'auto';
    layer.appendChild(svg('path', { d: arcD(cxd, cyd, R, 0, 360), class: 'orr-core orr-rest', 'stroke-width': 1 }));
    layer.appendChild(svg('path', { d: ticksD(cxd, cyd, R, 72, { len: 3, major: 6, majorLen: 8 }), class: 'orr-core orr-faint', 'stroke-width': 1 }));
    const pts = uvs.map(([u, v]) => ({ x: fx + u * frame, y: fy + v * frame }));
    pts.forEach((p, i) => {
      if (i === spec.target) return;
      layer.appendChild(svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 4.2,
        class: `orr-slotjig__node${spec.filled && spec.filled[i] ? '' : ' is-open'}` }));
    });
    const t = pts[spec.target];
    if (!t) return;
    layer.appendChild(svg('circle', { cx: t.x.toFixed(1), cy: t.y.toFixed(1), r: 9, class: 'orr-slotjig__halo' }));
    layer.appendChild(svg('circle', { cx: t.x.toFixed(1), cy: t.y.toFixed(1), r: 6.5, class: 'orr-slotjig__lit' }));
    layer.appendChild(svg('circle', { cx: t.x.toFixed(1), cy: t.y.toFixed(1), r: 2.4, fill: 'var(--dp-hand-hot, #ffd98c)' }));
    // the leader, by the refit's rule: from the node out to the rim along the node's own bearing,
    // then flat, the words outside the ring and clear of the ship
    const ang = Math.atan2(t.y - cyd, t.x - cxd);
    const bearingDeg = (ang * 180) / Math.PI + 90;
    const right = t.x >= cxd;
    const [rx, ry] = polar(cxd, cyd, R, bearingDeg);
    const ey = Math.max(22, Math.min(H - 30, ry));
    const ex = right ? Math.min(W - 2, rx + 26) : Math.max(2, rx - 26);
    layer.appendChild(svg('path', { d: `M ${t.x.toFixed(1)} ${t.y.toFixed(1)} L ${rx.toFixed(1)} ${ry.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`,
      class: 'orr-core orr-hand', 'stroke-width': 1.2, fill: 'none' }));
    const [gx0, gy0] = polar(cxd, cyd, R, bearingDeg - 8);
    void gx0; void gy0;
    layer.appendChild(svg('path', { d: arcD(cxd, cyd, R, bearingDeg - 8, bearingDeg + 8), class: 'orr-core orr-hand', 'stroke-width': 1.6 }));
    const word = svg('text', { x: ex.toFixed(1), y: (ey - 6).toFixed(1), 'text-anchor': right ? 'start' : 'end', class: 'orr-slotjig__word' });
    word.textContent = String(spec.label || '').toUpperCase();
    layer.appendChild(word);
    if (spec.sub) {
      const sub = svg('text', { x: ex.toFixed(1), y: (ey + 15).toFixed(1), 'text-anchor': right ? 'start' : 'end', class: 'orr-slotjig__sub' });
      sub.textContent = spec.sub;
      layer.appendChild(sub);
    }
  }

  return {
    /**
     * @param {{hullId:string, slots:string[], filled?:boolean[], target:number, label:string, sub?:string}} next
     */
    show(next) { spec = next || null; schedule(); },
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      for (const n of [art, layer]) if (n.parentNode) n.parentNode.removeChild(n);
    },
  };
}
