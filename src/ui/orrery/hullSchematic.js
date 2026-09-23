// src/ui/orrery/hullSchematic.js — a hull on the jig (design/frontend/ORRERY.md §6, the Crucible refit).
//
// The ship's produced plan render (nose up) stands at the middle of a dial. Every hardpoint is a
// node of light on its real socket (the render's projected hook empties), its label sits round the
// ship at the end of a leader, and the Hand rides the dial's rim to where the lit hardpoint's leader
// leaves the ship. A screen hands in its own row elements and keeps their words and controls; the
// schematic only places them, draws the light, and says which one is lit.
//
// The geometry is the shipworks callout law (src/ui/ship/calloutLayout.js): labels stack in two
// columns outside the dial and no two leaders cross. Where a hull has no plan render, or there is
// no layout at all (node tests), it stands down and the rows keep their own flow.

import { svg, polar, arcD, ticksD, circularText } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';
import { hullPosterUrl } from '../hullPosters.js';
import { loadHullPosterManifest, markForSlot, measurePosterInk } from '../ship/hullPoster.js';
import { fitHullInk, layoutHullCallouts, separateBeads } from '../ship/calloutLayout.js';

const STYLE_ID = 'orr-hull-schematic-style';

const CSS = `
.orr-hull__pool { position:absolute; pointer-events:none; border-radius:50%;
  background:radial-gradient(closest-side, rgb(4 6 9 / .74), rgb(4 6 9 / .5) 58%, rgb(4 6 9 / 0)); }
.orr-hull__art { position:absolute; pointer-events:none; user-select:none; opacity:0;
  filter:drop-shadow(0 22px 28px rgb(0 0 0 / .62)) saturate(.92);
  transition:opacity .6s var(--dp-ease-out, ease-out); }
.orr-hull__art.is-ready { opacity:1; }
/* a scan of cold light passes down the hull, masked to its own silhouette: the jig reading it */
.orr-hull__scan { position:absolute; pointer-events:none; overflow:hidden;
  -webkit-mask-size:100% 100%; mask-size:100% 100%; -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; }
.orr-hull__scan::before { content:""; position:absolute; left:0; right:0; top:-30%; height:30%;
  background:linear-gradient(rgb(143 203 255 / 0), rgb(143 203 255 / .16) 70%, rgb(223 238 255 / .42) 97%, rgb(143 203 255 / 0));
  animation:orr-hull-scan 7.5s cubic-bezier(.45, 0, .25, 1) 1.2s infinite; }
@keyframes orr-hull-scan { 0% { transform:translateY(0); } 55%, 100% { transform:translateY(440%); } }
html.sf-reduce-motion .orr-hull__scan::before { animation:none; opacity:0; }
.orr-hull__svg { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.orr-hull__label { position:absolute !important; margin:0 !important; box-sizing:border-box; }
.orr-svg .orr-hull__leader { transition:stroke .18s linear, opacity .18s linear; }
.orr-svg .orr-hull__leader.is-lit { stroke:var(--dp-hand, #f2b950); opacity:.95; }
.orr-svg .orr-hull__leader-bloom { opacity:0; transition:opacity .18s linear; }
.orr-svg .orr-hull__leader-bloom.is-lit { opacity:.2; }
.orr-hull__node { transform-box:fill-box; transform-origin:center; transition:transform .28s var(--dp-ease-over, ease-out); }
.orr-hull__node .orr-hull__well { fill:rgb(4 6 9 / .78); }
.orr-hull__node .orr-hull__ring { fill:none; stroke:rgb(236 230 216 / .82); stroke-width:1.3; transition:stroke .18s linear; }
.orr-hull__node .orr-hull__core { fill:rgb(246 241 230); transition:fill .18s linear; }
.orr-hull__node .orr-hull__glow { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:7; opacity:0; transition:opacity .18s linear; }
.orr-hull__node.is-open .orr-hull__core { fill:none; }
.orr-hull__node.is-open .orr-hull__ring { stroke-dasharray:3 2.2; }
.orr-hull__node.is-bare .orr-hull__ring { stroke:rgb(236 230 216 / .34); stroke-dasharray:1.5 2.5; }
.orr-hull__node.is-bare .orr-hull__core { fill:none; }
.orr-hull__node.is-lit { transform:scale(1.35); }
.orr-hull__node.is-lit .orr-hull__ring { stroke:var(--dp-hand-hot, #ffd98c); stroke-dasharray:none; }
.orr-hull__node.is-lit .orr-hull__core { fill:var(--dp-hand-hot, #ffd98c); }
.orr-hull__node.is-lit .orr-hull__glow { opacity:.24; }
.orr-hull__rise { opacity:0; animation:orr-hull-rise .5s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-hull-rise { from { opacity:0; } to { opacity:1; } }
html.sf-reduce-motion .orr-hull__rise { animation:none; opacity:1; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Bearing in dial degrees (0 = up, clockwise) from (cx, cy) to (x, y). */
export function bearing(cx, cy, x, y) {
  return ((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360) % 360;
}

/** Where a leader polyline first crosses the circle (cx, cy, r), or null when it never does. */
export function leaderCrossing(points, cx, cy, r) {
  if (!Array.isArray(points)) return null;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const dx = x1 - x0; const dy = y1 - y0;
    const fx = x0 - cx; const fy = y0 - cy;
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const s = Math.sqrt(disc);
    const ts = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((t) => t >= 0 && t <= 1);
    if (!ts.length) continue;
    const t = Math.min(...ts);
    return [x0 + t * dx, y0 + t * dy];
  }
  return null;
}

/** The nearest equivalent of `target` degrees to `from`, so the Hand never swings the long way. */
export function nearestTurn(from, target) {
  let t = target;
  while (t - from > 180) t -= 360;
  while (t - from < -180) t += 360;
  return t;
}

const INERT = Object.freeze({
  setHull() {}, setNodes() {}, light() {}, lit: () => -1, relayout() {}, active: () => false, dispose() {},
});

/**
 * @param {object} o
 * @param {HTMLElement} o.host the stage the schematic fills (positioned; the labels live inside it)
 * @param {'top'|'hero'|'side'} [o.view] which render (the plan view is the fitting drawing)
 * @param {() => Element[]} [o.avoid] chrome the labels and the ship keep clear of (title, keys)
 * @param {number} [o.labelWidth] label column width in px
 */
export function createHullSchematic({ host, view = 'top', avoid = () => [], labelWidth = 290, gap = 30, edge = 72 } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function'
    || typeof doc.createElement !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);

  const pool = doc.createElement('div');
  pool.className = 'orr-hull__pool';
  const art = doc.createElement('img');
  art.className = 'orr-hull__art';
  art.alt = '';
  art.decoding = 'async';
  art.draggable = false;
  art.hidden = true;
  const scan = doc.createElement('div');
  scan.className = 'orr-hull__scan';
  scan.hidden = true;
  const layer = svg('svg', { class: 'orr-svg orr-hull__svg' });
  for (const n of [pool, art, scan, layer]) n.setAttribute('aria-hidden', 'true');
  host.prepend(pool, art, scan, layer);

  let hullId = null;
  let nodes = [];
  let engraving = '';
  let litIndex = -1;
  let ink = null;
  let manifest = null;
  let on = false;
  let arrived = false;
  let frame = 0;
  let geo = null; // { hx, hy, R, angles: [] }
  let nodeEls = [];
  let leaderEls = [];
  let hand = null; // { blade, bloom, glint, bead }

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') { relayout(); return; }
    frame = raf(() => { frame = 0; relayout(); });
  };

  art.addEventListener('load', () => { ink = measurePosterInk(art); art.classList.add('is-ready'); schedule(); });
  art.addEventListener('error', () => { ink = null; schedule(); });
  loadHullPosterManifest().then((m) => { manifest = m; schedule(); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
  if (ro) ro.observe(host);
  if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(() => schedule());

  const spring = createSpring({ value: 0, preset: { k: 105, c: 13 }, onUpdate: (deg) => paintHand(deg) });

  function entry() {
    const hull = manifest && manifest.hulls && manifest.hulls[hullId];
    return hull && hull[view] && hull[view].marks ? hull[view] : null;
  }

  function paintHand(deg) {
    if (!hand || !geo) return;
    const { hx, hy, R } = geo;
    // a tapered index outside the rim pointing in: its tip ON the ring where the lit leader crosses
    const half = (Math.atan(8 / (R + 22)) * 180) / Math.PI;
    const [tx, ty] = polar(hx, hy, R + 2, deg);
    const [bx0, by0] = polar(hx, hy, R + 22, deg - half);
    const [bx1, by1] = polar(hx, hy, R + 22, deg + half);
    const [kx, ky] = polar(hx, hy, R + 18, deg);
    // a blade with a notched heel, pointing in at the ring
    const d = `M ${bx0.toFixed(1)} ${by0.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${bx1.toFixed(1)} ${by1.toFixed(1)} L ${kx.toFixed(1)} ${ky.toFixed(1)} Z`;
    hand.blade.setAttribute('d', d);
    // its glow lies along the blade only (a longer one read as a smudge beyond the heel)
    const [ox, oy] = polar(hx, hy, R + 16, deg);
    const [ix, iy] = polar(hx, hy, R + 5, deg);
    hand.bloom.setAttribute('d', `M ${ox.toFixed(1)} ${oy.toFixed(1)} L ${ix.toFixed(1)} ${iy.toFixed(1)}`);
    const g = arcD(hx, hy, R, deg - 10, deg + 10);
    hand.glint.setAttribute('d', g);
    hand.glintBloom.setAttribute('d', g);
    const [cx, cy] = polar(hx, hy, R, deg);
    hand.bead.setAttribute('cx', cx.toFixed(1));
    hand.bead.setAttribute('cy', cy.toFixed(1));
  }

  function applyLit(instant = false) {
    nodeEls.forEach((n, i) => { if (n) n.classList.toggle('is-lit', i === litIndex); });
    leaderEls.forEach((pair, i) => { if (pair) for (const p of pair) p.classList.toggle('is-lit', i === litIndex); });
    nodes.forEach((n, i) => { if (n && n.el && n.el.classList) n.el.classList.toggle('is-lit', i === litIndex); });
    if (!geo || !hand) return;
    const target = geo.angles[litIndex];
    const visible = on && Number.isFinite(target);
    // visibility, not opacity: the arrival animation owns opacity and would hold it at 1
    hand.g.setAttribute('visibility', visible ? 'visible' : 'hidden');
    if (!visible) return;
    const next = nearestTurn(spring.value, target);
    spring.set(next, { instant: instant || !arrived });
  }

  function standDown() {
    on = false;
    host.classList.remove('orr-hull--on');
    art.hidden = true;
    scan.hidden = true;
    pool.style.display = 'none';
    layer.textContent = '';
    nodeEls = []; leaderEls = []; hand = null; geo = null;
    for (const n of nodes) {
      if (!n || !n.el || !n.el.style) continue;
      n.el.classList.remove('orr-hull__label', 'is-left', 'is-right');
      for (const p of ['left', 'top', 'width']) n.el.style.removeProperty(p);
    }
  }

  function relayout() {
    const url = hullPosterUrl(hullId, view);
    const info = entry();
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!url || !info || W < 480 || H < 320 || !nodes.length) { standDown(); return; }
    on = true;
    host.classList.add('orr-hull--on');
    if (art.getAttribute('src') !== url) { art.classList.remove('is-ready'); ink = null; art.src = url; }
    if (art.complete && art.naturalWidth && !ink) { ink = measurePosterInk(art); art.classList.add('is-ready'); }
    art.hidden = false;
    pool.style.display = '';

    const hb = host.getBoundingClientRect();
    const local = (r, pad) => ({ left: r.left - hb.left - pad, top: r.top - hb.top - pad, right: r.right - hb.left + pad, bottom: r.bottom - hb.top + pad });
    const obstacles = [];
    for (const el of avoid() || []) {
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push(local(r, 12));
    }
    // the ship's band: chrome that crosses the middle third pushes the band off it
    const region = { left: edge, right: W - edge, top: 28, bottom: H - 28 };
    const midL = W * 0.34; const midR = W * 0.66;
    for (const ob of obstacles) {
      if (ob.right <= midL || ob.left >= midR) continue;
      if ((ob.top + ob.bottom) / 2 < H / 2) region.top = Math.max(region.top, ob.bottom);
      else region.bottom = Math.min(region.bottom, ob.top);
    }

    // label sizes at the column width
    for (const n of nodes) {
      n.el.classList.add('orr-hull__label');
      n.el.style.width = `${labelWidth}px`;
    }
    const heights = nodes.map((n) => Math.max(24, n.el.offsetHeight || 64));

    // the dial's radius: as large as the band allows with a label column clear of it on each side
    // (the band also holds the drifting orbit above and the engraving below: 52 px of it each side)
    const maxR = Math.min(W / 2 - edge - gap - labelWidth, (region.bottom - region.top) / 2 - 52);
    const R0 = Math.max(90, maxR);
    const aspect = info.width && info.height ? info.width / info.height : 1;
    const inkBox = ink || null;
    const bandW = region.right - region.left;
    const fit = fitHullInk({
      region, ink: inkBox, imageAspect: aspect,
      reserveX: Math.max(0, (bandW - 2 * (R0 - 14)) / 2), reserveY: 10, maxInkH: 2 * (R0 - 12),
    });
    const { imgRect, inkRect } = fit;
    const hx = (inkRect.left + inkRect.right) / 2;
    const hy = (inkRect.top + inkRect.bottom) / 2;
    const R = Math.min(R0, Math.max(inkRect.right - inkRect.left, inkRect.bottom - inkRect.top) / 2 + 14);
    Object.assign(art.style, { left: `${Math.round(imgRect.left)}px`, top: `${Math.round(imgRect.top)}px`, width: `${Math.round(imgRect.width)}px`, height: `${Math.round(imgRect.height)}px` });
    Object.assign(scan.style, { left: art.style.left, top: art.style.top, width: art.style.width, height: art.style.height });
    scan.style.webkitMaskImage = `url("${url}")`;
    scan.style.maskImage = `url("${url}")`;
    scan.hidden = false;
    const reach = R + gap + labelWidth + 60;
    Object.assign(pool.style, { left: `${Math.round(hx - reach)}px`, top: `${Math.round(hy - R - 120)}px`, width: `${Math.round(reach * 2)}px`, height: `${Math.round(2 * R + 240)}px` });

    // the beads on the render's own sockets; several of one type spread along their mark
    const totals = {};
    const ordinals = nodes.map((n) => { totals[n.slotType] = (totals[n.slotType] || 0) + 1; return totals[n.slotType] - 1; });
    let points = nodes.map((n, i) => {
      const uv = markForSlot(info.marks, n.slotType, ordinals[i], totals[n.slotType]);
      return uv ? { x: imgRect.left + uv[0] * imgRect.width, y: imgRect.top + uv[1] * imgRect.height } : { x: hx, y: hy };
    });
    points = separateBeads(points, 20);

    const keepOut = { left: hx - R - 6, right: hx + R + 6, top: hy - R, bottom: hy + R };
    const placed = layoutHullCallouts({
      dots: points.map((p, i) => ({ x: p.x, y: p.y, w: labelWidth, h: heights[i] })),
      bounds: { left: edge, right: W - edge, top: 24, bottom: H - 24 },
      keepOut, obstacles, gap, pitch: 14, beadRadius: 8,
    });

    // the labels, in their own offset frame
    placed.forEach((card, i) => {
      const el = nodes[i].el;
      const op = el.offsetParent;
      const ob = op && typeof op.getBoundingClientRect === 'function' ? op.getBoundingClientRect() : hb;
      el.style.left = `${Math.round(card.left + hb.left - ob.left)}px`;
      el.style.top = `${Math.round(card.top + hb.top - ob.top)}px`;
      el.classList.toggle('is-left', card.side === 'left');
      el.classList.toggle('is-right', card.side !== 'left');
    });

    // the light
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    const rise = (node, delay) => {
      if (arrived) return node;
      node.classList.add('orr-hull__rise');
      node.style.setProperty('--orr-delay', `${delay}ms`);
      return node;
    };
    const dial = svg('g', { class: 'orr-hull__dial' });
    dial.append(
      svg('path', { d: arcD(hx, hy, R, 0, 360), class: 'orr-core orr-rest', 'stroke-width': 1 }),
      svg('path', { d: ticksD(hx, hy, R, 144, { len: 3, major: 12, majorLen: 9 }), class: 'orr-core orr-faint', 'stroke-width': 1 }),
      svg('path', { d: arcD(hx, hy, R - 16, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-dasharray': '1 5' }),
    );
    // an outer orbit of sparse ticks, drifting
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${hx.toFixed(1)}px ${hy.toFixed(1)}px; --orr-drift-s:720s` });
    drift.appendChild(svg('path', { d: ticksD(hx, hy, R + 30, 48, { len: 4, inward: false }), class: 'orr-core orr-faint', 'stroke-width': 1 }));
    dial.appendChild(drift);
    if (engraving) dial.appendChild(circularText(hx, hy, R + 44, engraving.toUpperCase(), { startDeg: 270, size: 10, className: 'orr-micro', anchor: 'middle', upright: true }));
    layer.appendChild(rise(dial, 0));

    geo = { hx, hy, R, angles: [] };
    leaderEls = [];
    nodeEls = [];
    placed.forEach((card, i) => {
      const p = points[i];
      const pts = card.leader && card.leader.length ? card.leader : null;
      if (pts) {
        const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        // a short end-stop where the leader meets its label
        const [ex, ey] = pts[pts.length - 1];
        const stop = `M ${ex.toFixed(1)} ${(ey - 5).toFixed(1)} L ${ex.toFixed(1)} ${(ey + 5).toFixed(1)}`;
        // an opacity attribute keeps the library's blanket bloom rule off it (every leader read amber)
        const bloom = svg('path', { d, class: 'orr-bloom orr-hand orr-hull__leader-bloom', 'stroke-width': 5, opacity: '0' });
        const line = svg('path', { d: `${d} ${stop}`, class: 'orr-core orr-hi orr-hull__leader', 'stroke-width': 1, opacity: '.7' });
        layer.appendChild(rise(bloom, 120 + i * 40));
        layer.appendChild(rise(line, 120 + i * 40));
        leaderEls[i] = [bloom, line];
        const cross = leaderCrossing(pts, hx, hy, R);
        geo.angles[i] = cross ? bearing(hx, hy, cross[0], cross[1]) : bearing(hx, hy, p.x, p.y);
      } else {
        leaderEls[i] = null;
        geo.angles[i] = bearing(hx, hy, p.x, p.y);
      }
      // the tick on the rim where this hardpoint's line leaves the ship
      const [t0x, t0y] = polar(hx, hy, R, geo.angles[i]);
      const [t1x, t1y] = polar(hx, hy, R + 7, geo.angles[i]);
      layer.appendChild(rise(svg('path', { d: `M ${t0x.toFixed(1)} ${t0y.toFixed(1)} L ${t1x.toFixed(1)} ${t1y.toFixed(1)}`, class: 'orr-core orr-hi', 'stroke-width': 1.2 }), 120 + i * 40));
    });
    // nodes over the leaders
    points.forEach((p, i) => {
      const kind = nodes[i].state === 'fitted' ? 'is-fitted' : nodes[i].state === 'open' ? 'is-open' : 'is-bare';
      const g = svg('g', { class: `orr-hull__node ${kind}` });
      g.append(
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 10, class: 'orr-hull__glow' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 7, class: 'orr-hull__well' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 6, class: 'orr-hull__ring' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 2.4, class: 'orr-hull__core' }),
      );
      layer.appendChild(rise(g, 200 + i * 40));
      nodeEls[i] = g;
    });
    // the Hand: bloom, the index, a glint of rim, one bead on the ring
    const hg = svg('g', { class: 'orr-hull__hand' });
    hand = {
      g: hg,
      glintBloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 6, opacity: '.22' }),
      glint: svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.6 }),
      bloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 10, opacity: '.28' }),
      blade: svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' }),
      bead: svg('circle', { r: 3, fill: 'var(--dp-hand-hot, #ffd98c)' }),
    };
    hg.append(hand.glintBloom, hand.glint, hand.bloom, hand.blade, hand.bead);
    layer.appendChild(rise(hg, 360));
    const settled = arrived;
    arrived = true;
    if (litIndex < 0 || litIndex >= nodes.length) litIndex = 0;
    applyLit(!settled);
    paintHand(spring.value);
  }

  return {
    /** Which hull stands on the jig. */
    setHull(next) {
      if (next === hullId) return;
      hullId = next || null;
      arrived = false;
      schedule();
    },
    /**
     * The hardpoints, in slot order: `el` is the screen's own label element, `state` is
     * 'fitted' | 'open' (empty, a spare fits) | 'bare' (empty, nothing fits).
     */
    setNodes(next, { engraving: text = '' } = {}) {
      nodes = Array.isArray(next) ? next.filter((n) => n && n.el) : [];
      engraving = text || '';
      schedule();
    },
    /** Light one hardpoint: its node, its leader, its label, and the Hand swings to it. */
    light(index) {
      if (!Number.isInteger(index) || index === litIndex) return;
      litIndex = index;
      applyLit(false);
    },
    lit: () => litIndex,
    relayout: schedule,
    active: () => on,
    dispose() {
      if (ro) ro.disconnect();
      spring.stop();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      standDown();
      for (const n of [pool, art, scan, layer]) if (n.parentNode) n.parentNode.removeChild(n);
    },
  };
}
